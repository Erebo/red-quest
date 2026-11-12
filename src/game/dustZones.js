/**
 * Level 1 Deterministic Dust Zones (GAME / SIM Model).
 * No orbiter dust-cover raster exists in public/data/, so dust zones are placed
 * deterministically as GAME regions anchored around plains & hollow corridors.
 */

import * as THREE from 'three';

const BASE_ELEV_REF_M = -4131.74;

export const LEVEL1_DUST_ZONES = Object.freeze([
  Object.freeze({
    id: 'dust-zone-1',
    name: 'Eastern Pediment Dust Plume',
    cx: 3632.81,
    cy: 4257.81,
    rx: 147.5,
    ry: 120.0,
    rotRad: 0.25,
    intensityLabel: 'Elevated dust lofting',
    source: 'MISSION RULE / MODELED',
    note: 'Open pediment sector prone to convective dust devil sweeping and silt suspension.'
  }),
  Object.freeze({
    id: 'dust-zone-2',
    name: 'Western Ripple Sand Hollow',
    cx: 2620.0,
    cy: 3890.0,
    rx: 155.0,
    ry: 130.0,
    rotRad: -0.35,
    intensityLabel: 'Trapped basaltic silt',
    source: 'MISSION RULE / MODELED',
    note: 'Leeward hollow trapping windblown dust and loose rippled basalt fines.'
  }),
  Object.freeze({
    id: 'dust-zone-3',
    name: 'Central Trough Dust Pan',
    cx: 3250.0,
    cy: 3710.0,
    rx: 117.5,
    ry: 102.5,
    rotRad: 0.15,
    intensityLabel: 'Moderate dust mantle',
    source: 'MISSION RULE / MODELED',
    note: 'Low-gradient corridor floor collecting wind-deposited fine dust.'
  }),
  Object.freeze({
    id: 'dust-zone-4',
    name: 'Mid-Corridor Aeolian Sheet',
    cx: 2810.0,
    cy: 3035.0,
    rx: 102.5,
    ry: 87.5,
    rotRad: -0.18,
    intensityLabel: 'Fine aeolian drape',
    source: 'MISSION RULE / MODELED',
    note: 'Wind-sorted dust sheet along mid-corridor approach bench.'
  }),
  Object.freeze({
    id: 'dust-zone-5',
    name: 'Northern Apron Silt Basin',
    cx: 3440.0,
    cy: 4470.0,
    rx: 87.5,
    ry: 82.5,
    rotRad: 0.0,
    intensityLabel: 'Loose surface dust',
    source: 'MISSION RULE / MODELED',
    note: 'Shallow sediment sink near north central entry bench.'
  })
]);

