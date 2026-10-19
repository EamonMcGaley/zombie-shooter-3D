// Turns a controller's raw sticks and buttons into game actions.
// No browser code in here, so it can be tested with fake controllers.
// See .scratch/controller-support/spec.md.

export const DEADZONE = 0.2;

// Standard controller layout (same positions on Xbox and PlayStation pads).
const BUTTON_A = 0; // A / cross
const BUTTON_RT = 7; // RT / R2
const BUTTON_VIEW = 8; // View / Share
const BUTTON_START = 9; // Start / Options

export function readGamepad(pad) {
  const move = stick(pad.axes[0], pad.axes[1]);
  const right = stick(pad.axes[2], pad.axes[3]);
  const rightLength = Math.hypot(right.x, right.y);
  const aim = rightLength > 0 ? { x: right.x / rightLength, y: right.y / rightLength } : null;
  const button = (i) => pad.buttons[i] ?? { pressed: false, value: 0 };

  return {
    move,
    aim,
    look: right,
    firing: button(BUTTON_RT).value > 0.5,
    restart: button(BUTTON_A).pressed || button(BUTTON_START).pressed,
    switchView: button(BUTTON_VIEW).pressed,
    jump: button(BUTTON_A).pressed,
    active: aim !== null || move.x !== 0 || move.y !== 0 || pad.buttons.some((b) => b.pressed),
  };
}

// Ignores drift inside the dead zone, then rescales so movement starts at 0 just
// outside it and reaches 1 at a full push.
function stick(x = 0, y = 0) {
  const length = Math.hypot(x, y);
  if (length < DEADZONE) return { x: 0, y: 0 };
  const strength = Math.min((length - DEADZONE) / (1 - DEADZONE), 1);
  return { x: (x / length) * strength, y: (y / length) * strength };
}
