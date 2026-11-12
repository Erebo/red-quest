/**
 * Mars Exploration Rover 3D Model
 * Procedural low-poly construction using Three.js primitive geometries.
 * Zero external 3D assets: BoxGeometry, CylinderGeometry, RingGeometry.
 */

import * as THREE from 'three';

// The rover is a car-sized machine. A slight visual upscale plus a closer,
// lower chase camera stops it reading like a toy on the huge terrain facets.
const ROVER_VISUAL_SCALE = 1.3;

export function createRoverModel() {
  const roverGroup = new THREE.Group();
  roverGroup.name = 'MarsRover';
  roverGroup.scale.setScalar(ROVER_VISUAL_SCALE);

  // Materials
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0xded8cc, // Titanium / warm off-white
    roughness: 0.55,
    metalness: 0.25,
    flatShading: true
  });

  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x1f232b, // Dark solar panel navy/grey
    roughness: 0.25,
    metalness: 0.8,
    flatShading: true
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x2e3238,
    roughness: 0.7,
    metalness: 0.2,
    flatShading: true
  });

  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x1e2022,
    roughness: 0.85,
    metalness: 0.15,
    flatShading: true
  });

  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xd97706, // Mars amber/gold hub
    roughness: 0.4,
    metalness: 0.5,
    flatShading: true
  });

  const lightGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfff6dd
  });

  const scanBeamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  // 1. MAIN CHASSIS (Warm off-white body)
  const chassis = new THREE.Group();
  chassis.position.y = 0.85;

  const bodyGeo = new THREE.BoxGeometry(1.6, 0.65, 2.4);
  const bodyMesh = new THREE.Mesh(bodyGeo, chassisMat);
  chassis.add(bodyMesh);

  // Chamfered front nose
  const noseGeo = new THREE.BoxGeometry(1.4, 0.45, 0.6);
  const noseMesh = new THREE.Mesh(noseGeo, chassisMat);
  noseMesh.position.set(0, -0.1, 1.4);
  chassis.add(noseMesh);

  // Power deck / Solar platform
  const deckGeo = new THREE.BoxGeometry(1.7, 0.08, 2.2);
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.position.set(0, 0.35, -0.05);
  chassis.add(deckMesh);

  // RTG (Radioisotope Thermoelectric Generator) cylinder at rear
  const rtgGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12);
  rtgGeo.rotateX(Math.PI / 2);
  const rtgMesh = new THREE.Mesh(rtgGeo, darkMat);
  rtgMesh.position.set(0, 0.42, -1.15);
  chassis.add(rtgMesh);

  // Thermal cooling fins on RTG
  for (let i = 0; i < 4; i++) {
    const finGeo = new THREE.BoxGeometry(0.72, 0.04, 0.8);
    const finMesh = new THREE.Mesh(finGeo, darkMat);
    finMesh.position.set(0, 0.42, -1.15);
    finMesh.rotation.z = (i * Math.PI) / 4;
    chassis.add(finMesh);
  }

  // 2. SWIVELING MAST & PANCAM HEAD
  const mastGroup = new THREE.Group();
  mastGroup.position.set(0.42, 0.38, 0.85); // Mounted on right-front deck

  const mastPoleGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.35, 8);
  const mastPole = new THREE.Mesh(mastPoleGeo, darkMat);
  mastPole.position.y = 0.675;
  mastGroup.add(mastPole);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.35;

  const headGeo = new THREE.BoxGeometry(0.44, 0.24, 0.3);
  const headMesh = new THREE.Mesh(headGeo, chassisMat);
  headGroup.add(headMesh);

  // Dual camera lenses (Pancam)
  const lensGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12);
  lensGeo.rotateX(Math.PI / 2);
  const lensL = new THREE.Mesh(lensGeo, darkMat);
  lensL.position.set(-0.12, 0, 0.18);
  const lensR = new THREE.Mesh(lensGeo, darkMat);
  lensR.position.set(0.12, 0, 0.18);
  headGroup.add(lensL);
  headGroup.add(lensR);

  // Emissive lens center dots
  const lensDotGeo = new THREE.CircleGeometry(0.045, 12);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const dotL = new THREE.Mesh(lensDotGeo, dotMat);
  dotL.position.set(-0.12, 0, 0.242);
  const dotR = new THREE.Mesh(lensDotGeo, dotMat);
  dotR.position.set(0.12, 0, 0.242);
  headGroup.add(dotL);
  headGroup.add(dotR);

  mastGroup.add(headGroup);
  chassis.add(mastGroup);

  // 3. ARTICULATED ROBOTIC ARM (Front-center)
  const armGroup = new THREE.Group();
  armGroup.position.set(-0.35, -0.05, 1.45); // Left-front mount

  const shoulderPivot = new THREE.Group();
  armGroup.add(shoulderPivot);

  const upperArmGeo = new THREE.BoxGeometry(0.12, 0.12, 0.65);
  const upperArm = new THREE.Mesh(upperArmGeo, darkMat);
  upperArm.position.set(0, -0.1, 0.3);
  upperArm.rotation.x = -0.3;
  shoulderPivot.add(upperArm);

  const forearmGroup = new THREE.Group();
  forearmGroup.position.set(0, -0.22, 0.58);
  shoulderPivot.add(forearmGroup);

  const forearmGeo = new THREE.BoxGeometry(0.1, 0.1, 0.55);
  const forearm = new THREE.Mesh(forearmGeo, chassisMat);
  forearm.position.set(0, -0.12, 0.24);
  forearm.rotation.x = 0.5;
  forearmGroup.add(forearm);

  // Turret / Sensor Head at tip of arm
  const turretGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 10);
  turretGeo.rotateZ(Math.PI / 2);
  const turretMesh = new THREE.Mesh(turretGeo, hubMat);
  turretMesh.position.set(0, -0.24, 0.48);
  forearmGroup.add(turretMesh);

  // Scanning laser beam cone (visible during scanning/drilling)
  const scanBeamGeo = new THREE.ConeGeometry(0.8, 1.8, 16, 1, true);
  scanBeamGeo.rotateX(Math.PI / 2);
  const scanBeamMesh = new THREE.Mesh(scanBeamGeo, scanBeamMat);
  scanBeamMesh.position.set(0, -0.24, 1.38);
  forearmGroup.add(scanBeamMesh);

  chassis.add(armGroup);

  // 4. ROCKER-BOGIE 6-WHEEL SUSPENSION
  const wheels = [];
  const wheelRadius = 0.42;
  const wheelWidth = 0.38;

  // Offsets for 6 wheels: [x, z] relative to chassis
  // X: +/- 1.15 m, Z: +0.95 (front), 0.0 (middle), -0.95 (rear)
  const wheelOffsets = [
    { x: -1.15, y: -0.42, z: 0.95, side: 'left' },
    { x: 1.15, y: -0.42, z: 0.95, side: 'right' },
    { x: -1.22, y: -0.42, z: 0.0, side: 'left' },
    { x: 1.22, y: -0.42, z: 0.0, side: 'right' },
    { x: -1.15, y: -0.42, z: -0.95, side: 'left' },
    { x: 1.15, y: -0.42, z: -0.95, side: 'right' }
  ];

  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
  wheelGeo.rotateZ(Math.PI / 2);

  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, wheelWidth + 0.02, 12);
  hubGeo.rotateZ(Math.PI / 2);

  // Suspension strut arms
  const strutMat = darkMat;

  wheelOffsets.forEach((offset, idx) => {
    const wheelAssembly = new THREE.Group();
    wheelAssembly.position.set(offset.x, offset.y, offset.z);

    const tireMesh = new THREE.Mesh(wheelGeo, wheelMat);
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    tireMesh.add(hubMesh);

    // Subtle tread ridges on wheels
    for (let t = 0; t < 6; t++) {
      const cleatGeo = new THREE.BoxGeometry(wheelWidth + 0.01, 0.05, 0.08);
      const cleat = new THREE.Mesh(cleatGeo, darkMat);
      cleat.rotation.x = (t * Math.PI) / 3;
      cleat.position.y = Math.sin((t * Math.PI) / 3) * (wheelRadius - 0.02);
      cleat.position.z = Math.cos((t * Math.PI) / 3) * (wheelRadius - 0.02);
      tireMesh.add(cleat);
    }

    wheelAssembly.add(tireMesh);
    chassis.add(wheelAssembly);

    wheels.push({
      mesh: tireMesh,
      assembly: wheelAssembly,
      side: offset.side,
      originalZ: offset.z
    });

    // Rocker-Bogie connection strut to body
    const strutGeo = new THREE.BoxGeometry(0.35, 0.08, 0.08);
    const strut = new THREE.Mesh(strutGeo, strutMat);
    const strutX = offset.x > 0 ? offset.x - 0.2 : offset.x + 0.2;
    strut.position.set(strutX, offset.y + 0.15, offset.z);
    strut.rotation.z = offset.x > 0 ? 0.35 : -0.35;
    chassis.add(strut);
  });

  // Longitudinal rocker bogie bar along left and right sides
  [-0.95, 0.95].forEach(sx => {
    const barGeo = new THREE.BoxGeometry(0.08, 0.08, 2.0);
    const bar = new THREE.Mesh(barGeo, strutMat);
    bar.position.set(sx, -0.22, 0);
    chassis.add(bar);
  });

  // 5. DUAL FORWARD HEADLIGHTS & SPOTLIGHTS
  const headlights = [];
  [-0.52, 0.52].forEach(hx => {
    const lampGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.14, 10);
    lampGeo.rotateX(Math.PI / 2);
    const lamp = new THREE.Mesh(lampGeo, darkMat);
    lamp.position.set(hx, 0.05, 1.55);

    const bulbGeo = new THREE.CircleGeometry(0.08, 10);
    const bulb = new THREE.Mesh(bulbGeo, lightGlowMat);
    bulb.position.set(0, 0, 0.075);
    lamp.add(bulb);
    chassis.add(lamp);

    // Three.js Spotlight casting directional ground cone
    const spot = new THREE.SpotLight(0xfff0d4, 3.2, 48, Math.PI / 5.5, 0.45, 1.2);
    spot.position.set(hx, 0.9, 1.6);

    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(hx * 1.5, -0.2, 16.0);
    spot.target = spotTarget;

    roverGroup.add(spot);
    roverGroup.add(spotTarget);

    headlights.push({ spot, bulb, lamp, target: spotTarget });
  });

  // 6. CHASSIS STATUS BEACON
  const beaconGeo = new THREE.RingGeometry(0.4, 0.7, 16);
  beaconGeo.rotateX(-Math.PI / 2);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0, 1.25, 0);
  chassis.add(beacon);

  roverGroup.add(chassis);

  // Helper properties & state
  let currentWheelAngle = 0;
  let mastTargetAngle = 0;
  let mastCurrentAngle = 0;

  roverGroup.userData = {
    chassis,
    mastGroup,
    headGroup,
    shoulderPivot,
    forearmGroup,
    scanBeamMesh,
    scanBeamMat,
    beacon,
    beaconMat,
    wheels,
    headlights,

    // Animate wheel rolling
    updateWheelRotation(distanceDeltaM) {
      const rollAngle = distanceDeltaM / (wheelRadius * roverGroup.scale.x);
      currentWheelAngle += rollAngle;
      wheels.forEach(w => {
        w.mesh.rotation.x = currentWheelAngle;
      });
    },

    // Swivel mast camera optics head
    setMastHeading(targetAngleRad, dt = 0.016) {
      mastTargetAngle = THREE.MathUtils.clamp(targetAngleRad, -Math.PI * 0.45, Math.PI * 0.45);
      mastCurrentAngle = THREE.MathUtils.lerp(mastCurrentAngle, mastTargetAngle, Math.min(1.0, dt * 6.0));
      headGroup.rotation.y = mastCurrentAngle;
    },

    // Articulate arm for scanning / drilling animation
    setArmScanState(active, progress = 0.0) {
      if (active) {
        // Lower arm toward ground
        shoulderPivot.rotation.x = THREE.MathUtils.lerp(shoulderPivot.rotation.x, -0.55, 0.12);
        forearmGroup.rotation.x = THREE.MathUtils.lerp(forearmGroup.rotation.x, 0.85, 0.12);
        // Pulse scanning laser cone
        scanBeamMat.opacity = 0.35 + 0.35 * Math.sin(progress * Math.PI * 6.0);
      } else {
        // Retract arm back to driving position
        shoulderPivot.rotation.x = THREE.MathUtils.lerp(shoulderPivot.rotation.x, 0.0, 0.1);
        forearmGroup.rotation.x = THREE.MathUtils.lerp(forearmGroup.rotation.x, 0.0, 0.1);
        scanBeamMat.opacity = THREE.MathUtils.lerp(scanBeamMat.opacity, 0.0, 0.2);
      }
    },

    // Toggle headlights
    setHeadlights(enabled) {
      headlights.forEach(h => {
        h.spot.intensity = enabled ? 3.2 : 0.0;
        h.bulb.visible = enabled;
      });
    },

    // Pulse status beacon
    pulseBeacon(timeSec) {
      const s = 1.0 + 0.15 * Math.sin(timeSec * 4.0);
      beacon.scale.set(s, s, s);
      beaconMat.opacity = 0.45 + 0.4 * Math.cos(timeSec * 3.0);
    }
  };

  return roverGroup;
}
