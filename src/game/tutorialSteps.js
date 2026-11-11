/**
 * Guided Tutorial Configuration (Mission 1 — ARIA Guide)
 * Edit step titles, text (max 2 sentences each), selectors, and action keys here.
 */

export const TUTORIAL_GUIDE_META = Object.freeze({
  name: 'ARIA',
  role: 'Surface Operations Guide'
});

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Mission Goal',
    text: 'Welcome to Gale Crater! Your goal is to reach the three science targets and the boxwork core safely.',
    selectors: ['#briefing-targets-list', '#game-briefing-overlay .game-card'],
    actionType: null,
    spotlightPad: 10
  },
  {
    id: 'stage-rail',
    title: 'Mission Stages',
    text: 'This top rail tracks all five stages: Briefing, Analyze, Choose, Explore, and Debrief. Active and completed stages update automatically as you progress.',
    selectors: ['#game-phase-bar'],
    actionType: null,
    advanceBriefingOnNext: true,
    spotlightPad: 8
  },
  {
    id: 'camera',
    title: 'Camera Controls',
    text: 'Drag to rotate the 3D terrain, scroll to zoom, and right-drag to pan across the crater. Move the camera now to continue.',
    selectors: ['#canvas-container'],
    isCanvasArea: true,
    actionType: 'camera',
    actionPrompt: 'Move camera on the map to continue',
    spotlightPad: 0
  },
  {
    id: 'lenses',
    title: 'Decision Lenses',
    text: 'Switch Lenses to inspect terrain slopes, mineral detections, thermal rock signatures, sunlight, and radiation shelter. Open Lenses now to inspect your views.',
    selectors: ['#btn-lenses'],
    actionType: 'open-lenses',
    actionPrompt: 'Click Lenses to continue',
    spotlightPad: 8
  },
  {
    id: 'elements-labels',
    title: 'Elements & Labels',
    text: 'Use Show all elements to spot surface hazards, resources, and science markers, and use Labels to filter map categories. Click any map marker to read its field note.',
    selectors: ['#btn-show-all-elements', '#btn-labels'],
    combineUnion: true,
    actionType: null,
    spotlightPad: 8
  },
  {
    id: 'survey-kit',
    title: 'Survey Kit',
    text: 'Select a Survey Kit tool and click any point on the 3D map to inspect local slope, hazards, or nearby elements. Take one reading on the map now.',
    selectors: ['#route-calc-panel', '#btn-calc-toggle'],
    allowCanvasClick: true,
    actionType: 'survey-scan',
    actionPrompt: 'Use any Survey Kit tool on the map',
    spotlightPad: 8
  },
  {
    id: 'planner-table',
    title: 'Candidate Traverses',
    text: 'This table compares Routes A, B, and C alongside Max Slope and map visibility. Distance, Ascent, and Time are measured by the player in this game and revealed later.',
    selectors: ['#planner-panel'],
    actionType: null,
    spotlightPad: 6
  },
  {
    id: 'choose-lock',
    title: 'Choose & Lock In',
    text: 'When you finish surveying, click Proceed to Choose to review the candidates, then press Lock in route. Take your time inspecting the data first.',
    selectors: ['#btn-go-choose', '#btn-lock-route'],
    actionType: null,
    spotlightPad: 10
  },
  {
    id: 'codex-finish',
    title: 'Field Codex',
    text: 'Open Field Codex anytime to check every surface element type you have unlocked. Good luck, explorer.',
    selectors: ['#btn-codex'],
    actionType: null,
    nextLabel: 'Finish',
    spotlightPad: 8
  }
];
