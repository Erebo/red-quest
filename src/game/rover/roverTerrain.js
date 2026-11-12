/**
 * Explore-mode Astroneer-style terrain.
 *
 * The orbital albedo is swapped for a solid-colour, smooth-shaded surface while
 * the player drives. Heights come from the loaded MOLA DEM; only the
 * micro-relief, palette and boulder scatter are gameplay additions (GAME).
 *
 * Two nested patches follow the rover:
 *   - near patch  ~420 m wide at ~1.6 m resolution for close-up ground
 *   - far patch  ~1100 m wide at ~3.8 m resolution for the horizon
 *
 * The near patch is rebuilt every ~120 m of travel, the far patch every ~360 m.
 * That is deliberately more expensive than the old single 3.1 m patch: it is
 * the "costly rebuild" that removes the visible giant triangles up close while
 * keeping the soft, rounded low-poly Astroneer look.
 */

import * as THREE from 'three';

const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;

const FAR_SIZE_M = 1100.0;
const FAR_SEGMENTS = 288;          // ~3.8 m per quad
const FAR_RECENTER_M = 360.0;
const FAR_LIFT_M = 0.05;
const FAR_EDGE_FADE_M = 120.0;

const NEAR_SIZE_M = 420.0;
const NEAR_SEGMENTS = 256;         // ~1.64 m per quad
const NEAR_RECENTER_M = 120.0;
const NEAR_LIFT_M = 0.10;
const NEAR_EDGE_FADE_M = 40.0;

// Deterministic micro-relief (GAME) — multi-octave dunes and grit on top of
// the DEM. The rover uses the same sampler so it never floats or sinks.
const RELIEF_SEED = 1337;

// Boulder scatter (GAME)
const ROCK_CELL_M = 22.0;
const ROCK_DENSITY = 0.15;
const ROCK_MAX = 520;
const ROCK_SEED = 9173;

// Solid Astroneer-style palette (GAME)
const PAL_LOW = new THREE.Color(0x9a4a30);
const PAL_MID = new THREE.Color(0xc36b47);
const PAL_HIGH = new THREE.Color(0xe3a473);
const PAL_STEEP = new THREE.Color(0x74331f);
const PAL_DUST = new THREE.Color(0xf0c491);
const PAL_HIGHLIGHT = new THREE.Color(0xd98c5e);

const _tmpA = new THREE.Color();
const _rgb = [0, 0, 0];

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 69069);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

/** Smooth value noise on a unit lattice. */
function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smoothstep(0.0, 1.0, x - xi);
  const fy = smoothstep(0.0, 1.0, y - yi);
  const v00 = hash2(xi, yi, seed);
  const v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed);
  const v11 = hash2(xi + 1, yi + 1, seed);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fy;
}

/**
 * Deterministic micro-relief in metres, defined in local terrain metres so the
 * rover sampler, props and visual mesh always agree.
 */
export function surfaceReliefAt(lx, ly) {
  const n1 = valueNoise(lx / 52.0, ly / 52.0, RELIEF_SEED);
  const n2 = valueNoise(lx / 17.0, ly / 17.0, RELIEF_SEED + 41);
  const n3 = valueNoise(lx / 6.2, ly / 6.2, RELIEF_SEED + 79);
  const warp = valueNoise(lx / 150.0, ly / 150.0, RELIEF_SEED + 731) - 0.5;
  return (n1 - 0.5) * 1.65
    + (n2 - 0.5) * 0.62
    + (n3 - 0.5) * 0.17
    + warp * 0.35;
}

/** Low-frequency "dust veneer" mask used by the palette. */
function dustMaskAt(lx, ly) {
  return valueNoise(lx / 190.0, ly / 190.0, RELIEF_SEED + 731);
}

/**
 * Write the explore palette colour for a terrain sample.
 * elevation/slope are DEM-measured; the palette shades are gameplay styling.
 */
