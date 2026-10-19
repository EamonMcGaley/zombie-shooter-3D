// Game rules for Zombie Arena. No browser code in here, so it can be tested.
// See .scratch/arena-shooter/spec.md for the rules this implements.

import { generateMap, blockedTiles, distancesFrom, TILE, COLS, ROWS, ARENA } from './map.js';
import { lineEntry, grow } from './geometry.js';

export { ARENA };
export const PLAYER_SPEED = 200;
export const PLAYER_RADIUS = 12;
export const ROUND_BREAK = 3;
export const FIRE_RATE = 5;
export const BULLET_SPEED = 500;
export const BULLET_RADIUS = 3;
export const ZOMBIE_RADIUS = 12;
export const JUMP_SPEED = 330; // upward speed at the start of a jump
export const GRAVITY = 900;
const MIN_SPAWN_DISTANCE = 10 * TILE; // zombies never appear within 10 tiles of you
const AIM_ASSIST_CONE = (30 * Math.PI) / 180;

// --- Round rules ---

export function zombiesInRound(round) {
  return Math.min(5 + (round - 1), 30);
}

export function zombieSpeedForRound(round) {
  if (round <= 26) return 100 + 6 * (round - 1);
  // After the zombie count maxes out, speed creeps up 1% a round (compounding).
  return Math.min(250 * 1.01 ** (round - 26), PLAYER_SPEED * 1.5);
}

export function spawnIntervalForRound(round) {
  return Math.max(1.0 - 0.05 * (round - 1), 0.3);
}

// --- The game ---

// `obstacles` replaces the generated map (tests use [] for an empty arena).
export function createGame({ random = Math.random, seed, obstacles } = {}) {
  let pieces = [];
  if (obstacles === undefined) {
    seed ??= Math.floor(Math.random() * 1_000_000);
    ({ pieces, obstacles } = generateMap(seed));
  }
  return {
    random,
    seed: seed ?? null,
    pieces,
    obstacles,
    blocked: blockedTiles(obstacles),
    round: 1,
    phase: 'roundBreak', // 'roundBreak' | 'playing' | 'gameOver'
    breakTimer: ROUND_BREAK,
    player: { x: ARENA.width / 2, y: ARENA.height / 2, r: PLAYER_RADIUS, z: 0, vz: 0 }, // z: height off the ground
    zombies: [],
    zombiesToSpawn: 0,
    spawnTimer: 0,
    bullets: [],
    fireCooldown: 0,
  };
}

export function step(game, input, dt) {
  if (game.phase === 'gameOver') return game;

  movePlayer(game.player, input, dt);
  jump(game.player, input, dt);
  pushOutOfObstacles(game.player, game.obstacles, game.player.z);
  fire(game, input, dt);
  moveBullets(game, dt);

  if (game.phase === 'roundBreak') {
    game.breakTimer -= dt;
    if (game.breakTimer > 1e-9) return game;
    startRound(game);
  }

  spawnZombies(game, dt);
  moveZombies(game, dt);
  pushZombiesApart(game.zombies);
  for (const zombie of game.zombies) pushOutOfObstacles(zombie, game.obstacles);
  shootZombies(game);

  if (game.zombies.some((z) => touching(z, game.player))) {
    game.phase = 'gameOver';
  } else if (game.zombiesToSpawn === 0 && game.zombies.length === 0) {
    game.round += 1;
    game.phase = 'roundBreak';
    game.breakTimer = ROUND_BREAK;
  }
  return game;
}

function startRound(game) {
  game.phase = 'playing';
  game.zombiesToSpawn = zombiesInRound(game.round);
  game.spawnTimer = 0;
}

// --- Player ---

function movePlayer(player, input, dt) {
  // Analog stick values if given, otherwise the WASD keys.
  const analog = input.moveX !== undefined || input.moveY !== undefined;
  const dx = analog ? input.moveX ?? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = analog ? input.moveY ?? 0 : (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    // Dividing by length stops diagonal movement being faster; a gentle
    // stick push (length under 1) moves slower.
    const strength = Math.min(length, 1);
    player.x += (dx / length) * strength * PLAYER_SPEED * dt;
    player.y += (dy / length) * strength * PLAYER_SPEED * dt;
  }
  player.x = clamp(player.x, player.r, ARENA.width - player.r);
  player.y = clamp(player.y, player.r, ARENA.height - player.r);
}

