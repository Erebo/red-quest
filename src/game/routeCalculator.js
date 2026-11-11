/**
 * Route Calculator State, Accuracy Evaluator & Horizontal Map Ruler (MISSION Mode).
 * Pure in-memory planning calculator with zero modification to routing or routeWorker.js.
 */

import * as THREE from 'three';
import {
  PLANNER_ACCURACY_BANDS,
  PLANNING_SCORE_CONFIG,
  ROUTE_CALC_FIELDS,
  WALKING_SPEED_CONFIG,
  fieldValueToSliderPos,
  sliderPosToFieldValue
} from '../config.js';

export function formatCalcMetricValue(field, val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) {
    return 'No estimate';
  }
  const num = Number(val);
  if (field.unit === 'm') return `${Math.round(num)} m`;
  return `${num.toFixed(field.decimals)} ${field.unit}`;
}

export function extractTrueRouteMetrics(candidate) {
  if (!candidate) return { distKm: 0, ascentM: 0, steepPct: 0, timeHours: 0 };
  return {
    distKm: Number(candidate.distKm || 0),
    ascentM: Number(candidate.ascentM || 0),
    steepPct: Number((candidate.pctMod || 0) + (candidate.pctHaz || 0)),
    timeHours: Number(candidate.timeHours || 0)
  };
}

/**
 * Evaluate a single player estimate against a true value.
 * Zero-divide guard applies to ANY metric whose true value is 0.
 */
export function evaluateSingleEstimate(estimate, trueVal) {
  if (estimate === null || estimate === undefined || Number.isNaN(Number(estimate))) {
    return {
      skipped: true,
      estimate: null,
      trueVal,
      errorPct: null,
      band: PLANNER_ACCURACY_BANDS.labels.skipped,
      bandKey: 'skipped',
      points: PLANNING_SCORE_CONFIG.skipped
    };
  }

  const est = Number(estimate);
  const tVal = Number(trueVal);
  const errPct = (tVal === 0)
    ? Math.abs(est - 0)
    : (Math.abs(est - tVal) / Math.abs(tVal)) * 100.0;

  let bandKey = 'off';
  let band = PLANNER_ACCURACY_BANDS.labels.off;
  let points = PLANNING_SCORE_CONFIG.off;

  if (errPct <= PLANNER_ACCURACY_BANDS.sharpMaxErrPct) {
    bandKey = 'sharp';
    band = PLANNER_ACCURACY_BANDS.labels.sharp;
    points = PLANNING_SCORE_CONFIG.sharp;
  } else if (errPct <= PLANNER_ACCURACY_BANDS.closeMaxErrPct) {
    bandKey = 'close';
    band = PLANNER_ACCURACY_BANDS.labels.close;
    points = PLANNING_SCORE_CONFIG.close;
  }

  return {
    skipped: false,
    estimate: est,
    trueVal: tVal,
    errorPct: errPct,
    band,
    bandKey,
    points
  };
}

/**
 * Compute full reveal report strictly from the frozen pre-lock estimates snapshot.
 */
