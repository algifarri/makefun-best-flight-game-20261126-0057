// Keyboard and pointer input. Held keys give steering and throttle; one-shot presses (start,
// restart, pause, mission keys) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse steers too: where the
// pointer sits relative to the screen centre banks and pitches the plane.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MISSION_1 = 4;
export const ACTION_MISSION_2 = 8;
export const ACTION_MISSION_3 = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['KeyE', 'ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MISSION_KEYS = new Map([
  ['Digit1', ACTION_MISSION_1],
  ['Digit2', ACTION_MISSION_2],
  ['Digit3', ACTION_MISSION_3],
]);

export function createInput(target) {
  let left = false;
  let right = false;
  let pitchUp = false;
  let pitchDown = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  /** Pointer offset from the centre, -1..1 each way; 0 when the pointer never moved. */
  let pointerX = 0;
  let pointerY = 0;
  let pointerActive = false;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MISSION_KEYS.has(event.code)) {
      if (!event.repeat) actions |= MISSION_KEYS.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    pitchUp = false;
    pitchDown = false;
    throttleUp = false;
    throttleDown = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointerActive = true;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both; the mouse steers when no key is held. */
    steer() {
      const keys = (right ? 1 : 0) - (left ? 1 : 0);
      if (keys !== 0) return keys;
      if (!pointerActive) return 0;
      const dead = 0.08;
      return Math.abs(pointerX) < dead ? 0 : Math.max(-1, Math.min(1, pointerX));
    },
    /** -1 to pitch down, 1 to climb; the mouse pitches when no key is held. */
    elevator() {
      const keys = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
      if (keys !== 0) return keys;
      if (!pointerActive) return 0;
      const dead = 0.08;
      return Math.abs(pointerY) < dead ? 0 : Math.max(-1, Math.min(1, -pointerY));
    },
    /** -1 to ease off, 1 to open the throttle. */
    throttleDelta() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
