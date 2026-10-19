import { describe, it, expect } from 'vitest';
import { MAPS, buildNamedMap } from '../src/maps.js';
import { ARENA, TILE, COLS, ROWS, blockedTiles, distancesFrom } from '../src/map.js';

const START = { x: ARENA.width / 2, y: ARENA.height / 2 };

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function tileOf(point) {
  return Math.floor(point.y / TILE) * COLS + Math.floor(point.x / TILE);
}

describe.each(Object.keys(MAPS))('the %s map', (key) => {
  const map = buildNamedMap(key);
  const blocked = blockedTiles(map.obstacles);
  const distance = distancesFrom([tileOf(START)], blocked);

  it('has a name', () => {
    expect(map.name.length).toBeGreaterThan(0);
  });

  it('keeps everything inside the arena', () => {
    for (const o of map.obstacles) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.x + o.w).toBeLessThanOrEqual(ARENA.width);
      expect(o.y + o.h).toBeLessThanOrEqual(ARENA.height);
    }
  });

  it('has no overlapping obstacles', () => {
    map.obstacles.forEach((a, i) => {
      map.obstacles.slice(i + 1).forEach((b) => expect(overlaps(a, b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(false));
    });
  });

  it('gives every obstacle a kind and a height', () => {
    for (const o of map.obstacles) {
      expect(typeof o.kind).toBe('string');
      expect(o.height).toBeGreaterThan(0);
    }
  });

  it('never blocks a doorway', () => {
    for (const door of map.pieces.flatMap((p) => p.doorways ?? [])) {
      expect(map.obstacles.some((o) => overlaps(o, door))).toBe(false);
    }
  });

  it('leaves room around the player start', () => {
    const area = { x: START.x - 40, y: START.y - 40, w: 80, h: 80 };
    expect(map.obstacles.some((o) => overlaps(o, area))).toBe(false);
  });

  it('lets the player walk into every building', () => {
    for (const building of map.pieces.filter((p) => p.doorways)) {
      const floor = { x: building.x + TILE * 1.5, y: building.y + TILE * 1.5 };
      // Some floor tile inside the building must be reachable.
      let reachable = false;
      for (let y = building.y + TILE; y < building.y + building.h - TILE; y += TILE) {
        for (let x = building.x + TILE; x < building.x + building.w - TILE; x += TILE) {
          if (distance[tileOf({ x: x + 1, y: y + 1 })] !== Infinity) reachable = true;
        }
      }
      expect(reachable, `${building.kind} at ${floor.x},${floor.y}`).toBe(true);
    }
  });

  // A zombie is 24 wide, so a 1-tile (20 px) gap traps it: the pathfinding
  // thinks it can walk through, but it can't fit.
  it('has no gaps too narrow for a zombie to fit through', () => {
    const open = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !blocked[r * COLS + c];
    const narrow = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!open(c, r)) continue;
        const squeezedSideways = !open(c - 1, r) && !open(c + 1, r) && c > 0 && c < COLS - 1;
        const squeezedUpDown = !open(c, r - 1) && !open(c, r + 1) && r > 0 && r < ROWS - 1;
        if (squeezedSideways || squeezedUpDown) narrow.push(`(${c}, ${r})`);
      }
    }
    expect(narrow, `1-tile gaps at tiles ${narrow.slice(0, 8).join(' ')}`).toEqual([]);
  });

  it('has plenty of space to run around in', () => {
    const reachable = distance.filter((d) => d !== Infinity).length;
    expect(reachable).toBeGreaterThan(600);
  });
});

describe('map choices', () => {
  it('has Atomic Avenue, Container Yard and The Bunker', () => {
    expect(Object.keys(MAPS).sort()).toEqual(['avenue', 'bunker', 'yard']);
    expect(buildNamedMap('avenue').name).toBe('Atomic Avenue');
  });

  it('builds the bus, containers and fences as their own kinds of obstacle', () => {
    const kinds = (key) => new Set(buildNamedMap(key).obstacles.map((o) => o.kind));
    expect(kinds('avenue').has('bus')).toBe(true);
    expect(kinds('avenue').has('fence')).toBe(true);
    expect(kinds('yard').has('container')).toBe(true);
  });

  it('makes fences low enough to jump, but not the bus, containers or boundary walls', () => {
    const height = (key, kind) => buildNamedMap(key).obstacles.find((o) => o.kind === kind).height;
    expect(height('avenue', 'fence')).toBeLessThan(40);
    expect(height('avenue', 'bus')).toBeGreaterThan(62);
    expect(height('yard', 'container')).toBeGreaterThan(62);
    expect(height('yard', 'perimeter')).toBeGreaterThan(62);
  });

  it('keeps rows and columns of tiles consistent with the arena', () => {
    expect(COLS * TILE).toBe(ARENA.width);
    expect(ROWS * TILE).toBe(ARENA.height);
  });
});
