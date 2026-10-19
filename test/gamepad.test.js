import { describe, it, expect } from 'vitest';
import { readGamepad, menuDirections } from '../src/gamepad.js';

// A fake controller shaped like the browser's Gamepad object.
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const PLAYSTATION = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';

function pad({ left = [0, 0], right = [0, 0], pressed = [], rt = 0, id = XBOX } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  buttons[7] = { pressed: rt > 0.5, value: rt };
  return { id, axes: [...left, ...right], buttons };
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

  it('reports how far the right stick is pushed, for turning', () => {
    const result = readGamepad(pad({ right: [0.6, 0] }));
    expect(result.look.x).toBeCloseTo(0.5);
    expect(result.look.y).toBeCloseTo(0);
    expect(readGamepad(pad()).look).toEqual({ x: 0, y: 0 });
  });

  it('jumps with B on an Xbox controller, not A', () => {
    expect(readGamepad(pad({ pressed: [1] })).jump).toBe(true);
    expect(readGamepad(pad({ pressed: [0] })).jump).toBe(false);
  });

  it('jumps with cross on a PlayStation controller', () => {
    expect(readGamepad(pad({ id: PLAYSTATION, pressed: [0] })).jump).toBe(true);
    expect(readGamepad(pad({ id: PLAYSTATION, pressed: [1] })).jump).toBe(false);
    expect(readGamepad(pad({ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', pressed: [0] })).jump).toBe(true);
  });

  it('treats an unknown controller like an Xbox one', () => {
    expect(readGamepad(pad({ id: 'Some Generic Pad', pressed: [1] })).jump).toBe(true);
  });

  it('reports the D-pad, confirm and Y / triangle for menus', () => {
    const result = readGamepad(pad({ pressed: [12, 15, 0, 3] }));
    expect(result.dpad).toEqual({ up: true, down: false, left: false, right: true });
    expect(result.confirm).toBe(true);
    expect(result.menu).toBe(true);
    expect(result.pause).toBe(false);
    expect(readGamepad(pad({ pressed: [9] })).pause).toBe(true);
  });

  it('switches view with View / Share', () => {
    expect(readGamepad(pad({ pressed: [8] })).switchView).toBe(true);
    expect(readGamepad(pad()).switchView).toBe(false);
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

describe('readGamepad back button', () => {
  it('reports B / circle as back', () => {
    expect(readGamepad(pad({ pressed: [1] })).back).toBe(true);
    expect(readGamepad(pad({ id: PLAYSTATION, pressed: [1] })).back).toBe(true);
    expect(readGamepad(pad()).back).toBe(false);
  });
});

describe('menuDirections', () => {
  const STEP = 1 / 60;
  // Holds the same controller reading for `seconds`, collecting every menu move.
  function hold(reading, seconds, memory = {}) {
    const moves = [];
    for (let t = 0; t < seconds - 1e-9; t += STEP) moves.push(...menuDirections(readGamepad(pad(reading)), memory, STEP));
    return moves;
  }

  it('moves once for a quick D-pad press', () => {
    expect(hold({ pressed: [15] }, 0.2)).toEqual(['right']);
  });

  it('works with the left stick too', () => {
    expect(hold({ left: [0, -0.9] }, 0.2)).toEqual(['up']);
    expect(hold({ left: [-0.8, 0.2] }, 0.2)).toEqual(['left']);
  });

  it('ignores a stick only pushed a little', () => {
    expect(hold({ left: [0.3, 0] }, 1)).toEqual([]);
  });

  it('repeats when held: after 0.4 s, then every 0.12 s', () => {
    const moves = hold({ pressed: [14] }, 1);
    // 0 s, 0.4 s, 0.52 s, 0.64 s, 0.76 s, 0.88 s, 1.0 s (maybe) -> 6 or 7 moves
    expect(moves.length).toBeGreaterThanOrEqual(6);
    expect(moves.length).toBeLessThanOrEqual(7);
    expect(new Set(moves)).toEqual(new Set(['left']));
  });

  it('starts again after letting go', () => {
    const memory = {};
    expect(hold({ pressed: [13] }, 0.1, memory)).toEqual(['down']);
    hold({}, 0.1, memory);
    expect(hold({ pressed: [13] }, 0.1, memory)).toEqual(['down']);
  });
});