export function marsPaletteRGB(out, elevation, slopeDeg, lx, ly, minElev, maxElev) {
  const span = Math.max(1.0, maxElev - minElev);
  const t = THREE.MathUtils.clamp((elevation - minElev) / span, 0.0, 1.0);
  const tGain = THREE.MathUtils.clamp(t * 1.3, 0.0, 1.0);

  if (tGain < 0.5) {
    _tmpA.copy(PAL_LOW).lerp(PAL_MID, tGain * 2.0);
  } else {
    _tmpA.copy(PAL_MID).lerp(PAL_HIGH, (tGain - 0.5) * 2.0);
  }

  // Soft dusty bands so large slopes read as layered rock, not flat paint.
  const band = smoothstep(0.62, 0.94, dustMaskAt(lx, ly));
  _tmpA.lerp(PAL_DUST, band * 0.34);
  _tmpA.lerp(PAL_HIGHLIGHT, smoothstep(0.72, 1.0, tGain) * 0.22);

  // Steep facets darken toward exposed rock.
  const steep = smoothstep(15.0, 33.0, slopeDeg);
  _tmpA.lerp(PAL_STEEP, steep * 0.76);

  // Very subtle per-vertex grain keeps smooth shading from looking plastic.
  const grain = (hash2(Math.floor(lx * 0.7), Math.floor(ly * 0.7), RELIEF_SEED + 99) - 0.5) * 0.045;
  out[0] = THREE.MathUtils.clamp(_tmpA.r + grain, 0.0, 1.0);
  out[1] = THREE.MathUtils.clamp(_tmpA.g + grain, 0.0, 1.0);
  out[2] = THREE.MathUtils.clamp(_tmpA.b + grain, 0.0, 1.0);
  return out;
}

function localFromMesh(meshX, meshZ) {
  return { lx: meshX + TERRAIN_WIDTH_M / 2.0, ly: TERRAIN_HEIGHT_M / 2.0 - meshZ };
}

function createPatch({ size, segments, lift, name, flatShading }) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: !!flatShading,
    roughness: 0.97,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;

  return {
    size,
    segments,
    lift,
    edgeFade: size === NEAR_SIZE_M ? NEAR_EDGE_FADE_M : FAR_EDGE_FADE_M,
    geometry: geo,
    material,
    mesh,
    heights: new Float32Array((segments + 1) * (segments + 1)),
    colors,
    centerMeshX: NaN,
    centerMeshZ: NaN
  };
}

export class RoverDetailTerrain {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {(lx:number, ly:number) => number} opts.sampleElevation base DEM sampler
   * @param {() => number} opts.getExaggeration
   * @param {() => number} opts.getMinElev
   * @param {() => number} opts.getMaxElev
   */
  constructor({ scene, sampleElevation, getExaggeration, getMinElev, getMaxElev }) {
    this.scene = scene;
    this.sampleElevation = sampleElevation;
    this.getExaggeration = getExaggeration || (() => 1.0);
    this.getMinElev = getMinElev || (() => -4131.74);
    this.getMaxElev = getMaxElev || (() => -3412.51);

    this.active = false;

    this.group = new THREE.Group();
    this.group.name = 'ExploreDetailTerrain';
    this.group.visible = false;
    this.scene.add(this.group);

    this.far = createPatch({
      size: FAR_SIZE_M,
      segments: FAR_SEGMENTS,
      lift: FAR_LIFT_M,
      name: 'ExploreTerrainFar',
      flatShading: false
    });
    this.near = createPatch({
      size: NEAR_SIZE_M,
      segments: NEAR_SEGMENTS,
      lift: NEAR_LIFT_M,
      name: 'ExploreTerrainNear',
      flatShading: false
    });

    this.far.mesh.position.y = FAR_LIFT_M;
    this.near.mesh.position.y = NEAR_LIFT_M;
    this.group.add(this.far.mesh);
    this.group.add(this.near.mesh);

    this._buildRocks();
  }

