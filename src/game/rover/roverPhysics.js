/**
 * Mars Rover Kinematic & Terrain Physics Simulation
 * Conforms rover to the 5x5 km Gale Crater MOLA DEM height grid.
 * Handles slope gradient derivation, wheel-slip tiers, speed scaling,
 * energy consumption (SIM), and bounds containment.
 */

import * as THREE from 'three';

const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;
const BOUNDS_MARGIN = 20.0;

export class RoverPhysics {
  constructor(options = {}) {
    this.x = options.startX ?? 2802.84;
    this.y = options.startY ?? 3004.80;
    this.heading = options.startHeading ?? 0.0; // Radians, 0 = forward along -Z (North)
    this.speed = 0.0; // m/s
    this.angularSpeed = 0.0; // rad/s

    // Dynamic state
    this.elevation = 0.0;
    this.slopeDeg = 0.0;
    this.normal = new THREE.Vector3(0, 1, 0);
    this.forwardDir = new THREE.Vector3(0, 0, -1);
    this.quaternion = new THREE.Quaternion();
    
    // Status flags
    this.isSlipping = false;
    this.isHazardSlowdown = false;
    this.isDustSlowdown = false;
    this.isClimbingBlocked = false;
    this.slopeTier = 'safe'; // 'safe' (<15°), 'caution' (15°-25°), 'danger' (>25°)

    // Telemetry & Battery (SIM)
    this.batteryPct = 100.0;
    this.totalDistanceM = 0.0;
    this.driveTimeSec = 0.0;
    this.lastDeltaM = 0.0;

    // Movement tuning
    this.maxForwardSpeed = 12.5; // ~45 km/h nominal max
    this.maxReverseSpeed = 5.0;  // ~18 km/h reverse
    this.boostMultiplier = 1.45; // ~18 m/s (65 km/h) boost
    this.accelRate = 16.0;       // m/s^2
    this.brakeRate = 28.0;       // m/s^2
    this.coastBrake = 5.5;       // m/s^2, engine braking when throttle is released
    this.turnRate = 2.4;         // rad/s steering speed
    this.turnDrag = 12.0;

    // Slope & resistance model (SIM)
    this.gravity = 3.71;             // Mars surface gravity, m/s^2
    this.rollingResistance = 0.12;   // m/s^2, wheels/bearings on flat ground
    this.aeroDrag = 0.0002;          // m/s^2 at 1 m/s, scales with v^2
    this.overspeedDecay = 4.0;       // m/s^2, gentle settle back under a lower cap
    this.gradeDeg = 0.0;             // signed slope along heading (+ uphill)

    // Scratch math objects to prevent garbage collection allocations
    this._up = new THREE.Vector3(0, 1, 0);
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._rotMatrix = new THREE.Matrix4();
    this._targetQuat = new THREE.Quaternion();
  }

  /**
   * Reset rover to specific coordinates
   */
  reset(x, y, heading = 0.0) {
    this.x = Math.max(BOUNDS_MARGIN, Math.min(TERRAIN_WIDTH_M - BOUNDS_MARGIN, x));
    this.y = Math.max(BOUNDS_MARGIN, Math.min(TERRAIN_HEIGHT_M - BOUNDS_MARGIN, y));
    this.heading = heading;
    this.speed = 0.0;
    this.angularSpeed = 0.0;
    this.isSlipping = false;
    this.isHazardSlowdown = false;
    this.isDustSlowdown = false;
    this.isClimbingBlocked = false;
  }

  /**
   * Recharge battery by delta percent (capped at 100%)
   */
  rechargeBattery(amountPct) {
    this.batteryPct = Math.min(100.0, this.batteryPct + amountPct);
  }

  /**
   * Consume battery for external actions (e.g. drilling)
   */
  consumeBattery(amountPct) {
    this.batteryPct = Math.max(0.0, this.batteryPct - amountPct);
  }

