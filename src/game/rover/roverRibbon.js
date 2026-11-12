/**
 * Route Hologram Ribbon & Start / Goal Objective Beacons
 * Renders the chosen candidate traverse as a soft glowing guide ribbon
 * and marks Start and Destination with procedural NASA-themed landmarks.
 */

import * as THREE from 'three';

const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;

export class RoverRouteRibbon {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'RoverRouteRibbon';
    this.scene.add(this.group);

    this.ribbonMesh = null;
    this.startMarker = null;
    this.goalBeacon = null;
    this.lightColumn = null;
    this.goalPulseRing = null;

    this.waypoints = [];
    this.currentExag = 1.0;
    this.minElev = -4131.74;
    this.sampleElevation = null;
  }

  /**
   * Initialize ribbon with candidate route waypoints
   */
  setRoute(candidateRoute, sampleElevation, currentExag = 1.0, minElev = -4131.74) {
    this.clear();

    if (!candidateRoute || !candidateRoute.waypoints || candidateRoute.waypoints.length < 2) {
      return;
    }

    this.waypoints = candidateRoute.waypoints;
    this.sampleElevation = sampleElevation;
    this.currentExag = currentExag;
    this.minElev = minElev;

    // Glowing vibrant cyan/blue guide path
    const routeColor = new THREE.Color(candidateRoute.blindColor || '#38bdf8');

    // 1. Glowing Route Ribbon (hovering 0.6 m above DEM surface)
    const points = [];
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const meshX = wp.x - TERRAIN_WIDTH_M / 2.0;
      const meshZ = TERRAIN_HEIGHT_M / 2.0 - wp.y;
      const elev = sampleElevation ? sampleElevation(wp.x, wp.y) : (wp.elevation || -3800.0);
      const meshY = (elev - minElev) * currentExag + 0.65 * currentExag;
      points.push(new THREE.Vector3(meshX, meshY, meshZ));
    }

    // Build CatmullRomCurve3 for smooth path
    const curve = new THREE.CatmullRomCurve3(points);
    const divisions = Math.max(100, points.length * 8);
    const curvePoints = curve.getPoints(divisions);

    // Build a ribbon mesh using triangle strip
    const ribbonWidth = 2.8;
    const ribbonGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(curvePoints.length * 2 * 3);
    const uvs = new Float32Array(curvePoints.length * 2 * 2);

    for (let i = 0; i < curvePoints.length; i++) {
      const pt = curvePoints[i];
      let tangent;
      if (i === 0) {
        tangent = curvePoints[1].clone().sub(pt).normalize();
      } else if (i === curvePoints.length - 1) {
        tangent = pt.clone().sub(curvePoints[i - 1]).normalize();
      } else {
        tangent = curvePoints[i + 1].clone().sub(curvePoints[i - 1]).normalize();
      }

      // Normal is roughly (0, 1, 0), side vector is cross(tangent, normal)
      const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

      const pLeft = pt.clone().addScaledVector(side, -ribbonWidth * 0.5);
      const pRight = pt.clone().addScaledVector(side, ribbonWidth * 0.5);

      const vIdx = i * 6;
      positions[vIdx] = pLeft.x;
      positions[vIdx + 1] = pLeft.y;
      positions[vIdx + 2] = pLeft.z;

      positions[vIdx + 3] = pRight.x;
      positions[vIdx + 4] = pRight.y;
      positions[vIdx + 5] = pRight.z;

      const uIdx = i * 4;
      const progress = i / (curvePoints.length - 1);
      uvs[uIdx] = 0;
      uvs[uIdx + 1] = progress;
      uvs[uIdx + 2] = 1;
      uvs[uIdx + 3] = progress;
    }

    const indices = [];
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }

    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    ribbonGeo.setIndex(indices);
    ribbonGeo.computeVertexNormals();

    const ribbonMat = new THREE.MeshBasicMaterial({
      color: routeColor,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    this.group.add(this.ribbonMesh);

    // 2. Start Marker (Descent Stage / Heat Shield landmark)
    const pStart = points[0];
    this.startMarker = new THREE.Group();
    this.startMarker.position.copy(pStart);

    // Heat shield dome
    const shieldGeo = new THREE.ConeGeometry(3.8, 1.2, 16);
    shieldGeo.rotateX(Math.PI);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0xc49753, // Gold-foil thermal blanket
      roughness: 0.35,
      metalness: 0.7,
      flatShading: true
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.y = 0.6;
    this.startMarker.add(shield);

    // Antenna mast & survey flag
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 6.0, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 3.6;
    this.startMarker.add(pole);

    const flagGeo = new THREE.BoxGeometry(2.0, 1.2, 0.04);
    const flagMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(1.0, 6.0, 0);
    this.startMarker.add(flag);

    this.group.add(this.startMarker);

    // 3. Goal Beacon (Science Destination Beacon & Pulsing Pillar)
    const pGoal = points[points.length - 1];
    this.goalBeacon = new THREE.Group();
    this.goalBeacon.position.copy(pGoal);

    // Holographic landing ring
    const ringGeo = new THREE.RingGeometry(8.0, 11.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.goalPulseRing = new THREE.Mesh(ringGeo, ringMat);
    this.goalPulseRing.position.y = 0.2;
    this.goalBeacon.add(this.goalPulseRing);

    // Inner concentric ring
    const innerRingGeo = new THREE.RingGeometry(3.5, 4.8, 24);
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRing = new THREE.Mesh(innerRingGeo, ringMat);
    innerRing.position.y = 0.25;
    this.goalBeacon.add(innerRing);

    // Vertical holographic light column
    const colGeo = new THREE.CylinderGeometry(2.5, 5.0, 90.0, 24, 1, true);
    const colMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.lightColumn = new THREE.Mesh(colGeo, colMat);
    this.lightColumn.position.y = 45.0;
    this.goalBeacon.add(this.lightColumn);

    this.group.add(this.goalBeacon);
  }

  /**
   * Animate beacon pulsing
   */
  update(timeSec) {
    if (this.goalPulseRing) {
      const s = 1.0 + 0.12 * Math.sin(timeSec * 3.5);
      this.goalPulseRing.scale.set(s, s, s);
      this.goalPulseRing.material.opacity = 0.6 + 0.3 * Math.cos(timeSec * 3.5);
    }
    if (this.lightColumn) {
      this.lightColumn.rotation.y = timeSec * 0.4;
      this.lightColumn.material.opacity = 0.22 + 0.12 * Math.sin(timeSec * 2.0);
    }
  }

  /**
   * Recompute ribbon elevations on exaggeration change
   */
  updateExaggeration(exag) {
    this.currentExag = exag;
    if (this.waypoints.length > 0) {
      this.setRoute({ waypoints: this.waypoints }, this.sampleElevation, exag, this.minElev);
    }
  }

  clear() {
    while (this.group.children.length > 0) {
      const obj = this.group.children[0];
      this.group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.ribbonMesh = null;
    this.startMarker = null;
    this.goalBeacon = null;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