// Starts a jump only from the ground (no double jumps), then lets gravity pull you back down.
function jump(player, input, dt) {
  if (input.jump && player.z === 0) player.vz = JUMP_SPEED;
  if (player.z === 0 && player.vz <= 0) return;
  player.vz -= GRAVITY * dt;
  player.z = Math.max(0, player.z + player.vz * dt);
  if (player.z === 0) player.vz = 0;
}

// --- Bullets ---

function fire(game, input, dt) {
  game.fireCooldown = Math.max(0, game.fireCooldown - dt);
  if (!input.firing || game.fireCooldown > 1e-9) return;
  const { player } = game;
  const dx = input.mouseX - player.x;
  const dy = input.mouseY - player.y;
  if (dx === 0 && dy === 0) return;
  const angle = Math.atan2(dy, dx) + aimAssistTurn(game, Math.atan2(dy, dx), input.aimAssist ?? 0);
  game.bullets.push({
    x: player.x,
    y: player.y,
    r: BULLET_RADIUS,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
  });
  game.fireCooldown = 1 / FIRE_RATE;
}

// How far (in radians) to turn a shot towards the zombie nearest the aim, if
// one is within AIM_ASSIST_CONE. A strength of 0.05 turns it 5% of the way.
function aimAssistTurn(game, aim, strength) {
  if (strength <= 0) return 0;
  let best = null;
  for (const zombie of game.zombies) {
    const toZombie = Math.atan2(zombie.y - game.player.y, zombie.x - game.player.x);
    const difference = angleBetween(aim, toZombie);
    if (Math.abs(difference) <= AIM_ASSIST_CONE && (best === null || Math.abs(difference) < Math.abs(best))) {
      best = difference;
    }
  }
  return best === null ? 0 : best * strength;
}

// The signed angle to turn from `from` to `to`, between -180° and 180°.
function angleBetween(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function moveBullets(game, dt) {
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  }
  game.bullets = game.bullets.filter(
    (bullet) => insideArena(bullet) && !game.obstacles.some((o) => overlapDepth(bullet, o) > 0),
  );
}

function shootZombies(game) {
  game.zombies = game.zombies.filter((zombie) => {
    const hit = game.bullets.findIndex((bullet) => touching(bullet, zombie));
    if (hit === -1) return true;
    game.bullets.splice(hit, 1);
    return false;
  });
}

// --- Zombies ---

function spawnZombies(game, dt) {
  game.spawnTimer -= dt;
  if (game.zombiesToSpawn === 0 || game.spawnTimer > 1e-9) return;
  const zombie = { ...spawnPoint(game), r: ZOMBIE_RADIUS };
  pushOutOfObstacles(zombie, game.obstacles); // a zombie is wider than a tile, so it may poke into a wall
  game.zombies.push(zombie);
  game.zombiesToSpawn -= 1;
  game.spawnTimer = spawnIntervalForRound(game.round);
}

// The centre of a random open tile anywhere on the map, at least 10 tiles from the player.
function spawnPoint(game) {
  const { random, player, blocked } = game;
  for (let attempt = 0; attempt < 30; attempt++) {
    const c = Math.floor(random() * COLS);
    const r = Math.floor(random() * ROWS);
    if (blocked[r * COLS + c]) continue;
    const point = { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE };
    if (distance(point, player) >= MIN_SPAWN_DISTANCE) return point;
  }
  // Unlucky random numbers: use the corner tile furthest from the player (the
  // map always keeps the edges open).
  return {
    x: player.x < ARENA.width / 2 ? ARENA.width - TILE / 2 : TILE / 2,
    y: player.y < ARENA.height / 2 ? ARENA.height - TILE / 2 : TILE / 2,
  };
}

function moveZombies(game, dt) {
  const speed = zombieSpeedForRound(game.round);
  // Flow field: one search from the player's tile, shared by every zombie.
  const distance = distancesFrom([tileIndex(game.player)], game.blocked);
  for (const zombie of game.zombies) {
    const target = clearLine(zombie, game.player, game.obstacles)
      ? game.player
      : nextTileTowardsPlayer(zombie, distance, game.blocked) ?? game.player;
    const dx = target.x - zombie.x;
    const dy = target.y - zombie.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    zombie.x += (dx / length) * speed * dt;
    zombie.y += (dy / length) * speed * dt;
  }
}

