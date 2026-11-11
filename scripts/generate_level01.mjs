/**
 * Deterministic generator for src/game/levels/level01.json
 * Executes the existing src/routeWorker.js A* search untouched with fixed Level 1 settings.
 * Reads ONLY verified files from public/data/.
 */

import fs from 'node:fs';
import path from 'node:path';

const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;
const WEST_EDGE_EASTING = 8140750.0;
const SOUTH_EDGE_NORTHING = -287375.0;
const MARS_RADIUS_M = 3396190.0;
const GRID_FULL = 1025;
const GRID_SUB = 257;

function loadFloatGrid(filePath) {
  const buf = fs.readFileSync(filePath);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function sampleGridBilinear(data, lx, ly) {
  const col = Math.max(0.0, Math.min(1024.0, (lx / TERRAIN_WIDTH_M) * 1024.0));
  const row = Math.max(0.0, Math.min(1024.0, (1.0 - ly / TERRAIN_HEIGHT_M) * 1024.0));
  const c0 = Math.floor(col);
  const c1 = Math.min(1024, c0 + 1);
  const r0 = Math.floor(row);
  const r1 = Math.min(1024, r0 + 1);
  const fc = col - c0;
  const fr = row - r0;
  const top = (1.0 - fc) * data[r0 * GRID_FULL + c0] + fc * data[r0 * GRID_FULL + c1];
  const bot = (1.0 - fc) * data[r1 * GRID_FULL + c0] + fc * data[r1 * GRID_FULL + c1];
  return (1.0 - fr) * top + fr * bot;
}

function localToLonLat(lx, ly) {
  const easting = WEST_EDGE_EASTING + lx;
  const northing = SOUTH_EDGE_NORTHING + ly;
  const lon = (easting / MARS_RADIUS_M) * (180.0 / Math.PI);
  const lat = (northing / MARS_RADIUS_M) * (180.0 / Math.PI);
  return { lon: Number(lon.toFixed(6)), lat: Number(lat.toFixed(6)) };
}

function runWorkerOnce(workerCode, payload) {
  let resultMsg = null;
  const selfShim = {
    onmessage: null,
    postMessage(msg) {
      if (msg && msg.type === 'result') {
        resultMsg = msg;
      }
    }
  };
  const fn = new Function('self', 'console', workerCode);
  fn(selfShim, { log: () => {}, error: console.error });
  selfShim.onmessage({ data: payload });
  return resultMsg;
}

function stitchSegments(segments, sciMarkers, crismPixels) {
  const waypoints = [];
  for (let i = 0; i < segments.length; i++) {
    const segWps = segments[i].waypoints;
    for (let j = i === 0 ? 0 : 1; j < segWps.length; j++) {
      waypoints.push({
        x: segWps[j].x,
        y: segWps[j].y,
        z: segWps[j].z,
        slope: segWps[j].slope,
        tier: segWps[j].tier
      });
    }
  }

  let cumDist = 0.0;
  let totAscent = 0.0;
  let maxSlope = 0.0;
  let easyCount = 0;
  let modCount = 0;
  let hazCount = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (wp.slope < 15.0) easyCount++;
    else if (wp.slope <= 25.0) modCount++;
    else hazCount++;
    if (wp.slope > maxSlope) maxSlope = wp.slope;

    wp.segDist = 0.0;
    wp.segAscent = 0.0;
    wp.distM = cumDist;

    if (i > 0) {
      const prev = waypoints[i - 1];
      const dx = wp.x - prev.x;
      const dy = wp.y - prev.y;
      const dz = wp.z - prev.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      cumDist += d;
      wp.distM = cumDist;
      wp.segDist = d;
      if (dz > 0) {
        wp.segAscent = dz;
        totAscent += dz;
      }
    }
  }

  const n = waypoints.length;
  const pctEasy = (easyCount / n) * 100.0;
  const pctMod = (modCount / n) * 100.0;
  const pctHaz = (hazCount / n) * 100.0;

  // Same deterministic simulated formulas from routeWorker.js / docs/SIMULATED_DATA.md
  let timeHours = 0.0;
  let energyKwh = 0.0;
  let radDoseUsv = 0.0;
  for (let i = 1; i < n; i++) {
    const wp = waypoints[i];
    const slopeRad = (wp.slope * Math.PI) / 180.0;
    const modRed = Math.min(1.0, Math.max(0.0, (wp.slope - 15.0) / 10.0));
    const etaSlope = Math.max(0.20, Math.cos(slopeRad) * (1.0 - 0.40 * modRed));
    const dt = wp.segDist / (100.0 * etaSlope) + wp.segAscent / 20.0;
    timeHours += dt;
    energyKwh += (0.11 + 0.14) * dt + (899.0 * 3.72 * wp.segAscent) / (0.60 * 3.6e6);
    radDoseUsv += 20.0 * (1.0 + ((wp.z - (-4131.74)) / 3000.0) * 0.15) * dt;
  }

  let crismHits = 0;
  for (const cp of crismPixels) {
    if (waypoints.some(w => Math.hypot(cp.x - w.x, cp.y - w.y) <= 100.0)) crismHits++;
  }
  let markerHits = 0;
  for (const sm of sciMarkers) {
    if (waypoints.some(w => Math.hypot(sm.x - w.x, sm.y - w.y) <= 100.0)) markerHits++;
  }

  const sciScore = crismHits + markerHits;
  const riskScore = Math.min(
    100.0,
    (0.40 * pctMod + 2.0 * pctHaz + 0.35 * (maxSlope / 25.0) * 100.0 + 0.25 * (totAscent / 300.0) * 100.0) * 0.35
  );

  const profileStep = Math.max(1, Math.floor(n / 75));
  const elevationProfile = [];
  for (let i = 0; i < n; i += profileStep) {
    const w = waypoints[i];
    elevationProfile.push({ distKm: w.distM / 1000.0, elev: w.z, slope: w.slope, tier: w.tier, x: w.x, y: w.y });
  }
  if (n > 0 && elevationProfile[elevationProfile.length - 1].distKm !== waypoints[n - 1].distM / 1000.0) {
    const last = waypoints[n - 1];
    elevationProfile.push({ distKm: last.distM / 1000.0, elev: last.z, slope: last.slope, tier: last.tier, x: last.x, y: last.y });
  }

  return {
    waypoints,
    distKm: cumDist / 1000.0,
    ascentM: totAscent,
    netElevM: waypoints[n - 1].z - waypoints[0].z,
    maxSlopeDeg: maxSlope,
    pctEasy,
    pctMod,
    pctHaz,
    timeHours,
    energyKwh,
    radDoseUsv,
    sciScore,
    riskScore,
    elevationProfile
  };
}

