import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Performance & Timing Metrics ---
const appStartTime = performance.now();
let lastFpsUpdateTime = performance.now();
let frameCount = 0;
let currentFps = 60;
let lastRaycastTime = 0;

// --- Constants & Coordinate Bounds ---
const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;
const WEST_EDGE_EASTING = 8140750.0;
const SOUTH_EDGE_NORTHING = -287375.0;
const MARS_RADIUS_M = 3396190.0;

// Quality presets configuration
const QUALITY_SETTINGS = {
  low: { segments: 160, dustCount: 250, pixelRatio: 1.0 },
  medium: { segments: 320, dustCount: 600, pixelRatio: 1.0 },
  high: { segments: 512, dustCount: 1200, pixelRatio: Math.min(window.devicePixelRatio, 1.5) }
};
let currentQuality = 'medium';

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('progress-bar');
const btnSkipIntro = document.getElementById('btn-skip-intro');
const perfReadout = document.getElementById('perf-readout');

// Layer Controls
const lyrSat = document.getElementById('lyr-sat');
const exagSlider = document.getElementById('exag-slider');
const exagVal = document.getElementById('exag-val');

const lyrSlope = document.getElementById('lyr-slope');
const slopeOpacity = document.getElementById('slope-opacity');
const slopeOv = document.getElementById('slope-ov');

const lyrCrismHyd = document.getElementById('lyr-crism-hyd');
const crismHydOpacity = document.getElementById('crism-hyd-opacity');
const crismHydOv = document.getElementById('crism-hyd-ov');

const lyrCrismPhy = document.getElementById('lyr-crism-phy');
const crismPhyOpacity = document.getElementById('crism-phy-opacity');
const crismPhyOv = document.getElementById('crism-phy-ov');

const lyrThemis = document.getElementById('lyr-themis');
const themisOpacity = document.getElementById('themis-opacity');
const themisOv = document.getElementById('themis-ov');

const lyrRoute = document.getElementById('lyr-route');
const lyrBoxwork = document.getElementById('lyr-boxwork');
const routeColorMode = document.getElementById('route-color-mode');

const timeSlider = document.getElementById('time-slider');
const timeVal = document.getElementById('time-val');
const lyrDust = document.getElementById('lyr-dust');
const qualityPreset = document.getElementById('quality-preset');

const btnReset = document.getElementById('btn-reset');
const btnBoxwork = document.getElementById('btn-boxwork');
const btnResetCustom = document.getElementById('btn-reset-custom');

// Inspector Elements
const inspectorPanel = document.getElementById('inspector-panel');
const inspectorMode = document.getElementById('inspector-mode');
const inspectorUnpin = document.getElementById('inspector-unpin');

const iElev = document.getElementById('i-elev');
const iSlope = document.getElementById('i-slope');
const iTier = document.getElementById('i-tier');
const iXy = document.getElementById('i-xy');
const iLonlat = document.getElementById('i-lonlat');
const iSol = document.getElementById('i-sol');
const iCrismHyd = document.getElementById('i-crism-hyd');
const iCrismPhy = document.getElementById('i-crism-phy');
const iThemis = document.getElementById('i-themis');

const iRad = document.getElementById('i-rad');
const iDust = document.getElementById('i-dust');
const iTemp = document.getElementById('i-temp');
const iWind = document.getElementById('i-wind');
const iSignal = document.getElementById('i-signal');
const iMobility = document.getElementById('i-mobility');

// Timeline Elements
const btnPlay = document.getElementById('btn-play');
const tlSlider = document.getElementById('tl-slider');
const tlSol = document.getElementById('tl-sol');
const tlFollow = document.getElementById('tl-follow');
const speedBtns = document.querySelectorAll('.tl-speed .sp');

const tsSol = document.getElementById('ts-sol');
const tsElev = document.getElementById('ts-elev');
const tsDist = document.getElementById('ts-dist');
const tsClimb = document.getElementById('ts-climb');
const tsNet = document.getElementById('ts-net');

// Science Popup
const sciencePopup = document.getElementById('science-popup');
const popupTitle = document.getElementById('popup-title');
const popupSol = document.getElementById('popup-sol');
const popupClose = document.getElementById('popup-close');

// Route Planner DOM Elements
const plannerPanel = document.getElementById('planner-panel');
const plannerStatus = document.getElementById('planner-status');
const plannerTbody = document.getElementById('planner-tbody');
const btnSetStart = document.getElementById('btn-set-start');
const btnSetGoal = document.getElementById('btn-set-goal');
const btnResetPlan = document.getElementById('btn-reset-plan');
const btnTogglePlanner = document.getElementById('btn-toggle-planner');
const profileRouteName = document.getElementById('profile-route-name');
const profileHoverInfo = document.getElementById('profile-hover-info');
const elevationChart = document.getElementById('elevation-chart');
const plannerToast = document.getElementById('planner-toast');

// Global Data
let rawHeights = null;
let rawSlopes = null;
let routePoints = [];
let minElev = -4131.74;
let maxElev = -3412.51;
let currentExag = 1.0;
let currentTimeHour = 14.0;

// Pixel Data for Inspector Sampling
let crismHydCtx = null;
let crismPhyCtx = null;
let themisCtx = null;

// Replay State
let isPlaying = false;
let replaySpeed = 5.0; // sols per sec
let currentReplaySol = 3721;
let lastReplayTime = 0;
let isPinned = false;
let pinnedPoint = null;

// Three.js Objects
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const initialFogColor = new THREE.Color(0x2a160e);
scene.background = initialFogColor;
scene.fog = new THREE.FogExp2(initialFogColor, 0.000075);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 45000);
camera.position.set(0, 3400, 3900);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(QUALITY_SETTINGS.medium.pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 80;
controls.maxDistance = 20000;

// Meshes & Groups
let terrainGeometry = null;
let terrainMesh = null;
let hazardMesh = null;
let crismHydMesh = null;
let crismPhyMesh = null;
let themisMesh = null;

let routeGroup = null;
let routeLine = null;
let trailLine = null;
let roverGroup = null;
let roverBeacon = null;
let scienceMarkersGroup = null;
let startFlagGroup = null;
let boxworkGroup = null;
let dustParticles = null;
let dustVelocities = [];
let hoverCursor = null;
let cursorReticle = null;
let pinnedReticle = null;

// Route Planner State & Objects
let routeWorker = null;
let plannerGroup = null;
let candidateLines = {};
let startMarker = null;
let goalMarker = null;
let profileMarker = null;
let plannerStart = { x: 3467.35, y: 4999.58 };
let plannerGoal = { x: 2432.1, y: 2479.0 };
let isSettingStart = false;
let isSettingGoal = false;
let plannerCandidates = [];
let selectedCandidateId = 'safest';
let lastComputeTimeMs = 0;

// Lights
let sunLight = null;
let ambientLight = null;
let hemiLight = null;

function setupLights() {
  ambientLight = new THREE.AmbientLight(0x5a443b, 1.2);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xffeedd, 0x1f140e, 0.75);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff5ea, 2.4);
  sunLight.position.set(-3200, 4200, -3200);
  scene.add(sunLight);
}

// Coordinate Conversion & Bilinear Interpolation
function sampleGridBilinear(data, col, row) {
  const c = Math.max(0, Math.min(1024, col));
  const r = Math.max(0, Math.min(1024, row));
  const c0 = Math.floor(c);
  const c1 = Math.min(1024, c0 + 1);
  const r0 = Math.floor(r);
  const r1 = Math.min(1024, r0 + 1);
  const fc = c - c0;
  const fr = r - r0;
  const v00 = data[r0 * 1025 + c0];
  const v01 = data[r0 * 1025 + c1];
  const v10 = data[r1 * 1025 + c0];
  const v11 = data[r1 * 1025 + c1];
  const top = (1.0 - fc) * v00 + fc * v01;
  const bot = (1.0 - fc) * v10 + fc * v11;
  return (1.0 - fr) * top + fr * bot;
}

function localToGrid(lx, ly) {
  return {
    col: (lx / TERRAIN_WIDTH_M) * 1024.0,
    row: (1.0 - (ly / TERRAIN_HEIGHT_M)) * 1024.0
  };
}

function localToMesh(lx, ly) {
  return {
    meshX: lx - TERRAIN_WIDTH_M / 2.0,
    meshZ: TERRAIN_HEIGHT_M / 2.0 - ly
  };
}

function meshToLocal(mx, mz) {
  return {
    lx: Math.max(0, Math.min(TERRAIN_WIDTH_M, mx + TERRAIN_WIDTH_M / 2.0)),
    ly: Math.max(0, Math.min(TERRAIN_HEIGHT_M, TERRAIN_HEIGHT_M / 2.0 - mz))
  };
}

function localToMarsGeo(lx, ly) {
  const easting = WEST_EDGE_EASTING + lx;
  const northing = SOUTH_EDGE_NORTHING + ly;
  const lon = (easting / MARS_RADIUS_M) * (180.0 / Math.PI);
  const lat = (northing / MARS_RADIUS_M) * (180.0 / Math.PI);
  return { easting, northing, lon, lat };
}

// --- Terrain & Multi-Layer Construction ---
let satTexture = null;

