import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

const exagSlider = document.getElementById('exag-slider');
const exagValueDisplay = document.getElementById('exag-value');

const toggleSatellite = document.getElementById('toggle-satellite');
const toggleSlope = document.getElementById('toggle-slope');
const toggleRoute = document.getElementById('toggle-route');
const toggleBoxwork = document.getElementById('toggle-boxwork');

const btnResetCam = document.getElementById('btn-reset-cam');
const btnFocusBoxwork = document.getElementById('btn-focus-boxwork');

const readoutElev = document.getElementById('readout-elev');
const readoutSlope = document.getElementById('readout-slope');
const readoutHazard = document.getElementById('readout-hazard');
const readoutSol = document.getElementById('readout-sol');
const readoutLocalCoords = document.getElementById('readout-local-coords');
const readoutGeoCoords = document.getElementById('readout-geo-coords');
const hoverStateBadge = document.getElementById('hover-state');

// State Variables
let currentExag = 1.0;
let minElev = -4131.74;
let maxElev = -3412.51;
let rawHeights = null;
let rawSlopes = null;
let routeData = null;
let routePoints = [];

let terrainGeometry = null;
let terrainMesh = null;
let hazardMesh = null;
let routeLine = null;
let routePointsGroup = null;
let boxworkGroup = null;
let hoverCursorMesh = null;
let nearestSolMarker = null;

let cameraAnimId = null;

// Three.js Core Objects
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080a0f);
scene.fog = new THREE.FogExp2(0x120c0a, 0.00007);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  10,
  40000
);
// Initial panoramic angle overlooking Gale Crater box from south-southeast
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
controls.maxPolarAngle = Math.PI / 2 - 0.04; // Don't clip under ground
controls.minDistance = 150;
controls.maxDistance = 18000;
controls.addEventListener('start', () => {
  if (cameraAnimId) {
    cancelAnimationFrame(cameraAnimId);
    cameraAnimId = null;
  }
});

// Raycasting for Hover Readout
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9999, -9999);
let isMouseOverCanvas = false;

// --- Lighting Setup ---
function setupLights() {
  const ambientLight = new THREE.AmbientLight(0x5a443b, 1.2);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x1f140e, 0.8);
  scene.add(hemiLight);

  // Directional Mars Sun: northwest azimuth to match HiRISE shadow directions
  const sunLight = new THREE.DirectionalLight(0xfff5ea, 2.4);
  sunLight.position.set(-3000, 4500, -3500);
  scene.add(sunLight);

  // Subtle rim light from opposite side
  const fillLight = new THREE.DirectionalLight(0xb08870, 0.7);
  fillLight.position.set(3500, 2000, 3000);
  scene.add(fillLight);
}

// --- Helper Functions for Coordinate Mapping & Sampling ---

/**
 * Bilinear sampling from row-major Float32Array (1025 x 1025)
 * row 0 is North edge, row 1024 is South edge
 */
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

/**
 * Converts local (x, y) metres to heightmap grid (col, row)
 */
function localToGrid(lx, ly) {
  const col = (lx / TERRAIN_WIDTH_M) * (GRID_SIZE - 1);
  const row = (1.0 - (ly / TERRAIN_HEIGHT_M)) * (GRID_SIZE - 1);
  return { col, row };
}

/**
 * Converts local (x, y) metres to Three.js mesh space (x, z)
 */
function localToMesh(lx, ly) {
  const meshX = lx - TERRAIN_WIDTH_M / 2.0;
  const meshZ = TERRAIN_HEIGHT_M / 2.0 - ly;
  return { meshX, meshZ };
}

/**
 * Converts Three.js mesh space (x, z) to local (x, y) metres
 */
function meshToLocal(mx, mz) {
  const lx = mx + TERRAIN_WIDTH_M / 2.0;
  const ly = TERRAIN_HEIGHT_M / 2.0 - mz;
  return {
    lx: Math.max(0, Math.min(TERRAIN_WIDTH_M, lx)),
    ly: Math.max(0, Math.min(TERRAIN_HEIGHT_M, ly))
  };
}

/**
 * Converts local metres to Mars Easting/Northing and Longitude/Latitude
 */
function localToMarsGeo(lx, ly) {
  const easting = WEST_EDGE_EASTING + lx;
  const northing = SOUTH_EDGE_NORTHING + ly;
  const lon = (easting / MARS_RADIUS_M) * (180.0 / Math.PI);
  const lat = (northing / MARS_RADIUS_M) * (180.0 / Math.PI);
  return { easting, northing, lon, lat };
}

// --- Terrain & Route Construction ---

