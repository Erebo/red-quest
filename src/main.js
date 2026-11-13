import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import level01 from './game/levels/level01.json';
import { createGameState } from './game/gameState.js';
import {
  GAME_STATES,
  buildBlindedPlannerCandidates,
  populateBriefingUI,
  populateDebriefUI,
  updatePhaseStepper,
  initDevResetButton
} from './game/levelController.js';
import {
  LENS_CONFIG,
  SUN_PRESETS,
  THEMIS_MIN_DN,
  THEMIS_MAX_DN,
  THEMIS_MEDIAN_DN,
  SVF_SHELTER_THRESHOLD,
  extractImageRGBA,
  buildDataTextureFromWorkerBuffer,
  buildSlopeHazardOutlineTexture,
  buildTerrainSlopeAndContourTextures,
  buildMineralsGlowTexture,
  buildFullHeatTexture,
  deriveDemTerrainFeatures,
  clusterCrismIndicators,
  computeOpticalRouteStats,
  runDevCrismSelfCheck
} from './game/decisionLenses.js';
import { createMapLabelController } from './game/mapLabels.js';
import level01Elements from './game/levels/level01_elements.json';
import {
  FAMILY_META,
  computeRouteElementCounts,
  createMissionElementsController
} from './game/missionElements.js';
import {
  createRouteCalculatorController,
  renderDebriefCalcRevealDOM
} from './game/routeCalculator.js';
import { createSurveyKitController } from './game/surveyKit.js';
import {
  createSurveyLogController,
  renderSurveyResultOverlayDOM,
  renderDebriefSurveyRevealDOM
} from './game/surveyLog.js';
import { createDustZonesOverlay, createDustStormParticles } from './game/dustZones.js';
import { playUiSound } from './config.js';
import { createIntroController } from './ui/intro.js';
import { createMissionSelectController } from './ui/missionSelect.js';
import { createTutorialController } from './ui/tutorial.js';
import {
  autoDismiss,
  cancelAutoDismiss,
  ensurePopupInDom
} from './ui/autoDismiss.js';
import { createRoverModel } from './game/rover/roverModel.js';
import { RoverPhysics } from './game/rover/roverPhysics.js';
import { RoverChaseCamera } from './game/rover/roverCamera.js';
import { RoverRouteRibbon } from './game/rover/roverRibbon.js';
import { RoverHUD } from './game/rover/roverHUD.js';
import { RoverAudio } from './game/rover/roverAudio.js';
import { RoverInteractions } from './game/rover/roverInteractions.js';
import { RoverDetailTerrain, surfaceReliefAt, marsPaletteRGB } from './game/rover/roverTerrain.js';
import { RoverWorldProps } from './game/rover/roverWorldProps.js';
import { RoverMovementDust } from './game/rover/roverMovementDust.js';

// --- Performance & Timing Metrics ---
const appStartTime = performance.now();
let lastFpsUpdateTime = performance.now();
let frameCount = 0;
let currentFps = 60;
let lastRaycastTime = 0;

// --- Constants & Coordinate Bounds ---
const TERRAIN_WIDTH_M = 5000.0;
const TERRAIN_HEIGHT_M = 5000.0;
const WEST_EDGE_EASTING = 8140750.0;
const SOUTH_EDGE_NORTHING = -287375.0;
const MARS_RADIUS_M = 3396190.0;

// Quality presets configuration
const QUALITY_SETTINGS = {
  low: { segments: 160, dustCount: 250, pixelRatio: 1.0 },
  medium: { segments: 320, dustCount: 600, pixelRatio: 1.0 },
  high: { segments: 512, dustCount: 1200, pixelRatio: Math.min(window.devicePixelRatio, 1.5) }
};
let currentQuality = 'medium';

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('progress-bar');
const btnSkipIntro = document.getElementById('btn-skip-intro');
const perfReadout = document.getElementById('perf-readout');

// Front Door DOM & State (START stage before BRIEFING; keeps gameState.js untouched)
const introOverlay = document.getElementById('intro-overlay');
const introStarfield = document.getElementById('intro-starfield');
const introTitle = document.getElementById('intro-title');
const introSubtitle = document.getElementById('intro-subtitle');
const introSkipHint = document.getElementById('intro-skip-hint');
const missionSelectOverlay = document.getElementById('mission-select-overlay');
const globeCanvasWrap = document.getElementById('globe-canvas-wrap');
const missionCard1 = document.getElementById('mission-card-1');
const btnMission1Start = document.getElementById('btn-mission1-start');
const missionCard2 = document.getElementById('mission-card-2');
const missionCard3 = document.getElementById('mission-card-3');
const btnHomeMissions = document.getElementById('btn-home-missions');
const btnTutorialHelp = document.getElementById('btn-tutorial-help');

let frontDoorStage = 'INTRO'; // 'INTRO' | 'MISSION_SELECT' | 'MAP'
let introCtrl = null;
let missionSelectCtrl = null;
let tutorialCtrl = null;

// Tutorial DOM Elements
const tutorialRoot = document.getElementById('tutorial-root');
const tutorialDimTop = document.getElementById('tutorial-dim-top');
const tutorialDimRight = document.getElementById('tutorial-dim-right');
const tutorialDimBottom = document.getElementById('tutorial-dim-bottom');
const tutorialDimLeft = document.getElementById('tutorial-dim-left');
const tutorialSpotlightRing = document.getElementById('tutorial-spotlight-ring');
const tutorialCard = document.getElementById('tutorial-card');
const tutorialGuideName = document.getElementById('tutorial-guide-name');
const tutorialStepCounter = document.getElementById('tutorial-step-counter');
const tutorialTitle = document.getElementById('tutorial-title');
const tutorialText = document.getElementById('tutorial-text');
const tutorialActionHint = document.getElementById('tutorial-action-hint');
const btnTutorialNext = document.getElementById('btn-tutorial-next');
const btnTutorialSkip = document.getElementById('btn-tutorial-skip');

// Layer Controls
const lyrSat = document.getElementById('lyr-sat');
const exagSlider = document.getElementById('exag-slider');
const exagVal = document.getElementById('exag-val');

const lyrSlope = document.getElementById('lyr-slope');
const slopeOpacity = document.getElementById('slope-opacity');
const slopeOv = document.getElementById('slope-ov');

const lyrCrismHyd = document.getElementById('lyr-crism-hyd');
const crismHydOpacity = document.getElementById('crism-hyd-opacity');
const crismHydOv = document.getElementById('crism-hyd-ov');

const lyrCrismPhy = document.getElementById('lyr-crism-phy');
const crismPhyOpacity = document.getElementById('crism-phy-opacity');
const crismPhyOv = document.getElementById('crism-phy-ov');

const lyrThemis = document.getElementById('lyr-themis');
const themisOpacity = document.getElementById('themis-opacity');
const themisOv = document.getElementById('themis-ov');

const lyrRoute = document.getElementById('lyr-route');
const lyrBoxwork = document.getElementById('lyr-boxwork');
const routeColorMode = document.getElementById('route-color-mode');

const timeSlider = document.getElementById('time-slider');
const timeVal = document.getElementById('time-val');
const lyrDust = document.getElementById('lyr-dust');
const qualityPreset = document.getElementById('quality-preset');

const btnReset = document.getElementById('btn-reset');
const btnBoxwork = document.getElementById('btn-boxwork');
const btnResetCustom = document.getElementById('btn-reset-custom');

// Inspector Elements
const inspectorPanel = document.getElementById('inspector-panel');
const inspectorMode = document.getElementById('inspector-mode');
const inspectorUnpin = document.getElementById('inspector-unpin');

const iElev = document.getElementById('i-elev');
const iSlope = document.getElementById('i-slope');
const iTier = document.getElementById('i-tier');
const iXy = document.getElementById('i-xy');
const iLonlat = document.getElementById('i-lonlat');
const iSol = document.getElementById('i-sol');
const iCrismHyd = document.getElementById('i-crism-hyd');
const iCrismPhy = document.getElementById('i-crism-phy');
const iThemis = document.getElementById('i-themis');

const iRad = document.getElementById('i-rad');
const iDust = document.getElementById('i-dust');
const iTemp = document.getElementById('i-temp');
const iWind = document.getElementById('i-wind');
const iSignal = document.getElementById('i-signal');
const iMobility = document.getElementById('i-mobility');

// Timeline Elements
const btnPlay = document.getElementById('btn-play');
const tlSlider = document.getElementById('tl-slider');
const tlSol = document.getElementById('tl-sol');
const tlFollow = document.getElementById('tl-follow');
const speedBtns = document.querySelectorAll('.tl-speed .sp');

const tsSol = document.getElementById('ts-sol');
const tsElev = document.getElementById('ts-elev');
const tsDist = document.getElementById('ts-dist');
const tsClimb = document.getElementById('ts-climb');
const tsNet = document.getElementById('ts-net');

// Science Popup
const sciencePopup = document.getElementById('science-popup');
const popupTitle = document.getElementById('popup-title');
const popupSol = document.getElementById('popup-sol');
const popupSrc = document.getElementById('popup-src');
const popupClose = document.getElementById('popup-close');

// Route Planner DOM Elements
const plannerPanel = document.getElementById('planner-panel');
const plannerStatus = document.getElementById('planner-status');
const plannerTbody = document.getElementById('planner-tbody');
const btnSetStart = document.getElementById('btn-set-start');
const btnSetGoal = document.getElementById('btn-set-goal');
const btnResetPlan = document.getElementById('btn-reset-plan');
const btnTogglePlanner = document.getElementById('btn-toggle-planner');
const profileRouteName = document.getElementById('profile-route-name');
const profileHoverInfo = document.getElementById('profile-hover-info');
const elevationChart = document.getElementById('elevation-chart');
const plannerToast = document.getElementById('planner-toast');

// Level 1 Game DOM Elements & State Machine
const hudHeader = document.getElementById('hud-header');
const layersPanel = document.getElementById('layers-panel');
const lyrRefControls = document.getElementById('lyr-ref-controls');
const timelineBar = document.getElementById('timeline-bar');
const iSolRow = document.getElementById('i-sol-row');
const iMobilityRow = document.getElementById('i-mobility-row');
const btnLenses = document.getElementById('btn-lenses');
const missionObjectiveBanner = document.getElementById('mission-objective-banner');
const objectiveBannerText = document.getElementById('objective-banner-text');
const btnBannerAction = document.getElementById('btn-banner-action');
const missionDock = document.getElementById('mission-dock');
const btnDockInspector = document.getElementById('btn-dock-inspector');
const btnDockLegend = document.getElementById('btn-dock-legend');
const btnDockRoutes = document.getElementById('btn-dock-routes');
const viewModeToggle = document.getElementById('view-mode-toggle');
const hoverTooltip = document.getElementById('hover-tooltip');
const htRouteRow = document.getElementById('ht-route-row');
const htRoute = document.getElementById('ht-route');
const htElev = document.getElementById('ht-elev');
const htTier = document.getElementById('ht-tier');
const elevationProfileBox = document.getElementById('elevation-profile-box');
const gameBriefingOverlay = document.getElementById('game-briefing-overlay');
const gameDebriefOverlay = document.getElementById('game-debrief-overlay');
const gameExploreOverlay = document.getElementById('game-explore-overlay');
const btnStartMission = document.getElementById('btn-start-mission');
const btnGoChoose = document.getElementById('btn-go-choose');
const btnBackAnalyze = document.getElementById('btn-back-analyze');
const btnLockRoute = document.getElementById('btn-lock-route');
const btnGoDebrief = document.getElementById('btn-go-debrief');
const exploreLockedRoute = document.getElementById('explore-locked-route');
const btnDebriefClose = document.getElementById('btn-debrief-close');
const btnDebriefDismiss = document.getElementById('btn-debrief-dismiss');
const btnDebriefChoose = document.getElementById('btn-debrief-choose');
const btnDebriefProceedGame = document.getElementById('btn-debrief-proceed-game');
const btnDebriefReplay = document.getElementById('btn-debrief-replay');
const btnDebriefFree = document.getElementById('btn-debrief-free');

// Explore Map Card DOM Elements
const exploreMapCard = document.getElementById('explore-map-card');
const exploreCardRoute = document.getElementById('explore-card-route');
const btnExploreChangeRoute = document.getElementById('btn-explore-change-route');
const btnExploreFinish = document.getElementById('btn-explore-finish');

// Proceed to Game Modal DOM Elements
const gameProceedModal = document.getElementById('game-proceed-modal');
const gpmRouteName = document.getElementById('gpm-route-name');
const btnGpmClose = document.getElementById('btn-gpm-close');
const btnGpmBackDebrief = document.getElementById('btn-gpm-back-debrief');
const btnGpmBackMap = document.getElementById('btn-gpm-back-map');
const btnGpmReplay = document.getElementById('btn-gpm-replay');
const dataMethodsModal = document.getElementById('data-methods-modal');
const btnDataMethods = document.getElementById('btn-data-methods');
const btnDmClose = document.getElementById('btn-dm-close');
const btnDmDismiss = document.getElementById('btn-dm-dismiss');

// Labels Dropdown, Detail Card, Map Legend & 6 Decision Lenses DOM Elements
const mapTopControls = document.getElementById('map-top-controls');
const lensExagBadge = document.getElementById('lens-exag-badge');
const btnLabels = document.getElementById('btn-labels');
const labelsDropdown = document.getElementById('labels-dropdown');
const labelCatChips = document.querySelectorAll('#labels-dropdown .ld-chip');
const btnLabelsShowAll = document.getElementById('btn-labels-show-all');
const mapLeaderSvg = document.getElementById('map-leader-svg');
const mapLabelsLayer = document.getElementById('map-labels-layer');
const markerHoverCard = document.getElementById('marker-hover-card');
const mhcName = document.getElementById('mhc-name');
const mhcSol = document.getElementById('mhc-sol');
const mhcDesc = document.getElementById('mhc-desc');
const mhcTags = document.getElementById('mhc-tags');
const mhcEffect = document.getElementById('mhc-effect');
const btnCuriosityPath = document.getElementById('btn-curiosity-path');
const btnShowAllElements = document.getElementById('btn-show-all-elements');
const chipCatMystery = document.getElementById('chip-cat-mystery');
const btnCodex = document.getElementById('btn-codex');
const codexCount = document.getElementById('codex-count');
const codexPanel = document.getElementById('codex-panel');
const codexProgress = document.getElementById('codex-progress');
const codexBody = document.getElementById('codex-body');
const codexClose = document.getElementById('codex-close');
const legendMysteryRow = document.getElementById('legend-mystery-row');

let routeElementCounts = {};
let missionElements = null;
let showAllElements = false;
let showCuriosityPath = true;

const btnCalcToggle = document.getElementById('btn-calc-toggle');
const routeCalcPanel = document.getElementById('route-calc-panel');
const surveyToolGrid = document.getElementById('survey-tool-grid');
const surveyScansLeft = document.getElementById('survey-scans-left');
const surveyRingFg = document.getElementById('survey-ring-fg');
const surveyRingText = document.getElementById('survey-ring-text');
const surveyIdProgress = document.getElementById('survey-id-progress');
const surveyLogTbody = document.getElementById('survey-log-tbody');
const surveyCalcGrid = document.getElementById('survey-calc-grid');
const surveyLogLine = document.getElementById('survey-log-line');
const btnSurveyClearPins = document.getElementById('btn-survey-clear-pins');
const surveyPinsLayer = document.getElementById('survey-pins-layer');
const surveyResultOverlay = document.getElementById('survey-result-overlay');
const sroElemScore = document.getElementById('sro-elem-score');
const sroHazScore = document.getElementById('sro-haz-score');
const sroTotalScore = document.getElementById('sro-total-score');
const sroRank = document.getElementById('sro-rank');
const sroIdentSummary = document.getElementById('sro-ident-summary');
const sroHazIndexRow = document.getElementById('sro-haz-index-row');
const sroTablesWrap = document.getElementById('sro-tables-wrap');
const btnSurveyResultContinue = document.getElementById('btn-survey-result-continue');
const debriefCalcAcc = document.getElementById('debrief-calc-acc');
const debriefCalcAnswered = document.getElementById('debrief-calc-answered');
const debriefCalcScore = document.getElementById('debrief-calc-score');
const debriefCalcNeutral = document.getElementById('debrief-calc-neutral');
const debriefCalcTables = document.getElementById('debrief-calc-tables');

let routeCalc = null;
let surveyKit = null;
let surveyLog = null;
let dustZonesOverlay = null;
let awaitingSurveyResultContinue = false;
let debriefOverlayDismissed = false;
let exploreOverlayDismissed = false;
let frozenSurveyEval = null;
let frozenRouteCalcSnapshot = null;
let lastCalcMaskedState = null;

function isRouteCalcMasked() {
  return Boolean(routeCalc && routeCalc.shouldMaskTrueValues(levelState.getState().screen, currentViewMode));
}

function syncSurveyKitUi() {
  if (!surveyKit) return;
  const activeTool = surveyKit.getActiveTool();
  const log = surveyKit.getLog();
  if (surveyToolGrid) {
    surveyToolGrid.querySelectorAll('.sk-tool-btn').forEach(btn => {
      const t = btn.dataset.tool;
      const isAct = activeTool === t;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
      const badge = btn.querySelector('.sk-badge');
      if (badge) badge.classList.toggle('hidden', !log.usedSet.has(t));
    });
  }
  if (surveyLogLine) {
    surveyLogLine.textContent = `Point pins: ${log.pinCount}`;
  }
  const screen = levelState.getState().screen;
  const canUseTools = currentViewMode === 'MISSION' && (screen === GAME_STATES.ANALYZE || screen === GAME_STATES.CHOOSE);
  if (dustZonesOverlay && dustZonesOverlay.group) {
    dustZonesOverlay.group.visible = Boolean(canUseTools && activeTool === 'dust');
  }
  document.body.classList.toggle('cursor-survey-tool', Boolean(canUseTools && activeTool));
}

function syncRouteCalcPanelUi() {
  if (!routeCalc) return;
  const screen = levelState.getState().screen;
  const canUseCalc = currentViewMode === 'MISSION' && (screen === GAME_STATES.ANALYZE || screen === GAME_STATES.CHOOSE);
  const isOpen = canUseCalc && routeCalc.isDrawerOpen();

  if (btnCalcToggle) {
    btnCalcToggle.classList.toggle('hidden', !canUseCalc);
    btnCalcToggle.classList.toggle('open', isOpen);
    btnCalcToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  if (routeCalcPanel) {
    routeCalcPanel.classList.toggle('hidden', !isOpen);
  }
  if (surveyKit) {
    if (!canUseCalc) surveyKit.clearTool();
    surveyKit.group.visible = canUseCalc;
    syncSurveyKitUi();
  }

  const nextMasked = isRouteCalcMasked();
  if (nextMasked !== lastCalcMaskedState) {
    lastCalcMaskedState = nextMasked;
    renderPlannerTable(plannerCandidates);
    renderLensRouteStrip();
    const selCand = plannerCandidates.find(c => c.id === selectedCandidateId);
    if (selCand) drawElevationChart(selCand);
  }
}

function renderDebriefCalculatorReveal() {
  const surveyEval = frozenSurveyEval || (surveyLog ? surveyLog.evaluateCurrent() : null);
  if (surveyEval) {
    renderDebriefSurveyRevealDOM({
      accEl: debriefCalcAcc,
      answeredEl: debriefCalcAnswered,
      scoreEl: debriefCalcScore,
      neutralEl: debriefCalcNeutral,
      tablesEl: debriefCalcTables,
      evaluation: surveyEval
    });
    return;
  }
  if (!routeCalc) return;
  renderDebriefCalcRevealDOM({
    accEl: debriefCalcAcc,
    answeredEl: debriefCalcAnswered,
    scoreEl: debriefCalcScore,
    neutralEl: debriefCalcNeutral,
    tablesEl: debriefCalcTables,
    candidates: plannerCandidates,
    frozenSnapshot: frozenRouteCalcSnapshot || (routeCalc ? routeCalc.getFrozenSnapshot() : null)
  });
}

function isCurrentPostLock() {
  const s = levelState.getState().screen;
  return s === GAME_STATES.EXPLORE || s === GAME_STATES.DEBRIEF;
}

function renderFieldCodex() {
  if (!missionElements) return;
  const postLock = isCurrentPostLock();
  const prog = missionElements.getCodexProgress();
  if (codexCount) codexCount.textContent = `${prog.unlocked}/${prog.total}`;
  if (codexProgress) codexProgress.textContent = `Unlocked ${prog.unlocked} / ${prog.total} types`;
  if (!codexBody) return;

  const entries = missionElements.getUniqueTypesForStage(postLock);
  const families = ['hazard', 'resource', 'science'];
  if (postLock) families.push('mystery');

  codexBody.innerHTML = '';
  families.forEach(fam => {
    const groupEntries = entries.filter(e => e.family === fam);
    if (!groupEntries.length) return;

    const section = document.createElement('div');
    const head = document.createElement('div');
    head.className = `codex-fam-head codex-fam-${fam}`;
    head.textContent = `${FAMILY_META[fam]?.label || fam} (${groupEntries.length})`;
    section.appendChild(head);

    groupEntries.forEach(entry => {
      const unlocked = missionElements.isTypeUnlocked(entry.type);
      const card = document.createElement('div');
      card.className = `codex-entry ${unlocked ? 'unlocked' : 'locked'}`;
      card.dataset.codexType = entry.type;

      const top = document.createElement('div');
      top.className = 'codex-etop';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = entry.title;
      const statusSpan = document.createElement('span');
      statusSpan.className = unlocked ? 'codex-badge-open' : 'codex-badge-lock';
      statusSpan.textContent = unlocked ? 'Unlocked' : 'Locked · click on map';
      top.appendChild(titleSpan);
      top.appendChild(statusSpan);
      card.appendChild(top);

      if (unlocked) {
        const note = document.createElement('div');
        note.className = 'codex-note';
        note.textContent = entry.whatIsIt?.text || '';
        card.appendChild(note);

        const eff = document.createElement('div');
        eff.className = 'codex-eff';
        eff.textContent = `Effect on mission: ${entry.effectOnMission || 'TBD'}`;
        card.appendChild(eff);

        const tags = document.createElement('div');
        tags.className = 'codex-tags';
        const gameTag = document.createElement('span');
        gameTag.className = 'mhc-tag game';
        gameTag.textContent = 'MISSION RULE';
        tags.appendChild(gameTag);

        if (entry.source === 'derived from DEM') {
          const demTag = document.createElement('span');
          demTag.className = 'mhc-tag dem';
          demTag.textContent = 'derived from DEM';
          tags.appendChild(demTag);
        }
        if (import.meta.env.DEV && entry.whatIsIt?.verified === false) {
          const verTag = document.createElement('span');
          verTag.className = 'mhc-tag sim';
          verTag.textContent = 'verify before submission';
          tags.appendChild(verTag);
        }
        card.appendChild(tags);
      }

      section.appendChild(card);
    });

    codexBody.appendChild(section);
  });
}

function handleAnchorOrElementSelect(anchorOrId) {
  if (!anchorOrId) return;
  if (typeof anchorOrId === 'object' && anchorOrId.routeId) {
    selectCandidate(anchorOrId.routeId, { userInitiated: true });
    return;
  }
  if (!missionElements) return;
  const id = typeof anchorOrId === 'string' ? anchorOrId : anchorOrId.id;
  if (!id) return;
  if (!missionElements.isElementIdentified(id)) return;
  const el = missionElements.getElementById(id);
  if (el) {
    const unlockedNow = missionElements.unlockType(el.type);
    if (unlockedNow || codexProgress) {
      renderFieldCodex();
    }
  }
}

function syncMissionElementsState() {
  const st = levelState.getState();
  const isMission = currentViewMode === 'MISSION';
  const isBriefing = st.screen === GAME_STATES.BRIEFING;
  const isPostLock = st.screen === GAME_STATES.EXPLORE || st.screen === GAME_STATES.DEBRIEF;

  if (chipCatMystery) chipCatMystery.classList.toggle('hidden', !isPostLock);
  if (legendMysteryRow) legendMysteryRow.classList.toggle('hidden', !isPostLock);

  if (missionElements) {
    missionElements.setState({
      missionMode: isMission,
      briefing: isBriefing,
      postLock: isPostLock,
      lens: activeMissionLens,
      showAll: showAllElements
    });
    renderFieldCodex();
  }
}

const labelDetailCard = document.getElementById('label-detail-card');
const ldcTitle = document.getElementById('ldc-title');
const ldcCategory = document.getElementById('ldc-category');
const ldcSol = document.getElementById('ldc-sol');
const ldcWhat = document.getElementById('ldc-what');
const ldcDataset = document.getElementById('ldc-dataset');
const ldcWhy = document.getElementById('ldc-why');
const ldcTags = document.getElementById('ldc-tags');
const ldcClose = document.getElementById('ldc-close');

const mapLegend = document.getElementById('map-legend');
const btnToggleLegend = document.getElementById('btn-toggle-legend');
const legendRefRow = document.getElementById('legend-ref-row');

const layersPanelTitle = document.getElementById('layers-panel-title');
const lensBtns = document.querySelectorAll('.lens-btn');
const sunPresetControls = document.getElementById('sun-preset-controls');
const sunPresetBtns = document.querySelectorAll('.sun-preset-btn');
const sunNoonNote = document.getElementById('sun-noon-note');
const lensComputingNote = document.getElementById('lens-computing-note');
const lensRampBar = document.getElementById('lens-ramp-bar');
const lensRampUnits = document.getElementById('lens-ramp-units');
const lensRampMin = document.getElementById('lens-ramp-min');
const lensRampMid = document.getElementById('lens-ramp-mid');
const lensRampMax = document.getElementById('lens-ramp-max');
const lensLegendItems = document.getElementById('lens-legend-items');
const lensCaveat = document.getElementById('lens-caveat');
const btnMissionResetView = document.getElementById('btn-mission-reset-view');
const btnMissionFocusBoxwork = document.getElementById('btn-mission-focus-boxwork');

const lensRouteStrip = document.getElementById('lens-route-strip');
const lrsLensName = document.getElementById('lrs-lens-name');
const lrsCaveat = document.getElementById('lrs-caveat');
const lrsCols = document.getElementById('lrs-cols');

const levelState = createGameState('route-a');
const LEVEL1_TARGET_SOLS = new Set(level01.scienceTargets.map(t => t.sol));
let hasPlayedIntro = false;
let exploreHintDismissed = false;

// Mars Rover Exploration Mode (EXPLORE Phase)
let roverExploreModel = null;
let roverShadow = null;
let roverPhysics = null;
let roverChaseCamera = null;
let roverRouteRibbon = null;
let roverHUD = null;
let roverAudio = null;
let roverInteractions = null;
let roverTerrain = null;
let roverWorldProps = null;
let roverDustStormParticles = null;
let roverMovementDust = null;
let exploreAtmosphereBackup = null;
let basePaletteBuilt = false;
let activeDriveStats = null;
let lastFrameTime = performance.now();
const roverInputState = {
  forward: 0,
  steer: 0,
  boost: false,
  action: false,
  reset: false
};

// Physical key state is tracked independently of game phase so a key held
// through a phase transition (or auto-repeat) still drives the rover.
const roverHeldKeys = new Set();

function syncRoverInputFromKeys() {
  const up = roverHeldKeys.has('w') || roverHeldKeys.has('arrowup');
  const down = roverHeldKeys.has('s') || roverHeldKeys.has('arrowdown');
  const left = roverHeldKeys.has('a') || roverHeldKeys.has('arrowleft');
  const right = roverHeldKeys.has('d') || roverHeldKeys.has('arrowright');
  roverInputState.forward = (up ? 1 : 0) + (down ? -1 : 0);
  roverInputState.steer = (right ? 1 : 0) + (left ? -1 : 0);
  roverInputState.boost = roverHeldKeys.has('shift');
}

function clearRoverKeys() {
  roverHeldKeys.clear();
  roverInputState.forward = 0;
  roverInputState.steer = 0;
  roverInputState.boost = false;
}

// Decision Lenses, Crossfade Transition, Worker Cache & Labels State
const LENS_KEYS = ['satellite', 'terrain', 'minerals', 'heat', 'sun', 'radiation'];
let activeMissionLens = 'satellite';
let activeSunPreset = 'morning';
let lensTextures = null;
let routeLensStats = {};
let demFeatures = null;
let crismClusters = null;
let mapLabels = null;
let isHoveringLabelDom = false;
let hoveredCandidateId = null;
let cachedPlannerTop = window.innerHeight;
let cachedLabelLeftLimit = 10;
let cachedLabelRightLimit = window.innerWidth - 10;
let cachedLabelTopLimit = 44;
let cachedLabelObstacleBoxes = [];
let terrainAnalysisWorker = null;
const sunCache = {};
let svfCache = null;

const lensBlend = {
  current: { satellite: 1, terrain: 0, minerals: 0, heat: 0, sun: 0, radiation: 0 },
  from: { satellite: 1, terrain: 0, minerals: 0, heat: 0, sun: 0, radiation: 0 },
  target: { satellite: 1, terrain: 0, minerals: 0, heat: 0, sun: 0, radiation: 0 },
  fromDesat: 0, curDesat: 0, targetDesat: 0,
  fromDim: 1, curDim: 1, targetDim: 1,
  fromExag: 1, targetExag: 1,
  startTime: 0,
  durationMs: 400,
  active: false
};

// View Mode (MISSION | RESEARCH) & Per-Mode Panel Memory
let currentViewMode = 'MISSION';
const panelPrefs = {
  MISSION: {
    activeSidePanel: 'none', // 'none' | 'inspector' | 'legend' | 'survey' | 'lenses' | 'codex'
    plannerCollapsed: true,
    profileOpen: false
  },
  RESEARCH: { inspectorOpen: true, layersOpen: true, plannerCollapsed: false, profileOpen: true }
};
let savedPanelsBeforeTutorial = null;
let lastTerrainHit = null;

function setMissionSidePanel(panelName) {
  const valid = ['none', 'inspector', 'legend', 'survey', 'lenses', 'codex'];
  const next = valid.includes(panelName) ? panelName : 'none';
  panelPrefs.MISSION.activeSidePanel = next;
  if (routeCalc) {
    routeCalc.setDrawerOpen(next === 'survey', { userAction: false });
  }
  if (next !== 'survey' && surveyKit) {
    surveyKit.clearTool();
  }
  syncPanelsToViewMode();
  requestAnimationFrame(updateLayoutBounds);
}

function toggleMissionSidePanel(panelName) {
  const cur = panelPrefs.MISSION.activeSidePanel;
  setMissionSidePanel(cur === panelName ? 'none' : panelName);
}

// Global Data
let rawHeights = null;
let rawSlopes = null;
let routePoints = [];
let minElev = -4131.74;
let maxElev = -3412.51;
let currentExag = 1.0;
let currentTimeHour = 14.0;

// Pixel Data for Inspector Sampling
let crismHydCtx = null;
let crismPhyCtx = null;
let themisCtx = null;

// Replay State
let isPlaying = false;
let replaySpeed = 5.0; // sols per sec
let currentReplaySol = 3721;
let lastReplayTime = 0;
let isPinned = false;
let pinnedPoint = null;

// Three.js Objects
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const initialFogColor = new THREE.Color(0x2a160e);
scene.background = initialFogColor;
scene.fog = new THREE.FogExp2(initialFogColor, 0.000075);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 45000);
camera.position.set(0, 3400, 3900);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(QUALITY_SETTINGS.medium.pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 80;
controls.maxDistance = 20000;

// Meshes & Groups
let terrainGeometry = null;
let terrainMesh = null;
let hazardMesh = null;
let hazardOutlineMesh = null;
let lensTerrainMesh = null;
let lensMineralsMesh = null;
let lensHeatMesh = null;
let lensSunMesh = null;
let lensSkyMesh = null;
let crismHydMesh = null;
let crismPhyMesh = null;
let themisMesh = null;

let routeGroup = null;
let routeLine = null;
let trailLine = null;
let curiosityRefGroup = null;
let curiosityRefLine = null;
let curiosityRefGeom = null;
let trimmedCuriosityData = null;
let roverGroup = null;
let roverBeacon = null;
let scienceMarkersGroup = null;
let startFlagGroup = null;
let boxworkGroup = null;
let dustParticles = null;
let dustVelocities = [];
let hoverCursor = null;
let cursorReticle = null;
let pinnedReticle = null;

// Route Planner State & Objects
let routeWorker = null;
let plannerGroup = null;
let candidateLines = {};
let startMarker = null;
let goalMarker = null;
let profileMarker = null;
let plannerStart = { x: 3467.35, y: 4999.58 };
let plannerGoal = { x: 2432.1, y: 2479.0 };
let isSettingStart = false;
let isSettingGoal = false;
let plannerCandidates = [];
let selectedCandidateId = 'safest';
let lastComputeTimeMs = 0;

// Lights
let sunLight = null;
let ambientLight = null;
let hemiLight = null;

function setupLights() {
  ambientLight = new THREE.AmbientLight(0x5a443b, 1.2);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xffeedd, 0x1f140e, 0.75);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff5ea, 2.4);
  sunLight.position.set(-3200, 4200, -3200);
  scene.add(sunLight);
}

