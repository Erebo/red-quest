/**
 * Survey Kit Controller (MISSION Mode ANALYZE / CHOOSE)
 * Provides 4 map-point survey tools (SLOPE, HAZARD, locked DUST, ELEMENTS),
 * floating pin cards (last 5 kept with age fade + close buttons), in-memory Survey log,
 * and zero route recommendations or auto-computed route totals.
 */

import * as THREE from 'three';
import { FAMILY_META } from './missionElements.js';
import { sampleDustAtPoint } from './dustZones.js';
import { autoDismiss, cancelAutoDismiss } from '../ui/autoDismiss.js';

const MAX_SURVEY_PINS = 5;
const SURVEY_RADIUS_M = 150.0;
const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;

export const SURVEY_TOOLS = Object.freeze({
  slope: { id: 'slope', icon: '📐', label: 'SLOPE', title: 'SLOPE' },
  hazard: { id: 'hazard', icon: '⚠', label: 'HAZARD', title: 'HAZARD (≤150 m)' },
  dust: { id: 'dust', icon: '🌫', label: 'DUST', locked: false, title: 'DUST (GAME / SIM)' },
  elements: { id: 'elements', icon: '★', label: 'ELEMENTS', title: 'ELEMENTS (≤150 m)' }
});

function createTag(text, cls) {
  const s = document.createElement('span');
  s.className = `mhc-tag ${cls}`;
  s.textContent = text;
  return s;
}