function createTerrainLayers(satTex, slopeTex, crismHydTex, crismPhyTex, themisTex) {
  satTexture = satTex;
  const seg = QUALITY_SETTINGS[currentQuality].segments;

  if (terrainGeometry) terrainGeometry.dispose();
  terrainGeometry = new THREE.PlaneGeometry(TERRAIN_WIDTH_M, TERRAIN_HEIGHT_M, seg, seg);
  terrainGeometry.rotateX(-Math.PI / 2);

  updateGeometryHeights(terrainGeometry);

  // Base Terrain
  const terrainMat = new THREE.MeshStandardMaterial({
    map: satTex,
    roughness: 0.88,
    metalness: 0.08
  });
  terrainMesh = new THREE.Mesh(terrainGeometry, terrainMat);
  terrainMesh.name = 'MarsTerrain';
  scene.add(terrainMesh);

  // Slope Hazard Overlay
  const hazardMat = new THREE.MeshBasicMaterial({
    map: slopeTex,
    transparent: true,
    opacity: parseInt(slopeOpacity.value, 10) / 100.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  hazardMesh = new THREE.Mesh(terrainGeometry, hazardMat);
  hazardMesh.visible = lyrSlope.checked;
  scene.add(hazardMesh);

  // CRISM Hydrated Minerals
  const crismHydMat = new THREE.MeshBasicMaterial({
    map: crismHydTex,
    transparent: true,
    opacity: parseInt(crismHydOpacity.value, 10) / 100.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  crismHydMesh = new THREE.Mesh(terrainGeometry, crismHydMat);
  crismHydMesh.visible = lyrCrismHyd.checked;
  scene.add(crismHydMesh);

  // CRISM Phyllosilicates
  const crismPhyMat = new THREE.MeshBasicMaterial({
    map: crismPhyTex,
    transparent: true,
    opacity: parseInt(crismPhyOpacity.value, 10) / 100.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  crismPhyMesh = new THREE.Mesh(terrainGeometry, crismPhyMat);
  crismPhyMesh.visible = lyrCrismPhy.checked;
  scene.add(crismPhyMesh);

  // THEMIS Daytime IR
  const themisMat = new THREE.MeshBasicMaterial({
    map: themisTex,
    transparent: true,
    opacity: parseInt(themisOpacity.value, 10) / 100.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  themisMesh = new THREE.Mesh(terrainGeometry, themisMat);
  themisMesh.visible = lyrThemis.checked;
  scene.add(themisMesh);
}

function updateGeometryHeights(geo) {
  const pos = geo.attributes.position;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    const mx = pos.getX(i);
    const mz = pos.getZ(i);
    const { lx, ly } = meshToLocal(mx, mz);
    const { col, row } = localToGrid(lx, ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    pos.setY(i, (elev - minElev) * currentExag);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// --- Route, Trail, and Rover Construction ---
function createRouteAndRover() {
  routeGroup = new THREE.Group();

  // Precompute distance and cumulative uphill climb
  let cumDist = 0.0;
  let cumClimb = 0.0;
  routePoints[0].cumDist = 0.0;
  routePoints[0].cumClimb = 0.0;

  for (let i = 1; i < routePoints.length; i++) {
    const p0 = routePoints[i - 1];
    const p1 = routePoints[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.elevation - p0.elevation;
    const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
    cumDist += step;
    if (dz > 0) cumClimb += dz;
    p1.cumDist = cumDist;
    p1.cumClimb = cumClimb;
  }

  // Build Route Positions & Colors
  const positions = [];
  const colorsSlope = [];
  const colorsSingle = [];
  const colorsNeutral = [];

  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    const { meshX, meshZ } = localToMesh(pt.x, pt.y);
    const meshY = (pt.elevation - minElev) * currentExag + 6.0 * currentExag; // Drape cleanly above surface
    positions.push(meshX, meshY, meshZ);

    // Sample slope at point
    const { col, row } = localToGrid(pt.x, pt.y);
    const s = sampleGridBilinear(rawSlopes, col, row);
    if (s < 15.0) {
      colorsSlope.push(0.18, 0.8, 0.44); // Green (<15)
    } else if (s <= 25.0) {
      colorsSlope.push(0.95, 0.77, 0.06); // Yellow (15-25)
    } else {
      colorsSlope.push(0.91, 0.3, 0.24); // Red (>25)
    }
    colorsSingle.push(0.0, 0.85, 1.0); // Cyan
    colorsNeutral.push(0.65, 0.70, 0.75); // Neutral slate (reference)
  }

  // 1. Full continuous route line
  const routeGeo = new THREE.BufferGeometry();
  routeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  routeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colorsNeutral, 3));
  routeGeo.userData = { colorsSlope, colorsSingle, colorsNeutral };

  const routeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: 3,
    depthTest: true,
    depthWrite: false
  });
  routeLine = new THREE.Line(routeGeo, routeMat);
  routeGroup.add(routeLine);

  // 2. Active glowing trail behind rover
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(), 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    linewidth: 4,
    depthTest: true,
    depthWrite: false
  });
  trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.geometry.setDrawRange(0, 1);
  routeGroup.add(trailLine);

  // 3. 3D Rover Token
  roverGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(16, 8, 12),
    new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.3, metalness: 0.7 })
  );
  body.position.y = 5;
  roverGroup.add(body);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 })
  );
  mast.position.set(4, 11, 0);
  roverGroup.add(mast);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 5),
    new THREE.MeshBasicMaterial({ color: 0x00d2ff })
  );
  head.position.set(4, 17, 0);
  roverGroup.add(head);

  // Pulsing halo beacon
  const ringGeo = new THREE.RingGeometry(14, 20, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85
  });
  roverBeacon = new THREE.Mesh(ringGeo, ringMat);
  roverBeacon.position.y = 1.5;
  roverGroup.add(roverBeacon);

  routeGroup.add(roverGroup);
  scene.add(routeGroup);

  updateTimelineReplay(3721);
}

function updateRouteColoring() {
  if (!routeLine) return;
  const mode = routeColorMode ? routeColorMode.value : 'neutral';
  let colors;
  if (mode === 'neutral') {
    colors = routeLine.geometry.userData.colorsNeutral;
  } else if (mode === 'single') {
    colors = routeLine.geometry.userData.colorsSingle;
  } else {
    colors = routeLine.geometry.userData.colorsSlope;
  }
  routeLine.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  routeLine.geometry.attributes.color.needsUpdate = true;
}

// --- Science Waypoints, START Flag & Boxwork Core Zone ---
const SCIENCE_TARGETS = [
  { sol: 4534, label: 'Sol 4534', title: 'Boxwork campaign begins (Phase 1)', color: 0xff007f },
  { sol: 4602, label: 'Sols 4602-4603', title: 'Top of the ridge, start of the main boxwork region', color: 0xf1c40f },
  { sol: 4604, label: 'Sols 4604-4606', title: 'Main exposure of boxwork structures', color: 0x00d2ff },
  { sol: 4716, label: 'Sols 4716-4722', title: 'Nevado Sajama drill', color: 0x2ecc71 },
  { sol: 4804, label: 'Sols 4804-4811', title: 'Nevado Sajama 2 drill', color: 0xe67e22 }
];

function createScienceMarkersAndFlag() {
  scienceMarkersGroup = new THREE.Group();

  // START Flag at Sol 3721 (North edge entry)
  startFlagGroup = new THREE.Group();
  const pStart = routePoints[0];
  const { meshX: sx, meshZ: sz } = localToMesh(pStart.x, pStart.y);
  const sy = (pStart.elevation - minElev) * currentExag;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 50, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 })
  );
  pole.position.set(sx, sy + 25 * currentExag, sz);
  startFlagGroup.add(pole);

  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(26, -9);
  flagShape.lineTo(0, -18);
  flagShape.closePath();
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(flagShape),
    new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide })
  );
  flag.position.set(sx, sy + 46 * currentExag, sz);
  startFlagGroup.add(flag);

  scene.add(startFlagGroup);

  // 5 Science Milestone Markers
  SCIENCE_TARGETS.forEach(item => {
    let closestPt = routePoints[0];
    let minD = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const d = Math.abs(routePoints[i].sol - item.sol);
      if (d < minD) {
        minD = d;
        closestPt = routePoints[i];
      }
    }

    const { meshX, meshZ } = localToMesh(closestPt.x, closestPt.y);
    const my = (closestPt.elevation - minElev) * currentExag + 8.0 * currentExag;

    const pin = new THREE.Mesh(
      new THREE.OctahedronGeometry(11, 0),
      new THREE.MeshStandardMaterial({
        color: item.color,
        emissive: item.color,
        emissiveIntensity: 0.5,
        roughness: 0.2
      })
    );
    pin.position.set(meshX, my, meshZ);
    pin.userData = { isSciencePin: true, title: item.title, solLabel: item.label, pt: closestPt };
    scienceMarkersGroup.add(pin);

    // Beacon beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 8),
      new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.5 })
    );
    beam.position.set(meshX, my + 30, meshZ);
    scienceMarkersGroup.add(beam);
  });

  scene.add(scienceMarkersGroup);
}

function createBoxworkCoreZone() {
  boxworkGroup = new THREE.Group();

  // Exactly 153 x 283 m core zone from sols 4600-4805:
  // X: [2355.6, 2508.6] (width = 153 m)
  // Y: [2337.5, 2620.5] (length = 283 m)
  const xMin = 2355.6;
  const xMax = 2508.6;
  const yMin = 2337.5;
  const yMax = 2620.5;

  const perimeter = [];
  const steps = 25;
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMin + (s / steps) * (xMax - xMin), y: yMin });
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMax, y: yMin + (s / steps) * (yMax - yMin) });
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMax - (s / steps) * (xMax - xMin), y: yMax });
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMin, y: yMax - (s / steps) * (yMax - yMin) });
  perimeter.push(perimeter[0]);

  const positions = [];
  perimeter.forEach(p => {
    const { meshX, meshZ } = localToMesh(p.x, p.y);
    const { col, row } = localToGrid(p.x, p.y);
    const elev = sampleGridBilinear(rawHeights, col, row);
    positions.push(meshX, (elev - minElev) * currentExag + 5.0 * currentExag, meshZ);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xf1c40f, linewidth: 2, depthTest: true, depthWrite: false });
  boxworkGroup.add(new THREE.Line(geo, mat));

  scene.add(boxworkGroup);
}