// Coordinate Conversion & Bilinear Interpolation
function sampleGridBilinear(data, col, row) {
  const c = Math.max(0, Math.min(1024, col));
  const r = Math.max(0, Math.min(1024, row));
  const c0 = Math.floor(c);
  const c1 = Math.min(1024, c0 + 1);
  const r0 = Math.floor(r);
  const r1 = Math.min(1024, r0 + 1);
  const fc = c - c0;
  const fr = r - r0;
  const v00 = data[r0 * 1025 + c0];
  const v01 = data[r0 * 1025 + c1];
  const v10 = data[r1 * 1025 + c0];
  const v11 = data[r1 * 1025 + c1];
  const top = (1.0 - fc) * v00 + fc * v01;
  const bot = (1.0 - fc) * v10 + fc * v11;
  return (1.0 - fr) * top + fr * bot;
}

function localToGrid(lx, ly) {
  return {
    col: (lx / TERRAIN_WIDTH_M) * 1024.0,
    row: (1.0 - (ly / TERRAIN_HEIGHT_M)) * 1024.0
  };
}

function sampleElevationAtMeters(lx, ly) {
  if (!rawHeights) return -3800.0;
  const { col, row } = localToGrid(lx, ly);
  return sampleGridBilinear(rawHeights, col, row);
}

// Explore-mode driving surface = MOLA DEM + GAME micro-relief. The detail
// terrain mesh uses the same relief so the rover always sits on visible facets.
function sampleDriveSurface(lx, ly) {
  return sampleElevationAtMeters(lx, ly) + surfaceReliefAt(lx, ly);
}

function localToMesh(lx, ly) {
  return {
    meshX: lx - TERRAIN_WIDTH_M / 2.0,
    meshZ: TERRAIN_HEIGHT_M / 2.0 - ly
  };
}

function meshToLocal(mx, mz) {
  return {
    lx: Math.max(0, Math.min(TERRAIN_WIDTH_M, mx + TERRAIN_WIDTH_M / 2.0)),
    ly: Math.max(0, Math.min(TERRAIN_HEIGHT_M, TERRAIN_HEIGHT_M / 2.0 - mz))
  };
}

function localToMarsGeo(lx, ly) {
  const easting = WEST_EDGE_EASTING + lx;
  const northing = SOUTH_EDGE_NORTHING + ly;
  const lon = (easting / MARS_RADIUS_M) * (180.0 / Math.PI);
  const lat = (northing / MARS_RADIUS_M) * (180.0 / Math.PI);
  return { easting, northing, lon, lat };
}

// --- Terrain & Multi-Layer Construction ---
let satTexture = null;

function addTerrainOverlayMesh(tex, opacity, polygonOffsetFactor, alphaTest = 0) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    alphaTest,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor,
    polygonOffsetUnits: polygonOffsetFactor
  });
  const mesh = new THREE.Mesh(terrainGeometry, mat);
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function disposeOldTerrainMeshes() {
  [
    terrainMesh,
    hazardMesh,
    hazardOutlineMesh,
    lensTerrainMesh,
    lensMineralsMesh,
    lensHeatMesh,
    lensSunMesh,
    lensSkyMesh,
    crismHydMesh,
    crismPhyMesh,
    themisMesh
  ].forEach(m => {
    if (!m) return;
    scene.remove(m);
    if (m.material) m.material.dispose();
  });
}

function getMissionLensMeshMap() {
  return {
    satellite: [{ mesh: hazardOutlineMesh, maxOpacity: 0.40 }],
    terrain: [
      { mesh: lensTerrainMesh, maxOpacity: 0.92 },
      { mesh: hazardOutlineMesh, maxOpacity: 1.0 }
    ],
    minerals: [{ mesh: lensMineralsMesh, maxOpacity: 0.95 }],
    heat: [{ mesh: lensHeatMesh, maxOpacity: 0.85 }],
    sun: [{ mesh: lensSunMesh, maxOpacity: 0.86 }],
    radiation: [{ mesh: lensSkyMesh, maxOpacity: 0.84 }]
  };
}

function applyMissionLensWeightsToMeshes(now = performance.now()) {
  if (!terrainMesh) return;
  const uniforms = terrainMesh.material.userData?.lensUniforms;
  if (uniforms) {
    uniforms.uDesaturate.value = lensBlend.curDesat;
    uniforms.uDim.value = lensBlend.curDim;
  }

  const map = getMissionLensMeshMap();
  const accumOpacity = new Map();
  LENS_KEYS.forEach(k => {
    const w = lensBlend.current[k] || 0;
    (map[k] || []).forEach(({ mesh, maxOpacity }) => {
      if (!mesh) return;
      accumOpacity.set(mesh, (accumOpacity.get(mesh) || 0) + maxOpacity * w);
    });
  });

  accumOpacity.forEach((op, mesh) => {
    const clamped = Math.min(1.0, op);
    if (clamped > 0.005) {
      mesh.visible = true;
      mesh.material.opacity = clamped;
    } else {
      mesh.visible = false;
      mesh.material.opacity = 0;
    }
  });

  // Soft pulsing highlight on >25° steep terrain inside lensTerrainMesh GPU shader
  if (lensTerrainMesh && lensTerrainMesh.material.userData?.pulseUniform) {
    const wt = lensBlend.current.terrain || 0;
    lensTerrainMesh.material.userData.pulseUniform.value =
      wt > 0.005 ? 0.5 + 0.5 * Math.sin(now * 0.0045) : 0.0;
  }
}

function createTerrainLayers(satTex, slopeTex, crismHydTex, crismPhyTex, themisTex) {
  satTexture = satTex;
  const seg = QUALITY_SETTINGS[currentQuality].segments;

  disposeOldTerrainMeshes();
  if (terrainGeometry) terrainGeometry.dispose();
  terrainGeometry = new THREE.PlaneGeometry(TERRAIN_WIDTH_M, TERRAIN_HEIGHT_M, seg, seg);
  terrainGeometry.rotateX(-Math.PI / 2);

  updateGeometryHeights(terrainGeometry);

  // Base Terrain with GPU desaturation & dim uniforms for zero-copy 400 ms crossfade
  const lensUniforms = {
    uDesaturate: { value: lensBlend.curDesat },
    uDim: { value: lensBlend.curDim }
  };
  const terrainMat = new THREE.MeshStandardMaterial({
    map: satTex,
    roughness: 0.88,
    metalness: 0.08
  });
  terrainMat.customProgramCacheKey = () => 'redquest-terrain-v1';
  terrainMat.userData.lensUniforms = lensUniforms;
  terrainMat.onBeforeCompile = shader => {
    shader.uniforms.uDesaturate = lensUniforms.uDesaturate;
    shader.uniforms.uDim = lensUniforms.uDim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDesaturate;\nuniform float uDim;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nfloat rqLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(rqLuma), uDesaturate) * uDim;'
      );
  };
  terrainMesh = new THREE.Mesh(terrainGeometry, terrainMat);
  terrainMesh.name = 'MarsTerrain';
  scene.add(terrainMesh);

  // RESEARCH Mode Overlays (kept intact for RESEARCH mode)
  hazardMesh = addTerrainOverlayMesh(slopeTex, parseInt(slopeOpacity.value, 10) / 100.0, -1);
  crismHydMesh = addTerrainOverlayMesh(crismHydTex, parseInt(crismHydOpacity.value, 10) / 100.0, -2);
  crismPhyMesh = addTerrainOverlayMesh(crismPhyTex, parseInt(crismPhyOpacity.value, 10) / 100.0, -3);
  themisMesh = addTerrainOverlayMesh(themisTex, parseInt(themisOpacity.value, 10) / 100.0, -4);

  // MISSION Mode 6 Full-Terrain Lens Meshes
  if (lensTextures) {
    hazardOutlineMesh = addTerrainOverlayMesh(lensTextures.hazardOutlineTex, 0.40, -4.0, 0.04);
    hazardOutlineMesh.renderOrder = 3;
    lensTerrainMesh = addTerrainOverlayMesh(lensTextures.terrainRampTex, 0.92, -2.0);
    const pulseUniform = { value: 0.0 };
    lensTerrainMesh.material.customProgramCacheKey = () => 'redquest-terrain-pulse-v1';
    lensTerrainMesh.material.userData.pulseUniform = pulseUniform;
    lensTerrainMesh.material.onBeforeCompile = shader => {
      shader.uniforms.uSteepPulse = pulseUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSteepPulse;')
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nif (diffuseColor.r > 0.72 && diffuseColor.g < 0.36 && diffuseColor.b < 0.36) { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.32, 0.24), uSteepPulse * 0.45); }'
        );
    };
    lensMineralsMesh = addTerrainOverlayMesh(lensTextures.mineralsTex, 0.95, -2.5, 0.01);
    lensHeatMesh = addTerrainOverlayMesh(lensTextures.heatTex, 0.85, -3.0);

    const sunTex = sunCache[activeSunPreset]?.texture || lensTextures.emptyTex;
    const skyTex = svfCache?.texture || lensTextures.emptyTex;
    lensSunMesh = addTerrainOverlayMesh(sunTex, 0.86, -3.2);
    lensSkyMesh = addTerrainOverlayMesh(skyTex, 0.84, -3.4);
  }

  applyLayerVisibilityForMode();
}

function applyLayerVisibilityForMode() {
  if (!terrainMesh) return;
  const uniforms = terrainMesh.material.userData?.lensUniforms;

  if (currentViewMode === 'MISSION') {
    terrainMesh.visible = true;
    terrainMesh.material.color.setHex(0xffffff);

    if (hazardMesh) hazardMesh.visible = false;
    if (crismHydMesh) crismHydMesh.visible = false;
    if (crismPhyMesh) crismPhyMesh.visible = false;
    if (themisMesh) themisMesh.visible = false;
    if (scienceMarkersGroup) scienceMarkersGroup.visible = false;

    applyMissionLensWeightsToMeshes();
  } else {
    terrainMesh.material.color.setHex(0xffffff);
    if (uniforms) {
      uniforms.uDesaturate.value = 0.0;
      uniforms.uDim.value = 1.0;
    }
    terrainMesh.visible = lyrSat ? lyrSat.checked : true;
    if (hazardMesh) hazardMesh.visible = lyrSlope ? lyrSlope.checked : false;
    if (crismHydMesh) crismHydMesh.visible = lyrCrismHyd ? lyrCrismHyd.checked : false;
    if (crismPhyMesh) crismPhyMesh.visible = lyrCrismPhy ? lyrCrismPhy.checked : false;
    if (themisMesh) themisMesh.visible = lyrThemis ? lyrThemis.checked : false;
    if (scienceMarkersGroup) scienceMarkersGroup.visible = lyrRoute ? lyrRoute.checked : true;

    [hazardOutlineMesh, lensTerrainMesh, lensMineralsMesh, lensHeatMesh, lensSunMesh, lensSkyMesh]
      .forEach(m => { if (m) m.visible = false; });
  }
  syncMissionElementsState();
}

// --- Explore-mode visual dressing: faceted solid-colour terrain & haze ---
const _exploreRGB = [0, 0, 0];

function buildBaseTerrainPalette() {
  if (!terrainGeometry) return;
  const pos = terrainGeometry.attributes.position;
  let colorAttr = terrainGeometry.attributes.color;
  if (!colorAttr || colorAttr.count !== pos.count) {
    colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    terrainGeometry.setAttribute('color', colorAttr);
  }
  const slopeScale = 180.0 / Math.PI;
  for (let i = 0; i < pos.count; i++) {
    const { lx, ly } = meshToLocal(pos.getX(i), pos.getZ(i));
    const elev = sampleElevationAtMeters(lx, ly);
    const d = 7.0;
    const dhdx = (sampleElevationAtMeters(lx + d, ly) - sampleElevationAtMeters(lx - d, ly)) / (2.0 * d);
    const dhdy = (sampleElevationAtMeters(lx, ly + d) - sampleElevationAtMeters(lx, ly - d)) / (2.0 * d);
    const slopeDeg = Math.atan(Math.hypot(dhdx, dhdy)) * slopeScale;
    marsPaletteRGB(_exploreRGB, elev, slopeDeg, lx, ly, minElev, maxElev);
    colorAttr.setXYZ(i, _exploreRGB[0], _exploreRGB[1], _exploreRGB[2]);
  }
  colorAttr.needsUpdate = true;
  basePaletteBuilt = true;
}

function enterExploreLook() {
  if (!terrainMesh || !terrainMesh.material) return;
  if (!basePaletteBuilt) buildBaseTerrainPalette();

  const mat = terrainMesh.material;
  mat.map = null;
  mat.vertexColors = true;
  mat.flatShading = false;
  mat.color.setHex(0xffffff);
  mat.needsUpdate = true;

  if (!exploreAtmosphereBackup) {
    exploreAtmosphereBackup = {
      fogDensity: scene.fog ? scene.fog.density : 0.000075,
      fogColor: scene.fog ? scene.fog.color.clone() : new THREE.Color(0x2a160e),
      background: scene.background && scene.background.clone ? scene.background.clone() : null,
      hemiSky: hemiLight ? hemiLight.color.clone() : null,
      hemiGround: hemiLight ? hemiLight.groundColor.clone() : null,
      hemiIntensity: hemiLight ? hemiLight.intensity : 1.0,
      ambientColor: ambientLight ? ambientLight.color.clone() : null,
      ambientIntensity: ambientLight ? ambientLight.intensity : 1.0,
      sunIntensity: sunLight ? sunLight.intensity : 2.0,
      exposure: renderer.toneMappingExposure
    };
  }

  const haze = new THREE.Color(0xc59b7c);
  if (scene.fog) {
    scene.fog.density = 0.00042;
    scene.fog.color.copy(haze);
  }
  if (scene.background && scene.background.copy) scene.background.copy(haze);
  if (hemiLight) {
    hemiLight.color.setHex(0xf0d4bb);
    hemiLight.groundColor.setHex(0x6b3a26);
    hemiLight.intensity = 1.15;
  }
  if (ambientLight) {
    ambientLight.color.setHex(0x6f4c3a);
    ambientLight.intensity = 0.85;
  }
  if (sunLight) sunLight.intensity = 2.05;
  renderer.toneMappingExposure = 1.05;
}

function exitExploreLook() {
  if (terrainMesh && terrainMesh.material) {
    const mat = terrainMesh.material;
    mat.map = satTexture;
    mat.vertexColors = false;
    mat.flatShading = false;
    mat.needsUpdate = true;
  }

  const b = exploreAtmosphereBackup;
  if (b) {
    if (scene.fog) {
      scene.fog.density = b.fogDensity;
      if (b.fogColor) scene.fog.color.copy(b.fogColor);
    }
    if (b.background && scene.background && scene.background.copy) scene.background.copy(b.background);
    if (hemiLight) {
      if (b.hemiSky) hemiLight.color.copy(b.hemiSky);
      if (b.hemiGround) hemiLight.groundColor.copy(b.hemiGround);
      hemiLight.intensity = b.hemiIntensity;
    }
    if (ambientLight) {
      if (b.ambientColor) ambientLight.color.copy(b.ambientColor);
      ambientLight.intensity = b.ambientIntensity;
    }
    if (sunLight) sunLight.intensity = b.sunIntensity;
    renderer.toneMappingExposure = b.exposure;
  }
  exploreAtmosphereBackup = null;
}

function updateGeometryHeights(geo, skipNormals = false) {
  const pos = geo.attributes.position;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    const mx = pos.getX(i);
    const mz = pos.getZ(i);
    const { lx, ly } = meshToLocal(mx, mz);
    const { col, row } = localToGrid(lx, ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    pos.setY(i, (elev - minElev) * currentExag);
  }
  pos.needsUpdate = true;
  if (!skipNormals) geo.computeVertexNormals();
}

// --- Route, Trail, and Rover Construction ---
function createRoverShadow() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(22, 11, 6, 0.72)');
  grad.addColorStop(0.55, 'rgba(28, 14, 8, 0.46)');
  grad.addColorStop(1, 'rgba(40, 20, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(5.4, 6.6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'RoverContactShadow';
  mesh.renderOrder = 3;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function intersectSegmentBoxFirst(p0, p1, b) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  let tmin = 0.0;
  let tmax = 1.0;
  for (const [d, minB, maxB, v0] of [
    [dx, b.xMin, b.xMax, p0.x],
    [dy, b.yMin, b.yMax, p0.y]
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (v0 < minB || v0 > maxB) return null;
    } else {
      let t1 = (minB - v0) / d;
      let t2 = (maxB - v0) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function computeTrimmedCuriosityRoute(points, bounds) {
  if (!points || !points.length) return null;
  const trimmedPts = [points[0]];
  let cumDist = 0;
  let ascentM = 0;
  let easyLen = 0;
  let modLen = 0;
  let hazLen = 0;
  let maxSlopeDeg = 0;

  const sampleStepSlope = (ax, ay) => {
    if (!rawSlopes) return 0;
    const { col, row } = localToGrid(ax, ay);
    return sampleGridBilinear(rawSlopes, col, row);
  };

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const tEnter = intersectSegmentBoxFirst(p0, p1, bounds);
    if (tEnter !== null && tEnter >= 0 && tEnter <= 1) {
      const hitPt = {
        x: p0.x + (p1.x - p0.x) * tEnter,
        y: p0.y + (p1.y - p0.y) * tEnter,
        elevation: p0.elevation + (p1.elevation - p0.elevation) * tEnter,
        sol: p0.sol
      };
      const dz = hitPt.elevation - p0.elevation;
      const step = Math.hypot(hitPt.x - p0.x, hitPt.y - p0.y, dz);
      if (step > 0) {
        cumDist += step;
        if (dz > 0) ascentM += dz;
        const sl = sampleStepSlope((p0.x + hitPt.x) * 0.5, (p0.y + hitPt.y) * 0.5);
        maxSlopeDeg = Math.max(maxSlopeDeg, sl);
        if (sl < 15.0) easyLen += step;
        else if (sl <= 25.0) modLen += step;
        else hazLen += step;
        trimmedPts.push(hitPt);
      }
      break;
    }

    const dz = p1.elevation - p0.elevation;
    const step = Math.hypot(p1.x - p0.x, p1.y - p0.y, dz);
    cumDist += step;
    if (dz > 0) ascentM += dz;
    const sl = sampleStepSlope((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
    maxSlopeDeg = Math.max(maxSlopeDeg, sl);
    if (sl < 15.0) easyLen += step;
    else if (sl <= 25.0) modLen += step;
    else hazLen += step;
    trimmedPts.push(p1);
  }

  const invTotal = cumDist > 0 ? 100.0 / cumDist : 0;
  return {
    points: trimmedPts,
    distKm: cumDist / 1000.0,
    ascentM,
    maxSlopeDeg,
    pctEasy: easyLen * invTotal,
    pctMod: modLen * invTotal,
    pctHaz: hazLen * invTotal
  };
}

function buildCuriosityRefRoute() {
  if (!routePoints.length || !level01?.goal?.coreZoneBounds) return;
  trimmedCuriosityData = computeTrimmedCuriosityRoute(routePoints, level01.goal.coreZoneBounds);
  if (!trimmedCuriosityData || !trimmedCuriosityData.points.length) return;

  const pts = trimmedCuriosityData.points;
  const flatPositions = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const { meshX, meshZ } = localToMesh(pt.x, pt.y);
    flatPositions[i * 3] = meshX;
    flatPositions[i * 3 + 1] = (pt.elevation - minElev) * currentExag + 7.2 * currentExag;
    flatPositions[i * 3 + 2] = meshZ;
  }

  curiosityRefGeom = new LineGeometry();
  curiosityRefGeom.setPositions(flatPositions);

  const curMat = new LineMaterial({
    color: 0xcbd5e1,
    linewidth: 2.0,
    dashed: true,
    dashScale: 1,
    dashSize: 28,
    gapSize: 18,
    transparent: true,
    opacity: 0.78,
    depthTest: true,
    depthWrite: false
  });
  curMat.resolution.set(window.innerWidth, window.innerHeight);

  curiosityRefLine = new Line2(curiosityRefGeom, curMat);
  curiosityRefLine.computeLineDistances();
  // Keep Curiosity reference dashed path strictly below player A/B/C routes
  curiosityRefLine.renderOrder = 8;
  curiosityRefLine.userData = { isCuriosityRefLine: true };

  trimmedCuriosityData.flatPositions = flatPositions;
  curiosityRefGroup = new THREE.Group();
  curiosityRefGroup.add(curiosityRefLine);
  scene.add(curiosityRefGroup);
}

// --- Route, Trail, and Rover Construction ---
function createRouteAndRover() {
  routeGroup = new THREE.Group();

  // Precompute distance and cumulative uphill climb
  let cumDist = 0.0;
  let cumClimb = 0.0;
  routePoints[0].cumDist = 0.0;
  routePoints[0].cumClimb = 0.0;

  for (let i = 1; i < routePoints.length; i++) {
    const p0 = routePoints[i - 1];
    const p1 = routePoints[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.elevation - p0.elevation;
    const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
    cumDist += step;
    if (dz > 0) cumClimb += dz;
    p1.cumDist = cumDist;
    p1.cumClimb = cumClimb;
  }

  // Build Route Positions & Colors
  const positions = [];
  const colorsSlope = [];
  const colorsSingle = [];
  const colorsNeutral = [];

  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    const { meshX, meshZ } = localToMesh(pt.x, pt.y);
    const meshY = (pt.elevation - minElev) * currentExag + 6.0 * currentExag; // Drape cleanly above surface
    positions.push(meshX, meshY, meshZ);

    // Sample slope at point
    const { col, row } = localToGrid(pt.x, pt.y);
    const s = sampleGridBilinear(rawSlopes, col, row);
    if (s < 15.0) {
      colorsSlope.push(0.18, 0.8, 0.44); // Green (<15)
    } else if (s <= 25.0) {
      colorsSlope.push(0.95, 0.77, 0.06); // Yellow (15-25)
    } else {
      colorsSlope.push(0.91, 0.3, 0.24); // Red (>25)
    }
    colorsSingle.push(0.0, 0.85, 1.0); // Cyan
    colorsNeutral.push(0.65, 0.70, 0.75); // Neutral slate (reference)
  }

  // 1. Full continuous route line
  const routeGeo = new THREE.BufferGeometry();
  routeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  routeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colorsNeutral, 3));
  routeGeo.userData = { colorsSlope, colorsSingle, colorsNeutral };

  const routeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: 3,
    depthTest: true,
    depthWrite: false
  });
  routeLine = new THREE.Line(routeGeo, routeMat);
  routeGroup.add(routeLine);

  // 2. Active glowing trail behind rover
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(), 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    linewidth: 4,
    depthTest: true,
    depthWrite: false
  });
  trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.geometry.setDrawRange(0, 1);
  routeGroup.add(trailLine);

  // 3. 3D Rover Token
  roverGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(16, 8, 12),
    new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.3, metalness: 0.7 })
  );
  body.position.y = 5;
  roverGroup.add(body);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 })
  );
  mast.position.set(4, 11, 0);
  roverGroup.add(mast);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 5),
    new THREE.MeshBasicMaterial({ color: 0x00d2ff })
  );
  head.position.set(4, 17, 0);
  roverGroup.add(head);

  // Pulsing halo beacon
  const ringGeo = new THREE.RingGeometry(14, 20, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85
  });
  roverBeacon = new THREE.Mesh(ringGeo, ringMat);
  roverBeacon.position.y = 1.5;
  roverGroup.add(roverBeacon);

  routeGroup.add(roverGroup);
  scene.add(routeGroup);

  buildCuriosityRefRoute();
  updateTimelineReplay(3721);
}

function updateRouteColoring() {
  if (!routeLine) return;
  const mode = routeColorMode ? routeColorMode.value : 'neutral';
  let colors;
  if (mode === 'neutral') {
    colors = routeLine.geometry.userData.colorsNeutral;
  } else if (mode === 'single') {
    colors = routeLine.geometry.userData.colorsSingle;
  } else {
    colors = routeLine.geometry.userData.colorsSlope;
  }
  routeLine.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  routeLine.geometry.attributes.color.needsUpdate = true;
}

// --- Science Waypoints, START Flag & Boxwork Core Zone ---
const SCIENCE_TARGETS = [
  { sol: 4534, label: 'Sol 4534', title: 'Boxwork campaign begins (Phase 1)', color: 0xff007f },
  { sol: 4602, label: 'Sols 4602-4603', title: 'Top of the ridge, start of the main boxwork region', color: 0xf1c40f },
  { sol: 4604, label: 'Sols 4604-4606', title: 'Main exposure of boxwork structures', color: 0x00d2ff },
  { sol: 4716, label: 'Sols 4716-4722', title: 'Nevado Sajama drill', color: 0x2ecc71 },
  { sol: 4804, label: 'Sols 4804-4811', title: 'Nevado Sajama 2 drill', color: 0xe67e22 }
];

function createScienceMarkersAndFlag() {
  scienceMarkersGroup = new THREE.Group();

  // START Flag at Sol 3721 (North edge entry)
  startFlagGroup = new THREE.Group();
  const pStart = routePoints[0];
  const { meshX: sx, meshZ: sz } = localToMesh(pStart.x, pStart.y);
  const sy = (pStart.elevation - minElev) * currentExag;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 50, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 })
  );
  pole.position.set(sx, sy + 25 * currentExag, sz);
  startFlagGroup.add(pole);

  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(26, -9);
  flagShape.lineTo(0, -18);
  flagShape.closePath();
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(flagShape),
    new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide })
  );
  flag.position.set(sx, sy + 46 * currentExag, sz);
  startFlagGroup.add(flag);

  scene.add(startFlagGroup);

  // 5 Science Milestone Markers
  SCIENCE_TARGETS.forEach(item => {
    let closestPt = routePoints[0];
    let minD = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const d = Math.abs(routePoints[i].sol - item.sol);
      if (d < minD) {
        minD = d;
        closestPt = routePoints[i];
      }
    }

    const { meshX, meshZ } = localToMesh(closestPt.x, closestPt.y);
    const my = (closestPt.elevation - minElev) * currentExag + 8.0 * currentExag;

    const l1Target = level01.scienceTargets.find(t => t.sol === item.sol);
    const pin = new THREE.Mesh(
      new THREE.OctahedronGeometry(11, 0),
      new THREE.MeshStandardMaterial({
        color: item.color,
        emissive: item.color,
        emissiveIntensity: 0.5,
        roughness: 0.2
      })
    );
    pin.position.set(meshX, my, meshZ);
    pin.userData = {
      isSciencePin: true,
      targetSol: item.sol,
      title: item.title,
      solLabel: item.label,
      pt: closestPt,
      markerKey: l1Target ? l1Target.id : null
    };
    scienceMarkersGroup.add(pin);

    // Beacon beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 8),
      new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.5 })
    );
    beam.position.set(meshX, my + 30, meshZ);
    beam.userData = { targetSol: item.sol, markerKey: l1Target ? l1Target.id : null };
    scienceMarkersGroup.add(beam);
  });

  scene.add(scienceMarkersGroup);
}

function createBoxworkCoreZone() {
  boxworkGroup = new THREE.Group();

  // Exactly 153 x 283 m core zone from sols 4600-4805:
  // X: [2355.6, 2508.6] (width = 153 m)
  // Y: [2337.5, 2620.5] (length = 283 m)
  const xMin = 2355.6;
  const xMax = 2508.6;
  const yMin = 2337.5;
  const yMax = 2620.5;

  const perimeter = [];
  const steps = 25;
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMin + (s / steps) * (xMax - xMin), y: yMin });
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMax, y: yMin + (s / steps) * (yMax - yMin) });
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMax - (s / steps) * (xMax - xMin), y: yMax });
  for (let s = 0; s < steps; s++) perimeter.push({ x: xMin, y: yMax - (s / steps) * (yMax - yMin) });
  perimeter.push(perimeter[0]);

  const positions = [];
  const basePts = [];
  perimeter.forEach(p => {
    const { meshX, meshZ } = localToMesh(p.x, p.y);
    const { col, row } = localToGrid(p.x, p.y);
    const elev = sampleGridBilinear(rawHeights, col, row);
    basePts.push({ elev });
    positions.push(meshX, (elev - minElev) * currentExag + 5.0 * currentExag, meshZ);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xf1c40f, linewidth: 2, depthTest: true, depthWrite: false });
  const zoneLine = new THREE.Line(geo, mat);
  zoneLine.userData = { basePts };
  boxworkGroup.add(zoneLine);

  scene.add(boxworkGroup);
}

