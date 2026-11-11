/**
 * Decision Lenses (6 MISSION-mode full-terrain lenses), DEM Geomorphometry,
 * CRISM MRDR t0902 Pixel Clustering, and Precomputed Route Lens Metrics.
 * Strictly respects AGENTS.md provenance rules: all values computed from public/data/.
 */

import * as THREE from 'three';

const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;
const DEM_GRID_SIZE = 1025;
const SUB_GRID_SIZE = 257;
const CRISM_W = 27;
const CRISM_H = 28;
const THEMIS_W = 50;
const THEMIS_H = 50;

export const THEMIS_MIN_DN = 32;
export const THEMIS_MAX_DN = 255;
export const THEMIS_MEDIAN_DN = 156;
export const SVF_SHELTER_THRESHOLD = 0.85;

// Python-verified CRISM reference benchmarks for dev-only self-check
const PYTHON_CRISM_BENCHMARK = Object.freeze({
  'route-a': { label: 'Route A', phyPct: 6.7, hydHighPct: 28.4 },
  'route-b': { label: 'Route B', phyPct: 19.2, hydHighPct: 30.0 },
  'route-c': { label: 'Route C', phyPct: 37.6, hydHighPct: 32.0 }
});

export const SUN_PRESETS = Object.freeze({
  morning: { key: 'morning', label: 'Morning', note: '' },
  noon: { key: 'noon', label: 'Noon', note: 'Sun is near overhead at this latitude, so shadows are short' },
  evening: { key: 'evening', label: 'Evening', note: '' }
});

