// Browser layer: reads keyboard and mouse, runs the game loop, draws the game.
// All the rules live in game.js.

import { createGame, step, ARENA } from './game.js';

const STEP = 1 / 60;
const MAX_CATCH_UP = 0.25;
const BEST_KEY = 'zombie-arena-best-round';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const input = { up: false, down: false, left: false, right: false, mouseX: 0, mouseY: 0, firing: false };
const keyMap = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };

let game = createGame();
let best = loadBest();

// --- Input ---

window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = true;
  if (e.code === 'KeyR' && game.phase === 'gameOver') game = createGame();
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
});
canvas.addEventListener('mousemove', (e) => {
  // The canvas may be drawn smaller than 800x600, so scale back to game units.
  const rect = canvas.getBoundingClientRect();
  input.mouseX = ((e.clientX - rect.left) / rect.width) * ARENA.width;
  input.mouseY = ((e.clientY - rect.top) / rect.height) * ARENA.height;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) input.firing = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.firing = false;
});
window.addEventListener('blur', () => {
  for (const key of Object.keys(input)) if (typeof input[key] === 'boolean') input[key] = false;
});

// --- Best round (saved in the browser) ---

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(round) {
  try {
    localStorage.setItem(BEST_KEY, String(round));
  } catch {
    // Storage blocked: the best round just won't be remembered.
  }
}

// --- Game loop: fixed 1/60 s steps, never catching up more than 0.25 s ---

let last = performance.now();
let leftover = 0;

function frame(now) {
  leftover += Math.min((now - last) / 1000, MAX_CATCH_UP);
  last = now;
  while (leftover >= STEP) {
    game = step(game, input, STEP);
    leftover -= STEP;
  }
  if (game.phase === 'gameOver' && game.round > best) {
    best = game.round;
    saveBest(best);
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Drawing ---
// Characters are drawn top-down, facing right (+x), then rotated into place.
// The rules only use their hitbox circles, so the drawings can't change gameplay.

function ellipse(x, y, rx, ry, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function limb(x1, y1, x2, y2, width, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawPlayer(player) {
  const facing = Math.atan2(input.mouseY - player.y, input.mouseX - player.x);
  ctx.save();
  ctx.translate(player.x, player.y);
  ellipse(1, 2, 13, 13, 'rgba(0, 0, 0, 0.35)'); // shadow
  ctx.rotate(facing);

  // Gun, then arms holding it
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(8, 1, 16, 4);
  limb(-1, 10, 11, 4, 4.5, '#2f6fd6');
  limb(-1, -10, 9, 1, 4.5, '#2f6fd6');
  ellipse(11, 4, 2.6, 2.6, '#e0ac69');
  ellipse(9, 1, 2.6, 2.6, '#e0ac69');

  ellipse(-1, 0, 7, 12, '#3a86ff'); // shoulders / shirt
  ellipse(0, 0, 6.5, 6.5, '#e0ac69'); // head
  ellipse(-2, 0, 5.5, 6.2, '#4a2f1b'); // hair on the back of the head
  ctx.restore();
}

function drawZombie(zombie) {
  const facing = Math.atan2(game.player.y - zombie.y, game.player.x - zombie.x);
  // Arms sway as the zombie moves, so the sway follows its position.
  const sway = Math.sin((zombie.x + zombie.y) * 0.08) * 3;
  ctx.save();
  ctx.translate(zombie.x, zombie.y);
  ellipse(1, 2, 13, 13, 'rgba(0, 0, 0, 0.35)'); // shadow
  ctx.rotate(facing);

  // Arms reaching out in front
  limb(0, 9, 17, 7 + sway, 4.5, '#6f9a5b');
  limb(0, -9, 17, -7 - sway, 4.5, '#6f9a5b');
  ellipse(17, 7 + sway, 2.8, 2.8, '#86b26f');
  ellipse(17, -7 - sway, 2.8, 2.8, '#86b26f');

  // Ragged shirt with a torn patch
  ellipse(-1, 0, 7, 12, '#6b5d45');
  ellipse(-2, 5, 3, 3.5, '#4e8040');
  ellipse(1, -6, 2, 2.5, '#7a2222');

  // Head with blotches and red eyes
  ellipse(0, 0, 6.5, 6.5, '#86b26f');
  ellipse(-2, -2, 2, 1.5, '#5d8a4c');
  ellipse(-1, 3, 1.5, 1.2, '#5d8a4c');
  ellipse(4.5, 2.5, 1.4, 1.4, '#ff2a2a');
  ellipse(4.5, -2.5, 1.4, 1.4, '#ff2a2a');
  ctx.restore();
}

function drawBullet(bullet) {
  const tail = 0.02; // tracer length, in seconds of travel
  limb(bullet.x - bullet.vx * tail, bullet.y - bullet.vy * tail, bullet.x, bullet.y, 3, '#ffd23f');
}

function centredText(text, y, size, colour) {
  ctx.fillStyle = colour;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, ARENA.width / 2, y);
}

function draw() {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);

  for (const bullet of game.bullets) drawBullet(bullet);
  for (const zombie of game.zombies) drawZombie(zombie);
  drawPlayer(game.player);

  // HUD
  ctx.fillStyle = '#ddd';
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Round ${game.round}`, 12, 24);
  ctx.fillText(`Zombies left: ${game.zombiesToSpawn + game.zombies.length}`, 12, 46);
  ctx.textAlign = 'right';
  ctx.fillText(`Best: ${Math.max(best, game.round)}`, ARENA.width - 12, 24);

  if (game.phase === 'roundBreak') {
    centredText(`ROUND ${game.round}`, ARENA.height / 2, 72, '#b5001b');
  }
  if (game.phase === 'gameOver') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    centredText('GAME OVER', ARENA.height / 2 - 30, 64, '#e5383b');
    centredText(`You reached round ${game.round}`, ARENA.height / 2 + 20, 24, '#ddd');
    centredText('Press R to restart', ARENA.height / 2 + 60, 20, '#aaa');
  }
}
