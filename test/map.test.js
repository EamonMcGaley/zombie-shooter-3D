import { describe, it, expect } from 'vitest';
import { generateMap, ARENA, TILE, COLS, ROWS } from '../src/map.js';

const CENTRE = { x: ARENA.width / 2, y: ARENA.height / 2 };
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
  const dx = Math.max(rect.x - CENTRE.x, 0, CENTRE.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - CENTRE.y, 0, CENTRE.y - (rect.y + rect.h));
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
  // Mark blocked tiles obstacle by obstacle (fast even on a big map).
  const blocked = new Array(COLS * ROWS).fill(false);
  for (const o of obstacles) {
    for (let r = Math.floor(o.y / TILE); r < Math.ceil((o.y + o.h) / TILE); r++) {
      for (let c = Math.floor(o.x / TILE); c < Math.ceil((o.x + o.w) / TILE); c++) blocked[r * COLS + c] = true;
    }
  }
  const seen = new Array(COLS * ROWS).fill(false);
  const queue = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const edge = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
      if (edge && !blocked[r * COLS + c]) {
        seen[r * COLS + c] = true;
        queue.push([c, r]);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const [c, r] = queue[head];
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      const i = nr * COLS + nc;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen[i] || blocked[i]) continue;
      seen[i] = true;
      queue.push([nc, nr]);
    }
  }
  return { openCount: blocked.filter((b) => !b).length, reached: seen.filter(Boolean).length };
}

describe('generateMap', () => {
  it('always has 4 houses, 4 sheds, 8 cars, 16 crates and 4 low walls', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      expect([count(map, 'house'), count(map, 'shed'), count(map, 'car'), count(map, 'crate'), count(map, 'lowWall')])
        .toEqual([4, 4, 8, 16, 4]);
    }
  });

  it('gives each house 2 doorways on different sides and each shed 1 doorway', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      for (const house of map.pieces.filter((p) => p.kind === 'house')) {
        expect(house.doorways).toHaveLength(2);
        expect(side(house, house.doorways[0])).not.toBe(side(house, house.doorways[1]));
      }
      for (const shed of map.pieces.filter((p) => p.kind === 'shed')) expect(shed.doorways).toHaveLength(1);
    }
  });

  it('gives every obstacle the height of what it is part of', () => {
    const heights = { house: 96, shed: 96, car: 56, lowWall: 36, crate: 40 };
    for (const seed of SEEDS.slice(0, 10)) {
      const map = generateMap(seed);
      for (const o of map.obstacles) {
        const owner = map.pieces.find((p) => o.x >= p.x && o.y >= p.y && o.x + o.w <= p.x + p.w && o.y + o.h <= p.y + p.h);
        expect(o.height).toBe(heights[owner.kind]);
      }
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
        expect(piece.x + piece.w).toBeLessThanOrEqual(ARENA.width - 40);
        expect(piece.y + piece.h).toBeLessThanOrEqual(ARENA.height - 40);
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
