import { describe, it, expect } from 'vitest';
import { readGamepad } from '../src/gamepad.js';

// A fake controller shaped like the browser's Gamepad object.
function pad({ left = [0, 0], right = [0, 0], pressed = [], rt = 0 } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  buttons[7] = { pressed: rt > 0.5, value: rt };
  return { axes: [...left, ...right], buttons };
}

describe('readGamepad', () => {
  it('reads nothing from a controller nobody is touching', () => {
    const result = readGamepad(pad());
    expect(result.move).toEqual({ x: 0, y: 0 });
    expect(result.aim).toBeNull();
    expect(result.firing).toBe(false);
    expect(result.restart).toBe(false);
    expect(result.active).toBe(false);
  });

  it('ignores small stick drift inside the dead zone', () => {
    const result = readGamepad(pad({ left: [0.1, 0.1], right: [0.15, 0] }));
    expect(result.move).toEqual({ x: 0, y: 0 });
    expect(result.aim).toBeNull();
    expect(result.active).toBe(false);
  });

  it('moves at full strength with the left stick fully pushed', () => {
    const result = readGamepad(pad({ left: [1, 0] }));
    expect(result.move.x).toBeCloseTo(1);
    expect(result.move.y).toBeCloseTo(0);
    expect(result.active).toBe(true);
  });

  it('moves gently with the left stick partly pushed, starting from zero at the dead zone edge', () => {
    expect(readGamepad(pad({ left: [0.6, 0] })).move.x).toBeCloseTo(0.5);
    expect(readGamepad(pad({ left: [0.21, 0] })).move.x).toBeLessThan(0.05);
  });

  it('aims with the right stick without firing', () => {
    const result = readGamepad(pad({ right: [0, -0.8] }));
    expect(result.aim.x).toBeCloseTo(0);
    expect(result.aim.y).toBeCloseTo(-1);
    expect(result.firing).toBe(false);
  });

  it('fires with RT / R2 pressed past halfway', () => {
    expect(readGamepad(pad({ rt: 0.9 })).firing).toBe(true);
    expect(readGamepad(pad({ rt: 0.3 })).firing).toBe(false);
  });

  it('restarts with A / cross or Start / Options', () => {
    expect(readGamepad(pad({ pressed: [0] })).restart).toBe(true);
    expect(readGamepad(pad({ pressed: [9] })).restart).toBe(true);
    expect(readGamepad(pad({ pressed: [1] })).restart).toBe(false);
  });

  it('counts any pressed button as using the controller', () => {
    expect(readGamepad(pad({ pressed: [3] })).active).toBe(true);
  });
});
