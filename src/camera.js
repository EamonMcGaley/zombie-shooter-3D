// Third-person camera maths on the flat map. No browser code, so it can be tested.
// See .scratch/third-person-3d/spec.md.
//
// `yaw` is the facing angle on the map: 0 faces +x, PI/2 faces +y.

import { lineEntry, grow } from './geometry.js';

export const CAMERA_BACK = 130; // behind the player (about Fortnite distance)
export const CAMERA_SIDE = 30; // over the right shoulder
export const CAMERA_HEIGHT = 75; // lowered to match the 25% smaller characters
export const AIM_RANGE = 400; // bullets cross the crosshair about this far out
const WALL_MARGIN = 8; // how far in front of a wall the camera stops

function forward(yaw) {
  return { x: Math.cos(yaw), y: Math.sin(yaw) };
}

function right(yaw) {
  return { x: -Math.sin(yaw), y: Math.cos(yaw) };
}

// Forward/strafe input (each -1 to 1) as a movement direction on the map.
export function moveFromInput(forwardAmount, strafeAmount, yaw) {
  const f = forward(yaw);
  const r = right(yaw);
  return {
    moveX: f.x * forwardAmount + r.x * strafeAmount,
    moveY: f.y * forwardAmount + r.y * strafeAmount,
  };
}

// Where the camera sits on the map. It moves in front of any wall that's
// between it and the player.
export function cameraPosition(player, yaw, walls) {
  const f = forward(yaw);
  const r = right(yaw);
  const ideal = {
    x: player.x - f.x * CAMERA_BACK + r.x * CAMERA_SIDE,
    y: player.y - f.y * CAMERA_BACK + r.y * CAMERA_SIDE,
  };
  let fraction = 1;
  for (const wall of walls) {
    const hit = lineEntry(player, ideal, grow(wall, WALL_MARGIN));
    if (hit !== null) fraction = Math.min(fraction, hit);
  }
  return {
    x: player.x + (ideal.x - player.x) * fraction,
    y: player.y + (ideal.y - player.y) * fraction,
  };
}

// The point the rules should aim at: straight out from the camera.
export function aimPoint(camera, yaw) {
  const f = forward(yaw);
  return { x: camera.x + f.x * AIM_RANGE, y: camera.y + f.y * AIM_RANGE };
}