// --- Atmosphere: Sun & Drifting Dust ---
function createDustParticles() {
  if (dustParticles) {
    scene.remove(dustParticles);
    dustParticles.geometry.dispose();
  }

  const count = QUALITY_SETTINGS[currentQuality].dustCount;
  const posArr = new Float32Array(count * 3);
  dustVelocities = [];

  for (let i = 0; i < count; i++) {
    posArr[i * 3] = (Math.random() - 0.5) * 5000;
    posArr[i * 3 + 1] = Math.random() * 800 + 20;
    posArr[i * 3 + 2] = (Math.random() - 0.5) * 5000;
    dustVelocities.push({
      vx: (Math.random() - 0.3) * 1.5,
      vy: (Math.random() - 0.5) * 0.3,
      vz: (Math.random() - 0.5) * 1.2
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  dustParticles = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xdf8858, size: 4.0, transparent: true, opacity: 0.55, depthWrite: false })
  );
  dustParticles.visible = lyrDust.checked;
  scene.add(dustParticles);
}

function updateDustParticles() {
  if (!dustParticles || !lyrDust.checked) return;
  const pos = dustParticles.geometry.attributes.position;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    let x = pos.getX(i) + dustVelocities[i].vx;
    let y = pos.getY(i) + dustVelocities[i].vy;
    let z = pos.getZ(i) + dustVelocities[i].vz;
    if (x > 2500) x = -2500;
    if (x < -2500) x = 2500;
    if (z > 2500) z = -2500;
    if (z < -2500) z = 2500;
    if (y > 900) y = 20;
    if (y < 20) y = 900;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}

function updateTimeOfDay(hour) {
  currentTimeHour = hour;
  const h = Math.floor(hour);
  const m = Math.floor((hour % 1) * 60);
  timeVal.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

  const solarAngle = ((hour - 6.0) / 12.0) * Math.PI;
  const sunElevation = Math.sin(solarAngle);
  const sunAzimuth = Math.cos(solarAngle);

  if (sunLight) {
    sunLight.position.set(-sunAzimuth * 5800, Math.max(200, sunElevation * 4800), -1500 + sunAzimuth * 1200);
    const t = Math.max(0.05, Math.sin(solarAngle));
    const sunColor = new THREE.Color().lerpColors(new THREE.Color(0xff6020), new THREE.Color(0xfff5ea), t);
    sunLight.color.copy(sunColor);
    sunLight.intensity = 0.6 + 2.0 * t;

    const fogColor = new THREE.Color().lerpColors(new THREE.Color(0x180b06), new THREE.Color(0x351d14), t);
    scene.fog.color.copy(fogColor);
    scene.background.copy(fogColor);
  }
}

// --- Dynamic Exaggeration ---
function applyVerticalExaggeration(exag) {
  currentExag = exag;
  exagVal.textContent = `${exag.toFixed(1)}×`;

  if (terrainGeometry) updateGeometryHeights(terrainGeometry);

  if (routeLine) {
    const pos = routeLine.geometry.attributes.position;
    const tPos = trailLine.geometry.attributes.position;
    for (let i = 0; i < routePoints.length; i++) {
      const pt = routePoints[i];
      const my = (pt.elevation - minElev) * currentExag + 6.0 * currentExag;
      pos.setY(i, my);
      tPos.setY(i, my);
    }
    pos.needsUpdate = true;
    tPos.needsUpdate = true;
  }

  if (roverGroup && routePoints.length > 0) updateTimelineReplay(currentReplaySol);

  if (scienceMarkersGroup) {
    scienceMarkersGroup.children.forEach(c => {
      if (c.userData && c.userData.pt) {
        c.position.y = (c.userData.pt.elevation - minElev) * currentExag + 8.0 * currentExag;
      }
    });
  }

  if (startFlagGroup) {
    const pStart = routePoints[0];
    const sy = (pStart.elevation - minElev) * currentExag;
    startFlagGroup.children[0].position.y = sy + 25 * currentExag;
    startFlagGroup.children[1].position.y = sy + 46 * currentExag;
  }

  if (pinnedReticle && pinnedReticle.visible && pinnedPoint) {
    const { col, row } = localToGrid(pinnedPoint.lx, pinnedPoint.ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    pinnedReticle.position.y = (elev - minElev) * currentExag + 2.0;
  }

  if (cursorReticle && cursorReticle.visible) {
    const { lx, ly } = meshToLocal(cursorReticle.position.x, cursorReticle.position.z);
    const { col, row } = localToGrid(lx, ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    cursorReticle.position.y = (elev - minElev) * currentExag + 2.0;
  }

  updateStartAndGoalMarkerPositions();

  if (candidateLines) {
    Object.values(candidateLines).forEach(line => {
      if (line.userData && line.userData.waypoints) {
        const pos = line.geometry.attributes.position;
        const wps = line.userData.waypoints;
        for (let i = 0; i < wps.length; i++) {
          pos.setY(i, (wps[i].z - minElev) * currentExag + 8.5 * currentExag);
        }
        pos.needsUpdate = true;
      }
    });
  }

  const meanElev = (minElev + maxElev) / 2.0;
  controls.target.y = (meanElev - minElev) * currentExag;
}

// --- Timeline Replay Engine ---
function updateTimelineReplay(targetSol) {
  currentReplaySol = Math.max(3721, Math.min(4868, targetSol));
  tlSlider.value = currentReplaySol;
  tlSol.textContent = `SOL ${Math.floor(currentReplaySol)}`;

  // Find index at or before currentReplaySol
  let ptIndex = 0;
  for (let i = 0; i < routePoints.length; i++) {
    if (routePoints[i].sol <= currentReplaySol) {
      ptIndex = i;
    } else {
      break;
    }
  }

  const curPt = routePoints[ptIndex];

  // Move Rover Token
  if (roverGroup) {
    const { meshX, meshZ } = localToMesh(curPt.x, curPt.y);
    const meshY = (curPt.elevation - minElev) * currentExag + 4.0 * currentExag;
    roverGroup.position.set(meshX, meshY, meshZ);

    if (ptIndex < routePoints.length - 1) {
      const nextPt = routePoints[ptIndex + 1];
      const { meshX: nx, meshZ: nz } = localToMesh(nextPt.x, nextPt.y);
      roverGroup.rotation.y = Math.atan2(nx - meshX, nz - meshZ);
    }

    // Follow camera if enabled
    if (tlFollow && tlFollow.checked) {
      controls.target.set(meshX, meshY, meshZ);
    }
  }

  // Update glowing active trail range
  if (trailLine) {
    trailLine.geometry.setDrawRange(0, ptIndex + 1);
  }

  // Update bottom telemetry bar
  tsSol.textContent = `${Math.floor(curPt.sol)}`;
  tsElev.textContent = `${curPt.elevation.toFixed(1)} m`;
  tsDist.textContent = curPt.cumDist >= 1000 ? `${(curPt.cumDist / 1000).toFixed(2)} km` : `${curPt.cumDist.toFixed(1)} m`;
  tsClimb.textContent = `+${curPt.cumClimb.toFixed(1)} m`;
  const net = curPt.elevation - routePoints[0].elevation;
  tsNet.textContent = `${net >= 0 ? '+' : ''}${net.toFixed(1)} m`;
}

// --- Hover & Click Point Inspector ---
function samplePixelFromContext(ctx, width, height, lx, ly) {
  if (!ctx) return null;
  const px = Math.floor((lx / TERRAIN_WIDTH_M) * width);
  const py = Math.floor((1.0 - ly / TERRAIN_HEIGHT_M) * height);
  const cx = Math.max(0, Math.min(width - 1, px));
  const cy = Math.max(0, Math.min(height - 1, py));
  const data = ctx.getImageData(cx, cy, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

function updatePointInspector(lx, ly) {
  const { col, row } = localToGrid(lx, ly);
  const elev = sampleGridBilinear(rawHeights, col, row);
  const slope = sampleGridBilinear(rawSlopes, col, row);
  const { lon, lat } = localToMarsGeo(lx, ly);

  // Slope tier
  let tierLabel = '< 15° Easy';
  let tierClass = 'tier-easy';
  if (slope >= 25.0) {
    tierLabel = '> 25° Hazardous';
    tierClass = 'tier-haz';
  } else if (slope >= 15.0) {
    tierLabel = '15°–25° Moderate';
    tierClass = 'tier-mod';
  }

  // Nearest rover Sol
  let minD2 = Infinity;
  let nearestPt = null;
  for (let i = 0; i < routePoints.length; i++) {
    const p = routePoints[i];
    const dx = p.x - lx;
    const dy = p.y - ly;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) {
      minD2 = d2;
      nearestPt = p;
    }
  }
  const distM = Math.sqrt(minD2);

  // Real CRISM & THEMIS values
  const hyd = samplePixelFromContext(crismHydCtx, 27, 28, lx, ly);
  const phy = samplePixelFromContext(crismPhyCtx, 27, 28, lx, ly);
  const th = samplePixelFromContext(themisCtx, 50, 50, lx, ly);

  // Update DOM Measured
  iElev.textContent = `${elev.toFixed(1)} m`;
  iSlope.textContent = `${slope.toFixed(1)}°`;
  iTier.textContent = tierLabel;
  iTier.className = `iv ${tierClass}`;
  iXy.textContent = `X ${lx.toFixed(0)} m, Y ${ly.toFixed(0)} m`;
  iLonlat.textContent = `${lon.toFixed(4)}°E, ${Math.abs(lat).toFixed(4)}°S`;

  if (nearestPt) {
    const distStr = distM < 8 ? 'At rover waypoint' : `${Math.round(distM)} m away`;
    iSol.textContent = `Sol ${nearestPt.sol} (${distStr})`;
  }

  if (hyd) {
    iCrismHyd.textContent = hyd.a > 0 ? `R:${hyd.r} G:${hyd.g} B:${hyd.b} (Covered)` : 'No coverage';
  } else {
    iCrismHyd.textContent = 'Loading…';
  }

  if (phy) {
    iCrismPhy.textContent = phy.a > 0 ? `R:${phy.r} G:${phy.g} B:${phy.b} (Covered)` : 'No coverage';
  } else {
    iCrismPhy.textContent = 'Loading…';
  }

  if (th) {
    iThemis.textContent = `${th.r} DN (relative)`;
  } else {
    iThemis.textContent = 'Loading…';
  }

  // Simulated Game Values (deterministic functions from docs/SIMULATED_DATA.md)
  const baseRate = 20.0;
  const elevFactor = 1.0 + (elev - (-4131.74)) / 3000.0 * 0.15;
  const timeFactor = 1.0 + 0.08 * Math.cos((currentTimeHour - 14.0) * Math.PI / 12.0);
  const doseRate = baseRate * elevFactor * timeFactor;
  iRad.textContent = `${doseRate.toFixed(1)} µSv/h`;

  const baseTau = 0.60;
  const spatialWave = 0.15 * Math.sin(lx / 800.0) * Math.cos(ly / 600.0);
  const elevEffect = 0.05 * (elev - (-4131.74)) / 700.0;
  const tau = baseTau + spatialWave + elevEffect;
  const visKm = 15.0 / Math.max(tau, 0.1);
  iDust.textContent = `τ = ${tau.toFixed(2)} (${visKm.toFixed(1)} km)`;

  const noonTemp = -15.0;
  const diurnalAmp = 45.0;
  const diurnalPhase = Math.cos((currentTimeHour - 14.0) * Math.PI / 12.0);
  const surfaceTemp = noonTemp + diurnalAmp * diurnalPhase - 0.3 * slope - 0.005 * (elev - (-4131.74));
  iTemp.textContent = `${surfaceTemp.toFixed(1)} °C`;

  const baseWind = 5.0 + 3.0 * Math.abs(Math.sin((currentTimeHour - 12.0) * Math.PI / 12.0)) + 1.5 * Math.sin(slope * Math.PI / 60.0);
  const windDir = Math.round(((lx * 7.3 + ly * 13.1) % 360 + 360) % 360);
  iWind.textContent = `${baseWind.toFixed(1)} m/s, ${windDir}°`;

  const sigStrength = -70.0 + 3.0 * (elev - (-4131.74)) / 700.0 - 0.15 * slope;
  iSignal.textContent = `${sigStrength.toFixed(1)} dBm`;

  const slopeCost = Math.min(slope / 35.0 * 60.0, 60.0);
  const roughnessCost = Math.min(slope * slope / 900.0 * 25.0, 25.0);
  const elevCost = 15.0 * (elev - (-4131.74)) / 700.0;
  const mobCost = Math.min(100.0, Math.max(0.0, slopeCost + roughnessCost + elevCost));
  iMobility.textContent = `${Math.round(mobCost)} / 100`;

  // Make sure inspector panel is open
  if (!inspectorPanel.classList.contains('open')) {
    inspectorPanel.classList.add('open');
  }
}

// --- 3D Cursor Reticle & Surface Pointers ---
function createReticles() {
  // 1. Interactive Hover Cursor Reticle (targeting ring on the Martian surface)
  cursorReticle = new THREE.Group();

  // Outer segmented ring
  const ringGeo = new THREE.RingGeometry(22, 26, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff7733,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false
  });
  cursorReticle.add(new THREE.Mesh(ringGeo, ringMat));

  // Inner center dot
  const dotGeo = new THREE.RingGeometry(0, 3.5, 16);
  dotGeo.rotateX(-Math.PI / 2);
  cursorReticle.add(new THREE.Mesh(dotGeo, ringMat));

  // 4 Targeting crosshair tick marks pointing outward
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.95, depthWrite: false });
  const tGeoZ = new THREE.BoxGeometry(1.8, 0.6, 10);
  const tickN = new THREE.Mesh(tGeoZ, tickMat);
  tickN.position.z = -31;
  const tickS = new THREE.Mesh(tGeoZ, tickMat);
  tickS.position.z = 31;
  const tGeoX = new THREE.BoxGeometry(10, 0.6, 1.8);
  const tickE = new THREE.Mesh(tGeoX, tickMat);
  tickE.position.x = 31;
  const tickW = new THREE.Mesh(tGeoX, tickMat);
  tickW.position.x = -31;
  cursorReticle.add(tickN, tickS, tickE, tickW);

  cursorReticle.visible = false;
  scene.add(cursorReticle);

  // 2. Pinned Point Reticle & Beacon
  pinnedReticle = new THREE.Group();

  const pRingGeo = new THREE.RingGeometry(20, 26, 32);
  pRingGeo.rotateX(-Math.PI / 2);
  const pRingMat = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  pinnedReticle.add(new THREE.Mesh(pRingGeo, pRingMat));

  // Vertical needle & beacon diamond
  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 45, 8),
    new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.85, depthWrite: false })
  );
  needle.position.y = 22.5;
  pinnedReticle.add(needle);

  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(6, 0),
    new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00aaff,
      emissiveIntensity: 0.7,
      roughness: 0.2
    })
  );
  beacon.position.y = 48;
  pinnedReticle.add(beacon);

  pinnedReticle.visible = false;
  scene.add(pinnedReticle);
}

