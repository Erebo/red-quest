/**
 * Survey Data Log, 3x4 Decimal Calculator, Full-Route Sampler (~10 m),
 * Composite Hazard Index (GAME/SIM), and Lock-In Result Evaluator.
 */

import {
  HAZARD_INDEX_WEIGHTS,
  SURVEY_CONFIG,
  SURVEY_RANK_THRESHOLDS
} from '../config.js';
import { isPointInDustZone } from './dustZones.js';

export const TOOL_TO_LOG_METRIC = Object.freeze({
  slope: 'maxSlopeDeg',
  hazard: 'hazardCount',
  elements: 'elementsCount',
  dust: 'dustPct'
});

export const SURVEY_LOG_ROWS = Object.freeze([
  Object.freeze({
    key: 'maxSlopeDeg',
    tool: 'slope',
    label: 'Max slope',
    unit: '°',
    decimals: 1,
    tagText: 'MEASURED DEM',
    tagCls: 'measured'
  }),
  Object.freeze({
    key: 'hazardCount',
    tool: 'hazard',
    label: 'Hazard count',
    unit: '',
    decimals: 0,
    tagText: 'DERIVED',
    tagCls: 'dem'
  }),
  Object.freeze({
    key: 'elementsCount',
    tool: 'elements',
    label: 'Elements identified',
    unit: '',
    decimals: 0,
    tagText: 'GAME',
    tagCls: 'game'
  }),
  Object.freeze({
    key: 'dustPct',
    tool: 'dust',
    label: 'Dust %',
    unit: '%',
    decimals: 1,
    tagText: 'SIM',
    tagCls: 'sim'
  })
]);

export const SURVEY_CALC_ROWS = Object.freeze([
  Object.freeze({ key: 'elementsCount', label: 'Elements identified', unit: 'count', step: 'any', decimals: 0 }),
  Object.freeze({ key: 'hazardCount', label: 'Hazard count', unit: 'count', step: 'any', decimals: 0 }),
  Object.freeze({ key: 'maxSlopeDeg', label: 'Max slope', unit: '°', step: 'any', decimals: 1 }),
  Object.freeze({ key: 'dustPct', label: 'Dust exposure', unit: '%', step: 'any', decimals: 1 })
]);

function pointToSegmentDistSq2D(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-8) return wx * wx + wy * wy;
  const t = Math.max(0.0, Math.min(1.0, (wx * vx + wy * vy) / lenSq));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return dx * dx + dy * dy;
}

function minDistanceToPolyline2D(x, y, waypoints) {
  if (!waypoints || waypoints.length === 0) return Infinity;
  if (waypoints.length === 1) return Math.hypot(x - waypoints[0].x, y - waypoints[0].y);
  let bestSq = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dSq = pointToSegmentDistSq2D(x, y, a.x, a.y, b.x, b.y);
    if (dSq < bestSq) bestSq = dSq;
  }
  return Math.sqrt(bestSq);
}

/**
 * Sample route polyline every ~10 m and compute all true survey values (cached once).
 */
