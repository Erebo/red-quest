/**
 * Rover Movement Dust Particles System
 * Generates small puffs of Martian dust particles behind the wheels as the rover drives,
 * gently lofting upward and drifting before fading out.
 */

import * as THREE from 'three';

const MAX_PARTICLES = 160;
const PARTICLE_LIFETIME = 1.2; // seconds

export class RoverMovementDust {
  constructor(scene) {
    this.scene = scene;

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.alphas = new Float32Array(MAX_PARTICLES);
    this.sizes = new Float32Array(MAX_PARTICLES);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    this.particles = []; // { x, y, z, vx, vy, vz, age, maxLife, startSize }
    this.lastSpawnTime = 0;

    // Lightweight custom point shader for soft fading puffs
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        dustColor: { value: new THREE.Color(0xd49b74) } // Warm Martian dust color
      },
      vertexShader: `
        attribute float alpha;
        attribute float size;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 dustColor;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.01) discard;
          // Soft circular particle falloff
          vec2 coord = gl_PointCoord - vec2(0.5);
          float distSq = dot(coord, coord);
          if (distSq > 0.25) discard;
          float falloff = smoothstep(0.25, 0.04, distSq);
          gl_FragColor = vec4(dustColor, falloff * vAlpha * 0.48);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'RoverMovementDust';
    this.points.renderOrder = 7;
    this.points.visible = false;
    this.scene.add(this.points);
  }

  reset() {
    this.particles = [];
    this.alphas.fill(0);
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  setVisible(visible) {
    this.points.visible = visible;
    if (!visible) this.reset();
  }

  update(dt, roverPhysics, currentExag = 1.0, minElev = -4131.74, nowSec = performance.now() / 1000.0) {
    if (!this.points.visible || !roverPhysics) return;

    const speed = roverPhysics.speed;
    const speedAbs = Math.abs(speed);

    // 1. Spawn small dust puffs behind left & right rear wheels when moving
    if (speedAbs > 0.8 && (nowSec - this.lastSpawnTime > 0.065)) {
      this.lastSpawnTime = nowSec;

      const meshPos = roverPhysics.getMeshCoordinates(currentExag, minElev);
      const heading = roverPhysics.heading;

      // Forward vector in horizontal plane
      const fX = Math.sin(heading);
      const fZ = -Math.cos(heading);

      // Right vector
      const rX = Math.cos(heading);
      const rZ = Math.sin(heading);

      const halfGauge = 1.15 * 1.3;
      const rearDist = -1.25 * 1.3; // behind center of rover

      // Left wheel contact point
      const lX = meshPos.x + rX * -halfGauge + fX * rearDist;
      const lZ = meshPos.z + rZ * -halfGauge + fZ * rearDist;
      const lY = meshPos.y + 0.08;

      // Right wheel contact point
      const rMeshX = meshPos.x + rX * halfGauge + fX * rearDist;
      const rMeshZ = meshPos.z + rZ * halfGauge + fZ * rearDist;
      const rMeshY = meshPos.y + 0.08;

      // Spawn 1-2 puffs per wheel
      const spawnPuff = (x, y, z) => {
        if (this.particles.length >= MAX_PARTICLES) return;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 0.35,
          y: y + Math.random() * 0.15,
          z: z + (Math.random() - 0.5) * 0.35,
          vx: -fX * (0.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.4,
          vy: 0.35 + Math.random() * 0.6, // Loft up
          vz: -fZ * (0.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.4,
          age: 0,
          maxLife: PARTICLE_LIFETIME * (0.8 + Math.random() * 0.4),
          startSize: 2.2 + Math.random() * 1.6
        });
      };

      spawnPuff(lX, lY, lZ);
      spawnPuff(rMeshX, rMeshY, rMeshZ);
    }

    // 2. Update particle positions and fade out
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Drag slows particle
      p.vx *= 0.94;
      p.vy *= 0.92;
      p.vz *= 0.94;
    }

    // 3. Write active particles into buffer attributes
    const count = this.particles.length;
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      const prog = p.age / p.maxLife;

      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;

      // Fade: quick ramp up, smooth fade down
      const alpha = prog < 0.2 ? prog / 0.2 : (1.0 - (prog - 0.2) / 0.8);
      this.alphas[i] = Math.max(0, alpha);

      // Expanding dust cloud size
      this.sizes[i] = p.startSize * (1.0 + prog * 1.8);
    }

    // Clear unused slots
    for (let i = count; i < MAX_PARTICLES; i++) {
      this.alphas[i] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
