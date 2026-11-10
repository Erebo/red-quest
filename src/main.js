import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Performance & Timing Metrics ---
const appStartTime = performance.now();
let lastFpsUpdateTime = performance.now();
let frameCount = 0;
let currentFps = 60;

// --- Global Constants & Coordinate Bounds ---
const GRID_SIZE = 1025;
const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;
const WEST_EDGE_EASTING = 8140750.0;
const SOUTH_EDGE_NORTHING = -287375.0;
const MARS_RADIUS_M = 3396190.0;

const BOXWORK_SOL_START = 4600;
const BOXWORK_SOL_END = 4805;

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('progress-bar');
const btnSkipIntro = document.getElementById('btn-skip-intro');

const fpsValDisplay = document.getElementById('fps-val');
const loadValDisplay = document.getElementById('load-val');

// Controls
const exagSlider = document.getElementById('exag-slider');
const exagValueDisplay = document.getElementById('exag-value');

const timeSlider = document.getElementById('time-slider');
const timeValDisplay = document.getElementById('time-val');
const toggleDust = document.getElementById('toggle-dust');

// Layer Toggles & Opacity Sliders
const toggleSatellite = document.getElementById('toggle-satellite');

const toggleSlope = document.getElementById('toggle-slope');
const slopeOpacitySlider = document.getElementById('slope-opacity-slider');
const slopeOpacityVal = document.getElementById('slope-opacity-val');

const toggleCrismHyd = document.getElementById('toggle-crism-hyd');
const crismHydOpacitySlider = document.getElementById('crism-hyd-opacity-slider');
const crismHydOpacityVal = document.getElementById('crism-hyd-opacity-val');

const toggleCrismPhy = document.getElementById('toggle-crism-phy');
const crismPhyOpacitySlider = document.getElementById('crism-phy-opacity-slider');
const crismPhyOpacityVal = document.getElementById('crism-phy-opacity-val');

const toggleThemis = document.getElementById('toggle-themis');
const themisOpacitySlider = document.getElementById('themis-opacity-slider');
const themisOpacityVal = document.getElementById('themis-opacity-val');

const toggleRoute = document.getElementById('toggle-route');
const toggleBoxwork = document.getElementById('toggle-boxwork');

const btnResetCam = document.getElementById('btn-reset-cam');
const btnFocusBoxwork = document.getElementById('btn-focus-boxwork');

// Timeline Replay Controls
const btnPlayPause = document.getElementById('btn-play-pause');
const timelineSlider = document.getElementById('timeline-slider');
const timelineSolBadge = document.getElementById('timeline-sol-badge');
const speedButtons = document.querySelectorAll('.speed-btn');

const tStatSol = document.getElementById('t-stat-sol');
const tStatElev = document.getElementById('t-stat-elev');
const tStatDist = document.getElementById('t-stat-dist');
const tStatClimb = document.getElementById('t-stat-climb');

// Hover Readout Elements
const readoutElev = document.getElementById('readout-elev');
const readoutSlope = document.getElementById('readout-slope');
const readoutHazard = document.getElementById('readout-hazard');
const readoutSol = document.getElementById('readout-sol');
const readoutLocalCoords = document.getElementById('readout-local-coords');
const readoutGeoCoords = document.getElementById('readout-geo-coords');
const hoverStateBadge = document.getElementById('hover-state');

// Science Popup
const sciencePopup = document.getElementById('science-popup');
const popupTitle = document.getElementById('popup-title');
const popupSol = document.getElementById('popup-sol');
const popupCloseBtn = document.getElementById('popup-close');

// State Variables
let currentExag = 1.0;
let minElev = -4131.74;
let maxElev = -3412.51;
let rawHeights = null;
let rawSlopes = null;
let routeData = null;
let routePoints = [];

// Replay State
let isPlaying = false;
let replaySpeed = 5.0; // sols per real second
let currentReplaySol = 3721;
let lastReplayTime = 0;

// Meshes & Layers
let terrainGeometry = null;
let terrainMesh = null;
let hazardMesh = null;
let crismHydMesh = null;
let crismPhyMesh = null;
let themisMesh = null;

let routeGroup = null;
let activeTrailLine = null;
let futureTrailLine = null;
let roverTokenGroup = null;
let roverBeaconRing = null;
let boxworkGroup = null;
let scienceMarkersGroup = null;
let startFlagGroup = null;
let dustParticles = null;
let dustVelocities = [];

let hoverCursorMesh = null;
let nearestSolMarker = null;

// Camera & Lighting State
let cameraAnimId = null;
let isIntroActive = false;
let introStartTime = 0;
const INTRO_DURATION = 4000;

// Three.js Core Objects
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const initialFogColor = new THREE.Color(0x2a160e);
scene.background = initialFogColor;
scene.fog = new THREE.FogExp2(initialFogColor, 0.000075);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  10,
  50000
);
const initialCamPos = new THREE.Vector3(0, 3400, 3900);
const initialTarget = new THREE.Vector3(0, 360, 0);
camera.position.copy(initialCamPos);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.copy(initialTarget);
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 80;
controls.maxDistance = 22000;

controls.addEventListener('start', () => {
  if (cameraAnimId) {
    cancelAnimationFrame(cameraAnimId);
    cameraAnimId = null;
  }
  if (isIntroActive) {
    endCinematicIntro();
  }
});

// Raycasting for Hover Readout & Markers
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9999, -9999);
let isMouseOverCanvas = false;

// Lights
let sunLight = null;
let fillLight = null;
let ambientLight = null;
let hemiLight = null;

