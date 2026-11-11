/**
 * Mars Globe & Mission Select Overlay (START stage part 2)
 * Local Three.js Mars sphere with procedural equirectangular texture (zero CDN/external calls),
 * atmosphere Fresnel glow, glowing Gale Crater pin, distant fly-in, idle spin,
 * hover-to-Gale rotation, zoom-to-Gale cross-fade, and full GPU disposal on map entry.
 */

import * as THREE from 'three';

// Level 1 Gale Crater landing coordinates (matching src/game/levels/level01.json start/goal sector)
const GALE_LAT_DEG = -4.8;
const GALE_LON_DEG = 137.4;

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function latLonToSphereVec(latDeg, lonDeg, radius = 1.0) {
  const phi = ((lonDeg + 180) * Math.PI) / 180;
  const theta = ((90 - latDeg) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Smooth 3D value noise for seamless equirectangular planetary surface generation
function hash3(ix, iy, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = c000 + (c100 - c000) * ux;
  const x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux;
  const x11 = c011 + (c111 - c011) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

function fbm3(x, y, z, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.08;
  }
  return sum / norm;
}

function generateMarsTextures() {
  const width = 512;
  const height = 256;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const actx = albedoCanvas.getContext('2d');
  const aImg = actx.createImageData(width, height);
  const aData = aImg.data;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bctx = bumpCanvas.getContext('2d');
  const bImg = bctx.createImageData(width, height);
  const bData = bImg.data;

  // Deterministic crater stamps on unit sphere directions
  const craters = [];
  let seed = 88421;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 42; i++) {
    const lon = rand() * 360 - 180;
    const lat = (rand() - 0.5) * 145;
    const dir = latLonToSphereVec(lat, lon, 1.0);
    craters.push({ dir, rad: 0.04 + rand() * 0.11 });
  }
  const galeDir = latLonToSphereVec(GALE_LAT_DEG, GALE_LON_DEG, 1.0);

  for (let py = 0; py < height; py++) {
    const v = py / (height - 1);
    const theta = v * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const absLat = Math.abs(90 - v * 180);

    for (let px = 0; px < width; px++) {
      const u = px / width;
      const phi = u * Math.PI * 2;
      const sx = -Math.cos(phi) * sinT;
      const sy = cosT;
      const sz = Math.sin(phi) * sinT;

      // Multi-scale albedo + relief
      const macro = fbm3(sx * 2.2 + 4.1, sy * 2.2 - 1.3, sz * 2.2 + 2.7, 4);
      const detail = fbm3(sx * 8.5 - 2.0, sy * 8.5 + 3.4, sz * 8.5 - 1.1, 3);
      let heightVal = macro * 0.65 + detail * 0.35;

      // Basaltic dark bands + bright dusty highlands
      const darkBand = Math.max(0, Math.min(1, (macro - 0.44) * 3.1));
      let r = 178 - darkBand * 68 + detail * 38;
      let g = 92 - darkBand * 38 + detail * 24;
      let b = 52 - darkBand * 20 + detail * 14;

      // Subtle canyon & highland modulation
      if (heightVal < 0.43) {
        r -= 16;
        g -= 11;
        b -= 8;
      }

      // Crater bowl & bright rim modulation
      for (let c = 0; c < craters.length; c++) {
        const cr = craters[c];
        const dot = Math.max(-1, Math.min(1, sx * cr.dir.x + sy * cr.dir.y + sz * cr.dir.z));
        const ang = Math.acos(dot);
        if (ang < cr.rad * 1.25) {
          const t = ang / cr.rad;
          if (t < 0.8) {
            const bowl = 1 - t / 0.8;
            heightVal -= bowl * 0.16;
            r -= bowl * 18;
            g -= bowl * 12;
          } else {
            const rim = 1 - Math.abs(t - 0.96) / 0.28;
            if (rim > 0) {
              heightVal += rim * 0.1;
              r += rim * 16;
              g += rim * 11;
            }
          }
        }
      }

      // Gale Crater basin + central peak hint at exact Gale coordinate
      const gDot = Math.max(-1, Math.min(1, sx * galeDir.x + sy * galeDir.y + sz * galeDir.z));
      const gAng = Math.acos(gDot);
      if (gAng < 0.085) {
        const gt = gAng / 0.065;
        if (gt < 0.85) {
          heightVal -= (1 - gt / 0.85) * 0.18;
          r -= 14;
          g -= 8;
          if (gt < 0.26) {
            heightVal += (1 - gt / 0.26) * 0.24; // Mount Sharp central peak
            r += 22;
            g += 14;
          }
        }
      }

      // Polar frost caps
      if (absLat > 73) {
        const polarT = Math.min(1, (absLat - 73 + (detail - 0.5) * 8) / 14);
        if (polarT > 0) {
          r = r + (236 - r) * polarT;
          g = g + (226 - g) * polarT;
          b = b + (220 - b) * polarT;
        }
      }

      const idx = (py * width + px) * 4;
      aData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      aData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      aData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      aData[idx + 3] = 255;

      const bh = Math.max(0, Math.min(255, Math.round(heightVal * 255)));
      bData[idx] = bh;
      bData[idx + 1] = bh;
      bData[idx + 2] = bh;
      bData[idx + 3] = 255;
    }
  }

  actx.putImageData(aImg, 0, 0);
  bctx.putImageData(bImg, 0, 0);

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.wrapS = THREE.RepeatWrapping;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;

  return { albedoTex, bumpTex };
}

export function createMissionSelectController({
  overlayEl,
  globeContainerEl,
  mission1CardEl,
  mission1BtnEl,
  mission2CardEl,
  mission3CardEl,
  onEnterMission1,
  onSound
} = {}) {
  let globeRenderer = null;
  let globeScene = null;
  let globeCamera = null;
  let globeGroup = null;
  let galeRingMesh = null;
  let rafId = null;

  let isOpen = false;
  let isDisposed = true;
  let isTransitioning = false;
  let isHoveringMission1 = false;
  let flyInStart = 0;
  let flyInDone = false;
  let lastFrameMs = 0;

  let zoomStart = 0;
  let zoomFromPos = new THREE.Vector3();
  let zoomToPos = new THREE.Vector3();
  let zoomFromRotY = 0;
  let zoomTargetRotY = 0;

  const REST_CAMERA_Z = 4.02; // Sphere R=1 at z=4.02 with 45deg FOV covers ~60% viewport height
  const FLYIN_START_POS = new THREE.Vector3(0, 0.25, -30.0);
  const FLYIN_DURATION_MS = 1350;
  const ZOOM_DURATION_MS = 650;

  const galeLocalVec = latLonToSphereVec(GALE_LAT_DEG, GALE_LON_DEG, 1.0);
  const galeFacingRotY = -Math.atan2(galeLocalVec.x, galeLocalVec.z);

  function normalizeAngleDelta(target, current) {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
  }

  function updateStatusAttrs(galeFacing = false) {
    if (!overlayEl) return;
    overlayEl.dataset.globeReady = isDisposed ? 'false' : 'true';
    overlayEl.dataset.galeFacing = galeFacing ? 'true' : 'false';
    overlayEl.dataset.transitioning = isTransitioning ? 'true' : 'false';
  }

  function updateGlobeCameraFraming() {
    if (!globeCamera || !overlayEl || isTransitioning) return;
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    const headerEl = overlayEl.querySelector('.ms-top-header');
    const dockEl = overlayEl.querySelector('.ms-cards-dock');
    const headerBottom = headerEl ? Math.ceil(headerEl.getBoundingClientRect().bottom) : 84;
    const dockTopRaw = dockEl ? Math.floor(dockEl.getBoundingClientRect().top) : 0;
    const dockTop = dockTopRaw > 120 ? dockTopRaw : (h - 250);

    const bandTop = headerBottom + 12;
    const bandBot = Math.max(bandTop + 140, dockTop - 16);
    const availH = Math.max(140, bandBot - bandTop);
    const availW = Math.max(240, w - 48);

    const outerScale = 1.09;
    const targetOuterDiamPx = Math.min(availH * 0.88, availW * 0.48, h * 0.56);
    const planetDiamPx = Math.max(80, targetOuterDiamPx / outerScale);

    const halfFovRad = (45 * 0.5 * Math.PI) / 180;
    const halfWorldH = 1.0 * (h / planetDiamPx);
    const camZ = halfWorldH / Math.tan(halfFovRad);

    const centerScreenY = bandTop + availH * 0.5;
    const ndcY = 1.0 - (2.0 * centerScreenY) / h;
    const camY = -ndcY * halfWorldH;

    globeCamera.position.set(0, camY, camZ);
    globeCamera.lookAt(0, camY, 0);

    overlayEl.dataset.globeTopPx = `${Math.round(centerScreenY - targetOuterDiamPx * 0.5)}`;
    overlayEl.dataset.globeBottomPx = `${Math.round(centerScreenY + targetOuterDiamPx * 0.5)}`;
    overlayEl.dataset.dockTopPx = `${Math.round(dockTop)}`;
  }

  function buildScene() {
    if (!globeContainerEl) return;
    disposeGlobeOnly();

    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);

    globeScene = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 140);
    updateGlobeCameraFraming();

    globeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    globeRenderer.setSize(w, h);
    globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    globeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    globeRenderer.toneMappingExposure = 1.1;
    globeContainerEl.innerHTML = '';
    globeContainerEl.appendChild(globeRenderer.domElement);

    // Subtle deep-space background stars inside the 3D scene
    const starPositions = new Float32Array(320 * 3);
    let seed = 4219;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 320; i++) {
      const r = 18 + rand() * 35;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      starPositions[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPositions[i * 3 + 1] = r * Math.cos(ph);
      starPositions[i * 3 + 2] = -Math.abs(r * Math.sin(ph) * Math.sin(th));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xdbeafe, size: 0.09, transparent: true, opacity: 0.72 });
    globeScene.add(new THREE.Points(starGeo, starMat));

    // Lighting
    globeScene.add(new THREE.AmbientLight(0x523127, 1.35));
    const sun = new THREE.DirectionalLight(0xfff0df, 2.35);
    sun.position.set(5.5, 2.5, 4.2);
    globeScene.add(sun);
    const rimFill = new THREE.DirectionalLight(0x5a8ac4, 0.72);
    rimFill.position.set(-4.5, -1.5, -2.5);
    globeScene.add(rimFill);

    // Mars sphere group
    globeGroup = new THREE.Group();
    const { albedoTex, bumpTex } = generateMarsTextures();

    const sphereGeo = new THREE.SphereGeometry(1.0, 64, 48);
    const marsMat = new THREE.MeshStandardMaterial({
      map: albedoTex,
      bumpMap: bumpTex,
      bumpScale: 0.032,
      roughness: 0.86,
      metalness: 0.03
    });
    const marsMesh = new THREE.Mesh(sphereGeo, marsMat);
    globeGroup.add(marsMesh);

    // Thin Martian atmospheric limb glow (soft outer edge fade — no sharp ring cut-off)
    const atmoGeo = new THREE.SphereGeometry(1.09, 64, 48);
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xf97316) },
        uRimColor: { value: new THREE.Color(0x93c5fd) }
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalW = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uRimColor;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          float ndv = max(0.0, dot(vNormalW, vViewDir));
          // Peak around the planetary surface limb (~0.40) and fade smoothly to 0 at outer mesh edge
          float outerFade = smoothstep(0.0, 0.42, ndv);
          float limb = pow(1.0 - ndv, 3.0) * outerFade;
          vec3 col = mix(uColor, uRimColor, (1.0 - ndv) * 0.45);
          gl_FragColor = vec4(col, limb * 0.72);
        }
      `,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    globeGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

    // Glowing Gale Crater landing beacon pin
    const pinAnchor = new THREE.Group();
    const surfacePos = galeLocalVec.clone().multiplyScalar(1.006);
    pinAnchor.position.copy(surfacePos);
    pinAnchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), galeLocalVec.clone().normalize());

    const stemGeo = new THREE.CylinderGeometry(0.006, 0.003, 0.068, 10);
    const stemMat = new THREE.MeshBasicMaterial({ color: 0x7fe6ff });
    const stemMesh = new THREE.Mesh(stemGeo, stemMat);
    stemMesh.position.y = 0.034;
    pinAnchor.add(stemMesh);

    const headGeo = new THREE.SphereGeometry(0.02, 16, 16);
    const headMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 0.072;
    pinAnchor.add(headMesh);

    const ringGeo = new THREE.RingGeometry(0.022, 0.036, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8c42,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    galeRingMesh = new THREE.Mesh(ringGeo, ringMat);
    galeRingMesh.position.y = 0.004;
    pinAnchor.add(galeRingMesh);

    globeGroup.add(pinAnchor);

    // Start angled slightly away so idle spin & hover-to-Gale rotate clearly
    globeGroup.rotation.y = galeFacingRotY - 0.85;
    globeGroup.rotation.x = 0.06;

    const reduced = prefersReducedMotion();
    if (reduced) {
      globeGroup.position.set(0, 0, 0);
      flyInDone = true;
    } else {
      globeGroup.position.copy(FLYIN_START_POS);
      flyInDone = false;
    }

    globeScene.add(globeGroup);
    isDisposed = false;
    updateStatusAttrs(false);
  }

  function disposeGlobeOnly() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (globeScene) {
      globeScene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (m.map) m.map.dispose();
            if (m.bumpMap) m.bumpMap.dispose();
            m.dispose();
          });
        }
      });
    }
    if (globeRenderer) {
      globeRenderer.dispose();
      if (globeRenderer.domElement && globeRenderer.domElement.parentNode) {
        globeRenderer.domElement.parentNode.removeChild(globeRenderer.domElement);
      }
    }
    globeRenderer = null;
    globeScene = null;
    globeCamera = null;
    globeGroup = null;
    galeRingMesh = null;
    isDisposed = true;
    updateStatusAttrs(false);
  }

  function handleResize() {
    if (!isOpen || !globeRenderer || !globeCamera) return;
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    globeCamera.aspect = w / h;
    globeCamera.updateProjectionMatrix();
    globeRenderer.setSize(w, h);
    updateGlobeCameraFraming();
  }

  function stepFrame(nowMs) {
    if (!isOpen || isDisposed || !globeRenderer || !globeScene || !globeCamera) return;
    rafId = requestAnimationFrame(stepFrame);

    const dtSec = Math.min(0.05, Math.max(0.001, (nowMs - (lastFrameMs || nowMs)) / 1000));
    lastFrameMs = nowMs;
    const reduced = prefersReducedMotion();

    // 1. Fly-in deceleration from far distance to center (~60% screen height)
    if (!flyInDone && globeGroup) {
      const elapsed = nowMs - flyInStart;
      const p = Math.min(1.0, elapsed / FLYIN_DURATION_MS);
      const easeOut = 1 - Math.pow(1 - p, 3);
      globeGroup.position.lerpVectors(FLYIN_START_POS, new THREE.Vector3(0, 0, 0), easeOut);
      if (p >= 1.0) {
        flyInDone = true;
      }
    }

    // 2. Globe rotation: zoom-to-Gale OR hover-to-Gale OR slow idle spin
    if (globeGroup) {
      if (isTransitioning) {
        const dur = reduced ? 160 : ZOOM_DURATION_MS;
        const p = Math.min(1.0, (nowMs - zoomStart) / dur);
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        globeCamera.position.lerpVectors(zoomFromPos, zoomToPos, ease);
        globeCamera.lookAt(0, globeCamera.position.y, 0);
        globeGroup.rotation.y = zoomFromRotY + normalizeAngleDelta(zoomTargetRotY, zoomFromRotY) * ease;
        if (overlayEl && p > 0.35) {
          overlayEl.style.opacity = `${Math.max(0, 1 - (p - 0.35) / 0.65)}`;
        }
        if (p >= 1.0) {
          completeEnterMission1();
          return;
        }
      } else if (isHoveringMission1) {
        const delta = normalizeAngleDelta(galeFacingRotY, globeGroup.rotation.y);
        globeGroup.rotation.y += delta * (reduced ? 1 : Math.min(1, dtSec * 6.5));
        updateStatusAttrs(Math.abs(delta) < 0.08);
      } else if (!reduced) {
        globeGroup.rotation.y += dtSec * 0.14;
        const delta = Math.abs(normalizeAngleDelta(galeFacingRotY, globeGroup.rotation.y));
        updateStatusAttrs(delta < 0.12);
      }
    }

    // 3. Pulsing Gale Crater pin ring
    if (galeRingMesh) {
      const pulse = reduced ? 1.0 : 1.0 + 0.35 * (0.5 + 0.5 * Math.sin(nowMs * 0.005));
      galeRingMesh.scale.set(pulse, 1.0, pulse);
      galeRingMesh.material.opacity = reduced ? 0.85 : 0.45 + 0.5 * (0.5 + 0.5 * Math.cos(nowMs * 0.005));
    }

    globeRenderer.render(globeScene, globeCamera);
  }

  function completeEnterMission1() {
    isOpen = false;
    isTransitioning = false;
    window.removeEventListener('resize', handleResize);
    if (overlayEl) {
      overlayEl.classList.add('hidden');
      overlayEl.style.opacity = '';
    }
    disposeGlobeOnly();
    if (onEnterMission1) onEnterMission1();
  }

  function triggerStartMission1() {
    if (!isOpen || isTransitioning) return;
    if (onSound) onSound('missionStart');
    isTransitioning = true;
    flyInDone = true;
    if (globeGroup) globeGroup.position.set(0, 0, 0);
    zoomStart = performance.now();
    zoomFromPos.copy(globeCamera ? globeCamera.position : new THREE.Vector3(0, 0, REST_CAMERA_Z));
    zoomToPos.set(0, -0.06, 1.32);
    zoomFromRotY = globeGroup ? globeGroup.rotation.y : galeFacingRotY;
    zoomTargetRotY = galeFacingRotY;
    updateStatusAttrs(true);

    if (prefersReducedMotion()) {
      setTimeout(() => {
        if (isOpen && isTransitioning) completeEnterMission1();
      }, 150);
    }
  }

  function bindCardEvents() {
    if (mission1CardEl) {
      mission1CardEl.addEventListener('pointerenter', () => {
        isHoveringMission1 = true;
        if (onSound) onSound('missionHover');
      });
      mission1CardEl.addEventListener('pointerleave', () => {
        isHoveringMission1 = false;
      });
    }
    if (mission1BtnEl) {
      mission1BtnEl.addEventListener('click', triggerStartMission1);
    }
    [mission2CardEl, mission3CardEl].forEach(card => {
      if (!card) return;
      card.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  bindCardEvents();

  function open() {
    if (isOpen) return;
    isOpen = true;
    isTransitioning = false;
    isHoveringMission1 = false;
    if (overlayEl) {
      overlayEl.style.opacity = '1';
      overlayEl.classList.remove('hidden');
    }
    buildScene();
    requestAnimationFrame(updateGlobeCameraFraming);
    flyInStart = performance.now();
    lastFrameMs = flyInStart;
    window.addEventListener('resize', handleResize);
    rafId = requestAnimationFrame(stepFrame);
  }

  function closeAndDispose() {
    isOpen = false;
    isTransitioning = false;
    window.removeEventListener('resize', handleResize);
    if (overlayEl) {
      overlayEl.classList.add('hidden');
      overlayEl.style.opacity = '';
    }
    disposeGlobeOnly();
  }

  return {
    open,
    closeAndDispose,
    triggerStartMission1,
    isOpen: () => isOpen,
    isGlobeDisposed: () => isDisposed,
    isHoveringMission1: () => isHoveringMission1,
    setHoveringMission1: val => { isHoveringMission1 = Boolean(val); }
  };
}