// Raycaster & Mouse Handling
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9999, -9999);

function getTerrainIntersection(ray) {
  if (!rawHeights) return null;
  const orig = ray.origin;
  const dir = ray.direction;
  if (Math.abs(dir.y) < 1e-5) return null;

  // Start with plane at median elevation
  let planeY = ((minElev + maxElev) * 0.5 - minElev) * currentExag;
  let t = (planeY - orig.y) / dir.y;
  if (t < 0) return null;

  // 3 iterations of secant / plane refinement
  for (let iter = 0; iter < 3; iter++) {
    const x = orig.x + t * dir.x;
    const z = orig.z + t * dir.z;
    if (Math.abs(x) > 2500 || Math.abs(z) > 2500) break;
    const { lx, ly } = meshToLocal(x, z);
    const { col, row } = localToGrid(lx, ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    planeY = (elev - minElev) * currentExag;
    t = (planeY - orig.y) / dir.y;
    if (t < 0) return null;
  }

  const hitX = orig.x + t * dir.x;
  const hitZ = orig.z + t * dir.z;
  if (Math.abs(hitX) > 2500 || Math.abs(hitZ) > 2500) return null;

  const { lx, ly } = meshToLocal(hitX, hitZ);
  const { col, row } = localToGrid(lx, ly);
  const elev = sampleGridBilinear(rawHeights, col, row);
  const hitY = (elev - minElev) * currentExag;

  return { x: hitX, y: hitY, z: hitZ, lx, ly, elev };
}

function handlePointerInspection() {
  if (isPinned) return;
  const now = performance.now();
  if (now - lastRaycastTime < 33) return; // Throttle to 30 FPS
  lastRaycastTime = now;

  raycaster.setFromCamera(mouse, camera);

  const hit = getTerrainIntersection(raycaster.ray);
  if (hit) {
    updatePointInspector(hit.lx, hit.ly);
    if (cursorReticle) {
      cursorReticle.position.set(hit.x, hit.y + 2.0, hit.z);
      cursorReticle.visible = true;
    }
  } else {
    if (cursorReticle) cursorReticle.visible = false;
  }
}

// --- Cinematic Fly-in Intro ---
let isIntroActive = false;
let introStartTime = 0;
const INTRO_DURATION = 4000;

function startCinematicIntro() {
  isIntroActive = true;
  btnSkipIntro.style.display = 'block';

  const startCam = new THREE.Vector3(0, 7500, 4500);
  const startTarget = new THREE.Vector3(0, 200, 0);

  const { meshX, meshZ } = localToMesh(2430, 2480);
  const endTarget = new THREE.Vector3(meshX, (-3613.0 - minElev) * currentExag, meshZ);
  const endCam = new THREE.Vector3(meshX + 180, endTarget.y + 700, meshZ + 900);

  camera.position.copy(startCam);
  controls.target.copy(startTarget);
  controls.update();

  introStartTime = performance.now();

  function animateIntro(now) {
    if (!isIntroActive) return;
    const elapsed = now - introStartTime;
    const p = Math.min(1.0, elapsed / INTRO_DURATION);
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    camera.position.lerpVectors(startCam, endCam, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();

    if (p < 1.0) {
      requestAnimationFrame(animateIntro);
    } else {
      endCinematicIntro();
    }
  }
  requestAnimationFrame(animateIntro);
}

function endCinematicIntro() {
  if (!isIntroActive) return;
  isIntroActive = false;
  btnSkipIntro.style.display = 'none';

  const { meshX, meshZ } = localToMesh(2430, 2480);
  const targetY = (-3613.0 - minElev) * currentExag;
  camera.position.set(meshX + 180, targetY + 700, meshZ + 900);
  controls.target.set(meshX, targetY, meshZ);
  controls.update();
}

// --- Reset Customization to Standard Defaults ---
function resetCustomizationToStandard() {
  // 1. Terrain satellite
  if (lyrSat) {
    lyrSat.checked = true;
    if (terrainMesh) terrainMesh.visible = true;
  }

  // 2. Vertical Exaggeration -> 1.0x
  if (exagSlider) {
    exagSlider.value = 1.0;
    applyVerticalExaggeration(1.0);
  }

  // 3. Slope Hazard -> off, 65% opacity
  if (lyrSlope) {
    lyrSlope.checked = false;
    if (hazardMesh) hazardMesh.visible = false;
  }
  if (slopeOpacity) {
    slopeOpacity.value = 65;
    if (slopeOv) slopeOv.textContent = '65 %';
    if (hazardMesh) hazardMesh.material.opacity = 0.65;
  }

  // 4. CRISM Hydrated -> off, 80% opacity
  if (lyrCrismHyd) {
    lyrCrismHyd.checked = false;
    if (crismHydMesh) crismHydMesh.visible = false;
  }
  if (crismHydOpacity) {
    crismHydOpacity.value = 80;
    if (crismHydOv) crismHydOv.textContent = '80 %';
    if (crismHydMesh) crismHydMesh.material.opacity = 0.8;
  }

  // 5. CRISM Phyllosilicates -> off, 80% opacity
  if (lyrCrismPhy) {
    lyrCrismPhy.checked = false;
    if (crismPhyMesh) crismPhyMesh.visible = false;
  }
  if (crismPhyOpacity) {
    crismPhyOpacity.value = 80;
    if (crismPhyOv) crismPhyOv.textContent = '80 %';
    if (crismPhyMesh) crismPhyMesh.material.opacity = 0.8;
  }

  // 6. THEMIS -> off, 70% opacity
  if (lyrThemis) {
    lyrThemis.checked = false;
    if (themisMesh) themisMesh.visible = false;
  }
  if (themisOpacity) {
    themisOpacity.value = 70;
    if (themisOv) themisOv.textContent = '70 %';
    if (themisMesh) themisMesh.material.opacity = 0.7;
  }

  // 7. Route & markers -> visible, slope color mode
  if (lyrRoute) {
    lyrRoute.checked = true;
    if (routeGroup) routeGroup.visible = true;
    if (scienceMarkersGroup) scienceMarkersGroup.visible = true;
    if (startFlagGroup) startFlagGroup.visible = true;
  }
  if (lyrBoxwork) {
    lyrBoxwork.checked = true;
    if (boxworkGroup) boxworkGroup.visible = true;
  }
  if (routeColorMode) {
    routeColorMode.value = 'slope';
    updateRouteColoring();
  }

  // 8. Atmosphere: Time 14:00, Dust on
  if (timeSlider) {
    timeSlider.value = 14.0;
    updateTimeOfDay(14.0);
  }
  if (lyrDust) {
    lyrDust.checked = true;
    if (dustParticles) dustParticles.visible = true;
  }

  // 9. Unpin Inspector & Reticle
  isPinned = false;
  pinnedPoint = null;
  if (inspectorMode) inspectorMode.textContent = '(hover)';
  if (inspectorUnpin) inspectorUnpin.style.display = 'none';
  if (pinnedReticle) pinnedReticle.visible = false;

  // 10. Reset Camera Orbit
  controls.target.set(0, ((-3772.0 - minElev) * currentExag), 0);
  camera.position.set(0, 3400, 3900);
  controls.update();

  // 11. Reset Route Planner
  plannerStart = { x: 3467.35, y: 4999.58 };
  plannerGoal = { x: 2432.1, y: 2479.0 };
  isSettingStart = false;
  isSettingGoal = false;
  if (btnSetStart) btnSetStart.classList.remove('active');
  if (btnSetGoal) btnSetGoal.classList.remove('active');
  updateStartAndGoalMarkerPositions();
  requestRouteComputation();
  selectCandidate('safest');
  if (plannerPanel && plannerPanel.classList.contains('collapsed')) {
    plannerPanel.classList.remove('collapsed');
    if (btnTogglePlanner) btnTogglePlanner.textContent = '▼ Collapse';
  }

  // Button feedback animation
  if (btnResetCustom) {
    const origText = btnResetCustom.innerHTML;
    btnResetCustom.innerHTML = '✓ Customizations Reset';
    btnResetCustom.style.background = 'rgba(46, 204, 113, 0.25)';
    btnResetCustom.style.borderColor = '#2ecc71';
    btnResetCustom.style.color = '#2ecc71';
    setTimeout(() => {
      btnResetCustom.innerHTML = origText;
      btnResetCustom.style.background = '';
      btnResetCustom.style.borderColor = '';
      btnResetCustom.style.color = '';
    }, 1200);
  }
}

// --- Route Planner Engine & UI ---
let toastTimeout = null;
function showPlannerToast(message) {
  if (!plannerToast) return;
  plannerToast.textContent = message;
  plannerToast.classList.remove('hidden');
  plannerToast.style.display = 'block';
  plannerToast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    plannerToast.style.opacity = '0';
    setTimeout(() => {
      plannerToast.classList.add('hidden');
      plannerToast.style.display = 'none';
    }, 250);
  }, 3500);
}

