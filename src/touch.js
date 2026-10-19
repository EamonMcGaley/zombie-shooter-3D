// Touch-control maths. No browser code, so it can be tested.
// See .scratch/mobile/spec.md.

const DEAD_ZONE = 0.15; // fraction of the joystick ring that does nothing
const TOUCH_TURN = 0.006; // radians per pixel dragged, at 1.0x sensitivity

// Where the thumb is compared with where it first touched, as a stick reading:
// x and y from -1 to 1 (up the screen is negative y, like a controller).
export function joystickVector(start, current, radius) {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const length = Math.hypot(dx, dy);
  const dead = radius * DEAD_ZONE;
  if (length <= dead) return { x: 0, y: 0 };
  const strength = Math.min((length - dead) / (radius - dead), 1);
  return { x: (dx / length) * strength, y: (dy / length) * strength };
}

// How far to turn (in radians) for a sideways drag of `dx` pixels.
export function lookTurn(dx, sensitivity) {
  return dx * TOUCH_TURN * sensitivity;
}
