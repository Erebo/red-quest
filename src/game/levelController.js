/**
 * Level 1 UI & State Controller
 * Layers Level 1 Briefing / Analyze / Choose / Explore / Debrief flow
 * on top of the existing 3D viewer, layers, and planner without altering how they work.
 */

import { GAME_STATES, GAME_STATE_ORDER } from './gameState.js';

export function buildBlindedPlannerCandidates(levelData) {
  return levelData.candidateRoutes.map(r => ({
    id: r.id,
    name: r.blindLabel,
    blindLabel: r.blindLabel,
    trueName: r.trueName,
    bestFor: r.bestFor,
    color: r.blindColor,
    distKm: r.metrics.distKm.value,
    ascentM: r.metrics.ascentM.value,
    netElevM: r.metrics.netElevM.value,
    maxSlopeDeg: r.metrics.maxSlopeDeg.value,
    pctEasy: r.metrics.pctEasy.value,
    pctMod: r.metrics.pctMod.value,
    pctHaz: r.metrics.pctHaz.value,
    timeHours: r.metrics.timeHours.value,
    energyKwh: r.metrics.energyKwh.value,
    radDoseUsv: r.metrics.radDoseUsv.value,
    sciScore: r.metrics.sciScore.value,
    riskScore: r.metrics.riskScore.value,
    waypoints: r.waypoints,
    elevationProfile: r.elevationProfile
  }));
}