function setupLights() {
  ambientLight = new THREE.AmbientLight(0x5a443b, 1.1);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xffeedd, 0x1f140e, 0.7);
  scene.add(hemiLight);

  // Directional Mars Sun
  sunLight = new THREE.DirectionalLight(0xfff5ea, 2.4);
  sunLight.position.set(-3200, 4200, -3200);
  scene.add(sunLight);

  fillLight = new THREE.DirectionalLight(0xb08870, 0.6);
  fillLight.position.set(3500, 1800, 3000);
  scene.add(fillLight);
}

// --- Coordinate Mapping & Bilinear Sampling Helpers ---

function sampleGridBilinear(data, col, row) {
  const c = Math.max(0, Math.min(GRID_SIZE - 1, col));
  const r = Math.max(0, Math.min(GRID_SIZE - 1, row));

  const c0 = Math.floor(c);
  const c1 = Math.min(GRID_SIZE - 1, c0 + 1);
  const r0 = Math.floor(r);
  const r1 = Math.min(GRID_SIZE - 1, r0 + 1);

  const fc = c - c0;
  const fr = r - r0;

  const v00 = data[r0 * GRID_SIZE + c0];
  const v01 = data[r0 * GRID_SIZE + c1];
  const v10 = data[r1 * GRID_SIZE + c0];
  const v11 = data[r1 * GRID_SIZE + c1];

  const top = (1.0 - fc) * v00 + fc * v01;
  const bot = (1.0 - fc) * v10 + fc * v11;
  return (1.0 - fr) * top + fr * bot;
}

function localToGrid(lx, ly) {
  const col = (lx / TERRAIN_WIDTH_M) * (GRID_SIZE - 1);
  const row = (1.0 - (ly / TERRAIN_HEIGHT_M)) * (GRID_SIZE - 1);
  return { col, row };
}

function localToMesh(lx, ly) {
  const meshX = lx - TERRAIN_WIDTH_M / 2.0;
  const meshZ = TERRAIN_HEIGHT_M / 2.0 - ly;
  return { meshX, meshZ };
}

function meshToLocal(mx, mz) {
  const lx = mx + TERRAIN_WIDTH_M / 2.0;
  const ly = TERRAIN_HEIGHT_M / 2.0 - mz;
  return {
    lx: Math.max(0, Math.min(TERRAIN_WIDTH_M, lx)),
    ly: Math.max(0, Math.min(TERRAIN_HEIGHT_M, ly))
  };
}

function localToMarsGeo(lx, ly) {
  const easting = WEST_EDGE_EASTING + lx;
  const northing = SOUTH_EDGE_NORTHING + ly;
  const lon = (easting / MARS_RADIUS_M) * (180.0 / Math.PI);
  const lat = (northing / MARS_RADIUS_M) * (180.0 / Math.PI);
  return { easting, northing, lon, lat };
}

// --- Terrain & Draped Overlay Layers ---

let satelliteTexRef = null;

