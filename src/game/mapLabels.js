/**
 * Camera-Facing 3D Map Labels with Category Filtering, Active-Lens Priority Boost,
 * Overlap Culling (max 8 visible in standard mode), "Show all" Mode with Leader Lines,
 * Hover Cards, and Clickable Detail Cards.
 */

import * as THREE from 'three';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_VISIBLE_STANDARD = 8;
const FADE_START_M = 3500.0;
const FADE_END_M = 8600.0;
const TARGET_PROVENANCE_TAG = 'measured (Curiosity traverse); description unverified';

const CATEGORY_ICONS = Object.freeze({
  mission: '◎',
  terrain: '▲',
  materials: '◆',
  hazards: '⚠',
  resources: '✚',
  science: '★',
  mystery: '?'
});

const LENS_CATEGORY_BOOST = Object.freeze({
  satellite: { mission: 12, science: 8, hazards: 6, terrain: 0, materials: 0, resources: 0, mystery: 14 },
  terrain: { terrain: 42, hazards: 36, mission: 6, science: 0, materials: 0, resources: 0, mystery: 6 },
  minerals: { materials: 48, science: 22, mission: 4, terrain: 0, hazards: 0, resources: 0, mystery: 6 },
  heat: { materials: 22, terrain: 22, hazards: 20, mission: 6, science: 4, resources: 0, mystery: 6 },
  sun: { terrain: 44, resources: 18, mission: 6, hazards: 10, materials: 0, science: 0, mystery: 6 },
  radiation: { terrain: 44, resources: 28, hazards: 16, mission: 6, materials: 0, science: 0, mystery: 6 }
});

// Candidate pixel offsets around anchor (sx, sy) for Show-all de-overlap placement
const SHOW_ALL_SLOTS = [
  [0, -14],
  [0, -40],
  [36, -24],
  [-36, -24],
  [0, 22],
  [68, -8],
  [-68, -8],
  [46, -54],
  [-46, -54],
  [84, -36],
  [-84, -36],
  [0, -68],
  [64, 18],
  [-64, 18],
  [105, -14],
  [-105, -14],
  [0, 46]
];

function createTagBadge(text, cls) {
  const span = document.createElement('span');
  span.className = `mhc-tag ${cls}`;
  span.textContent = text;
  return span;
}

