/**
 * Explore-mode world props.
 *
 * Turns the abstract Level 1 element list into concrete low-poly objects the
 * player can actually see and aim at while driving: dune lumps, boulder fields,
 * solar arrays, relay masts, stratified outcrops, crystal veins, drill derricks
 * and so on. Every prop carries a family-coloured beacon column, a floating
 * marker and a ground ring drawn at its real effect radius, so approaching a
 * hazard or resource is readable long before the prompt appears.
 *
 * Coordinates come from level01_elements.json (DEM-derived; MEASURED).
 * Prop geometry, beacon heights and effect radii are gameplay (GAME).
 */

import * as THREE from 'three';
import { FAMILY_META } from '../missionElements.js';

const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;

const HAZARD_RADIUS_M = 28.0; // matches RoverInteractions hazard check (GAME)
const POI_RADIUS_M = 24.0;    // matches RoverInteractions scan / recharge (GAME)

const BEACON_HEIGHT = { hazard: 46, resource: 58, science: 62, mystery: 50 };
const SCANNER_RANGE_M = 900.0;

const _scratchColor = new THREE.Color();

function localToMesh(lx, ly) {
  return { meshX: lx - TERRAIN_WIDTH_M / 2.0, meshZ: TERRAIN_HEIGHT_M / 2.0 - ly };
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2.0;
  while (a < -Math.PI) a += Math.PI * 2.0;
  return a;
}

function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
    ...opts
  });
}

function mesh(group, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

/** Shared primitive geometries (cheap, flat-shaded low poly). */
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  ico: new THREE.IcosahedronGeometry(1, 0),
  octa: new THREE.OctahedronGeometry(1, 0),
  sphere: new THREE.SphereGeometry(1, 7, 5),
  disc: new THREE.CircleGeometry(1, 28),
  ring: new THREE.RingGeometry(0.82, 1.0, 48)
};

export class RoverWorldProps {
  constructor({ scene, elements, sampleElevation, getExaggeration, getMinElev, startPoint, goalPoint }) {
    this.scene = scene;
    this.elements = elements || [];
    this.sampleElevation = sampleElevation;
    this.getExaggeration = getExaggeration || (() => 1.0);
    this.getMinElev = getMinElev || (() => -4131.74);
    this.startPoint = startPoint || null;
    this.goalPoint = goalPoint || null;

    this.active = false;
    this.group = new THREE.Group();
    this.group.name = 'RoverWorldProps';
    this.group.visible = false;
    this.scene.add(this.group);

    this.props = [];
    this._nearest = [];
    this._nearestHazard = null;

    this.mats = {
      sand: makeMat(0xc9a17c, { roughness: 1.0 }),
      sandDark: makeMat(0xa87d5c, { roughness: 1.0 }),
      basalt: makeMat(0x6b4a3c),
      basaltDark: makeMat(0x4e352c),
      rockPale: makeMat(0xb98a6d),
      rockRust: makeMat(0x9a5c43),
      metal: makeMat(0x8a8f96, { metalness: 0.55, roughness: 0.55 }),
      metalDark: makeMat(0x4a4f55, { metalness: 0.45, roughness: 0.6 }),
      white: makeMat(0xe6e1d6, { roughness: 0.7 }),
      teal: makeMat(0x2fb0a0, { emissive: 0x0d6f63, emissiveIntensity: 0.5 }),
      panel: makeMat(0x24466e, { metalness: 0.35, roughness: 0.4 }),
      panelGlow: makeMat(0x2f7fd0, { emissive: 0x2f7fd0, emissiveIntensity: 0.55, metalness: 0.2 }),
      crystal: makeMat(0x63d6ea, { emissive: 0x2fb8d6, emissiveIntensity: 0.85, roughness: 0.25 }),
      crystalAmber: makeMat(0xe8a33d, { emissive: 0xd98a1c, emissiveIntensity: 0.8, roughness: 0.3 }),
      clay: makeMat(0x9a6f68, { roughness: 1.0 }),
      shard: makeMat(0x2a2233, { roughness: 0.5, metalness: 0.2 })
    };

    this.effectRingGeo = new THREE.RingGeometry(0.985, 1.0, 64);
    this.effectDiscGeo = new THREE.CircleGeometry(1, 48);

    this.elementById = new Map(this.elements.map(el => [el.id, el]));
    this._buildAll();
    this._buildGoalBeacon();
  }