function createTerrainMesh(satelliteTex, slopeTex) {
  // PlaneGeometry(width, height, widthSegments, heightSegments)
  terrainGeometry = new THREE.PlaneGeometry(
    TERRAIN_WIDTH_M,
    TERRAIN_HEIGHT_M,
    GRID_SIZE - 1,
    GRID_SIZE - 1
  );
  // Rotate plane so X is East, -Z is North, +Z is South
  terrainGeometry.rotateX(-Math.PI / 2);

  const posAttr = terrainGeometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const elev = rawHeights[i];
    posAttr.setY(i, (elev - minElev) * currentExag);
  }
  posAttr.needsUpdate = true;
  terrainGeometry.computeVertexNormals();

  // Primary Material: High-resolution HiRISE Satellite texture
  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: satelliteTex,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: false
  });

  terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrainMesh.name = 'MarsTerrain';
  scene.add(terrainMesh);

  // Slope Hazard Overlay Mesh: shares exact same geometry
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
}

function createRoute() {
  routePointsGroup = new THREE.Group();
  routePointsGroup.name = 'CuriosityRouteGroup';

  const positions = [];
  const colors = [];

  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    const { meshX, meshZ } = localToMesh(pt.x, pt.y);
    const meshY = (pt.elevation - minElev) * currentExag + 3.5 * currentExag;
    positions.push(meshX, meshY, meshZ);

    if (pt.sol >= BOXWORK_SOL_START && pt.sol <= BOXWORK_SOL_END) {
      // Magenta (#ff007f) for Boxwork campaign
      colors.push(1.0, 0.0, 0.5);
    } else {
      // Electric Cyan (#00e5ff) for standard traverse
      colors.push(0.0, 0.9, 1.0);
    }
  }

  const routeGeo = new THREE.BufferGeometry();
  routeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  routeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const routeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: 3,
    depthTest: true
  });

  routeLine = new THREE.Line(routeGeo, routeMat);
  routePointsGroup.add(routeLine);

  // Add Landmark waypoint markers
  const landmarkDefs = [
    { sol: routePoints[0].sol, label: 'Entry (Sol 3721)', color: 0x2ecc71, pt: routePoints[0] },
    { sol: 4600, label: 'Boxwork Start (Sol 4600)', color: 0xf1c40f, pt: routePoints.find(p => p.sol >= 4600) },
    { sol: 4805, label: 'Boxwork End (Sol 4805)', color: 0xff007f, pt: routePoints.find(p => p.sol >= 4805) },
    { sol: routePoints[routePoints.length - 1].sol, label: 'Latest (Sol 4868)', color: 0x00e5ff, pt: routePoints[routePoints.length - 1] }
  ];

  landmarkDefs.forEach(item => {
    if (!item.pt) return;
    const { meshX, meshZ } = localToMesh(item.pt.x, item.pt.y);
    const meshY = (item.pt.elevation - minElev) * currentExag + 5.0 * currentExag;

    const sphereGeo = new THREE.SphereGeometry(14, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: item.color });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(meshX, meshY, meshZ);
    sphere.userData = { pt: item.pt, isLandmark: true, label: item.label };
    routePointsGroup.add(sphere);

    // Glowing halo ring around landmark
    const ringGeo = new THREE.RingGeometry(18, 24, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: item.color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(meshX, meshY + 1, meshZ);
    routePointsGroup.add(ring);
  });

  scene.add(routePointsGroup);
}

function createBoxworkZone() {
  boxworkGroup = new THREE.Group();
  boxworkGroup.name = 'BoxworkScienceZone';

  // Local bounding bounds for Boxwork campaign:
  // Sols 4600-4805 span X: [2355, 2508], Y: [2338, 2620]
  const pad = 65.0;
  const xMin = 2355.0 - pad;
  const xMax = 2508.0 + pad;
  const yMin = 2338.0 - pad;
  const yMax = 2620.0 + pad;

  const perimeterPoints = [];
  const stepsPerSide = 24;

  // Bottom edge: (xMin, yMin) to (xMax, yMin)
  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMin + t * (xMax - xMin), y: yMin });
  }
  // Right edge: (xMax, yMin) to (xMax, yMax)
  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMax, y: yMin + t * (yMax - yMin) });
  }
  // Top edge: (xMax, yMax) to (xMin, yMax)
  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMax - t * (xMax - xMin), y: yMax });
  }
  // Left edge: (xMin, yMax) to (xMin, yMin)
  for (let s = 0; s < stepsPerSide; s++) {
    const t = s / stepsPerSide;
    perimeterPoints.push({ x: xMin, y: yMax - t * (yMax - yMin) });
  }
  // Close loop
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
  boundaryLine.name = 'BoxworkPerimeter';
  boxworkGroup.add(boundaryLine);

  scene.add(boxworkGroup);
}