export function computeRouteSurveyMetrics(candidate, elements, sampleSlopeFn) {
  const wps = candidate?.waypoints || [];
  if (wps.length < 2) {
    return {
      routeId: candidate?.id || '',
      routeName: candidate?.blindLabel || candidate?.name || '',
      sampleCount: 0,
      maxSlopeDeg: 0,
      pctEasy: 100,
      pctMod: 0,
      pctSteep: 0,
      steepZonesCrossed: 0,
      hazElements150m: 0,
      hazardCount: 0,
      elementsCount: 0,
      nearElementIds: [],
      dustPct: 0,
      hazardIndex: 0
    };
  }

  const spacing = SURVEY_CONFIG.sampleSpacingM;
  const samples = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(segLen / spacing));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      samples.push({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f
      });
    }
  }
  const last = wps[wps.length - 1];
  samples.push({ x: last.x, y: last.y });

  let maxSlopeDeg = 0;
  let easyCount = 0;
  let modCount = 0;
  let steepCount = 0;
  let dustCount = 0;
  let steepZonesCrossed = 0;
  let inSteepZone = false;

  for (let i = 0; i < samples.length; i++) {
    const pt = samples[i];
    const sl = sampleSlopeFn ? sampleSlopeFn(pt.x, pt.y) : 0;
    if (sl > maxSlopeDeg) maxSlopeDeg = sl;

    if (sl > 25.0) {
      steepCount++;
    } else if (sl >= 15.0) {
      modCount++;
    } else {
      easyCount++;
    }

    const isSteepZone = sl >= SURVEY_CONFIG.steepZoneThresholdDeg;
    if (isSteepZone && !inSteepZone) {
      steepZonesCrossed++;
      inSteepZone = true;
    } else if (!isSteepZone && inSteepZone) {
      inSteepZone = false;
    }

    if (isPointInDustZone(pt.x, pt.y)) {
      dustCount++;
    }
  }

  const n = Math.max(1, samples.length);
  const pctEasy = (easyCount * 100.0) / n;
  const pctMod = (modCount * 100.0) / n;
  const pctSteep = (steepCount * 100.0) / n;
  const dustPct = (dustCount * 100.0) / n;

  // Match Level 1 pre-lock visible elements within 150 m
  const radius = SURVEY_CONFIG.radiusM;
  const nearElementIds = [];
  let hazElements150m = 0;
  let elementsCount = 0;

  (elements || []).forEach(el => {
    if (el.visibility === 'scan') return;
    if (minDistanceToPolyline2D(el.x, el.y, wps) <= radius) {
      nearElementIds.push(el.id);
      elementsCount++;
      if (el.family === 'hazard') hazElements150m++;
    }
  });

  const hazardCount = hazElements150m + steepZonesCrossed;

  const rawHazardIndex =
    HAZARD_INDEX_WEIGHTS.wSteepPct * pctSteep +
    HAZARD_INDEX_WEIGHTS.wModPct * pctMod +
    HAZARD_INDEX_WEIGHTS.wHazardElements * hazElements150m +
    HAZARD_INDEX_WEIGHTS.wDustPct * dustPct;
  const hazardIndex = Math.max(0, Math.min(100, rawHazardIndex));

  return {
    routeId: candidate.id,
    routeName: candidate.blindLabel || candidate.name,
    color: candidate.color,
    sampleCount: samples.length,
    maxSlopeDeg: Number(maxSlopeDeg.toFixed(1)),
    pctEasy: Number(pctEasy.toFixed(1)),
    pctMod: Number(pctMod.toFixed(1)),
    pctSteep: Number(pctSteep.toFixed(1)),
    steepZonesCrossed,
    hazElements150m,
    hazardCount,
    elementsCount,
    nearElementIds,
    dustPct: Number(dustPct.toFixed(1)),
    hazardIndex: Number(hazardIndex.toFixed(1))
  };
}

/**
 * Evaluate a single player decimal input vs. true value.
 * Empty input scores 0. Full points <= 10% error, falling linearly to 0 at >= 50% error.
 */