  /**
   * A warm, tall beacon at the destination so the goal is visible from far
   * away. Coordinates are MEASURED (level01 goal); the beacon itself is GAME.
   */
  _buildGoalBeacon() {
    if (!this.goalPoint) return;
    const exag = this.getExaggeration();
    const minElev = this.getMinElev();
    const { meshX, meshZ } = localToMesh(this.goalPoint.x, this.goalPoint.y);
    const elev = this.sampleElevation(this.goalPoint.x, this.goalPoint.y);

    const beacon = new THREE.Group();
    beacon.name = 'ExploreGoalBeacon';
    beacon.position.set(meshX, (elev - minElev) * exag, meshZ);

    const columnMat = new THREE.MeshBasicMaterial({
      color: 0xf2b84b,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 5.4, 130, 8, 1, true),
      columnMat
    );
    column.position.y = 65;
    column.renderOrder = 4;
    beacon.add(column);

    const markerMat = new THREE.MeshBasicMaterial({ color: 0xf2b84b });
    const marker = new THREE.Mesh(GEO.octa, markerMat);
    marker.scale.set(3.4, 4.6, 3.4);
    marker.position.y = 28;
    marker.renderOrder = 5;
    beacon.add(marker);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf2b84b,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(this.effectRingGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(18);
    ring.position.y = 1.0;
    ring.renderOrder = 6;
    beacon.add(ring);

    this.goalBeacon = { group: beacon, column, columnMat, marker, markerMat, ring, ringMat };
    this.group.add(beacon);
  }

  _effectRadius(el) {
    if (el.family === 'hazard') return HAZARD_RADIUS_M;
    if (el.family === 'mystery') return 24.0;
    return POI_RADIUS_M;
  }

  _buildAll() {
    this.elements.forEach(el => {
      const exag = this.getExaggeration();
      const minElev = this.getMinElev();
      const { meshX, meshZ } = localToMesh(el.x, el.y);
      const elev = this.sampleElevation(el.x, el.y);
      const meta = FAMILY_META[el.family] || FAMILY_META.science;

      const group = new THREE.Group();
      group.position.set(meshX, (elev - minElev) * exag, meshZ);
      group.name = `WorldProp_${el.id}`;

      // --- Physical prop body -------------------------------------------------
      const body = new THREE.Group();
      body.name = 'body';
      // Keep the rover's spawn point clear: if a site sits exactly on the start
      // waypoint, push its physical body a short distance away. The beacon and
      // effect ring stay centred on the element itself.
      let bx = 0;
      let bz = 0;
      if (this.startPoint) {
        const d = Math.hypot(el.x - this.startPoint.x, el.y - this.startPoint.y);
        if (d < 30.0) {
          const ang = d > 0.001
            ? Math.atan2(el.x - this.startPoint.x, el.y - this.startPoint.y)
            : 0.75;
          bx = Math.sin(ang) * 24.0;
          bz = -Math.cos(ang) * 24.0;
        }
      }
      body.position.set(bx, 0, bz);
      this._buildBody(body, el);
      group.add(body);

      // --- Beacon column ------------------------------------------------------
      const pillarH = BEACON_HEIGHT[el.family] || 50;
      const pillarMat = new THREE.MeshBasicMaterial({
        color: meta.hex,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 2.6, pillarH, 7, 1, true),
        pillarMat
      );
      pillar.position.y = pillarH * 0.5;
      pillar.renderOrder = 4;
      group.add(pillar);

      // Floating family marker: readable silhouette from far away.
      const iconMat = new THREE.MeshBasicMaterial({ color: meta.hex, transparent: true, opacity: 0.85 });
      const icon = new THREE.Mesh(GEO.octa, iconMat);
      icon.scale.setScalar(el.family === 'mystery' ? 2.4 : 1.9);
      icon.position.y = 20;
      icon.renderOrder = 5;
      group.add(icon);

      // --- Effect footprint at the real interaction radius --------------------
      const radius = this._effectRadius(el);
      const ringMat = new THREE.MeshBasicMaterial({
        color: meta.hex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(this.effectRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(radius);
      ring.position.y = 0.9;
      ring.renderOrder = 6;
      group.add(ring);

      const discMat = new THREE.MeshBasicMaterial({
        color: meta.hex,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const disc = new THREE.Mesh(this.effectDiscGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.scale.setScalar(radius * 0.98);
      disc.position.y = 0.7;
      disc.renderOrder = 2;
      group.add(disc);

      group.userData = {
        element: el,
        body,
        pillar,
        pillarMat,
        icon,
        iconMat,
        ring,
        ringMat,
        disc,
        discMat,
        radius,
        baseOpacity: el.family === 'hazard' ? 0.22 : 0.16
      };

      this.group.add(group);
      this.props.push(group);
    });
  }

  _buildBody(g, el) {
    const M = this.mats;
    const put = (geo, mat, x, y, z) => mesh(g, geo, mat, x, y, z);

    switch (el.type) {
      case 'soft_sand_pocket': {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          const r = 3.4 + (i % 2) * 4.5;
          const lump = put(GEO.sphere, i % 2 ? M.sand : M.sandDark,
            Math.cos(a) * r, 0.9, Math.sin(a) * r);
          lump.scale.set(5.5 + (i % 3) * 1.6, 1.05, 4.6 + (i % 2) * 1.4);
        }
        break;
      }
      case 'rockfall_zone': {
        for (let i = 0; i < 11; i++) {
          const a = i * 2.399;
          const r = 2.5 + (i % 5) * 3.1;
          const s = 1.0 + (i % 4) * 0.7;
          const b = put(GEO.ico, i % 3 ? M.basalt : M.basaltDark,
            Math.cos(a) * r, s * 0.55, Math.sin(a) * r);
          b.scale.set(s * 1.2, s * 0.8, s);
          b.rotation.set(a, a * 1.7, a * 0.6);
        }
        break;
      }
      case 'dust_devil_corridor': {
        const pCount = 26;
        const pos = new Float32Array(pCount * 3);
        for (let i = 0; i < pCount; i++) {
          const f = i / pCount;
          const ang = f * Math.PI * 5.0;
          const rad = 2.0 + f * 10.0;
          pos[i * 3] = Math.cos(ang) * rad;
          pos[i * 3 + 1] = 3.0 + f * 34.0;
          pos[i * 3 + 2] = Math.sin(ang) * rad;
        }
        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const funnel = new THREE.Points(
          pGeo,
          new THREE.PointsMaterial({ color: 0xe8b48a, size: 2.8, transparent: true, opacity: 0.8, depthWrite: false })
        );
        g.add(funnel);
        g.userData.vortex = funnel;
        break;
      }
      case 'radio_shadow': {
        put(GEO.cyl6, M.metalDark, 0, 9, 0).scale.set(1.3, 18, 1.3);
        const dish = put(GEO.cone4, M.metal, 0, 19.5, 0);
        dish.scale.set(7.5, 3.2, 7.5);
        dish.rotation.z = Math.PI * 0.72;
        const lamp = put(GEO.box, M.basaltDark, 0, 24.5, 0);
        lamp.scale.set(2.4, 1.2, 2.4);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        g.userData.blink = put(GEO.octa, beaconMat, 0, 27, 0);
        g.userData.blink.scale.setScalar(1.8);
        break;
      }
      case 'radiation_shelter': {
        const slab = put(GEO.box, M.rockRust, 0, 6.4, 0);
        slab.scale.set(13, 1.6, 9);
        slab.rotation.z = 0.16;
        put(GEO.ico, M.basalt, -5.5, 2.4, 0).scale.set(4.2, 3.2, 4.6);
        put(GEO.ico, M.basalt, 5.8, 2.6, 0).scale.set(4.6, 3.4, 4.2);
        put(GEO.ico, M.basaltDark, 0, 2.2, 4.4).scale.set(3.6, 2.6, 3.4);
        break;
      }
      case 'oxygen_cache': {
        for (let i = 0; i < 3; i++) {
          const tank = put(GEO.cyl8, M.white, Math.cos(i * 2.1) * 2.4, 1.9, Math.sin(i * 2.1) * 2.4);
          tank.scale.set(1.35, 3.8, 1.35);
          const cap = put(GEO.cyl8, M.teal, tank.position.x, 3.95, tank.position.z);
          cap.scale.set(1.1, 0.5, 1.1);
        }
        break;
      }
      case 'solar_ridge': {
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * 9.5;
          put(GEO.cyl6, M.metalDark, x, 1.8, 0).scale.set(0.4, 3.6, 0.4);
          const panel = put(GEO.box, M.panel, x, 4.3, 0);
          panel.scale.set(7.2, 0.35, 5.4);
          panel.rotation.x = -0.38;
          const glow = put(GEO.box, M.panelGlow, x, 4.55, 0);
          glow.scale.set(6.6, 0.08, 4.8);
          glow.rotation.x = -0.38;
        }
        break;
      }
      case 'comm_relay_beacon': {
        for (let i = 0; i < 3; i++) {
          const leg = put(GEO.cyl6, M.metal, Math.cos(i * 2.09) * 2.2, 9, Math.sin(i * 2.09) * 2.2);
          leg.scale.set(0.28, 18, 0.28);
          leg.rotation.z = Math.cos(i * 2.09) * 0.10;
          leg.rotation.x = Math.sin(i * 2.09) * 0.10;
        }
        const dish = put(GEO.cone4, M.metal, 0, 18.5, 0);
        dish.scale.set(6.0, 2.8, 6.0);
        dish.rotation.z = Math.PI * 0.62;
        g.userData.spin = put(GEO.octa, M.teal, 0, 21.5, 0);
        g.userData.spin.scale.setScalar(2.0);
        break;
      }
      case 'drill_site': {
        const base = put(GEO.box, M.metalDark, 0, 0.7, 0);
        base.scale.set(10, 1.2, 10);
        for (let i = 0; i < 4; i++) {
          const a = Math.PI * 0.25 + i * Math.PI * 0.5;
          const leg = put(GEO.cyl6, M.metal, Math.cos(a) * 3.6, 6.2, Math.sin(a) * 3.6);
          leg.scale.set(0.35, 12, 0.35);
          leg.rotation.z = -Math.cos(a) * 0.20;
          leg.rotation.x = Math.sin(a) * 0.20;
        }
        put(GEO.box, M.metal, 0, 12.1, 0).scale.set(6.4, 0.8, 6.4);
        put(GEO.cyl8, M.metalDark, 0, 6.0, 0).scale.set(0.9, 10, 0.9);
        const amber = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        const lamp = put(GEO.octa, amber, 0, 14.2, 0);
        lamp.scale.setScalar(1.6);
        g.userData.blink = lamp;
        break;
      }
      case 'layered_rock_outcrop':
      case 'science_target':
      case 'boxwork_ridge_network': {
        const layered = el.type !== 'boxwork_ridge_network';
        if (layered) {
          const layers = el.type === 'science_target' ? 5 : 4;
          for (let i = 0; i < layers; i++) {
            const w = 12 - i * 1.4;
            const slab = put(GEO.box, i % 2 ? M.rockRust : M.rockPale,
              (i % 2 ? 1.1 : -0.9), 1.4 + i * 1.55, (i % 3) * 0.8 - 0.8);
            slab.scale.set(w, 1.5, w * 0.74);
            slab.rotation.y = i * 0.22;
          }
          const crystal = put(GEO.octa, M.crystal, 2.8, 9.6, 2.2);
          crystal.scale.set(1.2, 2.2, 1.2);
        } else {
          for (let i = 0; i < 5; i++) {
            const len = 26 - i * 2.2;
            const a = put(GEO.box, M.rockRust, -9 + i * 4.4, 1.6, 0);
            a.scale.set(1.1, 3.0, len);
            const b = put(GEO.box, M.rockPale, 0, 1.4, -9 + i * 4.4);
            b.scale.set(len * 0.85, 2.4, 1.0);
          }
        }
        break;
      }
      case 'clay_sample_patch': {
        const patch = put(GEO.disc, M.clay, 0, 0.25, 0);
        patch.rotation.x = -Math.PI / 2;
        patch.scale.setScalar(14);
        for (let i = 0; i < 5; i++) {
          const a = i * 1.9;
          const c = put(GEO.octa, M.crystalAmber, Math.cos(a) * (3 + i), 1.0, Math.sin(a) * (3 + i));
          c.scale.set(0.7, 1.4 + (i % 3) * 0.4, 0.7);
        }
        break;
      }
      case 'mineral_vein_hint': {
        for (let i = 0; i < 8; i++) {
          const a = i * 2.1;
          const s = 0.7 + (i % 4) * 0.35;
          const c = put(GEO.octa, M.crystal, Math.cos(a) * (2 + i * 0.9), s * 1.5, Math.sin(a) * (2 + i * 0.9));
          c.scale.set(s * 0.8, s * 3.2, s * 0.8);
          c.rotation.set(Math.sin(a) * 0.35, a, Math.cos(a) * 0.35);
        }
        break;
      }
      case 'concretion_field': {
        for (let i = 0; i < 9; i++) {
          const a = i * 2.399;
          const r = 1.5 + (i % 4) * 4.0;
          const s = 0.9 + (i % 5) * 0.55;
          const b = put(GEO.sphere, i % 2 ? M.basalt : M.basaltDark,
            Math.cos(a) * r, s * 0.8, Math.sin(a) * r);
          b.scale.setScalar(s);
        }
        break;
      }
      case 'mystery_blip': {
        for (let i = 0; i < 3; i++) {
          const a = i * 2.1;
          const shard = put(GEO.octa, M.shard, Math.cos(a) * 2.6, 3.2, Math.sin(a) * 2.6);
          shard.scale.set(2.2, 6.5, 2.2);
          shard.rotation.z = Math.cos(a) * 0.28;
        }
        const core = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        const glowMesh = put(GEO.octa, core, 0, 4.0, 0);
        glowMesh.scale.setScalar(1.7);
        g.userData.pulse = glowMesh;
        break;
      }
      default: {
        const m = put(GEO.ico, M.rockRust, 0, 2.0, 0);
        m.scale.set(7, 4, 6);
      }
    }
  }

  setActive(active) {
    this.active = active;
    this.group.visible = active;
    if (!active) {
      this._nearest = [];
      return;
    }
    this.setExaggeration();
  }

  setExaggeration() {
    const exag = this.getExaggeration();
    const minElev = this.getMinElev();
    this.props.forEach(p => {
      const el = p.userData.element;
      const elev = this.sampleElevation(el.x, el.y);
      p.position.y = (elev - minElev) * exag;
    });
    if (this.goalBeacon && this.goalPoint) {
      const elev = this.sampleElevation(this.goalPoint.x, this.goalPoint.y);
      this.goalBeacon.group.position.y = (elev - minElev) * exag;
    }
  }

  update(now, rover) {
    if (!this.active || !rover) return;
    const seconds = now / 1000.0;

    // Destination beacon: slow bob + breathing ring, warm and inviting.
    if (this.goalBeacon) {
      const gb = this.goalBeacon;
      gb.marker.rotation.y = seconds * 0.9;
      gb.marker.position.y = 28 + Math.sin(seconds * 1.8) * 2.0;
      const ringScale = 18 + Math.sin(seconds * 2.2) * 2.2;
      gb.ring.scale.setScalar(ringScale);
      gb.ringMat.opacity = 0.55 + 0.25 * Math.sin(seconds * 2.2);
      gb.columnMat.opacity = 0.18 + 0.08 * Math.sin(seconds * 1.4);
    }

    const nearest = [];
    let nearestHazard = null;
    let nearestHazardDist = Infinity;

    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      const ud = p.userData;
      const el = ud.element;
      const dx = el.x - rover.x;
      const dy = el.y - rover.y;
      const dist = Math.hypot(dx, dy);
      ud.distance = dist;

      // Proximity glow: brighten the beacon and halo as the rover approaches.
      const near = THREE.MathUtils.clamp(1.0 - dist / 500.0, 0.0, 1.0);
      const pulse = 0.5 + 0.5 * Math.sin(seconds * 3.4 + i);
      ud.pillarMat.opacity = ud.baseOpacity + near * 0.34;
      ud.ringMat.opacity = 0.34 + near * 0.46 + (near > 0.72 ? pulse * 0.18 : 0.0);
      ud.discMat.opacity = 0.05 + near * 0.16;

      ud.icon.rotation.y = seconds * 0.9 + i;
      ud.icon.position.y = 20 + Math.sin(seconds * 1.6 + i) * 1.4;
      ud.iconMat.opacity = 0.55 + near * 0.45;

      // Identified mystery anomalies switch from amber "?" to cyan science.
      if (el.family === 'mystery') {
        const hex = el.mysteryRevealed ? 0x38bdf8 : 0xf59e0b;
        if (ud.revealHex !== hex) {
          ud.revealHex = hex;
          ud.pillarMat.color.setHex(hex);
          ud.iconMat.color.setHex(hex);
          ud.ringMat.color.setHex(hex);
          ud.discMat.color.setHex(hex);
          const pulseMesh = ud.body.userData.pulse;
          if (pulseMesh && pulseMesh.material) pulseMesh.material.color.setHex(hex);
        }
      }

      // Type animations (off-screen safe: distance-gated).
      if (dist < 420) {
        const body = ud.body;
        if (body.userData.vortex) body.userData.vortex.rotation.y = seconds * 1.7;
        if (body.userData.spin) body.userData.spin.rotation.y = seconds * 2.1;
        if (body.userData.pulse) {
          const s = 1.7 + Math.sin(seconds * 5.0) * 0.35;
          body.userData.pulse.scale.setScalar(s);
        }
      }

      // Blink hazards / drill lamps.
      if (ud.body.userData.blink) {
        const on = Math.sin(seconds * (el.family === 'hazard' ? 6.0 : 2.6)) > 0.2;
        ud.body.userData.blink.visible = on;
      }

      if (dist <= SCANNER_RANGE_M) {
        const bearing = Math.atan2(dx, dy);
        nearest.push({
          element: el,
          distanceM: dist,
          bearingRel: normalizeAngle(bearing - rover.heading),
          family: el.family,
          radius: ud.radius
        });
      }
      if (el.family === 'hazard' && dist < nearestHazardDist) {
        nearestHazardDist = dist;
        nearestHazard = { element: el, distanceM: dist };
      }
    }

    nearest.sort((a, b) => a.distanceM - b.distanceM);
    this._nearest = nearest.slice(0, 4);
    this._nearestHazard = nearestHazard;
  }

  getNearest(limit = 3) {
    return this._nearest.slice(0, limit);
  }

  getNearestHazard() {
    return this._nearestHazard;
  }

  dispose() {
    this.scene.remove(this.group);
    Object.values(GEO).forEach(g => g.dispose());
    Object.values(this.mats).forEach(m => m.dispose());
    this.effectRingGeo.dispose();
    this.effectDiscGeo.dispose();
  }
}