  /**
   * Simulation step
   * @param {number} dt Delta time in seconds
   * @param {object} input { forward: -1..1, steer: -1..1, boost: bool, reset: bool }
   * @param {function} sampleElevation (lx, ly) => elevation in meters
   * @param {number} currentExag Terrain vertical exaggeration factor (default 1.0)
   * @param {number} minElev Lowest elevation baseline
   */
  update(dt, input, sampleElevation, currentExag = 1.0, minElev = -4131.74) {
    if (dt <= 0 || !sampleElevation) return;
    dt = Math.min(dt, 0.1); // Clamp large lag spikes

    if (input.reset) {
      this.speed = 0.0;
      this.angularSpeed = 0.0;
    }

    // 1. Current terrain height and local surface gradient
    const delta = 1.8; // Sample baseline in meters
    const curElev = sampleElevation(this.x, this.y);
    const hL = sampleElevation(this.x - delta, this.y);
    const hR = sampleElevation(this.x + delta, this.y);
    const hD = sampleElevation(this.x, this.y - delta);
    const hU = sampleElevation(this.x, this.y + delta);

    this.elevation = curElev;

    // In Three.js mesh space:
    // meshX = lx - 2500
    // meshZ = 2500 - ly
    // meshY = (elevation - minElev) * exag
    const dz_dx = ((hR - hL) / (2.0 * delta)) * currentExag;
    const dz_dy = ((hU - hD) / (2.0 * delta)) * currentExag;

    // Normal in mesh coordinates: (-dz/dx, 1.0, dz/dy) normalized
    this.normal.set(-dz_dx, 1.0, dz_dy).normalize();

    // Slope angle relative to horizontal plane
    const cosSlope = THREE.MathUtils.clamp(this.normal.y, 0.0, 1.0);
    this.slopeDeg = Math.acos(cosSlope) * (180.0 / Math.PI);

    // Classify slope tier
    if (this.slopeDeg < 15.0) {
      this.slopeTier = 'safe';
      this.isSlipping = false;
      this.isClimbingBlocked = false;
    } else if (this.slopeDeg <= 25.0) {
      this.slopeTier = 'caution';
      this.isSlipping = false;
      this.isClimbingBlocked = false;
    } else {
      this.slopeTier = 'danger';
      this.isSlipping = true;
    }

    // 2. Handle Steering
    const targetAngularSpeed = (input.steer || 0.0) * this.turnRate;
    this.angularSpeed = THREE.MathUtils.lerp(this.angularSpeed, targetAngularSpeed, Math.min(1.0, dt * this.turnDrag));
    this.heading += this.angularSpeed * dt;

    // Normalize heading to [-PI, PI]
    while (this.heading > Math.PI) this.heading -= Math.PI * 2.0;
    while (this.heading < -Math.PI) this.heading += Math.PI * 2.0;

    // Direction vector in horizontal mesh plane (Three.js: forward is -Z when heading=0)
    this.forwardDir.set(Math.sin(this.heading), 0, -Math.cos(this.heading));

    // Determine if driving uphill or downhill
    // In mesh space, forward direction is (dx, dz). Elevation gradient is (-normal.x / normal.y, -normal.z / normal.y)
    const gradientForward = -(this.forwardDir.x * this.normal.x + this.forwardDir.z * this.normal.z);
    const isDrivingUphill = gradientForward > 0.05;
    this.gradeDeg = Math.atan(gradientForward) * (180.0 / Math.PI);

    // Slope gravity along the heading: positive = acceleration downhill.
    // sin(grade) = tan(grade) / sqrt(1 + tan^2(grade))
    const sinGrade = gradientForward / Math.sqrt(1.0 + gradientForward * gradientForward);
    const gravityAccel = -this.gravity * sinGrade;

    // Check extreme slope block (> 35° uphill)
    if (this.slopeDeg > 35.0 && isDrivingUphill && input.forward > 0) {
      this.isClimbingBlocked = true;
      this.isSlipping = true;
    } else {
      this.isClimbingBlocked = false;
    }

    // 3. Acceleration & Speed Calculation
    let targetMaxSpeed = this.maxForwardSpeed;
    if (input.boost && this.batteryPct > 5.0) {
      targetMaxSpeed *= this.boostMultiplier;
    }

    // Penalty for > 25° slope
    if (this.slopeDeg > 25.0) {
      targetMaxSpeed *= 0.40; // 60% speed cut
    }

    // Penalty for hazards (e.g. sand pocket) or dust storm
    if (this.isHazardSlowdown || this.isDustSlowdown) {
      targetMaxSpeed *= 0.50;
    }

    if (this.isClimbingBlocked) {
      targetMaxSpeed = 0.0;
    }

    const throttle = input.forward || 0.0;

    if (this.isClimbingBlocked) {
      // Too steep: brake to a stop instead of leaving the player stuck at speed.
      const abs = Math.abs(this.speed);
      this.speed = Math.sign(this.speed) * Math.max(0.0, abs - this.brakeRate * dt);
    } else if (throttle > 0.05) {
      // Motor drive: throttle plus slope gravity, settling under the cap.
      const accel = this.accelRate * (this.isSlipping ? 0.45 : 1.0);
      const prevSpeed = this.speed;
      if (this.speed < targetMaxSpeed) {
        this.speed = Math.min(targetMaxSpeed, this.speed + (accel * throttle + gravityAccel) * dt);
      } else {
        // Already above the cap (boost ended, downhill, hazard): bleed down
        // gradually instead of snapping.
        this.speed = prevSpeed > targetMaxSpeed
          ? Math.max(targetMaxSpeed, prevSpeed - this.overspeedDecay * dt)
          : targetMaxSpeed;
      }
    } else if (throttle < -0.05) {
      // S brakes first, then reverses.
      if (this.speed > 0.05) {
        this.speed = Math.max(0.0, this.speed - this.brakeRate * Math.abs(throttle) * dt);
      } else {
        this.speed = Math.max(
          -this.maxReverseSpeed,
          this.speed - this.accelRate * 0.7 * Math.abs(throttle) * dt + gravityAccel * dt
        );
      }
    } else {
      // Coasting: releasing the throttle always sheds speed (arcade engine
      // brake). Gravity still pulls on grades, but flat ground rolls to a stop.
      this.speed += gravityAccel * dt;
      const speedAbs = Math.abs(this.speed);
      const resist = this.coastBrake + this.rollingResistance + this.aeroDrag * speedAbs * speedAbs;
      if (speedAbs > 0.0) {
        this.speed -= Math.sign(this.speed) * Math.min(speedAbs, resist * dt);
      }
      if (Math.abs(this.speed) < 0.06) this.speed = 0.0;
    }

    // Aerodynamic terminal speed keeps long downhill runs bounded.
    const terminalSpeed = this.maxForwardSpeed * 1.6;
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverseSpeed * 1.2, terminalSpeed);

