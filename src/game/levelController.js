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

  if (titleEl) titleEl.textContent = levelData.title.value;
  if (storyEl) storyEl.textContent = levelData.story.value;

  if (startEl) {
    const s = levelData.start;
    startEl.textContent = `North entry · X ${s.x.toFixed(1)} m, Y ${s.y.toFixed(1)} m · Elev ${s.elevation.toFixed(1)} m · Slope ${s.slopeDeg.toFixed(1)}°`;
  }

  if (goalEl) {
    const g = levelData.goal;
    goalEl.textContent = `Boxwork Core · X ${g.x.toFixed(1)} m, Y ${g.y.toFixed(1)} m · Elev ${g.elevation.toFixed(1)} m · Slope ${g.slopeDeg.toFixed(1)}°`;
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

export function populateDebriefUI(levelData, lockedRouteId, trimmedCuriosity = null, driveStats = null) {
  const refStatsEl = document.getElementById('debrief-ref-stats');
  const lockedEl = document.getElementById('debrief-locked-route');
  const tbodyEl = document.getElementById('debrief-true-tbody');
  const compTbodyEl = document.getElementById('debrief-comp-tbody');
  const summaryBox = document.getElementById('debrief-mission-summary');

  const refM = levelData.referenceRoute.metrics;
  if (refStatsEl) {
    refStatsEl.textContent = `Sols ${levelData.referenceRoute.solMin}–${levelData.referenceRoute.solMax}, ${refM.distKm.toFixed(2)} km, +${refM.ascentM.toFixed(1)} m climb, max slope ${refM.maxSlopeDeg.toFixed(1)}°`;
  }

  const chosen = levelData.candidateRoutes.find(r => r.id === lockedRouteId);
  if (lockedEl) {
    lockedEl.textContent = chosen ? `${chosen.blindLabel} (${chosen.trueName})` : '—';
  }

  // Populate Drive Performance Summary Card if available
  if (summaryBox) {
    if (driveStats) {
      summaryBox.classList.remove('hidden');
      const distKm = (driveStats.totalDistanceM / 1000.0).toFixed(2);
      const batRem = Math.round(driveStats.batteryRemainingPct || 100);
      const sciPts = driveStats.scienceScore || 0;
      const poiCount = driveStats.discoveredCount || 0;
      
      // Calculate Grade:
      // High score (>300) + good battery (>50%) = A+
      // >200 or >30% = A
      // else B
      let grade = 'A';
      if (sciPts >= 350 && batRem >= 50) grade = 'A+';
      else if (sciPts >= 200 || batRem >= 60) grade = 'A';
      else if (batRem >= 30) grade = 'B';
      else grade = 'C';

      summaryBox.innerHTML = `
        <div class="dms-grade-badge">
          <span class="dms-grade-title">MISSION GRADE</span>
          <strong class="dms-grade-val">${grade}</strong>
        </div>
        <div class="dms-stats-grid">
          <div class="dms-stat-card">
            <span class="dms-lbl">Science Gathered <span class="tag-pill game">GAME</span></span>
            <strong class="dms-val text-cyan">+${sciPts} pts</strong>
            <small>${poiCount} outcrops/cores logged</small>
          </div>
          <div class="dms-stat-card">
            <span class="dms-lbl">Distance Traversed <span class="tag-pill measured">MEASURED</span></span>
            <strong class="dms-val">${distKm} km</strong>
            <small>Actual ground path driven</small>
          </div>
          <div class="dms-stat-card">
            <span class="dms-lbl">Battery Conserved <span class="sim-badge">SIM</span></span>
            <strong class="dms-val text-green">${batRem}%</strong>
            <small>Power reserves remaining</small>
          </div>
        </div>
      `;
    } else {
      summaryBox.classList.add('hidden');
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