// The centre of the neighbouring tile that's fewest steps from the player,
// or null if no neighbour is closer than where the zombie already is.
function nextTileTowardsPlayer(zombie, distance, blocked) {
  const here = tileIndex(zombie);
  const c = here % COLS;
  const r = Math.floor(here / COLS);
  const open = (nc, nr) => nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && !blocked[nr * COLS + nc];
  let best = null;
  let bestDistance = distance[here];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nc = c + dc;
    const nr = r + dr;
    if (!open(nc, nr)) continue;
    // A diagonal step would cut the corner of a wall unless both sides are open.
    if (dc !== 0 && dr !== 0 && (!open(c + dc, r) || !open(c, r + dr))) continue;
    const d = distance[nr * COLS + nc];
    if (d < bestDistance) {
      bestDistance = d;
      best = { x: (nc + 0.5) * TILE, y: (nr + 0.5) * TILE };
    }
  }
  return best;
}

// The tile a point is on. Points outside the arena use the nearest edge tile.
function tileIndex(point) {
  const c = clamp(Math.floor(point.x / TILE), 0, COLS - 1);
  const r = clamp(Math.floor(point.y / TILE), 0, ROWS - 1);
  return r * COLS + c;
}

// True if a circle could slide straight from `from` to `to` without touching
// an obstacle: the line misses every obstacle widened by the circle's radius.
function clearLine(from, to, obstacles) {
  return obstacles.every((o) => !lineHitsRect(from, to, grow(o, from.r)));
}

function lineHitsRect(a, b, rect) {
  return lineEntry(a, b, rect) !== null;
}

function pushZombiesApart(zombies) {
  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i];
      const b = zombies[j];
      const gap = distance(a, b);
      const overlap = a.r + b.r - gap;
      if (overlap <= 0) continue;
      // Push each zombie half the overlap, directly away from the other.
      const nx = gap === 0 ? 1 : (b.x - a.x) / gap;
      const ny = gap === 0 ? 0 : (b.y - a.y) / gap;
      a.x -= (nx * overlap) / 2;
      a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.y += (ny * overlap) / 2;
    }
  }
}

// --- Obstacles ---

// Moves a circle the shortest way out of any obstacle it overlaps. Pushing
// straight out from the nearest edge is what lets things slide along walls.
// Obstacles lower than `height` (how high the circle is off the ground) are
// jumped over. Obstacles with no height count as infinitely tall.
function pushOutOfObstacles(circle, obstacles, height = 0) {
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      if ((o.height ?? Infinity) <= height) continue;
      const depth = overlapDepth(circle, o);
      if (depth === 0) continue;
      const nearestX = clamp(circle.x, o.x, o.x + o.w);
      const nearestY = clamp(circle.y, o.y, o.y + o.h);
      const dx = circle.x - nearestX;
      const dy = circle.y - nearestY;
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        circle.x += (dx / length) * depth;
        circle.y += (dy / length) * depth;
      } else {
        // Centre is inside the rectangle: leave by the closest side.
        const exits = [
          { d: circle.x - o.x + circle.r, x: o.x - circle.r, y: circle.y },
          { d: o.x + o.w - circle.x + circle.r, x: o.x + o.w + circle.r, y: circle.y },
          { d: circle.y - o.y + circle.r, x: circle.x, y: o.y - circle.r },
          { d: o.y + o.h - circle.y + circle.r, x: circle.x, y: o.y + o.h + circle.r },
        ];
        const exit = exits.reduce((a, b) => (b.d < a.d ? b : a));
        circle.x = exit.x;
        circle.y = exit.y;
      }
    }
  }
}

// How far a circle pokes into a rectangle (0 if it doesn't).
function overlapDepth(circle, rect) {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
  return Math.max(0, circle.r - Math.hypot(circle.x - nearestX, circle.y - nearestY));
}

// --- Helpers ---

function touching(a, b) {
  return distance(a, b) <= a.r + b.r;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function insideArena(thing) {
  return thing.x >= 0 && thing.x <= ARENA.width && thing.y >= 0 && thing.y <= ARENA.height;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