function createTerrainAndDrapedLayers(satTex, slopeTex, crismHydTex, crismPhyTex, themisTex) {
  satelliteTexRef = satTex;

  // 1. Shared Base Geometry (1025 x 1025 vertices)
  terrainGeometry = new THREE.PlaneGeometry(
    TERRAIN_WIDTH_M,
    TERRAIN_HEIGHT_M,
    GRID_SIZE - 1,
    GRID_SIZE - 1
  );
  terrainGeometry.rotateX(-Math.PI / 2);

  const posAttr = terrainGeometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const elev = rawHeights[i];
    posAttr.setY(i, (elev - minElev) * currentExag);
  }
  posAttr.needsUpdate = true;
  terrainGeometry.computeVertexNormals();

  // 2. Base Satellite Mesh
  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: satTex,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: false
  });
  terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrainMesh.name = 'MarsTerrain';
  scene.add(terrainMesh);

  // 3. Slope Hazard Overlay Mesh
  const hazardMaterial = new THREE.MeshBasicMaterial({
    map: slopeTex,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  hazardMesh = new THREE.Mesh(terrainGeometry, hazardMaterial);
  hazardMesh.name = 'SlopeHazardOverlay';
  hazardMesh.visible = toggleSlope.checked;
  scene.add(hazardMesh);

  // 4. CRISM Hydrated Minerals Mesh (Nearest Neighbour, Alpha Coverage Mask)
  const crismHydMaterial = new THREE.MeshBasicMaterial({
    map: crismHydTex,
    transparent: true,
    opacity: 0.80,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  crismHydMesh = new THREE.Mesh(terrainGeometry, crismHydMaterial);
  crismHydMesh.name = 'CRISM_Hydrated';
  crismHydMesh.visible = toggleCrismHyd.checked;
  scene.add(crismHydMesh);

  // 5. CRISM Phyllosilicates Mesh (Nearest Neighbour, Alpha Coverage Mask)
  const crismPhyMaterial = new THREE.MeshBasicMaterial({
    map: crismPhyTex,
    transparent: true,
    opacity: 0.80,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  crismPhyMesh = new THREE.Mesh(terrainGeometry, crismPhyMaterial);
  crismPhyMesh.name = 'CRISM_Phyllosilicates';
  crismPhyMesh.visible = toggleCrismPhy.checked;
  scene.add(crismPhyMesh);

  // 6. THEMIS Thermal Brightness Mesh (100 m/px)
  const themisMaterial = new THREE.MeshBasicMaterial({
    map: themisTex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  themisMesh = new THREE.Mesh(terrainGeometry, themisMaterial);
  themisMesh.name = 'THEMIS_Thermal';
  themisMesh.visible = toggleThemis.checked;
  scene.add(themisMesh);
}

// --- Route, Glowing Trail, Rover Token & Waypoints ---

function createRouteAndRover() {
  routeGroup = new THREE.Group();
  routeGroup.name = 'RouteGroup';

  // Precompute cumulative 3D distance and cumulative climb for each route point
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
    const stepDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    cumDist += stepDist;
    if (dz > 0) cumClimb += dz;

    p1.cumDist = cumDist;
    p1.cumClimb = cumClimb;
  }

  // Build vertex positions & colors for full route
  const positions = [];
  const activeColors = [];
  const futureColors = [];

  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    const { meshX, meshZ } = localToMesh(pt.x, pt.y);
    const meshY = (pt.elevation - minElev) * currentExag + 3.5 * currentExag;
    positions.push(meshX, meshY, meshZ);

    if (pt.sol >= BOXWORK_SOL_START && pt.sol <= BOXWORK_SOL_END) {
      activeColors.push(1.0, 0.0, 0.5); // Magenta for Boxwork
      futureColors.push(0.4, 0.0, 0.2);
    } else {
      activeColors.push(0.0, 0.9, 1.0); // Cyan for Standard Traverse
      futureColors.push(0.0, 0.3, 0.4);
    }
  }

  // Active glowing trail (drawn up to current replay sol)
  const activeGeo = new THREE.BufferGeometry();
  activeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  activeGeo.setAttribute('color', new THREE.Float32BufferAttribute(activeColors, 3));
  const activeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: 3,
    depthTest: true
  });
  activeTrailLine = new THREE.Line(activeGeo, activeMat);
  routeGroup.add(activeTrailLine);

  // Future route trail (rendered dimmed)
  const futureGeo = new THREE.BufferGeometry();
  futureGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  futureGeo.setAttribute('color', new THREE.Float32BufferAttribute(futureColors, 3));
  const futureMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.25,
    depthTest: true
  });
  futureTrailLine = new THREE.Line(futureGeo, futureMat);
  routeGroup.add(futureTrailLine);

  // Rover 3D Marker Token
  roverTokenGroup = new THREE.Group();
  roverTokenGroup.name = 'RoverMarker';

  // Rover Chassis Body
  const bodyGeo = new THREE.BoxGeometry(14, 7, 10);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf1c40f,
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0x442200
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 4;
  roverTokenGroup.add(bodyMesh);

  // Camera Mast
  const mastGeo = new THREE.CylinderGeometry(0.8, 0.8, 10, 8);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });
  const mastMesh = new THREE.Mesh(mastGeo, mastMat);
  mastMesh.position.set(4, 9, 0);
  roverTokenGroup.add(mastMesh);

  // Direction Heading Arrow
  const arrowGeo = new THREE.ConeGeometry(3, 8, 8);
  arrowGeo.rotateX(Math.PI / 2);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.position.set(0, 10, -8);
  roverTokenGroup.add(arrowMesh);

  // Pulsing Halo Beacon Ring
  const beaconGeo = new THREE.RingGeometry(12, 18, 32);
  beaconGeo.rotateX(-Math.PI / 2);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85
  });
  roverBeaconRing = new THREE.Mesh(beaconGeo, beaconMat);
  roverBeaconRing.position.y = 1;
  roverTokenGroup.add(roverBeaconRing);

  // Rover Forward Spotlight
  const roverLight = new THREE.PointLight(0x00d2ff, 1.8, 80);
  roverLight.position.set(0, 8, -6);
  roverTokenGroup.add(roverLight);

  routeGroup.add(roverTokenGroup);
  scene.add(routeGroup);

  // Set initial rover position at Sol 3721
  updateTimelineReplay(3721);
}

// --- Science Milestones, Start Flag & Boxwork Core Zone ---

const SCIENCE_WAYPOINTS = [
  {
    targetSol: 4534,
    solLabel: 'Sol 4534',
    title: 'Boxwork campaign begins (Phase 1)',
    color: 0xff007f
  },
  {
    targetSol: 4602,
    solLabel: 'Sols 4602-4603',
    title: 'Top of the ridge, start of the main boxwork region',
    color: 0xf1c40f
  },
  {
    targetSol: 4604,
    solLabel: 'Sols 4604-4606',
    title: 'Main exposure of boxwork structures',
    color: 0x00d2ff
  },
  {
    targetSol: 4716,
    solLabel: 'Sols 4716-4722',
    title: 'Nevado Sajama drill',
    color: 0x2ecc71
  },
  {
    targetSol: 4804,
    solLabel: 'Sols 4804-4811',
    title: 'Nevado Sajama 2 drill',
    color: 0xe67e22
  }
];

