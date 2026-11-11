/**
 * Interactive Guided Tutorial Controller (Mission 1 — ARIA Guide)
 * In-memory progress only. Supports pulsing spotlight, 4-quadrant interactive dimmer,
 * action-driven advancement, fallback text mode when a target isn't visible, and Skip/Replay.
 */

import { TUTORIAL_STEPS, TUTORIAL_GUIDE_META } from '../game/tutorialSteps.js';

export function createTutorialController({
  rootEl,
  dimTopEl,
  dimRightEl,
  dimBottomEl,
  dimLeftEl,
  ringEl,
  cardEl,
  guideNameEl,
  stepCounterEl,
  titleEl,
  textEl,
  actionHintEl,
  nextBtnEl,
  skipBtnEl,
  isBlockingOverlayOpen,
  onStartTutorial,
  onBeforeEnterStep,
  onCompleteOrSkip,
  onSound
} = {}) {
  let active = false;
  let hasStartedOnce = false;
  let stepIndex = 0;
  let stepStartedAtMs = 0;
  let rafId = null;
  let lastTargetVisible = false;

  if (guideNameEl) guideNameEl.textContent = TUTORIAL_GUIDE_META.name;

  function isElActuallyVisible(el) {
    if (!el) return false;
    if (el.classList.contains('hidden')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0.05) {
      return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    if (r.right < 8 || r.left > window.innerWidth - 8 || r.bottom < 8 || r.top > window.innerHeight - 8) {
      return false;
    }
    return true;
  }

  function computeSpotlightRect(step) {
    if (!step) return null;
    const blockedByModal = isBlockingOverlayOpen ? isBlockingOverlayOpen() : false;

    if (step.isCanvasArea) {
      if (blockedByModal) return null;
      const hud = document.getElementById('hud-header');
      const hudB = hud ? Math.ceil(hud.getBoundingClientRect().bottom) : 56;
      const planner = document.getElementById('planner-panel');
      const plVisible = planner && isElActuallyVisible(planner);
      const plTop = plVisible ? Math.floor(planner.getBoundingClientRect().top) - 8 : window.innerHeight - 90;
      const left = 48;
      const top = hudB + 56;
      const right = window.innerWidth - 48;
      const bottom = Math.max(top + 140, plTop);
      return {
        left,
        top,
        right,
        bottom,
        width: Math.max(160, right - left),
        height: Math.max(120, bottom - top)
      };
    }

    const sels = step.selectors || [];
    const pad = typeof step.spotlightPad === 'number' ? step.spotlightPad : 8;
    const rects = [];

    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!isElActuallyVisible(el)) continue;
      // Don't spotlight background panels beneath full-screen Briefing overlay
      if (blockedByModal && !sel.includes('briefing') && sel !== '#game-phase-bar') {
        continue;
      }
      const r = el.getBoundingClientRect();
      rects.push(r);
      if (!step.combineUnion) break; // Prefer first visible match
    }

    if (rects.length === 0) return null;

    let minL = Infinity;
    let minT = Infinity;
    let maxR = -Infinity;
    let maxB = -Infinity;
    for (const r of rects) {
      minL = Math.min(minL, r.left);
      minT = Math.min(minT, r.top);
      maxR = Math.max(maxR, r.right);
      maxB = Math.max(maxB, r.bottom);
    }

    const left = Math.max(4, Math.floor(minL - pad));
    const top = Math.max(4, Math.floor(minT - pad));
    const right = Math.min(window.innerWidth - 4, Math.ceil(maxR + pad));
    const bottom = Math.min(window.innerHeight - 4, Math.ceil(maxB + pad));

    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(16, right - left),
      height: Math.max(16, bottom - top)
    };
  }

  function applyDimmerAndRing(rect, step) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const passThrough = Boolean(step && (step.allowCanvasClick || !rect));

    [dimTopEl, dimRightEl, dimBottomEl, dimLeftEl].forEach(d => {
      if (d) d.style.pointerEvents = passThrough ? 'none' : 'auto';
    });

    if (!rect) {
      // Text-only fallback (target hidden in current stage): mild dim top strip, ring hidden
      if (dimTopEl) dimTopEl.style.cssText = `top:0;left:0;width:${vw}px;height:${vh}px;pointer-events:none;background:rgba(4,7,13,0.48);`;
      [dimRightEl, dimBottomEl, dimLeftEl].forEach(d => {
        if (d) d.style.cssText = 'width:0;height:0;pointer-events:none;';
      });
      if (ringEl) ringEl.classList.add('hidden');
      return;
    }

    if (dimTopEl) {
      dimTopEl.style.cssText = `top:0;left:0;width:${vw}px;height:${rect.top}px;pointer-events:${passThrough ? 'none' : 'auto'};`;
    }
    if (dimBottomEl) {
      dimBottomEl.style.cssText = `top:${rect.bottom}px;left:0;width:${vw}px;height:${Math.max(0, vh - rect.bottom)}px;pointer-events:${passThrough ? 'none' : 'auto'};`;
    }
    if (dimLeftEl) {
      dimLeftEl.style.cssText = `top:${rect.top}px;left:0;width:${rect.left}px;height:${rect.height}px;pointer-events:${passThrough ? 'none' : 'auto'};`;
    }
    if (dimRightEl) {
      dimRightEl.style.cssText = `top:${rect.top}px;left:${rect.right}px;width:${Math.max(0, vw - rect.right)}px;height:${rect.height}px;pointer-events:${passThrough ? 'none' : 'auto'};`;
    }

    if (ringEl) {
      ringEl.classList.remove('hidden');
      ringEl.style.left = `${rect.left}px`;
      ringEl.style.top = `${rect.top}px`;
      ringEl.style.width = `${rect.width}px`;
      ringEl.style.height = `${rect.height}px`;
    }
  }

  function positionBubble(rect, step) {
    if (!cardEl) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardRect = cardEl.getBoundingClientRect();
    const cw = cardRect.width || 390;
    const ch = cardRect.height || 210;
    const margin = 14;

    if (!rect) {
      cardEl.style.left = `${Math.round((vw - cw) / 2)}px`;
      cardEl.style.top = `${Math.round((vh - ch) / 2)}px`;
      return;
    }

    // For full-center canvas spotlight, dock ARIA top-left so center map drag area stays clear
    if (step && step.isCanvasArea) {
      const lx = Math.max(margin, Math.min(vw - cw - margin, rect.left + 14));
      const ty = Math.max(66, Math.min(vh - ch - margin, rect.top));
      cardEl.style.left = `${Math.round(lx)}px`;
      cardEl.style.top = `${Math.round(ty)}px`;
      return;
    }

    // Candidate placements: below, above, right, left of spotlight rect
    const candidates = [
      { x: rect.left + (rect.width - cw) / 2, y: rect.bottom + margin },
      { x: rect.left + (rect.width - cw) / 2, y: rect.top - ch - margin },
      { x: rect.right + margin, y: rect.top + (rect.height - ch) / 2 },
      { x: rect.left - cw - margin, y: rect.top + (rect.height - ch) / 2 }
    ];

    let chosen = null;
    for (const c of candidates) {
      const cx = Math.max(margin, Math.min(vw - cw - margin, c.x));
      const cy = Math.max(62, Math.min(vh - ch - margin, c.y));
      const overlapsSpotlight = !(cx + cw <= rect.left || cx >= rect.right || cy + ch <= rect.top || cy >= rect.bottom);
      if (!overlapsSpotlight) {
        chosen = { x: cx, y: cy };
        break;
      }
    }

    if (!chosen) {
      chosen = {
        x: Math.max(margin, Math.min(vw - cw - margin, (vw - cw) / 2)),
        y: Math.max(62, Math.min(vh - ch - margin, vh - ch - 20))
      };
    }

    cardEl.style.left = `${Math.round(chosen.x)}px`;
    cardEl.style.top = `${Math.round(chosen.y)}px`;
  }

  function renderCurrentStep({ firstRender = false } = {}) {
    if (!active) return;
    const step = TUTORIAL_STEPS[stepIndex];
    if (!step) {
      finishTutorial(false);
      return;
    }

    const total = TUTORIAL_STEPS.length;
    if (stepCounterEl) stepCounterEl.textContent = `Step ${stepIndex + 1} of ${total}`;
    if (titleEl) titleEl.textContent = step.title;
    if (textEl) textEl.textContent = step.text;

    const spotRect = computeSpotlightRect(step);
    const hasVisibleSpot = Boolean(spotRect);
    const needsAction = Boolean(step.actionType && hasVisibleSpot);
    document.body.classList.toggle(
      'tutorial-canvas-passthrough',
      Boolean(active && (step.isCanvasArea || step.allowCanvasClick))
    );

    if (actionHintEl) {
      if (needsAction && step.actionPrompt) {
        actionHintEl.textContent = step.actionPrompt;
        actionHintEl.classList.remove('hidden');
      } else {
        actionHintEl.classList.add('hidden');
      }
    }

    if (nextBtnEl) {
      const label = step.nextLabel || 'Next';
      nextBtnEl.textContent = label;
      // Only wait for user action when target IS visible; never block player if target isn't visible
      nextBtnEl.disabled = needsAction;
      nextBtnEl.classList.toggle('waiting-action', needsAction);
      nextBtnEl.setAttribute('aria-disabled', needsAction ? 'true' : 'false');
    }

    applyDimmerAndRing(spotRect, step);
    if (firstRender || lastTargetVisible !== hasVisibleSpot) {
      lastTargetVisible = hasVisibleSpot;
      requestAnimationFrame(() => positionBubble(spotRect, step));
    } else {
      positionBubble(spotRect, step);
    }
  }

  function layoutLoop() {
    if (!active) return;
    const step = TUTORIAL_STEPS[stepIndex];
    if (step) {
      const spotRect = computeSpotlightRect(step);
      const hasSpot = Boolean(spotRect);
      if (hasSpot !== lastTargetVisible) {
        renderCurrentStep({ firstRender: false });
      } else {
        applyDimmerAndRing(spotRect, step);
        positionBubble(spotRect, step);
      }
    }
    rafId = requestAnimationFrame(layoutLoop);
  }

  function goToStep(idx, prevStep = null) {
    if (idx >= TUTORIAL_STEPS.length) {
      finishTutorial(false, prevStep);
      return;
    }
    stepIndex = Math.max(0, idx);
    stepStartedAtMs = performance.now();
    const step = TUTORIAL_STEPS[stepIndex];
    if (onBeforeEnterStep) onBeforeEnterStep(step, prevStep, stepIndex);
    lastTargetVisible = false;
    renderCurrentStep({ firstRender: true });
  }

  function advanceNext() {
    if (!active) return;
    const curStep = TUTORIAL_STEPS[stepIndex];
    if (curStep && curStep.actionType && lastTargetVisible) {
      return; // Require real action while action spotlight target is visible
    }
    if (onSound) onSound('tutorialNext');
    goToStep(stepIndex + 1, curStep);
  }

  function finishTutorial(skipped = false, prevStep = null) {
    const leavingStep = prevStep || TUTORIAL_STEPS[stepIndex] || null;
    active = false;
    document.body.classList.remove('tutorial-canvas-passthrough');
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (rootEl) rootEl.classList.add('hidden');
    if (onSound) onSound(skipped ? 'tutorialSkip' : 'tutorialDone');
    if (onCompleteOrSkip) onCompleteOrSkip({ skipped, lastStep: leavingStep });
  }

  function start(reset = true) {
    if (reset) stepIndex = 0;
    if (onStartTutorial) onStartTutorial();
    active = true;
    hasStartedOnce = true;
    if (rootEl) rootEl.classList.remove('hidden');
    goToStep(stepIndex, null);
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(layoutLoop);
  }

  function startIfFirstTime() {
    if (hasStartedOnce) return false;
    start(true);
    return true;
  }

  function replay() {
    if (onSound) onSound('tutorialReplay');
    start(true);
  }

  function notifyAction(actionType) {
    if (!active) return false;
    const step = TUTORIAL_STEPS[stepIndex];
    if (!step || step.actionType !== actionType) return false;
    // Brief guard on camera step so stale drag events at step entry don't skip prematurely
    if (actionType === 'camera' && performance.now() - stepStartedAtMs < 180) {
      return false;
    }
    if (onSound) onSound('tutorialActionDone');
    goToStep(stepIndex + 1, step);
    return true;
  }

  if (nextBtnEl) {
    nextBtnEl.addEventListener('click', advanceNext);
  }
  if (skipBtnEl) {
    skipBtnEl.addEventListener('click', () => finishTutorial(true));
  }
  window.addEventListener('resize', () => {
    if (active) renderCurrentStep({ firstRender: true });
  });

  return {
    startIfFirstTime,
    replay,
    skip: () => finishTutorial(true),
    notifyAction,
    refresh: () => { if (active) renderCurrentStep({ firstRender: false }); },
    isActive: () => active,
    hasStarted: () => hasStartedOnce,
    getStepIndex: () => stepIndex,
    getTotalSteps: () => TUTORIAL_STEPS.length
  };
}
