/**
 * Level 1 Mission Elements: Hazards, Resources, Science, and Scan Mystery Blips.
 * Handles lens-based anti-clutter filtering, 12-icon screen-space overlap capping,
 * off-screen animation pausing (dust devils & mystery beacons), route <=150 m counts,
 * and in-memory Field Codex unlock tracking.
 */

import * as THREE from 'three';

const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;
const MAX_VISIBLE_ICONS = 12;

export const FAMILY_META = Object.freeze({
  hazard: { label: 'Hazards', color: '#ef4444', hex: 0xef4444, cat: 'hazards', priority: 82 },
  resource: { label: 'Resources', color: '#22c55e', hex: 0x22c55e, cat: 'resources', priority: 78 },
  science: { label: 'Science', color: '#38bdf8', hex: 0x38bdf8, cat: 'science', priority: 86 },
  mystery: { label: 'Mystery', color: '#f59e0b', hex: 0xf59e0b, cat: 'mystery', priority: 92 }
});

export const TYPE_DISPLAY_NAMES = Object.freeze({
  soft_sand_pocket: 'Soft sand pocket',
  rockfall_zone: 'Rockfall zone',
  dust_devil_corridor: 'Dust devil corridor',
  radio_shadow: 'Radio shadow',
  radiation_shelter: 'Radiation shelter',
  oxygen_cache: 'Oxygen cache',
  solar_ridge: 'Battery / solar ridge',
  comm_relay_beacon: 'Comm relay beacon',
  science_target: 'Science target',
  drill_site: 'Drill site',
  layered_rock_outcrop: 'Layered rock outcrop',
  clay_sample_patch: 'Clay-rich sample patch',
  mineral_vein_hint: 'Mineral vein hint',
  concretion_field: 'Concretion field',
  boxwork_ridge_network: 'Boxwork ridge network',
  mystery_blip: 'Mystery scan blip'
});

function localToMesh(lx, ly) {
  return {
    meshX: lx - TERRAIN_WIDTH_M / 2.0,
    meshZ: TERRAIN_HEIGHT_M / 2.0 - ly
  };
}

function pointToSegmentDistSq2D(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-8) return wx * wx + wy * wy;
  const t = Math.max(0.0, Math.min(1.0, (wx * vx + wy * vy) / lenSq));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return dx * dx + dy * dy;
}

function minDistanceToPolyline2D(x, y, waypoints) {
  if (!waypoints || waypoints.length === 0) return Infinity;
  if (waypoints.length === 1) {
    return Math.hypot(x - waypoints[0].x, y - waypoints[0].y);
  }
  let bestSq = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dSq = pointToSegmentDistSq2D(x, y, a.x, a.y, b.x, b.y);
    if (dSq < bestSq) bestSq = dSq;
  }
  return Math.sqrt(bestSq);
}

/**
 * Compute counts of visible hazards, resources, and science elements within 150 m of each route.
 * Scan-only Mystery blips are excluded from planning counts.
 */
export function computeRouteElementCounts(candidates, elements, maxDistM = 150.0) {
  const counts = {};
  candidates.forEach(c => {
    const res = { hazard: 0, resource: 0, science: 0, total: 0, ids: [] };
    elements.forEach(el => {
      if (el.visibility === 'scan') return;
      const d = minDistanceToPolyline2D(el.x, el.y, c.waypoints);
      if (d <= maxDistM) {
        if (el.family === 'hazard' || el.family === 'resource' || el.family === 'science') {
          res[el.family]++;
          res.total++;
          res.ids.push(el.id);
        }
      }
    });
    counts[c.id] = res;
  });
  return counts;
}