function createStartAndGoalMarkers() {
  plannerGroup = new THREE.Group();
  scene.add(plannerGroup);

  // 1. START Marker (Green theme)
  startMarker = new THREE.Group();
  const sRingGeo = new THREE.RingGeometry(16, 22, 32);
  sRingGeo.rotateX(-Math.PI / 2);
  const sRingMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide, depthWrite: false });
  startMarker.add(new THREE.Mesh(sRingGeo, sRingMat));

  const sPole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 55, 8),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 })
  );
  sPole.position.y = 27.5;
  startMarker.add(sPole);

  const sFlagShape = new THREE.Shape();
  sFlagShape.moveTo(0, 0);
  sFlagShape.lineTo(28, -10);
  sFlagShape.lineTo(0, -20);
  sFlagShape.closePath();
  const sFlag = new THREE.Mesh(
    new THREE.ShapeGeometry(sFlagShape),
    new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide })
  );
  sFlag.position.set(0, 52, 0);
  startMarker.add(sFlag);

  const sBeacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(6.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 0.6 })
  );
  sBeacon.position.y = 57;
  startMarker.add(sBeacon);
  plannerGroup.add(startMarker);

  // 2. GOAL Marker (Gold theme)
  goalMarker = new THREE.Group();
  const gRingGeo1 = new THREE.RingGeometry(10, 16, 32);
  gRingGeo1.rotateX(-Math.PI / 2);
  const gRingMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, side: THREE.DoubleSide, depthWrite: false });
  goalMarker.add(new THREE.Mesh(gRingGeo1, gRingMat));

  const gRingGeo2 = new THREE.RingGeometry(22, 27, 32);
  gRingGeo2.rotateX(-Math.PI / 2);
  goalMarker.add(new THREE.Mesh(gRingGeo2, gRingMat));

  const gNeedle = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 8),
    new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.8 })
  );
  gNeedle.position.y = 30;
  goalMarker.add(gNeedle);

  const gBeacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(8, 0),
    new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xf1c40f, emissiveIntensity: 0.8 })
  );
  gBeacon.position.y = 64;
  goalMarker.add(gBeacon);
  plannerGroup.add(goalMarker);

  // 3. Profile Hover Marker (slides along route in 3D when hovering chart)
  profileMarker = new THREE.Group();
  const pRingGeo = new THREE.RingGeometry(14, 18, 32);
  pRingGeo.rotateX(-Math.PI / 2);
  const pRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, depthWrite: false });
  profileMarker.add(new THREE.Mesh(pRingGeo, pRingMat));
  const pSphere = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );
  pSphere.position.y = 6;
  profileMarker.add(pSphere);
  profileMarker.visible = false;
  plannerGroup.add(profileMarker);

  updateStartAndGoalMarkerPositions();
}

function updateStartAndGoalMarkerPositions() {
  if (!rawHeights) return;
  if (startMarker) {
    const { meshX, meshZ } = localToMesh(plannerStart.x, plannerStart.y);
    const { col, row } = localToGrid(plannerStart.x, plannerStart.y);
    const elev = sampleGridBilinear(rawHeights, col, row);
    startMarker.position.set(meshX, (elev - minElev) * currentExag, meshZ);
  }
  if (goalMarker) {
    const { meshX, meshZ } = localToMesh(plannerGoal.x, plannerGoal.y);
    const { col, row } = localToGrid(plannerGoal.x, plannerGoal.y);
    const elev = sampleGridBilinear(rawHeights, col, row);
    goalMarker.position.set(meshX, (elev - minElev) * currentExag, meshZ);
  }
}

function requestRouteComputation() {
  if (!routeWorker) return;
  if (plannerStatus) plannerStatus.textContent = 'Computing optimal routes (A*)…';
  routeWorker.postMessage({
    type: 'compute',
    start: plannerStart,
    goal: plannerGoal
  });
}

function buildCandidateRouteLines(candidates) {
  if (!plannerGroup) return;

  candidates.forEach(c => {
    if (c.error || !c.waypoints || c.waypoints.length === 0) {
      if (candidateLines[c.id]) {
        candidateLines[c.id].visible = false;
      }
      return;
    }

    const positions = [];
    c.waypoints.forEach(wp => {
      const { meshX, meshZ } = localToMesh(wp.x, wp.y);
      const meshY = (wp.z - minElev) * currentExag + 8.5 * currentExag;
      positions.push(meshX, meshY, meshZ);
    });

    if (candidateLines[c.id]) {
      const line = candidateLines[c.id];
      line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      line.geometry.attributes.position.needsUpdate = true;
      line.userData.waypoints = c.waypoints;
      line.visible = true;
    } else {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(c.color),
        linewidth: c.id === selectedCandidateId ? 4 : 2,
        transparent: true,
        opacity: c.id === selectedCandidateId ? 1.0 : 0.35,
        depthTest: true,
        depthWrite: false
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { isCandidateLine: true, id: c.id, waypoints: c.waypoints, color: c.color };
      plannerGroup.add(line);
      candidateLines[c.id] = line;
    }
  });

  selectCandidate(selectedCandidateId);
}