function createScienceMarkersAndFlag() {
  scienceMarkersGroup = new THREE.Group();
  scienceMarkersGroup.name = 'ScienceMarkers';

  // 1. Map START Flag (North Edge Entry, Sol 3721)
  startFlagGroup = new THREE.Group();
  startFlagGroup.name = 'StartFlag';
  const startPt = routePoints[0];
  const { meshX: sX, meshZ: sZ } = localToMesh(startPt.x, startPt.y);
  const startY = (startPt.elevation - minElev) * currentExag;

  // Flagpole
  const poleGeo = new THREE.CylinderGeometry(1.2, 1.2, 48, 12);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });
  const poleMesh = new THREE.Mesh(poleGeo, poleMat);
  poleMesh.position.set(sX, startY + 24 * currentExag, sZ);
  startFlagGroup.add(poleMesh);

  // Banner Flag
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(24, -8);
  flagShape.lineTo(0, -16);
  flagShape.closePath();
  const flagGeo = new THREE.ShapeGeometry(flagShape);
  const flagMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide });
  const flagMesh = new THREE.Mesh(flagGeo, flagMat);
  flagMesh.position.set(sX, startY + 44 * currentExag, sZ);
  startFlagGroup.add(flagMesh);

  // Floating START marker sphere
  const startSphereGeo = new THREE.SphereGeometry(8, 16, 16);
  const startSphereMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
  const startSphere = new THREE.Mesh(startSphereGeo, startSphereMat);
  startSphere.position.set(sX, startY + 48 * currentExag, sZ);
  startFlagGroup.add(startSphere);

  scene.add(startFlagGroup);

  // 2. Science Milestone Markers
  SCIENCE_WAYPOINTS.forEach(item => {
    // Find closest route point
    let closestPt = routePoints[0];
    let minDiff = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const diff = Math.abs(routePoints[i].sol - item.targetSol);
      if (diff < minDiff) {
        minDiff = diff;
        closestPt = routePoints[i];
      }
    }

    const { meshX, meshZ } = localToMesh(closestPt.x, closestPt.y);
    const meshY = (closestPt.elevation - minElev) * currentExag + 6.0 * currentExag;

    // Diamond / Octahedron pin
    const pinGeo = new THREE.OctahedronGeometry(12, 0);
    const pinMat = new THREE.MeshStandardMaterial({
      color: item.color,
      emissive: item.color,
      emissiveIntensity: 0.6,
      metalness: 0.4,
      roughness: 0.2
    });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.set(meshX, meshY, meshZ);
    pinMesh.userData = {
      isSciencePin: true,
      title: item.title,
      solLabel: item.solLabel,
      pt: closestPt
    };
    scienceMarkersGroup.add(pinMesh);

    // Vertical beacon light beam
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 60, 8);
    const beamMat = new THREE.MeshBasicMaterial({
      color: item.color,
      transparent: true,
      opacity: 0.55
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(meshX, meshY + 30, meshZ);
    scienceMarkersGroup.add(beamMesh);

    // Glowing base ring
    const ringGeo = new THREE.RingGeometry(14, 20, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: item.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(meshX, meshY - 4 * currentExag, meshZ);
    scienceMarkersGroup.add(ringMesh);
  });

  scene.add(scienceMarkersGroup);
}

function createBoxworkCoreZone() {
  boxworkGroup = new THREE.Group();
  boxworkGroup.name = 'BoxworkCoreZone';

  // Exact 153 x 283 m core zone from sols 4600-4805:
  // X: [2355.6, 2508.6] (width = 153 m)
  // Y: [2337.5, 2620.5] (height = 283 m)
  const xMin = 2355.6;
  const xMax = 2508.6;
  const yMin = 2337.5;
  const yMax = 2620.5;

  const perimeterPoints = [];
  const stepsPerSide = 25;

  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMin + t * (xMax - xMin), y: yMin });
  }
  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMax, y: yMin + t * (yMax - yMin) });
  }
  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMax - t * (xMax - xMin), y: yMax });
  }
  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMin, y: yMax - t * (yMax - yMin) });
  }
  perimeterPoints.push(perimeterPoints[0]);

  const positions = [];
  perimeterPoints.forEach(p => {
    const { meshX, meshZ } = localToMesh(p.x, p.y);
    const { col, row } = localToGrid(p.x, p.y);
    const elev = sampleGridBilinear(rawHeights, col, row);
    const meshY = (elev - minElev) * currentExag + 4.0 * currentExag;
    positions.push(meshX, meshY, meshZ);
  });

  const boundaryGeo = new THREE.BufferGeometry();
  boundaryGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const boundaryMat = new THREE.LineBasicMaterial({
    color: 0xf1c40f,
    linewidth: 2,
    transparent: true,
    opacity: 0.95
  });

  const boundaryLine = new THREE.Line(boundaryGeo, boundaryMat);
  boundaryLine.name = 'BoxworkPerimeterLine';
  boxworkGroup.add(boundaryLine);

  scene.add(boxworkGroup);
}

// --- Atmosphere: Drifting Dust Particle System ---

function createDustParticles() {
  const DUST_COUNT = 1200;
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  dustVelocities = [];

  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 5000;
    dustPositions[i * 3 + 1] = Math.random() * 800 + 20;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 5000;

    dustVelocities.push({
      vx: (Math.random() - 0.3) * 1.5,
      vy: (Math.random() - 0.5) * 0.35,
      vz: (Math.random() - 0.5) * 1.2
    });
  }

  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xdf8858,
    size: 4.0,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  });

  dustParticles = new THREE.Points(dustGeo, dustMat);
  dustParticles.name = 'DriftingDust';
  dustParticles.visible = toggleDust.checked;
  scene.add(dustParticles);
}

function updateDustParticles() {
  if (!dustParticles || !toggleDust.checked) return;

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

// --- Hover Cursor Markers ---

function createHoverMarkers() {
  const cursorGeo = new THREE.RingGeometry(12, 18, 32);
  cursorGeo.rotateX(-Math.PI / 2);
  const cursorMat = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85
  });
  hoverCursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
  hoverCursorMesh.visible = false;
  scene.add(hoverCursorMesh);

  const solMarkerGeo = new THREE.SphereGeometry(10, 16, 16);
  const solMarkerMat = new THREE.MeshBasicMaterial({
    color: 0xff007f,
    transparent: true,
    opacity: 0.9
  });
  nearestSolMarker = new THREE.Mesh(solMarkerGeo, solMarkerMat);
  nearestSolMarker.visible = false;
  scene.add(nearestSolMarker);
}

// --- Time-of-Day Sun & Atmosphere Engine ---

