// Random map generation and the tile grid used for pathfinding.
// No browser code in here, so it can be tested.
// See .scratch/obstacles/spec.md.

export const TILE = 20;
export const COLS = 80; // 1600 px
export const ROWS = 60; // 1200 px
export const ARENA = { width: COLS * TILE, height: ROWS * TILE };

const MARGIN = 2; // tiles kept clear at the arena edge
const GAP = 2; // tiles kept clear between pieces
const START_CLEARANCE = 100; // px kept clear around the player's start
const CENTRE = { x: (COLS * TILE) / 2, y: (ROWS * TILE) / 2 };

// How tall each kind of piece is. The player can jump over anything lower than a jump.
export const HEIGHTS = {
  house: 96,
  shed: 96,
  wall: 96, // interior wall
  perimeter: 120, // boundary wall around a map
  container: 100,
  bus: 70,
  car: 56,
  lowWall: 36,
  crate: 40,
  fence: 30,
};

const times = (count, piece) => Array.from({ length: count }, () => piece);

// Placed biggest first, so the big pieces get the most room.
const PIECES = [
  ...times(4, { kind: 'house', w: 10, h: 7, doors: 2 }),
  ...times(4, { kind: 'shed', w: 6, h: 5, doors: 1 }),
  ...times(8, { kind: 'car', w: 4, h: 2, rotates: true }),
  ...times(4, { kind: 'lowWall', w: 6, h: 1, rotates: true }),
  ...times(16, { kind: 'crate', w: 2, h: 2 }),
];

export function generateMap(seed) {
  const random = seededRandom(seed);
  for (let attempt = 0; attempt < 100; attempt++) {
    const pieces = placePieces(random);
    if (!pieces) continue;
    const obstacles = pieces.flatMap(solidParts);
    if (everyOpenTileReachable(obstacles)) return { seed, pieces, obstacles };
  }
  throw new Error(`Could not build a fair map from seed ${seed}`);
}

function placePieces(random) {
  const placed = [];
  for (const template of PIECES) {
    const flip = template.rotates && random() < 0.5;
    const w = flip ? template.h : template.w;
    const h = flip ? template.w : template.h;
    const spot = findSpot(random, w, h, placed);
    if (!spot) return null; // no room: start the whole map again
    const piece = { kind: template.kind, ...spot };
    if (template.doors) piece.doorways = makeDoorways(random, piece, template.doors);
    placed.push(piece);
  }
  return placed;
}

function findSpot(random, w, h, placed) {
  for (let tries = 0; tries < 200; tries++) {
    const col = MARGIN + Math.floor(random() * (COLS - 2 * MARGIN - w + 1));
    const row = MARGIN + Math.floor(random() * (ROWS - 2 * MARGIN - h + 1));
    const spot = { x: col * TILE, y: row * TILE, w: w * TILE, h: h * TILE };
    const gapped = grow(spot, GAP * TILE);
    if (distanceToPoint(spot, CENTRE) < START_CLEARANCE) continue;
    if (placed.some((other) => overlaps(gapped, other))) continue;
    return spot;
  }
  return null;
}

// Doorways are 2 tiles wide, on different sides, never at a corner.
function makeDoorways(random, piece, count) {
  const sides = shuffle(random, ['top', 'bottom', 'left', 'right']).slice(0, count);
  return sides.map((side) => {
    const horizontal = side === 'top' || side === 'bottom';
    const lengthInTiles = (horizontal ? piece.w : piece.h) / TILE;
    return doorwayRect(piece, side, 1 + Math.floor(random() * (lengthInTiles - 3)));
  });
}

// A 2-tile doorway in one side of a building, `offset` tiles along from its corner.
export function doorwayRect(piece, side, offset) {
  const along = offset * TILE;
  if (side === 'top') return { x: piece.x + along, y: piece.y, w: 2 * TILE, h: TILE };
  if (side === 'bottom') return { x: piece.x + along, y: piece.y + piece.h - TILE, w: 2 * TILE, h: TILE };
  if (side === 'left') return { x: piece.x, y: piece.y + along, w: TILE, h: 2 * TILE };
  return { x: piece.x + piece.w - TILE, y: piece.y + along, w: TILE, h: 2 * TILE };
}

