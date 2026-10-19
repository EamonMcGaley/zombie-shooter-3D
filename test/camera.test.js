import { describe, it, expect } from 'vitest';
import { moveFromInput, cameraPosition, aimPoint } from '../src/camera.js';

// Facing angles on the map (y points down the screen in the old top-down view).
const EAST = 0; // facing +x
const SOUTH = Math.PI / 2; // facing +y

describe('moveFromInput', () => {
  it('moves forward the way you are facing', () => {
    expect(moveFromInput(1, 0, EAST)).toEqual({ moveX: 1, moveY: expect.closeTo(0) });
    const south = moveFromInput(1, 0, SOUTH);
    expect(south.moveX).toBeCloseTo(0);
    expect(south.moveY).toBeCloseTo(1);
  });

  it('strafes to your right', () => {
    // Facing east, your right is south. Facing south, your right is west.
    const facingEast = moveFromInput(0, 1, EAST);
    expect(facingEast.moveX).toBeCloseTo(0);
    expect(facingEast.moveY).toBeCloseTo(1);
    const facingSouth = moveFromInput(0, 1, SOUTH);
    expect(facingSouth.moveX).toBeCloseTo(-1);
    expect(facingSouth.moveY).toBeCloseTo(0);
  });
});

describe('cameraPosition', () => {
  const player = { x: 400, y: 300 };

  it('sits 130 behind and 30 to the right of the player', () => {
    const camera = cameraPosition(player, EAST, []);
    expect(camera.x).toBeCloseTo(270);
    expect(camera.y).toBeCloseTo(330);
  });

  it('turns with the player', () => {
    const camera = cameraPosition(player, SOUTH, []);
    expect(camera.x).toBeCloseTo(370);
    expect(camera.y).toBeCloseTo(170);
  });

  it('moves in front of a wall behind the player instead of going through it', () => {
    const wall = { x: 330, y: 250, w: 20, h: 100 };
    const camera = cameraPosition(player, EAST, [wall]);
    expect(camera.x).toBeGreaterThan(350);
    expect(camera.x).toBeLessThan(400);
  });

  it('ignores walls that are not in the way', () => {
    const wall = { x: 500, y: 250, w: 20, h: 100 };
    expect(cameraPosition(player, EAST, [wall]).x).toBeCloseTo(270);
  });
});

describe('aimPoint', () => {
  it('aims 400 units straight ahead of the camera', () => {
    const point = aimPoint({ x: 270, y: 330 }, EAST);
    expect(point.x).toBeCloseTo(670);
    expect(point.y).toBeCloseTo(330);
  });
});
