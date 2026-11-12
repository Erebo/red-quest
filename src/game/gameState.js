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
  [GAME_STATES.BRIEFING]: [GAME_STATES.ANALYZE],
  [GAME_STATES.ANALYZE]: [GAME_STATES.CHOOSE, GAME_STATES.DEBRIEF],
  [GAME_STATES.CHOOSE]: [GAME_STATES.EXPLORE, GAME_STATES.ANALYZE, GAME_STATES.DEBRIEF],
  [GAME_STATES.EXPLORE]: [GAME_STATES.DEBRIEF, GAME_STATES.CHOOSE],
  [GAME_STATES.DEBRIEF]: [GAME_STATES.CHOOSE, GAME_STATES.EXPLORE]
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
    const allowed = ALLOWED_TRANSITIONS[state.screen] || [];
    if (!allowed.includes(nextScreen)) {
      throw new Error(`Invalid game state transition: ${state.screen} -> ${nextScreen}`);
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
      if (state.screen === GAME_STATES.BRIEFING) {
        transitionTo(GAME_STATES.ANALYZE);
      }
    },

    goToChoose() {
      if (state.screen === GAME_STATES.ANALYZE) {
        transitionTo(GAME_STATES.CHOOSE);
      } else if (state.screen === GAME_STATES.EXPLORE || state.screen === GAME_STATES.DEBRIEF) {
        const prevState = { ...state };
        state = {
          ...state,
          lockedRouteId: null,
          screen: GAME_STATES.CHOOSE
        };
        notify(prevState);
      }
    },

    goToExplore() {
      if (state.screen === GAME_STATES.DEBRIEF && state.lockedRouteId) {
        transitionTo(GAME_STATES.EXPLORE);
      }
    },

    goToAnalyze() {
      if (state.screen === GAME_STATES.CHOOSE) {
        transitionTo(GAME_STATES.ANALYZE);
      }
    },

    selectRoute(routeId) {
      if (state.screen !== GAME_STATES.ANALYZE && state.screen !== GAME_STATES.CHOOSE) {
        return;
      }
      if (state.selectedRouteId === routeId) return;
      const prevState = { ...state };
      state = { ...state, selectedRouteId: routeId };
      notify(prevState);
    },

    lockInRoute() {
      if (state.screen !== GAME_STATES.CHOOSE || !state.selectedRouteId) {
        return;
      }
      const prevState = { ...state };
      state = {
        ...state,
        lockedRouteId: state.selectedRouteId,
        screen: GAME_STATES.EXPLORE
      };
      notify(prevState);
    },

    goToDebrief() {
      if (
        state.screen === GAME_STATES.EXPLORE ||
        state.screen === GAME_STATES.ANALYZE ||
        state.screen === GAME_STATES.CHOOSE
      ) {
        transitionTo(GAME_STATES.DEBRIEF);
      }
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