function updateTimeOfDay(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour % 1) * 60);
  timeValDisplay.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

  // Solar angle: 6am = 0, 12pm = pi/2, 18pm = pi
  const solarAngle = ((hour - 6.0) / 12.0) * Math.PI;
  const sunElevation = Math.sin(solarAngle);
  const sunAzimuth = Math.cos(solarAngle);

  const sunDist = 5800;
  if (sunLight) {
    sunLight.position.set(
      -sunAzimuth * sunDist,
      Math.max(250, sunElevation * 4800),
      -1500 + sunAzimuth * 1200
    );

    // Warm daylight interpolation
    const t = Math.max(0.05, Math.sin(solarAngle));
    const sunColor = new THREE.Color().lerpColors(
      new THREE.Color(0xff6020),
      new THREE.Color(0xfff5ea),
      t
    );
    sunLight.color.copy(sunColor);
    sunLight.intensity = 0.6 + 2.0 * t;

    // Atmospheric Fog and Sky
    const fogColor = new THREE.Color().lerpColors(
      new THREE.Color(0x180b06), // Twilight amber
      new THREE.Color(0x351d14), // Noon warm Mars haze
      t
    );
    scene.fog.color.copy(fogColor);
    scene.background.copy(fogColor);
  }
}

// --- Timeline Replay Engine ---

