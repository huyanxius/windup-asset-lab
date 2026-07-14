export const AnimationState = Object.freeze({
  PAUSED: 'paused',
  PLAYING: 'playing',
});

export const LocomotionState = Object.freeze({
  IDLE: 'idle',
  AUTO: 'auto',
  MANUAL: 'manual',
});

export function createMotionState(overrides = {}) {
  return {
    animation: AnimationState.PAUSED,
    locomotion: LocomotionState.IDLE,
    held: { left: false, right: false },
    direction: 1,
    x: 0,
    ...overrides,
  };
}

function manualAxis(held) {
  return Number(held.right) - Number(held.left);
}

export function reduceMotion(current, event) {
  const state = createMotionState(current);

  switch (event.type) {
    case 'RESET':
      return createMotionState({ x: event.keepPosition ? state.x : 0, direction: state.direction });

    case 'CHARACTER_TOGGLE':
      if (state.animation === AnimationState.PLAYING && state.locomotion === LocomotionState.AUTO) {
        return { ...state, animation: AnimationState.PAUSED, locomotion: LocomotionState.IDLE };
      }
      return {
        ...state,
        animation: AnimationState.PLAYING,
        locomotion: LocomotionState.AUTO,
        held: { left: false, right: false },
      };

    case 'PLAYBACK_TOGGLE':
      return {
        ...state,
        animation: state.animation === AnimationState.PLAYING ? AnimationState.PAUSED : AnimationState.PLAYING,
      };

    case 'AUTO_TOGGLE':
      return state.locomotion === LocomotionState.AUTO
        ? { ...state, animation: AnimationState.PLAYING, locomotion: LocomotionState.IDLE }
        : {
            ...state,
            animation: AnimationState.PLAYING,
            locomotion: LocomotionState.AUTO,
            held: { left: false, right: false },
          };

    case 'MANUAL_INPUT': {
      const held = { ...state.held, [event.direction]: event.pressed };
      const axis = manualAxis(held);
      return {
        ...state,
        held,
        animation: AnimationState.PLAYING,
        locomotion: axis === 0 ? LocomotionState.IDLE : LocomotionState.MANUAL,
        direction: axis === 0 ? state.direction : Math.sign(axis),
      };
    }

    case 'PAUSE_FOR_REVIEW':
      return {
        ...state,
        animation: AnimationState.PAUSED,
        locomotion: LocomotionState.IDLE,
        held: { left: false, right: false },
      };

    default:
      return state;
  }
}

export function advanceMotion(current, deltaSeconds, edge, speed = 145) {
  if (current.animation !== AnimationState.PLAYING || current.locomotion === LocomotionState.IDLE) {
    return current;
  }

  const axis = current.locomotion === LocomotionState.MANUAL
    ? manualAxis(current.held)
    : current.direction;
  if (axis === 0) return current;

  let direction = axis > 0 ? 1 : -1;
  let x = current.x + direction * speed * deltaSeconds;
  if (x >= edge) { x = edge; direction = -1; }
  if (x <= -edge) { x = -edge; direction = 1; }
  return { ...current, x, direction };
}

export function isMoving(state) {
  return state.locomotion !== LocomotionState.IDLE && state.animation === AnimationState.PLAYING;
}
