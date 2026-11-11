/**
 * Background Web Worker for full-resolution (1025 x 1025, ~4.88 m/px) DEM terrain analysis:
 * 1) Sun & Power: directional hillshade + ray-marched cast shadows for Morning / Noon / Evening.
 * 2) Radiation Shelter: Sky-View Factor (SVF) across 12 azimuths using cache-coherent linear scans.
 * Results are returned once as transferable RGBA buffers and cached on the main thread.
 */

const SVF_SHELTER_THRESHOLD = 0.85;

const SUN_PRESETS = {
  morning: { elevDeg: 22.0, azDeg: 80.0 },
  noon: { elevDeg: 68.0, azDeg: 350.0 },
  evening: { elevDeg: 18.0, azDeg: 275.0 }
};

let heights = null;
let N = 1025;
let terrainWidthM = 5000.0;
let stepM = terrainWidthM / (N - 1);
let routes = [];

const queue = ['sun:morning', 'sun:noon', 'sun:evening', 'svf'];
const completed = new Set();
let isRunning = false;

function lerpRgb(c0, c1, t) {
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * t),
    Math.round(c0[1] + (c1[1] - c0[1]) * t),
    Math.round(c0[2] + (c1[2] - c0[2]) * t)
  ];
}

function sampleStops(stops, t) {
  const ct = Math.max(0.0, Math.min(1.0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    if (ct <= stops[i + 1].p) {
      const span = stops[i + 1].p - stops[i].p;
      const f = span > 0 ? (ct - stops[i].p) / span : 0;
      return lerpRgb(stops[i].c, stops[i + 1].c, f);
    }
  }
  return stops[stops.length - 1].c;
}

function sampleGridNearest(grid, lx, ly) {
  const c = Math.max(0, Math.min(N - 1, Math.round((lx / terrainWidthM) * (N - 1))));
  const r = Math.max(0, Math.min(N - 1, Math.round((1.0 - ly / terrainWidthM) * (N - 1))));
  return grid[r * N + c];
}

function computeSunJob(presetKey) {
  const preset = SUN_PRESETS[presetKey];
  const elRad = (preset.elevDeg * Math.PI) / 180.0;
  const azRad = (preset.azDeg * Math.PI) / 180.0;

  const dxU = Math.sin(azRad);
  const dyU = Math.cos(azRad);
  const sx = Math.cos(elRad) * dxU;
  const sy = Math.cos(elRad) * dyU;
  const sz = Math.sin(elRad);
  const tanEl = Math.tan(elRad);

  const total = N * N;
  const illumGrid = new Float32Array(total);
  const shadowed = new Uint8Array(total);

  // 1. Direct hillshade incidence pass (linear scan)
  for (let r = 0; r < N; r++) {
    const rPrev = r > 0 ? r - 1 : 0;
    const rNext = r < N - 1 ? r + 1 : N - 1;
    const spanY = (rNext - rPrev) * stepM;
    const rowBase = r * N;

    for (let c = 0; c < N; c++) {
      const cPrev = c > 0 ? c - 1 : 0;
      const cNext = c < N - 1 ? c + 1 : N - 1;
      const spanX = (cNext - cPrev) * stepM;

      const dzdx = (heights[rowBase + cNext] - heights[rowBase + cPrev]) / spanX;
      const dzdy = (heights[rPrev * N + c] - heights[rNext * N + c]) / spanY;

      const invLen = 1.0 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
      const dot = (-dzdx * sx - dzdy * sy + sz) * invLen;
      const idx = rowBase + c;
      if (dot <= 0.02) {
        shadowed[idx] = 1;
      } else {
        illumGrid[idx] = Math.min(1.0, dot);
      }
    }
  }

  // 2. Cache-coherent sequential cast-shadow pass along sun azimuth
  const radii = [1, 2, 3, 5, 7, 10, 14, 19, 26, 35, 47, 62, 82, 108, 142, 185, 240];
  for (let i = 0; i < radii.length; i++) {
    const dc = Math.round(dxU * radii[i]);
    const dr = Math.round(-dyU * radii[i]);
    const distM = Math.hypot(dc, dr) * stepM;
    if (distM <= 0) continue;
    const threshDz = distM * tanEl;

    const rStart = Math.max(0, -dr);
    const rEnd = Math.min(N, N - dr);
    const cStart = Math.max(0, -dc);
    const cEnd = Math.min(N, N - dc);

    for (let r = rStart; r < rEnd; r++) {
      const rowBase = r * N;
      const srcBase = (r + dr) * N + dc;
      for (let c = cStart; c < cEnd; c++) {
        const idx = rowBase + c;
        if (!shadowed[idx] && heights[srcBase + c] - heights[idx] > threshDz) {
          shadowed[idx] = 1;
        }
      }
    }
  }

  // 3. Encode RGBA texture & route stats
  const sunStops = [
    { p: 0.0, c: [24, 59, 122] },
    { p: 0.35, c: [70, 114, 148] },
    { p: 0.68, c: [199, 180, 92] },
    { p: 1.0, c: [255, 213, 74] }
  ];

  const rgba = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i++) {
    const val = shadowed[i] ? 0.0 : illumGrid[i];
    illumGrid[i] = val;
    const rgb = sampleStops(sunStops, val);
    const o = i * 4;
    rgba[o] = rgb[0];
    rgba[o + 1] = rgb[1];
    rgba[o + 2] = rgb[2];
    rgba[o + 3] = 255;
  }

  const routeStats = {};
  routes.forEach(rt => {
    const wps = rt.waypoints || [];
    const n = wps.length;
    if (!n) {
      routeStats[rt.id] = { avgIllumPct: 0, shadowPct: 0 };
      return;
    }
    let sum = 0;
    let shadowHits = 0;
    for (let i = 0; i < n; i++) {
      const v = sampleGridNearest(illumGrid, wps[i].x, wps[i].y);
      sum += v;
      if (v < 0.15) shadowHits++;
    }
    routeStats[rt.id] = {
      avgIllumPct: (sum / n) * 100.0,
      shadowPct: (shadowHits / n) * 100.0
    };
  });

  self.postMessage(
    {
      type: 'sunResult',
      preset: presetKey,
      gridSize: N,
      rgbaBuffer: rgba.buffer,
      routeStats
    },
    [rgba.buffer]
  );
}