function createHoverMarkers() {
  // 3D cursor dot on surface
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

  // Marker for nearest rover sol
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

// --- Exaggeration Update Handler ---

function applyVerticalExaggeration(exag) {
  currentExag = exag;
  exagValueDisplay.textContent = `${exag.toFixed(1)}×`;

  if (!terrainGeometry || !rawHeights) return;

  // 1. Update terrain mesh positions
  const posAttr = terrainGeometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const elev = rawHeights[i];
    posAttr.setY(i, (elev - minElev) * currentExag);
  }
  posAttr.needsUpdate = true;
  terrainGeometry.computeVertexNormals();

  // 2. Update route line positions
  if (routeLine) {
    const routePosAttr = routeLine.geometry.attributes.position;
    for (let i = 0; i < routePoints.length; i++) {
      const pt = routePoints[i];
      const meshY = (pt.elevation - minElev) * currentExag + 3.5 * currentExag;
      routePosAttr.setY(i, meshY);
    }
    routePosAttr.needsUpdate = true;
  }

  // 3. Update route landmark waypoint spheres
  if (routePointsGroup) {
    routePointsGroup.children.forEach(child => {
      if (child.userData && child.userData.pt) {
        const pt = child.userData.pt;
        const meshY = (pt.elevation - minElev) * currentExag + 5.0 * currentExag;
        child.position.y = meshY;
      }
    });
  }

  // 4. Update Boxwork boundary perimeter
  if (boxworkGroup) {
    const boundaryLine = boxworkGroup.getObjectByName('BoxworkPerimeter');
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

  // 5. Update OrbitControls target height
  const meanElev = (minElev + maxElev) / 2.0;
  controls.target.y = (meanElev - minElev) * currentExag;
}

// --- Hover Readout & Raycasting ---

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

    // Convert hit position to local box coordinates (0 to 5000 m)
    const { lx, ly } = meshToLocal(hitPoint.x, hitPoint.z);
    const { col, row } = localToGrid(lx, ly);

    // Sample continuous elevation and slope
    const elev = sampleGridBilinear(rawHeights, col, row);
    const slopeDeg = sampleGridBilinear(rawSlopes, col, row);

    // Hazard tier classification
    let hazardClass = 'Easy (< 15°)';
    let hazardStyleClass = 'hazard-easy';
    if (slopeDeg >= 25.0) {
      hazardClass = 'Hazardous (> 25°)';
      hazardStyleClass = 'hazard-hazardous';
    } else if (slopeDeg >= 15.0) {
      hazardClass = 'Moderate (15°–25°)';
      hazardStyleClass = 'hazard-moderate';
    }

    // Find nearest rover sol waypoint
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

    // Update DOM readout
    readoutElev.textContent = `${elev.toFixed(1)} m`;
    readoutSlope.textContent = `${slopeDeg.toFixed(1)}°`;
    readoutHazard.textContent = hazardClass;
    readoutHazard.className = `cell-val ${hazardStyleClass}`;

    if (nearestPt) {
      const distStr = distM < 8 ? '(At rover waypoint)' : `(${Math.round(distM)} m away)`;
      readoutSol.textContent = `Sol ${nearestPt.sol} ${distStr}`;

      // Update nearest sol marker position
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

    // Position 3D hover ring cursor
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

// --- Camera Navigation & Focus Animations ---

function animateCameraTo(targetCamPos, targetLookAt, duration = 1200) {
  const startCamPos = camera.position.clone();
  const startLookAt = controls.target.clone();
  const startTime = performance.now();

  function updateCam() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1.0, elapsed / duration);
    // Smooth easeInOutCubic curve
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
  // Boxwork centroid in local coordinates: X=2420m, Y=2450m, Elev=-3613m
  const { meshX, meshZ } = localToMesh(2420, 2450);
  const boxworkElev = -3613.0;
  const boxworkMeshY = (boxworkElev - minElev) * currentExag;

  const targetLookAt = new THREE.Vector3(meshX, boxworkMeshY, meshZ);
  // Dramatic close-up oblique angle from south
  const targetCamPos = new THREE.Vector3(
    meshX + 120,
    boxworkMeshY + 650 * Math.max(1.0, currentExag * 0.75),
    meshZ + 900
  );

  animateCameraTo(targetCamPos, targetLookAt, 1600);
}

// --- Event Listeners & UI Binding ---

function bindUIEvents() {
  // Exaggeration Slider
  exagSlider.addEventListener('input', (e) => {
    applyVerticalExaggeration(parseFloat(e.target.value));
  });

  // Layer Toggles
  toggleSatellite.addEventListener('change', () => {
    if (terrainMesh) {
      if (toggleSatellite.checked) {
        terrainMesh.material.map = satelliteTextureRef;
        terrainMesh.material.color.set(0xffffff);
      } else {
        terrainMesh.material.map = null;
        terrainMesh.material.color.set(0xb8684a); // Clean Martian terra-cotta
      }
      terrainMesh.material.needsUpdate = true;
    }

    if (hazardMesh) {
      // Adjust hazard overlay opacity depending on satellite layer state
      hazardMesh.material.opacity = toggleSatellite.checked ? 0.65 : 0.95;
    }
  });

  toggleSlope.addEventListener('change', () => {
    if (hazardMesh) {
      hazardMesh.visible = toggleSlope.checked;
    }
  });

  toggleRoute.addEventListener('change', () => {
    if (routePointsGroup) {
      routePointsGroup.visible = toggleRoute.checked;
    }
  });

  toggleBoxwork.addEventListener('change', () => {
    if (boxworkGroup) {
      boxworkGroup.visible = toggleBoxwork.checked;
    }
  });

  // Camera Action Buttons
  btnResetCam.addEventListener('click', resetCameraView);
  btnFocusBoxwork.addEventListener('click', focusBoxworkView);

  // Mouse / Pointer Move
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

// --- Main Asset Loading & Initialization ---

let satelliteTextureRef = null;
let slopeTextureRef = null;

async function loadAssetsAndInit() {
  try {
    setupLights();
    bindUIEvents();

    // 1. Fetch Manifest
    loadingStatus.textContent = 'Loading terrain metadata...';
    progressBar.style.width = '15%';
    const manifestResp = await fetch('/data/manifest.json');
    const manifest = await manifestResp.json();
    if (manifest.elevation_summary) {
      minElev = manifest.elevation_summary.min_elevation_m;
      maxElev = manifest.elevation_summary.max_elevation_m;
    }

    // 2. Fetch Terrain Heightmap Binary (Float32, 1025 x 1025)
    loadingStatus.textContent = 'Downloading high-resolution 1025x1025 DEM...';
    progressBar.style.width = '35%';
    const heightResp = await fetch('/data/terrain_height.bin');
    const heightBuffer = await heightResp.arrayBuffer();
    rawHeights = new Float32Array(heightBuffer);

    // 3. Fetch Slope Binary (Float32, 1025 x 1025)
    loadingStatus.textContent = 'Downloading 5m slope gradient grid...';
    progressBar.style.width = '55%';
    const slopeResp = await fetch('/data/slope_5m.bin');
    const slopeBuffer = await slopeResp.arrayBuffer();
    rawSlopes = new Float32Array(slopeBuffer);

    // 4. Fetch Route JSON
    loadingStatus.textContent = 'Loading Curiosity rover traverse route...';
    progressBar.style.width = '70%';
    const routeResp = await fetch('/data/route.json');
    routeData = await routeResp.json();
    routePoints = routeData.points;

    // 5. Load Textures
    loadingStatus.textContent = 'Loading HiRISE color texture & hazard map...';
    progressBar.style.width = '85%';
    const texLoader = new THREE.TextureLoader();
    const [satTex, slopeTex] = await Promise.all([
      new Promise((resolve, reject) => {
        texLoader.load('/data/terrain_texture.png', resolve, undefined, reject);
      }),
      new Promise((resolve, reject) => {
        texLoader.load('/data/slope_5m_classified.png', resolve, undefined, reject);
      })
    ]);

    satTex.colorSpace = THREE.SRGBColorSpace;
    satTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    slopeTex.colorSpace = THREE.SRGBColorSpace;
    slopeTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    satelliteTextureRef = satTex;
    slopeTextureRef = slopeTex;

    // 6. Build 3D Entities
    loadingStatus.textContent = 'Constructing 3D Martian terrain & trajectory...';
    progressBar.style.width = '95%';

    createTerrainMesh(satTex, slopeTex);
    createRoute();
    createBoxworkZone();
    createHoverMarkers();

    // Set initial center height for controls target
    const meanElev = (minElev + maxElev) / 2.0;
    controls.target.set(0, (meanElev - minElev) * currentExag, 0);

    // 7. Finish Loading
    progressBar.style.width = '100%';
    loadingStatus.textContent = 'Teleporting to Gale Crater...';

    setTimeout(() => {
      loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
      }, 500);
    }, 400);

    // Start Animation Loop
    animate();

  } catch (err) {
    console.error('Initialization error:', err);
    loadingStatus.textContent = `Error loading assets: ${err.message}`;
    loadingStatus.style.color = '#ff4444';
  }
}

// --- Render Loop ---

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  updateHoverReadout();

  // Subtle pulsing animation on nearestSolMarker
  if (nearestSolMarker && nearestSolMarker.visible) {
    const s = 1.0 + 0.25 * Math.sin(performance.now() * 0.008);
    nearestSolMarker.scale.set(s, s, s);
  }

  renderer.render(scene, camera);
}

// Start Application
loadAssetsAndInit();
