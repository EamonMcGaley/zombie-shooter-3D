import { describe, it, expect } from 'vitest';
import { joystickVector, lookTurn } from '../src/touch.js';

const centre = { x: 100, y: 200 };

describe('joystickVector', () => {
  it('does nothing for a tiny wobble of the thumb', () => {
    expect(joystickVector(centre, { x: 105, y: 198 }, 60)).toEqual({ x: 0, y: 0 });
  });

  it('gives full strength at the edge of the ring', () => {
    const v = joystickVector(centre, { x: 160, y: 200 }, 60);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it('never goes above full strength when the thumb goes past the ring', () => {
    const v = joystickVector(centre, { x: 100, y: 500 }, 60);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(1);
  });

  it('gives about half strength half-way out', () => {
    const v = joystickVector(centre, { x: 100 - 34.5, y: 200 }, 60); // 15% dead zone: half of the rest
    expect(v.x).toBeCloseTo(-0.5, 1);
  });

  it('treats up the screen as negative y, like a controller stick', () => {
    expect(joystickVector(centre, { x: 100, y: 140 }, 60).y).toBeCloseTo(-1);
  });
});

describe('lookTurn', () => {
  it('turns more for a longer drag and a higher sensitivity', () => {
    expect(lookTurn(100, 1)).toBeCloseTo(0.6);
    expect(lookTurn(100, 2)).toBeCloseTo(1.2);
    expect(lookTurn(-50, 1)).toBeCloseTo(-0.3);
  });
});
