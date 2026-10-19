import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/map.js';

const TILE = 20;
const COLS = 40;
const ROWS = 30;
const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);

function count(map, kind) {
  return map.pieces.filter((p) => p.kind === kind).length;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function grow(rect, by) {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by };
}

function distanceToCentre(rect) {
  const dx = Math.max(rect.x - 400, 0, 400 - (rect.x + rect.w));
  const dy = Math.max(rect.y - 300, 0, 300 - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

// Which side of its building a doorway is on.
function side(piece, door) {
  if (door.y === piece.y) return 'top';
  if (door.y + door.h === piece.y + piece.h) return 'bottom';
  if (door.x === piece.x) return 'left';
  return 'right';
}

// Counts open tiles, and how many of them can be reached from the arena edge.
function reachability(obstacles) {
  const open = (c, r) => !obstacles.some((o) => overlaps(o, { x: c * TILE, y: r * TILE, w: TILE, h: TILE }));
  const seen = new Set();
  const queue = [];
  let openCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!open(c, r)) continue;
      openCount++;
      if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) {
        seen.add(`${c},${r}`);
        queue.push([c, r]);
      }
    }
  }
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      const key = `${nc},${nr}`;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen.has(key) || !open(nc, nr)) continue;
      seen.add(key);
      queue.push([nc, nr]);
    }
  }
  return { openCount, reached: seen.size };
}

describe('generateMap', () => {
  it('always has 1 house, 1 shed, 2 cars, 4 crates and 1 low wall', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      expect([count(map, 'house'), count(map, 'shed'), count(map, 'car'), count(map, 'crate'), count(map, 'lowWall')])
        .toEqual([1, 1, 2, 4, 1]);
    }
  });

  it('gives the house 2 doorways on different sides and the shed 1 doorway', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      const house = map.pieces.find((p) => p.kind === 'house');
      const shed = map.pieces.find((p) => p.kind === 'shed');
      expect(house.doorways).toHaveLength(2);
      expect(side(house, house.doorways[0])).not.toBe(side(house, house.doorways[1]));
      expect(shed.doorways).toHaveLength(1);
    }
  });

  it('never blocks a doorway', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      for (const door of map.pieces.flatMap((p) => p.doorways ?? [])) {
        expect(map.obstacles.some((o) => overlaps(o, door))).toBe(false);
      }
    }
  });

  it('keeps every piece 2 tiles from the edge and from each other, and 100 px from the start', () => {
    for (const seed of SEEDS) {
      const { pieces } = generateMap(seed);
      for (const piece of pieces) {
        expect(piece.x).toBeGreaterThanOrEqual(40);
        expect(piece.y).toBeGreaterThanOrEqual(40);
        expect(piece.x + piece.w).toBeLessThanOrEqual(760);
        expect(piece.y + piece.h).toBeLessThanOrEqual(560);
        expect(distanceToCentre(piece)).toBeGreaterThanOrEqual(100);
        for (const other of pieces) {
          if (other !== piece) expect(overlaps(grow(piece, 40), other)).toBe(false);
        }
      }
    }
  });

  it('never seals off any open space', () => {
    for (const seed of SEEDS) {
      const { openCount, reached } = reachability(generateMap(seed).obstacles);
      expect(reached).toBe(openCount);
    }
  });

  it('lets you walk inside the buildings', () => {
    const map = generateMap(1);
    const house = map.pieces.find((p) => p.kind === 'house');
    const floor = { x: house.x + 20, y: house.y + 20, w: house.w - 40, h: house.h - 40 };
    expect(map.obstacles.some((o) => overlaps(o, floor))).toBe(false);
  });

  it('builds the same map from the same seed, and different maps from different seeds', () => {
    expect(generateMap(42)).toEqual(generateMap(42));
    expect(generateMap(42).obstacles).not.toEqual(generateMap(43).obstacles);
  });
});