function createFamilyIconTexture(family, type) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const meta = FAMILY_META[family] || FAMILY_META.science;
  const color = meta.color;

  // Soft outer category glow
  const grad = ctx.createRadialGradient(32, 32, 10, 32, 32, 30);
  grad.addColorStop(0, `${color}66`);
  grad.addColorStop(1, `${color}00`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#070a10';
  ctx.fillStyle = color;

  if (family === 'hazard') {
    // High-contrast red triangle
    ctx.beginPath();
    ctx.moveTo(32, 11);
    ctx.lineTo(53, 49);
    ctx.lineTo(11, 49);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#070a10';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 32, 37);
  } else if (family === 'resource') {
    // High-contrast green rounded diamond/square
    ctx.beginPath();
    ctx.moveTo(32, 11);
    ctx.lineTo(53, 32);
    ctx.lineTo(32, 53);
    ctx.lineTo(11, 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#070a10';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', 32, 33);
  } else if (family === 'mystery' || family === 'unknown') {
    ctx.beginPath();
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ctx.fillStyle = family === 'unknown' ? '#111827' : '#181004';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = family === 'unknown' ? '#f59e0b' : color;
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 34);
  } else {
    // High-contrast cyan-blue circle (star/target ring for science / drill)
    ctx.beginPath();
    ctx.arc(32, 32, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#070a10';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(type === 'drill_site' ? '◎' : '★', 32, 33);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSmallElementMesh(el, sampleElevFn, minElev, iconTextures, hitGeo, hitMat, index = 0) {
  const group = new THREE.Group();
  const elev = sampleElevFn(el.x, el.y);
  const { meshX, meshZ } = localToMesh(el.x, el.y);
  const meta = FAMILY_META[el.family] || FAMILY_META.science;

  group.position.set(meshX, elev - minElev, meshZ);
  group.userData = {
    isMissionElement: true,
    elementId: el.id,
    element: el,
    elev,
    meshX,
    meshZ,
    phase: index * 0.65
  };

  if (hitGeo && hitMat) {
    const collider = new THREE.Mesh(hitGeo, hitMat);
    collider.position.y = 19;
    group.add(collider);
  }

  // Thin dark outline halo + bright category glow pulse ring (depthTest off so terrain never hides them)
  const outlineGeo = new THREE.RingGeometry(11.5, 13.5, 24);
  outlineGeo.rotateX(-Math.PI / 2);
  const outlineRing = new THREE.Mesh(
    outlineGeo,
    new THREE.MeshBasicMaterial({
      color: 0x070a10,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    })
  );
  outlineRing.position.y = 2.0;
  outlineRing.renderOrder = 11;
  group.add(outlineRing);

  const pulseGeo = new THREE.RingGeometry(4.5, 11.4, 24);
  pulseGeo.rotateX(-Math.PI / 2);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: meta.hex,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
  pulseRing.position.y = 2.5;
  pulseRing.renderOrder = 12;
  group.add(pulseRing);
  group.userData.pulseRing = pulseRing;

  if (el.type === 'dust_devil_corridor') {
    const pCount = 28;
    const pos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const f = i / pCount;
      const ang = f * Math.PI * 5.0;
      const rad = 3.0 + f * 12.5;
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = 4.0 + f * 38.0;
      pos[i * 3 + 2] = Math.sin(ang) * rad;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const funnel = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0xf87171,
        size: 5.5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false
      })
    );
    funnel.renderOrder = 13;
    funnel.userData = { isDustVortex: true, elementId: el.id };
    group.add(funnel);
    group.userData.vortexObj = funnel;
  }

  // Camera-facing crisp icon sprite for clear readability from any camera angle
  const texKey = el.type === 'drill_site' ? 'drill_site' : el.family;
  const spriteTex = iconTextures[texKey] || iconTextures.science;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: spriteTex,
      transparent: true,
      depthTest: false,
      depthWrite: false
    })
  );
  sprite.scale.set(22, 22, 1);
  sprite.position.y = el.type === 'dust_devil_corridor' ? 40 : 20;
  sprite.renderOrder = 14;
  group.add(sprite);
  group.userData.mainSprite = sprite;
  group.userData.trueTexKey = texKey;
  group.userData.trueFamilyHex = meta.hex;
  if (el.family === 'mystery') {
    group.userData.questionSprite = sprite;
  }

  // Propagate clickable/hoverable elementId cleanly across children
  group.traverse(child => {
    child.userData.elementId = el.id;
    child.userData.isMissionElement = true;
  });

  return group;
}

