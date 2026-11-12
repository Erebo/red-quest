/**
 * Mars Rover Third-Person Chase Camera
 * Smoothly follows the rover with orbital rotation controls,
 * subterranean clipping prevention, and cinematic victory mode.
 */

import * as THREE from 'three';

export class RoverChaseCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Follow parameters
    this.distance = 9.5;
    this.height = 4.0;
    this.lookAheadDistance = 4.0;
    this.lookAboveHeight = 1.6;
    this.lerpSpeed = 6.0;

    // Orbital angle offsets (controlled by right-click / drag)
    this.orbitAzimuth = 0.0; // Radians offset from rover heading
    this.orbitElevation = 0.0; // Radians offset in pitch
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };

    // Victory cinematic mode
    this.isCinematic = false;
    this.cinematicTime = 0.0;

    // Target positions
    this.currentPosition = new THREE.Vector3();
    this.currentTarget = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.desiredTarget = new THREE.Vector3();

    this.bindEvents();
  }

  bindEvents() {
    this._onMouseDown = (e) => {
      // Allow right-click (2) or left-click with Alt to orbit camera
      if (e.button === 2 || (e.button === 0 && e.altKey)) {
        this.isDragging = true;
        this.previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    };

    this._onMouseMove = (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      this.orbitAzimuth -= deltaX * 0.005;
      this.orbitElevation = THREE.MathUtils.clamp(
        this.orbitElevation + deltaY * 0.004,
        -Math.PI * 0.15,
        Math.PI * 0.35
      );

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    this._onMouseUp = () => {
      this.isDragging = false;
    };

    this._onWheel = (e) => {
      // Zoom distance adjustment
      this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * 0.015, 5.0, 30.0);
    };

    this._onContextMenu = (e) => {
      if (this.isDragging) e.preventDefault();
    };

    this.domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.domElement.addEventListener('wheel', this._onWheel, { passive: true });
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  startCinematicVictory() {
    this.isCinematic = true;
    this.cinematicTime = 0.0;
  }

  stopCinematic() {
    this.isCinematic = false;
  }

  resetOrbit() {
    this.orbitAzimuth = 0.0;
    this.orbitElevation = 0.0;
  }

  /**
   * Update chase camera position
   * @param {number} dt Delta time
   * @param {THREE.Vector3} roverMeshPos Rover position in mesh space
   * @param {number} roverHeading Rover heading in radians
   * @param {function} sampleElevation (lx, ly) => elevation in meters
   * @param {number} currentExag Terrain vertical exaggeration
   * @param {number} minElev Lowest elevation baseline
   */
  update(dt, roverMeshPos, roverHeading, sampleElevation, currentExag = 1.0, minElev = -4131.74) {
    if (!roverMeshPos) return;

    if (this.isCinematic) {
      this.cinematicTime += dt;
      const cinematicAngle = this.cinematicTime * 0.35;
      const cinematicDist = 16.0;
      const cinematicH = 7.0 + Math.sin(this.cinematicTime * 0.2) * 1.5;

      this.desiredPosition.set(
        roverMeshPos.x + Math.sin(cinematicAngle) * cinematicDist,
        roverMeshPos.y + cinematicH,
        roverMeshPos.z + Math.cos(cinematicAngle) * cinematicDist
      );
      this.desiredTarget.set(roverMeshPos.x, roverMeshPos.y + 1.2, roverMeshPos.z);
    } else {
      // Camera angle combines rover heading with manual orbit offset
      const combinedHeading = roverHeading + this.orbitAzimuth;

      // Position camera behind rover
      const distH = this.distance * Math.cos(this.orbitElevation);
      const camYOffset = this.height + this.distance * Math.sin(this.orbitElevation);

      // Rover forward is (sin(h), 0, -cos(h)), so behind is (-sin(h), 0, cos(h))
      const camX = roverMeshPos.x - Math.sin(combinedHeading) * distH;
      const camZ = roverMeshPos.z + Math.cos(combinedHeading) * distH;
      let camY = roverMeshPos.y + camYOffset;

      // Anti-Subterranean Ground Collision:
      // Sample terrain elevation at the camera's world coordinates
      if (sampleElevation) {
        const camLx = camX + 2500.0;
        const camLy = 2500.0 - camZ;
        if (camLx >= 0 && camLx <= 5000.0 && camLy >= 0 && camLy <= 5000.0) {
          const groundElev = sampleElevation(camLx, camLy);
          const minCamY = (groundElev - minElev) * currentExag + 1.4 * currentExag;
          if (camY < minCamY) {
            camY = minCamY;
          }
        }
      }

      this.desiredPosition.set(camX, camY, camZ);

      // Camera look target is slightly ahead of the rover
      this.desiredTarget.set(
        roverMeshPos.x + Math.sin(roverHeading) * this.lookAheadDistance,
        roverMeshPos.y + this.lookAboveHeight,
        roverMeshPos.z - Math.cos(roverHeading) * this.lookAheadDistance
      );
    }

    // Smooth lerp
    const t = Math.min(1.0, dt * this.lerpSpeed);
    this.currentPosition.lerp(this.desiredPosition, t);
    this.currentTarget.lerp(this.desiredTarget, t);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentTarget);
  }

  dispose() {
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
  }
}