function updateTimelineReplay(targetSol) {
  currentReplaySol = Math.max(3721, Math.min(4868, targetSol));
  timelineSlider.value = currentReplaySol;
  timelineSolBadge.textContent = `SOL ${Math.floor(currentReplaySol)}`;

  // Find latest route point index at or before currentReplaySol
  let ptIndex = 0;
  for (let i = 0; i < routePoints.length; i++) {
    if (routePoints[i].sol <= currentReplaySol) {
      ptIndex = i;
    } else {
      break;
    }
  }

  const curPt = routePoints[ptIndex];

  // Update Rover Token Position and Heading
  if (roverTokenGroup) {
    const { meshX, meshZ } = localToMesh(curPt.x, curPt.y);
    const meshY = (curPt.elevation - minElev) * currentExag + 3.0 * currentExag;
    roverTokenGroup.position.set(meshX, meshY, meshZ);

    // Rotate rover to face heading direction towards next waypoint
    if (ptIndex < routePoints.length - 1) {
      const nextPt = routePoints[ptIndex + 1];
      const { meshX: nX, meshZ: nZ } = localToMesh(nextPt.x, nextPt.y);
      const angle = Math.atan2(nX - meshX, nZ - meshZ);
      roverTokenGroup.rotation.y = angle;
    }
  }

  // Update Active Trail (draw range 0 to ptIndex + 1)
  if (activeTrailLine) {
    activeTrailLine.geometry.setDrawRange(0, ptIndex + 1);
  }

  // Update Future Trail (draw range ptIndex to end)
  if (futureTrailLine) {
    futureTrailLine.geometry.setDrawRange(ptIndex, routePoints.length - ptIndex);
  }

  // Update Telemetry HUD numbers
  tStatSol.textContent = `${Math.floor(curPt.sol)}`;
  tStatElev.textContent = `${curPt.elevation.toFixed(1)} m`;

  const distM = curPt.cumDist;
  tStatDist.textContent = distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${distM.toFixed(1)} m`;
  tStatClimb.textContent = `+${curPt.cumClimb.toFixed(1)} m`;
}

// --- Dynamic Vertical Exaggeration ---

function applyVerticalExaggeration(exag) {
  currentExag = exag;
  exagValueDisplay.textContent = `${exag.toFixed(1)}×`;

  if (!terrainGeometry || !rawHeights) return;

  // 1. Terrain Mesh
  const posAttr = terrainGeometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const elev = rawHeights[i];
    posAttr.setY(i, (elev - minElev) * currentExag);
  }
  posAttr.needsUpdate = true;
  terrainGeometry.computeVertexNormals();

  // 2. Active and Future Route Trails
  [activeTrailLine, futureTrailLine].forEach(line => {
    if (line) {
      const linePosAttr = line.geometry.attributes.position;
      for (let i = 0; i < routePoints.length; i++) {
        const pt = routePoints[i];
        const meshY = (pt.elevation - minElev) * currentExag + 3.5 * currentExag;
        linePosAttr.setY(i, meshY);
      }
      linePosAttr.needsUpdate = true;
    }
  });

  // 3. Rover Marker
  if (roverTokenGroup && routePoints.length > 0) {
    updateTimelineReplay(currentReplaySol);
  }

  // 4. Science Markers & Start Flag
  if (scienceMarkersGroup) {
    scienceMarkersGroup.children.forEach(child => {
      if (child.userData && child.userData.pt) {
        const pt = child.userData.pt;
        const meshY = (pt.elevation - minElev) * currentExag + 6.0 * currentExag;
        child.position.y = meshY;
      }
    });
  }

  if (startFlagGroup) {
    const startPt = routePoints[0];
    const sY = (startPt.elevation - minElev) * currentExag;
    startFlagGroup.children[0].position.y = sY + 24 * currentExag; // pole
    startFlagGroup.children[1].position.y = sY + 44 * currentExag; // flag
    startFlagGroup.children[2].position.y = sY + 48 * currentExag; // sphere
  }

  // 5. Boxwork Perimeter
  if (boxworkGroup) {
    const boundaryLine = boxworkGroup.getObjectByName('BoxworkPerimeterLine');
    if (boundaryLine) {
      const boundaryPosAttr = boundaryLine.geometry.attributes.position;
      const count = boundaryPosAttr.count;
      for (let i = 0; i < count; i++) {
        const mx = boundaryPosAttr.getX(i);
        const mz = boundaryPosAttr.getZ(i);
        const { lx, ly } = meshToLocal(mx, mz);
        const { col, row } = localToGrid(lx, ly);
        const elev = sampleGridBilinear(rawHeights, col, row);
        boundaryPosAttr.setY(i, (elev - minElev) * currentExag + 4.0 * currentExag);
      }
      boundaryPosAttr.needsUpdate = true;
    }
  }

  // Update OrbitControls target height
  const meanElev = (minElev + maxElev) / 2.0;
  controls.target.y = (meanElev - minElev) * currentExag;
}

// --- Cinematic 4-Second Fly-in ---

function startCinematicIntro() {
  isIntroActive = true;
  btnSkipIntro.style.display = 'block';

  // High altitude overhead starting camera pose
  const startCamPos = new THREE.Vector3(0, 8000, 4800);
  const startLookAt = new THREE.Vector3(0, 300, 0);

  // Focus destination: close-up on Boxwork core zone
  const { meshX, meshZ } = localToMesh(2430, 2480);
  const boxworkElev = -3613.0;
  const boxworkMeshY = (boxworkElev - minElev) * currentExag;
  const endCamPos = new THREE.Vector3(meshX + 180, boxworkMeshY + 750, meshZ + 950);
  const endLookAt = new THREE.Vector3(meshX, boxworkMeshY, meshZ);

  camera.position.copy(startCamPos);
  controls.target.copy(startLookAt);
  controls.update();

  introStartTime = performance.now();

  function animateIntro(now) {
    if (!isIntroActive) return;
    const elapsed = now - introStartTime;
    const progress = Math.min(1.0, elapsed / INTRO_DURATION);
    const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(startCamPos, endCamPos, ease);
    controls.target.lerpVectors(startLookAt, endLookAt, ease);
    controls.update();

    if (progress < 1.0) {
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
  const boxworkElev = -3613.0;
  const boxworkMeshY = (boxworkElev - minElev) * currentExag;
  camera.position.set(meshX + 180, boxworkMeshY + 750, meshZ + 950);
  controls.target.set(meshX, boxworkMeshY, meshZ);
  controls.update();
}

// --- Hover Readout & Click Handler for Science Markers ---

function updateHoverReadout() {
  if (!isMouseOverCanvas || !terrainMesh || !rawHeights || !rawSlopes) {
    resetReadoutDisplay();
    if (hoverCursorMesh) hoverCursorMesh.visible = false;
    if (nearestSolMarker) nearestSolMarker.visible = false;
    return;
  }

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(terrainMesh);

  if (intersects.length > 0) {
    const hit = intersects[0];
    const hitPoint = hit.point;

    const { lx, ly } = meshToLocal(hitPoint.x, hitPoint.z);
    const { col, row } = localToGrid(lx, ly);

    const elev = sampleGridBilinear(rawHeights, col, row);
    const slopeDeg = sampleGridBilinear(rawSlopes, col, row);

    let hazardClass = 'Easy (< 15°)';
    let hazardStyleClass = 'hazard-easy';
    if (slopeDeg >= 25.0) {
      hazardClass = 'Hazardous (> 25°)';
      hazardStyleClass = 'hazard-hazardous';
    } else if (slopeDeg >= 15.0) {
      hazardClass = 'Moderate (15°–25°)';
      hazardStyleClass = 'hazard-moderate';
    }

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
    const { lon, lat } = localToMarsGeo(lx, ly);

    readoutElev.textContent = `${elev.toFixed(1)} m`;
    readoutSlope.textContent = `${slopeDeg.toFixed(1)}°`;
    readoutHazard.textContent = hazardClass;
    readoutHazard.className = `cell-val ${hazardStyleClass}`;

    if (nearestPt) {
      const distStr = distM < 8 ? '(At rover waypoint)' : `(${Math.round(distM)} m away)`;
      readoutSol.textContent = `Sol ${nearestPt.sol} ${distStr}`;

      if (nearestSolMarker) {
        const { meshX: solX, meshZ: solZ } = localToMesh(nearestPt.x, nearestPt.y);
        const solY = (nearestPt.elevation - minElev) * currentExag + 5.0 * currentExag;
        nearestSolMarker.position.set(solX, solY, solZ);
        nearestSolMarker.visible = true;
      }
    }

    readoutLocalCoords.textContent = `X: ${lx.toFixed(0)} m | Y: ${ly.toFixed(0)} m`;
    readoutGeoCoords.textContent = `${lon.toFixed(4)}° E, ${Math.abs(lat).toFixed(4)}° S`;

    hoverStateBadge.textContent = 'SURFACE TELEMETRY ACTIVE';
    hoverStateBadge.classList.add('active');

    if (hoverCursorMesh) {
      hoverCursorMesh.position.set(hitPoint.x, hitPoint.y + 1.5, hitPoint.z);
      hoverCursorMesh.visible = true;
    }
  } else {
    resetReadoutDisplay();
    if (hoverCursorMesh) hoverCursorMesh.visible = false;
    if (nearestSolMarker) nearestSolMarker.visible = false;
  }
}

function resetReadoutDisplay() {
  readoutElev.textContent = '—';
  readoutSlope.textContent = '—';
  readoutHazard.textContent = '—';
  readoutHazard.className = 'cell-val';
  readoutSol.textContent = '—';
  readoutLocalCoords.textContent = '—';
  readoutGeoCoords.textContent = '—';
  hoverStateBadge.textContent = 'HOVER OVER TERRAIN';
  hoverStateBadge.classList.remove('active');
}

// --- Camera Navigation Shortcuts ---

function animateCameraTo(targetCamPos, targetLookAt, duration = 1200) {
  const startCamPos = camera.position.clone();
  const startLookAt = controls.target.clone();
  const startTime = performance.now();

  function updateCam() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1.0, elapsed / duration);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(startCamPos, targetCamPos, ease);
    controls.target.lerpVectors(startLookAt, targetLookAt, ease);
    controls.update();

    if (t < 1.0) {
      cameraAnimId = requestAnimationFrame(updateCam);
    } else {
      cameraAnimId = null;
    }
  }

  if (cameraAnimId) cancelAnimationFrame(cameraAnimId);
  cameraAnimId = requestAnimationFrame(updateCam);
}

function resetCameraView() {
  const meanElev = (minElev + maxElev) / 2.0;
  const targetLookAt = new THREE.Vector3(0, (meanElev - minElev) * currentExag, 0);
  const targetCamPos = new THREE.Vector3(0, 3400, 3900);
  animateCameraTo(targetCamPos, targetLookAt, 1400);
}

function focusBoxworkView() {
  const { meshX, meshZ } = localToMesh(2430, 2480);
  const boxworkElev = -3613.0;
  const boxworkMeshY = (boxworkElev - minElev) * currentExag;

  const targetLookAt = new THREE.Vector3(meshX, boxworkMeshY, meshZ);
  const targetCamPos = new THREE.Vector3(
    meshX + 180,
    boxworkMeshY + 700 * Math.max(1.0, currentExag * 0.75),
    meshZ + 900
  );

  animateCameraTo(targetCamPos, targetLookAt, 1600);
}

// --- UI Event Listeners ---

function bindUIEvents() {
  // Exaggeration Slider
  exagSlider.addEventListener('input', (e) => {
    applyVerticalExaggeration(parseFloat(e.target.value));
  });

  // Time of Day Slider
  timeSlider.addEventListener('input', (e) => {
    updateTimeOfDay(parseFloat(e.target.value));
  });

  // Dust Particles Toggle
  toggleDust.addEventListener('change', () => {
    if (dustParticles) dustParticles.visible = toggleDust.checked;
  });

  // Skip Intro Button
  btnSkipIntro.addEventListener('click', endCinematicIntro);

  // Satellite Layer Toggle
  toggleSatellite.addEventListener('change', () => {
    if (terrainMesh) {
      if (toggleSatellite.checked) {
        terrainMesh.material.map = satelliteTexRef;
        terrainMesh.material.color.set(0xffffff);
      } else {
        terrainMesh.material.map = null;
        terrainMesh.material.color.set(0xb8684a);
      }
      terrainMesh.material.needsUpdate = true;
    }
  });

  // Slope Hazard Overlay Toggle & Opacity Slider
  toggleSlope.addEventListener('change', () => {
    if (hazardMesh) hazardMesh.visible = toggleSlope.checked;
  });
  slopeOpacitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    slopeOpacityVal.textContent = `${val}%`;
    if (hazardMesh) hazardMesh.material.opacity = val / 100.0;
  });

  // CRISM Hydrated Minerals Toggle & Opacity Slider
  toggleCrismHyd.addEventListener('change', () => {
    if (crismHydMesh) crismHydMesh.visible = toggleCrismHyd.checked;
  });
  crismHydOpacitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    crismHydOpacityVal.textContent = `${val}%`;
    if (crismHydMesh) crismHydMesh.material.opacity = val / 100.0;
  });

  // CRISM Phyllosilicates Toggle & Opacity Slider
  toggleCrismPhy.addEventListener('change', () => {
    if (crismPhyMesh) crismPhyMesh.visible = toggleCrismPhy.checked;
  });
  crismPhyOpacitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    crismPhyOpacityVal.textContent = `${val}%`;
    if (crismPhyMesh) crismPhyMesh.material.opacity = val / 100.0;
  });

  // THEMIS Thermal Brightness Toggle & Opacity Slider
  toggleThemis.addEventListener('change', () => {
    if (themisMesh) themisMesh.visible = toggleThemis.checked;
  });
  themisOpacitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    themisOpacityVal.textContent = `${val}%`;
    if (themisMesh) themisMesh.material.opacity = val / 100.0;
  });

  // Trajectory & Boxwork Toggles
  toggleRoute.addEventListener('change', () => {
    if (routeGroup) routeGroup.visible = toggleRoute.checked;
    if (scienceMarkersGroup) scienceMarkersGroup.visible = toggleRoute.checked;
    if (startFlagGroup) startFlagGroup.visible = toggleRoute.checked;
  });

  toggleBoxwork.addEventListener('change', () => {
    if (boxworkGroup) boxworkGroup.visible = toggleBoxwork.checked;
  });

  // Camera Action Buttons
  btnResetCam.addEventListener('click', resetCameraView);
  btnFocusBoxwork.addEventListener('click', focusBoxworkView);

  // Timeline Play / Pause
  btnPlayPause.addEventListener('click', () => {
    isPlaying = !isPlaying;
    btnPlayPause.textContent = isPlaying ? '⏸ PAUSE' : '▶ PLAY';
    lastReplayTime = performance.now();
  });

  // Timeline Slider Drag
  timelineSlider.addEventListener('input', (e) => {
    isPlaying = false;
    btnPlayPause.textContent = '▶ PLAY';
    updateTimelineReplay(parseFloat(e.target.value));
  });

  // Speed Buttons
  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      speedButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      replaySpeed = parseFloat(btn.dataset.speed);
    });
  });

  // Science Popup Close Button
  popupCloseBtn.addEventListener('click', () => {
    sciencePopup.classList.add('hidden');
  });

  // Canvas Click: Raycast to detect click on Science Waypoints
  renderer.domElement.addEventListener('click', () => {
    if (!scienceMarkersGroup) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scienceMarkersGroup.children, false);

    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      if (hitObj.userData && hitObj.userData.isSciencePin) {
        popupTitle.textContent = hitObj.userData.title;
        popupSol.textContent = hitObj.userData.solLabel;
        sciencePopup.classList.remove('hidden');
      }
    }
  });

  // Pointer Move
  window.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      isMouseOverCanvas = true;
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    } else {
      isMouseOverCanvas = false;
      mouse.x = -9999;
      mouse.y = -9999;
    }
  });

  window.addEventListener('pointerleave', () => {
    isMouseOverCanvas = false;
    mouse.x = -9999;
    mouse.y = -9999;
  });

  // Window Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}

// --- Asset Loader & Initialization ---

async function loadAssetsAndInit() {
  try {
    setupLights();
    bindUIEvents();
    updateTimeOfDay(14.0);

    // 1. Manifest
    loadingStatus.textContent = 'Reading topography metadata...';
    progressBar.style.width = '12%';
    const manifestResp = await fetch('/data/manifest.json');
    const manifest = await manifestResp.json();
    if (manifest.elevation_summary) {
      minElev = manifest.elevation_summary.min_elevation_m;
      maxElev = manifest.elevation_summary.max_elevation_m;
    }

    // 2. Terrain Height Binary
    loadingStatus.textContent = 'Loading 1025x1025 elevation mesh binary...';
    progressBar.style.width = '28%';
    const heightResp = await fetch('/data/terrain_height.bin');
    const heightBuffer = await heightResp.arrayBuffer();
    rawHeights = new Float32Array(heightBuffer);

    // 3. Slope Binary
    loadingStatus.textContent = 'Loading 5m slope gradient grid...';
    progressBar.style.width = '42%';
    const slopeResp = await fetch('/data/slope_5m.bin');
    const slopeBuffer = await slopeResp.arrayBuffer();
    rawSlopes = new Float32Array(slopeBuffer);

    // 4. Route JSON
    loadingStatus.textContent = 'Parsing Curiosity traverse telemetry...';
    progressBar.style.width = '55%';
    const routeResp = await fetch('/data/route.json');
    routeData = await routeResp.json();
    routePoints = routeData.points;

    // 5. Load Textures
    loadingStatus.textContent = 'Downloading HiRISE, CRISM & THEMIS textures...';
    progressBar.style.width = '75%';

    const texLoader = new THREE.TextureLoader();

    function loadNearestTex(url) {
      return new Promise((resolve, reject) => {
        texLoader.load(url, tex => {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.generateMipmaps = false;
          tex.colorSpace = THREE.SRGBColorSpace;
          resolve(tex);
        }, undefined, reject);
      });
    }

    const [satTex, slopeTex, crismHydTex, crismPhyTex, themisTex] = await Promise.all([
      new Promise((resolve, reject) => {
        texLoader.load('/data/terrain_texture.png', tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          resolve(tex);
        }, undefined, reject);
      }),
      loadNearestTex('/data/slope_5m_classified.png'),
      loadNearestTex('/data/crism_hyd_crop.png'),
      loadNearestTex('/data/crism_phy_crop.png'),
      loadNearestTex('/data/themis_crop.png')
    ]);

    // 6. Build Scene Entities
    loadingStatus.textContent = 'Draping multi-spectral layers & science markers...';
    progressBar.style.width = '90%';

    createTerrainAndDrapedLayers(satTex, slopeTex, crismHydTex, crismPhyTex, themisTex);
    createRouteAndRover();
    createScienceMarkersAndFlag();
    createBoxworkCoreZone();
    createDustParticles();
    createHoverMarkers();

    // Set initial center height for controls target
    const meanElev = (minElev + maxElev) / 2.0;
    controls.target.set(0, (meanElev - minElev) * currentExag, 0);

    // 7. Finish Loading
    progressBar.style.width = '100%';
    const totalLoadTimeMs = Math.round(performance.now() - appStartTime);
    loadValDisplay.textContent = `${totalLoadTimeMs} ms`;

    setTimeout(() => {
      loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
        // Launch 4-second cinematic fly-in
        startCinematicIntro();
      }, 500);
    }, 400);

    // Start Render Loop
    lastReplayTime = performance.now();
    animate();

  } catch (err) {
    console.error('Initialization error:', err);
    loadingStatus.textContent = `Error loading assets: ${err.message}`;
    loadingStatus.style.color = '#ff4444';
  }
}

// --- Main Animation Loop ---

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();

  // 1. Frame Rate Tracking
  frameCount++;
  if (now - lastFpsUpdateTime >= 1000) {
    currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdateTime));
    fpsValDisplay.textContent = `${currentFps}`;
    frameCount = 0;
    lastFpsUpdateTime = now;
  }

  // 2. Timeline Replay Playback
  if (isPlaying) {
    const deltaSec = (now - lastReplayTime) / 1000.0;
    let nextSol = currentReplaySol + deltaSec * replaySpeed;
    if (nextSol > 4868) {
      nextSol = 4868;
      isPlaying = false;
      btnPlayPause.textContent = '▶ PLAY';
    }
    updateTimelineReplay(nextSol);
  }
  lastReplayTime = now;

  // 3. Rover Beacon Pulsing Ring
  if (roverBeaconRing) {
    const scale = 1.0 + 0.3 * Math.sin(now * 0.007);
    roverBeaconRing.scale.set(scale, scale, scale);
    roverBeaconRing.material.opacity = 0.5 + 0.4 * Math.cos(now * 0.007);
  }

  // 4. Update Dust Drift Particles
  updateDustParticles();

  // 5. Controls & Hover Readout
  controls.update();
  updateHoverReadout();

  // 6. Nearest Sol Hover Marker Pulse
  if (nearestSolMarker && nearestSolMarker.visible) {
    const s = 1.0 + 0.25 * Math.sin(now * 0.008);
    nearestSolMarker.scale.set(s, s, s);
  }

  renderer.render(scene, camera);
}

// Start Application
loadAssetsAndInit();