export function scoreSurveyCell(rawInput, trueVal, maxCellPoints) {
  const str = rawInput === null || rawInput === undefined ? '' : String(rawInput).trim();
  if (!str.length) {
    return {
      empty: true,
      estimate: null,
      trueVal,
      errorPct: null,
      points: 0,
      maxPoints: maxCellPoints
    };
  }
  const est = Number(str);
  if (!Number.isFinite(est)) {
    return {
      empty: true,
      estimate: null,
      trueVal,
      errorPct: null,
      points: 0,
      maxPoints: maxCellPoints
    };
  }

  const tVal = Number(trueVal);
  let errPct;
  if (Math.abs(tVal) < 1e-6) {
    errPct = Math.abs(est) < 1e-6 ? 0.0 : Math.min(100.0, Math.abs(est) * 25.0);
  } else {
    errPct = (Math.abs(est - tVal) / Math.abs(tVal)) * 100.0;
  }

  const fullErr = SURVEY_CONFIG.accuracyFullErrPct;
  const zeroErr = SURVEY_CONFIG.accuracyZeroErrPct;
  let factor = 0.0;
  if (errPct <= fullErr) {
    factor = 1.0;
  } else if (errPct < zeroErr) {
    factor = (zeroErr - errPct) / (zeroErr - fullErr);
  }

  return {
    empty: false,
    estimate: est,
    trueVal: tVal,
    errorPct: errPct,
    points: maxCellPoints * factor,
    maxPoints: maxCellPoints
  };
}

export function resolveSurveyRank(totalScore) {
  for (let i = 0; i < SURVEY_RANK_THRESHOLDS.length; i++) {
    if (totalScore >= SURVEY_RANK_THRESHOLDS[i].minScore) {
      return SURVEY_RANK_THRESHOLDS[i].label;
    }
  }
  return 'Rookie';
}

export function evaluateSurveySubmission({
  candidates,
  routeCache,
  userInputs,
  identifiedCount,
  totalIdentifiable
}) {
  const identRatio = totalIdentifiable > 0 ? Math.min(1.0, identifiedCount / totalIdentifiable) : 0;
  const identPoints = identRatio * SURVEY_CONFIG.identMaxScore;
  const perRouteElementMax = SURVEY_CONFIG.elementAccuracyMaxScore / Math.max(1, candidates.length);
  const perHazardCellMax = SURVEY_CONFIG.maxHazardScore / Math.max(1, candidates.length * 3);

  let elemAccPoints = 0;
  let hazardAccPoints = 0;
  const routeEvaluations = [];

  candidates.forEach(c => {
    const truth = routeCache[c.id];
    const rowInputs = (userInputs && userInputs[c.id]) || {};
    const cells = SURVEY_CALC_ROWS.map(rowDef => {
      const maxPts = rowDef.key === 'elementsCount' ? perRouteElementMax : perHazardCellMax;
      const res = scoreSurveyCell(rowInputs[rowDef.key], truth ? truth[rowDef.key] : 0, maxPts);
      if (rowDef.key === 'elementsCount') elemAccPoints += res.points;
      else hazardAccPoints += res.points;
      return {
        rowDef,
        ...res
      };
    });

    routeEvaluations.push({
      id: c.id,
      name: c.blindLabel || c.name,
      color: c.color,
      truth,
      cells
    });
  });

  const elementScore = Math.max(0, Math.min(100, Math.round(identPoints + elemAccPoints)));
  const hazardScore = Math.max(0, Math.min(100, Math.round(hazardAccPoints)));
  const totalScore = elementScore + hazardScore;
  const rank = resolveSurveyRank(totalScore);

  return {
    identifiedCount,
    totalIdentifiable,
    identPoints: Number(identPoints.toFixed(1)),
    elemAccPoints: Number(elemAccPoints.toFixed(1)),
    elementScore,
    hazardScore,
    totalScore,
    rank,
    routeEvaluations
  };
}

/**
 * Render the Survey Kit Data Log + 3x4 Decimal Calculator + Progress Ring DOM.
 */
