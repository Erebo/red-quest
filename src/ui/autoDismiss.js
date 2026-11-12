/**
 * Shared Transient Popup Auto-Dismiss Manager
 *
 * Rules:
 * - Starts a 3.5 s (default) timer when a popup appears.
 * - Hovering or focusing inside the popup pauses the timer; leaving restarts a fresh timer.
 * - On expiry, fades out over 250 ms, then removes the element from the DOM.
 * - Optional close button (`X`) closes immediately.
 * - Opening a new popup of the same `kind` replaces the prior popup of that `kind`.
 * - At most 3 transient popups are visible simultaneously (oldest closes first).
 * - Automatically offsets overlapping popups so they never cover one another.
 */

const MAX_ACTIVE_POPUPS = 3;
const DEFAULT_DURATION_MS = 3500;
const FADE_DURATION_MS = 250;

const activeEntries = [];
const parentRegistry = new WeakMap();

function rememberParent(el) {
  if (el && el.parentElement && !parentRegistry.has(el)) {
    parentRegistry.set(el, el.parentElement);
  }
}

export function ensurePopupInDom(el) {
  if (!el) return;
  if (el.isConnected) {
    rememberParent(el);
    return;
  }
  const parent = parentRegistry.get(el) || document.body;
  if (parent) parent.appendChild(el);
}

function rectsOverlap(a, b, pad = 8) {
  return (
    a.left - pad < b.right &&
    a.right + pad > b.left &&
    a.top - pad < b.bottom &&
    a.bottom + pad > b.top
  );
}

