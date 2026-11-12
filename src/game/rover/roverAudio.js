/**
 * Explore-mode rover audio.
 *
 * - docs/noise-vehicle-interior.mp3 : persistent cabin/interior ambience
 * - docs/gravel-road.mp3           : wheel-on-gravel loop, speed driven
 *
 * Both files are bundled by Vite from the docs folder. The gravel loop fades
 * in only while the rover is actually moving, fades out and hard-stops when it
 * stops, and always restarts from the beginning on the next drive.
 */

const INTERIOR_SRC = new URL('../../../docs/noise-vehicle-interior.mp3', import.meta.url).href;
const DRIVE_SRC = new URL('../../../docs/gravel-road.mp3', import.meta.url).href;
const LEVEL_UP_SRC = new URL('../../../docs/level-up.mp3', import.meta.url).href;

const clamp01 = v => Math.max(0, Math.min(1, v));

function createLoop(src) {
  const audio = new Audio();
  audio.src = src;
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;
  return audio;
}

export class RoverAudio {
  constructor() {
    this.interior = createLoop(INTERIOR_SRC);
    this.drive = createLoop(DRIVE_SRC);

    // One-shot reward sting played after a scan/drill progress bar completes.
    this.levelUp = new Audio();
    this.levelUp.src = LEVEL_UP_SRC;
    this.levelUp.loop = false;
    this.levelUp.preload = 'auto';
    this.levelUp.volume = 0.65;

    this.active = false;
    this._fadeTimer = null;
    this._unlockBound = false;
    this._isDriving = false;

    // Autoplay policies can reject the first play() until the page has a user
    // gesture. The mission start click normally unlocks us; this retries safely.
    this._unlock = () => {
      if (!this.active) return;
      this._startInterior();
      if (this._isDriving) this._startDrive();
    };
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
    this._unlockBound = true;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.interior.pause();
        this.drive.pause();
        this.levelUp.pause();
      } else if (this.active) {
        this._startInterior();
        if (this._isDriving) this._startDrive();
      }
    });
  }

  setActive(active) {
    if (active === this.active) {
      if (active) this._startInterior();
      return;
    }
    this.active = active;

    if (active) {
      this._cancelFade();
      this._startInterior();
    } else {
      this._isDriving = false;
      this._fadeOutAndStop(0.4);
    }
  }

  /**
   * Per-frame mix update.
   * @param {number} dt seconds
   * @param {object} physics RoverPhysics instance
   */
  update(dt, physics) {
    if (!this.active || !physics) return;

    const speedKmh = Math.abs(physics.getSpeedKmh());
    const maxKmh = Math.max(1, physics.maxForwardSpeed * 3.6);
    const speedFrac = clamp01(speedKmh / maxKmh);
    const moving = speedKmh > 0.7;

    // Persistent interior noise: a quiet cabin bed that lifts slightly with speed.
    this._approach(this.interior, 0.12 + speedFrac * 0.05, dt, 1.6);

    if (moving) {
      this._isDriving = true;
      if (this.drive.paused) this._startDrive();
      // A little pitch variation keeps the gravel loop from sounding static.
      this.drive.playbackRate = 0.82 + speedFrac * 0.5;
      this._approach(this.drive, 0.12 + Math.pow(speedFrac, 0.7) * 0.55, dt, 3.2);
    } else {
      this._isDriving = false;
      this._approach(this.drive, 0, dt, 5.0);
      if (this.drive.volume <= 0.004 && !this.drive.paused) {
        this._stopDrive();
      }
    }
  }

  /**
   * Play the one-shot reward sting after an interaction completes.
   */
  playLevelUp() {
    if (!this.active) return;
    try { this.levelUp.currentTime = 0; } catch (e) { /* not seekable yet */ }
    const p = this.levelUp.play();
    if (p && p.catch) p.catch(() => { /* wait for user gesture */ });
  }

  _startInterior() {
    if (!this.interior.paused) return;
    const p = this.interior.play();
    if (p && p.catch) p.catch(() => { /* wait for user gesture */ });
  }

  _startDrive() {
    if (!this.drive.paused) return;
    // Restart from a clean head every time the rover pulls away.
    try { this.drive.currentTime = 0; } catch (e) { /* not seekable yet */ }
    this.drive.volume = 0;
    const p = this.drive.play();
    if (p && p.catch) p.catch(() => { /* wait for user gesture */ });
  }

  _stopDrive() {
    this.drive.pause();
    try { this.drive.currentTime = 0; } catch (e) { /* ignore */ }
    this.drive.volume = 0;
  }

  _approach(audio, target, dt, rate) {
    const diff = target - audio.volume;
    if (Math.abs(diff) < 0.0005) return;
    const step = Math.min(Math.abs(diff), rate * dt);
    audio.volume = clamp01(audio.volume + Math.sign(diff) * step);
  }

  _fadeOutAndStop(durationSec) {
    this._cancelFade();
    const start = performance.now();
    const startInterior = this.interior.volume;
    const startDrive = this.drive.volume;
    const durationMs = Math.max(1, durationSec * 1000);

    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      this.interior.volume = startInterior * (1 - t);
      this.drive.volume = startDrive * (1 - t);
      if (t >= 1) {
        this._cancelFade();
        this.interior.pause();
        this.drive.pause();
        try { this.drive.currentTime = 0; } catch (e) { /* ignore */ }
      }
    };

    this._fadeTimer = setInterval(tick, 33);
    tick();
  }

  _cancelFade() {
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
  }
}