export function createSurveyKitController({
  elementsData,
  sampleSlopeFn,
  sampleElevFn,
  sampleCrismFn,
  localToMesh,
  minElev,
  pinLayerEl
}) {
  const elements = elementsData?.elements || [];
  const group = new THREE.Group();
  group.name = 'SurveyKitPinsGroup';

  let activeTool = null;
  let scanCount = 0;
  let nextPinSeq = 1;
  let currentExag = 1.0;
  const usedTools = new Set();
  const pins = [];

  const tmpVec = new THREE.Vector3();
  const pinHeadGeo = new THREE.OctahedronGeometry(7.5, 0);
  const pinStemGeo = new THREE.CylinderGeometry(1.1, 1.1, 20, 6);
  const pinRingGeo = new THREE.RingGeometry(8, 12.5, 16);
  pinRingGeo.rotateX(-Math.PI / 2);

  function getToolColorHex(tool) {
    if (tool === 'hazard') return 0xef4444;
    if (tool === 'dust') return 0xf59e0b;
    if (tool === 'elements') return 0x38bdf8;
    return 0x2dd4bf;
  }

  function applyAgeFade() {
    const opacities = [0.46, 0.62, 0.76, 0.89, 1.0];
    const offset = Math.max(0, opacities.length - pins.length);
    pins.forEach((p, idx) => {
      const alpha = opacities[offset + idx] ?? 1.0;
      p.ageAlpha = alpha;
      if (p.cardEl) p.cardEl.style.setProperty('--pin-alpha', String(alpha));
      p.markerMats.forEach(mat => { mat.opacity = alpha * 0.92; });
    });
  }

  function removePinById(pinId, { skipCancel = false } = {}) {
    const idx = pins.findIndex(p => p.id === pinId);
    if (idx === -1) return;
    const [removed] = pins.splice(idx, 1);
    if (removed.markerGroup) group.remove(removed.markerGroup);
    removed.markerMats.forEach(m => m.dispose());
    if (removed.cardEl) {
      if (!skipCancel) cancelAutoDismiss(removed.cardEl, { removeEl: false, invokeCallback: false });
      if (removed.cardEl.parentNode) removed.cardEl.parentNode.removeChild(removed.cardEl);
    }
    applyAgeFade();
  }

  function clearPins() {
    while (pins.length > 0) {
      const p = pins.pop();
      if (p.markerGroup) group.remove(p.markerGroup);
      p.markerMats.forEach(m => m.dispose());
      if (p.cardEl) {
        cancelAutoDismiss(p.cardEl, { removeEl: false, invokeCallback: false });
        if (p.cardEl.parentNode) p.cardEl.parentNode.removeChild(p.cardEl);
      }
    }
  }

  function setActiveTool(toolId) {
    if (!toolId) {
      return activeTool;
    }
    if (activeTool === toolId) {
      activeTool = null;
    } else if (SURVEY_TOOLS[toolId]) {
      activeTool = toolId;
    }
    return activeTool;
  }

  function clearTool() {
    activeTool = null;
  }

  function buildReading(tool, lx, ly, postLock) {
    if (tool === 'slope') {
      const deg = sampleSlopeFn ? sampleSlopeFn(lx, ly) : 0;
      let tier = 'Easy (<15°)';
      if (deg >= 25.0) tier = 'Hazardous (>25°)';
      else if (deg >= 15.0) tier = 'Moderate (15°–25°)';
      return {
        title: '📐 Slope Scan',
        reading: `${deg.toFixed(1)}° · ${tier}`,
        chips: [
          { text: 'measured (DEM)', cls: 'measured' },
          { text: 'game rule', cls: 'game' }
        ]
      };
    }

    if (tool === 'hazard') {
      const nearby = elements.filter(el => {
        if (el.visibility === 'scan' && !postLock) return false;
        if (el.family !== 'hazard') return false;
        return Math.hypot(el.x - lx, el.y - ly) <= SURVEY_RADIUS_M;
      });
      const reading = nearby.length === 0
        ? '0 hazards within 150 m'
        : `${nearby.length} within 150 m: ${nearby.map(e => e.name).join(', ')}`;
      return {
        title: '⚠ Hazards (≤150 m)',
        reading,
        chips: [{ text: 'game rule', cls: 'game' }]
      };
    }

    if (tool === 'elements') {
      const nearby = elements
        .filter(el => {
          if (el.visibility === 'scan' && !postLock) return false;
          return Math.hypot(el.x - lx, el.y - ly) <= SURVEY_RADIUS_M;
        })
        .sort((a, b) => Math.hypot(a.x - lx, a.y - ly) - Math.hypot(b.x - lx, b.y - ly));

      const parts = nearby.map(e => `${e.name} (${FAMILY_META[e.family]?.label || e.family})`);
      const crismInfo = sampleCrismFn ? sampleCrismFn(lx, ly) : null;
      const crismNotes = [];
      if (crismInfo?.phyActive) crismNotes.push('CRISM phyllosilicate indicator');
      if (crismInfo?.hydActive) crismNotes.push('CRISM hydrated mineral indicator');

      const chips = [{ text: 'game rule', cls: 'game' }];
      if (crismNotes.length) {
        chips.push({ text: 'measured (CRISM)', cls: 'measured' });
      }

      let reading = nearby.length === 0
        ? '0 elements within 150 m'
        : `${nearby.length} within 150 m: ${parts.join(', ')}`;
      if (crismNotes.length) {
        reading += ` · ${crismNotes.join(' + ')}`;
      }

      return {
        title: '★ Elements (≤150 m)',
        reading,
        chips
      };
    }

    if (tool === 'dust') {
      const elev = sampleElevFn ? sampleElevFn(lx, ly) : -3800;
      const d = sampleDustAtPoint(lx, ly, elev);
      const reading = d.insideZone
        ? `Dust zone: ${d.zone.name} (${d.zone.intensityLabel}) · τ = ${d.tau.toFixed(2)}`
        : `Clear corridor · Ambient dust τ = ${d.tau.toFixed(2)} (vis ${d.visibilityKm.toFixed(1)} km)`;
      return {
        title: '🌫 Dust Exposure',
        reading,
        chips: [
          { text: 'GAME', cls: 'game' },
          { text: 'SIM', cls: 'sim' }
        ]
      };
    }

    return null;
  }

  function placeReadingPin(tool, lx, ly, info, { countScan = true } = {}) {
    if (countScan) {
      scanCount++;
    }
    if (tool) usedTools.add(tool);
    const clampedX = Math.max(0, Math.min(TERRAIN_WIDTH_M, lx));
    const clampedY = Math.max(0, Math.min(TERRAIN_HEIGHT_M, ly));
    const elev = sampleElevFn ? sampleElevFn(clampedX, clampedY) : minElev;
    const { meshX, meshZ } = localToMesh(clampedX, clampedY);
    const hex = getToolColorHex(tool);

    const markerGroup = new THREE.Group();
    markerGroup.position.set(meshX, (elev - minElev) * currentExag, meshZ);

    const ringMat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const headMat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x070a10,
      transparent: true,
      opacity: 0.92,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false
    });

    const ring = new THREE.Mesh(pinRingGeo, ringMat);
    ring.position.y = 2.5;
    ring.renderOrder = 15;
    markerGroup.add(ring);

    const stem = new THREE.Mesh(pinStemGeo, outlineMat);
    stem.position.y = 11;
    stem.renderOrder = 15;
    markerGroup.add(stem);

    const headOutline = new THREE.Mesh(pinHeadGeo, outlineMat);
    headOutline.position.y = 23;
    headOutline.scale.setScalar(1.25);
    headOutline.renderOrder = 16;
    markerGroup.add(headOutline);

    const head = new THREE.Mesh(pinHeadGeo, headMat);
    head.position.y = 23;
    head.renderOrder = 17;
    markerGroup.add(head);

    group.add(markerGroup);

    const pinId = `survey-pin-${nextPinSeq++}`;
    let cardEl = null;
    if (pinLayerEl) {
      cardEl = document.createElement('div');
      cardEl.className = 'survey-pin-card';
      cardEl.dataset.pinId = pinId;
      cardEl.dataset.tool = tool || 'slope';

      const headRow = document.createElement('div');
      headRow.className = 'spc-head';
      const titleEl = document.createElement('strong');
      titleEl.textContent = info.title;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'spc-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Close pin';
      headRow.appendChild(titleEl);
      headRow.appendChild(closeBtn);

      const valEl = document.createElement('div');
      valEl.className = 'spc-val';
      valEl.textContent = info.reading;

      const tagsEl = document.createElement('div');
      tagsEl.className = 'spc-tags';
      info.chips.forEach(c => tagsEl.appendChild(createTag(c.text, c.cls)));

      cardEl.appendChild(headRow);
      cardEl.appendChild(valEl);
      cardEl.appendChild(tagsEl);
      pinLayerEl.appendChild(cardEl);
      autoDismiss(cardEl, {
        ms: 3500,
        kind: 'survey-reading',
        closeBtn,
        offsetMode: 'cssVar',
        onClose: () => removePinById(pinId, { skipCancel: true })
      });
    }

    pins.push({
      id: pinId,
      tool,
      lx: clampedX,
      ly: clampedY,
      elev,
      meshX,
      meshZ,
      markerGroup,
      markerMats: [ringMat, headMat, outlineMat],
      cardEl,
      ageAlpha: 1.0
    });

    while (pins.length > MAX_SURVEY_PINS) {
      removePinById(pins[0].id);
    }
    applyAgeFade();

    return { pinId, ...info };
  }

  function scanPoint(lx, ly, { postLock = false } = {}) {
    if (!activeTool) return null;
    const clampedX = Math.max(0, Math.min(TERRAIN_WIDTH_M, lx));
    const clampedY = Math.max(0, Math.min(TERRAIN_HEIGHT_M, ly));
    const info = buildReading(activeTool, clampedX, clampedY, postLock);
    if (!info) return null;
    return placeReadingPin(activeTool, clampedX, clampedY, info, { countScan: true });
  }

  function showRoutePinReading(lx, ly, toolId, truth, { chargedCost = 0, identifiedCount = 0 } = {}) {
    if (!truth) return null;
    let info;
    if (toolId === 'slope') {
      info = {
        title: `📐 ${truth.routeName} · Full Slope`,
        reading: `Max ${truth.maxSlopeDeg.toFixed(1)}° · Easy ${truth.pctEasy.toFixed(1)}% · Mod ${truth.pctMod.toFixed(1)}% · Steep ${truth.pctSteep.toFixed(1)}%`,
        chips: [
          { text: 'measured (DEM)', cls: 'measured' },
          { text: 'game rule', cls: 'game' },
          { text: chargedCost > 0 ? '-1 scan' : 'cached (free)', cls: chargedCost > 0 ? 'sim' : 'dem' }
        ]
      };
    } else if (toolId === 'hazard') {
      info = {
        title: `⚠ ${truth.routeName} · Hazards`,
        reading: `Hazard count: ${truth.hazardCount} (${truth.hazElements150m} hazard elements ≤150 m + ${truth.steepZonesCrossed} steep zones crossed)`,
        chips: [
          { text: 'derived', cls: 'dem' },
          { text: 'game rule', cls: 'game' },
          { text: chargedCost > 0 ? '-1 scan' : 'cached (free)', cls: chargedCost > 0 ? 'sim' : 'dem' }
        ]
      };
    } else if (toolId === 'elements') {
      info = {
        title: `★ ${truth.routeName} · Elements`,
        reading: `${truth.elementsCount} elements within 150 m (${identifiedCount} identified near route)`,
        chips: [
          { text: 'GAME', cls: 'game' },
          { text: chargedCost > 0 ? '-1 scan' : 'cached (free)', cls: chargedCost > 0 ? 'sim' : 'dem' }
        ]
      };
    } else if (toolId === 'dust') {
      info = {
        title: `🌫 ${truth.routeName} · Dust Exposure`,
        reading: `${truth.dustPct.toFixed(1)}% of route inside dust zones (${truth.sampleCount} samples @ 10 m)`,
        chips: [
          { text: 'GAME', cls: 'game' },
          { text: 'SIM', cls: 'sim' },
          { text: chargedCost > 0 ? '-1 scan' : 'cached (free)', cls: chargedCost > 0 ? 'sim' : 'dem' }
        ]
      };
    }
    if (!info) return null;
    return placeReadingPin(toolId, lx, ly, info, { countScan: true });
  }

  function showElementIdentifiedPin(lx, ly, idResult) {
    if (!idResult || !idResult.element) return null;
    const el = idResult.element;
    const famLabel = FAMILY_META[el.family]?.label || el.family;
    const statusPrefix = idResult.identifiedNow ? 'Identified & added to Codex! ' : 'Already in Codex · ';
    const info = {
      title: `★ ${el.name} (${famLabel})`,
      reading: `${statusPrefix}${el.whatIsIt?.text || ''}`,
      chips: [
        { text: el.source || 'GAME', cls: el.source === 'derived from DEM' ? 'dem' : 'game' },
        { text: famLabel.toUpperCase(), cls: 'measured' }
      ]
    };
    return placeReadingPin('elements', lx, ly, info, { countScan: false });
  }

  function updateExaggeration(exag) {
    currentExag = exag;
    pins.forEach(p => {
      if (p.markerGroup) {
        p.markerGroup.position.y = (p.elev - minElev) * currentExag;
      }
    });
  }

  function update(camera, width, height) {
    if (!group.visible) {
      if (pinLayerEl) pinLayerEl.classList.add('hidden');
      return;
    }
    if (pinLayerEl) pinLayerEl.classList.remove('hidden');

    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      const dist = camera.position.distanceTo(p.markerGroup.position);
      const scale = Math.max(1.0, Math.min(3.2, dist / 1450.0));
      p.markerGroup.scale.setScalar(scale);

      if (!p.cardEl) continue;
      tmpVec.set(p.meshX, p.markerGroup.position.y + 28 * scale, p.meshZ);
      tmpVec.project(camera);

      if (tmpVec.z < -1 || tmpVec.z > 1) {
        p.cardEl.classList.add('offscreen');
        continue;
      }

      const sx = (tmpVec.x * 0.5 + 0.5) * width;
      const sy = (-tmpVec.y * 0.5 + 0.5) * height;
      const clampedX = Math.max(110, Math.min(width - 110, sx));
      const clampedY = Math.max(76, Math.min(height - 32, sy));

      p.cardEl.classList.remove('offscreen');
      p.cardEl.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0) translate(-50%, -100%) translate(var(--ad-offset-x, 0px), var(--ad-offset-y, 0px))`;
      if (!p.cardEl.classList.contains('ad-fading')) {
        p.cardEl.style.opacity = String(p.ageAlpha);
      }
    }
  }

  function reset() {
    clearPins();
    activeTool = null;
    scanCount = 0;
    usedTools.clear();
  }

  return {
    group,
    getActiveTool: () => activeTool,
    setActiveTool,
    clearTool,
    scanPoint,
    showRoutePinReading,
    showElementIdentifiedPin,
    removePinById,
    clearPins,
    updateExaggeration,
    update,
    reset,
    getLog: () => ({
      scans: scanCount,
      toolsUsed: usedTools.size,
      totalTools: 4,
      usedSet: new Set(usedTools),
      pinCount: pins.length
    }),
    getPins: () => pins.map(p => ({ id: p.id, tool: p.tool, lx: p.lx, ly: p.ly }))
  };
}