export function evaluateCalculatorReveal(candidates, frozenSnapshot) {
  const routes = [];
  let answeredCount = 0;
  let totalMetrics = 0;
  let sumErrorPct = 0;
  let totalPoints = 0;
  let sharpCount = 0;
  let closeCount = 0;
  let offCount = 0;
  let skippedCount = 0;

  candidates.forEach(cand => {
    const trueMetrics = extractTrueRouteMetrics(cand);
    const estRow = (frozenSnapshot && frozenSnapshot[cand.id]) || {};
    const rows = ROUTE_CALC_FIELDS.map(field => {
      totalMetrics++;
      const res = evaluateSingleEstimate(estRow[field.key], trueMetrics[field.key]);
      totalPoints += res.points;
      if (res.skipped) {
        skippedCount++;
      } else {
        answeredCount++;
        sumErrorPct += res.errorPct;
        if (res.bandKey === 'sharp') sharpCount++;
        else if (res.bandKey === 'close') closeCount++;
        else offCount++;
      }
      return { field, ...res };
    });

    routes.push({
      id: cand.id,
      name: cand.name || cand.blindLabel,
      color: cand.color,
      rows
    });
  });

  const maxPoints = totalMetrics * PLANNING_SCORE_CONFIG.maxPerEstimate;
  const meanErrorPct = answeredCount > 0 ? sumErrorPct / answeredCount : null;

  let neutralLine = 'No route estimates submitted; all pre-lock estimation slots were skipped.';
  if (answeredCount > 0) {
    neutralLine = `Answered ${answeredCount} of ${totalMetrics} estimates across 3 corridors with ${meanErrorPct.toFixed(1)}% mean error (${sharpCount} Sharp, ${closeCount} Close, ${offCount} Off).`;
  }

  return {
    routes,
    answeredCount,
    skippedCount,
    totalMetrics,
    meanErrorPct,
    totalPoints,
    maxPoints,
    sharpCount,
    closeCount,
    offCount,
    neutralLine
  };
}

function createEmptyEstimates(routeIds) {
  const out = {};
  routeIds.forEach(id => {
    out[id] = {};
    ROUTE_CALC_FIELDS.forEach(f => { out[id][f.key] = null; });
  });
  return out;
}

function cloneEstimates(src) {
  const copy = {};
  Object.keys(src || {}).forEach(rid => {
    copy[rid] = { ...src[rid] };
  });
  return copy;
}