export function createSurveyLogController({
  candidates,
  elements,
  sampleSlopeFn,
  logTbodyEl,
  calcGridEl,
  scansLeftEl,
  ringFgEl,
  ringTextEl,
  idProgressEl
}) {
  const routeCache = {};
  candidates.forEach(c => {
    routeCache[c.id] = computeRouteSurveyMetrics(c, elements, sampleSlopeFn);
  });

  // Logged keys: `${routeId}:${tool}`
  const scannedPairs = new Set();
  const scansRemainingInit = SURVEY_CONFIG.routeScanBudget;
  let scansLeft = scansRemainingInit;
  let identifiedCount = 0;
  let totalIdentifiable = 13;
  let identifiedNearRouteCounts = {};

  // User calculator inputs map { [routeId]: { elementsCount: '', hazardCount: '', maxSlopeDeg: '', dustPct: '' } }
  const userInputs = {};
  candidates.forEach(c => {
    userInputs[c.id] = {
      elementsCount: '',
      hazardCount: '',
      maxSlopeDeg: '',
      dustPct: ''
    };
  });

  function formatLoggedCell(truth, key, routeId) {
    if (!truth) return '?';
    if (key === 'maxSlopeDeg') return `${truth.maxSlopeDeg.toFixed(1)}°`;
    if (key === 'hazardCount') return String(truth.hazardCount);
    if (key === 'dustPct') return `${truth.dustPct.toFixed(1)}%`;
    if (key === 'elementsCount') {
      const idCnt = identifiedNearRouteCounts[routeId] || 0;
      return `${truth.elementsCount} (${idCnt} ID'd)`;
    }
    return '?';
  }

  function buildDataLogDom() {
    if (!logTbodyEl) return;
    logTbodyEl.innerHTML = '';
    SURVEY_LOG_ROWS.forEach(rowDef => {
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.className = 'sl-metric-cell';
      tdLabel.innerHTML = `<span>${rowDef.label}</span> <span class="mhc-tag ${rowDef.tagCls}">${rowDef.tagText}</span>`;
      tr.appendChild(tdLabel);

      candidates.forEach(c => {
        const td = document.createElement('td');
        td.className = 'sl-val-cell is-unknown';
        td.dataset.routeId = c.id;
        td.dataset.metricKey = rowDef.key;
        td.textContent = '?';
        tr.appendChild(td);
      });
      logTbodyEl.appendChild(tr);
    });
  }

  function buildCalculatorDom() {
    if (!calcGridEl) return;
    calcGridEl.innerHTML = '';

    // Column headers: Metric | A | B | C
    const headMetric = document.createElement('div');
    headMetric.className = 'sc-hdr sc-hdr-m';
    headMetric.textContent = 'Metric';
    calcGridEl.appendChild(headMetric);

    candidates.forEach(c => {
      const h = document.createElement('div');
      h.className = 'sc-hdr';
      const shortName = (c.blindLabel || c.name || '').replace(/^Route\s+/i, '');
      h.innerHTML = `<span class="route-swatch" style="background:${c.color}"></span> ${shortName}`;
      calcGridEl.appendChild(h);
    });

    SURVEY_CALC_ROWS.forEach((rowDef, rIdx) => {
      const lbl = document.createElement('div');
      lbl.className = 'sc-row-lbl';
      lbl.innerHTML = `${rowDef.label} <small>(${rowDef.unit})</small>`;
      calcGridEl.appendChild(lbl);

      candidates.forEach((c, cIdx) => {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = rowDef.step;
        inp.inputMode = 'decimal';
        inp.className = 'sc-input';
        inp.placeholder = '—';
        inp.dataset.routeId = c.id;
        inp.dataset.metricKey = rowDef.key;
        inp.tabIndex = 100 + rIdx * candidates.length + cIdx + 1;
        inp.setAttribute('aria-label', `${c.blindLabel || c.name} ${rowDef.label} (${rowDef.unit})`);
        inp.value = userInputs[c.id]?.[rowDef.key] || '';
        inp.addEventListener('input', e => {
          if (!userInputs[c.id]) userInputs[c.id] = {};
          userInputs[c.id][rowDef.key] = e.target.value;
        });
        calcGridEl.appendChild(inp);
      });
    });
  }

  function refreshUi() {
    if (scansLeftEl) {
      scansLeftEl.textContent = `Scans left: ${scansLeft}`;
      scansLeftEl.classList.toggle('is-empty', scansLeft <= 0);
    }

    const totalLogCells = candidates.length * SURVEY_LOG_ROWS.length;
    const filledCells = scannedPairs.size;
    if (ringTextEl) {
      ringTextEl.textContent = `${filledCells}/${totalLogCells}`;
    }
    if (ringFgEl) {
      const circ = 87.96; // 2 * PI * 14
      const frac = totalLogCells > 0 ? filledCells / totalLogCells : 0;
      ringFgEl.style.strokeDashoffset = (circ * (1 - frac)).toFixed(2);
    }
    if (idProgressEl) {
      idProgressEl.textContent = `Identified: ${identifiedCount}/${totalIdentifiable}`;
    }

    if (logTbodyEl) {
      logTbodyEl.querySelectorAll('.sl-val-cell').forEach(td => {
        const rId = td.dataset.routeId;
        const mKey = td.dataset.metricKey;
        const rowDef = SURVEY_LOG_ROWS.find(r => r.key === mKey);
        const isScanned = rowDef && scannedPairs.has(`${rId}:${rowDef.tool}`);
        if (isScanned) {
          td.classList.remove('is-unknown');
          td.classList.add('is-filled');
          td.textContent = formatLoggedCell(routeCache[rId], mKey, rId);
        } else {
          td.classList.add('is-unknown');
          td.classList.remove('is-filled');
          td.textContent = '?';
        }
      });
    }
  }

  buildDataLogDom();
  buildCalculatorDom();
  refreshUi();

  /**
   * Perform a full-route scan using `toolId` on `routeId`.
   * New (routeId, toolId) pairs cost 1 scan; repeats are free.
   */
  function scanRoute(routeId, toolId) {
    const truth = routeCache[routeId];
    if (!truth || !TOOL_TO_LOG_METRIC[toolId]) return { ok: false, reason: 'invalid' };
    const pairKey = `${routeId}:${toolId}`;
    const alreadyScanned = scannedPairs.has(pairKey);

    if (!alreadyScanned) {
      if (scansLeft <= 0) {
        return {
          ok: false,
          outOfBudget: true,
          scansLeft,
          routeName: truth.routeName
        };
      }
      scannedPairs.add(pairKey);
      scansLeft--;
      refreshUi();
    }

    return {
      ok: true,
      chargedCost: alreadyScanned ? 0 : 1,
      cachedRepeat: alreadyScanned,
      scansLeft,
      truth,
      toolId
    };
  }

  function updateIdentificationStats(count, total, identifiedIdSet) {
    identifiedCount = count;
    totalIdentifiable = total;
    const nextCounts = {};
    candidates.forEach(c => {
      const truth = routeCache[c.id];
      let n = 0;
      if (truth && identifiedIdSet) {
        truth.nearElementIds.forEach(id => {
          if (identifiedIdSet.has(id)) n++;
        });
      }
      nextCounts[c.id] = n;
    });
    identifiedNearRouteCounts = nextCounts;
    refreshUi();
  }

  function evaluateCurrent() {
    return evaluateSurveySubmission({
      candidates,
      routeCache,
      userInputs,
      identifiedCount,
      totalIdentifiable
    });
  }

  function reset() {
    scannedPairs.clear();
    scansLeft = scansRemainingInit;
    identifiedCount = 0;
    identifiedNearRouteCounts = {};
    candidates.forEach(c => {
      userInputs[c.id] = {
        elementsCount: '',
        hazardCount: '',
        maxSlopeDeg: '',
        dustPct: ''
      };
    });
    if (calcGridEl) {
      calcGridEl.querySelectorAll('.sc-input').forEach(inp => {
        inp.value = '';
      });
    }
    refreshUi();
  }

  return {
    getRouteTruth: routeId => routeCache[routeId] || null,
    getAllRouteTruths: () => ({ ...routeCache }),
    getScansLeft: () => scansLeft,
    scanRoute,
    updateIdentificationStats,
    evaluateCurrent,
    reset,
    refreshUi
  };
}