function selectCandidate(id) {
  selectedCandidateId = id;

  // 1. Highlight selected 3D line, dim others
  Object.keys(candidateLines).forEach(candId => {
    const line = candidateLines[candId];
    if (candId === id) {
      line.material.opacity = 1.0;
      line.material.linewidth = 4;
      line.renderOrder = 10;
    } else {
      line.material.opacity = 0.35;
      line.material.linewidth = 2;
      line.renderOrder = 5;
    }
  });

  // 2. Highlight table row
  document.querySelectorAll('#planner-tbody tr').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.id === id);
  });

  // 3. Update Elevation Profile
  const cand = plannerCandidates.find(c => c.id === id);
  if (cand && !cand.error) {
    if (profileRouteName) {
      profileRouteName.textContent = cand.name.toUpperCase();
      profileRouteName.style.color = cand.color;
    }
    drawElevationChart(cand);
  }
}

function drawElevationChart(candidate) {
  if (!elevationChart || !candidate || !candidate.elevationProfile) return;
  const ctx = elevationChart.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = elevationChart.clientWidth || 940;
  const height = elevationChart.clientHeight || 70;

  elevationChart.width = width * dpr;
  elevationChart.height = height * dpr;
  ctx.scale(dpr, dpr);

  const profile = candidate.elevationProfile;
  if (profile.length < 2) return;

  const padLeft = 46;
  const padRight = 18;
  const padTop = 10;
  const padBottom = 16;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  let minZ = Infinity;
  let maxZ = -Infinity;
  profile.forEach(p => {
    if (p.elev < minZ) minZ = p.elev;
    if (p.elev > maxZ) maxZ = p.elev;
  });
  minZ = Math.floor(minZ / 50) * 50 - 10;
  maxZ = Math.ceil(maxZ / 50) * 50 + 10;
  const maxDist = profile[profile.length - 1].distKm;

  // Background
  ctx.fillStyle = 'rgba(8, 12, 18, 0.85)';
  ctx.fillRect(0, 0, width, height);

  // Horizontal Grid Lines & Elevation Labels
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#778899';
  ctx.font = '8.5px monospace';
  ctx.textAlign = 'right';

  const zStep = 50;
  for (let z = minZ + 10; z <= maxZ; z += zStep) {
    const y = padTop + (1.0 - (z - minZ) / (maxZ - minZ)) * plotH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(z)}m`, padLeft - 4, y + 3);
  }

  // Distance X labels
  ctx.textAlign = 'center';
  const distSteps = 4;
  for (let s = 0; s <= distSteps; s++) {
    const d = (s / distSteps) * maxDist;
    const x = padLeft + (s / distSteps) * plotW;
    ctx.fillText(`${d.toFixed(1)}km`, x, height - 3);
  }

  // Draw filled gradient under curve
  ctx.save();
  ctx.beginPath();
  const getX = p => padLeft + (p.distKm / maxDist) * plotW;
  const getY = p => padTop + (1.0 - (p.elev - minZ) / (maxZ - minZ)) * plotH;

  ctx.moveTo(getX(profile[0]), getY(profile[0]));
  for (let i = 1; i < profile.length; i++) {
    ctx.lineTo(getX(profile[i]), getY(profile[i]));
  }
  ctx.lineTo(getX(profile[profile.length - 1]), padTop + plotH);
  ctx.lineTo(padLeft, padTop + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
  grad.addColorStop(0, 'rgba(0, 210, 255, 0.22)');
  grad.addColorStop(1, 'rgba(0, 210, 255, 0.01)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Draw polyline segments colored by slope tier
  ctx.lineWidth = 2.5;
  for (let i = 1; i < profile.length; i++) {
    const p0 = profile[i - 1];
    const p1 = profile[i];
    ctx.beginPath();
    ctx.moveTo(getX(p0), getY(p0));
    ctx.lineTo(getX(p1), getY(p1));
    if (p1.tier === 'easy') ctx.strokeStyle = '#2ecc71';
    else if (p1.tier === 'mod') ctx.strokeStyle = '#f1c40f';
    else ctx.strokeStyle = '#e74c3c';
    ctx.stroke();
  }
}

function bindElevationChartHover() {
  if (!elevationChart) return;

  elevationChart.addEventListener('mousemove', e => {
    const cand = plannerCandidates.find(c => c.id === selectedCandidateId);
    if (!cand || !cand.elevationProfile || cand.elevationProfile.length < 2) return;

    const rect = elevationChart.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const width = elevationChart.clientWidth;
    const padLeft = 46;
    const padRight = 18;
    const plotW = width - padLeft - padRight;

    const clampedX = Math.max(padLeft, Math.min(width - padRight, mouseX));
    const fraction = (clampedX - padLeft) / plotW;
    const profile = cand.elevationProfile;
    const maxDist = profile[profile.length - 1].distKm;
    const targetDist = fraction * maxDist;

    let closest = profile[0];
    let minD = Infinity;
    profile.forEach(p => {
      const d = Math.abs(p.distKm - targetDist);
      if (d < minD) { minD = d; closest = p; }
    });

    drawElevationChart(cand);

    const ctx = elevationChart.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    const height = elevationChart.clientHeight;
    const padTop = 10;
    const padBottom = 16;
    const plotH = height - padTop - padBottom;
    let minZ = Infinity;
    let maxZ = -Infinity;
    profile.forEach(p => {
      if (p.elev < minZ) minZ = p.elev;
      if (p.elev > maxZ) maxZ = p.elev;
    });
    minZ = Math.floor(minZ / 50) * 50 - 10;
    maxZ = Math.ceil(maxZ / 50) * 50 + 10;

    const cx = padLeft + (closest.distKm / maxDist) * plotW;
    const cy = padTop + (1.0 - (closest.elev - minZ) / (maxZ - minZ)) * plotH;

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, padTop);
    ctx.lineTo(cx, height - padBottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();

    const tierStr = closest.tier === 'easy' ? '<15° Easy' : (closest.tier === 'mod' ? '15°–25° Mod' : '>25° Haz');
    if (profileHoverInfo) {
      profileHoverInfo.textContent = `${closest.distKm.toFixed(2)} km | Elev ${closest.elev.toFixed(1)} m | Slope ${closest.slope.toFixed(1)}° (${tierStr})`;
    }

    if (profileMarker && rawHeights) {
      const { meshX, meshZ } = localToMesh(closest.x, closest.y);
      const meshY = (closest.elev - minElev) * currentExag + 8.5 * currentExag;
      profileMarker.position.set(meshX, meshY, meshZ);
      profileMarker.visible = true;
    }
  });

  elevationChart.addEventListener('mouseleave', () => {
    const cand = plannerCandidates.find(c => c.id === selectedCandidateId);
    if (cand) drawElevationChart(cand);
    if (profileHoverInfo) {
      profileHoverInfo.textContent = 'Hover chart to inspect elevation & map location';
    }
    if (profileMarker) profileMarker.visible = false;
  });
}

function renderPlannerTable(candidates) {
  if (!plannerTbody) return;
  plannerTbody.innerHTML = '';

  candidates.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = `route-row ${c.id === selectedCandidateId ? 'selected' : ''}`;
    tr.dataset.id = c.id;

    if (c.error) {
      tr.innerHTML = `
        <td><div class="route-cell"><span class="route-swatch" style="background:${c.color}"></span>${c.name}</div></td>
        <td><span class="badge-best ${c.id}">${c.bestFor}</span></td>
        <td colspan="10" style="color:#e74c3c;font-style:italic;">No safe route found</td>
      `;
    } else {
      tr.innerHTML = `
        <td><div class="route-cell"><span class="route-swatch" style="background:${c.color}"></span>${c.name}</div></td>
        <td><span class="badge-best ${c.id}">${c.bestFor}</span></td>
        <td>${c.distKm.toFixed(2)}</td>
        <td>+${c.ascentM.toFixed(1)} / ${c.netElevM >= 0 ? '+' : ''}${c.netElevM.toFixed(1)}</td>
        <td>${c.maxSlopeDeg.toFixed(1)}°</td>
        <td><span class="tier-easy">${c.pctEasy.toFixed(1)}%</span> / <span class="tier-mod">${c.pctMod.toFixed(1)}%</span> / <span class="tier-haz">${c.pctHaz.toFixed(1)}%</span></td>
        <td>${c.timeHours.toFixed(1)} h</td>
        <td>${c.energyKwh.toFixed(2)} kWh</td>
        <td>${Math.round(c.radDoseUsv)} µSv</td>
        <td><strong>${c.sciScore}</strong></td>
        <td>${c.riskScore.toFixed(1)} <small>/ 100</small></td>
        <td style="text-align:center;"><input type="checkbox" class="cb-route-vis" data-id="${c.id}" checked></td>
      `;
    }

    tr.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      selectCandidate(c.id);
    });

    const cb = tr.querySelector('.cb-route-vis');
    if (cb) {
      cb.addEventListener('change', e => {
        if (candidateLines[c.id]) {
          candidateLines[c.id].visible = e.target.checked;
        }
      });
    }

    plannerTbody.appendChild(tr);
  });
}

// --- UI Event Listeners ---
function bindUIEvents() {
  // Panel Toggles
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const panel = document.getElementById(targetId);
      if (panel) {
        panel.classList.toggle('open');
        btn.textContent = panel.classList.contains('open')
          ? (panel.classList.contains('right') ? '▶' : '◀')
          : (panel.classList.contains('right') ? '◀' : '▶');
      }
    });
  });

  // Layer Toggles & Opacity Sliders
  if (lyrSat) lyrSat.addEventListener('change', () => { if (terrainMesh) terrainMesh.visible = lyrSat.checked; });
  if (exagSlider) exagSlider.addEventListener('input', e => applyVerticalExaggeration(parseFloat(e.target.value)));

  if (lyrSlope) lyrSlope.addEventListener('change', () => { if (hazardMesh) hazardMesh.visible = lyrSlope.checked; });
  if (slopeOpacity) slopeOpacity.addEventListener('input', e => {
    slopeOv.textContent = `${e.target.value} %`;
    if (hazardMesh) hazardMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrCrismHyd) lyrCrismHyd.addEventListener('change', () => { if (crismHydMesh) crismHydMesh.visible = lyrCrismHyd.checked; });
  if (crismHydOpacity) crismHydOpacity.addEventListener('input', e => {
    crismHydOv.textContent = `${e.target.value} %`;
    if (crismHydMesh) crismHydMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrCrismPhy) lyrCrismPhy.addEventListener('change', () => { if (crismPhyMesh) crismPhyMesh.visible = lyrCrismPhy.checked; });
  if (crismPhyOpacity) crismPhyOpacity.addEventListener('input', e => {
    crismPhyOv.textContent = `${e.target.value} %`;
    if (crismPhyMesh) crismPhyMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrThemis) lyrThemis.addEventListener('change', () => { if (themisMesh) themisMesh.visible = lyrThemis.checked; });
  if (themisOpacity) themisOpacity.addEventListener('input', e => {
    themisOv.textContent = `${e.target.value} %`;
    if (themisMesh) themisMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrRoute) lyrRoute.addEventListener('change', () => {
    if (routeGroup) routeGroup.visible = lyrRoute.checked;
    if (scienceMarkersGroup) scienceMarkersGroup.visible = lyrRoute.checked;
    if (startFlagGroup) startFlagGroup.visible = lyrRoute.checked;
  });

  if (lyrBoxwork) lyrBoxwork.addEventListener('change', () => {
    if (boxworkGroup) boxworkGroup.visible = lyrBoxwork.checked;
  });

  if (routeColorMode) routeColorMode.addEventListener('change', updateRouteColoring);

  if (timeSlider) timeSlider.addEventListener('input', e => updateTimeOfDay(parseFloat(e.target.value)));
  if (lyrDust) lyrDust.addEventListener('change', () => { if (dustParticles) dustParticles.visible = lyrDust.checked; });

  if (qualityPreset) qualityPreset.addEventListener('change', e => {
    currentQuality = e.target.value;
    const cfg = QUALITY_SETTINGS[currentQuality];
    renderer.setPixelRatio(cfg.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (satTexture) createTerrainLayers(satTexture, hazardMesh.material.map, crismHydMesh.material.map, crismPhyMesh.material.map, themisMesh.material.map);
    createDustParticles();
  });

  if (btnResetCustom) btnResetCustom.addEventListener('click', resetCustomizationToStandard);

  if (btnReset) btnReset.addEventListener('click', () => {
    controls.target.set(0, ((-3772.0 - minElev) * currentExag), 0);
    camera.position.set(0, 3400, 3900);
    controls.update();
  });

  if (btnBoxwork) btnBoxwork.addEventListener('click', () => {
    const { meshX, meshZ } = localToMesh(2430, 2480);
    const targetY = (-3613.0 - minElev) * currentExag;
    controls.target.set(meshX, targetY, meshZ);
    camera.position.set(meshX + 180, targetY + 700, meshZ + 900);
    controls.update();
  });

  if (btnSkipIntro) btnSkipIntro.addEventListener('click', endCinematicIntro);
  controls.addEventListener('start', () => { if (isIntroActive) endCinematicIntro(); });

  // Timeline Controls
  if (btnPlay) btnPlay.addEventListener('click', () => {
    isPlaying = !isPlaying;
    btnPlay.textContent = isPlaying ? '⏸' : '▶';
    lastReplayTime = performance.now();
  });

  if (tlSlider) tlSlider.addEventListener('input', e => {
    isPlaying = false;
    if (btnPlay) btnPlay.textContent = '▶';
    updateTimelineReplay(parseFloat(e.target.value));
  });

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      replaySpeed = parseFloat(btn.dataset.sp);
    });
  });

  // Route Planner Controls
  if (btnSetStart) {
    btnSetStart.addEventListener('click', () => {
      isSettingStart = !isSettingStart;
      isSettingGoal = false;
      btnSetStart.classList.toggle('active', isSettingStart);
      if (btnSetGoal) btnSetGoal.classList.remove('active');
      if (isSettingStart) {
        showPlannerToast('📍 Click anywhere on terrain to set custom START (Esc to cancel)');
      }
    });
  }

  if (btnSetGoal) {
    btnSetGoal.addEventListener('click', () => {
      isSettingGoal = !isSettingGoal;
      isSettingStart = false;
      btnSetGoal.classList.toggle('active', isSettingGoal);
      if (btnSetStart) btnSetStart.classList.remove('active');
      if (isSettingGoal) {
        showPlannerToast('🎯 Click anywhere on terrain to set custom GOAL (Esc to cancel)');
      }
    });
  }

  if (btnResetPlan) {
    btnResetPlan.addEventListener('click', () => {
      plannerStart = { x: 3467.35, y: 4999.58 };
      plannerGoal = { x: 2432.1, y: 2479.0 };
      isSettingStart = false;
      isSettingGoal = false;
      if (btnSetStart) btnSetStart.classList.remove('active');
      if (btnSetGoal) btnSetGoal.classList.remove('active');
      updateStartAndGoalMarkerPositions();
      requestRouteComputation();
      showPlannerToast('↺ Start and Goal reset to default locations');
    });
  }

  if (btnTogglePlanner && plannerPanel) {
    btnTogglePlanner.addEventListener('click', () => {
      plannerPanel.classList.toggle('collapsed');
      btnTogglePlanner.textContent = plannerPanel.classList.contains('collapsed') ? '▲ Expand' : '▼ Collapse';
    });
  }

  bindElevationChartHover();

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (isSettingStart || isSettingGoal) {
        isSettingStart = false;
        isSettingGoal = false;
        if (btnSetStart) btnSetStart.classList.remove('active');
        if (btnSetGoal) btnSetGoal.classList.remove('active');
        showPlannerToast('Cancelled endpoint selection');
      }
    }
  });

  // Inspector Pin / Unpin
  if (inspectorUnpin) inspectorUnpin.addEventListener('click', () => {
    isPinned = false;
    pinnedPoint = null;
    inspectorMode.textContent = '(hover)';
    inspectorUnpin.style.display = 'none';
    if (pinnedReticle) pinnedReticle.visible = false;
  });

  // Canvas Click: Pin point, set start/goal, or select route
  renderer.domElement.addEventListener('click', () => {
    raycaster.setFromCamera(mouse, camera);

    // 0. Setting START or GOAL
    if (isSettingStart || isSettingGoal) {
      const hit = getTerrainIntersection(raycaster.ray);
      if (hit) {
        const { col, row } = localToGrid(hit.lx, hit.ly);
        const slope = sampleGridBilinear(rawSlopes, col, row);

        if (slope > 25.0) {
          showPlannerToast(`⚠️ Cannot place ${isSettingStart ? 'START' : 'GOAL'} on hazardous terrain (${slope.toFixed(1)}° slope). Choose a safe cell (<25°).`);
          return;
        }

        if (isSettingStart) {
          plannerStart = { x: hit.lx, y: hit.ly };
          isSettingStart = false;
          if (btnSetStart) btnSetStart.classList.remove('active');
          showPlannerToast(`✓ START placed at X: ${Math.round(hit.lx)} m, Y: ${Math.round(hit.ly)} m`);
        } else {
          plannerGoal = { x: hit.lx, y: hit.ly };
          isSettingGoal = false;
          if (btnSetGoal) btnSetGoal.classList.remove('active');
          showPlannerToast(`✓ GOAL placed at X: ${Math.round(hit.lx)} m, Y: ${Math.round(hit.ly)} m`);
        }

        updateStartAndGoalMarkerPositions();
        requestRouteComputation();
      }
      return;
    }

    // 1. Check clicking on Candidate Route Lines
    if (plannerGroup) {
      const hits = raycaster.intersectObjects(plannerGroup.children, true);
      for (let i = 0; i < hits.length; i++) {
        let obj = hits[i].object;
        while (obj && obj !== plannerGroup) {
          if (obj.userData && obj.userData.isCandidateLine) {
            selectCandidate(obj.userData.id);
            return;
          }
          obj = obj.parent;
        }
      }
    }

    // 2. Check Science Markers
    if (scienceMarkersGroup) {
      const hits = raycaster.intersectObjects(scienceMarkersGroup.children, false);
      if (hits.length > 0 && hits[0].object.userData.isSciencePin) {
        const u = hits[0].object.userData;
        popupTitle.textContent = u.title;
        popupSol.textContent = u.solLabel;
        sciencePopup.classList.remove('hidden');
        return;
      }
    }

    // 3. Pin clicked terrain point
    const hit = getTerrainIntersection(raycaster.ray);
    if (hit) {
      isPinned = true;
      pinnedPoint = { lx: hit.lx, ly: hit.ly };
      inspectorMode.textContent = '(pinned)';
      inspectorUnpin.style.display = 'block';
      updatePointInspector(hit.lx, hit.ly);
      if (pinnedReticle) {
        pinnedReticle.position.set(hit.x, hit.y + 2.0, hit.z);
        pinnedReticle.visible = true;
      }
      if (cursorReticle) cursorReticle.visible = false;
    }
  });

  if (popupClose) popupClose.addEventListener('click', () => sciencePopup.classList.add('hidden'));

  // Pointer Move & Leave
  window.addEventListener('pointermove', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      handlePointerInspection();
    }
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    if (cursorReticle && !isPinned) cursorReticle.visible = false;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Helper to draw image into an offscreen canvas for instantaneous pixel sampling
function createOffscreenContext(image) {
  const c = document.createElement('canvas');
  c.width = image.width || image.videoWidth || 27;
  c.height = image.height || image.videoHeight || 28;
  const ctx = c.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx;
}

function initRouteWorker() {
  console.log('--- initRouteWorker called ---');
  routeWorker = new Worker(new URL('./routeWorker.js', import.meta.url), { type: 'module' });

  // Subsample 1025x1025 to 257x257 (factor of 4, ~19.5m step)
  const N = 257;
  const subH = new Float32Array(N * N);
  const subS = new Float32Array(N * N);
  for (let r = 0; r < N; r++) {
    const origR = r * 4;
    for (let c = 0; c < N; c++) {
      const origC = c * 4;
      subH[r * N + c] = rawHeights[origR * 1025 + origC];
      subS[r * N + c] = rawSlopes[origR * 1025 + origC];
    }
  }

  // Precompute CRISM pixel centers (27x28)
  const crismPixels = [];
  for (let cy = 0; cy < 28; cy++) {
    for (let cx = 0; cx < 27; cx++) {
      const lx = (cx + 0.5) * (TERRAIN_WIDTH_M / 27.0);
      const ly = (28 - 1 - cy + 0.5) * (TERRAIN_HEIGHT_M / 28.0);
      crismPixels.push({ x: lx, y: ly });
    }
  }

  // Precompute science marker positions from SCIENCE_TARGETS
  const sciMarkers = SCIENCE_TARGETS.map(t => {
    let closestPt = routePoints[0];
    let minD = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const d = Math.abs(routePoints[i].sol - t.sol);
      if (d < minD) { minD = d; closestPt = routePoints[i]; }
    }
    return { x: closestPt.x, y: closestPt.y, sol: t.sol, title: t.title };
  });

  routeWorker.onmessage = function (e) {
    console.log('--- routeWorker onmessage ---', e.data.type);
    if (e.data.type === 'initialized') {
      requestRouteComputation();
    } else if (e.data.type === 'result') {
      plannerCandidates = e.data.candidates;
      lastComputeTimeMs = e.data.computeTimeMs;
      if (plannerStatus) {
        plannerStatus.textContent = `Generated 4 routes in ${lastComputeTimeMs} ms (A*)`;
      }
      renderPlannerTable(plannerCandidates);
      buildCandidateRouteLines(plannerCandidates);
    }
  };

  routeWorker.onerror = function (err) {
    console.error('RouteWorker error:', err);
    if (plannerStatus) plannerStatus.textContent = 'Error computing routes';
  };

  try {
    console.log('Posting init message to worker...', { N, sciCount: sciMarkers.length, crismCount: crismPixels.length });
    routeWorker.postMessage({
      type: 'init',
      gridSize: N,
      heights: subH.buffer,
      slopes: subS.buffer,
      sciMarkers,
      crismPixels,
      start: plannerStart,
      goal: plannerGoal
    }, [subH.buffer, subS.buffer]);
    console.log('Init message successfully dispatched to worker');
  } catch (postErr) {
    console.error('Error posting to routeWorker:', postErr);
  }
}

// --- Asset Loader & Application Entry ---
async function loadAssetsAndInit() {
  console.log('--- START loadAssetsAndInit ---');
  try {
    setupLights();
    bindUIEvents();
    updateTimeOfDay(14.0);

    // 1. Manifest
    loadingStatus.textContent = 'Reading terrain metadata…';
    progressBar.style.width = '15%';
    const manifestResp = await fetch('/data/manifest.json');
    const manifest = await manifestResp.json();
    if (manifest.elevation_summary) {
      minElev = manifest.elevation_summary.min_elevation_m;
      maxElev = manifest.elevation_summary.max_elevation_m;
    }

    // 2. Heightmap Binary
    loadingStatus.textContent = 'Downloading 1025×1025 elevation grid…';
    progressBar.style.width = '35%';
    const hResp = await fetch('/data/terrain_height.bin');
    rawHeights = new Float32Array(await hResp.arrayBuffer());

    // 3. Slope Binary
    loadingStatus.textContent = 'Downloading 5 m slope baseline grid…';
    progressBar.style.width = '55%';
    const sResp = await fetch('/data/slope_5m.bin');
    rawSlopes = new Float32Array(await sResp.arrayBuffer());

    // 4. Route JSON
    loadingStatus.textContent = 'Loading Curiosity traverse route…';
    progressBar.style.width = '70%';
    const rResp = await fetch('/data/route.json');
    const rData = await rResp.json();
    routePoints = rData.points;

    // 5. Textures (HiRISE, Slope, CRISM Hyd, CRISM Phy, THEMIS)
    loadingStatus.textContent = 'Downloading multi-spectral layers…';
    progressBar.style.width = '85%';
    const texLoader = new THREE.TextureLoader();

    function loadNearest(url) {
      return new Promise((res, rej) => {
        texLoader.load(url, t => {
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
          t.generateMipmaps = false;
          t.colorSpace = THREE.SRGBColorSpace;
          res(t);
        }, undefined, rej);
      });
    }

    const [satTex, slopeTex, crismHydTex, crismPhyTex, themisTex] = await Promise.all([
      new Promise((res, rej) => texLoader.load('/data/terrain_texture.png', t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, rej)),
      loadNearest('/data/slope_5m_classified.png'),
      loadNearest('/data/crism_hyd_crop.png'),
      loadNearest('/data/crism_phy_crop.png'),
      loadNearest('/data/themis_crop.png')
    ]);

    // Create offscreen contexts for pixel inspection
    crismHydCtx = createOffscreenContext(crismHydTex.image);
    crismPhyCtx = createOffscreenContext(crismPhyTex.image);
    themisCtx = createOffscreenContext(themisTex.image);

    // 6. Build Scene Objects
    loadingStatus.textContent = 'Building 3D terrain and layers…';
    progressBar.style.width = '95%';

    createTerrainLayers(satTex, slopeTex, crismHydTex, crismPhyTex, themisTex);
    createRouteAndRover();
    createScienceMarkersAndFlag();
    createBoxworkCoreZone();
    createDustParticles();
    createReticles();
    createStartAndGoalMarkers();
    initRouteWorker();

    // 7. Complete Loading
    progressBar.style.width = '100%';
    const totalLoadTime = Math.round(performance.now() - appStartTime);
    perfReadout.textContent = `FPS 60 | Load ${totalLoadTime} ms`;

    setTimeout(() => {
      loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
        startCinematicIntro();
      }, 500);
    }, 300);

    lastReplayTime = performance.now();
    animate();

  } catch (err) {
    console.error('Initialization error:', err);
    loadingStatus.textContent = `Error loading assets: ${err.message}`;
    loadingStatus.style.color = '#ff4444';
  }
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();

  // FPS Counter
  frameCount++;
  if (now - lastFpsUpdateTime >= 1000) {
    currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdateTime));
    const loadStr = perfReadout.textContent.split('|')[1] || '';
    perfReadout.textContent = `FPS ${currentFps} |${loadStr}`;
    frameCount = 0;
    lastFpsUpdateTime = now;
  }

  // Timeline Playback
  if (isPlaying) {
    const deltaSec = (now - lastReplayTime) / 1000.0;
    let nextSol = currentReplaySol + deltaSec * replaySpeed;
    if (nextSol > 4868) {
      nextSol = 4868;
      isPlaying = false;
      if (btnPlay) btnPlay.textContent = '▶';
    }
    updateTimelineReplay(nextSol);
  }
  lastReplayTime = now;

  // Pulsing Rover Beacon
  if (roverBeacon) {
    const s = 1.0 + 0.3 * Math.sin(now * 0.007);
    roverBeacon.scale.set(s, s, s);
    roverBeacon.material.opacity = 0.5 + 0.4 * Math.cos(now * 0.007);
  }

  // Animated 3D Targeting Cursor Reticle
  if (cursorReticle && cursorReticle.visible) {
    cursorReticle.rotation.y += 0.015;
    const pulse = 1.0 + 0.06 * Math.sin(now * 0.008);
    cursorReticle.scale.set(pulse, 1.0, pulse);
  }

  // Animated Pinned Beacon Reticle
  if (pinnedReticle && pinnedReticle.visible) {
    const pulseP = 1.0 + 0.1 * Math.sin(now * 0.006);
    if (pinnedReticle.children[0]) {
      pinnedReticle.children[0].scale.set(pulseP, pulseP, pulseP);
    }
    if (pinnedReticle.children[2]) {
      pinnedReticle.children[2].rotation.y += 0.02;
    }
  }

  // Animated Start and Goal Markers
  if (startMarker && startMarker.children[3]) {
    startMarker.children[3].rotation.y += 0.02;
  }
  if (goalMarker && goalMarker.children[3]) {
    goalMarker.children[3].rotation.y += 0.025;
    const pulseG = 1.0 + 0.08 * Math.sin(now * 0.007);
    if (goalMarker.children[0]) goalMarker.children[0].scale.set(pulseG, pulseG, pulseG);
  }

  // Dust Particle drift
  updateDustParticles();

  controls.update();
  renderer.render(scene, camera);
}

// Start application
loadAssetsAndInit();