export function createRouteCalculatorController({
  routeIds = ['route-a', 'route-b', 'route-c'],
  sampleElevFn,
  localToMesh,
  minElev
}) {
  let estimates = createEmptyEstimates(routeIds);
  let frozenEstimates = null;
  let locked = false;
  let activeRouteId = routeIds[0] || 'route-a';

  let drawerOpen = false;
  let hasAutoOpenedOnAnalyze = false;
  let collapsedByUser = false;

  let rulerEnabled = false;
  let contourReadoutEnabled = true;
  let rulerPoints = [];
  let currentExag = 1.0;

  // 3D Ruler group (2 endpoints + straight line segment)
  const rulerGroup = new THREE.Group();
  rulerGroup.name = 'MissionRulerGroup';

  const pinGeo = new THREE.CylinderGeometry(0, 6.5, 18, 10);
  pinGeo.rotateX(Math.PI);
  const pinMatA = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const pinMatB = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  const pinA = new THREE.Mesh(pinGeo, pinMatA);
  const pinB = new THREE.Mesh(pinGeo, pinMatB);
  pinA.visible = false;
  pinB.visible = false;
  rulerGroup.add(pinA);
  rulerGroup.add(pinB);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95 });
  const rulerLine = new THREE.Line(lineGeo, lineMat);
  rulerLine.visible = false;
  rulerLine.frustumCulled = false;
  rulerGroup.add(rulerLine);

  function syncRulerMeshes() {
    if (rulerPoints.length === 0) {
      pinA.visible = false;
      pinB.visible = false;
      rulerLine.visible = false;
      return;
    }

    const p0 = rulerPoints[0];
    const m0 = localToMesh(p0.lx, p0.ly);
    const y0 = (p0.elev - minElev) * currentExag + 9.0 * currentExag;
    pinA.position.set(m0.meshX, y0 + 9.0, m0.meshZ);
    pinA.visible = true;

    if (rulerPoints.length >= 2) {
      const p1 = rulerPoints[1];
      const m1 = localToMesh(p1.lx, p1.ly);
      const y1 = (p1.elev - minElev) * currentExag + 9.0 * currentExag;
      pinB.position.set(m1.meshX, y1 + 9.0, m1.meshZ);
      pinB.visible = true;

      const posAttr = rulerLine.geometry.attributes.position;
      posAttr.setXYZ(0, m0.meshX, y0, m0.meshZ);
      posAttr.setXYZ(1, m1.meshX, y1, m1.meshZ);
      posAttr.needsUpdate = true;
      rulerLine.geometry.computeBoundingSphere();
      rulerLine.visible = true;
    } else {
      pinB.visible = false;
      rulerLine.visible = false;
    }
  }

  function getRulerStats() {
    if (rulerPoints.length === 0) {
      return { count: 0, horizontalM: null, horizontalKm: null };
    }
    if (rulerPoints.length === 1) {
      return { count: 1, horizontalM: null, horizontalKm: null };
    }
    const dx = rulerPoints[1].lx - rulerPoints[0].lx;
    const dy = rulerPoints[1].ly - rulerPoints[0].ly;
    const horizM = Math.hypot(dx, dy);
    return {
      count: 2,
      horizontalM: horizM,
      horizontalKm: horizM / 1000.0
    };
  }

  function addRulerPoint(lx, ly) {
    if (locked) return getRulerStats();
    const elev = sampleElevFn ? sampleElevFn(lx, ly) : 0;
    if (rulerPoints.length >= 2) {
      rulerPoints = [{ lx, ly, elev }];
    } else {
      rulerPoints.push({ lx, ly, elev });
    }
    syncRulerMeshes();
    return getRulerStats();
  }

  function clearRuler() {
    rulerPoints = [];
    syncRulerMeshes();
  }

  function setRulerEnabled(enabled) {
    rulerEnabled = !locked && Boolean(enabled);
    return rulerEnabled;
  }

  function setContourReadoutEnabled(enabled) {
    contourReadoutEnabled = Boolean(enabled);
    return contourReadoutEnabled;
  }

  function updateExaggeration(exag) {
    currentExag = exag;
    syncRulerMeshes();
  }

  function setActiveRouteId(routeId) {
    if (routeIds.includes(routeId)) activeRouteId = routeId;
  }

  function setEstimate(routeId, key, val) {
    if (locked) return false;
    if (!estimates[routeId] || !(key in estimates[routeId])) return false;
    estimates[routeId][key] = val === null || val === undefined ? null : Number(val);
    return true;
  }

  function clearEstimate(routeId, key) {
    return setEstimate(routeId, key, null);
  }

  function freezeOnLock() {
    if (!frozenEstimates) {
      frozenEstimates = cloneEstimates(estimates);
    }
    locked = true;
    rulerEnabled = false;
  }

  function onScreenTransition(screen) {
    if (screen === 'ANALYZE') {
      if (!hasAutoOpenedOnAnalyze && !collapsedByUser) {
        hasAutoOpenedOnAnalyze = true;
        drawerOpen = true;
      }
    } else if (screen === 'EXPLORE' || screen === 'DEBRIEF') {
      freezeOnLock();
    }
  }

  function setDrawerOpen(open, { userAction = false } = {}) {
    const next = Boolean(open);
    if (userAction) {
      if (!next) collapsedByUser = true;
    }
    drawerOpen = next;
    return drawerOpen;
  }

  function shouldMaskTrueValues(screen, viewMode) {
    if (viewMode !== 'MISSION') return false;
    if (screen !== 'ANALYZE' && screen !== 'CHOOSE') return false;
    return drawerOpen;
  }

  function getAnsweredCountsByRoute() {
    const out = {};
    routeIds.forEach(rid => {
      const row = estimates[rid] || {};
      const answered = ROUTE_CALC_FIELDS.filter(f => row[f.key] !== null && row[f.key] !== undefined).length;
      out[rid] = { answered, total: ROUTE_CALC_FIELDS.length };
    });
    return out;
  }

  function reset() {
    estimates = createEmptyEstimates(routeIds);
    frozenEstimates = null;
    locked = false;
    activeRouteId = routeIds[0] || 'route-a';
    drawerOpen = false;
    hasAutoOpenedOnAnalyze = false;
    collapsedByUser = false;
    rulerEnabled = false;
    contourReadoutEnabled = true;
    clearRuler();
  }

  return {
    rulerGroup,
    getState: () => ({
      activeRouteId,
      drawerOpen,
      collapsedByUser,
      hasAutoOpenedOnAnalyze,
      locked,
      rulerEnabled,
      contourReadoutEnabled,
      estimates: cloneEstimates(estimates),
      frozenEstimates: frozenEstimates ? cloneEstimates(frozenEstimates) : null,
      rulerStats: getRulerStats()
    }),
    getEstimatesSnapshot: () => cloneEstimates(estimates),
    getFrozenSnapshot: () => (frozenEstimates ? cloneEstimates(frozenEstimates) : cloneEstimates(estimates)),
    isLocked: () => locked,
    isDrawerOpen: () => drawerOpen,
    isRulerEnabled: () => rulerEnabled,
    isContourReadoutEnabled: () => contourReadoutEnabled,
    setActiveRouteId,
    setEstimate,
    clearEstimate,
    freezeOnLock,
    onScreenTransition,
    setDrawerOpen,
    shouldMaskTrueValues,
    getAnsweredCountsByRoute,
    addRulerPoint,
    clearRuler,
    setRulerEnabled,
    setContourReadoutEnabled,
    getRulerStats,
    updateExaggeration,
    reset
  };
}