/**
 * Render the pre-Explore Result Overlay immediately after Lock In.
 * Shows all true values at once, per-cell errors & points, true Hazard Index, scores, and Rank (no verdict).
 */
export function renderSurveyResultOverlayDOM({
  elemScoreEl,
  hazScoreEl,
  totalScoreEl,
  rankEl,
  identSummaryEl,
  hazIndexRowEl,
  tablesWrapEl,
  evaluation
}) {
  if (!evaluation) return;
  if (elemScoreEl) elemScoreEl.textContent = `${evaluation.elementScore} / 100`;
  if (hazScoreEl) hazScoreEl.textContent = `${evaluation.hazardScore} / 100`;
  if (totalScoreEl) totalScoreEl.textContent = `${evaluation.totalScore} / 200`;
  if (rankEl) rankEl.textContent = evaluation.rank;
  if (identSummaryEl) {
    identSummaryEl.textContent = `Elements identified: ${evaluation.identifiedCount} / ${evaluation.totalIdentifiable} (${evaluation.identPoints.toFixed(1)} pts) + Count accuracy (${evaluation.elemAccPoints.toFixed(1)} pts)`;
  }

  if (hazIndexRowEl) {
    hazIndexRowEl.innerHTML = '';
    evaluation.routeEvaluations.forEach(re => {
      const box = document.createElement('div');
      box.className = 'sro-hi-card';
      box.innerHTML = `
        <div class="sro-hi-top"><span class="route-swatch" style="background:${re.color}"></span><strong>${re.name}</strong></div>
        <div class="sro-hi-val">${re.truth.hazardIndex.toFixed(1)} <small>/ 100</small></div>
        <div class="sro-hi-sub">Steep ${re.truth.pctSteep.toFixed(1)}% · Mod ${re.truth.pctMod.toFixed(1)}% · Haz ${re.truth.hazElements150m} · Dust ${re.truth.dustPct.toFixed(1)}%</div>
      `;
      hazIndexRowEl.appendChild(box);
    });
  }

  if (tablesWrapEl) {
    tablesWrapEl.innerHTML = '';
    evaluation.routeEvaluations.forEach(re => {
      const box = document.createElement('div');
      box.className = 'dcr-route-box';
      const title = document.createElement('div');
      title.className = 'dcr-route-title';
      title.innerHTML = `<span class="route-swatch" style="background:${re.color}"></span><span>${re.name}</span> <small style="color:#93a4b7;font-weight:500;">(True Hazard Index: ${re.truth.hazardIndex.toFixed(1)} / 100)</small>`;
      box.appendChild(title);

      const tbl = document.createElement('table');
      tbl.className = 'dcr-table';
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>Metric</th>
            <th>Your number</th>
            <th>True number</th>
            <th>Error</th>
            <th>Points</th>
          </tr>
        </thead>
      `;
      const tb = document.createElement('tbody');
      re.cells.forEach(cell => {
        const unit = cell.rowDef.unit === 'count' ? '' : cell.rowDef.unit;
        const yourStr = cell.empty ? '—' : `${cell.estimate}${unit ? ` ${unit}` : ''}`;
        const trueStr = `${cell.rowDef.decimals > 0 ? cell.trueVal.toFixed(cell.rowDef.decimals) : Math.round(cell.trueVal)}${unit ? ` ${unit}` : ''}`;
        const errStr = cell.empty ? 'Empty' : `${cell.errorPct.toFixed(1)}%`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${cell.rowDef.label}</td>
          <td>${yourStr}</td>
          <td>${trueStr}</td>
          <td>${errStr}</td>
          <td><strong>${cell.points.toFixed(1)}</strong> / ${cell.maxPoints.toFixed(1)}</td>
        `;
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      box.appendChild(tbl);
      tablesWrapEl.appendChild(box);
    });
  }
}