  _buildRocks() {
    const rockGeo = new THREE.IcosahedronGeometry(1.0, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.94,
      metalness: 0.02
    });
    this.rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_MAX);
    this.rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rockMesh.frustumCulled = false;
    this.rockMesh.count = 0;
    this.group.add(this.rockMesh);
    this._rockMatrix = new THREE.Matrix4();
    this._rockQuat = new THREE.Quaternion();
    this._rockPos = new THREE.Vector3();
    this._rockScale = new THREE.Vector3();
    this._rockEuler = new THREE.Euler();
    this._rockColor = new THREE.Color();
  }

  setActive(active, roverMeshPos = null) {
    this.active = active;
    this.group.visible = active;
    if (!active) return;
    if (roverMeshPos) {
      this.recenter(roverMeshPos.x, roverMeshPos.z, true);
    }
  }

  /** Rebuild whichever patch has drifted far enough from the rover. */
  recenter(meshX, meshZ, force = false) {
    let nearRebuilt = false;
    if (force || this._needsRebuild(this.near, meshX, meshZ, NEAR_RECENTER_M)) {
      this._rebuildPatch(this.near, meshX, meshZ);
      nearRebuilt = true;
    }
    if (force || this._needsRebuild(this.far, meshX, meshZ, FAR_RECENTER_M)) {
      this._rebuildPatch(this.far, meshX, meshZ);
    }
    if (force || nearRebuilt) this._rebuildRocks(meshX, meshZ);
  }

  _needsRebuild(patch, meshX, meshZ, threshold) {
    if (!Number.isFinite(patch.centerMeshX)) return true;
    const dx = meshX - patch.centerMeshX;
    const dz = meshZ - patch.centerMeshZ;
    return dx * dx + dz * dz >= threshold * threshold;
  }

  _rebuildPatch(patch, meshX, meshZ) {
    patch.centerMeshX = meshX;
    patch.centerMeshZ = meshZ;
    patch.mesh.position.set(meshX, patch.lift, meshZ);

    const exag = this.getExaggeration();
    const minElev = this.getMinElev();
    const maxElev = this.getMaxElev();
    const geo = patch.geometry;
    const pos = geo.attributes.position;
    const heights = patch.heights;
    const half = patch.size * 0.5;
    const step = patch.size / patch.segments;
    const colCount = patch.segments + 1;

    // 1. Heights on the local patch (world-anchored micro-relief).
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const { lx, ly } = localFromMesh(patch.centerMeshX + px, patch.centerMeshZ + pz);
      const elev = this.sampleElevation(lx, ly);
      const edgeDist = Math.min(half - Math.abs(px), half - Math.abs(pz));
      const fade = smoothstep(0.0, patch.edgeFade, edgeDist);
      const relief = surfaceReliefAt(lx, ly) * fade;
      const y = (elev - minElev) * exag + relief * exag;
      pos.setY(i, y);
      heights[i] = y;
    }
    pos.needsUpdate = true;

    // 2. Smooth normals remove the giant triangle facets visible up close.
    geo.computeVertexNormals();

    // 3. Palette per vertex from the freshly built grid (DEM-measured terrain;
    //    palette thresholds are gameplay styling).
    const slopeScale = 180.0 / Math.PI;
    const colors = patch.colors;
    for (let r = 0; r <= patch.segments; r++) {
      for (let c = 0; c <= patch.segments; c++) {
        const i = r * colCount + c;
        const cL = Math.max(0, c - 1);
        const cR = Math.min(patch.segments, c + 1);
        const rD = Math.max(0, r - 1);
        const rU = Math.min(patch.segments, r + 1);
        const dhdx = (heights[r * colCount + cR] - heights[r * colCount + cL]) / ((cR - cL) * step);
        const dhdz = (heights[rU * colCount + c] - heights[rD * colCount + c]) / ((rU - rD) * step);
        const slopeDeg = Math.atan(Math.hypot(dhdx, dhdz)) * slopeScale;

        const px = pos.getX(i);
        const pz = pos.getZ(i);
        const { lx, ly } = localFromMesh(patch.centerMeshX + px, patch.centerMeshZ + pz);
        const elev = minElev + (heights[i] / Math.max(0.0001, exag));
        marsPaletteRGB(_rgb, elev, slopeDeg, lx, ly, minElev, maxElev);
        colors[i * 3] = _rgb[0];
        colors[i * 3 + 1] = _rgb[1];
        colors[i * 3 + 2] = _rgb[2];
      }
    }
    geo.attributes.color.needsUpdate = true;
  }

  _rebuildRocks(meshX, meshZ) {
    const exag = this.getExaggeration();
    const minElev = this.getMinElev();
    const half = NEAR_SIZE_M * 0.5;
    const cells = Math.floor(NEAR_SIZE_M / ROCK_CELL_M);
    let count = 0;

    for (let gz = -Math.floor(cells / 2); gz <= Math.floor(cells / 2) && count < ROCK_MAX; gz++) {
      for (let gx = -Math.floor(cells / 2); gx <= Math.floor(cells / 2) && count < ROCK_MAX; gx++) {
        const worldCellX = Math.floor((meshX + gx * ROCK_CELL_M) / ROCK_CELL_M);
        const worldCellZ = Math.floor((meshZ + gz * ROCK_CELL_M) / ROCK_CELL_M);
        const presence = hash2(worldCellX, worldCellZ, ROCK_SEED);
        if (presence > ROCK_DENSITY) continue;

        const jx = hash2(worldCellX, worldCellZ, ROCK_SEED + 11) - 0.5;
        const jz = hash2(worldCellX, worldCellZ, ROCK_SEED + 23) - 0.5;
        const px = Math.max(-half + 10.0, Math.min(half - 10.0, gx * ROCK_CELL_M + jx * ROCK_CELL_M));
        const pz = Math.max(-half + 10.0, Math.min(half - 10.0, gz * ROCK_CELL_M + jz * ROCK_CELL_M));
        const { lx, ly } = localFromMesh(meshX + px, meshZ + pz);
        const elev = this.sampleElevation(lx, ly) + surfaceReliefAt(lx, ly);

        const size = 0.3 + Math.pow(hash2(worldCellX, worldCellZ, ROCK_SEED + 37), 2.0) * 2.3;
        const sx = size * (0.8 + hash2(worldCellX, worldCellZ, ROCK_SEED + 43) * 0.7);
        const sy = size * (0.5 + hash2(worldCellX, worldCellZ, ROCK_SEED + 47) * 0.7);
        const sz = size * (0.8 + hash2(worldCellX, worldCellZ, ROCK_SEED + 53) * 0.7);

        this._rockPos.set(px, (elev - minElev) * exag + sy * 0.3 * exag, pz);
        this._rockEuler.set(
          hash2(worldCellX, worldCellZ, ROCK_SEED + 61) * Math.PI,
          hash2(worldCellX, worldCellZ, ROCK_SEED + 67) * Math.PI * 2.0,
          hash2(worldCellX, worldCellZ, ROCK_SEED + 71) * Math.PI
        );
        this._rockQuat.setFromEuler(this._rockEuler);
        this._rockScale.set(sx, sy, sz);
        this._rockMatrix.compose(this._rockPos, this._rockQuat, this._rockScale);
        this.rockMesh.setMatrixAt(count, this._rockMatrix);

        const shade = 0.78 + hash2(worldCellX, worldCellZ, ROCK_SEED + 79) * 0.42;
        this._rockColor.setHex(0x74442f).multiplyScalar(shade);
        this.rockMesh.setColorAt(count, this._rockColor);
        count++;
      }
    }

    this.rockMesh.count = count;
    this.rockMesh.instanceMatrix.needsUpdate = true;
    if (this.rockMesh.instanceColor) this.rockMesh.instanceColor.needsUpdate = true;
  }

  /** Called each frame during EXPLORE. */
  update(roverMeshPos) {
    if (!this.active || !roverMeshPos) return;
    this.recenter(roverMeshPos.x, roverMeshPos.z, false);
  }

  dispose() {
    this.scene.remove(this.group);
    this.far.geometry.dispose();
    this.far.material.dispose();
    this.near.geometry.dispose();
    this.near.material.dispose();
    this.rockMesh.geometry.dispose();
    this.rockMesh.material.dispose();
  }
}