    // 4. Update Position
    // In local terrain coords:
    // meshX = lx - 2500 -> dlx = d_meshX
    // meshZ = 2500 - ly -> dly = -d_meshZ
    const dMeshX = this.forwardDir.x * this.speed * dt;
    const dMeshZ = this.forwardDir.z * this.speed * dt;

    const nextX = this.x + dMeshX;
    const nextY = this.y - dMeshZ;

    // Check bounds
    if (nextX < BOUNDS_MARGIN || nextX > TERRAIN_WIDTH_M - BOUNDS_MARGIN) {
      this.speed = 0.0;
    } else {
      this.x = nextX;
    }

    if (nextY < BOUNDS_MARGIN || nextY > TERRAIN_HEIGHT_M - BOUNDS_MARGIN) {
      this.speed = 0.0;
    } else {
      this.y = nextY;
    }

    // Distance & Time accounting
    const distDelta = Math.abs(this.speed) * dt;
    this.lastDeltaM = distDelta;
    this.totalDistanceM += distDelta;
    this.driveTimeSec += dt;

    // 5. Battery (SIM) Model
    // Nominal consumption: ~0.0018% per meter moved
    // Climbing work: increases up to 3x on steep hills
    // Overdrive boost: 2.2x rate
    if (distDelta > 0.001) {
      let slopeWork = 1.0;
      if (isDrivingUphill) {
        slopeWork += Math.sin(this.slopeDeg * Math.PI / 180.0) * 2.5;
      }
      const boostCost = input.boost ? 2.2 : 1.0;
      const hazardCost = (this.isHazardSlowdown || this.isDustSlowdown) ? 1.8 : 1.0;
      const meterDrain = 0.0018 * distDelta * slopeWork * boostCost * hazardCost;
      this.batteryPct = Math.max(0.0, this.batteryPct - meterDrain);
    }
    // Idle housekeeping draw: 0.02% per second
    this.batteryPct = Math.max(0.0, this.batteryPct - 0.02 * dt);

    // 6. Compute 3D Orientation (Orient Up vector to terrain normal, Forward to tangent forward)
    this._fwd.copy(this.forwardDir);
    // Project forward direction onto the tangent plane perpendicular to the normal
    this._fwd.sub(this.normal.clone().multiplyScalar(this._fwd.dot(this.normal))).normalize();
    this._right.crossVectors(this._fwd, this.normal).normalize();

    // Construct rotation matrix from [right, normal, -fwd]
    this._rotMatrix.makeBasis(this._right, this.normal, this._fwd.clone().negate());
    this._targetQuat.setFromRotationMatrix(this._rotMatrix);

    // Smoothly slerp chassis orientation to absorb micro-bumps cleanly
    this.quaternion.slerp(this._targetQuat, Math.min(1.0, dt * 12.0));
  }

  /**
   * Get 3D Three.js mesh coordinates
   */
  getMeshCoordinates(currentExag = 1.0, minElev = -4131.74) {
    return {
      x: this.x - TERRAIN_WIDTH_M / 2.0,
      y: (this.elevation - minElev) * currentExag + 0.12, // Drape chassis at wheel contact level
      z: TERRAIN_HEIGHT_M / 2.0 - this.y
    };
  }

  /**
   * Speed in km/h
   */
  getSpeedKmh() {
    return Math.abs(this.speed) * 3.6;
  }
}