export function findDustZoneAtPoint(lx, ly) {
  for (let i = 0; i < LEVEL1_DUST_ZONES.length; i++) {
    const z = LEVEL1_DUST_ZONES[i];
    const dx = lx - z.cx;
    const dy = ly - z.cy;
    const cos = Math.cos(-z.rotRad);
    const sin = Math.sin(-z.rotRad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    if ((rx * rx) / (z.rx * z.rx) + (ry * ry) / (z.ry * z.ry) <= 1.0) {
      return z;
    }
  }
  return null;
}

export function isPointInDustZone(lx, ly) {
  return findDustZoneAtPoint(lx, ly) !== null;
}

/**
 * Compute deterministic simulated atmospheric dust optical depth (tau) from docs/SIMULATED_DATA.md
 * plus membership inside Level 1 GAME dust zones.
 */
export function sampleDustAtPoint(lx, ly, elev = -3800) {
  const zone = findDustZoneAtPoint(lx, ly);
  const baseTau = 0.60;
  const spatialWave = 0.15 * Math.sin(lx / 800.0) * Math.cos(ly / 600.0);
  const elevEffect = 0.05 * (elev - BASE_ELEV_REF_M) / 700.0;
  const baseSimTau = baseTau + spatialWave + elevEffect;
  const tau = zone ? Math.min(1.5, baseSimTau + 0.25) : baseSimTau;
  return {
    insideZone: Boolean(zone),
    zone,
    tau,
    visibilityKm: 15.0 / Math.max(tau, 0.1)
  };
}

/**
 * Create subtle 3D dust-zone outline rings on terrain (shown when Survey DUST tool is active).
 */
export function createDustZonesOverlay(sampleElevFn, localToMesh, minElev) {
  const group = new THREE.Group();
  group.name = 'DustZonesOverlayGroup';
  group.visible = false;

  const zoneMeshes = [];
  const SEGMENTS = 48;

  LEVEL1_DUST_ZONES.forEach(z => {
    const pts = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const ex = z.rx * Math.cos(a);
      const ey = z.ry * Math.sin(a);
      const lx = z.cx + ex * Math.cos(z.rotRad) - ey * Math.sin(z.rotRad);
      const ly = z.cy + ex * Math.sin(z.rotRad) + ey * Math.cos(z.rotRad);
      const elev = sampleElevFn ? sampleElevFn(lx, ly) : minElev;
      const { meshX, meshZ } = localToMesh(lx, ly);
      pts.push({ meshX, meshZ, elev });
    }

    const pos = new Float32Array(pts.length * 3);
    pts.forEach((p, idx) => {
      pos[idx * 3] = p.meshX;
      pos[idx * 3 + 1] = (p.elev - minElev) + 6.5;
      pos[idx * 3 + 2] = p.meshZ;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 24,
      gapSize: 14,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.renderOrder = 9;
    line.userData = { pts };
    group.add(line);
    zoneMeshes.push(line);
  });

  function updateExaggeration(exag) {
    zoneMeshes.forEach(line => {
      const pts = line.userData.pts;
      const pos = line.geometry.attributes.position;
      for (let i = 0; i < pts.length; i++) {
        pos.setY(i, (pts[i].elev - minElev) * exag + 6.5 * exag);
      }
      pos.needsUpdate = true;
      line.computeLineDistances();
    });
  }

  return { group, updateExaggeration };
}

/**
 * Creates swirling dust storm particle clouds inside each Level 1 dust storm zone
 * and hazard dust devil radius, active during Mars Rover Explore mode.
 */
export function createDustStormParticles({ sampleElevFn, localToMesh, minElev }) {
  const group = new THREE.Group();
  group.name = 'DustStormParticlesGroup';
  group.visible = false;

  const PARTICLES_PER_ZONE = 320;
  const zones = LEVEL1_DUST_ZONES;
  const totalParticles = zones.length * PARTICLES_PER_ZONE;
  const positions = new Float32Array(totalParticles * 3);
  const particleMeta = [];

  let pIdx = 0;
  for (let zIdx = 0; zIdx < zones.length; zIdx++) {
    const z = zones[zIdx];
    for (let i = 0; i < PARTICLES_PER_ZONE; i++) {
      // Uniform random distribution inside ellipse
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()); // sqrt ensures uniform area distribution
      const ex = z.rx * rad * Math.cos(angle);
      const ey = z.ry * rad * Math.sin(angle);
      const lx = z.cx + ex * Math.cos(z.rotRad) - ey * Math.sin(z.rotRad);
      const ly = z.cy + ex * Math.sin(z.rotRad) + ey * Math.cos(z.rotRad);
      const elev = sampleElevFn ? sampleElevFn(lx, ly) : minElev;
      const { meshX, meshZ } = localToMesh(lx, ly);

      const heightOffset = 1.0 + Math.random() * 26.0;
      const meshY = (elev - minElev) + heightOffset;

      positions[pIdx * 3] = meshX;
      positions[pIdx * 3 + 1] = meshY;
      positions[pIdx * 3 + 2] = meshZ;

      particleMeta.push({
        zone: z,
        relAngle: angle,
        relRad: rad,
        heightOffset,
        rotSpeed: 0.25 + Math.random() * 0.45,
        bobSpeed: 0.8 + Math.random() * 1.5,
        elev
      });
      pIdx++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xdf8858,
    size: 4.8,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.NormalBlending
  });

  const pointsMesh = new THREE.Points(geometry, material);
  pointsMesh.renderOrder = 8;
  group.add(pointsMesh);

  let currentExaggeration = 1.0;

  function update(dt, nowSec) {
    if (!group.visible) return;
    const pos = geometry.attributes.position;
    for (let i = 0; i < totalParticles; i++) {
      const meta = particleMeta[i];
      meta.relAngle += meta.rotSpeed * dt;

      const z = meta.zone;
      const ex = z.rx * meta.relRad * Math.cos(meta.relAngle);
      const ey = z.ry * meta.relRad * Math.sin(meta.relAngle);
      const lx = z.cx + ex * Math.cos(z.rotRad) - ey * Math.sin(z.rotRad);
      const ly = z.cy + ex * Math.sin(z.rotRad) + ey * Math.cos(z.rotRad);

      const { meshX, meshZ } = localToMesh(lx, ly);
      const bob = Math.sin(nowSec * meta.bobSpeed + i) * 1.5;
      const meshY = (meta.elev - minElev) * currentExaggeration + (meta.heightOffset + bob) * currentExaggeration;

      pos.setXYZ(i, meshX, meshY, meshZ);
    }
    pos.needsUpdate = true;
  }

  function setExaggeration(exag) {
    currentExaggeration = exag;
  }

  function setVisible(visible) {
    group.visible = visible;
  }

  return {
    group,
    update,
    setExaggeration,
    setVisible
  };
}