// --- Atmosphere: Sun & Drifting Dust ---
function createDustParticles() {
  if (dustParticles) {
    scene.remove(dustParticles);
    dustParticles.geometry.dispose();
  }

  const count = QUALITY_SETTINGS[currentQuality].dustCount;
  const posArr = new Float32Array(count * 3);
  dustVelocities = [];

  for (let i = 0; i < count; i++) {
    posArr[i * 3] = (Math.random() - 0.5) * 5000;
    posArr[i * 3 + 1] = Math.random() * 800 + 20;
    posArr[i * 3 + 2] = (Math.random() - 0.5) * 5000;
    dustVelocities.push({
      vx: (Math.random() - 0.3) * 1.5,
      vy: (Math.random() - 0.5) * 0.3,
      vz: (Math.random() - 0.5) * 1.2
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  dustParticles = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xdf8858, size: 4.0, transparent: true, opacity: 0.55, depthWrite: false })
  );
  dustParticles.visible = lyrDust.checked;
  scene.add(dustParticles);
}

function updateDustParticles() {
  if (!dustParticles || !lyrDust.checked) return;
  const pos = dustParticles.geometry.attributes.position;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    let x = pos.getX(i) + dustVelocities[i].vx;
    let y = pos.getY(i) + dustVelocities[i].vy;
    let z = pos.getZ(i) + dustVelocities[i].vz;
    if (x > 2500) x = -2500;
    if (x < -2500) x = 2500;
    if (z > 2500) z = -2500;
    if (z < -2500) z = 2500;
    if (y > 900) y = 20;
    if (y < 20) y = 900;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}

function updateTimeOfDay(hour) {
  currentTimeHour = hour;
  const h = Math.floor(hour);
  const m = Math.floor((hour % 1) * 60);
  timeVal.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

  const solarAngle = ((hour - 6.0) / 12.0) * Math.PI;
  const sunElevation = Math.sin(solarAngle);
  const sunAzimuth = Math.cos(solarAngle);

  if (sunLight) {
    sunLight.position.set(-sunAzimuth * 5800, Math.max(200, sunElevation * 4800), -1500 + sunAzimuth * 1200);
    const t = Math.max(0.05, Math.sin(solarAngle));
    const sunColor = new THREE.Color().lerpColors(new THREE.Color(0xff6020), new THREE.Color(0xfff5ea), t);
    sunLight.color.copy(sunColor);
    sunLight.intensity = 0.6 + 2.0 * t;

    const fogColor = new THREE.Color().lerpColors(new THREE.Color(0x180b06), new THREE.Color(0x351d14), t);
    scene.fog.color.copy(fogColor);
    scene.background.copy(fogColor);
  }
}

// --- Dynamic Exaggeration ---
function applyVerticalExaggeration(exag, { skipNormals = false, syncSlider = true } = {}) {
  currentExag = exag;
  if (syncSlider && exagVal) exagVal.textContent = `${exag.toFixed(1)}×`;

  if (terrainGeometry) updateGeometryHeights(terrainGeometry, skipNormals);

  if (routeLine) {
    const pos = routeLine.geometry.attributes.position;
    const tPos = trailLine.geometry.attributes.position;
    for (let i = 0; i < routePoints.length; i++) {
      const pt = routePoints[i];
      const my = (pt.elevation - minElev) * currentExag + 6.0 * currentExag;
      pos.setY(i, my);
      tPos.setY(i, my);
    }
    pos.needsUpdate = true;
    tPos.needsUpdate = true;
  }

  if (roverGroup && routePoints.length > 0) updateTimelineReplay(currentReplaySol);

  if (scienceMarkersGroup) {
    scienceMarkersGroup.children.forEach(c => {
      if (c.userData && c.userData.pt) {
        c.position.y = (c.userData.pt.elevation - minElev) * currentExag + 8.0 * currentExag;
      }
    });
  }

  if (startFlagGroup) {
    const pStart = routePoints[0];
    const sy = (pStart.elevation - minElev) * currentExag;
    startFlagGroup.children[0].position.y = sy + 25 * currentExag;
    startFlagGroup.children[1].position.y = sy + 46 * currentExag;
  }

  if (missionElements) {
    missionElements.updateExaggeration(currentExag);
  }
  if (routeCalc) {
    routeCalc.updateExaggeration(currentExag);
  }
  if (surveyKit) {
    surveyKit.updateExaggeration(currentExag);
  }
  if (dustZonesOverlay) {
    dustZonesOverlay.updateExaggeration(currentExag);
  }
  if (roverDustStormParticles) {
    roverDustStormParticles.setExaggeration(currentExag);
  }

  if (boxworkGroup && boxworkGroup.children[0]) {
    const bLine = boxworkGroup.children[0];
    const bPts = bLine.userData?.basePts;
    if (bPts) {
      const bPos = bLine.geometry.attributes.position;
      for (let i = 0; i < bPts.length; i++) {
        bPos.setY(i, (bPts[i].elev - minElev) * currentExag + 5.0 * currentExag);
      }
      bPos.needsUpdate = true;
    }
  }

  if (pinnedReticle && pinnedReticle.visible && pinnedPoint) {
    const { col, row } = localToGrid(pinnedPoint.lx, pinnedPoint.ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    pinnedReticle.position.y = (elev - minElev) * currentExag + 2.0;
  }

  if (cursorReticle && cursorReticle.visible) {
    const { lx, ly } = meshToLocal(cursorReticle.position.x, cursorReticle.position.z);
    const { col, row } = localToGrid(lx, ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    cursorReticle.position.y = (elev - minElev) * currentExag + 2.0;
  }

  updateStartAndGoalMarkerPositions();

  if (curiosityRefGeom && trimmedCuriosityData && curiosityRefLine) {
    const pts = trimmedCuriosityData.points;
    const flat = trimmedCuriosityData.flatPositions;
    for (let i = 0; i < pts.length; i++) {
      flat[i * 3 + 1] = (pts[i].elevation - minElev) * currentExag + 7.2 * currentExag;
    }
    curiosityRefGeom.setPositions(flat);
    curiosityRefLine.computeLineDistances();
  }

  if (candidateLines) {
    Object.values(candidateLines).forEach(candGroup => {
      const wps = candGroup.userData?.waypoints;
      const geom = candGroup.userData?.geom;
      if (wps && geom) {
        const flat = candGroup.userData.flatPositions;
        for (let i = 0; i < wps.length; i++) {
          flat[i * 3 + 1] = (wps[i].z - minElev) * currentExag + 9.0 * currentExag;
        }
        geom.setPositions(flat);
      }
      if (candGroup.userData?.chevrons && wps) {
        candGroup.userData.arcTable = buildRouteArcTable(wps);
      }
    });
    updateCandidateRouteChevrons(performance.now());
  }
}

// --- Timeline Replay Engine ---
function updateTimelineReplay(targetSol) {
  currentReplaySol = Math.max(3721, Math.min(4868, targetSol));
  tlSlider.value = currentReplaySol;
  tlSol.textContent = `SOL ${Math.floor(currentReplaySol)}`;

  // Find index at or before currentReplaySol
  let ptIndex = 0;
  for (let i = 0; i < routePoints.length; i++) {
    if (routePoints[i].sol <= currentReplaySol) {
      ptIndex = i;
    } else {
      break;
    }
  }

  const curPt = routePoints[ptIndex];

  // Move Rover Token
  if (roverGroup) {
    const { meshX, meshZ } = localToMesh(curPt.x, curPt.y);
    const meshY = (curPt.elevation - minElev) * currentExag + 4.0 * currentExag;
    roverGroup.position.set(meshX, meshY, meshZ);

    if (ptIndex < routePoints.length - 1) {
      const nextPt = routePoints[ptIndex + 1];
      const { meshX: nx, meshZ: nz } = localToMesh(nextPt.x, nextPt.y);
      roverGroup.rotation.y = Math.atan2(nx - meshX, nz - meshZ);
    }

    // Follow camera if enabled
    if (tlFollow && tlFollow.checked) {
      controls.target.set(meshX, meshY, meshZ);
    }
  }

  // Update glowing active trail range
  if (trailLine) {
    trailLine.geometry.setDrawRange(0, ptIndex + 1);
  }

  // Update bottom telemetry bar
  tsSol.textContent = `${Math.floor(curPt.sol)}`;
  tsElev.textContent = `${curPt.elevation.toFixed(1)} m`;
  tsDist.textContent = curPt.cumDist >= 1000 ? `${(curPt.cumDist / 1000).toFixed(2)} km` : `${curPt.cumDist.toFixed(1)} m`;
  tsClimb.textContent = `+${curPt.cumClimb.toFixed(1)} m`;
  const net = curPt.elevation - routePoints[0].elevation;
  tsNet.textContent = `${net >= 0 ? '+' : ''}${net.toFixed(1)} m`;
}

// --- Hover & Click Point Inspector ---
function samplePixelFromContext(ctx, width, height, lx, ly) {
  if (!ctx) return null;
  const px = Math.floor((lx / TERRAIN_WIDTH_M) * width);
  const py = Math.floor((1.0 - ly / TERRAIN_HEIGHT_M) * height);
  const cx = Math.max(0, Math.min(width - 1, px));
  const cy = Math.max(0, Math.min(height - 1, py));
  const data = ctx.getImageData(cx, cy, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

function updatePointInspector(lx, ly) {
  const { col, row } = localToGrid(lx, ly);
  const elev = sampleGridBilinear(rawHeights, col, row);
  const slope = sampleGridBilinear(rawSlopes, col, row);
  const { lon, lat } = localToMarsGeo(lx, ly);

  // Slope tier
  let tierLabel = '< 15° Easy';
  let tierClass = 'tier-easy';
  if (slope >= 25.0) {
    tierLabel = '> 25° Hazardous';
    tierClass = 'tier-haz';
  } else if (slope >= 15.0) {
    tierLabel = '15°–25° Moderate';
    tierClass = 'tier-mod';
  }

  // Nearest rover Sol
  let minD2 = Infinity;
  let nearestPt = null;
  for (let i = 0; i < routePoints.length; i++) {
    const p = routePoints[i];
    const dx = p.x - lx;
    const dy = p.y - ly;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) {
      minD2 = d2;
      nearestPt = p;
    }
  }
  const distM = Math.sqrt(minD2);

  // Real CRISM & THEMIS values
  const hyd = samplePixelFromContext(crismHydCtx, 27, 28, lx, ly);
  const phy = samplePixelFromContext(crismPhyCtx, 27, 28, lx, ly);
  const th = samplePixelFromContext(themisCtx, 50, 50, lx, ly);

  // Update DOM Measured
  iElev.textContent = `${elev.toFixed(1)} m`;
  iSlope.textContent = `${slope.toFixed(1)}°`;
  iTier.textContent = tierLabel;
  iTier.className = `iv ${tierClass}`;
  iXy.textContent = `X ${lx.toFixed(0)} m, Y ${ly.toFixed(0)} m`;
  iLonlat.textContent = `${lon.toFixed(4)}°E, ${Math.abs(lat).toFixed(4)}°S`;

  const curScreen = levelState.getState().screen;
  const hidePreLockPrivate =
    currentViewMode === 'MISSION' &&
    (curScreen === GAME_STATES.BRIEFING || curScreen === GAME_STATES.ANALYZE || curScreen === GAME_STATES.CHOOSE);

  if (iSolRow) {
    iSolRow.style.display = hidePreLockPrivate ? 'none' : '';
  }
  if (nearestPt) {
    if (hidePreLockPrivate) {
      iSol.textContent = 'Hidden until lock-in';
    } else {
      const distStr = distM < 8 ? 'At rover waypoint' : `${Math.round(distM)} m away`;
      iSol.textContent = `Sol ${nearestPt.sol} (${distStr})`;
    }
  }

  if (hyd) {
    iCrismHyd.textContent = hyd.a > 0 ? `R:${hyd.r} G:${hyd.g} B:${hyd.b} (Covered)` : 'No coverage';
  } else {
    iCrismHyd.textContent = 'Loading…';
  }

  if (phy) {
    iCrismPhy.textContent = phy.a > 0 ? `R:${phy.r} G:${phy.g} B:${phy.b} (Covered)` : 'No coverage';
  } else {
    iCrismPhy.textContent = 'Loading…';
  }

  if (th) {
    iThemis.textContent = `${th.r} DN (relative)`;
  } else {
    iThemis.textContent = 'Loading…';
  }

  // Simulated Game Values (deterministic functions from docs/SIMULATED_DATA.md)
  const baseRate = 20.0;
  const elevFactor = 1.0 + (elev - (-4131.74)) / 3000.0 * 0.15;
  const timeFactor = 1.0 + 0.08 * Math.cos((currentTimeHour - 14.0) * Math.PI / 12.0);
  const doseRate = baseRate * elevFactor * timeFactor;
  iRad.textContent = `${doseRate.toFixed(1)} µSv/h`;

  const baseTau = 0.60;
  const spatialWave = 0.15 * Math.sin(lx / 800.0) * Math.cos(ly / 600.0);
  const elevEffect = 0.05 * (elev - (-4131.74)) / 700.0;
  const tau = baseTau + spatialWave + elevEffect;
  const visKm = 15.0 / Math.max(tau, 0.1);
  iDust.textContent = `τ = ${tau.toFixed(2)} (${visKm.toFixed(1)} km)`;

  const noonTemp = -15.0;
  const diurnalAmp = 45.0;
  const diurnalPhase = Math.cos((currentTimeHour - 14.0) * Math.PI / 12.0);
  const surfaceTemp = noonTemp + diurnalAmp * diurnalPhase - 0.3 * slope - 0.005 * (elev - (-4131.74));
  iTemp.textContent = `${surfaceTemp.toFixed(1)} °C`;

  const baseWind = 5.0 + 3.0 * Math.abs(Math.sin((currentTimeHour - 12.0) * Math.PI / 12.0)) + 1.5 * Math.sin(slope * Math.PI / 60.0);
  const windDir = Math.round(((lx * 7.3 + ly * 13.1) % 360 + 360) % 360);
  iWind.textContent = `${baseWind.toFixed(1)} m/s, ${windDir}°`;

  const sigStrength = -70.0 + 3.0 * (elev - (-4131.74)) / 700.0 - 0.15 * slope;
  iSignal.textContent = `${sigStrength.toFixed(1)} dBm`;

  const slopeCost = Math.min(slope / 35.0 * 60.0, 60.0);
  const roughnessCost = Math.min(slope * slope / 900.0 * 25.0, 25.0);
  const elevCost = 15.0 * (elev - (-4131.74)) / 700.0;
  const mobCost = Math.min(100.0, Math.max(0.0, slopeCost + roughnessCost + elevCost));

  const hideMobilityPreLock = hidePreLockPrivate;

  if (iMobilityRow) {
    iMobilityRow.style.display = hideMobilityPreLock ? 'none' : '';
  }
  if (iMobility) {
    iMobility.textContent = hideMobilityPreLock ? 'Hidden until lock-in' : `${Math.round(mobCost)} / 100`;
  }
}

// --- 3D Cursor Reticle & Surface Pointers ---
function createReticles() {
  // 1. Interactive Hover Cursor Reticle (targeting ring on the Martian surface)
  cursorReticle = new THREE.Group();

  // Outer segmented ring
  const ringGeo = new THREE.RingGeometry(22, 26, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff7733,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false
  });
  cursorReticle.add(new THREE.Mesh(ringGeo, ringMat));

  // Inner center dot
  const dotGeo = new THREE.RingGeometry(0, 3.5, 16);
  dotGeo.rotateX(-Math.PI / 2);
  cursorReticle.add(new THREE.Mesh(dotGeo, ringMat));

  // 4 Targeting crosshair tick marks pointing outward
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.95, depthWrite: false });
  const tGeoZ = new THREE.BoxGeometry(1.8, 0.6, 10);
  const tickN = new THREE.Mesh(tGeoZ, tickMat);
  tickN.position.z = -31;
  const tickS = new THREE.Mesh(tGeoZ, tickMat);
  tickS.position.z = 31;
  const tGeoX = new THREE.BoxGeometry(10, 0.6, 1.8);
  const tickE = new THREE.Mesh(tGeoX, tickMat);
  tickE.position.x = 31;
  const tickW = new THREE.Mesh(tGeoX, tickMat);
  tickW.position.x = -31;
  cursorReticle.add(tickN, tickS, tickE, tickW);

  cursorReticle.visible = false;
  scene.add(cursorReticle);

  // 2. Pinned Point Reticle & Beacon
  pinnedReticle = new THREE.Group();

  const pRingGeo = new THREE.RingGeometry(20, 26, 32);
  pRingGeo.rotateX(-Math.PI / 2);
  const pRingMat = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  pinnedReticle.add(new THREE.Mesh(pRingGeo, pRingMat));

  // Vertical needle & beacon diamond
  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 45, 8),
    new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.85, depthWrite: false })
  );
  needle.position.y = 22.5;
  pinnedReticle.add(needle);

  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(6, 0),
    new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00aaff,
      emissiveIntensity: 0.7,
      roughness: 0.2
    })
  );
  beacon.position.y = 48;
  pinnedReticle.add(beacon);

  pinnedReticle.visible = false;
  scene.add(pinnedReticle);
}

// Raycaster & Mouse Handling
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9999, -9999);

function getTerrainIntersection(ray) {
  if (!rawHeights) return null;
  const orig = ray.origin;
  const dir = ray.direction;
  if (Math.abs(dir.y) < 1e-5) return null;

  // Start with plane at median elevation
  let planeY = ((minElev + maxElev) * 0.5 - minElev) * currentExag;
  let t = (planeY - orig.y) / dir.y;
  if (t < 0) return null;

  // 3 iterations of secant / plane refinement
  for (let iter = 0; iter < 3; iter++) {
    const x = orig.x + t * dir.x;
    const z = orig.z + t * dir.z;
    if (Math.abs(x) > 2500 || Math.abs(z) > 2500) break;
    const { lx, ly } = meshToLocal(x, z);
    const { col, row } = localToGrid(lx, ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    planeY = (elev - minElev) * currentExag;
    t = (planeY - orig.y) / dir.y;
    if (t < 0) return null;
  }

  const hitX = orig.x + t * dir.x;
  const hitZ = orig.z + t * dir.z;
  if (Math.abs(hitX) > 2500 || Math.abs(hitZ) > 2500) return null;

  const { lx, ly } = meshToLocal(hitX, hitZ);
  const { col, row } = localToGrid(lx, ly);
  const elev = sampleGridBilinear(rawHeights, col, row);
  const hitY = (elev - minElev) * currentExag;

  return { x: hitX, y: hitY, z: hitZ, lx, ly, elev };
}

function hideHoverTooltip() {
  if (hoverTooltip) hoverTooltip.classList.add('hidden');
}

function updateHoverTooltip(hit, clientX, clientY, hoveredRouteName = null) {
  if (!hoverTooltip || !hit || currentViewMode !== 'MISSION' || isPinned || levelState.getState().screen === GAME_STATES.BRIEFING) {
    hideHoverTooltip();
    return;
  }
  if (htRouteRow && htRoute) {
    if (hoveredRouteName) {
      htRoute.textContent = hoveredRouteName;
      htRouteRow.classList.remove('hidden');
    } else {
      htRouteRow.classList.add('hidden');
    }
  }
  const { col, row } = localToGrid(hit.lx, hit.ly);
  const slope = sampleGridBilinear(rawSlopes, col, row);
  let tierLabel = '< 15° Easy';
  let tierClass = 'tier-easy';
  if (slope >= 25.0) {
    tierLabel = '> 25° Hazardous';
    tierClass = 'tier-haz';
  } else if (slope >= 15.0) {
    tierLabel = '15°–25° Moderate';
    tierClass = 'tier-mod';
  }

  if (htElev) htElev.textContent = `${hit.elev.toFixed(1)} m`;
  if (htTier) {
    htTier.textContent = tierLabel;
    htTier.className = tierClass;
  }
  hoverTooltip.style.left = `${Math.min(window.innerWidth - 185, clientX + 16)}px`;
  hoverTooltip.style.top = `${Math.max(42, Math.min(window.innerHeight - 60, clientY + 14))}px`;
  hoverTooltip.classList.remove('hidden');
}

function findHitMarkerKey() {
  if (!mapLabels) return null;
  const targets = [];
  if (startMarker) targets.push(startMarker);
  if (goalMarker) targets.push(goalMarker);
  if (scienceMarkersGroup && scienceMarkersGroup.visible) {
    scienceMarkersGroup.children.forEach(c => {
      if (c.visible && c.userData && c.userData.markerKey) targets.push(c);
    });
  }
  if (!targets.length) return null;
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj) {
    if (obj.userData && obj.userData.markerKey) return obj.userData.markerKey;
    obj = obj.parent;
  }
  return null;
}

function findHitMissionElement() {
  if (!missionElements || currentViewMode !== 'MISSION') return null;
  const targets = missionElements.getRaycastTargets();
  if (!targets.length) return null;
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj) {
    if (obj.userData && obj.userData.elementId) {
      return missionElements.getElementById(obj.userData.elementId);
    }
    obj = obj.parent;
  }
  return null;
}

function findHitCandidateRouteId() {
  if (!plannerGroup) return null;
  const lineTargets = Object.values(candidateLines).filter(g => g && g.visible);
  if (!lineTargets.length) return null;
  const hits = raycaster.intersectObjects(lineTargets, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && obj !== plannerGroup) {
    if (obj.userData && obj.userData.isCandidateLine) return obj.userData.id;
    obj = obj.parent;
  }
  return null;
}

function findHitCuriosityRoute() {
  if (!curiosityRefLine || !curiosityRefGroup || !curiosityRefGroup.visible) return false;
  const hits = raycaster.intersectObject(curiosityRefLine, false);
  return hits.length > 0;
}

function handlePointerInspection(clientX, clientY) {
  if (levelState && levelState.getState().screen === GAME_STATES.EXPLORE && !awaitingSurveyResultContinue) {
    if (cursorReticle) cursorReticle.visible = false;
    hideHoverTooltip();
    return;
  }

  const now = performance.now();
  if (now - lastRaycastTime < 33) return; // Throttle to 30 FPS
  lastRaycastTime = now;

  raycaster.setFromCamera(mouse, camera);

  // 1. Check 3D Mission Gameplay Elements & Core Markers hover card first
  const hitElement = findHitMissionElement();
  if (hitElement && mapLabels) {
    if (hoveredCandidateId !== null) {
      hoveredCandidateId = null;
      updateCandidateRouteStyles();
    }
    const card = missionElements.buildElementCardPayload(hitElement);
    if (card) {
      mapLabels.showHoverCard(card, clientX, clientY);
      hideHoverTooltip();
      renderer.domElement.style.cursor = 'pointer';
      return;
    }
  }

  const hitMarkerKey = findHitMarkerKey();
  if (hitMarkerKey && mapLabels) {
    if (hoveredCandidateId !== null) {
      hoveredCandidateId = null;
      updateCandidateRouteStyles();
    }
    const anchor = mapLabels.getAnchorById(hitMarkerKey);
    if (anchor) {
      mapLabels.showHoverCard(anchor, clientX, clientY);
      hideHoverTooltip();
      renderer.domElement.style.cursor = 'pointer';
      return;
    }
  } else if (mapLabels && !isHoveringLabelDom) {
    mapLabels.hideHoverCard();
  }

  // 2. Check candidate route hover (Line2) above Curiosity reference line
  const nextRouteHoverId = findHitCandidateRouteId();
  if (nextRouteHoverId !== hoveredCandidateId) {
    hoveredCandidateId = nextRouteHoverId;
    updateCandidateRouteStyles();
  }

  if (!hoveredCandidateId && findHitCuriosityRoute() && mapLabels) {
    const curAnchor = mapLabels.getAnchorById('curiosity-ref-path');
    if (curAnchor) {
      mapLabels.showHoverCard(curAnchor, clientX, clientY);
      hideHoverTooltip();
      renderer.domElement.style.cursor = 'pointer';
      return;
    }
  }

  renderer.domElement.style.cursor = hoveredCandidateId ? 'pointer' : '';

  if (isPinned) {
    hideHoverTooltip();
    return;
  }

  const hoveredCand = hoveredCandidateId ? plannerCandidates.find(c => c.id === hoveredCandidateId) : null;
  const hit = getTerrainIntersection(raycaster.ray);
  if (hit) {
    lastTerrainHit = { lx: hit.lx, ly: hit.ly };
    updatePointInspector(hit.lx, hit.ly);
    updateHoverTooltip(hit, clientX, clientY, hoveredCand ? hoveredCand.name : null);
    if (cursorReticle) {
      cursorReticle.position.set(hit.x, hit.y + 2.0, hit.z);
      cursorReticle.visible = true;
    }
  } else {
    hideHoverTooltip();
    if (cursorReticle) cursorReticle.visible = false;
  }
}

// --- Cinematic Fly-in Intro ---
let isIntroActive = false;
let introStartTime = 0;
const INTRO_DURATION = 4000;

function startCinematicIntro() {
  isIntroActive = true;
  document.body.classList.add('cinematic-intro-active');
  btnSkipIntro.style.display = 'block';
  panelPrefs.MISSION.plannerCollapsed = true;
  syncPanelsToViewMode();

  const startCam = new THREE.Vector3(0, 7500, 4500);
  const startTarget = new THREE.Vector3(0, 200, 0);

  const { meshX, meshZ } = localToMesh(2430, 2480);
  const endTarget = new THREE.Vector3(meshX, (-3613.0 - minElev) * currentExag, meshZ);
  const endCam = new THREE.Vector3(meshX + 180, endTarget.y + 700, meshZ + 900);

  camera.position.copy(startCam);
  controls.target.copy(startTarget);
  controls.update();

  introStartTime = performance.now();

  function animateIntro(now) {
    if (!isIntroActive) return;
    const elapsed = now - introStartTime;
    const p = Math.min(1.0, elapsed / INTRO_DURATION);
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    camera.position.lerpVectors(startCam, endCam, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();

    if (p < 1.0) {
      requestAnimationFrame(animateIntro);
    } else {
      endCinematicIntro();
    }
  }
  requestAnimationFrame(animateIntro);
}

function endCinematicIntro() {
  if (!isIntroActive) return;
  isIntroActive = false;
  document.body.classList.remove('cinematic-intro-active');
  btnSkipIntro.style.display = 'none';

  const { meshX, meshZ } = localToMesh(2430, 2480);
  const targetY = (-3613.0 - minElev) * currentExag;
  camera.position.set(meshX + 180, targetY + 700, meshZ + 900);
  controls.target.set(meshX, targetY, meshZ);
  controls.update();
  syncPanelsToViewMode();
}

// --- Reset Customization to Standard Defaults ---
function resetCustomizationToStandard() {
  // 1. Terrain satellite
  if (lyrSat) {
    lyrSat.checked = true;
    if (terrainMesh) terrainMesh.visible = true;
  }

  // 2. Vertical Exaggeration -> 1.0x
  if (exagSlider) {
    exagSlider.value = 1.0;
    applyVerticalExaggeration(1.0);
  }

  // 3. Slope Hazard -> off, 65% opacity
  if (lyrSlope) {
    lyrSlope.checked = false;
    if (hazardMesh) hazardMesh.visible = false;
  }
  if (slopeOpacity) {
    slopeOpacity.value = 65;
    if (slopeOv) slopeOv.textContent = '65 %';
    if (hazardMesh) hazardMesh.material.opacity = 0.65;
  }

  // 4. CRISM Hydrated -> off, 80% opacity
  if (lyrCrismHyd) {
    lyrCrismHyd.checked = false;
    if (crismHydMesh) crismHydMesh.visible = false;
  }
  if (crismHydOpacity) {
    crismHydOpacity.value = 80;
    if (crismHydOv) crismHydOv.textContent = '80 %';
    if (crismHydMesh) crismHydMesh.material.opacity = 0.8;
  }

  // 5. CRISM Phyllosilicates -> off, 80% opacity
  if (lyrCrismPhy) {
    lyrCrismPhy.checked = false;
    if (crismPhyMesh) crismPhyMesh.visible = false;
  }
  if (crismPhyOpacity) {
    crismPhyOpacity.value = 80;
    if (crismPhyOv) crismPhyOv.textContent = '80 %';
    if (crismPhyMesh) crismPhyMesh.material.opacity = 0.8;
  }

  // 6. THEMIS -> off, 70% opacity
  if (lyrThemis) {
    lyrThemis.checked = false;
    if (themisMesh) themisMesh.visible = false;
  }
  if (themisOpacity) {
    themisOpacity.value = 70;
    if (themisOv) themisOv.textContent = '70 %';
    if (themisMesh) themisMesh.material.opacity = 0.7;
  }

  // 7. Route & markers -> visible, slope color mode
  if (lyrRoute) {
    lyrRoute.checked = true;
    if (routeGroup) routeGroup.visible = true;
    if (scienceMarkersGroup) scienceMarkersGroup.visible = true;
    if (startFlagGroup) startFlagGroup.visible = true;
  }
  if (lyrBoxwork) {
    lyrBoxwork.checked = true;
    if (boxworkGroup) boxworkGroup.visible = true;
  }
  if (routeColorMode) {
    routeColorMode.value = 'slope';
    updateRouteColoring();
  }

  // 8. Atmosphere: Time 14:00, Dust on
  if (timeSlider) {
    timeSlider.value = 14.0;
    updateTimeOfDay(14.0);
  }
  if (lyrDust) {
    lyrDust.checked = true;
    if (dustParticles) dustParticles.visible = true;
  }

  // 9. Unpin Inspector & Reticle
  isPinned = false;
  pinnedPoint = null;
  if (inspectorMode) inspectorMode.textContent = '(hover)';
  if (inspectorUnpin) inspectorUnpin.style.display = 'none';
  if (pinnedReticle) pinnedReticle.visible = false;
  if (currentViewMode === 'MISSION') {
    panelPrefs.MISSION.inspectorOpen = false;
    panelPrefs.MISSION.plannerCollapsed = true;
  } else {
    panelPrefs.RESEARCH.plannerCollapsed = false;
  }

  // 10. Reset Camera Orbit
  controls.target.set(0, ((-3772.0 - minElev) * currentExag), 0);
  camera.position.set(0, 3400, 3900);
  controls.update();

  // 11. Reset Route Planner (keep Level 1 blinded routes intact)
  plannerStart = { x: level01.start.x, y: level01.start.y };
  plannerGoal = { x: level01.goal.x, y: level01.goal.y };
  isSettingStart = false;
  isSettingGoal = false;
  if (btnSetStart) btnSetStart.classList.remove('active');
  if (btnSetGoal) btnSetGoal.classList.remove('active');
  updateStartAndGoalMarkerPositions();
  plannerCandidates = buildBlindedPlannerCandidates(level01);
  selectedCandidateId = levelState.getState().selectedRouteId || 'route-a';
  renderPlannerTable(plannerCandidates);
  buildCandidateRouteLines(plannerCandidates);
  activeMissionLens = 'satellite';
  activeSunPreset = 'morning';
  setActiveMissionLens('satellite', { immediate: true });
  setSunPreset('morning');
  if (mapLabels) {
    ['mission', 'terrain', 'materials', 'hazards', 'resources', 'science', 'mystery'].forEach(cat => {
      mapLabels.setCategoryEnabled(cat, true);
    });
    mapLabels.setShowAll(false);
    mapLabels.hideDetailCard();
  }
  showAllElements = false;
  if (btnShowAllElements) {
    btnShowAllElements.classList.remove('active');
    btnShowAllElements.setAttribute('aria-pressed', 'false');
  }
  if (missionElements) {
    ['mission', 'terrain', 'materials', 'hazards', 'resources', 'science', 'mystery'].forEach(cat => {
      missionElements.setCategoryEnabled(cat, true);
    });
    missionElements.resetCodex();
  }
  if (codexPanel) codexPanel.classList.add('hidden');
  if (btnCodex) {
    btnCodex.classList.remove('open');
    btnCodex.setAttribute('aria-expanded', 'false');
  }
  if (routeCalc) {
    routeCalc.reset();
    lastCalcMaskedState = null;
  }
  if (surveyKit) {
    surveyKit.reset();
    syncSurveyKitUi();
  }
  if (surveyLog) {
    surveyLog.reset();
  }
  awaitingSurveyResultContinue = false;
  debriefOverlayDismissed = false;
  exploreOverlayDismissed = false;
  frozenSurveyEval = null;
  labelCatChips.forEach(chip => {
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');
  });
  if (btnLabelsShowAll) {
    btnLabelsShowAll.classList.remove('active');
    btnLabelsShowAll.setAttribute('aria-pressed', 'false');
  }
  if (btnLabels) btnLabels.classList.add('active');
  if (labelsDropdown) labelsDropdown.classList.add('hidden');
  applyLayerVisibilityForMode();
  applyGameScreenState(levelState.getState());
  if (plannerPanel && plannerPanel.classList.contains('collapsed')) {
    plannerPanel.classList.remove('collapsed');
    if (btnTogglePlanner) btnTogglePlanner.textContent = '▼ Collapse';
  }

  // Button feedback animation
  if (btnResetCustom) {
    const origText = btnResetCustom.innerHTML;
    btnResetCustom.innerHTML = '✓ Customizations Reset';
    btnResetCustom.style.background = 'rgba(46, 204, 113, 0.25)';
    btnResetCustom.style.borderColor = '#2ecc71';
    btnResetCustom.style.color = '#2ecc71';
    setTimeout(() => {
      btnResetCustom.innerHTML = origText;
      btnResetCustom.style.background = '';
      btnResetCustom.style.borderColor = '';
      btnResetCustom.style.color = '';
    }, 1200);
  }
}

// --- Route Planner Engine & UI ---
function showPlannerToast(message) {
  if (!plannerToast) return;
  ensurePopupInDom(plannerToast);
  plannerToast.textContent = message;
  plannerToast.style.display = 'block';
  plannerToast.style.left = '';
  plannerToast.style.top = '';
  plannerToast.style.right = '';
  plannerToast.style.bottom = '';
  plannerToast.style.transform = '';
  autoDismiss(plannerToast, {
    ms: 3500,
    kind: 'toast',
    onClose: () => {
      plannerToast.style.display = 'none';
    }
  });
}

function createStartAndGoalMarkers() {
  plannerGroup = new THREE.Group();
  scene.add(plannerGroup);

  // 1. START Marker (Green glowing ground anchor, drawn above route lines)
  startMarker = new THREE.Group();
  startMarker.userData = { markerKey: 'start' };
  const sRingGeo = new THREE.RingGeometry(18, 28, 36);
  sRingGeo.rotateX(-Math.PI / 2);
  const sRingMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const sRingMesh = new THREE.Mesh(sRingGeo, sRingMat);
  sRingMesh.position.y = 13.0;
  sRingMesh.renderOrder = 30;
  startMarker.add(sRingMesh);

  const sHaloGeo = new THREE.RingGeometry(30, 44, 36);
  sHaloGeo.rotateX(-Math.PI / 2);
  const sHaloMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const sHaloMesh = new THREE.Mesh(sHaloGeo, sHaloMat);
  sHaloMesh.position.y = 13.0;
  sHaloMesh.renderOrder = 30;
  startMarker.add(sHaloMesh);

  const sPole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 70, 8),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2, depthTest: false })
  );
  sPole.position.y = 35;
  sPole.renderOrder = 31;
  startMarker.add(sPole);

  const sFlagShape = new THREE.Shape();
  sFlagShape.moveTo(0, 0);
  sFlagShape.lineTo(34, -12);
  sFlagShape.lineTo(0, -24);
  sFlagShape.closePath();
  const sFlag = new THREE.Mesh(
    new THREE.ShapeGeometry(sFlagShape),
    new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide, depthTest: false })
  );
  sFlag.position.set(0, 66, 0);
  sFlag.renderOrder = 32;
  startMarker.add(sFlag);

  const sBeacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(9.0, 0),
    new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 0.85, depthTest: false })
  );
  sBeacon.position.y = 74;
  sBeacon.renderOrder = 32;
  startMarker.add(sBeacon);
  plannerGroup.add(startMarker);

  // 2. GOAL Marker (Gold glowing beacon anchor, drawn above route lines)
  goalMarker = new THREE.Group();
  goalMarker.userData = { markerKey: 'goal' };
  const gRingGeo1 = new THREE.RingGeometry(12, 20, 36);
  gRingGeo1.rotateX(-Math.PI / 2);
  const gRingMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const gRingMesh1 = new THREE.Mesh(gRingGeo1, gRingMat);
  gRingMesh1.position.y = 13.0;
  gRingMesh1.renderOrder = 30;
  goalMarker.add(gRingMesh1);

  const gRingGeo2 = new THREE.RingGeometry(26, 38, 36);
  gRingGeo2.rotateX(-Math.PI / 2);
  const gHaloMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const gRingMesh2 = new THREE.Mesh(gRingGeo2, gHaloMat);
  gRingMesh2.position.y = 13.0;
  gRingMesh2.renderOrder = 30;
  goalMarker.add(gRingMesh2);

  const gNeedle = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 76, 8),
    new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.8, depthTest: false })
  );
  gNeedle.position.y = 38;
  gNeedle.renderOrder = 31;
  goalMarker.add(gNeedle);

  const gBeacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(11.0, 0),
    new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xf1c40f, emissiveIntensity: 0.95, depthTest: false })
  );
  gBeacon.position.y = 80;
  gBeacon.renderOrder = 32;
  goalMarker.add(gBeacon);
  plannerGroup.add(goalMarker);

  // 3. Profile Hover Marker (slides along route in 3D when hovering chart)
  profileMarker = new THREE.Group();
  const pRingGeo = new THREE.RingGeometry(14, 18, 32);
  pRingGeo.rotateX(-Math.PI / 2);
  const pRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, depthWrite: false });
  profileMarker.add(new THREE.Mesh(pRingGeo, pRingMat));
  const pSphere = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );
  pSphere.position.y = 6;
  profileMarker.add(pSphere);
  profileMarker.visible = false;
  plannerGroup.add(profileMarker);

  updateStartAndGoalMarkerPositions();
}