function computeSvfJob() {
  const nAz = 12;
  const radii = [1, 2, 4, 7, 12, 19, 30, 46, 70, 105, 155, 225];
  const total = N * N;

  const sinAccum = new Float32Array(total);
  const bestTan = new Float32Array(total);

  // Outer loop by azimuth + radius step so inner loop streams contiguously in L1/L2 cache
  for (let k = 0; k < nAz; k++) {
    bestTan.fill(0.0);
    const ang = (2.0 * Math.PI * k) / nAz;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);

    for (let s = 0; s < radii.length; s++) {
      const dc = Math.round(dx * radii[s]);
      const dr = Math.round(-dy * radii[s]);
      const distM = Math.hypot(dc, dr) * stepM;
      if (distM <= 0) continue;
      const invDist = 1.0 / distM;

      const rStart = Math.max(0, -dr);
      const rEnd = Math.min(N, N - dr);
      const cStart = Math.max(0, -dc);
      const cEnd = Math.min(N, N - dc);

      for (let r = rStart; r < rEnd; r++) {
        const rowBase = r * N;
        const srcBase = (r + dr) * N + dc;
        for (let c = cStart; c < cEnd; c++) {
          const dz = heights[srcBase + c] - heights[rowBase + c];
          if (dz > 0.0) {
            const tanVal = dz * invDist;
            const idx = rowBase + c;
            if (tanVal > bestTan[idx]) bestTan[idx] = tanVal;
          }
        }
      }
    }

    // One sin(atan(t)) conversion per azimuth instead of per radial step
    for (let i = 0; i < total; i++) {
      const t = bestTan[i];
      if (t > 0.0) sinAccum[i] += t / Math.sqrt(1.0 + t * t);
    }
  }

  const svfStops = [
    { p: 0.0, c: [20, 107, 58] },
    { p: 0.38, c: [46, 122, 109] },
    { p: 0.72, c: [155, 72, 157] },
    { p: 1.0, c: [232, 50, 201] }
  ];

  const svfGrid = new Float32Array(total);
  const rgba = new Uint8ClampedArray(total * 4);
  const invAz = 1.0 / nAz;

  for (let i = 0; i < total; i++) {
    const svf = Math.max(0.0, Math.min(1.0, 1.0 - sinAccum[i] * invAz));
    svfGrid[i] = svf;
    const t = (svf - 0.54) / (0.98 - 0.54);
    const rgb = sampleStops(svfStops, t);
    const o = i * 4;
    rgba[o] = rgb[0];
    rgba[o + 1] = rgb[1];
    rgba[o + 2] = rgb[2];
    rgba[o + 3] = 255;
  }

  const routeStats = {};
  routes.forEach(rt => {
    const wps = rt.waypoints || [];
    const n = wps.length;
    if (!n) {
      routeStats[rt.id] = { avgSvf: 0, shelteredPct: 0 };
      return;
    }
    let sum = 0;
    let shelterHits = 0;
    for (let i = 0; i < n; i++) {
      const v = sampleGridNearest(svfGrid, wps[i].x, wps[i].y);
      sum += v;
      if (v < SVF_SHELTER_THRESHOLD) shelterHits++;
    }
    routeStats[rt.id] = {
      avgSvf: sum / n,
      shelteredPct: (shelterHits / n) * 100.0
    };
  });

  self.postMessage(
    {
      type: 'svfResult',
      gridSize: N,
      rgbaBuffer: rgba.buffer,
      routeStats
    },
    [rgba.buffer]
  );
}

function processNextJob() {
  if (!heights || queue.length === 0) {
    isRunning = false;
    return;
  }
  isRunning = true;
  const job = queue.shift();
  if (completed.has(job)) {
    setTimeout(processNextJob, 0);
    return;
  }
  completed.add(job);

  if (job.startsWith('sun:')) {
    computeSunJob(job.slice(4));
  } else if (job === 'svf') {
    computeSvfJob();
  }

  setTimeout(processNextJob, 0);
}

self.onmessage = function (e) {
  const msg = e.data;
  if (msg.type === 'init') {
    N = msg.gridSize || 1025;
    terrainWidthM = msg.terrainWidthM || 5000.0;
    stepM = terrainWidthM / (N - 1);
    heights = new Float32Array(msg.heightsBuffer);
    routes = msg.routes || [];
    if (!isRunning) setTimeout(processNextJob, 0);
  } else if (msg.type === 'prioritize') {
    const job = msg.job;
    if (!completed.has(job)) {
      const idx = queue.indexOf(job);
      if (idx > -1) queue.splice(idx, 1);
      queue.unshift(job);
      if (!isRunning && heights) setTimeout(processNextJob, 0);
    }
  }
};
