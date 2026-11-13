/**
 * Open-World / Sandbox GPS Navigation HUD.
 *
 * Replaces cartoon bubbles with a tactical open-world HUD inspired by GTA V:
 * - Prominent corner GPS radar minimap showing the terrain corridor, locked route,
 *   rover blip, destination waypoint and detected POI blips with 500m radius.
 * - Subtle, compact digital speedometer & power/slope gauges docked to the radar.
 * - Clean top mission navigation bar with distance and dynamic bearing arrow.
 * - Clean mission exploration card tracking sites and science score.
 * - Contextual prompt with sleek keycap styling.
 *
 * Provenance: distance to destination and nearby-site distances are MEASURED
 * (DEM-derived coordinates); speed and power are SIM; the score is GAME.
 */

function formatDistance(metres) {
  if (!Number.isFinite(metres)) return '—';
  return metres >= 1000
    ? `${(metres / 1000).toFixed(2)} KM`
    : `${Math.round(metres)} M`;
}

function normaliseAngle(radians) {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class RoverHUD {
  constructor(options = {}) {
    this.container = document.getElementById('rover-hud');
    this.onWarningAlert = options.onWarningAlert || null;

    // Top Nav Bar
    this.goalDist = document.getElementById('hud-goal-dist');
    this.goalArrow = document.getElementById('hud-goal-arrow');
    this.navDestTitle = document.getElementById('hud-nav-dest-title');
    this.finishBtn = document.getElementById('btn-finish-drive');

    // Radar Minimap
    this.radarCanvas = document.getElementById('hud-radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;
    this.compassText = document.getElementById('hud-compass-text');
    this.activeRoute = null;

    // Telemetry
    this.speedVal = document.getElementById('hud-speed-val');
    this.batteryVal = document.getElementById('hud-battery-val');
    this.batteryBar = document.getElementById('hud-battery-bar');
    this.slopeVal = document.getElementById('hud-slope-val');
    this.slopeBar = document.getElementById('hud-slope-bar');

    // Mission Score Card
    this.scienceScore = document.getElementById('hud-science-score');
    this.targetsCount = document.getElementById('hud-targets-count');
    this.missionFill = document.getElementById('hud-mission-fill');

    // Context Action Prompt
    this.actionPrompt = document.getElementById('hud-action-prompt');
    this.actionText = document.getElementById('hud-action-text');
    this.actionProgress = document.getElementById('hud-action-progress');
    this.actionFill = document.getElementById('hud-action-fill');

    // Tactical POI Feed
    this.scannerList = document.getElementById('hud-scanner-list');
    this.hazardBanner = document.getElementById('hud-hazard-banner');
    this.hazardText = document.getElementById('hud-hazard-text');
    this.familyColor = {
      hazard: '#e07a5f',
      resource: '#35a97c',
      science: '#2ba4b8',
      mystery: '#f2b84b'
    };

    // Center screen typography alert (pure text response, no panel/window)
    this.centerAlert = document.getElementById('hud-center-alert');
    this.centerTitle = document.getElementById('hud-center-title');
    this.centerSubtitle = document.getElementById('hud-center-subtitle');
    this.centerAlertTimer = null;
    this._lastDustSlowTime = 0;

    // Persistent Bubbly Controls Prompt at Bottom-Middle
    this.controlsBubble = document.getElementById('hud-controls-bubble');
    this._controlsBubbleTimer = null;

    // Toast notification
    this.toast = document.getElementById('planner-toast');
    this.toastTimer = null;
    this._scannerLastUpdate = 0;
  }

  show() {
    if (this.container) this.container.classList.remove('hidden');
    if (this.controlsBubble) {
      this.controlsBubble.classList.add('intro-pop');
      if (this._controlsBubbleTimer) clearTimeout(this._controlsBubbleTimer);
      // After 5 seconds of large popping intro, transition to slightly less large persistent bubble
      this._controlsBubbleTimer = setTimeout(() => {
        if (this.controlsBubble) this.controlsBubble.classList.remove('intro-pop');
      }, 5000);
    }
  }

  hide() {
    if (this.container) this.container.classList.add('hidden');
    if (this._controlsBubbleTimer) {
      clearTimeout(this._controlsBubbleTimer);
      this._controlsBubbleTimer = null;
    }
  }

  setRoute(route) {
    this.activeRoute = route;
  }

  showCenterAlert(title, subtitle, durationMs = 3800, isDust = false) {
    if (!this.centerAlert || !this.centerTitle || !this.centerSubtitle) return;
    this.centerTitle.textContent = title;
    this.centerSubtitle.textContent = subtitle;
    this.centerAlert.classList.toggle('dust-storm', Boolean(isDust));
    this.centerAlert.classList.remove('hidden');

    if (isDust && this.onWarningAlert) {
      this.onWarningAlert();
    }

    // Trigger restart of pop animation
    this.centerAlert.style.animation = 'none';
    void this.centerAlert.offsetWidth;
    this.centerAlert.style.animation = '';

    if (this.centerAlertTimer) clearTimeout(this.centerAlertTimer);
    this.centerAlertTimer = setTimeout(() => {
      if (this.centerAlert) this.centerAlert.classList.add('hidden');
    }, durationMs);
  }

  showToast(message, durationMs = 3000) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.classList.add('hidden');
    }, durationMs);
  }

  renderRadarMinimap(physics, interactions, worldProps) {
    if (!this.radarCtx || !this.radarCanvas) return;
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 4;
    const radarRadiusM = 450.0; // 450 meters visible range

    ctx.clearRect(0, 0, w, h);

    // 1. Radar background circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // Cozy warm slate radar background
    ctx.fillStyle = '#1c1714';
    ctx.fillRect(0, 0, w, h);

    // Warm radial glow in radar center
    const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
    bgGrad.addColorStop(0, 'rgba(255, 235, 204, 0.08)');
    bgGrad.addColorStop(0.7, 'rgba(46, 32, 24, 0.45)');
    bgGrad.addColorStop(1, 'rgba(24, 16, 12, 0.9)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Range rings (warm peach/gold rings)
    ctx.strokeStyle = 'rgba(242, 184, 75, 0.22)';
    ctx.lineWidth = 1.5;
    [0.33, 0.66, 1.0].forEach(f => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.strokeStyle = 'rgba(242, 184, 75, 0.16)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    // Rotating view coordinates relative to rover heading (Head-Up GPS Radar)
    // Rover forward vector in world space: (sin(H), cos(H)) where +Y is North, +X is East.
    // Rover right vector in world space: (cos(H), -sin(H)).
    // For any world delta (dx, dy), projecting into rover frame:
    // localAhead = dx * sin(H) + dy * cos(H)  -> maps to screen -Y (Up)
    // localRight = dx * cos(H) - dy * sin(H)  -> maps to screen +X (Right)
    const sinH = Math.sin(physics.heading);
    const cosH = Math.cos(physics.heading);

    const worldToRadar = (wx, wy) => {
      const dx = wx - physics.x;
      const dy = wy - physics.y;
      const localRight = dx * cosH - dy * sinH;
      const localAhead = dx * sinH + dy * cosH;
      const rx = localRight * (r / radarRadiusM);
      const ry = -localAhead * (r / radarRadiusM);
      return { rx: cx + rx, ry: cy + ry };
    };

    // 2. Draw Active Route Line if available
    if (this.activeRoute && this.activeRoute.waypoints && this.activeRoute.waypoints.length > 1) {
      ctx.strokeStyle = '#f2b84b';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(242, 184, 75, 0.6)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      let started = false;
      this.activeRoute.waypoints.forEach(wp => {
        const p = worldToRadar(wp.x, wp.y);
        if (!started) {
          ctx.moveTo(p.rx, p.ry);
          started = true;
        } else {
          ctx.lineTo(p.rx, p.ry);
        }
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 3. Draw World POI Blips within Radar
    if (worldProps && worldProps.elements) {
      worldProps.elements.forEach(el => {
        const p = worldToRadar(el.x, el.y);
        const distSq = (p.rx - cx) * (p.rx - cx) + (p.ry - cy) * (p.ry - cy);
        if (distSq <= r * r) {
          const col = this.familyColor[el.family] || '#5aa9a3';
          ctx.fillStyle = col;
          ctx.strokeStyle = '#fffaf2';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          if (el.family === 'hazard') {
            // Triangle for hazard
            ctx.moveTo(p.rx, p.ry - 5);
            ctx.lineTo(p.rx - 4.5, p.ry + 4.5);
            ctx.lineTo(p.rx + 4.5, p.ry + 4.5);
            ctx.closePath();
          } else {
            ctx.arc(p.rx, p.ry, 4.5, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.stroke();
        }
      });
    }

    // 4. Draw Goal / Destination Marker
    if (interactions && interactions.goal) {
      const gp = worldToRadar(interactions.goal.x, interactions.goal.y);
      const dx = gp.rx - cx;
      const dy = gp.ry - cy;
      const dist = Math.hypot(dx, dy);

      ctx.save();
      if (dist <= r - 7) {
        // Draw inside radar with friendly gold star/circle
        ctx.fillStyle = '#ff7b54';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gp.rx, gp.ry, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Clamped beacon to perimeter
        const angle = Math.atan2(dy, dx);
        const px = cx + Math.cos(angle) * (r - 7);
        const py = cy + Math.sin(angle) * (r - 7);
        ctx.fillStyle = '#ff7b54';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Draw Player Rover Blip (Center, pointing straight up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e07a5f';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(224, 122, 95, 0.7)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5.5, 6);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // end clip

    // Radar Perimeter Bezel Ring
    ctx.strokeStyle = '#e6cdaf';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // North Indicator Tick on Radar Perimeter (shows true North relative to rover heading)
    const northAngle = -physics.heading; // angle in radians from top (0 = North)
    const northX = cx + Math.sin(northAngle) * (r - 2);
    const northY = cy - Math.cos(northAngle) * (r - 2);
    ctx.save();
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(northX, northY, 4.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Radar Heading Cardinal indicator
    if (this.compassText) {
      let deg = (physics.heading * 180.0) / Math.PI;
      deg = (deg % 360 + 360) % 360;
      const idx = Math.round(deg / 45) % 8;
      this.compassText.textContent = `${CARDINALS[idx]} ${Math.round(deg)}°`;
    }
  }

  update(physics, interactions, inputState, worldProps) {
    if (!this.container || this.container.classList.contains('hidden')) return;

    // 1. Digital Speedometer (SIM)
    const kmh = physics.getSpeedKmh();
    if (this.speedVal) this.speedVal.textContent = `${Math.round(kmh)}`;

    // 2. Battery & Power (SIM)
    const bat = Math.max(0, Math.min(100, physics.batteryPct));
    if (this.batteryVal) this.batteryVal.textContent = `${Math.round(bat)}%`;
    if (this.batteryBar) {
      this.batteryBar.style.width = `${bat}%`;
      this.batteryBar.style.background = bat < 15 ? '#ef4444' : (bat < 30 ? '#f59e0b' : '#10b981');
    }

    // 2b. Slope Telemetry (MEASURED)
    const slope = physics.slopeDeg || 0.0;
    if (this.slopeVal) this.slopeVal.textContent = `${slope.toFixed(1)}°`;
    if (this.slopeBar) {
      const slopePct = Math.min(100, (slope / 35.0) * 100);
      this.slopeBar.style.width = `${slopePct}%`;
      this.slopeBar.style.background = slope > 25 ? '#ef4444' : (slope >= 15 ? '#f59e0b' : '#38bdf8');
    }

    // 3. Navigation Bar: Distance + Relative Heading Arrow (MEASURED)
    if (interactions) {
      if (this.goalDist) this.goalDist.textContent = formatDistance(interactions.distanceToGoal);

      if (this.goalArrow && interactions.goal) {
        const dx = interactions.goal.x - physics.x;
        const dy = interactions.goal.y - physics.y;
        const rel = normaliseAngle(Math.atan2(dx, dy) - physics.heading);
        this.goalArrow.style.transform = `rotate(${(rel * 180.0) / Math.PI}deg)`;
      }

      // 4. Mission Score Card (GAME)
      if (this.scienceScore) this.scienceScore.textContent = `${interactions.scienceScore}`;
      if (this.targetsCount) {
        this.targetsCount.textContent = `${interactions.discoveredCount} / ${interactions.totalPoiCount} SITES`;
      }
      if (this.missionFill && interactions.totalPoiCount > 0) {
        const prog = (interactions.discoveredCount / interactions.totalPoiCount) * 100;
        this.missionFill.style.width = `${Math.min(100, prog)}%`;
      }

      // 5. Context Action Prompt
      if (interactions.activePrompt) {
        if (this.actionPrompt) this.actionPrompt.classList.remove('hidden');
        if (this.actionText) this.actionText.textContent = interactions.activePrompt;
        if (interactions.isPerformingAction) {
          if (this.actionProgress) this.actionProgress.classList.remove('hidden');
          if (this.actionFill) this.actionFill.style.width = `${Math.round(interactions.actionProgress * 100)}%`;
        } else if (this.actionProgress) {
          this.actionProgress.classList.add('hidden');
        }
      } else if (this.actionPrompt) {
        this.actionPrompt.classList.add('hidden');
      }
    }

    // 6. GPS Radar Minimap Frame
    this.renderRadarMinimap(physics, interactions, worldProps);

    // 7. Tactical POI Feed & Hazard Alert
    if (worldProps) {
      const nearby = worldProps.getNearest(4);
      const nowMs = performance.now();
      if (this.scannerList && nowMs - this._scannerLastUpdate > 200) {
        this._scannerLastUpdate = nowMs;
        if (nearby.length === 0) {
          this.scannerList.innerHTML = '<li class="hud-scanner-empty">SECTOR CLEAR</li>';
        } else {
          this.scannerList.innerHTML = nearby.map(n => {
            const color = this.familyColor[n.family] || '#06b6d4';
            const el = n.element;
            const label = el.family === 'mystery'
              ? (el.mysteryRevealed ? el.name : 'UNIDENTIFIED ANOMALY')
              : (el.shortLabel || el.name || el.type).toUpperCase();
            const deg = (n.bearingRel * 180.0) / Math.PI;
            return `<li class="hud-scanner-row">
              <span class="hud-scanner-dot" style="background:${color}; box-shadow: 0 0 6px ${color};"></span>
              <span class="hud-scanner-name" title="${label}">${label}</span>
              <span class="hud-scanner-dist">${formatDistance(n.distanceM)}<span class="hud-scanner-arrow" style="transform:rotate(${deg.toFixed(1)}deg)"></span></span>
            </li>`;
          }).join('');
        }
      }

      const hazard = worldProps.getNearestHazard();
      if (this.hazardBanner && this.hazardText) {
        const inRange = hazard && hazard.distanceM <= 50.0;
        this.hazardBanner.classList.toggle('hidden', !inRange);
        if (inRange) {
          const name = (hazard.element.shortLabel || hazard.element.name || 'Hazard').toUpperCase();
          const verb = hazard.distanceM <= 28.0 ? 'IMMINENT' : 'AHEAD';
          const text = `${name} · ${Math.round(hazard.distanceM)}M · ${verb}`;
          if (this.hazardText.textContent !== text) this.hazardText.textContent = text;
        }
      }

      // Check Dust Storm / Silt Slowdown Response
      if (physics && (physics.isDustSlowdown || (physics.isHazardSlowdown && hazard && hazard.element.type === 'dust_devil_corridor'))) {
        const nowSec = performance.now() / 1000.0;
        if (nowSec - this._lastDustSlowTime > 9.0) {
          this._lastDustSlowTime = nowSec;
          this.showCenterAlert(
            '⚠ DUST STORM ENCOUNTERED!',
            'Heavy swirling dust particles are reducing wheel traction & speed.',
            4000,
            true
          );
        }
      }
    }
  }
}