export function populateBriefingUI(levelData) {
  const titleEl = document.getElementById('briefing-title');
  const storyEl = document.getElementById('briefing-story');
  const startEl = document.getElementById('briefing-start');
  const goalEl = document.getElementById('briefing-goal');
  const targetsList = document.getElementById('briefing-targets-list');
  const targetsCards = document.getElementById('briefing-targets-cards');

  if (titleEl) titleEl.textContent = levelData.title.value;
  if (storyEl) storyEl.textContent = levelData.story.value;

  if (startEl) {
    const s = levelData.start;
    if (startEl.classList.contains('bcorr-specs')) {
      startEl.innerHTML = `
        <div class="bcorr-spec"><span class="bc-k">Grid</span><span class="bc-v">X ${s.x.toFixed(1)} m, Y ${s.y.toFixed(1)} m</span></div>
        <div class="bcorr-spec"><span class="bc-k">Geo</span><span class="bc-v">${s.lon ? s.lon.toFixed(4) + '° E' : '137.3979° E'}, ${s.lat ? s.lat.toFixed(4) + '° S' : '-4.7638° S'}</span></div>
        <div class="bcorr-spec"><span class="bc-k">Elevation</span><span class="bc-v">${s.elevation.toFixed(1)} m</span></div>
        <div class="bcorr-spec"><span class="bc-k">Local Slope</span><span class="bc-v">${s.slopeDeg.toFixed(1)}° (${s.slopeDeg < 15 ? 'Safe <15°' : 'Moderate'})</span></div>
      `;
    } else {
      startEl.textContent = `North entry · X ${s.x.toFixed(1)} m, Y ${s.y.toFixed(1)} m · Elev ${s.elevation.toFixed(1)} m · Slope ${s.slopeDeg.toFixed(1)}°`;
    }
  }

  if (goalEl) {
    const g = levelData.goal;
    if (goalEl.classList.contains('bcorr-specs')) {
      goalEl.innerHTML = `
        <div class="bcorr-spec"><span class="bc-k">Grid</span><span class="bc-v">X ${g.x.toFixed(1)} m, Y ${g.y.toFixed(1)} m</span></div>
        <div class="bcorr-spec"><span class="bc-k">Geo</span><span class="bc-v">${g.lon ? g.lon.toFixed(4) + '° E' : '137.3804° E'}, ${g.lat ? g.lat.toFixed(4) + '° S' : '-4.8064° S'}</span></div>
        <div class="bcorr-spec"><span class="bc-k">Elevation</span><span class="bc-v">${g.elevation.toFixed(1)} m</span></div>
        <div class="bcorr-spec"><span class="bc-k">Local Slope</span><span class="bc-v">${g.slopeDeg.toFixed(1)}° (${g.slopeDeg < 15 ? 'Safe <15°' : 'Moderate'})</span></div>
      `;
    } else {
      goalEl.textContent = `Boxwork Core · X ${g.x.toFixed(1)} m, Y ${g.y.toFixed(1)} m · Elev ${g.elevation.toFixed(1)} m · Slope ${g.slopeDeg.toFixed(1)}°`;
    }
  }

  const targetNotes = [
    "First entry into polygonally fractured bedrock network with mineralized ridge veins.",
    "Crest of prominent boxwork ridge; transition into primary polygonal fracture structures.",
    "Nevado Sajama drill exploration; probing sulfate-clay transition minerals."
  ];

  if (targetsCards) {
    targetsCards.innerHTML = '';
    levelData.scienceTargets.forEach((t, idx) => {
      const card = document.createElement('div');
      card.className = 'target-dossier-card';
      const note = targetNotes[idx] || "Orbital and surface science waypoint.";
      card.innerHTML = `
        <div class="tdc-top">
          <div class="tdc-badge-wrap">
            <span class="tdc-num">TARGET 0${idx + 1}</span>
            <span class="tdc-sol">${t.label || ('SOL ' + t.sol)}</span>
          </div>
          <span class="tag-pill measured">MEASURED</span>
        </div>
        <div class="tdc-title">${t.title}</div>
        <div class="tdc-metrics">
          <span>Elev: <strong>${t.elevation.toFixed(1)} m</strong></span>
          <span>Slope: <strong>${t.slopeDeg.toFixed(1)}°</strong></span>
          <span>Grid: <strong>(${t.x.toFixed(0)}, ${t.y.toFixed(0)})</strong></span>
        </div>
        <div class="tdc-desc">${note}</div>
      `;
      targetsCards.appendChild(card);
    });
  }

  if (targetsList) {
    targetsList.innerHTML = '';
    levelData.scienceTargets.forEach((t, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>Target ${idx + 1}</strong>: ${t.title} <small>(X ${t.x.toFixed(0)} m, Y ${t.y.toFixed(0)} m, ${t.elevation.toFixed(1)} m)</small> <span class="tag-pill measured">MEASURED</span>`;
      targetsList.appendChild(li);
    });
  }
}

export function populateDebriefUI(levelData, lockedRouteId, trimmedCuriosity = null, surveyScore = 0) {
  const refStatsEl = document.getElementById('debrief-ref-stats');
  const lockedEl = document.getElementById('debrief-locked-route');
  const tbodyEl = document.getElementById('debrief-true-tbody');
  const compTbodyEl = document.getElementById('debrief-comp-tbody');

  // Outcome banner & summary elements
  const bannerEl = document.getElementById('debrief-outcome-banner');
  const summaryRouteEl = document.getElementById('debrief-summary-route');
  const summaryDistEl = document.getElementById('debrief-summary-dist');
  const summaryClimbEl = document.getElementById('debrief-summary-climb');
  const summarySlopeEl = document.getElementById('debrief-summary-slope');

  const refM = levelData.referenceRoute.metrics;
  if (refStatsEl) {
    refStatsEl.textContent = `Sols ${levelData.referenceRoute.solMin}–${levelData.referenceRoute.solMax}, ${refM.distKm.toFixed(2)} km, +${refM.ascentM.toFixed(1)} m climb, max slope ${refM.maxSlopeDeg.toFixed(1)}°`;
  }

  const chosen = levelData.candidateRoutes.find(r => r.id === lockedRouteId);
  const chosenName = chosen ? `${chosen.blindLabel} (${chosen.trueName})` : 'No route chosen yet';
  if (lockedEl) {
    lockedEl.textContent = chosenName;
  }
  if (summaryRouteEl) {
    summaryRouteEl.textContent = chosen ? chosen.blindLabel : '—';
  }
  if (summaryDistEl && chosen) {
    summaryDistEl.textContent = `${chosen.metrics.distKm.value.toFixed(2)} km`;
  }
  if (summaryClimbEl && chosen) {
    summaryClimbEl.textContent = `+${chosen.metrics.ascentM.value.toFixed(1)} m`;
  }
  if (summarySlopeEl && chosen) {
    summarySlopeEl.textContent = `${chosen.metrics.pctHaz.value.toFixed(1)}% >25° (${chosen.metrics.maxSlopeDeg.value.toFixed(1)}° max)`;
  }

  if (bannerEl) {
    bannerEl.className = 'debrief-outcome-banner complete';
    const statusEl = bannerEl.querySelector('.dob-status');
    const subEl = bannerEl.querySelector('.dob-sub');
    if (statusEl) {
      statusEl.textContent = chosen ? `MAP SURVEY & SELECTION: ${chosen.blindLabel.toUpperCase()}` : 'MAP SURVEY & EVALUATION';
    }
    if (subEl) {
      subEl.textContent = chosen
        ? `Traverse corridor for ${chosen.blindLabel} (${chosen.trueName}) surveyed and verified across Gale Crater DEM.`
        : 'Review candidate route metrics, survey accuracy, and Curiosity traverse baseline.';
    }
  }

  if (tbodyEl) {
    tbodyEl.innerHTML = '';
    levelData.candidateRoutes.forEach(r => {
      const tr = document.createElement('tr');
      if (r.id === lockedRouteId) tr.classList.add('selected');
      const m = r.metrics;
      const badgeClass = r.strategyMode === 'shortest' ? 'fastest' : r.strategyMode;
      tr.innerHTML = `
        <td><div class="route-cell"><span class="route-swatch" style="background:${r.blindColor}"></span>${r.blindLabel}</div></td>
        <td><strong>${r.trueName}</strong> <span class="badge-best ${badgeClass}">${r.bestFor}</span></td>
        <td>${m.distKm.value.toFixed(2)} km</td>
        <td>${m.timeHours.value.toFixed(1)} h</td>
        <td>${m.energyKwh.value.toFixed(2)} kWh</td>
        <td>${m.radDoseUsv.value} µSv</td>
        <td><strong>${m.sciScore.value}</strong></td>
        <td>${m.riskScore.value.toFixed(1)} / 100</td>
      `;
      tbodyEl.appendChild(tr);
    });
  }

  if (compTbodyEl) {
    compTbodyEl.innerHTML = '';
    const rows = [];
    if (chosen) {
      const m = chosen.metrics;
      rows.push({
        swatch: chosen.blindColor,
        label: `Your route (${chosen.blindLabel} · ${chosen.trueName})`,
        distKm: m.distKm.value,
        pctEasy: m.pctEasy.value,
        pctMod: m.pctMod.value,
        pctHaz: m.pctHaz.value,
        isSelected: true
      });
    }
    if (trimmedCuriosity) {
      rows.push({
        swatch: '#cbd5e1',
        label: "Curiosity's actual path (trimmed to boxwork core zone)",
        distKm: trimmedCuriosity.distKm,
        pctEasy: trimmedCuriosity.pctEasy,
        pctMod: trimmedCuriosity.pctMod,
        pctHaz: trimmedCuriosity.pctHaz,
        isSelected: false
      });
    }
    rows.forEach(row => {
      const tr = document.createElement('tr');
      if (row.isSelected) tr.classList.add('selected');
      tr.innerHTML = `
        <td><div class="route-cell"><span class="route-swatch" style="background:${row.swatch}"></span>${row.label}</div></td>
        <td>${row.distKm.toFixed(2)} km</td>
        <td>${row.pctEasy.toFixed(1)}%</td>
        <td>${row.pctMod.toFixed(1)}%</td>
        <td>${row.pctHaz.toFixed(1)}%</td>
      `;
      compTbodyEl.appendChild(tr);
    });
  }
}

export function updatePhaseStepper(screen) {
  const steps = document.querySelectorAll('#game-phase-bar .phase-step');
  const curIdx = GAME_STATE_ORDER.indexOf(screen);
  steps.forEach(el => {
    const idx = GAME_STATE_ORDER.indexOf(el.dataset.phase);
    el.classList.toggle('active', idx === curIdx);
    el.classList.toggle('done', idx >= 0 && idx < curIdx);
  });
}

export function initDevResetButton(onReset) {
  const btn = document.getElementById('btn-dev-reset');
  if (!btn) return;
  if (import.meta.env.DEV) {
    btn.style.display = 'inline-block';
    btn.addEventListener('click', onReset);
  } else {
    btn.remove();
  }
}

export { GAME_STATES };
