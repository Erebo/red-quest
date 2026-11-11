/**
 * Opening Title Sequence (START stage part 1)
 * Local black starfield canvas, letter-by-letter "RED QUEST" reveal with red glow,
 * subtitle "READ THE LAND. SURVIVE THE RED.", click/tap/key skip, and waits for player input
 * before entering Mission Select. Respects prefers-reduced-motion.
 */

export function createIntroController({
  overlayEl,
  starCanvasEl,
  titleEl,
  subtitleEl,
  hintEl,
  onComplete,
  onSound
} = {}) {
  const TITLE_TEXT = 'RED QUEST';
  let active = false;
  let completed = false;
  let rafId = null;
  let letterTimer = null;
  let fadeTimer = null;
  let stars = [];
  let ctx = null;
  let cssW = 0;
  let cssH = 0;

  function prefersReducedMotion() {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function resizeCanvas() {
    if (!starCanvasEl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cssW = Math.max(320, window.innerWidth);
    cssH = Math.max(240, window.innerHeight);
    starCanvasEl.width = Math.round(cssW * dpr);
    starCanvasEl.height = Math.round(cssH * dpr);
    starCanvasEl.style.width = `${cssW}px`;
    starCanvasEl.style.height = `${cssH}px`;
    ctx = starCanvasEl.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initStars() {
    stars = [];
    let seed = 133742;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const count = 170;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(),
        y: rand(),
        r: 0.6 + rand() * 1.55,
        alpha: 0.3 + rand() * 0.65,
        phase: rand() * Math.PI * 2,
        speed: 0.8 + rand() * 2.2
      });
    }
  }

  function drawStars(nowSec) {
    if (!ctx) return;
    ctx.fillStyle = '#030407';
    ctx.fillRect(0, 0, cssW, cssH);
    const reduced = prefersReducedMotion();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const twinkle = reduced ? 1.0 : (0.65 + 0.35 * Math.sin(nowSec * s.speed + s.phase));
      ctx.globalAlpha = s.alpha * twinkle;
      ctx.fillStyle = i % 9 === 0 ? '#ffd2b3' : '#e6eefc';
      ctx.beginPath();
      ctx.arc(s.x * cssW, s.y * cssH, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function stepStars(nowMs) {
    if (!active) return;
    drawStars(nowMs * 0.001);
    if (!prefersReducedMotion()) {
      rafId = requestAnimationFrame(stepStars);
    }
  }

  function buildTitleSpans(instantVisible) {
    if (!titleEl) return [];
    titleEl.innerHTML = '';
    const spans = [];
    for (const ch of TITLE_TEXT) {
      const span = document.createElement('span');
      span.className = 'intro-char' + (ch === ' ' ? ' space' : '') + (instantVisible ? ' revealed' : '');
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      titleEl.appendChild(span);
      spans.push(span);
    }
    return spans;
  }

  function clearTimers() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (letterTimer !== null) {
      clearInterval(letterTimer);
      letterTimer = null;
    }
    if (fadeTimer !== null) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  function bindSkipListeners() {
    window.addEventListener('keydown', handleSkipInput, true);
    if (overlayEl) {
      overlayEl.addEventListener('pointerdown', handleSkipInput);
      overlayEl.addEventListener('touchstart', handleSkipInput, { passive: true });
      overlayEl.addEventListener('click', handleSkipInput);
    }
    window.addEventListener('resize', resizeCanvas);
  }

  function unbindSkipListeners() {
    window.removeEventListener('keydown', handleSkipInput, true);
    if (overlayEl) {
      overlayEl.removeEventListener('pointerdown', handleSkipInput);
      overlayEl.removeEventListener('touchstart', handleSkipInput);
      overlayEl.removeEventListener('click', handleSkipInput);
    }
    window.removeEventListener('resize', resizeCanvas);
  }

  function revealAllImmediately() {
    if (titleEl) {
      titleEl.querySelectorAll('.intro-char').forEach(sp => sp.classList.add('revealed'));
    }
    if (subtitleEl) subtitleEl.classList.add('visible');
    if (hintEl) {
      hintEl.textContent = 'Click or press any key to begin';
      hintEl.classList.remove('hidden');
      hintEl.classList.add('ready');
    }
  }

  function finish(skipped = false) {
    if (completed || !active) return;
    completed = true;
    active = false;
    clearTimers();
    unbindSkipListeners();

    if (onSound) onSound(skipped ? 'introSkip' : 'introAdvance');

    if (overlayEl) {
      overlayEl.classList.add('fade-out');
      const fadeMs = prefersReducedMotion() ? 120 : 240;
      fadeTimer = setTimeout(() => {
        overlayEl.classList.add('hidden');
        overlayEl.classList.remove('fade-out');
        if (onComplete) onComplete({ skipped });
      }, fadeMs);
    } else if (onComplete) {
      onComplete({ skipped });
    }
  }

  function handleSkipInput(e) {
    if (!active || completed) return;
    if (e && e.type === 'keydown') {
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
    }
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    revealAllImmediately();
    finish(true);
  }

  function start() {
    clearTimers();
    unbindSkipListeners();
    active = true;
    completed = false;

    const reduced = prefersReducedMotion();
    initStars();
    resizeCanvas();
    drawStars(0);
    if (!reduced) {
      rafId = requestAnimationFrame(stepStars);
    }

    if (subtitleEl) {
      subtitleEl.textContent = 'READ THE LAND. SURVIVE THE RED.';
      subtitleEl.classList.toggle('visible', reduced);
    }
    if (hintEl) {
      hintEl.textContent = 'Click or press any key to begin';
      hintEl.classList.remove('hidden');
      hintEl.classList.toggle('ready', reduced);
    }

    const spans = buildTitleSpans(reduced);

    if (overlayEl) {
      overlayEl.classList.remove('hidden', 'fade-out');
    }

    bindSkipListeners();

    // Never auto-advance: wait for player click, tap, or key press
    if (reduced) {
      revealAllImmediately();
      return;
    }

    let idx = 0;
    letterTimer = setInterval(() => {
      if (!active) return;
      if (idx < spans.length) {
        spans[idx].classList.add('revealed');
        idx++;
        if (idx >= spans.length) {
          clearInterval(letterTimer);
          letterTimer = null;
          revealAllImmediately();
        }
      } else {
        clearInterval(letterTimer);
        letterTimer = null;
        revealAllImmediately();
      }
    }, 95);
  }

  function skip() {
    if (!active) return;
    revealAllImmediately();
    finish(true);
  }

  function dispose() {
    active = false;
    completed = true;
    clearTimers();
    unbindSkipListeners();
    if (overlayEl) {
      overlayEl.classList.add('hidden');
      overlayEl.classList.remove('fade-out');
    }
  }

  return {
    start,
    skip,
    dispose,
    isActive: () => active
  };
}