export const LENS_CONFIG = Object.freeze({
  satellite: {
    id: 'satellite',
    name: 'Satellite',
    question: 'What does the ground look like?',
    targetDesaturate: 0.0,
    targetDim: 1.0,
    targetExag: 1.0,
    rampCss: 'linear-gradient(90deg, #5e4336 0%, #9b6c52 50%, #cfb096 100%)',
    rampUnits: 'HiRISE ~2 m/px orbital albedo',
    rampMin: 'Dark basalt',
    rampMid: 'Bedrock',
    rampMax: 'Bright dust',
    swatches: [
      { kind: 'outline', color: '#eb4c42', label: 'Thin red outline: steep >25° hazard perimeter (game rule / DEM)' }
    ],
    caveat: 'Natural HiRISE mosaic (~2 m/px); steep hazards outlined only, no red fill.',
    stripCaveat: 'HiRISE orbital context (~2 m/px); distances and ascent measured from DEM.'
  },
  terrain: {
    id: 'terrain',
    name: 'Terrain',
    question: 'Where is it too steep to walk?',
    targetDesaturate: 0.90,
    targetDim: 0.45,
    targetExag: 1.5,
    rampCss: 'linear-gradient(90deg, #1c8a4c 0%, #2ecc71 38%, #f1c40f 65%, #e74c3c 88%, #ff3a2e 100%)',
    rampUnits: 'Degrees slope + 25 m elevation contours',
    rampMin: '0°',
    rampMid: '15°–25°',
    rampMax: '≥35°',
    swatches: [
      { kind: 'box', color: '#2ecc71', label: '< 15° Easy · 15°–25° Moderate · 25 m DEM contours' },
      { kind: 'box', color: '#ff3a2e', label: '> 25° Steep hazard (soft pulse, 1.5× vertical relief)' }
    ],
    caveat: 'Slopes derived from ~4.9 m DEM; 15°/25° thresholds are game rules.',
    stripCaveat: 'Slopes derived from DEM (~4.9 m); 15° / 25° tiers are game rules.'
  },
  minerals: {
    id: 'minerals',
    name: 'Minerals',
    question: 'Where are the science-rich areas?',
    targetDesaturate: 1.0,
    targetDim: 0.40,
    targetExag: 1.0,
    rampCss: 'linear-gradient(90deg, #555555 0%, #f24dff 48%, #00f5d4 100%)',
    rampUnits: 'CRISM MRDR t0902 orbital channels',
    rampMin: '40% Gray',
    rampMid: 'Clay (Phy)',
    rampMax: 'Hydrated/Sulf',
    swatches: [
      { kind: 'glow', color: '#f24dff', label: 'Clay-bearing (phyllosilicate) indicator · vivid violet glow' },
      { kind: 'glow', color: '#00f5d4', label: 'Hydrated / sulfate indicator (RGB sum ≥ 120) · cyan glow' }
    ],
    caveat: '~180 m pixels, orbital indicators',
    stripCaveat: '~180 m pixels, orbital indicators'
  },
  heat: {
    id: 'heat',
    name: 'Heat',
    question: 'Where is rock vs dust likely?',
    targetDesaturate: 0.85,
    targetDim: 0.35,
    targetExag: 1.0,
    rampCss: 'linear-gradient(90deg, #16103b 0%, #6c1d6e 30%, #c83e4b 56%, #f58c28 80%, #fff078 100%)',
    rampUnits: '32–255 DN — relative brightness, not temperature',
    rampMin: '32 DN',
    rampMid: '156 median',
    rampMax: '255 DN',
    swatches: [
      { kind: 'box', color: '#f58c28', label: '32–255 DN THEMIS daytime IR (relative brightness, not temperature)' }
    ],
    caveat: '32–255 DN relative brightness, not temperature (~100 m pixels).',
    stripCaveat: 'differences between routes are small; THEMIS is ~100 m per pixel and may be offset by 150-275 m'
  },
  sun: {
    id: 'sun',
    name: 'Sun & Power',
    question: 'Where is direct illumination vs cast shadow?',
    targetDesaturate: 0.80,
    targetDim: 0.45,
    targetExag: 1.0,
    rampCss: 'linear-gradient(90deg, #183b7a 0%, #467294 35%, #c7b45c 68%, #ffd54a 100%)',
    rampUnits: '% Surface solar illumination (0–100%)',
    rampMin: '0% Shadow',
    rampMid: '50% Oblique',
    rampMax: '100% Lit',
    swatches: [
      { kind: 'box', color: '#ffd54a', label: 'Lit ground (high solar incidence)' },
      { kind: 'box', color: '#183b7a', label: 'Cast / terrain shadow' }
    ],
    caveat: 'derived from DEM; sun position SIM',
    stripCaveat: 'derived from DEM; sun position SIM'
  },
  radiation: {
    id: 'radiation',
    name: 'Radiation Shelter',
    question: 'Where does terrain shield open-sky exposure?',
    targetDesaturate: 0.80,
    targetDim: 0.45,
    targetExag: 1.0,
    rampCss: 'linear-gradient(90deg, #146b3a 0%, #2e7a6d 38%, #9b489d 72%, #e832c9 100%)',
    rampUnits: 'Sky-View Factor (SVF 0.0–1.0) · SVF < 0.85 sheltered: game rule',
    rampMin: '0.54 Sheltered',
    rampMid: '0.85 game rule',
    rampMax: '1.00 Exposed',
    swatches: [
      { kind: 'box', color: '#146b3a', label: 'Sheltered cells (SVF < 0.85 · game rule)' },
      { kind: 'box', color: '#e832c9', label: 'Exposed crests / open sky (SVF → 1.0)' }
    ],
    caveat: 'SIM proxy from terrain, not a measured dose map',
    stripCaveat: 'SIM proxy from terrain, not a measured dose map · SVF < 0.85 sheltered: game rule'
  }
});

/** Extract pixel RGBA buffer once from a loaded texture image. */
export function extractImageRGBA(image, fallbackW, fallbackH) {
  const w = image?.width || image?.videoWidth || fallbackW;
  const h = image?.height || image?.videoHeight || fallbackH;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  return {
    width: w,
    height: h,
    data: ctx.getImageData(0, 0, w, h).data
  };
}