function updateStartAndGoalMarkerPositions() {
  if (!rawHeights) return;
  if (startMarker) {
    const { meshX, meshZ } = localToMesh(plannerStart.x, plannerStart.y);
    const { col, row } = localToGrid(plannerStart.x, plannerStart.y);
    const elev = sampleGridBilinear(rawHeights, col, row);
    startMarker.position.set(meshX, (elev - minElev) * currentExag, meshZ);
  }
  if (goalMarker) {
    const { meshX, meshZ } = localToMesh(plannerGoal.x, plannerGoal.y);
    const { col, row } = localToGrid(plannerGoal.x, plannerGoal.y);
    const elev = sampleGridBilinear(rawHeights, col, row);
    goalMarker.position.set(meshX, (elev - minElev) * currentExag, meshZ);
  }
}

function requestRouteComputation() {
  if (!routeWorker) return;
  if (plannerStatus) plannerStatus.textContent = 'Computing optimal routes (A*)…';
  routeWorker.postMessage({
    type: 'compute',
    start: plannerStart,
    goal: plannerGoal
  });
}

const ROUTE_CHEVRON_COUNT = 10;
const prefersReducedMotionQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

const SHARED_CHEVRON_OUTLINE_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 17);
  s.lineTo(13, -10);
  s.lineTo(0, -3);
  s.lineTo(-13, -10);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(-Math.PI / 2);
  return geo;
})();

const SHARED_CHEVRON_INNER_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 13);
  s.lineTo(9.5, -7);
  s.lineTo(0, -1.5);
  s.lineTo(-9.5, -7);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(-Math.PI / 2);
  return geo;
})();

function buildRouteArcTable(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  const pts = [];
  const cum = [0];
  let total = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const { meshX, meshZ } = localToMesh(wp.x, wp.y);
    const meshY = (wp.z - minElev) * currentExag + 11.5 * currentExag;
    pts.push({ x: meshX, y: meshY, z: meshZ });
    if (i > 0) {
      const prev = pts[i - 1];
      total += Math.hypot(meshX - prev.x, meshZ - prev.z);
      cum.push(total);
    }
  }
  return { pts, cum, total };
}

function sampleRouteArcAtU(arcTable, u) {
  if (!arcTable || !arcTable.pts.length || arcTable.total <= 0) return null;
  const target = Math.max(0, Math.min(1, u)) * arcTable.total;
  const { pts, cum } = arcTable;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const p0 = pts[lo];
  const p1 = pts[Math.min(pts.length - 1, lo + 1)];
  const segLen = cum[lo + 1] - cum[lo];
  const frac = segLen > 1e-6 ? (target - cum[lo]) / segLen : 0;
  const x = p0.x + (p1.x - p0.x) * frac;
  const y = p0.y + (p1.y - p0.y) * frac;
  const z = p0.z + (p1.z - p0.z) * frac;
  const yaw = Math.atan2(p1.x - p0.x, p0.z - p1.z);
  return { x, y, z, yaw };
}

function updateCandidateRouteChevrons(now = performance.now()) {
  if (!candidateLines) return;
  const reduced = Boolean(prefersReducedMotionQuery && prefersReducedMotionQuery.matches);
  const phase = reduced ? 0.04 : ((now * 0.000085) % 1.0);

  Object.keys(candidateLines).forEach(candId => {
    const group = candidateLines[candId];
    const { chevrons, arcTable } = group?.userData || {};
    if (!chevrons || !chevrons.length) return;
    const isSel = candId === selectedCandidateId && group.visible;
    for (let i = 0; i < chevrons.length; i++) {
      const mesh = chevrons[i];
      mesh.visible = isSel;
      if (!isSel || !arcTable) continue;
      // Place evenly along (0.04 .. 0.96) flowing monotonically Start -> Goal
      const rawU = ((i / chevrons.length) + phase) % 1.0;
      const u = 0.04 + rawU * 0.92;
      const sample = sampleRouteArcAtU(arcTable, u);
      if (sample) {
        mesh.position.set(sample.x, sample.y, sample.z);
        mesh.rotation.y = sample.yaw;
      }
    }
  });
}

function updateCandidateRouteStyles() {
  Object.keys(candidateLines).forEach(candId => {
    const group = candidateLines[candId];
    const { coreLine, casingLine, glowLine } = group.userData;
    const isSel = candId === selectedCandidateId;
    const isHov = candId === hoveredCandidateId;

    // Uniform width & casing across all player routes A/B/C; only opacity & glow highlight selection
    if (coreLine && coreLine.material) {
      coreLine.material.linewidth = 3.8;
      coreLine.material.opacity = isSel ? 1.0 : (isHov ? 0.85 : 0.65);
      coreLine.renderOrder = isSel ? 20 : (isHov ? 16 : 12);
    }
    if (casingLine && casingLine.material) {
      casingLine.material.linewidth = 7.4;
      casingLine.material.opacity = isSel ? 0.95 : (isHov ? 0.80 : 0.65);
      casingLine.renderOrder = isSel ? 19 : (isHov ? 15 : 11);
    }
    if (glowLine && glowLine.material) {
      glowLine.material.linewidth = 13.5;
      glowLine.material.opacity = isSel ? 0.44 : (isHov ? 0.28 : 0.14);
      glowLine.renderOrder = isSel ? 18 : (isHov ? 14 : 10);
    }
  });
  updateCandidateRouteChevrons(performance.now());
}

function buildCandidateRouteLines(candidates) {
  if (!plannerGroup) return;

  candidates.forEach(c => {
    if (c.error || !c.waypoints || c.waypoints.length === 0) {
      if (candidateLines[c.id]) candidateLines[c.id].visible = false;
      return;
    }

    const flatPositions = new Float32Array(c.waypoints.length * 3);
    for (let i = 0; i < c.waypoints.length; i++) {
      const wp = c.waypoints[i];
      const { meshX, meshZ } = localToMesh(wp.x, wp.y);
      flatPositions[i * 3] = meshX;
      flatPositions[i * 3 + 1] = (wp.z - minElev) * currentExag + 9.0 * currentExag;
      flatPositions[i * 3 + 2] = meshZ;
    }

    if (candidateLines[c.id]) {
      const group = candidateLines[c.id];
      group.userData.waypoints = c.waypoints;
      group.userData.flatPositions = flatPositions;
      group.userData.geom.setPositions(flatPositions);
      group.userData.arcTable = buildRouteArcTable(c.waypoints);
      group.visible = true;
    } else {
      const geom = new LineGeometry();
      geom.setPositions(flatPositions);
      const routeColorHex = new THREE.Color(c.color).getHex();

      const glowMat = new LineMaterial({
        color: routeColorHex,
        linewidth: 13.5,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        dashed: false
      });
      glowMat.resolution.set(window.innerWidth, window.innerHeight);

      const casingMat = new LineMaterial({
        color: 0x080b10,
        linewidth: 7.4,
        transparent: true,
        opacity: 0.90,
        depthTest: true,
        depthWrite: false,
        dashed: false
      });
      casingMat.resolution.set(window.innerWidth, window.innerHeight);

      const coreMat = new LineMaterial({
        color: routeColorHex,
        linewidth: 3.8,
        transparent: true,
        opacity: 0.90,
        depthTest: true,
        depthWrite: false,
        dashed: false
      });
      coreMat.resolution.set(window.innerWidth, window.innerHeight);

      const glowLine = new Line2(geom, glowMat);
      glowLine.userData = { isCandidateLine: true, id: c.id };
      const casingLine = new Line2(geom, casingMat);
      casingLine.userData = { isCandidateLine: true, id: c.id };
      const coreLine = new Line2(geom, coreMat);
      coreLine.userData = { isCandidateLine: true, id: c.id };

      const chevrons = [];
      const group = new THREE.Group();
      group.add(glowLine);
      group.add(casingLine);
      group.add(coreLine);

      for (let i = 0; i < ROUTE_CHEVRON_COUNT; i++) {
        const chev = new THREE.Group();
        const bg = new THREE.Mesh(
          SHARED_CHEVRON_OUTLINE_GEO,
          new THREE.MeshBasicMaterial({ color: 0x080b10, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false })
        );
        bg.renderOrder = 21;
        const fg = new THREE.Mesh(
          SHARED_CHEVRON_INNER_GEO,
          new THREE.MeshBasicMaterial({ color: routeColorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0, depthWrite: false })
        );
        fg.position.y = 0.6;
        fg.renderOrder = 22;
        chev.add(bg);
        chev.add(fg);
        chev.visible = false;
        chev.userData = { isCandidateLine: true, id: c.id };
        group.add(chev);
        chevrons.push(chev);
      }

      group.userData = {
        isCandidateLine: true,
        id: c.id,
        waypoints: c.waypoints,
        flatPositions,
        color: c.color,
        geom,
        glowLine,
        casingLine,
        coreLine,
        chevrons,
        arcTable: buildRouteArcTable(c.waypoints)
      };
      plannerGroup.add(group);
      candidateLines[c.id] = group;
    }
  });

  selectCandidate(selectedCandidateId);
}

function selectCandidate(id, { userInitiated = false } = {}) {
  selectedCandidateId = id;
  levelState.selectRoute(id);

  if (userInitiated && currentViewMode === 'MISSION') {
    panelPrefs.MISSION.profileOpen = true;
    syncPanelsToViewMode();
  }

  // 1. Highlight selected 3D glowing Line2, soften others
  updateCandidateRouteStyles();

  // 2. Highlight table row & lens strip cards
  document.querySelectorAll('#planner-tbody tr').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.id === id);
  });
  document.querySelectorAll('#lrs-cols .lrs-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.id === id);
  });

  // 3. Update Elevation Profile
  const cand = plannerCandidates.find(c => c.id === id);
  if (cand && !cand.error) {
    if (profileRouteName) {
      profileRouteName.textContent = cand.name.toUpperCase();
      profileRouteName.style.color = cand.color;
    }
    requestAnimationFrame(() => drawElevationChart(cand));
    if (userInitiated) {
      setTimeout(() => {
        drawElevationChart(cand);
        updateLayoutBounds();
      }, 270);
    }
  }
}

