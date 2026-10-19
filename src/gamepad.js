// Turns a controller's raw sticks and buttons into game actions.
// No browser code in here, so it can be tested with fake controllers.
// See .scratch/controller-support/spec.md.

export const DEADZONE = 0.2;

// Standard controller layout (same positions on Xbox and PlayStation pads).
const BUTTON_A = 0; // A / cross
const BUTTON_B = 1; // B / circle
const BUTTON_Y = 3; // Y / triangle
const BUTTON_RT = 7; // RT / R2
const BUTTON_VIEW = 8; // View / Share
const BUTTON_START = 9; // Start / Options
const DPAD = { up: 12, down: 13, left: 14, right: 15 };

// PlayStation pads report Sony's vendor id (054c) or a Sony name.
export function isPlayStation(pad) {
  return /054c|dualsense|dualshock|^wireless controller/i.test(pad.id ?? '');
}

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
    // Jump is cross on PlayStation, but B (not A) on Xbox and other pads.
    jump: button(isPlayStation(pad) ? BUTTON_A : BUTTON_B).pressed,
    pause: button(BUTTON_START).pressed,
    menu: button(BUTTON_Y).pressed,
    confirm: button(BUTTON_A).pressed,
    back: button(BUTTON_B).pressed,
    dpad: {
      up: button(DPAD.up).pressed,
      down: button(DPAD.down).pressed,
      left: button(DPAD.left).pressed,
      right: button(DPAD.right).pressed,
    },
    active: aim !== null || move.x !== 0 || move.y !== 0 || pad.buttons.some((b) => b.pressed),
  };
}

// --- Menus ---

const MENU_STICK = 0.5; // how far the left stick must be pushed to move in a menu
const FIRST_REPEAT = 0.4; // seconds held before a direction starts repeating
const REPEAT_EVERY = 0.12;

// Turns the D-pad or left stick into menu moves ('up', 'down', 'left', 'right').
// One move per press, then repeats while held. \`memory\` is an object the
// caller keeps between frames.
export function menuDirections(controller, memory, dt) {
  const direction = heldDirection(controller);
  if (direction !== memory.direction) {
    memory.direction = direction;
    memory.heldFor = 0;
    memory.nextRepeat = FIRST_REPEAT;
    return direction ? [direction] : [];
  }
  if (!direction) return [];
  memory.heldFor += dt;
  if (memory.heldFor < memory.nextRepeat - 1e-9) return [];
  memory.nextRepeat += REPEAT_EVERY;
  return [direction];
}

function heldDirection({ dpad, move }) {
  for (const dir of ['up', 'down', 'left', 'right']) if (dpad[dir]) return dir;
  // The stick counts along whichever way it's pushed furthest.
  if (Math.max(Math.abs(move.x), Math.abs(move.y)) < MENU_STICK) return null;
  if (Math.abs(move.x) > Math.abs(move.y)) return move.x > 0 ? 'right' : 'left';
  return move.y > 0 ? 'down' : 'up';
}

// Ignores drift inside the dead zone, then rescales so movement starts at 0 just
// outside it and reaches 1 at a full push.
function stick(x = 0, y = 0) {
  const length = Math.hypot(x, y);
  if (length < DEADZONE) return { x: 0, y: 0 };
  const strength = Math.min((length - DEADZONE) / (1 - DEADZONE), 1);
  return { x: (x / length) * strength, y: (y / length) * strength };
}