function makeCanvasTexture(canvas, { nearest = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (nearest) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
  } else {
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.needsUpdate = true;
  return tex;
}

/** Build a Three.js DataTexture directly from a worker-generated top-down RGBA buffer. */
export function buildDataTextureFromWorkerBuffer(rgbaBuffer, gridSize) {
  const tex = new THREE.DataTexture(
    new Uint8ClampedArray(rgbaBuffer),
    gridSize,
    gridSize,
    THREE.RGBAFormat
  );
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

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

/**
 * Satellite lens overlay: thin red perimeter outline ONLY where slope > 25°, no red fill.
 */
export function buildSlopeHazardOutlineTexture(rawSlopes) {
  const size = 512;
  const mask = new Uint8Array(size * size);

  for (let py = 0; py < size; py++) {
    const r0 = Math.min(DEM_GRID_SIZE - 1, Math.floor((py / size) * (DEM_GRID_SIZE - 1)));
    const r1 = Math.min(DEM_GRID_SIZE - 1, r0 + 1);
    for (let px = 0; px < size; px++) {
      const c0 = Math.min(DEM_GRID_SIZE - 1, Math.floor((px / size) * (DEM_GRID_SIZE - 1)));
      const c1 = Math.min(DEM_GRID_SIZE - 1, c0 + 1);
      const maxS = Math.max(
        rawSlopes[r0 * DEM_GRID_SIZE + c0],
        rawSlopes[r0 * DEM_GRID_SIZE + c1],
        rawSlopes[r1 * DEM_GRID_SIZE + c0],
        rawSlopes[r1 * DEM_GRID_SIZE + c1]
      );
      if (maxS > 25.0) mask[py * size + px] = 1;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const out = imgData.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = py * size + px;
      if (!mask[idx]) continue;

      const isEdge =
        px === 0 || px === size - 1 || py === 0 || py === size - 1 ||
        !mask[idx - 1] || !mask[idx + 1] || !mask[idx - size] || !mask[idx + size];
      if (!isEdge) continue;

      const o = idx * 4;
      out[o] = 242;
      out[o + 1] = 82;
      out[o + 2] = 72;
      out[o + 3] = 220;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return makeCanvasTexture(canvas, { nearest: false });
}

/**
 * Terrain lens textures:
 * 1) Full-opacity continuous slope ramp (green <15°, yellow 15–25°, red >25°) + 25 m elevation contours.
 * 2) Steep >25° highlight mask for subtle pulsing emphasis.
 */
export function buildTerrainSlopeAndContourTextures(rawHeights, rawSlopes) {
  const size = 512;
  const rampCanvas = document.createElement('canvas');
  rampCanvas.width = size;
  rampCanvas.height = size;
  const rampCtx = rampCanvas.getContext('2d');
  const rampData = rampCtx.createImageData(size, size);
  const rOut = rampData.data;

  const greenLow = [28, 138, 76];
  const greenHi = [46, 204, 113];
  const yellowLow = [232, 202, 24];
  const yellowHi = [243, 156, 18];
  const redLow = [218, 60, 48];
  const redHi = [255, 58, 46];

  const bandGrid = new Int16Array(size * size);
  for (let py = 0; py < size; py++) {
    const gr = Math.min(DEM_GRID_SIZE - 1, Math.floor((py / size) * (DEM_GRID_SIZE - 1)));
    const rowOff = gr * DEM_GRID_SIZE;
    for (let px = 0; px < size; px++) {
      const gc = Math.min(DEM_GRID_SIZE - 1, Math.floor((px / size) * (DEM_GRID_SIZE - 1)));
      bandGrid[py * size + px] = Math.floor(rawHeights[rowOff + gc] / 25.0);
    }
  }

  for (let py = 0; py < size; py++) {
    const gr = Math.min(DEM_GRID_SIZE - 1, Math.floor((py / size) * (DEM_GRID_SIZE - 1)));
    const rowOff = gr * DEM_GRID_SIZE;
    for (let px = 0; px < size; px++) {
      const gc = Math.min(DEM_GRID_SIZE - 1, Math.floor((px / size) * (DEM_GRID_SIZE - 1)));
      const slope = rawSlopes[rowOff + gc];
      let rgb;
      if (slope < 15.0) {
        rgb = lerpRgb(greenLow, greenHi, slope / 15.0);
      } else if (slope <= 25.0) {
        rgb = lerpRgb(yellowLow, yellowHi, (slope - 15.0) / 10.0);
      } else {
        rgb = lerpRgb(redLow, redHi, Math.min(1.0, (slope - 25.0) / 15.0));
      }

      const idx = py * size + px;
      const b = bandGrid[idx];
      const isContour =
        (px + 1 < size && bandGrid[idx + 1] !== b) ||
        (py + 1 < size && bandGrid[idx + size] !== b);

      let rr = rgb[0];
      let gg = rgb[1];
      let bb = rgb[2];
      if (isContour) {
        const isMajor = (b % 4) === 0;
        const mix = isMajor ? 0.72 : 0.48;
        rr = Math.round(rr * (1.0 - mix) + 12 * mix);
        gg = Math.round(gg * (1.0 - mix) + 16 * mix);
        bb = Math.round(bb * (1.0 - mix) + 22 * mix);
      }

      const o = idx * 4;
      rOut[o] = rr;
      rOut[o + 1] = gg;
      rOut[o + 2] = bb;
      rOut[o + 3] = 255;
    }
  }

  rampCtx.putImageData(rampData, 0, 0);
  return {
    rampTex: makeCanvasTexture(rampCanvas, { nearest: false })
  };
}

/**
 * Minerals lens texture: two vivid distinct CRISM colors (clay + hydrated) with soft radial glow.
 */
export function buildMineralsGlowTexture(hydImg, phyImg) {
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = CRISM_W;
  rawCanvas.height = CRISM_H;
  const rawCtx = rawCanvas.getContext('2d');
  const rawData = rawCtx.createImageData(CRISM_W, CRISM_H);
  const out = rawData.data;

  for (let y = 0; y < CRISM_H; y++) {
    for (let x = 0; x < CRISM_W; x++) {
      const o = (y * CRISM_W + x) * 4;
      const isPhy = phyImg.data[o + 3] > 0 && (phyImg.data[o] + phyImg.data[o + 1] + phyImg.data[o + 2]) > 0;
      const isHydHi = hydImg.data[o + 3] > 0 && (hydImg.data[o] + hydImg.data[o + 1] + hydImg.data[o + 2]) >= 120;

      if (isPhy) {
        out[o] = 242;
        out[o + 1] = 77;
        out[o + 2] = 255;
        out[o + 3] = 255;
      } else if (isHydHi) {
        out[o] = 0;
        out[o + 1] = 245;
        out[o + 2] = 212;
        out[o + 3] = 255;
      }
    }
  }
  rawCtx.putImageData(rawData, 0, 0);

  const w = CRISM_W * 10;
  const h = CRISM_H * 10;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext('2d');

  ctx.save();
  ctx.filter = 'blur(9px)';
  ctx.globalAlpha = 0.85;
  ctx.drawImage(rawCanvas, 0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.94;
  ctx.drawImage(rawCanvas, 0, 0, w, h);
  ctx.restore();

  return makeCanvasTexture(outCanvas, { nearest: false });
}

/**
 * Heat lens texture: full thermal palette across 32–255 DN covering entire terrain.
 */
export function buildFullHeatTexture(themisImg) {
  const w = themisImg.width || THEMIS_W;
  const h = themisImg.height || THEMIS_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(w, h);
  const out = imgData.data;

  const stops = [
    { p: 0.0, c: [22, 16, 59] },
    { p: 0.30, c: [108, 29, 110] },
    { p: 0.56, c: [200, 62, 75] },
    { p: 0.80, c: [245, 140, 40] },
    { p: 1.0, c: [255, 240, 120] }
  ];

  const span = THEMIS_MAX_DN - THEMIS_MIN_DN;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const dn = themisImg.data[o];
    const t = (dn - THEMIS_MIN_DN) / span;
    const rgb = sampleStops(stops, t);
    out[o] = rgb[0];
    out[o + 1] = rgb[1];
    out[o + 2] = rgb[2];
    out[o + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return makeCanvasTexture(canvas, { nearest: true });
}

/**
 * Derive geomorphometric terrain features from DEM without inventing place names:
 * Ridge, Hollow, Slope face, Flat plain, High ground, plus top 2 steep >25° hazard zones.
 */
export function deriveDemTerrainFeatures(rawHeights, rawSlopes) {
  const N = SUB_GRID_SIZE;
  const subHeights = new Float32Array(N * N);
  for (let r = 0; r < N; r++) {
    const sr = r * 4 * DEM_GRID_SIZE;
    const dr = r * N;
    for (let c = 0; c < N; c++) {
      subHeights[dr + c] = rawHeights[sr + c * 4];
    }
  }

  const stepPx = Math.round((500 / TERRAIN_WIDTH_M) * (DEM_GRID_SIZE - 1));
  const kmPx = Math.round((1000 / TERRAIN_WIDTH_M) * (DEM_GRID_SIZE - 1));
  const halfKmPx = Math.round((500 / TERRAIN_WIDTH_M) * (DEM_GRID_SIZE - 1));

  let flatPlain = { meanSlope: Infinity, pctEasy: 0, meanElev: 0, x: 500, y: 4500 };
  let highGround = { meanElev: -Infinity, maxElev: -Infinity, meanSlope: 0, x: 4500, y: 500 };

  for (let r0 = 0; r0 <= DEM_GRID_SIZE - kmPx; r0 += stepPx) {
    for (let c0 = 0; c0 <= DEM_GRID_SIZE - kmPx; c0 += stepPx) {
      let sumS = 0;
      let sumE = 0;
      let maxE = -Infinity;
      let easyN = 0;
      let cnt = 0;
      for (let r = r0; r < r0 + kmPx; r += 4) {
        const ro = r * DEM_GRID_SIZE;
        for (let c = c0; c < c0 + kmPx; c += 4) {
          const s = rawSlopes[ro + c];
          const e = rawHeights[ro + c];
          sumS += s;
          sumE += e;
          if (e > maxE) maxE = e;
          if (s < 15.0) easyN++;
          cnt++;
        }
      }
      const mS = sumS / cnt;
      const mE = sumE / cnt;
      const lx = ((c0 + kmPx * 0.5) / (DEM_GRID_SIZE - 1)) * TERRAIN_WIDTH_M;
      const ly = (1.0 - (r0 + kmPx * 0.5) / (DEM_GRID_SIZE - 1)) * TERRAIN_HEIGHT_M;
      if (mS < flatPlain.meanSlope) {
        flatPlain = { meanSlope: mS, pctEasy: (easyN / cnt) * 100.0, meanElev: mE, x: lx, y: ly };
      }
      if (mE > highGround.meanElev) {
        highGround = { meanElev: mE, maxElev: maxE, meanSlope: mS, x: lx, y: ly };
      }
    }
  }

  // Topographic Position Index (~330 m window) for Ridge, Hollow, and Slope face
  const rad = 8;
  const prefix = new Float64Array((N + 1) * (N + 1));
  for (let r = 0; r < N; r++) {
    let rowSum = 0;
    for (let c = 0; c < N; c++) {
      rowSum += subHeights[r * N + c];
      prefix[(r + 1) * (N + 1) + (c + 1)] = prefix[r * (N + 1) + (c + 1)] + rowSum;
    }
  }

  const boxSum = (r0, c0, r1, c1) => {
    const A = prefix[r0 * (N + 1) + c0];
    const B = prefix[r0 * (N + 1) + c1];
    const C = prefix[r1 * (N + 1) + c0];
    const D = prefix[r1 * (N + 1) + c1];
    return D - B - C + A;
  };

  let ridge = { tpi: -Infinity, elev: 0, slope: 0, x: 3262, y: 3984 };
  let hollow = { tpi: Infinity, elev: 0, slope: 0, x: 4512, y: 449 };
  let slopeFace = { meanSlope: -Infinity, elev: 0, x: 4062, y: 3086 };

  for (let r = 12; r < N - 12; r++) {
    const r0 = r - rad;
    const r1 = r + rad + 1;
    const area = (2 * rad + 1) * (2 * rad + 1);
    for (let c = 12; c < N - 12; c++) {
      const c0 = c - rad;
      const c1 = c + rad + 1;
      const elev = subHeights[r * N + c];
      const tpi = elev - boxSum(r0, c0, r1, c1) / area;
      const lx = (c / (N - 1)) * TERRAIN_WIDTH_M;
      const ly = (1.0 - r / (N - 1)) * TERRAIN_HEIGHT_M;
      const fullSlope = rawSlopes[r * 4 * DEM_GRID_SIZE + c * 4];

      if (tpi > ridge.tpi) ridge = { tpi, elev, slope: fullSlope, x: lx, y: ly };
      if (tpi < hollow.tpi) hollow = { tpi, elev, slope: fullSlope, x: lx, y: ly };
    }
  }

  for (let r = 18; r < N - 18; r += 3) {
    for (let c = 18; c < N - 18; c += 3) {
      let sSum = 0;
      let cnt = 0;
      for (let dr = -5; dr <= 5; dr += 2) {
        for (let dc = -5; dc <= 5; dc += 2) {
          sSum += rawSlopes[(r + dr) * 4 * DEM_GRID_SIZE + (c + dc) * 4];
          cnt++;
        }
      }
      const mS = sSum / cnt;
      if (mS > slopeFace.meanSlope) {
        slopeFace = {
          meanSlope: mS,
          elev: subHeights[r * N + c],
          x: (c / (N - 1)) * TERRAIN_WIDTH_M,
          y: (1.0 - r / (N - 1)) * TERRAIN_HEIGHT_M
        };
      }
    }
  }

  // Top 2 steep >25° hazard clusters over 500x500 m tiles (>= 900 m apart)
  const steepTiles = [];
  for (let r0 = 0; r0 <= DEM_GRID_SIZE - halfKmPx; r0 += halfKmPx) {
    for (let c0 = 0; c0 <= DEM_GRID_SIZE - halfKmPx; c0 += halfKmPx) {
      let haz = 0;
      let maxS = 0;
      let elevSum = 0;
      let cnt = 0;
      for (let r = r0; r < r0 + halfKmPx; r += 2) {
        const ro = r * DEM_GRID_SIZE;
        for (let c = c0; c < c0 + halfKmPx; c += 2) {
          const s = rawSlopes[ro + c];
          if (s > 25.0) haz++;
          if (s > maxS) maxS = s;
          elevSum += rawHeights[ro + c];
          cnt++;
        }
      }
      const pctHaz = (haz / cnt) * 100.0;
      if (pctHaz >= 15.0) {
        steepTiles.push({
          pctHaz,
          maxSlope: maxS,
          meanElev: elevSum / cnt,
          x: ((c0 + halfKmPx * 0.5) / (DEM_GRID_SIZE - 1)) * TERRAIN_WIDTH_M,
          y: (1.0 - (r0 + halfKmPx * 0.5) / (DEM_GRID_SIZE - 1)) * TERRAIN_HEIGHT_M
        });
      }
    }
  }
  steepTiles.sort((a, b) => b.pctHaz - a.pctHaz);
  const steepZones = [];
  for (let i = 0; i < steepTiles.length && steepZones.length < 2; i++) {
    const t = steepTiles[i];
    if (steepZones.every(z => Math.hypot(z.x - t.x, z.y - t.y) >= 900)) {
      steepZones.push(t);
    }
  }

  return { flatPlain, highGround, ridge, hollow, slopeFace, steepZones };
}

/** Connected-component clustering of CRISM MRDR t0902 indicator pixels. */
export function clusterCrismIndicators(hydImg, phyImg) {
  function extractClusters(predicate, kind, maxClusters) {
    const visited = new Uint8Array(CRISM_W * CRISM_H);
    const clusters = [];

    for (let r = 0; r < CRISM_H; r++) {
      for (let c = 0; c < CRISM_W; c++) {
        const idx = r * CRISM_W + c;
        if (visited[idx] || !predicate(idx * 4)) continue;

        const queue = [[r, c]];
        visited[idx] = 1;
        let sumR = 0;
        let sumC = 0;
        let pxCount = 0;

        while (queue.length) {
          const [cr, cc] = queue.pop();
          sumR += cr;
          sumC += cc;
          pxCount++;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (!dr && !dc) continue;
              const nr = cr + dr;
              const nc = cc + dc;
              if (nr < 0 || nr >= CRISM_H || nc < 0 || nc >= CRISM_W) continue;
              const nIdx = nr * CRISM_W + nc;
              if (!visited[nIdx] && predicate(nIdx * 4)) {
                visited[nIdx] = 1;
                queue.push([nr, nc]);
              }
            }
          }
        }

        if (pxCount >= 3) {
          const mr = sumR / pxCount;
          const mc = sumC / pxCount;
          clusters.push({
            kind,
            pixelCount: pxCount,
            x: ((mc + 0.5) / CRISM_W) * TERRAIN_WIDTH_M,
            y: ((CRISM_H - 1 - mr + 0.5) / CRISM_H) * TERRAIN_HEIGHT_M
          });
        }
      }
    }

    clusters.sort((a, b) => b.pixelCount - a.pixelCount);
    return clusters.slice(0, maxClusters);
  }

  const clayClusters = extractClusters(
    o => phyImg.data[o + 3] > 0 && (phyImg.data[o] + phyImg.data[o + 1] + phyImg.data[o + 2]) > 0,
    'clay',
    3
  );
  const hydClusters = extractClusters(
    o => hydImg.data[o + 3] > 0 && (hydImg.data[o] + hydImg.data[o + 1] + hydImg.data[o + 2]) >= 120,
    'hydrated',
    3
  );

  return { clayClusters, hydClusters };
}

/**
 * Compute CRISM Minerals and THEMIS Heat stats along each candidate route.
 * Sun & Radiation full 1025x1025 stats merge asynchronously as the Web Worker finishes.
 */
export function computeOpticalRouteStats(candidates, hydImg, phyImg, themisImg) {
  const stats = {};
  candidates.forEach(c => {
    const wps = c.waypoints || [];
    const n = wps.length;
    if (!n) {
      stats[c.id] = { phyPct: 0, hydHighPct: 0, anyMineralPct: 0, themisMeanDn: 0, sun: {}, radiation: null };
      return;
    }

    let phyHits = 0;
    let hydHiHits = 0;
    let anyMinHits = 0;
    let dnSum = 0;

    for (let i = 0; i < n; i++) {
      const wp = wps[i];
      const cx = Math.max(0, Math.min(CRISM_W - 1, Math.floor((wp.x / TERRAIN_WIDTH_M) * CRISM_W)));
      const cy = Math.max(0, Math.min(CRISM_H - 1, Math.floor((1.0 - wp.y / TERRAIN_HEIGHT_M) * CRISM_H)));
      const co = (cy * CRISM_W + cx) * 4;

      const isPhy = phyImg.data[co + 3] > 0 && (phyImg.data[co] + phyImg.data[co + 1] + phyImg.data[co + 2]) > 0;
      const isHydHi = hydImg.data[co + 3] > 0 && (hydImg.data[co] + hydImg.data[co + 1] + hydImg.data[co + 2]) >= 120;

      if (isPhy) phyHits++;
      if (isHydHi) hydHiHits++;
      if (isPhy || isHydHi) anyMinHits++;

      const tx = Math.max(0, Math.min(THEMIS_W - 1, Math.floor((wp.x / TERRAIN_WIDTH_M) * THEMIS_W)));
      const ty = Math.max(0, Math.min(THEMIS_H - 1, Math.floor((1.0 - wp.y / TERRAIN_HEIGHT_M) * THEMIS_H)));
      dnSum += themisImg.data[(ty * THEMIS_W + tx) * 4];
    }

    stats[c.id] = {
      phyPct: (phyHits / n) * 100.0,
      hydHighPct: (hydHiHits / n) * 100.0,
      anyMineralPct: (anyMinHits / n) * 100.0,
      themisMeanDn: dnSum / n,
      sun: {},
      radiation: null
    };
  });
  return stats;
}

/** Dev-only self-check comparing JS CRISM percentages against Python reference results. */
export function runDevCrismSelfCheck(routeLensStats) {
  if (!import.meta.env.DEV) return null;

  const rows = [];
  let allMatch = true;
  Object.keys(PYTHON_CRISM_BENCHMARK).forEach(id => {
    const py = PYTHON_CRISM_BENCHMARK[id];
    const js = routeLensStats[id] || { phyPct: 0, hydHighPct: 0 };
    const jsPhy = Number(js.phyPct.toFixed(1));
    const jsHyd = Number(js.hydHighPct.toFixed(1));
    const phyDiff = Number((jsPhy - py.phyPct).toFixed(1));
    const hydDiff = Number((jsHyd - py.hydHighPct).toFixed(1));
    const match = Math.abs(phyDiff) <= 0.1 && Math.abs(hydDiff) <= 0.1;
    if (!match) allMatch = false;
    rows.push({
      route: py.label,
      jsPhyPct: jsPhy,
      pyPhyPct: py.phyPct,
      phyDiff,
      jsHydHighPct: jsHyd,
      pyHydHighPct: py.hydHighPct,
      hydDiff,
      status: match ? 'PASS' : 'MISMATCH'
    });
  });

  console.info(
    `[DEV Self-Check] CRISM route % vs Python benchmark (6.7/19.2/37.6 phy, 28.4/30.0/32.0 hyd): ${allMatch ? 'PASS' : 'MISMATCH'}`
  );
  if (console.table) console.table(rows);
  const report = { allMatch, rows };
  window.__devCrismSelfCheck = report;
  return report;
}