export function renderCalcSlidersDOM({
  containerEl,
  routeId,
  estimatesRow,
  locked,
  onEstimateChange
}) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  ROUTE_CALC_FIELDS.forEach(field => {
    const val = estimatesRow ? estimatesRow[field.key] : null;
    const isUnset = val === null || val === undefined;

    const row = document.createElement('div');
    row.className = 'calc-field-row';
    row.dataset.calcMetric = field.key;

    const top = document.createElement('div');
    top.className = 'calc-field-top';

    const lbl = document.createElement('span');
    lbl.className = 'calc-field-lbl';
    lbl.textContent = field.label;

    const chip = document.createElement('span');
    chip.className = `mhc-tag ${field.chipCls}`;
    chip.textContent = field.chipText;
    lbl.appendChild(chip);

    const valWrap = document.createElement('span');
    valWrap.className = 'calc-field-val-wrap';

    const valSpan = document.createElement('span');
    valSpan.className = `calc-field-val ${isUnset ? 'unset' : ''}`;
    valSpan.textContent = formatCalcMetricValue(field, val);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'calc-clear-btn';
    clearBtn.textContent = '×';
    clearBtn.title = 'Reset to No estimate';
    clearBtn.disabled = locked || isUnset;

    valWrap.appendChild(valSpan);
    valWrap.appendChild(clearBtn);
    top.appendChild(lbl);
    top.appendChild(valWrap);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = `calc-slider ${isUnset ? 'unset' : ''}`;
    slider.dataset.calcSlider = field.key;
    slider.dataset.routeId = routeId;
    slider.min = String(field.sliderMin);
    slider.max = String(field.sliderMax);
    slider.step = String(field.sliderStep);
    slider.value = String(fieldValueToSliderPos(field, val));
    slider.disabled = locked;
    slider.setAttribute('aria-label', `${routeId} ${field.label}`);

    const sub = document.createElement('div');
    sub.className = 'calc-field-sub';
    const noteLeft = document.createElement('span');
    noteLeft.textContent = field.scaleNote;
    const noteRight = document.createElement('span');
    noteRight.textContent = `Default: No estimate`;
    sub.appendChild(noteLeft);
    sub.appendChild(noteRight);

    const handleSliderInput = () => {
      if (locked) return;
      const nextVal = sliderPosToFieldValue(field, slider.value);
      const changed = onEstimateChange(routeId, field.key, nextVal);
      if (!changed) return;
      valSpan.textContent = formatCalcMetricValue(field, nextVal);
      valSpan.classList.remove('unset');
      slider.classList.remove('unset');
      clearBtn.disabled = false;
    };

    slider.addEventListener('input', handleSliderInput);
    slider.addEventListener('change', handleSliderInput);

    clearBtn.addEventListener('click', () => {
      if (locked) return;
      const changed = onEstimateChange(routeId, field.key, null);
      if (!changed) return;
      valSpan.textContent = 'No estimate';
      valSpan.classList.add('unset');
      slider.classList.add('unset');
      slider.value = String(fieldValueToSliderPos(field, null));
      clearBtn.disabled = true;
    });

    row.appendChild(top);
    row.appendChild(slider);
    row.appendChild(sub);
    containerEl.appendChild(row);
  });
}

