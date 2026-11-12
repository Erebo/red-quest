/**
 * Game Configuration — Walking Speeds, Route Calculator Sliders, Accuracy Bands & Scoring.
 * Mirrors existing travel-time simulation parameters from docs/SIMULATED_DATA.md & src/routeWorker.js
 * without altering worker or route scoring logic.
 */

export const UI_DESIGN_TOKENS = Object.freeze({
  primaryBtnHeightPx: 48,
  toolBtnHeightPx: 44,
  iconSizePx: 24,
  bodyFontSizePx: 14,
  headingFontSizePx: 18,
  radiusSmPx: 8,
  radiusMdPx: 12,
  accents: Object.freeze({
    primary: '#e67e22',
    survey: '#38bdf8',
    confirm: '#22c55e',
    warn: '#f59e0b'
  })
});

/**
 * Subtle UI sound hook placeholder (no audio assets loaded yet).
 * @param {string} _eventName
 * @param {object} [_meta]
 */
export function playUiSound(_eventName, _meta) {
  // Intentional no-op placeholder until audio feedback assets are added.
}

export const WALKING_SPEED_CONFIG = Object.freeze({
  flatCruiseSpeedMPerH: 100.0,
  flatCruiseSpeedKmPerH: 0.10,
  verticalClimbRateMPerH: 20.0,
  slopeSlowdownStartDeg: 15.0,
  slopeSlowdownSpanDeg: 10.0,
  slopePenaltyFactor: 0.40,
  minSlopeEfficiency: 0.20,
  disclaimer: 'mission estimate (0.10 km/h flat cruise, 20 m/h vertical climb) — not a real EVA time'
});

export const PLANNER_ACCURACY_BANDS = Object.freeze({
  sharpMaxErrPct: 10.0,
  closeMaxErrPct: 25.0,
  labels: Object.freeze({
    sharp: 'Sharp',
    close: 'Close',
    off: 'Off',
    skipped: 'Skipped'
  })
});

export const PLANNING_SCORE_CONFIG = Object.freeze({
  sharp: 10,
  close: 5,
  off: 0,
  skipped: 0,
  maxPerEstimate: 10
});

export const SURVEY_SCAN_BUDGET = 8;

export const SURVEY_CONFIG = Object.freeze({
  routeScanBudget: SURVEY_SCAN_BUDGET,
  sampleSpacingM: 10.0,
  radiusM: 150.0,
  maxElementScore: 100,
  identMaxScore: 40,
  elementAccuracyMaxScore: 60,
  maxHazardScore: 100,
  accuracyFullErrPct: 10.0,
  accuracyZeroErrPct: 50.0,
  steepZoneThresholdDeg: 15.0
});

// GAME model weights for composite Hazard Index (0–100); never shown before lock-in.
export const HAZARD_INDEX_WEIGHTS = Object.freeze({
  wSteepPct: 1.4,
  wModPct: 0.55,
  wHazardElements: 7.5,
  wDustPct: 0.45
});

export const SURVEY_RANK_THRESHOLDS = Object.freeze([
  Object.freeze({ minScore: 150, label: 'Mission Lead' }),
  Object.freeze({ minScore: 85, label: 'Surveyor' }),
  Object.freeze({ minScore: 0, label: 'Rookie' })
]);

export const ROUTE_CALC_FIELDS = Object.freeze([
  Object.freeze({
    key: 'distKm',
    label: 'Distance',
    unit: 'km',
    min: 1.5,
    max: 6.0,
    step: 0.05,
    sliderMin: 0,
    sliderMax: 90,
    sliderStep: 1,
    curvePower: 1.0,
    decimals: 2,
    chipText: 'derived from route + DEM',
    chipCls: 'dem',
    scaleNote: '1.50 – 6.00 km (linear)'
  }),
  Object.freeze({
    key: 'ascentM',
    label: 'Total climb',
    unit: 'm',
    min: 0.0,
    max: 600.0,
    step: 5.0,
    sliderMin: 0,
    sliderMax: 120,
    sliderStep: 1,
    curvePower: 1.0,
    decimals: 0,
    chipText: 'derived from route + DEM',
    chipCls: 'dem',
    scaleNote: '0 – 600 m uphill sum (linear)'
  }),
  Object.freeze({
    key: 'steepPct',
    label: 'Slopes > 15° (Mod + Haz)',
    unit: '%',
    min: 0.0,
    max: 70.0,
    step: 0.1,
    sliderMin: 0,
    sliderMax: 100,
    sliderStep: 0.2,
    curvePower: 4.0,
    decimals: 1,
    chipText: 'derived from route + DEM',
    chipCls: 'dem',
    scaleNote: '0 – 70% (fine low-slope scale)'
  }),
  Object.freeze({
    key: 'timeHours',
    label: 'Travel time (mission estimate)',
    unit: 'h',
    min: 0.0,
    max: 100.0,
    step: 0.5,
    sliderMin: 0,
    sliderMax: 200,
    sliderStep: 1,
    curvePower: 1.0,
    decimals: 1,
    chipText: 'mission rule',
    chipCls: 'game',
    scaleNote: '0 – 100 h (not real EVA time)'
  })
]);

export function sliderPosToFieldValue(field, sliderPos) {
  const s = Number(sliderPos);
  const t = Math.max(0.0, Math.min(1.0, (s - field.sliderMin) / (field.sliderMax - field.sliderMin)));
  const raw = field.min + (field.max - field.min) * Math.pow(t, field.curvePower);
  const snapped = Math.round(raw / field.step) * field.step;
  return Number(Math.max(field.min, Math.min(field.max, snapped)).toFixed(field.decimals));
}

export function fieldValueToSliderPos(field, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return (field.sliderMin + field.sliderMax) / 2.0;
  }
  const clamped = Math.max(field.min, Math.min(field.max, Number(value)));
  const frac = Math.max(0.0, Math.min(1.0, (clamped - field.min) / (field.max - field.min)));
  const ratio = field.curvePower === 1.0 ? frac : Math.pow(frac, 1.0 / field.curvePower);
  return Number((field.sliderMin + (field.sliderMax - field.sliderMin) * ratio).toFixed(2));
}