function drawElevationChart(candidate) {
  if (!elevationChart || !candidate || !candidate.elevationProfile) return;
  const ctx = elevationChart.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = elevationChart.clientWidth || 940;
  const height = elevationChart.clientHeight || 70;

  elevationChart.width = width * dpr;
  elevationChart.height = height * dpr;
  ctx.scale(dpr, dpr);

  const profile = candidate.elevationProfile;
  if (profile.length < 2) return;

  const padLeft = 46;
  const padRight = 18;
  const padTop = 10;
  const padBottom = 16;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  let minZ = Infinity;
  let maxZ = -Infinity;
  profile.forEach(p => {
    if (p.elev < minZ) minZ = p.elev;
    if (p.elev > maxZ) maxZ = p.elev;
  });
  minZ = Math.floor(minZ / 50) * 50 - 10;
  maxZ = Math.ceil(maxZ / 50) * 50 + 10;
  const maxDist = profile[profile.length - 1].distKm;

  // Background
  ctx.fillStyle = 'rgba(8, 12, 18, 0.85)';
  ctx.fillRect(0, 0, width, height);

  // Horizontal Grid Lines & Elevation Labels
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#778899';
  ctx.font = '8.5px monospace';
  ctx.textAlign = 'right';

  const zStep = 50;
  for (let z = minZ + 10; z <= maxZ; z += zStep) {
    const y = padTop + (1.0 - (z - minZ) / (maxZ - minZ)) * plotH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(z)}m`, padLeft - 4, y + 3);
  }

  // Distance X labels (masked while Route Calculator is open pre-lock)
  const maskedKm = isRouteCalcMasked();
  ctx.textAlign = 'center';
  const distSteps = 4;
  for (let s = 0; s <= distSteps; s++) {
    const d = (s / distSteps) * maxDist;
    const x = padLeft + (s / distSteps) * plotW;
    const lbl = maskedKm ? (s === 0 ? 'Start' : (s === distSteps ? 'Goal' : '— km')) : `${d.toFixed(1)}km`;
    ctx.fillText(lbl, x, height - 3);
  }

  // Draw filled gradient under curve
  ctx.save();
  ctx.beginPath();
  const getX = p => padLeft + (p.distKm / maxDist) * plotW;
  const getY = p => padTop + (1.0 - (p.elev - minZ) / (maxZ - minZ)) * plotH;

  ctx.moveTo(getX(profile[0]), getY(profile[0]));
  for (let i = 1; i < profile.length; i++) {
    ctx.lineTo(getX(profile[i]), getY(profile[i]));
  }
  ctx.lineTo(getX(profile[profile.length - 1]), padTop + plotH);
  ctx.lineTo(padLeft, padTop + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
  grad.addColorStop(0, 'rgba(0, 210, 255, 0.22)');
  grad.addColorStop(1, 'rgba(0, 210, 255, 0.01)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Draw polyline segments colored by slope tier
  ctx.lineWidth = 2.5;
  for (let i = 1; i < profile.length; i++) {
    const p0 = profile[i - 1];
    const p1 = profile[i];
    ctx.beginPath();
    ctx.moveTo(getX(p0), getY(p0));
    ctx.lineTo(getX(p1), getY(p1));
    if (p1.tier === 'easy') ctx.strokeStyle = '#2ecc71';
    else if (p1.tier === 'mod') ctx.strokeStyle = '#f1c40f';
    else ctx.strokeStyle = '#e74c3c';
    ctx.stroke();
  }
}

function bindElevationChartHover() {
  if (!elevationChart) return;

  elevationChart.addEventListener('mousemove', e => {
    const cand = plannerCandidates.find(c => c.id === selectedCandidateId);
    if (!cand || !cand.elevationProfile || cand.elevationProfile.length < 2) return;

    const rect = elevationChart.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const width = elevationChart.clientWidth;
    const padLeft = 46;
    const padRight = 18;
    const plotW = width - padLeft - padRight;

    const clampedX = Math.max(padLeft, Math.min(width - padRight, mouseX));
    const fraction = (clampedX - padLeft) / plotW;
    const profile = cand.elevationProfile;
    const maxDist = profile[profile.length - 1].distKm;
    const targetDist = fraction * maxDist;

    let closest = profile[0];
    let minD = Infinity;
    profile.forEach(p => {
      const d = Math.abs(p.distKm - targetDist);
      if (d < minD) { minD = d; closest = p; }
    });

    drawElevationChart(cand);

    const ctx = elevationChart.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    const height = elevationChart.clientHeight;
    const padTop = 10;
    const padBottom = 16;
    const plotH = height - padTop - padBottom;
    let minZ = Infinity;
    let maxZ = -Infinity;
    profile.forEach(p => {
      if (p.elev < minZ) minZ = p.elev;
      if (p.elev > maxZ) maxZ = p.elev;
    });
    minZ = Math.floor(minZ / 50) * 50 - 10;
    maxZ = Math.ceil(maxZ / 50) * 50 + 10;

    const cx = padLeft + (closest.distKm / maxDist) * plotW;
    const cy = padTop + (1.0 - (closest.elev - minZ) / (maxZ - minZ)) * plotH;

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, padTop);
    ctx.lineTo(cx, height - padBottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();

    const tierStr = closest.tier === 'easy' ? '<15° Easy' : (closest.tier === 'mod' ? '15°–25° Mod' : '>25° Haz');
    const distLabel = isRouteCalcMasked() ? 'Distance hidden (calc open)' : `${closest.distKm.toFixed(2)} km`;
    if (profileHoverInfo) {
      profileHoverInfo.textContent = `${distLabel} | Elev ${closest.elev.toFixed(1)} m | Slope ${closest.slope.toFixed(1)}° (${tierStr})`;
    }

    if (profileMarker && rawHeights) {
      const { meshX, meshZ } = localToMesh(closest.x, closest.y);
      const meshY = (closest.elev - minElev) * currentExag + 8.5 * currentExag;
      profileMarker.position.set(meshX, meshY, meshZ);
      profileMarker.visible = true;
    }
  });

  elevationChart.addEventListener('mouseleave', () => {
    const cand = plannerCandidates.find(c => c.id === selectedCandidateId);
    if (cand) drawElevationChart(cand);
    if (profileHoverInfo) {
      profileHoverInfo.textContent = 'Hover chart to inspect elevation & map location';
    }
    if (profileMarker) profileMarker.visible = false;
  });
}

function renderPlannerTable(candidates) {
  if (!plannerTbody) return;
  plannerTbody.innerHTML = '';
  const masked = isRouteCalcMasked();

  candidates.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = `route-row ${c.id === selectedCandidateId ? 'selected' : ''}`;
    tr.dataset.id = c.id;

    if (c.error) {
      tr.innerHTML = `
        <td><div class="route-cell"><span class="route-swatch" style="background:${c.color}"></span>${c.name}</div></td>
        <td class="col-true-val"><span class="badge-best ${c.id}">${c.bestFor}</span></td>
        <td colspan="10" style="color:#e74c3c;font-style:italic;">No safe route found</td>
      `;
    } else {
      const distCell = masked
        ? '<span class="calc-masked-val">— (calc)</span>'
        : c.distKm.toFixed(2);
      const netStr = `${c.netElevM >= 0 ? '+' : ''}${c.netElevM.toFixed(1)}`;
      const ascentCell = masked
        ? `<span class="calc-masked-val">— / ${netStr}</span>`
        : `+${c.ascentM.toFixed(1)} / ${netStr}`;
      const tiersCell = masked
        ? '<span class="calc-masked-val">— / — / — (calc)</span>'
        : `<span class="tier-easy">${c.pctEasy.toFixed(1)}%</span> / <span class="tier-mod">${c.pctMod.toFixed(1)}%</span> / <span class="tier-haz">${c.pctHaz.toFixed(1)}%</span>`;

      tr.innerHTML = `
        <td><div class="route-cell"><span class="route-swatch" style="background:${c.color}"></span>${c.name}</div></td>
        <td class="col-true-val"><span class="badge-best ${c.id}">${c.bestFor}</span></td>
        <td>${distCell}</td>
        <td>${ascentCell}</td>
        <td>${c.maxSlopeDeg.toFixed(1)}°</td>
        <td>${tiersCell}</td>
        <td class="col-true-val">${c.timeHours.toFixed(1)} h</td>
        <td class="col-true-val">${c.energyKwh.toFixed(2)} kWh</td>
        <td class="col-true-val">${Math.round(c.radDoseUsv)} µSv</td>
        <td class="col-true-val"><strong>${c.sciScore}</strong></td>
        <td class="col-true-val">${c.riskScore.toFixed(1)} <small>/ 100</small></td>
        <td style="text-align:center;"><input type="checkbox" class="cb-route-vis" data-id="${c.id}" checked></td>
      `;
    }

    tr.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      selectCandidate(c.id, { userInitiated: true });
    });

    const cb = tr.querySelector('.cb-route-vis');
    if (cb) {
      cb.addEventListener('change', e => {
        if (candidateLines[c.id]) {
          candidateLines[c.id].visible = e.target.checked;
        }
      });
    }

    plannerTbody.appendChild(tr);
  });
}

// --- UI Event Listeners ---
function bindUIEvents() {
  // Panel Toggles (remember per-mode state; MISSION uses single active side panel)
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if (currentViewMode === 'MISSION') {
        if (targetId === 'inspector-panel') toggleMissionSidePanel('inspector');
        else if (targetId === 'layers-panel') toggleMissionSidePanel('lenses');
        return;
      }
      if (targetId === 'inspector-panel') {
        panelPrefs.RESEARCH.inspectorOpen = !panelPrefs.RESEARCH.inspectorOpen;
      } else if (targetId === 'layers-panel') {
        panelPrefs.RESEARCH.layersOpen = !panelPrefs.RESEARCH.layersOpen;
      }
      syncPanelsToViewMode();
    });
  });

  // Layer Toggles & Opacity Sliders (RESEARCH mode controls)
  if (lyrSat) lyrSat.addEventListener('change', applyLayerVisibilityForMode);
  if (exagSlider) exagSlider.addEventListener('input', e => applyVerticalExaggeration(parseFloat(e.target.value)));

  if (lyrSlope) lyrSlope.addEventListener('change', applyLayerVisibilityForMode);
  if (slopeOpacity) slopeOpacity.addEventListener('input', e => {
    slopeOv.textContent = `${e.target.value} %`;
    if (hazardMesh) hazardMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrCrismHyd) lyrCrismHyd.addEventListener('change', applyLayerVisibilityForMode);
  if (crismHydOpacity) crismHydOpacity.addEventListener('input', e => {
    crismHydOv.textContent = `${e.target.value} %`;
    if (crismHydMesh) crismHydMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrCrismPhy) lyrCrismPhy.addEventListener('change', applyLayerVisibilityForMode);
  if (crismPhyOpacity) crismPhyOpacity.addEventListener('input', e => {
    crismPhyOv.textContent = `${e.target.value} %`;
    if (crismPhyMesh) crismPhyMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrThemis) lyrThemis.addEventListener('change', applyLayerVisibilityForMode);
  if (themisOpacity) themisOpacity.addEventListener('input', e => {
    themisOv.textContent = `${e.target.value} %`;
    if (themisMesh) themisMesh.material.opacity = parseInt(e.target.value, 10) / 100.0;
  });

  if (lyrRoute) lyrRoute.addEventListener('change', () => {
    const screen = levelState.getState().screen;
    const showFullRoute = currentViewMode === 'RESEARCH'
      ? lyrRoute.checked
      : (screen === GAME_STATES.DEBRIEF && lyrRoute.checked);
    if (routeGroup) routeGroup.visible = showFullRoute;
    if (scienceMarkersGroup) scienceMarkersGroup.visible = lyrRoute.checked;
    if (startFlagGroup) startFlagGroup.visible = lyrRoute.checked;
  });

  if (lyrBoxwork) lyrBoxwork.addEventListener('change', () => {
    if (boxworkGroup) boxworkGroup.visible = lyrBoxwork.checked;
  });

  if (routeColorMode) routeColorMode.addEventListener('change', updateRouteColoring);

  if (timeSlider) timeSlider.addEventListener('input', e => updateTimeOfDay(parseFloat(e.target.value)));
  if (lyrDust) lyrDust.addEventListener('change', () => { if (dustParticles) dustParticles.visible = lyrDust.checked; });

  if (qualityPreset) qualityPreset.addEventListener('change', e => {
    currentQuality = e.target.value;
    const cfg = QUALITY_SETTINGS[currentQuality];
    renderer.setPixelRatio(cfg.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (satTexture) createTerrainLayers(satTexture, hazardMesh.material.map, crismHydMesh.material.map, crismPhyMesh.material.map, themisMesh.material.map);
    createDustParticles();
  });

  if (btnResetCustom) btnResetCustom.addEventListener('click', resetCustomizationToStandard);

  if (btnReset) btnReset.addEventListener('click', () => {
    controls.target.set(0, ((-3772.0 - minElev) * currentExag), 0);
    camera.position.set(0, 3400, 3900);
    controls.update();
  });

  if (btnBoxwork) btnBoxwork.addEventListener('click', () => {
    const { meshX, meshZ } = localToMesh(2430, 2480);
    const targetY = (-3613.0 - minElev) * currentExag;
    controls.target.set(meshX, targetY, meshZ);
    camera.position.set(meshX + 180, targetY + 700, meshZ + 900);
    controls.update();
  });

  if (btnSkipIntro) btnSkipIntro.addEventListener('click', endCinematicIntro);
  controls.addEventListener('start', () => {
    if (isIntroActive) endCinematicIntro();
    if (frontDoorStage === 'MAP' && tutorialCtrl) tutorialCtrl.notifyAction('camera');
  });
  renderer.domElement.addEventListener('wheel', () => {
    if (frontDoorStage === 'MAP' && tutorialCtrl) tutorialCtrl.notifyAction('camera');
  }, { passive: true });

  // Timeline Controls
  if (btnPlay) btnPlay.addEventListener('click', () => {
    isPlaying = !isPlaying;
    btnPlay.textContent = isPlaying ? '⏸' : '▶';
    lastReplayTime = performance.now();
  });

  if (tlSlider) tlSlider.addEventListener('input', e => {
    isPlaying = false;
    if (btnPlay) btnPlay.textContent = '▶';
    updateTimelineReplay(parseFloat(e.target.value));
  });

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      replaySpeed = parseFloat(btn.dataset.sp);
    });
  });

  // Route Planner Controls
  if (btnSetStart) {
    btnSetStart.addEventListener('click', () => {
      isSettingStart = !isSettingStart;
      isSettingGoal = false;
      btnSetStart.classList.toggle('active', isSettingStart);
      if (btnSetGoal) btnSetGoal.classList.remove('active');
      if (isSettingStart) {
        showPlannerToast('📍 Click anywhere on terrain to set custom START (Esc to cancel)');
      }
    });
  }

  if (btnSetGoal) {
    btnSetGoal.addEventListener('click', () => {
      isSettingGoal = !isSettingGoal;
      isSettingStart = false;
      btnSetGoal.classList.toggle('active', isSettingGoal);
      if (btnSetStart) btnSetStart.classList.remove('active');
      if (isSettingGoal) {
        showPlannerToast('🎯 Click anywhere on terrain to set custom GOAL (Esc to cancel)');
      }
    });
  }

  if (btnResetPlan) {
    btnResetPlan.addEventListener('click', () => {
      plannerStart = { x: 3467.35, y: 4999.58 };
      plannerGoal = { x: 2432.1, y: 2479.0 };
      isSettingStart = false;
      isSettingGoal = false;
      if (btnSetStart) btnSetStart.classList.remove('active');
      if (btnSetGoal) btnSetGoal.classList.remove('active');
      updateStartAndGoalMarkerPositions();
      requestRouteComputation();
      showPlannerToast('↺ Start and Goal reset to default locations');
    });
  }

  if (btnTogglePlanner && plannerPanel) {
    btnTogglePlanner.addEventListener('click', () => {
      panelPrefs[currentViewMode].plannerCollapsed = !panelPrefs[currentViewMode].plannerCollapsed;
      syncPanelsToViewMode();
      setTimeout(updateLayoutBounds, 270);
    });
  }

  bindElevationChartHover();

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (dataMethodsModal && !dataMethodsModal.classList.contains('hidden')) {
        dataMethodsModal.classList.add('hidden');
        return;
      }
      if (isSettingStart || isSettingGoal) {
        isSettingStart = false;
        isSettingGoal = false;
        if (btnSetStart) btnSetStart.classList.remove('active');
        if (btnSetGoal) btnSetGoal.classList.remove('active');
        showPlannerToast('Cancelled endpoint selection');
      }
      if (surveyKit && surveyKit.getActiveTool()) {
        surveyKit.clearTool();
        syncSurveyKitUi();
      }
      const screen = levelState.getState().screen;
      if (screen === GAME_STATES.DEBRIEF && gameDebriefOverlay && !gameDebriefOverlay.classList.contains('hidden')) {
        debriefOverlayDismissed = true;
        applyGameScreenState(levelState.getState());
      } else if (screen === GAME_STATES.EXPLORE && gameExploreOverlay && !gameExploreOverlay.classList.contains('hidden')) {
        exploreOverlayDismissed = true;
        applyGameScreenState(levelState.getState());
      }
    }
  });

  // Inspector Pin / Unpin
  if (inspectorUnpin) inspectorUnpin.addEventListener('click', () => {
    isPinned = false;
    pinnedPoint = null;
    inspectorMode.textContent = '(hover)';
    inspectorUnpin.style.display = 'none';
    if (pinnedReticle) pinnedReticle.visible = false;
    if (currentViewMode === 'MISSION') {
      setMissionSidePanel('none');
    }
  });

  // Canvas Click: ignore camera orbit/pan drags (>6px); otherwise handle tool, set start/goal, inspect, or select route
  let canvasDownX = 0;
  let canvasDownY = 0;
  let canvasDragDistSq = 0;
  renderer.domElement.addEventListener('pointerdown', e => {
    canvasDownX = e.clientX;
    canvasDownY = e.clientY;
    canvasDragDistSq = 0;
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.buttons) {
      const dx = e.clientX - canvasDownX;
      const dy = e.clientY - canvasDownY;
      canvasDragDistSq = Math.max(canvasDragDistSq, dx * dx + dy * dy);
    }
  });
  renderer.domElement.addEventListener('click', e => {
    if (canvasDragDistSq > 36) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 0a. Setting START or GOAL (RESEARCH sandbox only)
    if (isSettingStart || isSettingGoal) {
      const hit = getTerrainIntersection(raycaster.ray);
      if (hit) {
        const { col, row } = localToGrid(hit.lx, hit.ly);
        const slope = sampleGridBilinear(rawSlopes, col, row);

        if (slope > 25.0) {
          showPlannerToast(`⚠️ Cannot place ${isSettingStart ? 'START' : 'GOAL'} on hazardous terrain (${slope.toFixed(1)}° slope). Choose a safe cell (<25°).`);
          return;
        }

        if (isSettingStart) {
          plannerStart = { x: hit.lx, y: hit.ly };
          isSettingStart = false;
          if (btnSetStart) btnSetStart.classList.remove('active');
          showPlannerToast(`✓ START placed at X: ${Math.round(hit.lx)} m, Y: ${Math.round(hit.ly)} m`);
        } else {
          plannerGoal = { x: hit.lx, y: hit.ly };
          isSettingGoal = false;
          if (btnSetGoal) btnSetGoal.classList.remove('active');
          showPlannerToast(`✓ GOAL placed at X: ${Math.round(hit.lx)} m, Y: ${Math.round(hit.ly)} m`);
        }

        updateStartAndGoalMarkerPositions();
        requestRouteComputation();
      }
      return;
    }

    // 0b. Survey Kit active tool click (ANALYZE / CHOOSE in MISSION mode)
    if (currentViewMode === 'MISSION' && surveyKit && surveyKit.getActiveTool()) {
      const screen = levelState.getState().screen;
      if (screen === GAME_STATES.ANALYZE || screen === GAME_STATES.CHOOSE) {
        const activeTool = surveyKit.getActiveTool();

        // 1) Identifying corridor ? elements using the ELEMENTS tool (free of route scan budget)
        if (activeTool === 'elements' && missionElements) {
          const hitElem = findHitMissionElement();
          if (hitElem) {
            const idResult = missionElements.identifyElement(hitElem.id);
            if (surveyLog) {
              const idSet = new Set(
                [...missionElements.getIdentifiableIds()].filter(id => missionElements.isElementIdentified(id))
              );
              surveyLog.updateIdentificationStats(
                idResult.identifiedCount,
                idResult.totalIdentifiable,
                idSet
              );
            }
            renderFieldCodex();
            surveyKit.showElementIdentifiedPin(hitElem.x, hitElem.y, idResult);
            if (mapLabels) {
              const cardPayload = missionElements.buildElementCardPayload(hitElem);
              if (cardPayload) mapLabels.showDetailCard(cardPayload);
            }
            if (idResult.identifiedNow) {
              showPlannerToast(`★ Identified: ${hitElem.name} (+Field Codex & points)`);
            }
            syncSurveyKitUi();
            if (tutorialCtrl) tutorialCtrl.notifyAction('survey-scan');
            return;
          }
        }

        // 2) Full-route reading when clicking Route A, B, or C lines (-1 scan if new)
        const hitRouteId = findHitCandidateRouteId();
        if (hitRouteId && surveyLog) {
          const scanRes = surveyLog.scanRoute(hitRouteId, activeTool);
          if (!scanRes.ok) {
            if (scanRes.outOfBudget) {
              showPlannerToast(`Route scan budget exhausted (Scans left: ${scanRes.scansLeft}). Point reads, elements & repeats remain free.`);
            }
            return;
          }
          const tHit = getTerrainIntersection(raycaster.ray);
          const cand = plannerCandidates.find(c => c.id === hitRouteId);
          const midWp = cand && cand.waypoints && cand.waypoints.length
            ? cand.waypoints[Math.floor(cand.waypoints.length * 0.5)]
            : plannerStart;
          const pinX = tHit ? tHit.lx : midWp.x;
          const pinY = tHit ? tHit.ly : midWp.y;
          const idNear = missionElements
            ? scanRes.truth.nearElementIds.filter(id => missionElements.isElementIdentified(id)).length
            : 0;
          surveyKit.showRoutePinReading(pinX, pinY, activeTool, scanRes.truth, {
            chargedCost: scanRes.chargedCost,
            identifiedCount: idNear
          });
          selectCandidate(hitRouteId, { userInitiated: false });
          if (scanRes.chargedCost > 0) {
            showPlannerToast(`Logged ${scanRes.truth.routeName} ${activeTool.toUpperCase()} (-1 scan · Scans left: ${scanRes.scansLeft})`);
          }
          syncSurveyKitUi();
          if (tutorialCtrl) tutorialCtrl.notifyAction('survey-scan');
          return;
        }

        // 3) Free single-point reading on terrain
        const hit = getTerrainIntersection(raycaster.ray);
        if (hit) {
          surveyKit.scanPoint(hit.lx, hit.ly, { postLock: isCurrentPostLock() });
          syncSurveyKitUi();
          if (tutorialCtrl) tutorialCtrl.notifyAction('survey-scan');
        }
        return;
      }
    }

    // 1. Check Mission Gameplay 3D Elements (matching hover priority above route lines)
    const clickedElement = findHitMissionElement();
    if (clickedElement && mapLabels) {
      const payload = missionElements.buildElementCardPayload(clickedElement);
      if (payload) {
        mapLabels.showDetailCard(payload);
        handleAnchorOrElementSelect(clickedElement.id);
        return;
      }
    }

    // 2. Check Start / Goal / Legacy Science Markers -> open neutral detail card (hiding Sol pre-lock-in)
    const clickedMarkerKey = findHitMarkerKey();
    if (clickedMarkerKey && mapLabels) {
      const anchor = mapLabels.getAnchorById(clickedMarkerKey);
      if (anchor) {
        mapLabels.showDetailCard(anchor);
        return;
      }
    }
    if (scienceMarkersGroup && scienceMarkersGroup.visible) {
      const hits = raycaster.intersectObjects(scienceMarkersGroup.children, false);
      if (hits.length > 0 && hits[0].object.userData.isSciencePin) {
        const u = hits[0].object.userData;
        const curScreen = levelState.getState().screen;
        const isPostLock = curScreen === GAME_STATES.EXPLORE || curScreen === GAME_STATES.DEBRIEF;
        ensurePopupInDom(sciencePopup);
        popupTitle.textContent = u.title;
        popupSol.textContent = isPostLock ? u.solLabel : 'Sol: hidden until Explore';
        if (popupSrc) popupSrc.textContent = 'measured (Curiosity traverse); description unverified';
        sciencePopup.style.right = '';
        sciencePopup.style.bottom = '';
        sciencePopup.style.transform = '';
        autoDismiss(sciencePopup, {
          ms: 3500,
          kind: 'science-popup',
          closeBtn: popupClose
        });
        return;
      }
    }

    // 3. Check clicking on Candidate Route Lines (Line2)
    const clickedRouteId = findHitCandidateRouteId();
    if (clickedRouteId) {
      selectCandidate(clickedRouteId, { userInitiated: true });
      return;
    }

    // 3b. Check clicking on Curiosity Reference Dashed Line (Line2)
    if (findHitCuriosityRoute() && mapLabels) {
      const curAnchor = mapLabels.getAnchorById('curiosity-ref-path');
      if (curAnchor) {
        mapLabels.showDetailCard(curAnchor);
        return;
      }
    }

    // 3. Pin clicked terrain point (opens Point Inspector cleanly in MISSION mode, closing other side panels)
    const hit = getTerrainIntersection(raycaster.ray);
    if (hit) {
      isPinned = true;
      pinnedPoint = { lx: hit.lx, ly: hit.ly };
      inspectorMode.textContent = '(pinned)';
      inspectorUnpin.style.display = 'block';
      updatePointInspector(hit.lx, hit.ly);
      hideHoverTooltip();
      if (currentViewMode === 'MISSION') {
        setMissionSidePanel('inspector');
      } else {
        panelPrefs.RESEARCH.inspectorOpen = true;
        syncPanelsToViewMode();
      }
      if (pinnedReticle) {
        pinnedReticle.position.set(hit.x, hit.y + 2.0, hit.z);
        pinnedReticle.visible = true;
      }
      if (cursorReticle) cursorReticle.visible = false;
    }
  });

  if (popupClose) {
    popupClose.addEventListener('click', () => {
      if (sciencePopup) {
        cancelAutoDismiss(sciencePopup, { removeEl: true, invokeCallback: false });
      }
    });
  }

  // Pointer Move & Leave
  window.addEventListener('pointermove', e => {
    const overLabel = Boolean(
      e.target && e.target.closest && (e.target.closest('.map-label') || e.target.closest('#marker-hover-card'))
    );
    isHoveringLabelDom = overLabel;
    if (e.target !== renderer.domElement) {
      hideHoverTooltip();
      if (!overLabel && mapLabels) mapLabels.hideHoverCard();
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      handlePointerInspection(e.clientX, e.clientY);
    }
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    hideHoverTooltip();
    if (!isHoveringLabelDom && mapLabels) mapLabels.hideHoverCard();
    if (cursorReticle && !isPinned) cursorReticle.visible = false;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    Object.values(candidateLines).forEach(group => {
      const { coreLine, casingLine, glowLine } = group.userData || {};
      if (coreLine && coreLine.material) coreLine.material.resolution.set(window.innerWidth, window.innerHeight);
      if (casingLine && casingLine.material) casingLine.material.resolution.set(window.innerWidth, window.innerHeight);
      if (glowLine && glowLine.material) glowLine.material.resolution.set(window.innerWidth, window.innerHeight);
    });
    if (curiosityRefLine && curiosityRefLine.material) {
      curiosityRefLine.material.resolution.set(window.innerWidth, window.innerHeight);
    }
    updateLayoutBounds();
  });

  // --- Rover EXPLORE Mode Input: WASD movement, Shift boost, E action, R reset ---
  // Key state is tracked globally so holding W through a phase change keeps
  // driving, and OS auto-repeat can never leave the throttle stuck at zero.
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    const isDriveKey = key === 'w' || key === 'a' || key === 's' || key === 'd'
      || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright'
      || key === 'shift';
    const inExplore = levelState.getState().screen === GAME_STATES.EXPLORE && !awaitingSurveyResultContinue;

    if (isDriveKey) {
      roverHeldKeys.add(key);
      if (inExplore) {
        syncRoverInputFromKeys();
        e.preventDefault();
      }
      return;
    }

    if (!inExplore) return;
    if (key === 'e' || key === ' ') {
      if (!e.repeat) roverInputState.action = true;
      e.preventDefault();
    } else if (key === 'r') {
      if (!e.repeat) roverInputState.reset = true;
    }
  });

  window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    const isDriveKey = key === 'w' || key === 'a' || key === 's' || key === 'd'
      || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright'
      || key === 'shift';
    if (isDriveKey) {
      roverHeldKeys.delete(key);
      syncRoverInputFromKeys();
      return;
    }
    if (levelState.getState().screen !== GAME_STATES.EXPLORE || awaitingSurveyResultContinue) return;
    if (key === 'e' || key === ' ') roverInputState.action = false;
    else if (key === 'r') roverInputState.reset = false;
  });

  // Losing focus must not leave a phantom throttle held down.
  window.addEventListener('blur', clearRoverKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearRoverKeys();
  });
}

// Helper to draw image into an offscreen canvas for instantaneous pixel sampling
function createOffscreenContext(image) {
  const c = document.createElement('canvas');
  c.width = image.width || image.videoWidth || 27;
  c.height = image.height || image.videoHeight || 28;
  const ctx = c.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx;
}

function initRouteWorker() {
  console.log('--- initRouteWorker called ---');
  routeWorker = new Worker(new URL('./routeWorker.js', import.meta.url), { type: 'module' });

  // Subsample 1025x1025 to 257x257 (factor of 4, ~19.5m step)
  const N = 257;
  const subH = new Float32Array(N * N);
  const subS = new Float32Array(N * N);
  for (let r = 0; r < N; r++) {
    const origR = r * 4;
    for (let c = 0; c < N; c++) {
      const origC = c * 4;
      subH[r * N + c] = rawHeights[origR * 1025 + origC];
      subS[r * N + c] = rawSlopes[origR * 1025 + origC];
    }
  }

  // Precompute CRISM pixel centers (27x28)
  const crismPixels = [];
  for (let cy = 0; cy < 28; cy++) {
    for (let cx = 0; cx < 27; cx++) {
      const lx = (cx + 0.5) * (TERRAIN_WIDTH_M / 27.0);
      const ly = (28 - 1 - cy + 0.5) * (TERRAIN_HEIGHT_M / 28.0);
      crismPixels.push({ x: lx, y: ly });
    }
  }

  // Precompute science marker positions from SCIENCE_TARGETS
  const sciMarkers = SCIENCE_TARGETS.map(t => {
    let closestPt = routePoints[0];
    let minD = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const d = Math.abs(routePoints[i].sol - t.sol);
      if (d < minD) { minD = d; closestPt = routePoints[i]; }
    }
    return { x: closestPt.x, y: closestPt.y, sol: t.sol, title: t.title };
  });

  routeWorker.onmessage = function (e) {
    if (e.data.type === 'initialized') {
      window.__routeWorkerReady = true;
    } else if (e.data.type === 'result') {
      lastComputeTimeMs = e.data.computeTimeMs;
      // Preserve Level 1 blinded candidate routes when game mode is active;
      // routeWorker results remain intact for telemetry/debugging.
      window.__sandboxWorkerCandidates = e.data.candidates;
    }
  };

  routeWorker.onerror = function (err) {
    console.error('RouteWorker error:', err);
    if (plannerStatus) plannerStatus.textContent = 'Error computing routes';
  };

  try {
    routeWorker.postMessage({
      type: 'init',
      gridSize: N,
      heights: subH.buffer,
      slopes: subS.buffer,
      sciMarkers,
      crismPixels
    }, [subH.buffer, subS.buffer]);
  } catch (postErr) {
    console.error('Error posting to routeWorker:', postErr);
  }
}

// --- Decision Lenses (6 Modes, 400 ms Crossfade) & Real Map Labels ---
function updateMissionWorkerStatusUi() {
  const isComputingSun = activeMissionLens === 'sun' && !sunCache[activeSunPreset];
  const isComputingRad = activeMissionLens === 'radiation' && !svfCache;
  if (lensComputingNote) {
    lensComputingNote.classList.toggle('hidden', !(isComputingSun || isComputingRad));
  }
}

function renderMissionLensDetail() {
  const cfg = LENS_CONFIG[activeMissionLens] || LENS_CONFIG.satellite;
  if (lensRampBar) lensRampBar.style.background = cfg.rampCss;
  if (lensRampUnits) lensRampUnits.textContent = cfg.rampUnits;
  if (lensRampMin) lensRampMin.textContent = cfg.rampMin;
  if (lensRampMid) lensRampMid.textContent = cfg.rampMid;
  if (lensRampMax) lensRampMax.textContent = cfg.rampMax;

  if (sunPresetControls) {
    sunPresetControls.classList.toggle('hidden', activeMissionLens !== 'sun');
  }
  if (sunNoonNote) {
    sunNoonNote.classList.toggle('hidden', !(activeMissionLens === 'sun' && activeSunPreset === 'noon'));
  }
  sunPresetBtns.forEach(b => b.classList.toggle('active', b.dataset.sun === activeSunPreset));

  if (lensLegendItems) {
    lensLegendItems.innerHTML = cfg.swatches.map(item => {
      let swatchStyle = `background:${item.color};`;
      if (item.kind === 'outline') {
        swatchStyle = `background:transparent;border:2px solid ${item.color};`;
      } else if (item.kind === 'glow') {
        swatchStyle = `background:${item.color};box-shadow:0 0 8px ${item.color};`;
      }
      return `<div class="lens-legend-row"><span class="lens-sw" style="${swatchStyle}"></span><span>${item.label}</span></div>`;
    }).join('');
  }
  if (lensCaveat) lensCaveat.textContent = cfg.caveat;
  updateMissionWorkerStatusUi();
}

function buildLensRouteCardHtml(cand) {
  const isSel = cand.id === selectedCandidateId;
  const st = routeLensStats[cand.id] || { phyPct: 0, hydHighPct: 0, anyMineralPct: 0, themisMeanDn: 0, sun: {}, radiation: null };
  const cnt = routeElementCounts[cand.id] || { hazard: 0, resource: 0, science: 0 };
  const masked = isRouteCalcMasked();

  let metricText = '';
  let subText = '';
  let barHtml = '';

  if (activeMissionLens === 'terrain') {
    if (masked) {
      metricText = '<15° —';
      subText = 'Slope tiers hidden (calc open)';
      barHtml = `<div class="lrs-bar-wrap"><div class="lrs-bar-fill" style="width:0%;"></div></div>`;
    } else {
      const easyW = Math.max(0, Math.min(100, cand.pctEasy));
      const modW = Math.max(0, Math.min(100 - easyW, cand.pctMod));
      const hazW = Math.max(0, Math.min(100 - easyW - modW, cand.pctHaz));
      metricText = `<15° ${cand.pctEasy.toFixed(1)}%`;
      subText = `15–25° ${cand.pctMod.toFixed(1)}% · >25° ${cand.pctHaz.toFixed(1)}%`;
      barHtml = `
        <div class="lrs-bar-wrap" style="display:flex;overflow:hidden;">
          <div class="lrs-bar-fill" style="width:${easyW.toFixed(1)}%;border-radius:0;"></div>
          <div class="lrs-bar-fill alt" style="width:${modW.toFixed(1)}%;border-radius:0;"></div>
          <div style="width:${hazW.toFixed(1)}%;height:100%;background:#435060;"></div>
        </div>
      `;
    }
  } else if (activeMissionLens === 'minerals') {
    const pct = Math.max(0, Math.min(100, st.anyMineralPct));
    metricText = `Flagged ${pct.toFixed(1)}%`;
    subText = `Phy ${st.phyPct.toFixed(1)}% · Hyd high ${st.hydHighPct.toFixed(1)}%`;
    barHtml = `
      <div class="lrs-bar-wrap">
        <div class="lrs-bar-fill" style="width:${pct.toFixed(1)}%;"></div>
      </div>
    `;
  } else if (activeMissionLens === 'heat') {
    const span = THEMIS_MAX_DN - THEMIS_MIN_DN;
    const pct = Math.max(0, Math.min(100, ((st.themisMeanDn - THEMIS_MIN_DN) / span) * 100.0));
    const medPct = ((THEMIS_MEDIAN_DN - THEMIS_MIN_DN) / span) * 100.0;
    metricText = `${st.themisMeanDn.toFixed(1)} DN`;
    subText = `Range ${THEMIS_MIN_DN}–${THEMIS_MAX_DN} · Area median ${THEMIS_MEDIAN_DN}`;
    barHtml = `
      <div class="lrs-bar-wrap" title="Route average brightness vs ${THEMIS_MIN_DN}–${THEMIS_MAX_DN} range (tick = area median ${THEMIS_MEDIAN_DN})">
        <div class="lrs-bar-fill" style="width:${pct.toFixed(1)}%;"></div>
        <span class="lrs-med-tick" style="left:${medPct.toFixed(1)}%;"></span>
      </div>
    `;
  } else if (activeMissionLens === 'sun') {
    const sunObj = st.sun ? st.sun[activeSunPreset] : null;
    if (!sunObj) {
      metricText = 'Computing…';
      subText = `${SUN_PRESETS[activeSunPreset]?.label || activeSunPreset} solar raster`;
      barHtml = `<div class="lrs-bar-wrap"><div class="lrs-bar-fill" style="width:0%;"></div></div>`;
    } else {
      const illW = Math.max(0, Math.min(100, sunObj.avgIllumPct));
      metricText = `Illum ${sunObj.avgIllumPct.toFixed(1)}%`;
      subText = `In shadow ${sunObj.shadowPct.toFixed(1)}% (${SUN_PRESETS[activeSunPreset]?.label || activeSunPreset})`;
      barHtml = `
        <div class="lrs-bar-wrap">
          <div class="lrs-bar-fill" style="width:${illW.toFixed(1)}%;"></div>
        </div>
      `;
    }
  } else if (activeMissionLens === 'radiation') {
    const radObj = st.radiation;
    if (!radObj) {
      metricText = 'Computing…';
      subText = `Sky-view shelter (SVF < ${SVF_SHELTER_THRESHOLD}, mission rule)`;
      barHtml = `<div class="lrs-bar-wrap"><div class="lrs-bar-fill" style="width:0%;"></div></div>`;
    } else {
      const shW = Math.max(0, Math.min(100, radObj.shelteredPct));
      metricText = `SVF ${radObj.avgSvf.toFixed(3)}`;
      subText = `Sheltered (SVF < ${SVF_SHELTER_THRESHOLD}, mission rule): ${radObj.shelteredPct.toFixed(1)}%`;
      barHtml = `
        <div class="lrs-bar-wrap">
          <div class="lrs-bar-fill" style="width:${shW.toFixed(1)}%;"></div>
        </div>
      `;
    }
  } else {
    if (masked) {
      metricText = '— km';
      subText = `Ascent hidden (calc open) · Net ${cand.netElevM >= 0 ? '+' : ''}${cand.netElevM.toFixed(1)} m`;
      barHtml = `<div class="lrs-bar-wrap"><div class="lrs-bar-fill" style="width:0%;"></div></div>`;
    } else {
      const maxDist = Math.max(...plannerCandidates.map(x => x.distKm || 0), 1);
      const pct = Math.max(0, Math.min(100, (cand.distKm / maxDist) * 100.0));
      metricText = `${cand.distKm.toFixed(2)} km`;
      subText = `Ascent +${cand.ascentM.toFixed(1)} m · Net ${cand.netElevM >= 0 ? '+' : ''}${cand.netElevM.toFixed(1)} m`;
      barHtml = `
        <div class="lrs-bar-wrap">
          <div class="lrs-bar-fill" style="width:${pct.toFixed(1)}%;"></div>
        </div>
      `;
    }
  }

  return `
    <div class="lrs-card ${isSel ? 'selected' : ''}" data-id="${cand.id}">
      <div class="lrs-card-top">
        <span class="lrs-route-name"><span class="route-swatch" style="background:${cand.color}"></span>${cand.name}</span>
        <span class="lrs-val">${metricText}</span>
      </div>
      ${barHtml}
      <div class="lrs-sub">${subText}</div>
      <div class="lrs-along" title="Mission surface elements within 150 m of route (no recommendations)">
        <span class="lrs-along-lbl">Along this route (within 150 m):</span>
        <span class="lrs-along-vals">
          ${isCurrentPostLock()
            ? `<span class="lrs-cnt haz">Haz ${cnt.hazard}</span>
               <span class="lrs-cnt res">Res ${cnt.resource}</span>
               <span class="lrs-cnt sci">Sci ${cnt.science}</span>`
            : `<span class="lrs-cnt">Haz ? · Res ? · Sci ?</span>`
          }
          <span class="mhc-tag game">MISSION RULE</span>
        </span>
      </div>
    </div>
  `;
}

function renderLensRouteStrip() {
  if (!lensRouteStrip || !lrsCols) return;
  const cfg = LENS_CONFIG[activeMissionLens] || LENS_CONFIG.satellite;
  if (lrsLensName) {
    lrsLensName.textContent = activeMissionLens === 'sun'
      ? `${cfg.name} (${SUN_PRESETS[activeSunPreset]?.label || activeSunPreset})`
      : cfg.name;
  }
  if (lrsCaveat) {
    let caveat = cfg.stripCaveat;
    if (activeMissionLens === 'sun' && activeSunPreset === 'noon') {
      caveat = `${cfg.stripCaveat} · ${SUN_PRESETS.noon.note}`;
    }
    lrsCaveat.textContent = caveat;
  }

  lrsCols.innerHTML = plannerCandidates.map(buildLensRouteCardHtml).join('');
  lrsCols.querySelectorAll('.lrs-card').forEach(card => {
    card.addEventListener('click', () => {
      selectCandidate(card.dataset.id, { userInitiated: true });
    });
  });
}

function startLensCrossfade(lensId, immediate = false) {
  const cfg = LENS_CONFIG[lensId] || LENS_CONFIG.satellite;
  LENS_KEYS.forEach(k => {
    lensBlend.from[k] = immediate ? (k === lensId ? 1 : 0) : lensBlend.current[k];
    lensBlend.target[k] = k === lensId ? 1 : 0;
    if (immediate) lensBlend.current[k] = lensBlend.target[k];
  });

  lensBlend.fromDesat = immediate ? cfg.targetDesaturate : lensBlend.curDesat;
  lensBlend.targetDesat = cfg.targetDesaturate;
  lensBlend.fromDim = immediate ? cfg.targetDim : lensBlend.curDim;
  lensBlend.targetDim = cfg.targetDim;
  lensBlend.fromExag = immediate ? cfg.targetExag : currentExag;
  lensBlend.targetExag = cfg.targetExag;

  if (immediate) {
    lensBlend.curDesat = cfg.targetDesaturate;
    lensBlend.curDim = cfg.targetDim;
    lensBlend.active = false;
    if (Math.abs(currentExag - cfg.targetExag) > 0.001) {
      applyVerticalExaggeration(cfg.targetExag, { skipNormals: false, syncSlider: false });
    }
    applyLayerVisibilityForMode();
  } else {
    lensBlend.startTime = performance.now();
    lensBlend.active = true;
  }
}

function stepLensCrossfade(now) {
  if (!lensBlend.active || currentViewMode !== 'MISSION') return;

  const rawT = Math.min(1.0, (now - lensBlend.startTime) / lensBlend.durationMs);
  const ease = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

  LENS_KEYS.forEach(k => {
    lensBlend.current[k] = lensBlend.from[k] + (lensBlend.target[k] - lensBlend.from[k]) * ease;
  });
  lensBlend.curDesat = lensBlend.fromDesat + (lensBlend.targetDesat - lensBlend.fromDesat) * ease;
  lensBlend.curDim = lensBlend.fromDim + (lensBlend.targetDim - lensBlend.fromDim) * ease;

  const nextExag = lensBlend.fromExag + (lensBlend.targetExag - lensBlend.fromExag) * ease;
  if (Math.abs(nextExag - currentExag) > 0.002 || (rawT >= 1.0 && Math.abs(lensBlend.targetExag - currentExag) > 0.0005)) {
    applyVerticalExaggeration(rawT >= 1.0 ? lensBlend.targetExag : nextExag, {
      skipNormals: rawT < 1.0,
      syncSlider: false
    });
  }

  applyMissionLensWeightsToMeshes(now);
  if (rawT >= 1.0) lensBlend.active = false;
}

function setSunPreset(presetKey) {
  if (!SUN_PRESETS[presetKey]) presetKey = 'morning';
  activeSunPreset = presetKey;
  if (terrainAnalysisWorker && !sunCache[presetKey]) {
    terrainAnalysisWorker.postMessage({ type: 'prioritize', job: `sun:${presetKey}` });
  }
  if (lensSunMesh && sunCache[presetKey]?.texture) {
    lensSunMesh.material.map = sunCache[presetKey].texture;
    lensSunMesh.material.needsUpdate = true;
  }
  renderMissionLensDetail();
  renderLensRouteStrip();
}

function setActiveMissionLens(lensId, { immediate = false } = {}) {
  if (!LENS_CONFIG[lensId]) lensId = 'satellite';
  activeMissionLens = lensId;
  lensBtns.forEach(btn => {
    const active = btn.dataset.lens === lensId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (lensId === 'sun') {
    if (terrainAnalysisWorker && !sunCache[activeSunPreset]) {
      terrainAnalysisWorker.postMessage({ type: 'prioritize', job: `sun:${activeSunPreset}` });
    }
    if (lensSunMesh && sunCache[activeSunPreset]?.texture) {
      lensSunMesh.material.map = sunCache[activeSunPreset].texture;
      lensSunMesh.material.needsUpdate = true;
    }
  } else if (lensId === 'radiation') {
    if (terrainAnalysisWorker && !svfCache) {
      terrainAnalysisWorker.postMessage({ type: 'prioritize', job: 'svf' });
    }
    if (lensSkyMesh && svfCache?.texture) {
      lensSkyMesh.material.map = svfCache.texture;
      lensSkyMesh.material.needsUpdate = true;
    }
  }

  if (lensExagBadge) {
    const isBriefing = levelState.getState().screen === GAME_STATES.BRIEFING;
    lensExagBadge.classList.toggle('hidden', isBriefing || currentViewMode !== 'MISSION' || lensId !== 'terrain');
  }

  if (mapLabels) mapLabels.setActiveLens(lensId);
  syncMissionElementsState();
  renderMissionLensDetail();
  renderLensRouteStrip();
  startLensCrossfade(lensId, immediate);
  requestAnimationFrame(updateLayoutBounds);
}

function buildLevelMapAnchors() {
  if (!rawHeights || !rawSlopes || !demFeatures || !crismClusters) return [];
  const anchors = [];

  const sampleWorldY = (lx, ly, yOffset) => {
    const { col, row } = localToGrid(lx, ly);
    const elev = sampleGridBilinear(rawHeights, col, row);
    return (elev - minElev) * currentExag + yOffset * currentExag;
  };

  // --- MISSION ---
  const startMesh = localToMesh(level01.start.x, level01.start.y);
  anchors.push({
    id: 'start',
    category: 'mission',
    categoryLabel: 'Mission Anchor',
    basePriority: 200,
    noLensBoost: true,
    sourceChip: 'measured',
    label: 'Start',
    hoverTitle: 'Start',
    whatItIs: `Corridor starting point on the north boundary (Elev ${level01.start.elevation.toFixed(1)} m, Slope ${level01.start.slopeDeg.toFixed(1)}°).`,
    solText: `Sol ${level01.start.sol}`,
    dataset: 'NASA PDS MSL Rover Localization + USGS Gale DEM',
    whyItMatters: 'Fixes the common starting elevation and slope entry baseline used to compare climb, traverse length, and exposure across candidates.',
    tags: [{ text: 'measured', cls: 'measured' }, { text: 'mission anchor', cls: 'game' }],
    worldX: startMesh.meshX,
    worldZ: startMesh.meshZ,
    getWorldY: () => sampleWorldY(level01.start.x, level01.start.y, 28)
  });

  const goalMesh = localToMesh(level01.goal.x, level01.goal.y);
  anchors.push({
    id: 'goal',
    category: 'mission',
    categoryLabel: 'Mission Anchor',
    basePriority: 198,
    noLensBoost: true,
    sourceChip: 'game',
    label: 'Goal: boxwork core zone',
    hoverTitle: 'Goal: boxwork core zone',
    whatItIs: `Shared traverse destination inside the core boxwork zone (Elev ${level01.goal.elevation.toFixed(1)} m).`,
    dataset: 'Level 1 mission target + USGS Gale DEM',
    whyItMatters: 'Establishes a uniform target coordinate so every route alternative solves the same origin-to-destination crossing.',
    tags: [{ text: 'measured', cls: 'measured' }, { text: 'goal: mission rule', cls: 'game' }],
    worldX: goalMesh.meshX,
    worldZ: goalMesh.meshZ,
    getWorldY: () => sampleWorldY(level01.goal.x, level01.goal.y, 78)
  });

  const bz = level01.goal.coreZoneBounds;
  const bzMesh = localToMesh(bz.xMin, bz.yMin);
  anchors.push({
    id: 'boxwork-zone',
    category: 'mission',
    categoryLabel: 'Mission Boundary',
    basePriority: 64,
    sourceChip: 'measured',
    label: 'Boxwork core zone',
    hoverTitle: 'Boxwork core zone',
    whatItIs: '153 × 283 m target zone containing mapped boxwork ridge networks.',
    solText: `Sols ${bz.sols}`,
    dataset: 'Curiosity Campaign Boundary (NASA/JPL)',
    whyItMatters: 'Marks the extent of the destination science zone; candidate paths differ in approach gradient and how closely they enter the margin.',
    tags: [{ text: 'measured', cls: 'measured' }, { text: 'mission rule', cls: 'game' }],
    worldX: bzMesh.meshX,
    worldZ: bzMesh.meshZ,
    getWorldY: () => sampleWorldY(bz.xMin, bz.yMin, 16)
  });

  // --- SCIENCE TARGETS (no Sol numbers before lock-in; ONLY Target 3 is Drill site) ---
  level01.scienceTargets.forEach((t, idx) => {
    let pinObj = null;
    if (scienceMarkersGroup) {
      pinObj = scienceMarkersGroup.children.find(c => c.userData && c.userData.isSciencePin && c.userData.markerKey === t.id);
    }
    const { meshX, meshZ } = pinObj ? { meshX: pinObj.position.x, meshZ: pinObj.position.z } : localToMesh(t.x, t.y);
    const elev = pinObj ? pinObj.userData.pt.elevation : t.elevation;
    const elem = level01Elements.elements.find(e => e.id === t.id);
    const tags = [
      { text: 'measured (Curiosity traverse); description unverified', cls: 'unverified' },
      { text: 'MISSION RULE', cls: 'game' }
    ];
    if (import.meta.env.DEV && elem?.whatIsIt?.verified === false) {
      tags.push({ text: 'verify before submission', cls: 'sim' });
    }

    anchors.push({
      id: t.id,
      category: 'science',
      categoryLabel: t.id === 'target-3' ? 'Science · Drill site' : 'Science · Science target',
      basePriority: 190 - idx * 2,
      noLensBoost: true,
      sourceChip: 'measured',
      label: `Target ${idx + 1}`,
      hoverTitle: t.id === 'target-3' ? (elem?.name || 'Drill site: Nevado Sajama drill') : `Target ${idx + 1}: ${t.title}`,
      whatItIs: elem?.whatIsIt?.text || t.title,
      effectOnMission: elem?.effectOnMission || null,
      solText: t.label,
      dataset: elem
        ? `Curiosity ROVER location (measured) · ${elem.placementRule}`
        : 'NASA PDS Curiosity ROVER traverse (location measured); description unverified',
      whyItMatters: elem
        ? `Effect on mission: ${elem.effectOnMission}`
        : 'Indicates a candidate science observation waypoint along the corridor; visiting nearby waypoints trades path detours or local slope for sampling coverage.',
      tags,
      worldX: meshX,
      worldZ: meshZ,
      getWorldY: () => (elev - minElev) * currentExag + 26 * currentExag
    });
  });

  // --- TERRAIN FEATURES (derived from DEM, no invented place names) ---
  const demDataset = 'USGS / NASA PDS MSL Gale Crater 1 m DEM Mosaic v3 (resampled ~4.9 m)';
  const { ridge, hollow, slopeFace, flatPlain, highGround, steepZones } = demFeatures;

  const ridgeMesh = localToMesh(ridge.x, ridge.y);
  anchors.push({
    id: 'dem-ridge',
    category: 'terrain',
    categoryLabel: 'Terrain Feature',
    basePriority: 52,
    sourceChip: 'derived',
    label: 'Ridge',
    hoverTitle: 'Ridge',
    whatItIs: `Prominent local topographic crest (TPI +${ridge.tpi.toFixed(1)} m above neighborhood, Elev ${ridge.elev.toFixed(0)} m).`,
    dataset: demDataset,
    whyItMatters: 'Elevated crests add uphill climb and expose traverses to fuller sky-view and grazing sunlight, while crest lines can separate drainage basins.',
    worldX: ridgeMesh.meshX,
    worldZ: ridgeMesh.meshZ,
    getWorldY: () => sampleWorldY(ridge.x, ridge.y, 26)
  });

  const hollowMesh = localToMesh(hollow.x, hollow.y);
  anchors.push({
    id: 'dem-hollow',
    category: 'terrain',
    categoryLabel: 'Terrain Feature',
    basePriority: 50,
    sourceChip: 'derived',
    label: 'Hollow',
    hoverTitle: 'Hollow',
    whatItIs: `Local topographic depression (TPI ${hollow.tpi.toFixed(1)} m below surrounding rim, Elev ${hollow.elev.toFixed(0)} m).`,
    dataset: demDataset,
    whyItMatters: 'Basins and hollows reduce open-sky exposure and lengthen low-angle terrain shadows, and may trap windblown finer dust or sand.',
    worldX: hollowMesh.meshX,
    worldZ: hollowMesh.meshZ,
    getWorldY: () => sampleWorldY(hollow.x, hollow.y, 26)
  });

  const sfMesh = localToMesh(slopeFace.x, slopeFace.y);
  anchors.push({
    id: 'dem-slope-face',
    category: 'terrain',
    categoryLabel: 'Terrain Feature',
    basePriority: 54,
    sourceChip: 'derived',
    label: 'Slope face',
    hoverTitle: 'Slope face',
    whatItIs: `Sustained steep escarpment face (~220 m span, mean slope ${slopeFace.meanSlope.toFixed(1)}°).`,
    dataset: demDataset,
    whyItMatters: 'Sustained inclined faces increase rover pitch/roll tilt, cross-slope slip risk, and climbing energy per meter gained.',
    worldX: sfMesh.meshX,
    worldZ: sfMesh.meshZ,
    getWorldY: () => sampleWorldY(slopeFace.x, slopeFace.y, 26)
  });

  const fpMesh = localToMesh(flatPlain.x, flatPlain.y);
  anchors.push({
    id: 'dem-flat-plain',
    category: 'terrain',
    categoryLabel: 'Terrain Feature',
    basePriority: 68,
    sourceChip: 'derived',
    label: 'Flat plain',
    hoverTitle: 'Flat plain',
    whatItIs: `Flattest 1×1 km DEM area (mean slope ${flatPlain.meanSlope.toFixed(1)}°, ${flatPlain.pctEasy.toFixed(0)}% <15°).`,
    dataset: demDataset,
    whyItMatters: 'Low-gradient plains keep tilt angles small and allow direct headings with minimal slope slowdown or climb energy.',
    worldX: fpMesh.meshX,
    worldZ: fpMesh.meshZ,
    getWorldY: () => sampleWorldY(flatPlain.x, flatPlain.y, 26)
  });

  const hgMesh = localToMesh(highGround.x, highGround.y);
  anchors.push({
    id: 'dem-high-ground',
    category: 'terrain',
    categoryLabel: 'Terrain Feature',
    basePriority: 66,
    sourceChip: 'derived',
    label: 'High ground',
    hoverTitle: 'High ground',
    whatItIs: `Highest 1×1 km DEM sector (mean ${highGround.meanElev.toFixed(0)} m, peak ${highGround.maxElev.toFixed(0)} m).`,
    dataset: demDataset,
    whyItMatters: 'Upper strata create steep approach slopes along Mount Sharp and cast long shadows toward neighboring lower basins.',
    worldX: hgMesh.meshX,
    worldZ: hgMesh.meshZ,
    getWorldY: () => sampleWorldY(highGround.x, highGround.y, 26)
  });

  // --- HAZARDS (>25° game threshold) ---
  steepZones.forEach((st, idx) => {
    const stMesh = localToMesh(st.x, st.y);
    anchors.push({
      id: idx === 0 ? 'hazard-steep' : `hazard-steep-${idx + 1}`,
      category: 'hazards',
      categoryLabel: 'Slope Hazard',
      basePriority: idx === 0 ? 74 : 58,
      sourceChip: 'game',
      label: 'Steep slope (>25°)',
      hoverTitle: 'Steep slope (>25°)',
      whatItIs: `Escarpment cluster (${st.pctHaz.toFixed(0)}% cells >25° in 500×500 m, up to ${st.maxSlope.toFixed(1)}°).`,
      dataset: 'slope_5m.bin (derived from 1 m DEM) · >25° threshold: mission rule',
      whyItMatters: 'Exceeding the 25° mission threshold marks high wheel-slip and tilt zones that generally force detours or slower climbing speeds.',
      tags: [{ text: 'derived from DEM', cls: 'dem' }, { text: 'mission rule (>25°)', cls: 'game' }],
      worldX: stMesh.meshX,
      worldZ: stMesh.meshZ,
      getWorldY: () => sampleWorldY(st.x, st.y, 26)
    });
  });

  // --- MATERIALS (Clustered CRISM MRDR t0902 orbital indicators) ---
  const crismDataset = 'CRISM MRDR t0902, orbital indicator (~180 m pixels)';
  crismClusters.clayClusters.forEach((cl, idx) => {
    const cm = localToMesh(cl.x, cl.y);
    anchors.push({
      id: `crism-clay-${idx + 1}`,
      category: 'materials',
      categoryLabel: 'Mineral Indicator',
      basePriority: 48 - idx * 3,
      sourceChip: 'measured',
      label: 'Clay-bearing indicator',
      hoverTitle: 'Clay-bearing indicator',
      whatItIs: `Phyllosilicate (Fe/Mg/Al) CRISM pixel cluster (${cl.pixelCount} connected ~180 m cells).`,
      dataset: crismDataset,
      whyItMatters: 'Orbital phyllosilicate signatures mark possible past aqueous alteration zones; coarse ~180 m footprints mean outcrop details vary at rover scale.',
      tags: [{ text: 'measured', cls: 'measured' }, { text: 'CRISM MRDR t0902', cls: 'dem' }],
      worldX: cm.meshX,
      worldZ: cm.meshZ,
      getWorldY: () => sampleWorldY(cl.x, cl.y, 26)
    });
  });

  crismClusters.hydClusters.forEach((hl, idx) => {
    const hm = localToMesh(hl.x, hl.y);
    anchors.push({
      id: `crism-hyd-${idx + 1}`,
      category: 'materials',
      categoryLabel: 'Mineral Indicator',
      basePriority: 46 - idx * 3,
      sourceChip: 'measured',
      label: 'Hydrated-mineral indicator',
      hoverTitle: 'Hydrated-mineral indicator',
      whatItIs: `Strong hydrated / sulfate CRISM pixel cluster (${hl.pixelCount} connected ~180 m cells, RGB sum ≥ 120).`,
      dataset: crismDataset,
      whyItMatters: 'Hydrated mineral detections highlight sulfate or bound-water strata of scientific interest at orbital scale (~180 m resolution).',
      tags: [{ text: 'measured', cls: 'measured' }, { text: 'CRISM MRDR t0902', cls: 'dem' }],
      worldX: hm.meshX,
      worldZ: hm.meshZ,
      getWorldY: () => sampleWorldY(hl.x, hl.y, 26)
    });
  });

  // --- CANDIDATE ROUTE START TAGS (A / B / C, counted in 8-label cap below Start/Goal/Targets) ---
  if (level01 && Array.isArray(level01.candidateRoutes)) {
    const targetTagOffsets = [860, 740, 1280];
    level01.candidateRoutes.forEach((r, idx) => {
      const wps = r.waypoints || [];
      if (!wps.length) return;
      const goalDist = targetTagOffsets[idx] || (290 + idx * 150);
      let acc = 0;
      let chosenWp = wps[0];
      for (let i = 1; i < wps.length; i++) {
        acc += Math.hypot(wps[i].x - wps[i - 1].x, wps[i].y - wps[i - 1].y);
        chosenWp = wps[i];
        if (acc >= goalDist) break;
      }
      const shortTag = r.blindLabel ? r.blindLabel.replace(/^Route\s+/i, '') : String.fromCharCode(65 + idx);
      const tagMesh = localToMesh(chosenWp.x, chosenWp.y);
      anchors.push({
        id: `route-tag-${shortTag.toLowerCase()}`,
        routeId: r.id,
        category: 'mission',
        categoryLabel: `Candidate Traverse · ${r.blindLabel}`,
        basePriority: 122 - idx,
        noLensBoost: true,
        sourceChip: 'game',
        pillClass: 'route-tag',
        iconText: '▸',
        accentColor: r.blindColor,
        label: shortTag,
        hoverTitle: `${r.blindLabel} (Candidate start)`,
        whatItIs: `Candidate traverse ${r.blindLabel} (${r.metrics.distKm.value.toFixed(2)} km measured path). Click to select this route.`,
        dataset: 'Red Quest A* terrain planner (USGS Gale DEM)',
        whyItMatters: `Highlights the initial departure corridor of ${r.blindLabel} from the shared Start point.`,
        tags: [{ text: 'mission rule', cls: 'game' }, { text: 'measured DEM', cls: 'measured' }],
        worldX: tagMesh.meshX,
        worldZ: tagMesh.meshZ,
        getWorldY: () => sampleWorldY(chosenWp.x, chosenWp.y, 18)
      });
    });
  }

  // --- CURIOSITY TRIMMED REFERENCE PATH (measured, counted in 8-label cap below A/B/C) ---
  if (trimmedCuriosityData && trimmedCuriosityData.points.length > 0) {
    const pts = trimmedCuriosityData.points;
    const anchorPt = pts[Math.floor(pts.length * 0.78)];
    const curMesh = localToMesh(anchorPt.x, anchorPt.y);
    anchors.push({
      id: 'curiosity-ref-path',
      category: 'mission',
      categoryLabel: 'Reference Traverse',
      basePriority: 119,
      noLensBoost: true,
      sourceChip: 'measured',
      pillClass: 'curiosity-ref-pill',
      iconText: '┈',
      accentColor: '#cbd5e1',
      label: "Curiosity's actual path (measured, reference)",
      hoverTitle: "Curiosity's actual path (measured, reference)",
      whatItIs: `Trimmed distance to boxwork core zone: ${trimmedCuriosityData.distKm.toFixed(2)} km (measured).`,
      whatDebrief: `Trimmed distance: ${trimmedCuriosityData.distKm.toFixed(2)} km (measured). Slope tiers along trimmed path (measured DEM, 15°/25° mission rule): ${trimmedCuriosityData.pctEasy.toFixed(1)}% Easy (<15°), ${trimmedCuriosityData.pctMod.toFixed(1)}% Moderate (15°–25°), ${trimmedCuriosityData.pctHaz.toFixed(1)}% Hazardous (>25°).`,
      solText: `Sols ${pts[0].sol}–${pts[pts.length - 1].sol} (trimmed)`,
      dataset: 'NASA PDS MSL Curiosity Rover Localization + USGS Gale DEM',
      whyItMatters: 'Actual Curiosity traverse trimmed from Start until its first entry into the boxwork core zone.',
      tags: [{ text: 'measured', cls: 'measured' }],
      tagsDebrief: [{ text: 'measured', cls: 'measured' }, { text: 'measured DEM', cls: 'dem' }, { text: 'mission rule', cls: 'game' }],
      worldX: curMesh.meshX,
      worldZ: curMesh.meshZ,
      getWorldY: () => sampleWorldY(anchorPt.x, anchorPt.y, 18)
    });
  }

  return anchors;
}

function initTerrainAnalysisWorker() {
  if (!rawHeights || terrainAnalysisWorker) return;
  terrainAnalysisWorker = new Worker(new URL('./game/terrainAnalysisWorker.js', import.meta.url), { type: 'module' });

  terrainAnalysisWorker.onmessage = e => {
    const msg = e.data;
    if (msg.type === 'sunResult') {
      const tex = buildDataTextureFromWorkerBuffer(msg.rgbaBuffer, msg.gridSize);
      sunCache[msg.preset] = { texture: tex, stats: msg.routeStats };
      plannerCandidates.forEach(c => {
        if (!routeLensStats[c.id]) routeLensStats[c.id] = { sun: {} };
        if (!routeLensStats[c.id].sun) routeLensStats[c.id].sun = {};
        if (msg.routeStats && msg.routeStats[c.id]) {
          routeLensStats[c.id].sun[msg.preset] = msg.routeStats[c.id];
        }
      });
      if (activeMissionLens === 'sun' && activeSunPreset === msg.preset) {
        if (lensSunMesh) {
          lensSunMesh.material.map = tex;
          lensSunMesh.material.needsUpdate = true;
        }
        updateMissionWorkerStatusUi();
        renderLensRouteStrip();
      }
    } else if (msg.type === 'svfResult') {
      const tex = buildDataTextureFromWorkerBuffer(msg.rgbaBuffer, msg.gridSize);
      svfCache = { texture: tex, stats: msg.routeStats };
      plannerCandidates.forEach(c => {
        if (!routeLensStats[c.id]) routeLensStats[c.id] = { sun: {} };
        if (msg.routeStats && msg.routeStats[c.id]) {
          routeLensStats[c.id].radiation = msg.routeStats[c.id];
        }
      });
      if (activeMissionLens === 'radiation') {
        if (lensSkyMesh) {
          lensSkyMesh.material.map = tex;
          lensSkyMesh.material.needsUpdate = true;
        }
        updateMissionWorkerStatusUi();
        renderLensRouteStrip();
      }
    }
  };

  terrainAnalysisWorker.onerror = err => {
    console.error('TerrainAnalysisWorker error:', err);
    updateMissionWorkerStatusUi();
  };

  const heightsCopy = rawHeights.slice();
  const simpleRoutes = plannerCandidates.map(c => ({ id: c.id, waypoints: c.waypoints }));
  terrainAnalysisWorker.postMessage(
    {
      type: 'init',
      gridSize: 1025,
      terrainWidthM: TERRAIN_WIDTH_M,
      heightsBuffer: heightsCopy.buffer,
      routes: simpleRoutes
    },
    [heightsCopy.buffer]
  );
}

// --- View Mode (MISSION | RESEARCH), Layout Bounds & Per-Mode Panel Memory ---
function updateLayoutBounds() {
  const hudRect = hudHeader ? hudHeader.getBoundingClientRect() : { bottom: 34 };
  const hudBottom = Math.max(34, Math.ceil(hudRect.bottom)) + 4;
  document.documentElement.style.setProperty('--hud-bottom', `${hudBottom}px`);

  const topCtrlVisible = mapTopControls && !mapTopControls.classList.contains('hidden');
  const topCtrlBottom = topCtrlVisible ? Math.ceil(mapTopControls.getBoundingClientRect().bottom) + 6 : hudBottom;

  let bottomTop = window.innerHeight - 12;
  const tlVisible = timelineBar && !timelineBar.classList.contains('hidden');
  if (tlVisible) {
    const tlRect = timelineBar.getBoundingClientRect();
    if (tlRect.height > 0) bottomTop = Math.min(bottomTop, Math.floor(tlRect.top) - 8);
  }
  if (perfReadout && import.meta.env.DEV) {
    perfReadout.classList.toggle('above-timeline', Boolean(tlVisible));
  }
  if (missionDock && !missionDock.classList.contains('hidden')) {
    const dockRect = missionDock.getBoundingClientRect();
    if (dockRect.height > 0) bottomTop = Math.min(bottomTop, Math.floor(dockRect.top) - 8);
  }

  if (plannerPanel && !plannerPanel.classList.contains('hidden')) {
    const plRect = plannerPanel.getBoundingClientRect();
    if (plRect.height > 0) {
      bottomTop = Math.min(bottomTop, Math.floor(plRect.top) - 8);
      cachedPlannerTop = plRect.top;
    } else {
      cachedPlannerTop = window.innerHeight;
    }
  } else {
    cachedPlannerTop = window.innerHeight;
  }

  const sideMaxH = Math.max(120, bottomTop - hudBottom);
  document.documentElement.style.setProperty('--side-max-h', `${sideMaxH}px`);

  const inspOpen = inspectorPanel && inspectorPanel.classList.contains('open');
  const inspRight = inspOpen ? Math.ceil(inspectorPanel.getBoundingClientRect().right) + 12 : 12;
  const calcOpen = currentViewMode === 'MISSION' && routeCalcPanel && !routeCalcPanel.classList.contains('hidden');
  const calcRect = calcOpen ? routeCalcPanel.getBoundingClientRect() : null;
  const calcRight = calcRect && calcRect.width > 0 ? Math.ceil(calcRect.right + 12) : inspRight;
  const missionLegOpen = currentViewMode === 'MISSION' && mapLegend && !mapLegend.classList.contains('hidden');
  const missionLegRight = missionLegOpen ? Math.ceil(mapLegend.getBoundingClientRect().right + 12) : 12;
  const leftSideRight = Math.max(inspRight, calcRight, missionLegRight);

  if (routeCalcPanel) routeCalcPanel.style.left = `${currentViewMode === 'MISSION' ? 12 : inspRight}px`;
  if (labelDetailCard) {
    labelDetailCard.style.top = `${Math.max(hudBottom + 6, topCtrlBottom)}px`;
    labelDetailCard.style.left = `${leftSideRight}px`;
  }

  // Keep bottom-left map legend clear of timeline, planner card, Survey Kit & inspector in RESEARCH mode
  if (mapLegend && !mapLegend.classList.contains('hidden')) {
    if (currentViewMode === 'MISSION') {
      mapLegend.style.left = '';
      mapLegend.style.bottom = '';
    } else {
      let baseBottom = 12;
      const tlRect = tlVisible ? timelineBar.getBoundingClientRect() : null;
      if (tlRect && tlRect.height > 0) {
        baseBottom = Math.max(baseBottom, Math.ceil(window.innerHeight - tlRect.top + 8));
      }
      const legRect = mapLegend.getBoundingClientRect();
      const legW = Math.max(180, Math.ceil(legRect.width));
      const legH = Math.max(48, Math.ceil(legRect.height));
      const plVisible = plannerPanel && !plannerPanel.classList.contains('hidden');
      const plRect = plVisible ? plannerPanel.getBoundingClientRect() : null;
      const hasPlanner = Boolean(plRect && plRect.height > 0);
      const fitsLeftOfPlanner = !hasPlanner || (inspRight + legW + 12 <= plRect.left);

      const calcBottomY = calcRect ? Math.ceil(calcRect.bottom) : hudBottom;
      const tlTopY = tlRect && tlRect.height > 0 ? Math.floor(tlRect.top) - 8 : window.innerHeight - 12;
      const sideBottomIfLeftOfPlanner = Math.min(tlTopY, window.innerHeight - 12);

      if (fitsLeftOfPlanner && (!calcOpen || sideBottomIfLeftOfPlanner - (calcBottomY + 12) >= legH)) {
        mapLegend.style.left = `${inspRight}px`;
        mapLegend.style.bottom = `${baseBottom}px`;
      } else {
        if (hasPlanner && plRect.left < inspRight + legW + 12) {
          baseBottom = Math.max(baseBottom, Math.ceil(window.innerHeight - plRect.top + 8));
        }
        const fitsUnderCalcAbovePlanner = !calcOpen || (bottomTop - (calcBottomY + 12) >= legH + 4);
        if (fitsUnderCalcAbovePlanner) {
          mapLegend.style.left = `${inspRight}px`;
          mapLegend.style.bottom = `${baseBottom}px`;
        } else {
          mapLegend.style.left = `${calcRight}px`;
          if (hasPlanner && calcRight + legW + 12 > plRect.left) {
            baseBottom = Math.max(baseBottom, Math.ceil(window.innerHeight - plRect.top + 8));
          }
          mapLegend.style.bottom = `${baseBottom}px`;
        }
      }
    }
  }

  // Keep top-right Labels & Curiosity path buttons clear of open RESEARCH Layers drawer
  const layersOpen = layersPanel && layersPanel.classList.contains('open');
  if (mapTopControls) {
    mapTopControls.style.right = (currentViewMode === 'RESEARCH' && layersOpen) ? '328px' : '12px';
  }
  if (missionObjectiveBanner && !missionObjectiveBanner.classList.contains('hidden')) {
    const topRightLeft = topCtrlVisible ? Math.floor(mapTopControls.getBoundingClientRect().left) - 12 : window.innerWidth - 12;
    const bannerLeftBound = Math.max(12, leftSideRight);
    const availW = Math.max(180, topRightLeft - bannerLeftBound);
    missionObjectiveBanner.style.left = `${Math.round(bannerLeftBound + availW * 0.5)}px`;
    missionObjectiveBanner.style.maxWidth = `${Math.max(180, availW - 12)}px`;
  }
  const codexOpen = currentViewMode === 'MISSION' && codexPanel && !codexPanel.classList.contains('hidden');
  cachedLabelLeftLimit = Math.max(10, leftSideRight);
  cachedLabelRightLimit = (layersOpen || codexOpen) ? Math.max(200, window.innerWidth - 336) : window.innerWidth - 10;
  cachedLabelTopLimit = Math.max(44, hudBottom);
  const obs = [];
  if (topCtrlVisible && mapTopControls) {
    const r = mapTopControls.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) obs.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }
  if (missionObjectiveBanner && !missionObjectiveBanner.classList.contains('hidden')) {
    const r = missionObjectiveBanner.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) obs.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }
  cachedLabelObstacleBoxes = obs;
}

function syncPanelsToViewMode() {
  const screen = levelState.getState().screen;
  const isBriefing = screen === GAME_STATES.BRIEFING;
  const canPlan = screen === GAME_STATES.ANALYZE || screen === GAME_STATES.CHOOSE;
  const isPostLock = screen === GAME_STATES.EXPLORE || screen === GAME_STATES.DEBRIEF;
  const prefs = panelPrefs[currentViewMode];

  document.body.classList.toggle('mode-mission', currentViewMode === 'MISSION');
  document.body.classList.toggle('mode-research', currentViewMode === 'RESEARCH');

  if (viewModeToggle) {
    viewModeToggle.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === currentViewMode);
    });
  }

  if (layersPanelTitle) {
    layersPanelTitle.textContent = currentViewMode === 'MISSION' ? 'Decision Lenses' : 'Layers';
  }

  let activeSide = 'none';
  if (currentViewMode === 'MISSION' && !isBriefing) {
    activeSide = prefs.activeSidePanel || 'none';
    if (!canPlan && activeSide === 'survey') activeSide = 'none';
  }

  const showInsp = currentViewMode === 'MISSION'
    ? (activeSide === 'inspector')
    : (!isBriefing && panelPrefs.RESEARCH.inspectorOpen);
  const showLayers = currentViewMode === 'MISSION'
    ? (activeSide === 'lenses')
    : (!isBriefing && panelPrefs.RESEARCH.layersOpen);
  const showCodex = currentViewMode === 'MISSION' && activeSide === 'codex';
  const showLegend = currentViewMode === 'MISSION'
    ? (activeSide === 'legend')
    : !isBriefing;

  // Point Inspector open/closed per mode
  if (inspectorPanel) {
    inspectorPanel.classList.toggle('open', showInsp);
    const toggleBtn = inspectorPanel.querySelector('.panel-toggle');
    if (toggleBtn) toggleBtn.textContent = showInsp ? '◀' : '▶';
  }

  // Layers / Decision Lenses panel open/closed per mode
  if (layersPanel) {
    layersPanel.classList.toggle('open', showLayers);
    const toggleBtn = layersPanel.querySelector('.panel-toggle');
    if (toggleBtn) toggleBtn.textContent = showLayers ? '▶' : '◀';
  }

  // Top-right filter controls (Curiosity path, Show all elements & Labels)
  if (mapTopControls) {
    mapTopControls.classList.toggle('hidden', isBriefing);
  }
  if (btnCuriosityPath) {
    btnCuriosityPath.classList.toggle('hidden', isBriefing || currentViewMode !== 'MISSION');
    btnCuriosityPath.classList.toggle('active', showCuriosityPath);
    btnCuriosityPath.setAttribute('aria-pressed', showCuriosityPath ? 'true' : 'false');
  }
  if (btnShowAllElements) {
    btnShowAllElements.classList.toggle('hidden', isBriefing || currentViewMode !== 'MISSION');
  }
  if (lensExagBadge) {
    lensExagBadge.classList.toggle('hidden', isBriefing || currentViewMode !== 'MISSION' || activeMissionLens !== 'terrain');
  }

  // Short top objective banner (MISSION mode post-briefing)
  if (missionObjectiveBanner && objectiveBannerText) {
    const showBanner = currentViewMode === 'MISSION' && !isBriefing;
    missionObjectiveBanner.classList.toggle('hidden', !showBanner);
    const lockedId = levelState.getState().lockedRouteId;
    if (screen === GAME_STATES.ANALYZE) {
      objectiveBannerText.textContent = 'Explore the map, then choose a route';
    } else if (screen === GAME_STATES.CHOOSE) {
      objectiveBannerText.textContent = 'Compare Routes A, B, and C, then lock in your plan';
    } else if (screen === GAME_STATES.EXPLORE) {
      const lockedCand = level01.candidateRoutes.find(r => r.id === lockedId);
      objectiveBannerText.textContent = lockedCand
        ? `Exploring locked traverse — ${lockedCand.blindLabel}`
        : 'Executing locked traverse toward the boxwork core';
    } else if (screen === GAME_STATES.DEBRIEF) {
      objectiveBannerText.textContent = 'Debrief — review estimates, true values & Curiosity reference';
    }
    if (btnBannerAction) {
      const showExploreDebriefBtn =
        screen === GAME_STATES.EXPLORE &&
        !awaitingSurveyResultContinue &&
        exploreOverlayDismissed;
      const showReopenDebriefBtn =
        screen === GAME_STATES.DEBRIEF &&
        debriefOverlayDismissed;
      if (showExploreDebriefBtn) {
        btnBannerAction.textContent = 'View Debrief →';
        btnBannerAction.classList.remove('hidden');
      } else if (showReopenDebriefBtn) {
        btnBannerAction.textContent = 'Open Debrief';
        btnBannerAction.classList.remove('hidden');
      } else {
        btnBannerAction.classList.add('hidden');
      }
    }
  }

  // Bottom Mission Dock (Inspector, Legend, Lenses, Codex; Survey Kit & Routes visible in ANALYZE/CHOOSE)
  const showDock = currentViewMode === 'MISSION' && !isBriefing;
  if (missionDock) {
    missionDock.classList.toggle('hidden', !showDock);
  }
  if (btnDockInspector) {
    btnDockInspector.classList.toggle('active', showInsp);
    btnDockInspector.setAttribute('aria-expanded', showInsp ? 'true' : 'false');
  }
  if (btnDockLegend) {
    btnDockLegend.classList.toggle('active', showLegend);
    btnDockLegend.setAttribute('aria-expanded', showLegend ? 'true' : 'false');
  }
  if (btnCalcToggle) {
    btnCalcToggle.classList.toggle('hidden', isPostLock || !showDock);
  }
  if (btnLenses) {
    btnLenses.classList.toggle('hidden', !showDock);
    btnLenses.classList.toggle('open', showLayers);
    btnLenses.classList.toggle('active', showLayers);
    btnLenses.setAttribute('aria-expanded', showLayers ? 'true' : 'false');
  }
  if (btnCodex) {
    btnCodex.classList.toggle('hidden', !showDock);
    btnCodex.classList.toggle('open', showCodex);
    btnCodex.classList.toggle('active', showCodex);
    btnCodex.setAttribute('aria-expanded', showCodex ? 'true' : 'false');
  }
  if (btnDockRoutes) {
    btnDockRoutes.classList.toggle('hidden', isPostLock || !showDock);
    const routesExpanded = !prefs.plannerCollapsed;
    btnDockRoutes.classList.toggle('active', routesExpanded);
    btnDockRoutes.setAttribute('aria-expanded', routesExpanded ? 'true' : 'false');
  }

  // Map legend visibility & Curiosity reference row gating (post lock-in only)
  if (mapLegend) {
    mapLegend.classList.toggle('hidden', !showLegend);
    if (currentViewMode === 'MISSION') {
      mapLegend.classList.toggle('open', showLegend);
    }
  }
  if (legendRefRow) {
    const showRefLegend = (currentViewMode === 'RESEARCH') || (isPostLock && showCuriosityPath);
    legendRefRow.classList.toggle('hidden', !showRefLegend);
  }
  if (codexPanel) {
    codexPanel.classList.toggle('hidden', !showCodex);
    if (showCodex) renderFieldCodex();
  }

  const isDebrief = screen === GAME_STATES.DEBRIEF;
  const isExploring = screen === GAME_STATES.EXPLORE && !awaitingSurveyResultContinue;
  if (curiosityRefGroup && curiosityRefLine) {
    const showTrimmedRef = (currentViewMode === 'RESEARCH') || (currentViewMode === 'MISSION' && isPostLock && !isExploring && showCuriosityPath);
    curiosityRefGroup.visible = showTrimmedRef;
    if (curiosityRefLine.material) {
      curiosityRefLine.material.color.setHex(isDebrief ? 0xf8fafc : 0xcbd5e1);
      curiosityRefLine.material.linewidth = isDebrief ? 2.8 : 2.0;
      curiosityRefLine.material.opacity = isDebrief ? 0.96 : 0.78;
    }
  }

  // Map labels context
  if (mapLabels) {
    mapLabels.setAnchorHidden('curiosity-ref-path', currentViewMode === 'MISSION' ? (!isPostLock || !showCuriosityPath) : false);
    mapLabels.setViewContext({ isBriefing, isPostLock, isDebrief });
  }

  // Apply 3D visibility differences between MISSION Lenses and RESEARCH Layers
  applyLayerVisibilityForMode();

  // Planner collapsed state & Elevation Profile compact reveal
  if (plannerPanel) {
    plannerPanel.classList.toggle('collapsed', prefs.plannerCollapsed);
    if (btnTogglePlanner) {
      btnTogglePlanner.textContent = prefs.plannerCollapsed ? '▲ Expand' : '▼ Collapse';
    }
  }

  if (elevationProfileBox) {
    const showProfile = currentViewMode === 'RESEARCH' || (!prefs.plannerCollapsed && prefs.profileOpen);
    elevationProfileBox.classList.toggle('profile-collapsed', !showProfile);
    if (showProfile) {
      const selectedCand = plannerCandidates.find(c => c.id === selectedCandidateId);
      if (selectedCand) {
        requestAnimationFrame(() => drawElevationChart(selectedCand));
      }
    }
  }

  if (lensRouteStrip && currentViewMode === 'MISSION') {
    renderLensRouteStrip();
  }
  syncRouteCalcPanelUi();

  // Hide cursor tooltip in RESEARCH mode or BRIEFING
  if (currentViewMode !== 'MISSION' || isBriefing || isPinned) {
    hideHoverTooltip();
  }

  // Re-evaluate Traversability index & Nearest Sol visibility immediately
  const hidePreLockPrivate =
    currentViewMode === 'MISSION' &&
    (screen === GAME_STATES.BRIEFING || screen === GAME_STATES.ANALYZE || screen === GAME_STATES.CHOOSE);
  if (iSolRow) {
    iSolRow.style.display = hidePreLockPrivate ? 'none' : '';
  }
  if (iMobilityRow) {
    iMobilityRow.style.display = hidePreLockPrivate ? 'none' : '';
  }
  const activePt = pinnedPoint || lastTerrainHit;
  if (activePt && rawHeights && rawSlopes) {
    updatePointInspector(activePt.lx, activePt.ly);
  } else {
    if (iSol) iSol.textContent = hidePreLockPrivate ? 'Hidden until lock-in' : 'Hover terrain';
    if (iMobility) iMobility.textContent = hidePreLockPrivate ? 'Hidden until lock-in' : '—';
  }

  requestAnimationFrame(updateLayoutBounds);
}

function setViewMode(mode) {
  if (mode !== 'MISSION' && mode !== 'RESEARCH') return;
  if (currentViewMode === mode) return;
  currentViewMode = mode;
  if (mode === 'RESEARCH' && tutorialCtrl && tutorialCtrl.isActive()) {
    tutorialCtrl.skip();
  }
  if (mode === 'RESEARCH') {
    const userExag = exagSlider ? parseFloat(exagSlider.value) || 1.0 : 1.0;
    lensBlend.active = false;
    if (Math.abs(currentExag - userExag) > 0.001) {
      applyVerticalExaggeration(userExag, { skipNormals: false, syncSlider: true });
    }
  } else {
    setActiveMissionLens(activeMissionLens, { immediate: false });
  }
  syncPanelsToViewMode();
}

// --- Level 1 Game Structure Wiring ---
function applyGameScreenState(state) {
  const screen = state.screen;
  const isRefRevealed = screen === GAME_STATES.DEBRIEF;

  if (routeCalc) {
    routeCalc.onScreenTransition(screen);
  }

  updatePhaseStepper(screen);

  // Overlays
  if (gameBriefingOverlay) gameBriefingOverlay.classList.toggle('hidden', screen !== GAME_STATES.BRIEFING);
  if (gameDebriefOverlay) gameDebriefOverlay.classList.toggle('hidden', screen !== GAME_STATES.DEBRIEF || debriefOverlayDismissed);
  if (exploreMapCard) exploreMapCard.classList.add('hidden');
  if (gameProceedModal && screen !== GAME_STATES.DEBRIEF) gameProceedModal.classList.add('hidden');

  // Candidate lines visibility: only locked route visible in EXPLORE/DEBRIEF
  if (candidateLines) {
    if (screen === GAME_STATES.EXPLORE || screen === GAME_STATES.DEBRIEF) {
      Object.keys(candidateLines).forEach(candId => {
        if (candidateLines[candId]) {
          candidateLines[candId].visible = (candId === state.lockedRouteId);
        }
      });
    } else {
      Object.keys(candidateLines).forEach(candId => {
        if (candidateLines[candId]) {
          candidateLines[candId].visible = true;
        }
      });
    }
  }
  const isExploring = screen === GAME_STATES.EXPLORE && !awaitingSurveyResultContinue;
  if (screen === GAME_STATES.EXPLORE) exploreHintDismissed = false;
  if (gameExploreOverlay) {
    gameExploreOverlay.classList.toggle('hidden', !isExploring || exploreHintDismissed);
  }
  if (gameDebriefOverlay) gameDebriefOverlay.classList.toggle('hidden', screen !== GAME_STATES.DEBRIEF || debriefOverlayDismissed);

  // Survey Kit scan gating: no new scans in CHOOSE or post-lock
  if (surveyKit) {
    if (screen === GAME_STATES.CHOOSE || screen === GAME_STATES.EXPLORE || screen === GAME_STATES.DEBRIEF) {
      if (typeof surveyKit.deactivate === 'function') {
        surveyKit.deactivate();
      } else if (typeof surveyKit.clearTool === 'function') {
        surveyKit.clearTool();
      }
    }
  }

  // Full reference rover/timeline traverse stays hidden until DEBRIEF in MISSION mode (trimmed dashed Curiosity path shows from ANALYZE+)
  const isPostLock = screen === GAME_STATES.EXPLORE || screen === GAME_STATES.DEBRIEF;
  if (routeGroup) {
    routeGroup.visible = currentViewMode === 'RESEARCH'
      ? (lyrRoute ? lyrRoute.checked : true)
      : (isRefRevealed && (lyrRoute ? lyrRoute.checked : true));
  }
  if (lyrRefControls) {
    lyrRefControls.style.display = isRefRevealed ? '' : 'none';
  }
  if (timelineBar) {
    timelineBar.classList.toggle('hidden', !isRefRevealed);
  }
  if (!isRefRevealed && isPlaying) {
    isPlaying = false;
    if (btnPlay) btnPlay.textContent = '▶';
  }
  if (!isPostLock && iSol && iSol.textContent !== '—') {
    iSol.textContent = 'Hidden until lock-in';
  } else if (isPostLock && iSol && iSol.textContent === 'Hidden until lock-in') {
    iSol.textContent = 'Hover terrain';
  }

  // Science markers: show Level 1's 3 targets before DEBRIEF, all markers in DEBRIEF
  if (scienceMarkersGroup) {
    scienceMarkersGroup.children.forEach(obj => {
      if (obj.userData && typeof obj.userData.targetSol === 'number') {
        obj.visible = isRefRevealed || LEVEL1_TARGET_SOLS.has(obj.userData.targetSol);
      }
    });
  }

  // Planner panel & blinded Route A/B/C controls
  const showPlanner = screen === GAME_STATES.ANALYZE || screen === GAME_STATES.CHOOSE;
  if (screen === GAME_STATES.CHOOSE && panelPrefs.MISSION) {
    panelPrefs.MISSION.plannerCollapsed = false;
  }
  if (plannerPanel) {
    plannerPanel.classList.toggle('hidden', !showPlanner);
    plannerPanel.classList.toggle('game-blinded', showPlanner);
    plannerPanel.classList.toggle('no-timeline', !isRefRevealed);
  }

  if (btnGoChoose) btnGoChoose.style.display = screen === GAME_STATES.ANALYZE ? 'inline-block' : 'none';
  if (btnBackAnalyze) btnBackAnalyze.style.display = screen === GAME_STATES.CHOOSE ? 'inline-block' : 'none';
  if (btnLockRoute) {
    btnLockRoute.style.display = screen === GAME_STATES.CHOOSE ? 'inline-block' : 'none';
    const sel = plannerCandidates.find(c => c.id === (state.selectedRouteId || selectedCandidateId));
    btnLockRoute.textContent = `Lock in & Explore ${sel ? sel.name : 'Route'} →`;
  }

  if (plannerStatus) {
    if (screen === GAME_STATES.ANALYZE) {
      plannerStatus.textContent = 'Step 1 (Analyze): inspect terrain layers & Routes A, B, C';
    } else if (screen === GAME_STATES.CHOOSE) {
      plannerStatus.textContent = 'Step 2 (Choose): review route estimates & Lock in route';
    }
  }

  if (showPlanner) {
    const selectedCand = plannerCandidates.find(c => c.id === (state.selectedRouteId || selectedCandidateId));
    if (selectedCand) {
      if (profileRouteName) {
        profileRouteName.textContent = selectedCand.name.toUpperCase();
        profileRouteName.style.color = selectedCand.color;
      }
      requestAnimationFrame(() => drawElevationChart(selectedCand));
    }
  }

  // Explore mode body class toggles seamless drive HUD & suppresses map controls
  document.body.classList.toggle('screen-explore', isExploring);

  if (isExploring) {
    const locked = level01.candidateRoutes.find(r => r.id === state.lockedRouteId);
    if (exploreLockedRoute) exploreLockedRoute.textContent = locked ? locked.blindLabel : 'Route A';

    // Start Rover Driving Exploration Mode
    controls.enabled = false;
    if (roverExploreModel) roverExploreModel.visible = true;
    if (roverShadow) roverShadow.visible = true;
    if (roverRouteRibbon) {
      roverRouteRibbon.setVisible(true);
      if (locked) {
        roverRouteRibbon.setRoute(locked, sampleElevationAtMeters, currentExag, minElev);
      }
    }
    if (roverHUD) {
      if (locked) roverHUD.setRoute(locked);
      roverHUD.show();
    }
    if (roverAudio) roverAudio.setActive(true);

    // Hide research-mode route line, planner candidates, reference line, and markers during exploration
    if (routeGroup) routeGroup.visible = false;
    if (curiosityRefGroup) curiosityRefGroup.visible = false;
    if (startFlagGroup) startFlagGroup.visible = false;
    if (boxworkGroup) boxworkGroup.visible = false;
    if (plannerGroup) plannerGroup.visible = false;
    Object.values(candidateLines).forEach(cl => { if (cl) cl.visible = false; });
    if (startMarker) startMarker.visible = false;
    if (goalMarker) goalMarker.visible = false;
    if (cursorReticle) cursorReticle.visible = false;
    if (pinnedReticle) pinnedReticle.visible = false;

    // Reset rover input state
    roverInputState.forward = 0;
    roverInputState.steer = 0;
    roverInputState.boost = false;
    roverInputState.action = false;
    roverInputState.reset = false;
    // Re-apply any movement keys still physically held during the transition.
    syncRoverInputFromKeys();

    // Place rover at candidate route start waypoint if available, otherwise level start
    if (roverPhysics) {
      const sX = locked && locked.waypoints && locked.waypoints[0] ? locked.waypoints[0].x : level01.start.x;
      const sY = locked && locked.waypoints && locked.waypoints[0] ? locked.waypoints[0].y : level01.start.y;
      
      let initHeading = 0.0;
      if (locked && locked.waypoints && locked.waypoints.length > 1) {
        const wp1 = locked.waypoints[1];
        const dx = wp1.x - sX;
        const dy = wp1.y - sY;
        initHeading = Math.atan2(dx, dy);
      }
      roverPhysics.reset(sX, sY, initHeading);
      if (roverInteractions) roverInteractions.reset();
      if (roverChaseCamera) roverChaseCamera.resetOrbit();
    }

    // Faceted solid-colour terrain + dusty haze for the driving view
    if (roverTerrain && roverPhysics) {
      enterExploreLook();
      const sm = localToMesh(roverPhysics.x, roverPhysics.y);
      roverTerrain.setActive(true, { x: sm.meshX, z: sm.meshZ });
    }
    camera.near = 1.0;
    camera.updateProjectionMatrix();
    if (roverWorldProps) roverWorldProps.setActive(true);
    if (roverDustStormParticles) {
      roverDustStormParticles.setExaggeration(currentExag);
      roverDustStormParticles.setVisible(true);
    }
    if (roverMovementDust) {
      roverMovementDust.setVisible(true);
    }
  } else {
    // When leaving EXPLORE mode or while awaiting survey result
    controls.enabled = true;
    camera.near = 10.0;
    camera.updateProjectionMatrix();
    if (roverTerrain) roverTerrain.setActive(false);
    if (roverWorldProps) roverWorldProps.setActive(false);
    if (roverDustStormParticles) roverDustStormParticles.setVisible(false);
    if (roverMovementDust) roverMovementDust.setVisible(false);
    exitExploreLook();
    if (roverExploreModel) roverExploreModel.visible = false;
    if (roverShadow) roverShadow.visible = false;
    if (roverRouteRibbon) roverRouteRibbon.setVisible(false);
    if (roverHUD) roverHUD.hide();
    if (roverAudio) roverAudio.setActive(false);

    // Restore research-mode scene objects
    if (routeGroup) {
      routeGroup.visible = currentViewMode === 'RESEARCH'
        ? (lyrRoute ? lyrRoute.checked : true)
        : (isRefRevealed && (lyrRoute ? lyrRoute.checked : true));
    }
    if (startFlagGroup) startFlagGroup.visible = true;
    if (boxworkGroup) boxworkGroup.visible = true;
    if (plannerGroup) plannerGroup.visible = true;
    Object.values(candidateLines).forEach(cl => { if (cl) cl.visible = true; });
    if (startMarker) startMarker.visible = true;
    if (goalMarker) goalMarker.visible = true;

    // Clear rover input state
    roverInputState.forward = 0;
    roverInputState.steer = 0;
    roverInputState.boost = false;
    roverInputState.action = false;
    roverInputState.reset = false;
  }

  if (screen === GAME_STATES.DEBRIEF) {
    const surveyEval = frozenSurveyEval || (surveyLog ? surveyLog.evaluateCurrent() : null);
    const sScore = surveyEval ? surveyEval.totalScore : 0;
    populateDebriefUI(level01, state.lockedRouteId, trimmedCuriosityData, activeDriveStats, sScore);
    renderDebriefCalculatorReveal();

    const hasLockedRoute = Boolean(state.lockedRouteId);
    if (btnDebriefProceedGame) {
      btnDebriefProceedGame.classList.toggle('hidden', !hasLockedRoute);
    }
    if (btnDebriefChoose) {
      btnDebriefChoose.textContent = hasLockedRoute ? '← Choose Another Route' : 'Choose a Route →';
      btnDebriefChoose.classList.toggle('btn-game-primary', !hasLockedRoute);
      btnDebriefChoose.classList.toggle('btn-planner-tool', hasLockedRoute);
    }
  }

  syncPanelsToViewMode();
  if (missionElements) {
    missionElements.setState({
      exploring: isExploring
    });
  }
}

function bindGameEvents() {
  populateBriefingUI(level01);
  levelState.subscribe(applyGameScreenState);

  if (viewModeToggle) {
    viewModeToggle.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playUiSound('modeSwitch', { mode: btn.dataset.mode });
        setViewMode(btn.dataset.mode);
      });
    });
  }

  // Subtle sound hook for MISSION top bar, dock & primary interactive controls (no-op placeholder)
  [hudHeader, mapTopControls, missionDock, plannerPanel].forEach(rootEl => {
    if (!rootEl) return;
    rootEl.addEventListener('click', e => {
      const btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (btn && !btn.disabled) playUiSound('uiClick', { id: btn.id || btn.className });
    });
    rootEl.addEventListener('pointerenter', e => {
      const btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (btn && !btn.disabled) playUiSound('uiHover', { id: btn.id || btn.className });
    }, true);
  });

  if (btnDockInspector) {
    btnDockInspector.addEventListener('click', () => {
      if (currentViewMode !== 'MISSION') return;
      toggleMissionSidePanel('inspector');
    });
  }

  if (btnDockLegend) {
    btnDockLegend.addEventListener('click', () => {
      if (currentViewMode !== 'MISSION') return;
      toggleMissionSidePanel('legend');
    });
  }

  if (btnDockRoutes) {
    btnDockRoutes.addEventListener('click', () => {
      if (currentViewMode !== 'MISSION') return;
      panelPrefs.MISSION.plannerCollapsed = !panelPrefs.MISSION.plannerCollapsed;
      syncPanelsToViewMode();
      requestAnimationFrame(updateLayoutBounds);
    });
  }

  if (btnLenses) {
    btnLenses.addEventListener('click', () => {
      if (currentViewMode === 'MISSION') {
        toggleMissionSidePanel('lenses');
      } else {
        panelPrefs.RESEARCH.layersOpen = !panelPrefs.RESEARCH.layersOpen;
        syncPanelsToViewMode();
      }
      if (tutorialCtrl) tutorialCtrl.notifyAction('open-lenses');
    });
  }

  if (btnLabels && labelsDropdown) {
    btnLabels.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = labelsDropdown.classList.toggle('hidden') === false;
      btnLabels.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    window.addEventListener('click', e => {
      if (!labelsDropdown.classList.contains('hidden') && !e.target.closest('#labels-dropdown-wrap')) {
        labelsDropdown.classList.add('hidden');
        btnLabels.setAttribute('aria-expanded', 'false');
      }
    });
  }

  labelCatChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      const next = !chip.classList.contains('active');
      chip.classList.toggle('active', next);
      chip.setAttribute('aria-pressed', next ? 'true' : 'false');
      if (mapLabels) mapLabels.setCategoryEnabled(cat, next);
      if (missionElements) missionElements.setCategoryEnabled(cat, next);
      if (btnLabels && mapLabels) {
        btnLabels.classList.toggle('active', mapLabels.getEnabledCategories().length > 0);
      }
    });
  });

  if (btnLabelsShowAll) {
    btnLabelsShowAll.addEventListener('click', () => {
      const next = !btnLabelsShowAll.classList.contains('active');
      btnLabelsShowAll.classList.toggle('active', next);
      btnLabelsShowAll.setAttribute('aria-pressed', next ? 'true' : 'false');
      if (mapLabels) mapLabels.setShowAll(next);
    });
  }

  if (btnCuriosityPath) {
    btnCuriosityPath.addEventListener('click', () => {
      playUiSound('toggle');
      showCuriosityPath = !showCuriosityPath;
      btnCuriosityPath.classList.toggle('active', showCuriosityPath);
      btnCuriosityPath.setAttribute('aria-pressed', showCuriosityPath ? 'true' : 'false');
      syncPanelsToViewMode();
    });
  }

  if (btnShowAllElements) {
    btnShowAllElements.addEventListener('click', () => {
      showAllElements = !showAllElements;
      btnShowAllElements.classList.toggle('active', showAllElements);
      btnShowAllElements.setAttribute('aria-pressed', showAllElements ? 'true' : 'false');
      syncMissionElementsState();
    });
  }

  if (btnCodex && codexPanel) {
    btnCodex.addEventListener('click', () => {
      if (currentViewMode !== 'MISSION') return;
      toggleMissionSidePanel('codex');
    });
  }

  if (codexClose && codexPanel) {
    codexClose.addEventListener('click', () => {
      if (currentViewMode === 'MISSION') {
        setMissionSidePanel('none');
      } else {
        codexPanel.classList.add('hidden');
      }
    });
  }

  sunPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => setSunPreset(btn.dataset.sun));
  });

  if (btnToggleLegend && mapLegend) {
    btnToggleLegend.addEventListener('click', () => {
      if (currentViewMode === 'MISSION') {
        setMissionSidePanel('none');
        return;
      }
      const open = mapLegend.classList.toggle('open');
      btnToggleLegend.setAttribute('aria-expanded', open ? 'true' : 'false');
      requestAnimationFrame(updateLayoutBounds);
    });
  }

  lensBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveMissionLens(btn.dataset.lens);
      if (tutorialCtrl) tutorialCtrl.notifyAction('open-lenses');
    });
  });

  if (btnMissionResetView && btnReset) {
    btnMissionResetView.addEventListener('click', () => btnReset.click());
  }
  if (btnMissionFocusBoxwork && btnBoxwork) {
    btnMissionFocusBoxwork.addEventListener('click', () => btnBoxwork.click());
  }

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => updateLayoutBounds());
    if (hudHeader) ro.observe(hudHeader);
    if (plannerPanel) ro.observe(plannerPanel);
    if (timelineBar) ro.observe(timelineBar);
  }

  if (btnStartMission) {
    btnStartMission.addEventListener('click', () => {
      panelPrefs.MISSION.plannerCollapsed = true;
      levelState.startMission();
      if (!hasPlayedIntro) {
        hasPlayedIntro = true;
        startCinematicIntro();
      }
    });
  }

  if (btnGoChoose) {
    btnGoChoose.addEventListener('click', () => {
      panelPrefs.MISSION.plannerCollapsed = false;
      levelState.goToChoose();
    });
  }

  if (btnBackAnalyze) {
    btnBackAnalyze.addEventListener('click', () => {
      levelState.goToAnalyze();
    });
  }

  if (btnLockRoute) {
    btnLockRoute.addEventListener('click', () => {
      debriefOverlayDismissed = false;
      // Freeze all estimates permanently at this moment
      if (surveyLog) {
        frozenSurveyEval = surveyLog.evaluateCurrent();
      }
      if (routeCalc) {
        frozenRouteCalcSnapshot = routeCalc.getFrozenSnapshot();
      }
      levelState.lockInRoute();
    });
  }

  const finishDriveToDebrief = () => {
    // Capture drive stats if the player ends the drive before reaching the goal
    if (!activeDriveStats && roverPhysics) {
      activeDriveStats = {
        scienceScore: roverInteractions ? roverInteractions.scienceScore : 0,
        discoveredCount: roverInteractions ? roverInteractions.discoveredCount : 0,
        totalDistanceM: roverPhysics.totalDistanceM,
        batteryRemainingPct: roverPhysics.batteryPct,
        driveTimeSec: roverPhysics.driveTimeSec
      };
    }
    levelState.goToDebrief();
  };

  if (btnSurveyResultContinue) {
    btnSurveyResultContinue.addEventListener('click', () => {
      awaitingSurveyResultContinue = false;
      if (surveyResultOverlay) surveyResultOverlay.classList.add('hidden');
      applyGameScreenState(levelState.getState());
    });
  }

  const btnExploreHintClose = document.getElementById('btn-explore-hint-close');
  if (btnExploreHintClose) {
    btnExploreHintClose.addEventListener('click', () => {
      exploreHintDismissed = true;
      if (gameExploreOverlay) gameExploreOverlay.classList.add('hidden');
    });
  }

  if (btnGoDebrief) {
    btnGoDebrief.addEventListener('click', finishDriveToDebrief);
  }

  const btnFinishDrive = document.getElementById('btn-finish-drive');
  if (btnFinishDrive) {
    btnFinishDrive.addEventListener('click', finishDriveToDebrief);
  }

  const btnDebriefClose = document.getElementById('btn-debrief-close');
  if (btnDebriefClose) {
    btnDebriefClose.addEventListener('click', () => {
      if (gameDebriefOverlay) gameDebriefOverlay.classList.add('hidden');
    });
  }

  const btnDebriefDismiss = document.getElementById('btn-debrief-dismiss');
  if (btnDebriefDismiss) {
    btnDebriefDismiss.addEventListener('click', () => {
      if (gameDebriefOverlay) gameDebriefOverlay.classList.add('hidden');
    });
  }

  const btnDebriefHome = document.getElementById('btn-debrief-home');
  if (btnDebriefHome) {
    btnDebriefHome.addEventListener('click', () => {
      if (gameDebriefOverlay) gameDebriefOverlay.classList.add('hidden');
      returnHomeToMissionSelect();
    });
  }

  // Explore Phase Map Survey Controls
  if (btnExploreFinish) {
    btnExploreFinish.addEventListener('click', () => {
      debriefOverlayDismissed = false;
      levelState.goToDebrief();
    });
  }

  if (btnExploreChangeRoute) {
    btnExploreChangeRoute.addEventListener('click', () => {
      debriefOverlayDismissed = false;
      panelPrefs[currentViewMode].plannerCollapsed = false;
      levelState.goToChoose();
    });
  }

  // Debrief Action Buttons
  const dismissDebriefOverlay = () => {
    debriefOverlayDismissed = true;
    if (gameDebriefOverlay) gameDebriefOverlay.classList.add('hidden');
  };

  if (btnDebriefClose) {
    btnDebriefClose.addEventListener('click', dismissDebriefOverlay);
  }
  if (btnDebriefDismiss) {
    btnDebriefDismiss.addEventListener('click', dismissDebriefOverlay);
  }

  if (btnDebriefChoose) {
    btnDebriefChoose.addEventListener('click', () => {
      debriefOverlayDismissed = false;
      panelPrefs[currentViewMode].plannerCollapsed = false;
      levelState.goToChoose();
    });
  }

  // Interactive Stage Tracker Clicks
  const phaseSteps = document.querySelectorAll('#game-phase-bar .phase-step');
  phaseSteps.forEach(step => {
    step.addEventListener('click', () => {
      const targetPhase = step.dataset.phase;
      if (!targetPhase) return;
      playUiSound('click');
      if (targetPhase === GAME_STATES.BRIEFING) {
        if (gameBriefingOverlay) gameBriefingOverlay.classList.remove('hidden');
      } else if (targetPhase === GAME_STATES.ANALYZE) {
        debriefOverlayDismissed = false;
        levelState.goToAnalyze();
      } else if (targetPhase === GAME_STATES.CHOOSE) {
        debriefOverlayDismissed = false;
        panelPrefs[currentViewMode].plannerCollapsed = false;
        levelState.goToChoose();
      } else if (targetPhase === GAME_STATES.EXPLORE) {
        debriefOverlayDismissed = false;
        if (!levelState.getState().lockedRouteId) {
          levelState.selectRoute(levelState.getState().selectedRouteId || 'route-a');
          if (surveyLog) frozenSurveyEval = surveyLog.evaluateCurrent();
          if (routeCalc) frozenRouteCalcSnapshot = routeCalc.getFrozenSnapshot();
          levelState.lockInRoute();
        } else {
          levelState.goToExplore();
        }
      } else if (targetPhase === GAME_STATES.DEBRIEF) {
        debriefOverlayDismissed = false;
        levelState.goToDebrief();
      }
    });
  });

  if (btnDebriefProceedGame) {
    btnDebriefProceedGame.addEventListener('click', () => {
      const lockedCand = plannerCandidates.find(c => c.id === levelState.getState().lockedRouteId);
      if (gpmRouteName) gpmRouteName.textContent = lockedCand ? lockedCand.name : 'Selected Route';
      if (gameProceedModal) gameProceedModal.classList.remove('hidden');
    });
  }

  const closeProceedModal = () => {
    if (gameProceedModal) gameProceedModal.classList.add('hidden');
  };
  if (btnGpmClose) btnGpmClose.addEventListener('click', closeProceedModal);
  if (btnGpmBackDebrief) btnGpmBackDebrief.addEventListener('click', closeProceedModal);
  if (btnGpmBackMap) {
    btnGpmBackMap.addEventListener('click', () => {
      closeProceedModal();
      debriefOverlayDismissed = true;
      applyGameScreenState(levelState.getState());
    });
  }
  if (btnGpmReplay) {
    btnGpmReplay.addEventListener('click', () => {
      closeProceedModal();
      if (btnDebriefReplay) btnDebriefReplay.click();
    });
  }

  if (btnDebriefReplay) {
    btnDebriefReplay.addEventListener('click', () => {
      debriefOverlayDismissed = false;
      frozenSurveyEval = null;
      frozenRouteCalcSnapshot = null;
      if (surveyKit) surveyKit.reset();
      if (surveyLog) surveyLog.reset();
      if (routeCalc) routeCalc.reset();
      levelState.resetLevel();
      syncPanelsToViewMode();
    });
  }

  if (btnDebriefFree) {
    btnDebriefFree.addEventListener('click', () => {
      debriefOverlayDismissed = false;
      if (gameDebriefOverlay) gameDebriefOverlay.classList.add('hidden');
      setViewMode('RESEARCH');
    });
  }

  if (btnBannerAction) {
    btnBannerAction.addEventListener('click', () => {
      const screen = levelState.getState().screen;
      if (screen === GAME_STATES.EXPLORE) {
        debriefOverlayDismissed = false;
        levelState.goToDebrief();
      } else if (screen === GAME_STATES.DEBRIEF) {
        debriefOverlayDismissed = false;
        applyGameScreenState(levelState.getState());
      }
    });
  }

  const openDataMethodsModal = () => {
    if (!dataMethodsModal) return;
    dataMethodsModal.classList.remove('hidden');
  };
  const closeDataMethodsModal = () => {
    if (!dataMethodsModal) return;
    dataMethodsModal.classList.add('hidden');
  };

  if (btnDataMethods) btnDataMethods.addEventListener('click', openDataMethodsModal);
  if (btnDmClose) btnDmClose.addEventListener('click', closeDataMethodsModal);
  if (btnDmDismiss) btnDmDismiss.addEventListener('click', closeDataMethodsModal);
  if (dataMethodsModal) {
    dataMethodsModal.addEventListener('click', e => {
      if (e.target === dataMethodsModal) closeDataMethodsModal();
    });
  }

  if (btnCalcToggle) {
    btnCalcToggle.addEventListener('click', () => {
      if (currentViewMode !== 'MISSION') return;
      toggleMissionSidePanel('survey');
    });
  }

  if (surveyToolGrid) {
    surveyToolGrid.querySelectorAll('.sk-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!surveyKit || btn.disabled) return;
        surveyKit.setActiveTool(btn.dataset.tool);
        syncSurveyKitUi();
      });
    });
  }

  if (btnSurveyClearPins) {
    btnSurveyClearPins.addEventListener('click', () => {
      if (!surveyKit) return;
      surveyKit.clearPins();
      syncSurveyKitUi();
    });
  }

  if (btnHomeMissions) {
    btnHomeMissions.addEventListener('click', () => {
      playUiSound('homeReturn');
      returnHomeToMissionSelect();
    });
  }

  if (btnTutorialHelp) {
    btnTutorialHelp.addEventListener('click', () => {
      if (currentViewMode === 'MISSION' && tutorialCtrl) {
        tutorialCtrl.replay();
      }
    });
  }

  initDevResetButton(() => {
    hasPlayedIntro = false;
    endCinematicIntro();
    panelPrefs.MISSION = { activeSidePanel: 'none', plannerCollapsed: true, profileOpen: false };
    if (routeCalc) routeCalc.setDrawerOpen(false);
    if (surveyKit) surveyKit.reset();
    if (surveyLog) surveyLog.reset();
            debriefOverlayDismissed = false;
    frozenSurveyEval = null;
    frozenRouteCalcSnapshot = null;
    levelState.resetLevel();
    resetCustomizationToStandard();
    syncPanelsToViewMode();
  });
}

function setFrontDoorStage(stage) {
  frontDoorStage = stage;
  document.body.classList.toggle('front-door-active', stage !== 'MAP');
  if (stage === 'MAP') {
    if (introCtrl) introCtrl.dispose();
    if (missionSelectCtrl) missionSelectCtrl.closeAndDispose();
    syncPanelsToViewMode();
    applyGameScreenState(levelState.getState());
    requestAnimationFrame(updateLayoutBounds);
  }
}

function enterMissionSelect() {
  if (introCtrl && introCtrl.isActive()) introCtrl.dispose();
  setFrontDoorStage('MISSION_SELECT');
  if (missionSelectCtrl) missionSelectCtrl.open();
}

function enterMapFromMissionSelect() {
  setFrontDoorStage('MAP');
  if (currentViewMode === 'MISSION' && tutorialCtrl) {
    tutorialCtrl.startIfFirstTime();
  }
}

function returnHomeToMissionSelect() {
  if (codexPanel) codexPanel.classList.add('hidden');
  if (labelsDropdown) labelsDropdown.classList.add('hidden');
  if (btnCodex) {
    btnCodex.classList.remove('open');
    btnCodex.setAttribute('aria-expanded', 'false');
  }
  if (surveyKit) surveyKit.clearTool();
  document.body.classList.remove('cursor-survey-tool');
  hideHoverTooltip();
  if (mapLabels) mapLabels.hideHoverCard();
  // Note: levelState, surveyKit pins, Codex unlocks & panelPrefs stay untouched in memory
  enterMissionSelect();
}

// --- Asset Loader & Application Entry ---
async function loadAssetsAndInit() {
  try {
    setupLights();
    bindUIEvents();
    bindGameEvents();
    updateTimeOfDay(14.0);

    // 1. Manifest
    loadingStatus.textContent = 'Reading terrain metadata…';
    progressBar.style.width = '15%';
    const manifestResp = await fetch('/data/manifest.json');
    const manifest = await manifestResp.json();
    if (manifest.elevation_summary) {
      minElev = manifest.elevation_summary.min_elevation_m;
      maxElev = manifest.elevation_summary.max_elevation_m;
    }

    // 2. Heightmap Binary
    loadingStatus.textContent = 'Downloading 1025×1025 elevation grid…';
    progressBar.style.width = '35%';
    const hResp = await fetch('/data/terrain_height.bin');
    rawHeights = new Float32Array(await hResp.arrayBuffer());

    // 3. Slope Binary
    loadingStatus.textContent = 'Downloading 5 m slope baseline grid…';
    progressBar.style.width = '55%';
    const sResp = await fetch('/data/slope_5m.bin');
    rawSlopes = new Float32Array(await sResp.arrayBuffer());

    // 4. Route JSON
    loadingStatus.textContent = 'Loading Curiosity traverse route…';
    progressBar.style.width = '70%';
    const rResp = await fetch('/data/route.json');
    const rData = await rResp.json();
    routePoints = rData.points;

    // 5. Textures (HiRISE, Slope, CRISM Hyd, CRISM Phy, THEMIS)
    loadingStatus.textContent = 'Downloading multi-spectral layers…';
    progressBar.style.width = '85%';
    const texLoader = new THREE.TextureLoader();

    function loadNearest(url) {
      return new Promise((res, rej) => {
        texLoader.load(url, t => {
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
          t.generateMipmaps = false;
          t.colorSpace = THREE.SRGBColorSpace;
          res(t);
        }, undefined, rej);
      });
    }

    const [satTex, slopeTex, crismHydTex, crismPhyTex, themisTex] = await Promise.all([
      new Promise((res, rej) => texLoader.load('/data/terrain_texture.png', t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, rej)),
      loadNearest('/data/slope_5m_classified.png'),
      loadNearest('/data/crism_hyd_crop.png'),
      loadNearest('/data/crism_phy_crop.png'),
      loadNearest('/data/themis_crop.png')
    ]);

    // Create offscreen contexts for pixel inspection and extract buffers for MISSION lenses
    crismHydCtx = createOffscreenContext(crismHydTex.image);
    crismPhyCtx = createOffscreenContext(crismPhyTex.image);
    themisCtx = createOffscreenContext(themisTex.image);

    const hydBuf = extractImageRGBA(crismHydTex.image, 27, 28);
    const phyBuf = extractImageRGBA(crismPhyTex.image, 27, 28);
    const themisBuf = extractImageRGBA(themisTex.image, 50, 50);

    const terrainRampAndPulse = buildTerrainSlopeAndContourTextures(rawHeights, rawSlopes);
    const emptyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    emptyTex.needsUpdate = true;

    lensTextures = {
      emptyTex,
      hazardOutlineTex: buildSlopeHazardOutlineTexture(rawSlopes),
      terrainRampTex: terrainRampAndPulse.rampTex,
      mineralsTex: buildMineralsGlowTexture(hydBuf, phyBuf),
      heatTex: buildFullHeatTexture(themisBuf)
    };
    demFeatures = deriveDemTerrainFeatures(rawHeights, rawSlopes);
    crismClusters = clusterCrismIndicators(hydBuf, phyBuf);

    // 6. Build Scene Objects
    loadingStatus.textContent = 'Building 3D terrain and layers…';
    progressBar.style.width = '95%';

    createTerrainLayers(satTex, slopeTex, crismHydTex, crismPhyTex, themisTex);
    createRouteAndRover();
    createScienceMarkersAndFlag();
    createBoxworkCoreZone();
    createDustParticles();
    createReticles();
    createStartAndGoalMarkers();

    // --- Instantiate Mars Rover EXPLORE Mode Objects ---
    roverExploreModel = createRoverModel();
    roverExploreModel.visible = false;
    scene.add(roverExploreModel);
    roverShadow = createRoverShadow();

    roverPhysics = new RoverPhysics({
      startX: level01.start.x,
      startY: level01.start.y,
      startHeading: 0.0
    });

    roverTerrain = new RoverDetailTerrain({
      scene,
      sampleElevation: sampleElevationAtMeters,
      getExaggeration: () => currentExag,
      getMinElev: () => minElev,
      getMaxElev: () => maxElev
    });

    roverWorldProps = new RoverWorldProps({
      scene,
      elements: level01Elements.elements,
      sampleElevation: sampleDriveSurface,
      getExaggeration: () => currentExag,
      getMinElev: () => minElev,
      startPoint: level01.start,
      goalPoint: level01.goal
    });

    roverChaseCamera = new RoverChaseCamera(camera, renderer.domElement);
    roverRouteRibbon = new RoverRouteRibbon(scene);
    roverMovementDust = new RoverMovementDust(scene);
    roverAudio = new RoverAudio();
    roverHUD = new RoverHUD({
      onWarningAlert: () => {
        if (roverAudio) roverAudio.playWarningBuzz();
      }
    });
    roverInteractions = new RoverInteractions(
      level01,
      level01Elements,
      (poi) => { handleAnchorOrElementSelect(poi); },
      (stats) => {
        activeDriveStats = stats;
        // Victory cinematic → then debrief
        if (roverChaseCamera) roverChaseCamera.startCinematicVictory();
        if (roverHUD) roverHUD.showToast('🎯 OBJECTIVE REACHED — Mission Complete!', 4000);
        setTimeout(() => {
          if (roverChaseCamera) roverChaseCamera.stopCinematic();
          levelState.goToDebrief();
        }, 5000);
      },
      (actionType, poi, alertData) => {
        // Reward sting after the scan/drill completion bar finishes.
        if (roverAudio) roverAudio.playLevelUp();
        if (roverHUD && alertData) {
          roverHUD.showCenterAlert(alertData.title, alertData.subtitle, 4200, false);
        }
      }
    );

    // Load fixed Level 1 candidate routes generated from routeWorker.js
    plannerCandidates = buildBlindedPlannerCandidates(level01);
    routeLensStats = computeOpticalRouteStats(plannerCandidates, hydBuf, phyBuf, themisBuf);
    routeElementCounts = computeRouteElementCounts(plannerCandidates, level01Elements.elements, 150.0);
    runDevCrismSelfCheck(routeLensStats);

    const sampleTerrainElevation = (lx, ly) => {
      const { col, row } = localToGrid(lx, ly);
      return sampleGridBilinear(rawHeights, col, row);
    };
    const sampleTerrainSlope = (lx, ly) => {
      const { col, row } = localToGrid(lx, ly);
      return sampleGridBilinear(rawSlopes, col, row);
    };
    const sampleCrismAtLocal = (lx, ly) => {
      const hyd = samplePixelFromContext(crismHydCtx, 27, 28, lx, ly);
      const phy = samplePixelFromContext(crismPhyCtx, 27, 28, lx, ly);
      return {
        phyActive: Boolean(phy && phy.a > 0 && (phy.r + phy.g + phy.b) > 0),
        hydActive: Boolean(hyd && hyd.a > 0 && (hyd.r + hyd.g + hyd.b) >= 120)
      };
    };

    missionElements = createMissionElementsController({
      elementsData: level01Elements,
      sampleElevFn: sampleTerrainElevation,
      minElev
    });
    scene.add(missionElements.group);

    routeCalc = createRouteCalculatorController({
      routeIds: plannerCandidates.map(c => c.id),
      sampleElevFn: sampleTerrainElevation,
      localToMesh,
      minElev
    });

    surveyKit = createSurveyKitController({
      elementsData: level01Elements,
      sampleSlopeFn: sampleTerrainSlope,
      sampleElevFn: sampleTerrainElevation,
      sampleCrismFn: sampleCrismAtLocal,
      localToMesh,
      minElev,
      pinLayerEl: surveyPinsLayer
    });
    scene.add(surveyKit.group);

    dustZonesOverlay = createDustZonesOverlay(sampleTerrainElevation, localToMesh, minElev);
    scene.add(dustZonesOverlay.group);

    roverDustStormParticles = createDustStormParticles({
      sampleElevFn: sampleTerrainElevation,
      localToMesh,
      minElev
    });
    scene.add(roverDustStormParticles.group);

    surveyLog = createSurveyLogController({
      candidates: plannerCandidates,
      elements: level01Elements.elements,
      sampleSlopeFn: sampleTerrainSlope,
      logTbodyEl: surveyLogTbody,
      calcGridEl: surveyCalcGrid,
      scansLeftEl: surveyScansLeft,
      ringFgEl: surveyRingFg,
      ringTextEl: surveyRingText,
      idProgressEl: surveyIdProgress
    });

    introCtrl = createIntroController({
      overlayEl: introOverlay,
      starCanvasEl: introStarfield,
      titleEl: introTitle,
      subtitleEl: introSubtitle,
      hintEl: introSkipHint,
      onSound: playUiSound,
      onComplete: () => {
        enterMissionSelect();
      }
    });

    missionSelectCtrl = createMissionSelectController({
      overlayEl: missionSelectOverlay,
      globeContainerEl: globeCanvasWrap,
      mission1CardEl: missionCard1,
      mission1BtnEl: btnMission1Start,
      mission2CardEl: missionCard2,
      mission3CardEl: missionCard3,
      onSound: playUiSound,
      onEnterMission1: () => {
        enterMapFromMissionSelect();
      }
    });

    tutorialCtrl = createTutorialController({
      rootEl: tutorialRoot,
      dimTopEl: tutorialDimTop,
      dimRightEl: tutorialDimRight,
      dimBottomEl: tutorialDimBottom,
      dimLeftEl: tutorialDimLeft,
      ringEl: tutorialSpotlightRing,
      cardEl: tutorialCard,
      guideNameEl: tutorialGuideName,
      stepCounterEl: tutorialStepCounter,
      titleEl: tutorialTitle,
      textEl: tutorialText,
      actionHintEl: tutorialActionHint,
      nextBtnEl: btnTutorialNext,
      skipBtnEl: btnTutorialSkip,
      onSound: playUiSound,
      isBlockingOverlayOpen: () => Boolean(
        (gameBriefingOverlay && !gameBriefingOverlay.classList.contains('hidden')) ||
        (gameExploreOverlay && !gameExploreOverlay.classList.contains('hidden')) ||
        (gameDebriefOverlay && !gameDebriefOverlay.classList.contains('hidden'))
      ),
      onStartTutorial: () => {
        savedPanelsBeforeTutorial = {
          activeSidePanel: panelPrefs.MISSION.activeSidePanel,
          plannerCollapsed: panelPrefs.MISSION.plannerCollapsed
        };
      },
      onBeforeEnterStep: (step, prevStep) => {
        const curScreen = levelState.getState().screen;
        // Restore panels temporarily opened by the previous tutorial step
        if (prevStep) {
          if (prevStep.id === 'lenses' || prevStep.id === 'survey-kit') {
            setMissionSidePanel('none');
          }
          if (prevStep.id === 'planner-table') {
            panelPrefs.MISSION.plannerCollapsed = true;
            syncPanelsToViewMode();
            requestAnimationFrame(updateLayoutBounds);
          }
        }
        // Leaving stage-rail into interactive map steps from initial Briefing smoothly opens Analyze
        if (step.id === 'camera' && curScreen === GAME_STATES.BRIEFING) {
          hasPlayedIntro = true;
          endCinematicIntro();
          levelState.startMission();
        }
        // Temporarily open Survey Kit during Step 6 in Analyze or Choose
        if (step.id === 'survey-kit' && (curScreen === GAME_STATES.ANALYZE || curScreen === GAME_STATES.CHOOSE)) {
          setMissionSidePanel('survey');
        }
        // Temporarily expand Candidate Traverses during Step 7 in Analyze or Choose
        if (step.id === 'planner-table' && (curScreen === GAME_STATES.ANALYZE || curScreen === GAME_STATES.CHOOSE)) {
          if (panelPrefs.MISSION.plannerCollapsed) {
            panelPrefs.MISSION.plannerCollapsed = false;
            syncPanelsToViewMode();
            requestAnimationFrame(updateLayoutBounds);
          }
        }
      },
      onCompleteOrSkip: () => {
        if (labelsDropdown) labelsDropdown.classList.add('hidden');
        if (btnLabels) btnLabels.setAttribute('aria-expanded', 'false');
        const snap = savedPanelsBeforeTutorial || { activeSidePanel: 'none', plannerCollapsed: true };
        savedPanelsBeforeTutorial = null;
        panelPrefs.MISSION.plannerCollapsed = snap.plannerCollapsed;
        setMissionSidePanel(snap.activeSidePanel);

        // When tutorial finishes or is skipped, always bring up the Level 1 Mission Briefing card
        hasPlayedIntro = false;
        levelState.resetLevel();
        if (gameBriefingOverlay) {
          gameBriefingOverlay.classList.remove('hidden');
        }
        applyGameScreenState(levelState.getState());
      }
    });

    if (import.meta.env.DEV) {
      window.__missionElements = missionElements;
      window.__camera = camera;
      window.__routeCalc = routeCalc;
      window.__surveyKit = surveyKit;
      window.__surveyLog = surveyLog;
      window.__intro = introCtrl;
      window.__missionSelect = missionSelectCtrl;
      window.__tutorial = tutorialCtrl;
      window.__frontDoorStage = () => frontDoorStage;
    }

    mapLabels = createMapLabelController({
      layerEl: mapLabelsLayer,
      leaderSvgEl: mapLeaderSvg,
      hoverCardEl: markerHoverCard,
      mhcNameEl: mhcName,
      mhcSolEl: mhcSol,
      mhcDescEl: mhcDesc,
      mhcEffectEl: mhcEffect,
      mhcTagsEl: mhcTags,
      detailCardEl: labelDetailCard,
      ldcTitleEl: ldcTitle,
      ldcCategoryEl: ldcCategory,
      ldcSolEl: ldcSol,
      ldcWhatEl: ldcWhat,
      ldcDatasetEl: ldcDataset,
      ldcWhyEl: ldcWhy,
      ldcTagsEl: ldcTags,
      ldcCloseBtn: ldcClose,
      onSelectAnchor: handleAnchorOrElementSelect
    });
    mapLabels.setAnchors(buildLevelMapAnchors());

    selectedCandidateId = levelState.getState().selectedRouteId || 'route-a';
    renderPlannerTable(plannerCandidates);
    buildCandidateRouteLines(plannerCandidates);
    setActiveMissionLens('satellite', { immediate: true });
    applyGameScreenState(levelState.getState());
    syncMissionElementsState();

    initRouteWorker();
    initTerrainAnalysisWorker();

    // 7. Complete Loading
    progressBar.style.width = '100%';
    const totalLoadTime = Math.round(performance.now() - appStartTime);
    if (perfReadout) {
      if (import.meta.env.DEV) {
        perfReadout.classList.remove('hidden');
        perfReadout.textContent = `FPS 60 | Load ${totalLoadTime} ms`;
      } else {
        perfReadout.remove();
      }
    }

    if (loadingOverlay) {
      loadingOverlay.style.pointerEvents = 'none';
      setTimeout(() => {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
          loadingOverlay.style.display = 'none';
        }, 450);
      }, 250);
    }

    setFrontDoorStage('INTRO');
    introCtrl.start();

    lastReplayTime = performance.now();
    animate();

  } catch (err) {
    console.error('Initialization error:', err);
    loadingStatus.textContent = `Error loading assets: ${err.message}`;
    loadingStatus.style.color = '#ff4444';
  }
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();

  // FPS Counter (dev corner pill only)
  frameCount++;
  if (now - lastFpsUpdateTime >= 1000) {
    currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdateTime));
    if (import.meta.env.DEV && perfReadout && perfReadout.isConnected) {
      const loadStr = perfReadout.textContent.split('|')[1] || '';
      perfReadout.textContent = `FPS ${currentFps} |${loadStr}`;
    }
    frameCount = 0;
    lastFpsUpdateTime = now;
  }

  // Skip heavy terrain simulation & WebGL draw while on front door (Intro / Mars Globe)
  if (frontDoorStage !== 'MAP') {
    lastReplayTime = now;
    return;
  }

  // Timeline Playback
  if (isPlaying) {
    const deltaSec = (now - lastReplayTime) / 1000.0;
    let nextSol = currentReplaySol + deltaSec * replaySpeed;
    if (nextSol > 4868) {
      nextSol = 4868;
      isPlaying = false;
      if (btnPlay) btnPlay.textContent = '▶';
    }
    updateTimelineReplay(nextSol);
  }
  lastReplayTime = now;

  // Pulsing Rover Beacon
  if (roverBeacon) {
    const s = 1.0 + 0.3 * Math.sin(now * 0.007);
    roverBeacon.scale.set(s, s, s);
    roverBeacon.material.opacity = 0.5 + 0.4 * Math.cos(now * 0.007);
  }

  // Animated 3D Targeting Cursor Reticle
  if (cursorReticle && cursorReticle.visible) {
    cursorReticle.rotation.y += 0.015;
    const pulse = 1.0 + 0.06 * Math.sin(now * 0.008);
    cursorReticle.scale.set(pulse, 1.0, pulse);
  }

  // Animated Pinned Beacon Reticle
  if (pinnedReticle && pinnedReticle.visible) {
    const pulseP = 1.0 + 0.1 * Math.sin(now * 0.006);
    if (pinnedReticle.children[0]) {
      pinnedReticle.children[0].scale.set(pulseP, pulseP, pulseP);
    }
    if (pinnedReticle.children[2]) {
      pinnedReticle.children[2].rotation.y += 0.02;
    }
  }

  // Animated Start and Goal Anchors (beacon rotation + ground halo pulse)
  if (startMarker && startMarker.children[4]) {
    startMarker.children[4].rotation.y += 0.02;
    const pulseS = 1.0 + 0.07 * Math.sin(now * 0.006);
    if (startMarker.children[1]) startMarker.children[1].scale.set(pulseS, pulseS, pulseS);
  }
  if (goalMarker && goalMarker.children[4]) {
    goalMarker.children[4].rotation.y += 0.025;
    const pulseG = 1.0 + 0.09 * Math.sin(now * 0.007);
    if (goalMarker.children[1]) goalMarker.children[1].scale.set(pulseG, pulseG, pulseG);
  }

  // Smooth 400 ms Lens Crossfade & Terrain Pulse
  if (currentViewMode === 'MISSION') {
    stepLensCrossfade(now);
    if (!lensBlend.active && activeMissionLens === 'terrain' && lensTerrainMesh && lensTerrainMesh.material.userData?.pulseUniform) {
      lensTerrainMesh.material.userData.pulseUniform.value = 0.5 + 0.5 * Math.sin(now * 0.0045);
    }
  }

  // Flowing direction chevrons along selected candidate route (Start -> Goal)
  updateCandidateRouteChevrons(now);

  // Dust Particle drift
  updateDustParticles();

  // --- Mars Rover EXPLORE Mode Frame Update ---
  const isExploringActive = levelState.getState().screen === GAME_STATES.EXPLORE && !awaitingSurveyResultContinue;
  if (isExploringActive && roverPhysics && roverExploreModel) {
    const dt = Math.min((now - lastFrameTime) / 1000.0, 0.1);

    // 1. Physics simulation: terrain conformance, speed, battery
    //    Slope stays DEM-measured; only the parked height adds GAME micro-relief.
    roverPhysics.update(dt, roverInputState, sampleElevationAtMeters, currentExag, minElev);

    // 2. Position rover 3D model on mesh
    const meshPos = roverPhysics.getMeshCoordinates(currentExag, minElev);
    meshPos.y = (sampleDriveSurface(roverPhysics.x, roverPhysics.y) - minElev) * currentExag + 0.12;
    roverExploreModel.position.set(meshPos.x, meshPos.y, meshPos.z);
    roverExploreModel.quaternion.copy(roverPhysics.quaternion);
    if (roverShadow) {
      roverShadow.position.set(meshPos.x, meshPos.y + 0.015, meshPos.z);
      roverShadow.quaternion.copy(roverPhysics.quaternion);
    }

    // 2b. Keep the faceted detail patch centred on the rover
    if (roverTerrain) roverTerrain.update(meshPos);

    // Auto-dismiss the drive hint once the player actually starts moving.
    if (!exploreHintDismissed && Math.abs(roverPhysics.speed) > 1.5) {
      exploreHintDismissed = true;
      if (gameExploreOverlay) gameExploreOverlay.classList.add('hidden');
    }

    // 3. Rover animation helpers
    if (roverExploreModel.userData.updateWheelRotation) {
      roverExploreModel.userData.updateWheelRotation(roverPhysics.lastDeltaM);
    }
    if (roverExploreModel.userData.pulseBeacon) {
      roverExploreModel.userData.pulseBeacon(now / 1000.0);
    }

    // 4. Chase camera follow
    if (roverChaseCamera) {
      const roverPos = new THREE.Vector3(meshPos.x, meshPos.y, meshPos.z);
      roverChaseCamera.update(dt, roverPos, roverPhysics.heading, sampleDriveSurface, currentExag, minElev);
    }

    // 5. Route ribbon beacon animation
    if (roverRouteRibbon) {
      roverRouteRibbon.update(now / 1000.0);
    }

    // 6. Proximity interactions: science scanning, drilling, hazards, goal detection
    if (roverInteractions) {
      roverInteractions.update(dt, roverPhysics, roverInputState, roverExploreModel);
    }

    // 6b. World props: beacon pulse and nearest-site tracking
    if (roverWorldProps) {
      roverWorldProps.update(now, roverPhysics);
    }

    // 7. HUD telemetry display
    if (roverHUD) {
      roverHUD.update(roverPhysics, roverInteractions, roverInputState, roverWorldProps);
    }

    // 7b. Speed-driven gravel loop + persistent interior ambience
    if (roverAudio) {
      roverAudio.update(dt, roverPhysics);
    }

    // 7c. Swirling dust storm particles inside slow zones
    if (roverDustStormParticles) {
      roverDustStormParticles.update(dt, now / 1000.0);
    }

    // 7d. Rover movement dust puffs behind wheels
    if (roverMovementDust) {
      roverMovementDust.update(dt, roverPhysics, currentExag, minElev, now / 1000.0);
    }

    // Clear one-shot input flags after processing
    roverInputState.action = false;
    roverInputState.reset = false;
  }
  lastFrameTime = now;

  if (!isExploringActive) {
    controls.update();
  }

  // Mission gameplay elements anti-clutter culling & off-screen animation pause
  if (missionElements) {
    missionElements.update(
      now,
      camera,
      window.innerWidth,
      window.innerHeight,
      cachedPlannerTop,
      cachedLabelRightLimit,
      cachedLabelLeftLimit
    );
  }

  renderer.render(scene, camera);

  // Camera-facing 2D projected map labels (overlap culled or Show All with leader lines)
  if (mapLabels && !isExploringActive) {
    mapLabels.update(
      camera,
      window.innerWidth,
      window.innerHeight,
      cachedPlannerTop,
      cachedLabelRightLimit,
      cachedLabelLeftLimit,
      cachedLabelTopLimit,
      cachedLabelObstacleBoxes
    );
  }

  // Survey Kit floating pin cards projection
  if (surveyKit && !isExploringActive) {
    surveyKit.update(camera, window.innerWidth, window.innerHeight);
  }
}

// Start application
loadAssetsAndInit();