function resolveNonOverlappingPosition(el, offsetMode) {
  if (!el || !el.isConnected) return;
  if (offsetMode === 'cssVar') {
    el.style.setProperty('--ad-offset-x', '0px');
    el.style.setProperty('--ad-offset-y', '0px');
  }
  const selfRect = el.getBoundingClientRect();
  if (!selfRect || selfRect.width <= 0 || selfRect.height <= 0) return;

  const otherRects = [];
  for (let i = 0; i < activeEntries.length; i++) {
    const other = activeEntries[i].el;
    if (!other || other === el || !other.isConnected) continue;
    const r = other.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) {
      otherRects.push(r);
    }
  }
  if (!otherRects.length) return;

  let cur = {
    left: selfRect.left,
    right: selfRect.right,
    top: selfRect.top,
    bottom: selfRect.bottom,
    width: selfRect.width,
    height: selfRect.height
  };

  let dx = 0;
  let dy = 0;
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const blocker = otherRects.find(r => rectsOverlap(cur, r, 8));
    if (!blocker) break;

    const shiftDown = blocker.bottom + 10 - cur.top;
    const shiftUp = blocker.top - 10 - cur.bottom;
    let appliedY = shiftDown;
    if (cur.top + shiftDown + cur.height > window.innerHeight - 12 && cur.top + shiftUp >= 48) {
      appliedY = shiftUp;
    }
    dy += appliedY;
    cur.top += appliedY;
    cur.bottom += appliedY;

    // If clamping vertically wasn't enough, shift left horizontally
    if (cur.top < 44 || cur.bottom > window.innerHeight - 10) {
      const shiftX = -(blocker.width + 12);
      if (cur.left + shiftX >= 10) {
        dx += shiftX;
        cur.left += shiftX;
        cur.right += shiftX;
        dy -= appliedY;
        cur.top -= appliedY;
        cur.bottom -= appliedY;
      }
    }
  }

  if (dx === 0 && dy === 0) return;

  if (offsetMode === 'cssVar') {
    el.style.setProperty('--ad-offset-x', `${Math.round(dx)}px`);
    el.style.setProperty('--ad-offset-y', `${Math.round(dy)}px`);
  } else {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'absolute') {
      const targetLeft = Math.max(8, Math.min(window.innerWidth - selfRect.width - 8, selfRect.left + dx));
      const targetTop = Math.max(44, Math.min(window.innerHeight - selfRect.height - 8, selfRect.top + dy));
      el.style.left = `${Math.round(targetLeft)}px`;
      el.style.top = `${Math.round(targetTop)}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
    }
  }
}

function teardownEntry(entry, { removeEl = true, invokeCallback = true } = {}) {
  const idx = activeEntries.indexOf(entry);
  if (idx !== -1) activeEntries.splice(idx, 1);

  clearTimeout(entry.timerId);
  clearTimeout(entry.fadeTimerId);
  entry.timerId = null;
  entry.fadeTimerId = null;

  const { el, handlers, prevTransition, prevOpacity } = entry;
  if (el) {
    el.removeEventListener('mouseenter', handlers.onEnter);
    el.removeEventListener('mouseleave', handlers.onLeave);
    el.removeEventListener('focusin', handlers.onEnter);
    el.removeEventListener('focusout', handlers.onLeave);
    if (entry.closeBtn && handlers.onCloseClick) {
      entry.closeBtn.removeEventListener('click', handlers.onCloseClick);
    }
    el.style.transition = prevTransition;
    el.style.opacity = prevOpacity;
    el.classList.remove('ad-fading');
    if (removeEl && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  if (invokeCallback && typeof entry.onClose === 'function') {
    entry.onClose(el);
  }
}

/**
 * Dismiss any active popup matching `kind` (or a specific element).
 */
export function dismissPopupByKind(kind, opts = {}) {
  for (let i = activeEntries.length - 1; i >= 0; i--) {
    if (activeEntries[i].kind === kind) {
      teardownEntry(activeEntries[i], {
        removeEl: opts.removeEl !== false,
        invokeCallback: opts.invokeCallback !== false
      });
    }
  }
}

export function cancelAutoDismiss(el, { removeEl = false, invokeCallback = false } = {}) {
  for (let i = activeEntries.length - 1; i >= 0; i--) {
    if (activeEntries[i].el === el) {
      teardownEntry(activeEntries[i], { removeEl, invokeCallback });
    }
  }
}

export function clearAllAutoDismiss() {
  while (activeEntries.length > 0) {
    teardownEntry(activeEntries[0], { removeEl: true, invokeCallback: true });
  }
}

/**
 * Attach shared auto-dismiss lifecycle to a transient popup element.
 */
export function autoDismiss(
  element,
  {
    ms = DEFAULT_DURATION_MS,
    kind = 'default',
    closeBtn = null,
    offsetMode = 'position',
    onClose = null
  } = {}
) {
  if (!element) return null;

  // Ensure parent is remembered before any DOM removal, and re-attach if previously removed
  rememberParent(element);
  ensurePopupInDom(element);

  // Cancel any prior timer attached to this exact element without firing stale removal
  cancelAutoDismiss(element, { removeEl: false, invokeCallback: false });

  // Replace previous popup of the exact same kind (never stack same kind)
  if (kind) {
    for (let i = activeEntries.length - 1; i >= 0; i--) {
      if (activeEntries[i].kind === kind && activeEntries[i].el !== element) {
        teardownEntry(activeEntries[i], { removeEl: true, invokeCallback: true });
      }
    }
  }

  // Enforce global maximum of 3 simultaneous transient popups (oldest closes first)
  while (activeEntries.length >= MAX_ACTIVE_POPUPS) {
    teardownEntry(activeEntries[0], { removeEl: true, invokeCallback: true });
  }

  const entry = {
    el: element,
    kind,
    closeBtn,
    onClose,
    timerId: null,
    fadeTimerId: null,
    prevTransition: element.style.transition || '',
    prevOpacity: element.style.opacity || '',
    handlers: {}
  };

  element.classList.remove('hidden', 'ad-fading');
  element.style.opacity = '1';

  function startFadeOut() {
    if (!activeEntries.includes(entry)) return;
    entry.fadeTimerId = null;
    element.classList.add('ad-fading');
    element.style.transition = `opacity ${FADE_DURATION_MS}ms ease`;
    element.style.opacity = '0';
    entry.fadeTimerId = setTimeout(() => {
      teardownEntry(entry, { removeEl: true, invokeCallback: true });
    }, FADE_DURATION_MS);
  }

  function armTimer() {
    clearTimeout(entry.timerId);
    clearTimeout(entry.fadeTimerId);
    entry.fadeTimerId = null;
    element.classList.remove('ad-fading');
    element.style.opacity = '1';
    entry.timerId = setTimeout(startFadeOut, ms);
  }

  function pauseTimer() {
    clearTimeout(entry.timerId);
    clearTimeout(entry.fadeTimerId);
    entry.timerId = null;
    entry.fadeTimerId = null;
    element.classList.remove('ad-fading');
    element.style.opacity = '1';
  }

  entry.handlers.onEnter = () => pauseTimer();
  entry.handlers.onLeave = () => {
    const hovered = element.matches(':hover');
    const focused = element.contains(document.activeElement);
    if (!hovered && !focused) {
      armTimer();
    }
  };
  entry.handlers.onCloseClick = e => {
    if (e) e.stopPropagation();
    teardownEntry(entry, { removeEl: true, invokeCallback: true });
  };

  element.addEventListener('mouseenter', entry.handlers.onEnter);
  element.addEventListener('mouseleave', entry.handlers.onLeave);
  element.addEventListener('focusin', entry.handlers.onEnter);
  element.addEventListener('focusout', entry.handlers.onLeave);
  if (closeBtn) {
    closeBtn.addEventListener('click', entry.handlers.onCloseClick);
  }

  activeEntries.push(entry);
  resolveNonOverlappingPosition(element, offsetMode);
  armTimer();

  return {
    dismiss: () => teardownEntry(entry, { removeEl: true, invokeCallback: true }),
    restart: () => armTimer(),
    pause: () => pauseTimer()
  };
}