// The solid rectangles of a piece: the whole thing, or a building's walls with
// gaps for doorways. Each carries the piece's kind, height and colour (if any).
export function solidParts(piece) {
  const looks = { kind: piece.kind, height: HEIGHTS[piece.kind], ...(piece.colour && { colour: piece.colour }) };
  if (!piece.doorways) return [{ x: piece.x, y: piece.y, w: piece.w, h: piece.h, ...looks }];
  const { x, y, w, h } = piece;
  const walls = [
    { x, y, w, h: TILE, ...looks }, // top
    { x, y: y + h - TILE, w, h: TILE, ...looks }, // bottom
    { x, y: y + TILE, w: TILE, h: h - 2 * TILE, ...looks }, // left
    { x: x + w - TILE, y: y + TILE, w: TILE, h: h - 2 * TILE, ...looks }, // right
  ];
  return walls.flatMap((wall) => piece.doorways.reduce((parts, door) => parts.flatMap((p) => cut(p, door)), [wall]));
}

// A wall section with a doorway cut out of it (as 0, 1 or 2 pieces).
function cut(wall, door) {
  if (!overlaps(wall, door)) return [wall];
  const parts = [];
  if (wall.w > wall.h) {
    if (door.x > wall.x) parts.push({ ...wall, w: door.x - wall.x });
    if (door.x + door.w < wall.x + wall.w) parts.push({ ...wall, x: door.x + door.w, w: wall.x + wall.w - door.x - door.w });
  } else {
    if (door.y > wall.y) parts.push({ ...wall, h: door.y - wall.y });
    if (door.y + door.h < wall.y + wall.h) parts.push({ ...wall, y: door.y + door.h, h: wall.y + wall.h - door.y - door.h });
  }
  return parts;
}

// --- The tile grid ---

// One entry per tile: true if any obstacle covers part of it.
export function blockedTiles(obstacles) {
  const blocked = new Array(COLS * ROWS).fill(false);
  for (const o of obstacles) {
    for (let r = Math.floor(o.y / TILE); r < Math.ceil((o.y + o.h) / TILE); r++) {
      for (let c = Math.floor(o.x / TILE); c < Math.ceil((o.x + o.w) / TILE); c++) {
        if (c >= 0 && r >= 0 && c < COLS && r < ROWS) blocked[r * COLS + c] = true;
      }
    }
  }
  return blocked;
}

// Breadth-first search: the number of tile steps from each open tile to the
// nearest start tile (Infinity if it can't be reached).
// Runs every game step, so it uses fixed-size number arrays and no temporary
// objects: that keeps it fast and avoids garbage-collection stutters.
export function distancesFrom(starts, blocked) {
  const distance = new Float64Array(COLS * ROWS).fill(Infinity);
  const queue = new Int32Array(COLS * ROWS);
  let tail = 0;
  for (const i of starts) {
    if (blocked[i] || distance[i] === 0) continue;
    distance[i] = 0;
    queue[tail++] = i;
  }
  const visit = (n, d) => {
    if (blocked[n] || distance[n] !== Infinity) return;
    distance[n] = d;
    queue[tail++] = n;
  };
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const c = i % COLS;
    const d = distance[i] + 1;
    if (c + 1 < COLS) visit(i + 1, d);
    if (c > 0) visit(i - 1, d);
    if (i + COLS < COLS * ROWS) visit(i + COLS, d);
    if (i >= COLS) visit(i - COLS, d);
  }
  return distance;
}

function everyOpenTileReachable(obstacles) {
  const blocked = blockedTiles(obstacles);
  const edges = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) edges.push(r * COLS + c);
    }
  }
  const distance = distancesFrom(edges, blocked);
  return distance.every((d, i) => blocked[i] || d !== Infinity);
}

// --- Helpers ---

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function grow(rect, by) {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by };
}

function distanceToPoint(rect, point) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

function shuffle(random, items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// A small, fast random number generator (mulberry32): the same seed always
// gives the same sequence of numbers.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
