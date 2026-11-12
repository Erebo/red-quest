/**
 * Level 1 Game State Machine
 * Screens: BRIEFING -> ANALYZE -> CHOOSE -> EXPLORE -> DEBRIEF
 */

export const GAME_STATES = Object.freeze({
  BRIEFING: 'BRIEFING',
  ANALYZE: 'ANALYZE',
  CHOOSE: 'CHOOSE',
  EXPLORE: 'EXPLORE',
  DEBRIEF: 'DEBRIEF'
});

export const GAME_STATE_ORDER = Object.freeze([
  GAME_STATES.BRIEFING,
  GAME_STATES.ANALYZE,
  GAME_STATES.CHOOSE,
  GAME_STATES.EXPLORE,
  GAME_STATES.DEBRIEF
]);

const ALLOWED_TRANSITIONS = {
  [GAME_STATES.BRIEFING]: [GAME_STATES.ANALYZE, GAME_STATES.CHOOSE],
  [GAME_STATES.ANALYZE]: [GAME_STATES.CHOOSE, GAME_STATES.BRIEFING, GAME_STATES.EXPLORE],
  [GAME_STATES.CHOOSE]: [GAME_STATES.EXPLORE, GAME_STATES.ANALYZE, GAME_STATES.DEBRIEF],
  [GAME_STATES.EXPLORE]: [GAME_STATES.DEBRIEF, GAME_STATES.CHOOSE],
  [GAME_STATES.DEBRIEF]: [GAME_STATES.CHOOSE, GAME_STATES.EXPLORE, GAME_STATES.BRIEFING]
};

export function createGameState(defaultRouteId = 'route-a') {
  let state = {
    screen: GAME_STATES.BRIEFING,
    selectedRouteId: defaultRouteId,
    lockedRouteId: null
  };

  const listeners = new Set();

  function notify(prevState) {
    const snapshot = { ...state };
    listeners.forEach(fn => fn(snapshot, prevState));
  }

  function transitionTo(nextScreen) {
    if (state.screen === nextScreen) return;
    const allowed = ALLOWED_TRANSITIONS[state.screen] || [];
    if (!allowed.includes(nextScreen)) {
      console.warn(`Blocked invalid game state transition: ${state.screen} -> ${nextScreen}`);
      return;
    }
    const prevState = { ...state };
    state = { ...state, screen: nextScreen };
    notify(prevState);
  }

  return {
    getState() {
      return { ...state };
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    startMission() {
      transitionTo(GAME_STATES.ANALYZE);
    },

    goToChoose() {
      if (state.screen === GAME_STATES.DEBRIEF) {
        const prevState = { ...state };
        state = {
          ...state,
          lockedRouteId: null,
          screen: GAME_STATES.CHOOSE
        };
        notify(prevState);
        return;
      }
      transitionTo(GAME_STATES.CHOOSE);
    },

    goToExplore() {
      if (!state.lockedRouteId) {
        state.lockedRouteId = state.selectedRouteId || defaultRouteId;
      }
      transitionTo(GAME_STATES.EXPLORE);
    },

    goToAnalyze() {
      transitionTo(GAME_STATES.ANALYZE);
    },

    selectRoute(routeId) {
      if (state.lockedRouteId && state.screen !== GAME_STATES.CHOOSE) return;
      if (state.selectedRouteId === routeId) return;
      const prevState = { ...state };
      state = { ...state, selectedRouteId: routeId };
      notify(prevState);
    },

    lockInRoute() {
      const chosenId = state.selectedRouteId || defaultRouteId;
      const prevState = { ...state };
      state = {
        ...state,
        selectedRouteId: chosenId,
        lockedRouteId: chosenId,
        screen: GAME_STATES.EXPLORE
      };
      notify(prevState);
    },

    goToDebrief() {
      transitionTo(GAME_STATES.DEBRIEF);
    },

    resetLevel() {
      const prevState = { ...state };
      state = {
        screen: GAME_STATES.BRIEFING,
        selectedRouteId: defaultRouteId,
        lockedRouteId: null
      };
      notify(prevState);
    }
  };
}
