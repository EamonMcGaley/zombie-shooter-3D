// Game rules for Zombie Arena. No browser code in here, so it can be tested.
// See .scratch/arena-shooter/spec.md for the rules this implements.

export const ARENA = { width: 800, height: 600 };
export const PLAYER_SPEED = 200;
export const PLAYER_RADIUS = 12;
export const ROUND_BREAK = 3;
export const FIRE_RATE = 5;
export const BULLET_SPEED = 500;
export const BULLET_RADIUS = 3;
export const ZOMBIE_RADIUS = 12;
const MIN_SPAWN_DISTANCE = 250;

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

export function createGame({ random = Math.random } = {}) {
  return {
    random,
    round: 1,
    phase: 'roundBreak', // 'roundBreak' | 'playing' | 'gameOver'
    breakTimer: ROUND_BREAK,
    player: { x: ARENA.width / 2, y: ARENA.height / 2, r: PLAYER_RADIUS },
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
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    // Dividing by length stops diagonal movement being faster.
    player.x += (dx / length) * PLAYER_SPEED * dt;
    player.y += (dy / length) * PLAYER_SPEED * dt;
  }
  player.x = clamp(player.x, player.r, ARENA.width - player.r);
  player.y = clamp(player.y, player.r, ARENA.height - player.r);
}

// --- Bullets ---

function fire(game, input, dt) {
  game.fireCooldown = Math.max(0, game.fireCooldown - dt);
  if (!input.firing || game.fireCooldown > 1e-9) return;
  const { player } = game;
  const dx = input.mouseX - player.x;
  const dy = input.mouseY - player.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  game.bullets.push({
    x: player.x,
    y: player.y,
    r: BULLET_RADIUS,
    vx: (dx / length) * BULLET_SPEED,
    vy: (dy / length) * BULLET_SPEED,
  });
  game.fireCooldown = 1 / FIRE_RATE;
}

function moveBullets(game, dt) {
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  }
  game.bullets = game.bullets.filter(insideArena);
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
  game.zombies.push({ ...spawnPoint(game), r: ZOMBIE_RADIUS });
  game.zombiesToSpawn -= 1;
  game.spawnTimer = spawnIntervalForRound(game.round);
}

// A random point just outside the arena edge, far enough from the player to be fair.
function spawnPoint(game) {
  const { random, player } = game;
  const { width, height } = ARENA;
  const r = ZOMBIE_RADIUS;
  for (let attempt = 0; attempt < 10; attempt++) {
    const edge = Math.floor(random() * 4);
    const t = random();
    const point = [
      { x: t * width, y: -r },
      { x: t * width, y: height + r },
      { x: -r, y: t * height },
      { x: width + r, y: t * height },
    ][edge];
    if (distance(point, player) >= MIN_SPAWN_DISTANCE) return point;
  }
  // Unlucky random numbers: use the corner furthest from the player.
  return {
    x: player.x < width / 2 ? width + r : -r,
    y: player.y < height / 2 ? height + r : -r,
  };
}

function moveZombies(game, dt) {
  const speed = zombieSpeedForRound(game.round);
  for (const zombie of game.zombies) {
    const dx = game.player.x - zombie.x;
    const dy = game.player.y - zombie.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    zombie.x += (dx / length) * speed * dt;
    zombie.y += (dy / length) * speed * dt;
  }
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