export function renderDebriefCalcRevealDOM({
  accEl,
  answeredEl,
  scoreEl,
  neutralEl,
  tablesEl,
  candidates,
  frozenSnapshot
}) {
  const report = evaluateCalculatorReveal(candidates, frozenSnapshot);
  if (accEl) {
    accEl.textContent = report.meanErrorPct !== null
      ? `${report.meanErrorPct.toFixed(1)}% avg error`
      : 'Skipped all';
  }
  if (answeredEl) answeredEl.textContent = `${report.answeredCount} / ${report.totalMetrics}`;
  if (scoreEl) scoreEl.textContent = `${report.totalPoints} / ${report.maxPoints} pts`;
  if (neutralEl) neutralEl.textContent = report.neutralLine;
  if (!tablesEl) return report;

  tablesEl.innerHTML = '';
  report.routes.forEach(routeRes => {
    const box = document.createElement('div');
    box.className = 'dcr-route-box';
    box.dataset.revealRoute = routeRes.id;

    const title = document.createElement('div');
    title.className = 'dcr-route-title';
    const sw = document.createElement('span');
    sw.className = 'route-swatch';
    sw.style.background = routeRes.color;
    const label = document.createElement('span');
    label.textContent = routeRes.name;
    title.appendChild(sw);
    title.appendChild(label);
    box.appendChild(title);

    const table = document.createElement('table');
    table.className = 'dcr-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Metric</th>
          <th>Source</th>
          <th>Estimate</th>
          <th>True value</th>
          <th>Error %</th>
          <th>Accuracy <span class="tag-pill game">GAME RULE</span></th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement('tbody');

    routeRes.rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.revealMetric = r.field.key;

      const tdMetric = document.createElement('td');
      tdMetric.textContent = r.field.label;

      const tdSrc = document.createElement('td');
      const chip = document.createElement('span');
      chip.className = `mhc-tag ${r.field.chipCls}`;
      chip.textContent = r.field.chipText;
      tdSrc.appendChild(chip);

      const tdEst = document.createElement('td');
      tdEst.textContent = formatCalcMetricValue(r.field, r.estimate);

      const tdTrue = document.createElement('td');
      tdTrue.textContent = r.field.key === 'ascentM'
        ? `${r.trueVal.toFixed(1)} m`
        : formatCalcMetricValue(r.field, r.trueVal);

      const tdErr = document.createElement('td');
      tdErr.textContent = r.skipped ? '—' : `${r.errorPct.toFixed(1)}%`;

      const tdAcc = document.createElement('td');
      const bandBadge = document.createElement('span');
      bandBadge.className = `dcr-band ${r.bandKey}`;
      bandBadge.textContent = r.skipped ? `${r.band} (+0)` : `${r.band} (+${r.points})`;
      tdAcc.appendChild(bandBadge);

      const barWrap = document.createElement('span');
      barWrap.className = 'dcr-bar-wrap';
      const barFill = document.createElement('span');
      barFill.className = `dcr-bar-fill ${r.bandKey}`;
      const fillPct = r.skipped ? 0 : Math.max(8, Math.min(100, 100 - r.errorPct));
      barFill.style.width = `${fillPct.toFixed(0)}%`;
      barWrap.appendChild(barFill);
      tdAcc.appendChild(barWrap);

      tr.appendChild(tdMetric);
      tr.appendChild(tdSrc);
      tr.appendChild(tdEst);
      tr.appendChild(tdTrue);
      tr.appendChild(tdErr);
      tr.appendChild(tdAcc);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    box.appendChild(table);
    tablesEl.appendChild(box);
  });

  return report;
}