export function createMissionElementsController({ elementsData, sampleElevFn, minElev }) {
  const elements = elementsData.elements || [];
  const elementById = new Map(elements.map(e => [e.id, e]));
  const group = new THREE.Group();
  group.name = 'MissionElementsGroup';

  const iconTextures = {
    hazard: createFamilyIconTexture('hazard', 'hazard'),
    resource: createFamilyIconTexture('resource', 'resource'),
    science: createFamilyIconTexture('science', 'science_target'),
    drill_site: createFamilyIconTexture('science', 'drill_site'),
    mystery: createFamilyIconTexture('mystery', 'mystery_blip'),
    unknown: createFamilyIconTexture('unknown', 'unknown')
  };
  const sharedHitGeo = new THREE.CylinderGeometry(18, 18, 38, 8);
  const sharedHitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    colorWrite: false
  });
  const markerGroups = new Map();
  const dustMarkers = [];
  const mysteryMarkers = [];

  // Corridor elements near routes require Survey Kit ELEMENTS click to identify (fixed Targets 1–3 start known)
  const IDENTIFIABLE_IDS = new Set(
    elements
      .filter(el => el.visibility !== 'scan' && el.id !== 'target-1' && el.id !== 'target-2' && el.id !== 'target-3')
      .map(el => el.id)
  );
  const identifiedIds = new Set();

  function syncMarkerIdentificationVisual(elId) {
    const mg = markerGroups.get(elId);
    if (!mg) return;
    const isUnknown = IDENTIFIABLE_IDS.has(elId) && !identifiedIds.has(elId) && !isPostLock;
    const sprite = mg.userData.mainSprite;
    const pulseRing = mg.userData.pulseRing;
    if (sprite && sprite.material) {
      const targetTex = isUnknown ? iconTextures.unknown : (iconTextures[mg.userData.trueTexKey] || iconTextures.science);
      if (sprite.material.map !== targetTex) {
        sprite.material.map = targetTex;
        sprite.material.needsUpdate = true;
      }
    }
    if (pulseRing && pulseRing.material) {
      const targetHex = isUnknown ? 0xf59e0b : (mg.userData.trueFamilyHex || 0x38bdf8);
      pulseRing.material.color.setHex(targetHex);
    }
  }

  elements.forEach((el, idx) => {
    const mg = createSmallElementMesh(el, sampleElevFn, minElev, iconTextures, sharedHitGeo, sharedHitMat, idx);
    markerGroups.set(el.id, mg);
    group.add(mg);
    if (el.type === 'dust_devil_corridor') dustMarkers.push(mg);
    if (el.family === 'mystery') mysteryMarkers.push(mg);
  });

  // In-memory Field Codex unlock set
  const unlockedTypes = new Set();

  let currentExag = 1.0;
  let activeLens = 'satellite';
  let isPostLock = false;
  let isBriefing = true;
  let isMissionMode = true;
  let isExploration = false;
  let showAllElements = false;
  const enabledCategories = new Set(['mission', 'terrain', 'materials', 'hazards', 'resources', 'science', 'mystery']);

  const tmpVec = new THREE.Vector3();
  const projScreenMatrix = new THREE.Matrix4();
  const frustum = new THREE.Frustum();

  function getUniqueTypesForStage(postLock = isPostLock) {
    const seen = new Set();
    const list = [];
    elements.forEach(el => {
      if (el.visibility === 'scan' && !postLock) return;
      if (seen.has(el.type)) return;
      seen.add(el.type);
      list.push({
        type: el.type,
        title: TYPE_DISPLAY_NAMES[el.type] || el.name,
        family: el.family,
        source: el.source,
        whatIsIt: el.whatIsIt,
        effectOnMission: el.effectOnMission
      });
    });
    return list;
  }

  function getCodexProgress() {
    const stageTypes = getUniqueTypesForStage(isPostLock);
    const unlocked = stageTypes.filter(t => unlockedTypes.has(t.type)).length;
    return { unlocked, total: stageTypes.length };
  }

  function unlockType(type) {
    if (!type || unlockedTypes.has(type)) return false;
    unlockedTypes.add(type);
    return true;
  }

  function resetCodex() {
    unlockedTypes.clear();
    identifiedIds.clear();
    markerGroups.forEach((_, elId) => syncMarkerIdentificationVisual(elId));
  }

  function isElementIdentified(elId) {
    if (!IDENTIFIABLE_IDS.has(elId)) return true;
    return isPostLock || identifiedIds.has(elId);
  }

  function identifyElement(elId) {
    const el = elementById.get(elId);
    if (!el) return { identifiedNow: false, element: null };
    const wasIdentified = identifiedIds.has(elId) || !IDENTIFIABLE_IDS.has(elId);
    if (IDENTIFIABLE_IDS.has(elId)) {
      identifiedIds.add(elId);
      syncMarkerIdentificationVisual(elId);
    }
    const unlockedCodexNow = unlockType(el.type);
    return {
      identifiedNow: !wasIdentified,
      unlockedCodexNow,
      element: el,
      identifiedCount: identifiedIds.size,
      totalIdentifiable: IDENTIFIABLE_IDS.size
    };
  }

  function updateExaggeration(exag) {
    currentExag = exag;
    markerGroups.forEach(mg => {
      const elev = mg.userData.elev;
      mg.position.y = (elev - minElev) * currentExag;
    });
  }

  function isElementEligible(el) {
    if (!isMissionMode || isBriefing) return false;
    if (el.visibility === 'scan' && !isPostLock) return false;

    const catKey = FAMILY_META[el.family]?.cat || 'science';
    if (!enabledCategories.has(catKey)) return false;

    if (showAllElements) return true;

    if (activeLens === 'satellite') {
      return el.type === 'science_target' || el.type === 'drill_site' || (el.visibility === 'scan' && isPostLock);
    }
    if (activeLens === 'terrain' || activeLens === 'heat') {
      return el.family === 'hazard';
    }
    if (activeLens === 'minerals') {
      return el.family === 'science';
    }
    if (activeLens === 'radiation') {
      return el.family === 'resource';
    }
    if (activeLens === 'sun') {
      return el.type === 'solar_ridge' || el.type === 'comm_relay_beacon' || el.type === 'oxygen_cache';
    }
    return true;
  }

  function setState({ missionMode, briefing, postLock, lens, showAll, exploring }) {
    if (typeof missionMode === 'boolean') isMissionMode = missionMode;
    if (typeof briefing === 'boolean') isBriefing = briefing;
    if (typeof postLock === 'boolean') isPostLock = postLock;
    if (typeof lens === 'string') activeLens = lens;
    if (typeof showAll === 'boolean') showAllElements = showAll;
    if (typeof exploring === 'boolean') isExploration = exploring;

    group.visible = isMissionMode && !isBriefing && !isExploration;
    markerGroups.forEach((_, elId) => syncMarkerIdentificationVisual(elId));
  }

  function setCategoryEnabled(cat, enabled) {
    if (enabled) enabledCategories.add(cat);
    else enabledCategories.delete(cat);
  }

  /**
   * Anti-clutter frame update:
   * 1) Enforces <= 12 visible icons with screen-space overlap culling.
   * 2) Pauses dust devil & mystery vortex animations when off-screen or culled.
   */
  function update(now, camera, width, height) {
    if (!group.visible) return;

    camera.updateMatrixWorld();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const eligible = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const mg = markerGroups.get(el.id);
      if (!mg) continue;

      if (!isElementEligible(el)) {
        mg.visible = false;
        continue;
      }

      tmpVec.set(mg.position.x, mg.position.y + 18, mg.position.z);
      if (!frustum.containsPoint(tmpVec)) {
        mg.visible = false;
        continue;
      }

      const dist = camera.position.distanceTo(tmpVec);
      tmpVec.project(camera);
      if (tmpVec.z < -1 || tmpVec.z > 1) {
        mg.visible = false;
        continue;
      }

      const sx = (tmpVec.x * 0.5 + 0.5) * width;
      const sy = (-tmpVec.y * 0.5 + 0.5) * height;
      if (sx < 8 || sx > width - 8 || sy < 36 || sy > height - 8) {
        mg.visible = false;
        continue;
      }

      let priority = FAMILY_META[el.family]?.priority || 70;
      if (el.type === 'science_target' || el.type === 'drill_site') priority += 12;
      if (el.visibility === 'scan') priority += 15;
      eligible.push({ mg, sx, sy, dist, score: priority * 100 - dist * 0.01 });
    }

    eligible.sort((a, b) => b.score - a.score);

    const placed = [];
    let visCount = 0;
    const minSepSq = 22 * 22;

    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      if (!showAllElements) {
        if (visCount >= MAX_VISIBLE_ICONS) {
          item.mg.visible = false;
          continue;
        }
        let overlaps = false;
        for (let j = 0; j < placed.length; j++) {
          const dx = item.sx - placed[j].sx;
          const dy = item.sy - placed[j].sy;
          if (dx * dx + dy * dy < minSepSq) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) {
          item.mg.visible = false;
          continue;
        }
      }

      item.mg.visible = true;
      // Maintain minimum on-screen marker visibility from any camera angle/distance
      const worldScale = Math.max(1.0, Math.min(3.8, item.dist / 1200.0));
      item.mg.scale.setScalar(worldScale);

      // Soft breathing pulse on ground halo while visible
      const pulseRing = item.mg.userData.pulseRing;
      if (pulseRing) {
        const wave = 0.5 + 0.5 * Math.sin(now * 0.0042 + (item.mg.userData.phase || 0));
        const ps = 0.94 + 0.24 * wave;
        pulseRing.scale.set(ps, ps, 1);
        pulseRing.material.opacity = 0.62 + 0.36 * (1.0 - wave);
      }

      placed.push(item);
      visCount++;
    }

    // Pause animations when off-screen or hidden
    for (let i = 0; i < dustMarkers.length; i++) {
      const dmg = dustMarkers[i];
      if (!dmg.visible) continue;
      const vortex = dmg.userData.vortexObj;
      if (vortex) {
        vortex.rotation.y = now * 0.0042;
      }
    }

    for (let i = 0; i < mysteryMarkers.length; i++) {
      const mmg = mysteryMarkers[i];
      if (!mmg.visible) continue;
      const sprite = mmg.userData.questionSprite;
      if (sprite) {
        sprite.position.y = 24 + 2.5 * Math.sin(now * 0.004);
      }
    }
  }

  function getRaycastTargets() {
    if (!group.visible) return [];
    const list = [];
    markerGroups.forEach(mg => {
      if (mg.visible) list.push(mg);
    });
    return list;
  }

  function buildElementCardPayload(el) {
    if (!el) return null;
    if (!isElementIdentified(el.id)) {
      return {
        id: el.id,
        type: 'unknown_element',
        category: 'mystery',
        categoryLabel: 'Unidentified Corridor Element',
        label: '?',
        hoverTitle: '? Unidentified Element',
        whatItIs: 'Surface anomaly near the traverse corridor. Activate Survey Kit → ELEMENTS and click this marker to identify it, add it to the Field Codex, and earn survey points.',
        effectOnMission: null,
        solText: null,
        dataset: 'Survey Kit Field Identification (MISSION RULE)',
        whyItMatters: 'Identifying corridor elements helps verify nearby hazards, resources, and science features.',
        tags: [{ text: 'MISSION RULE', cls: 'game' }, { text: 'unidentified', cls: 'sim' }],
        sourceChip: 'game',
        unidentified: true,
        rawElement: el
      };
    }

    const isTarget = el.id === 'target-1' || el.id === 'target-2' || el.id === 'target-3';
    const tags = [{ text: 'MISSION RULE', cls: 'game' }];
    if (isTarget) {
      tags.unshift({ text: 'measured (Curiosity traverse); description unverified', cls: 'unverified' });
    } else if (el.source === 'derived from DEM') {
      tags.push({ text: 'derived from DEM', cls: 'dem' });
    }
    if (import.meta.env.DEV && el.whatIsIt && el.whatIsIt.verified === false) {
      tags.push({ text: 'verify before submission', cls: 'sim' });
    }

    const catName = FAMILY_META[el.family]?.label || el.family;
    const typeLabel = TYPE_DISPLAY_NAMES[el.type] || el.type;

    let hoverTitle = el.name;
    let whatItIs = el.whatIsIt.text;
    if (el.id === 'target-1') {
      hoverTitle = `Target 1: ${el.name}`;
    } else if (el.id === 'target-2') {
      hoverTitle = `Target 2: ${el.name}`;
    } else if (el.id === 'target-3') {
      hoverTitle = el.name;
    }

    return {
      id: el.id,
      type: el.type,
      category: FAMILY_META[el.family]?.cat || 'science',
      categoryLabel: `${catName} · ${typeLabel}`,
      label: el.shortLabel || el.name,
      hoverTitle,
      whatItIs,
      effectOnMission: el.effectOnMission,
      solText: el.solLabel || null,
      dataset: el.coordinateSource === 'measured'
        ? `Curiosity ROVER location (measured) · ${el.placementRule}`
        : `${el.source} · ${el.placementRule}`,
      whyItMatters: el.effectOnMission
        ? (el.effectOnMission.startsWith('Mission effect:') ? el.effectOnMission : `Mission effect: ${el.effectOnMission}`)
        : 'Identified surface feature.',
      tags,
      sourceChip: el.source === 'derived from DEM' ? 'derived' : 'game',
      rawElement: el
    };
  }

  return {
    group,
    getElements: () => elements,
    getElementById: id => elementById.get(id) || null,
    getMarkerGroup: id => markerGroups.get(id) || null,
    getUniqueTypesForStage,
    getCodexProgress,
    unlockType,
    isTypeUnlocked: type => unlockedTypes.has(type),
    getUnlockedCount: () => unlockedTypes.size,
    isElementIdentified,
    identifyElement,
    getIdentificationProgress: () => ({
      identified: identifiedIds.size,
      total: IDENTIFIABLE_IDS.size
    }),
    getIdentifiableIds: () => new Set(IDENTIFIABLE_IDS),
    resetCodex,
    setState,
    setCategoryEnabled,
    updateExaggeration,
    update,
    getRaycastTargets,
    buildElementCardPayload,
    getVisibleIconCount: () => {
      let c = 0;
      markerGroups.forEach(mg => { if (mg.visible) c++; });
      return c;
    }
  };
}
