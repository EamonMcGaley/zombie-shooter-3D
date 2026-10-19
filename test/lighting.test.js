import { describe, it, expect } from 'vitest';
import { brightnessForRound, fadeTowards } from '../src/lighting.js';

describe('brightnessForRound', () => {
  it('is always between 75% and 100%', () => {
    for (const value of [0, 0.25, 0.5, 0.999999]) {
      const b = brightnessForRound(() => value);
      expect(b).toBeGreaterThanOrEqual(0.75);
      expect(b).toBeLessThanOrEqual(1);
    }
    expect(brightnessForRound(() => 0)).toBe(0.75);
  });
});

describe('fadeTowards', () => {
  it('fades the brightness over about 2 seconds instead of jumping', () => {
    expect(fadeTowards(1, 0.75, 0.5)).toBeCloseTo(0.9375); // a quarter of the way after 0.5 s
    expect(fadeTowards(1, 0.75, 3)).toBe(0.75); // never overshoots
    expect(fadeTowards(0.8, 0.9, 1)).toBeCloseTo(0.85); // works going brighter too
  });
});