function directedLengthOverlap(a, b, tolM) {
  let overlapLen = 0.0;
  let totalLen = 0.0;
  for (let i = 1; i < a.waypoints.length; i++) {
    const w = a.waypoints[i];
    const p = a.waypoints[i - 1];
    const seg = Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z);
    totalLen += seg;
    let minD = Infinity;
    for (const wb of b.waypoints) {
      const d = Math.hypot(w.x - wb.x, w.y - wb.y);
      if (d < minD) minD = d;
    }
    if (minD <= tolM) overlapLen += seg;
  }
  return overlapLen / totalLen;
}

function summarizeTargets(candidate, sciTargets) {
  return sciTargets.map(t => {
    let minD = Infinity;
    for (const w of candidate.waypoints) {
      const d = Math.hypot(w.x - t.x, w.y - t.y);
      if (d < minD) minD = d;
    }
    return {
      sol: t.sol,
      title: t.title,
      minDistM: Number(minD.toFixed(1)),
      within100m: minD <= 100.0
    };
  });
}

function main() {
  const rawHeights = loadFloatGrid('public/data/terrain_height.bin');
  const rawSlopes = loadFloatGrid('public/data/slope_5m.bin');
  const routeData = JSON.parse(fs.readFileSync('public/data/route.json', 'utf8'));
  const routePoints = routeData.points;
  const workerCode = fs.readFileSync('src/routeWorker.js', 'utf8');

  // Subsample 1025x1025 -> 257x257 identically to src/main.js:initRouteWorker()
  const subH = new Float32Array(GRID_SUB * GRID_SUB);
  const subS = new Float32Array(GRID_SUB * GRID_SUB);
  for (let r = 0; r < GRID_SUB; r++) {
    const origR = r * 4;
    for (let c = 0; c < GRID_SUB; c++) {
      const origC = c * 4;
      subH[r * GRID_SUB + c] = rawHeights[origR * GRID_FULL + origC];
      subS[r * GRID_SUB + c] = rawSlopes[origR * GRID_FULL + origC];
    }
  }

  // Precompute CRISM 27x28 pixel centers identically to src/main.js
  const crismPixels = [];
  for (let cy = 0; cy < 28; cy++) {
    for (let cx = 0; cx < 27; cx++) {
      crismPixels.push({
        x: (cx + 0.5) * (TERRAIN_WIDTH_M / 27.0),
        y: (28 - 1 - cy + 0.5) * (TERRAIN_HEIGHT_M / 28.0)
      });
    }
  }

  // Start (Sol 3721 entry from route.json)
  const p0 = routePoints[0];
  const start = {
    x: p0.x,
    y: p0.y,
    elevation: p0.elevation,
    sol: p0.sol,
    lon: p0.lon,
    lat: p0.lat,
    slopeDeg: Number(sampleGridBilinear(rawSlopes, p0.x, p0.y).toFixed(2)),
    role: 'North Edge Route Entry (Sol 3721)',
    roleSource: 'game',
    source: 'measured'
  };

  // Goal (Center of Boxwork core zone sols 4600-4805, matching src/main.js)
  const goalLonLat = localToLonLat(2432.1, 2479.0);
  const goal = {
    x: 2432.1,
    y: 2479.0,
    elevation: Number(sampleGridBilinear(rawHeights, 2432.1, 2479.0).toFixed(2)),
    lon: goalLonLat.lon,
    lat: goalLonLat.lat,
    slopeDeg: Number(sampleGridBilinear(rawSlopes, 2432.1, 2479.0).toFixed(2)),
    coreZoneBounds: { xMin: 2355.6, xMax: 2508.6, yMin: 2337.5, yMax: 2620.5, sols: '4600-4805', source: 'measured' },
    role: 'Center of Boxwork Core Zone',
    roleSource: 'game',
    source: 'measured'
  };

  // 3 Science targets grounded in route.json + SCIENCE_TARGETS in src/main.js
  const targetDefs = [
    { id: 'target-1', sol: 4534, label: 'Sol 4534', title: 'Boxwork campaign begins (Phase 1)', verificationStatus: 'to verify against NASA' },
    { id: 'target-2', sol: 4602, label: 'Sols 4602-4603', title: 'Top of the ridge, start of the main boxwork region', verificationStatus: 'to verify against NASA' },
    { id: 'target-3', sol: 4716, label: 'Sols 4716-4722', title: 'Nevado Sajama drill', verificationStatus: 'to verify against NASA' }
  ];

  const scienceTargets = targetDefs.map(def => {
    const nearest = routePoints.reduce((a, b) => Math.abs(b.sol - def.sol) < Math.abs(a.sol - def.sol) ? b : a);
    return {
      id: def.id,
      sol: def.sol,
      nearestRouteSol: nearest.sol,
      label: def.label,
      title: def.title,
      x: nearest.x,
      y: nearest.y,
      elevation: nearest.elevation,
      lon: nearest.lon,
      lat: nearest.lat,
      slopeDeg: Number(sampleGridBilinear(rawSlopes, nearest.x, nearest.y).toFixed(2)),
      verificationStatus: def.verificationStatus,
      source: 'measured'
    };
  });

  // 1) Baseline check (no intermediate waypoints) to confirm >80% overlap finding
  const baselineRes = runWorkerOnce(workerCode, {
    type: 'init',
    gridSize: GRID_SUB,
    heights: subH.buffer.slice(0),
    slopes: subS.buffer.slice(0),
    sciMarkers: scienceTargets,
    crismPixels,
    start: { x: start.x, y: start.y },
    goal: { x: goal.x, y: goal.y }
  });

  const baseA = baselineRes.candidates.find(c => c.id === 'safest');
  const baseB = baselineRes.candidates.find(c => c.id === 'shortest');
  const baseC = baselineRes.candidates.find(c => c.id === 'science');

  console.log('\n--- BASELINE A* WORKER OUTPUT (NO WAYPOINTS) ---');
  for (const [alias, c] of [['Route A (safest)', baseA], ['Route B (shortest)', baseB], ['Route C (science)', baseC]]) {
    const tHits = summarizeTargets(c, scienceTargets).map(h => `Sol ${h.sol}: ${h.within100m ? 'YES' : 'NO'} (${h.minDistM}m)`).join(', ');
    console.log(`${alias} | dist=${c.distKm.toFixed(2)} km | E/M/H=${c.pctEasy.toFixed(1)}%/${c.pctMod.toFixed(1)}%/${c.pctHaz.toFixed(1)}% | max=${c.maxSlopeDeg.toFixed(1)}° | ${tHits}`);
  }
  console.log('Baseline shortest<->science 60m overlap:', `${(directedLengthOverlap(baseB, baseC, 60) * 100).toFixed(1)}% / ${(directedLengthOverlap(baseC, baseB, 60) * 100).toFixed(1)}%`);
  console.log('Baseline shortest<->science 100m overlap:', `${(directedLengthOverlap(baseB, baseC, 100) * 100).toFixed(1)}% / ${(directedLengthOverlap(baseC, baseB, 100) * 100).toFixed(1)}%`);

  // 2) Fixed Level 1 settings using real western CRISM phyllosilicate pixel center (cx=12, cy=2) + 3 science targets as waypoints for Route C (science)
  const crismWestStation = {
    x: Number(((12 + 0.5) * (TERRAIN_WIDTH_M / 27.0)).toFixed(2)),
    y: Number(((28 - 1 - 2 + 0.5) * (TERRAIN_HEIGHT_M / 28.0)).toFixed(2)),
    label: 'Western CRISM Phyllosilicate Pixel Center (cx=12, cy=2)'
  };

  const sciWaypoints = [
    { x: start.x, y: start.y },
    { x: crismWestStation.x, y: crismWestStation.y },
    { x: scienceTargets[0].x, y: scienceTargets[0].y },
    { x: scienceTargets[1].x, y: scienceTargets[1].y },
    { x: scienceTargets[2].x, y: scienceTargets[2].y },
    { x: goal.x, y: goal.y }
  ];

  const sciSegments = [];
  for (let i = 0; i < sciWaypoints.length - 1; i++) {
    const segRes = runWorkerOnce(workerCode, {
      type: 'init',
      gridSize: GRID_SUB,
      heights: subH.buffer.slice(0),
      slopes: subS.buffer.slice(0),
      sciMarkers: scienceTargets,
      crismPixels,
      start: sciWaypoints[i],
      goal: sciWaypoints[i + 1]
    });
    const segSci = segRes.candidates.find(c => c.id === 'science');
    if (!segSci || segSci.error) {
      throw new Error(`Science segment ${i} failed`);
    }
    sciSegments.push(segSci);
  }
  const tunedC = stitchSegments(sciSegments, scienceTargets, crismPixels);

  console.log('\n--- FINAL FIXED WORKER ROUTES (WITH WAYPOINT SETTINGS FOR ROUTE C) ---');
  for (const [alias, c] of [['Route A (safest)', baseA], ['Route B (shortest)', baseB], ['Route C (science)', tunedC]]) {
    const tHits = summarizeTargets(c, scienceTargets).map(h => `Sol ${h.sol}: ${h.within100m ? 'YES' : 'NO'} (${h.minDistM}m)`).join(', ');
    console.log(`${alias} | dist=${c.distKm.toFixed(2)} km | E/M/H=${c.pctEasy.toFixed(1)}%/${c.pctMod.toFixed(1)}%/${c.pctHaz.toFixed(1)}% | max=${c.maxSlopeDeg.toFixed(1)}° | ${tHits}`);
  }
  for (const [name, u, v] of [['A vs B', baseA, baseB], ['A vs C', baseA, tunedC], ['B vs C', baseB, tunedC]]) {
    const o20 = Math.max(directedLengthOverlap(u, v, 20), directedLengthOverlap(v, u, 20)) * 100;
    const o50 = Math.max(directedLengthOverlap(u, v, 50), directedLengthOverlap(v, u, 50)) * 100;
    const o100 = Math.max(directedLengthOverlap(u, v, 100), directedLengthOverlap(v, u, 100)) * 100;
    console.log(`Max overlap ${name}: <=20m ${o20.toFixed(1)}%, <=50m ${o50.toFixed(1)}%, <=100m ${o100.toFixed(1)}%`);
  }

  // Reference route metrics (exact values from route.json + slope_5m.bin)
  let refDistM = 0.0;
  let refAscentM = 0.0;
  let refMaxSlope = 0.0;
  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    const sl = sampleGridBilinear(rawSlopes, pt.x, pt.y);
    if (sl > refMaxSlope) refMaxSlope = sl;
    if (i > 0) {
      const prev = routePoints[i - 1];
      refDistM += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.elevation - prev.elevation);
      if (pt.elevation > prev.elevation) refAscentM += pt.elevation - prev.elevation;
    }
  }

  function formatCandidate(aliasId, blindLabel, blindColor, trueName, strategyMode, bestFor, raw, waypointList) {
    return {
      id: aliasId,
      blindLabel,
      blindColor,
      trueName,
      strategyMode,
      bestFor,
      source: 'game',
      workerWaypoints: waypointList,
      scienceTargetsHit: summarizeTargets(raw, scienceTargets),
      metrics: {
        distKm: { value: Number(raw.distKm.toFixed(3)), source: 'measured' },
        ascentM: { value: Number(raw.ascentM.toFixed(1)), source: 'measured' },
        netElevM: { value: Number(raw.netElevM.toFixed(1)), source: 'measured' },
        maxSlopeDeg: { value: Number(raw.maxSlopeDeg.toFixed(1)), source: 'measured' },
        pctEasy: { value: Number(raw.pctEasy.toFixed(1)), source: 'measured (derived from DEM)', thresholdRuleSource: 'game' },
        pctMod: { value: Number(raw.pctMod.toFixed(1)), source: 'measured (derived from DEM)', thresholdRuleSource: 'game' },
        pctHaz: { value: Number(raw.pctHaz.toFixed(1)), source: 'measured (derived from DEM)', thresholdRuleSource: 'game' },
        timeHours: { value: Number(raw.timeHours.toFixed(1)), source: 'game', tag: 'SIM' },
        energyKwh: { value: Number(raw.energyKwh.toFixed(2)), source: 'game', tag: 'SIM' },
        radDoseUsv: { value: Math.round(raw.radDoseUsv), source: 'game', tag: 'SIM' },
        riskScore: { value: Number(raw.riskScore.toFixed(1)), source: 'game', tag: 'SIM' },
        sciScore: { value: raw.sciScore, source: 'game' }
      },
      waypoints: raw.waypoints.map(w => ({
        x: Number(w.x.toFixed(2)),
        y: Number(w.y.toFixed(2)),
        z: Number(w.z.toFixed(2)),
        slope: Number(w.slope.toFixed(2)),
        tier: w.tier,
        distM: Number(w.distM.toFixed(2))
      })),
      elevationProfile: raw.elevationProfile.map(p => ({
        distKm: Number(p.distKm.toFixed(4)),
        elev: Number(p.elev.toFixed(2)),
        slope: Number(p.slope.toFixed(2)),
        tier: p.tier,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2))
      }))
    };
  }

  const level01 = {
    id: { value: 'level01', source: 'game' },
    title: { value: 'Level 1: Approach to the Boxwork Core', source: 'game' },
    story: {
      value:
        'Curiosity entered this 5 km × 5 km sector of Mount Sharp at Sol 3721 on the northern edge (-3,857.5 m) and climbed toward the Sols 4600–4805 boxwork core zone (-3,617.1 m). Analyze the orbital DEM slope map, CRISM mineral spectra, and THEMIS thermal imagery to select one of three candidate traverses (Route A, Route B, or Route C) before locking in your plan.',
      source: 'game'
    },
    start,
    goal,
    scienceTargets,
    workerSettings: {
      source: 'game',
      workerFile: 'src/routeWorker.js',
      gridSize: GRID_SUB,
      maxTraversableSlopeDeg: 25.0,
      crismGridDimensions: [27, 28],
      routeMappings: {
        'route-a': 'safest',
        'route-b': 'shortest',
        'route-c': 'science'
      },
      crismScienceWaypoint: { ...crismWestStation, source: 'measured' }
    },
    candidateRoutes: [
      formatCandidate('route-a', 'Route A', '#38bdf8', 'Safest', 'safest', 'Safest', baseA, [{ x: start.x, y: start.y }, { x: goal.x, y: goal.y }]),
      formatCandidate('route-b', 'Route B', '#c084fc', 'Shortest', 'shortest', 'Fastest', baseB, [{ x: start.x, y: start.y }, { x: goal.x, y: goal.y }]),
      formatCandidate('route-c', 'Route C', '#fb923c', 'Science-rich', 'science', 'Most science', tunedC, sciWaypoints)
    ],
    referenceRoute: {
      id: 'curiosity-reference',
      label: 'Curiosity Actual Traverse (Sols 3721–4868)',
      dataFile: '/data/route.json',
      source: 'measured',
      solMin: routeData.sol_min,
      solMax: routeData.sol_max,
      totalPoints: routeData.total_points,
      metrics: {
        distKm: Number((refDistM / 1000.0).toFixed(3)),
        ascentM: Number(refAscentM.toFixed(1)),
        netElevM: Number((routePoints[routePoints.length - 1].elevation - routePoints[0].elevation).toFixed(1)),
        maxSlopeDeg: Number(refMaxSlope.toFixed(1)),
        source: 'measured'
      },
      points: routePoints
    }
  };

  fs.mkdirSync(path.dirname('src/game/levels/level01.json'), { recursive: true });
  fs.writeFileSync('src/game/levels/level01.json', JSON.stringify(level01, null, 2));
  console.log('\nSaved src/game/levels/level01.json successfully.');
}

main();