export function createMapLabelController({
  layerEl,
  leaderSvgEl,
  hoverCardEl,
  mhcNameEl,
  mhcSolEl,
  mhcDescEl,
  mhcEffectEl,
  mhcTagsEl,
  detailCardEl,
  ldcTitleEl,
  ldcCategoryEl,
  ldcSolEl,
  ldcWhatEl,
  ldcDatasetEl,
  ldcWhyEl,
  ldcTagsEl,
  ldcCloseBtn,
  onSelectAnchor
}) {
  let anchors = [];
  let sortedAnchors = [];
  const enabledCategories = new Set(['mission', 'terrain', 'materials', 'hazards', 'resources', 'science', 'mystery']);
  let showAllMode = false;
  let activeLens = 'satellite';
  let postLockRevealed = false;
  let briefingActive = true;
  let hoveredAnchorId = null;
  let forceDirty = true;

  const anchorById = new Map();
  const labelEls = new Map();
  const leaderEls = new Map();
  const cachedState = new Map();
  const tmpVec = new THREE.Vector3();

  if (ldcCloseBtn) {
    ldcCloseBtn.addEventListener('click', () => hideDetailCard());
  }

  function resortAnchorsForLens() {
    const boosts = LENS_CATEGORY_BOOST[activeLens] || LENS_CATEGORY_BOOST.satellite;
    sortedAnchors = [...anchors].sort((a, b) => {
      const pa = (a.basePriority || 50) + (boosts[a.category] || 0);
      const pb = (b.basePriority || 50) + (boosts[b.category] || 0);
      return pb - pa;
    });
    forceDirty = true;
  }

  function anyCategoryEnabled() {
    return enabledCategories.size > 0;
  }

  function syncLayerVisibility() {
    const visible = !briefingActive && anyCategoryEnabled();
    if (layerEl) layerEl.classList.toggle('hidden', !visible);
    if (leaderSvgEl) leaderSvgEl.classList.toggle('hidden', !visible || !showAllMode);
    if (!visible) {
      hideHoverCard();
      hideDetailCard();
    }
    forceDirty = true;
  }

  function setCategoryEnabled(cat, enabled) {
    if (enabled) enabledCategories.add(cat);
    else enabledCategories.delete(cat);
    syncLayerVisibility();
  }

  function setShowAll(enabled) {
    showAllMode = !!enabled;
    syncLayerVisibility();
  }

  function setActiveLens(lensId) {
    activeLens = lensId || 'satellite';
    resortAnchorsForLens();
  }

  function setViewContext({ isBriefing, isPostLock }) {
    briefingActive = !!isBriefing;
    postLockRevealed = !!isPostLock;
    syncLayerVisibility();
  }

  function buildProvenanceBadges(targetEl, anchor) {
    targetEl.innerHTML = '';
    if (anchor.tags && anchor.tags.length) {
      anchor.tags.forEach(t => targetEl.appendChild(createTagBadge(t.text, t.cls)));
      return;
    }
    if (anchor.category === 'science') {
      targetEl.appendChild(createTagBadge(TARGET_PROVENANCE_TAG, 'unverified'));
      return;
    }
    const chipCls = anchor.sourceChip === 'derived' ? 'dem' : anchor.sourceChip === 'SIM' ? 'sim' : anchor.sourceChip || 'measured';
    const chipLabel = anchor.sourceChip === 'derived' ? 'derived from DEM' : (anchor.sourceChip || 'measured');
    targetEl.appendChild(createTagBadge(chipLabel, chipCls));
  }

  function showHoverCard(anchor, clientX, clientY) {
    if (!hoverCardEl || !anchor || briefingActive) return;
    hoveredAnchorId = anchor.id;

    mhcNameEl.textContent = anchor.hoverTitle || anchor.label;
    mhcDescEl.textContent = (postLockRevealed && anchor.whatPostLock) ? anchor.whatPostLock : anchor.whatItIs;

    if (mhcEffectEl) {
      if (anchor.effectOnMission) {
        mhcEffectEl.textContent = anchor.effectOnMission;
        mhcEffectEl.classList.remove('hidden');
      } else {
        mhcEffectEl.textContent = '';
        mhcEffectEl.classList.add('hidden');
      }
    }

    if (mhcSolEl) {
      if (postLockRevealed && anchor.solText) {
        mhcSolEl.textContent = anchor.solText;
        mhcSolEl.classList.remove('hidden');
      } else {
        mhcSolEl.textContent = '';
        mhcSolEl.classList.add('hidden');
      }
    }

    buildProvenanceBadges(mhcTagsEl, anchor);
    hoverCardEl.classList.remove('hidden');

    const cardW = hoverCardEl.offsetWidth || 260;
    const cardH = hoverCardEl.offsetHeight || 82;
    const x = Math.max(8, Math.min(window.innerWidth - cardW - 10, clientX + 14));
    const y = Math.max(40, Math.min(window.innerHeight - cardH - 10, clientY + 14));
    hoverCardEl.style.left = `${x}px`;
    hoverCardEl.style.top = `${y}px`;
  }

  function hideHoverCard() {
    hoveredAnchorId = null;
    if (hoverCardEl) hoverCardEl.classList.add('hidden');
  }

  function showDetailCard(anchor) {
    if (!detailCardEl || !anchor || briefingActive) return;
    hideHoverCard();
    if (ldcTitleEl) ldcTitleEl.textContent = anchor.hoverTitle || anchor.label;
    if (ldcCategoryEl) ldcCategoryEl.textContent = `${CATEGORY_ICONS[anchor.category] || '•'} ${anchor.categoryLabel || anchor.category}`;
    if (ldcSolEl) {
      if (postLockRevealed && anchor.solText) {
        ldcSolEl.textContent = anchor.solText;
        ldcSolEl.classList.remove('hidden');
      } else {
        ldcSolEl.textContent = '';
        ldcSolEl.classList.add('hidden');
      }
    }
    if (ldcWhatEl) {
      ldcWhatEl.textContent = (postLockRevealed && anchor.whatPostLock) ? anchor.whatPostLock : anchor.whatItIs;
    }
    if (ldcDatasetEl) ldcDatasetEl.textContent = anchor.dataset;
    if (ldcWhyEl) ldcWhyEl.textContent = anchor.whyItMatters;
    if (ldcTagsEl) buildProvenanceBadges(ldcTagsEl, anchor);

    detailCardEl.classList.remove('hidden');
    detailCardEl.dataset.anchorId = anchor.id;
    if (typeof onSelectAnchor === 'function') {
      onSelectAnchor(anchor);
    }
  }

  function hideDetailCard() {
    if (detailCardEl) {
      detailCardEl.classList.add('hidden');
      delete detailCardEl.dataset.anchorId;
    }
  }

  function setAnchors(newAnchors) {
    anchors = [...newAnchors];
    anchorById.clear();
    labelEls.clear();
    leaderEls.clear();
    cachedState.clear();
    if (layerEl) layerEl.innerHTML = '';
    if (leaderSvgEl) leaderSvgEl.innerHTML = '';

    anchors.forEach(a => {
      anchorById.set(a.id, a);

      if (layerEl) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `map-label cat-${a.category} hidden-label`;
        pill.dataset.anchorId = a.id;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'ml-icon';
        iconSpan.textContent = CATEGORY_ICONS[a.category] || '•';

        const textSpan = document.createElement('span');
        textSpan.className = 'ml-text';
        textSpan.textContent = a.label;

        const chipSpan = document.createElement('span');
        const chipType = a.sourceChip || 'measured';
        chipSpan.className = `ml-src src-${chipType.toLowerCase()}`;
        chipSpan.textContent = chipType;

        pill.appendChild(iconSpan);
        pill.appendChild(textSpan);
        pill.appendChild(chipSpan);

        pill.addEventListener('pointerenter', e => showHoverCard(a, e.clientX, e.clientY));
        pill.addEventListener('pointermove', e => {
          if (hoveredAnchorId === a.id) showHoverCard(a, e.clientX, e.clientY);
        });
        pill.addEventListener('pointerleave', hideHoverCard);
        pill.addEventListener('click', e => {
          e.stopPropagation();
          showDetailCard(a);
        });

        layerEl.appendChild(pill);
        labelEls.set(a.id, pill);
      }

      if (leaderSvgEl) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'leader-line');
        line.style.display = 'none';
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('class', 'leader-dot');
        dot.setAttribute('r', '2.5');
        dot.style.display = 'none';
        leaderSvgEl.appendChild(line);
        leaderSvgEl.appendChild(dot);
        leaderEls.set(a.id, { line, dot });
      }

      cachedState.set(a.id, { visible: false, x: -9999, y: -9999, ax: -9999, ay: -9999, opacity: -1, hasLine: false });
    });

    resortAnchorsForLens();
    syncLayerVisibility();
  }

  function applyLabelVisual(id, visible, pillCenterX, pillBottomY, opacity, anchorX, anchorY, drawLeader) {
    const el = labelEls.get(id);
    const cache = cachedState.get(id);
    const ldr = leaderEls.get(id);
    if (!el || !cache) return;

    if (!visible) {
      if (cache.visible || forceDirty) {
        el.classList.add('hidden-label');
        cache.visible = false;
      }
      if (ldr && cache.hasLine) {
        ldr.line.style.display = 'none';
        ldr.dot.style.display = 'none';
        cache.hasLine = false;
      }
      return;
    }

    if (!cache.visible) {
      el.classList.remove('hidden-label');
      cache.visible = true;
    }

    if (Math.abs(pillCenterX - cache.x) > 0.35 || Math.abs(pillBottomY - cache.y) > 0.35) {
      el.style.transform = `translate3d(${pillCenterX.toFixed(1)}px, ${pillBottomY.toFixed(1)}px, 0) translate(-50%, -100%)`;
      cache.x = pillCenterX;
      cache.y = pillBottomY;
    }

    if (Math.abs(opacity - cache.opacity) > 0.02) {
      el.style.opacity = opacity.toFixed(2);
      cache.opacity = opacity;
    }

    if (ldr) {
      if (drawLeader) {
        const lineEndY = pillBottomY - (cache._boxH || 20) * 0.5;
        if (
          !cache.hasLine ||
          Math.abs(anchorX - cache.ax) > 0.4 ||
          Math.abs(anchorY - cache.ay) > 0.4 ||
          Math.abs(pillCenterX - cache.x) > 0.4 ||
          Math.abs(pillBottomY - cache.y) > 0.4
        ) {
          ldr.dot.setAttribute('cx', anchorX.toFixed(1));
          ldr.dot.setAttribute('cy', anchorY.toFixed(1));
          ldr.line.setAttribute('x1', anchorX.toFixed(1));
          ldr.line.setAttribute('y1', anchorY.toFixed(1));
          ldr.line.setAttribute('x2', pillCenterX.toFixed(1));
          ldr.line.setAttribute('y2', lineEndY.toFixed(1));
        }
        if (!cache.hasLine) {
          ldr.line.style.display = '';
          ldr.dot.style.display = '';
          cache.hasLine = true;
        }
        cache.ax = anchorX;
        cache.ay = anchorY;
      } else if (cache.hasLine) {
        ldr.line.style.display = 'none';
        ldr.dot.style.display = 'none';
        cache.hasLine = false;
      }
    }
  }

  function boxesOverlap(a, b, pad = 5) {
    return (
      a.left - pad < b.right &&
      a.right + pad > b.left &&
      a.top - pad < b.bottom &&
      a.bottom + pad > b.top
    );
  }

  function update(camera, width, height, plannerTopY, rightLimitX = width - 10, leftLimitX = 10) {
    if (briefingActive || !anyCategoryEnabled() || !sortedAnchors.length || !layerEl) return;

    const placedBoxes = [];
    let visibleCount = 0;
    const minY = 44;
    const maxY = Math.min(height - 14, plannerTopY > 120 ? plannerTopY - 6 : height - 14);
    const minX = Math.max(10, leftLimitX);
    const maxX = Math.max(minX + 120, Math.min(width - 10, rightLimitX));

    for (let i = 0; i < sortedAnchors.length; i++) {
      const a = sortedAnchors[i];

      if (!enabledCategories.has(a.category) || (a.requirePostLock && !postLockRevealed)) {
        applyLabelVisual(a.id, false, 0, 0, 0, 0, 0, false);
        continue;
      }

      if (!showAllMode && visibleCount >= MAX_VISIBLE_STANDARD) {
        applyLabelVisual(a.id, false, 0, 0, 0, 0, 0, false);
        continue;
      }

      const wy = a.getWorldY ? a.getWorldY() : a.worldY;
      tmpVec.set(a.worldX, wy, a.worldZ);
      const dist = camera.position.distanceTo(tmpVec);

      if (!showAllMode && dist >= FADE_END_M) {
        applyLabelVisual(a.id, false, 0, 0, 0, 0, 0, false);
        continue;
      }

      tmpVec.project(camera);
      if (tmpVec.z < -1 || tmpVec.z > 1) {
        applyLabelVisual(a.id, false, 0, 0, 0, 0, 0, false);
        continue;
      }

      const sx = (tmpVec.x * 0.5 + 0.5) * width;
      const sy = (-tmpVec.y * 0.5 + 0.5) * height;

      if (sx < minX || sx > maxX || sy < minY || sy > height - 10) {
        applyLabelVisual(a.id, false, 0, 0, 0, 0, 0, false);
        continue;
      }

      if (!a._boxW) {
        const el = labelEls.get(a.id);
        if (el && el.offsetWidth > 0) {
          a._boxW = el.offsetWidth;
          a._boxH = el.offsetHeight || 20;
          const cState = cachedState.get(a.id);
          if (cState) cState._boxH = a._boxH;
        }
      }
      const boxW = a._boxW || (a.label.length * 6.5 + 54);
      const boxH = a._boxH || 21;

      if (!showAllMode) {
        const box = { left: sx - boxW * 0.5, right: sx + boxW * 0.5, top: sy - boxH, bottom: sy };
        if (box.left < minX || box.right > maxX || box.top < minY || box.bottom > maxY) {
          applyLabelVisual(a.id, false, 0, 0, 0, 0, 0, false);
          continue;
        }
        if (placedBoxes.some(b => boxesOverlap(box, b, 6))) {
          applyLabelVisual(a.id, false, 0, 0, 0, 0, 0, false);
          continue;
        }

        let opacity = 1.0;
        if (dist > FADE_START_M) {
          const t = (dist - FADE_START_M) / (FADE_END_M - FADE_START_M);
          opacity = Math.max(0.08, 1.0 - t * 0.92);
        }

        placedBoxes.push(box);
        visibleCount++;
        applyLabelVisual(a.id, true, sx, sy, opacity, sx, sy, false);
      } else {
        // Show all mode: find nearest non-overlapping slot and draw SVG leader line back to anchor
        let chosenX = sx;
        let chosenY = sy - 14;
        let chosenBox = { left: sx - boxW * 0.5, right: sx + boxW * 0.5, top: sy - 14 - boxH, bottom: sy - 14 };
        let placed = false;

        for (let sIdx = 0; sIdx < SHOW_ALL_SLOTS.length; sIdx++) {
          const [ox, oy] = SHOW_ALL_SLOTS[sIdx];
          const cx = Math.max(boxW * 0.5 + minX, Math.min(maxX - boxW * 0.5, sx + ox));
          const cy = Math.max(minY + boxH, Math.min(maxY, sy + oy));
          const candBox = { left: cx - boxW * 0.5, right: cx + boxW * 0.5, top: cy - boxH, bottom: cy };
          if (!placedBoxes.some(b => boxesOverlap(candBox, b, 4))) {
            chosenX = cx;
            chosenY = cy;
            chosenBox = candBox;
            placed = true;
            break;
          }
        }

        if (!placed) {
          for (let step = 1; step <= 6; step++) {
            const cy = Math.max(minY + boxH, Math.min(maxY, sy - 14 - step * 24));
            const cx = Math.max(boxW * 0.5 + minX, Math.min(maxX - boxW * 0.5, sx + (step % 2 ? 42 : -42)));
            const candBox = { left: cx - boxW * 0.5, right: cx + boxW * 0.5, top: cy - boxH, bottom: cy };
            if (!placedBoxes.some(b => boxesOverlap(candBox, b, 3))) {
              chosenX = cx;
              chosenY = cy;
              chosenBox = candBox;
              break;
            }
          }
        }

        const pillCenterY = chosenY - boxH * 0.5;
        const leaderDist = Math.hypot(chosenX - sx, pillCenterY - sy);
        placedBoxes.push(chosenBox);
        visibleCount++;
        applyLabelVisual(a.id, true, chosenX, chosenY, 0.96, sx, sy, leaderDist > 8);
      }
    }

    forceDirty = false;
  }

  return {
    setAnchors,
    setCategoryEnabled,
    setShowAll,
    setActiveLens,
    setViewContext,
    update,
    showHoverCard,
    hideHoverCard,
    showDetailCard,
    hideDetailCard,
    getAnchorById: id => anchorById.get(id) || null,
    isShowAll: () => showAllMode,
    getEnabledCategories: () => [...enabledCategories],
    getVisibleCount: () => {
      let c = 0;
      cachedState.forEach(s => { if (s.visible) c++; });
      return c;
    }
  };
}
