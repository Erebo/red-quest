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
    rx: 295.0,
    ry: 240.0,
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
    rx: 310.0,
    ry: 260.0,
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
    rx: 235.0,
    ry: 205.0,
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
    rx: 205.0,
    ry: 175.0,
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
    rx: 175.0,
    ry: 165.0,
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
