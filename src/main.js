// Browser layer: reads keyboard, mouse and controller, runs the game loop, and
// draws the game in 3D (third person) or top-down. All the rules live in game.js.

import { createGame, step, ARENA } from './game.js';
import { readGamepad } from './gamepad.js';
import { moveFromInput, cameraPosition, aimPoint } from './camera.js';
import { createView3D } from './view3d.js';

const STEP = 1 / 60;
const MAX_CATCH_UP = 0.25;
const BEST_KEY = 'zombie-arena-best-round';
const CONTROLLER_AIM_ASSIST = 0.05; // 5%: turn this up if aim assist feels too weak
const MOUSE_TURN = 0.0025; // radians per pixel of mouse movement
const STICK_TURN = 3; // radians per second with the right stick fully pushed

const stage = document.getElementById('stage');
const canvas = document.getElementById('game'); // top-down view, or the HUD over the 3D view
const ctx = canvas.getContext('2d');
const SCREEN = { width: canvas.width, height: canvas.height }; // HUD coordinates (the map is bigger)
const view3d = createView3D(document.getElementById('view3d'));

const input = { up: false, down: false, left: false, right: false, mouseX: 0, mouseY: 0, firing: false };
const keyMap = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Space: 'jumpKey' };

// A map seed in the address (?seed=123) replays that map; otherwise every game gets a new one.
const urlSeed = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
const newGame = () => createGame({ seed: Number.isNaN(urlSeed) ? undefined : urlSeed });

let game = newGame();
let best = loadBest();
let view = '3d'; // '3d' (third person) or '2d' (top-down)
let yaw = 0; // which way you face in 3D: 0 is +x on the map
let camera = cameraPosition(game.player, yaw, []);

// --- Views ---

function setView(next) {
  view = next;
  stage.classList.toggle('top-down', view === '2d');
  if (view === '2d' && document.pointerLockElement) document.exitPointerLock();
}
setView('3d');

function fitToWindow() {
  const rect = stage.getBoundingClientRect();
  view3d.resize(rect.width, rect.height);
}
window.addEventListener('resize', fitToWindow);
fitToWindow();

// Building walls block the camera; crates, cars and the low wall are below it.
let tallWallsFor = null;
let tallWalls = [];
function buildingWalls() {
  if (tallWallsFor !== game.obstacles) {
    const buildings = game.pieces.filter((p) => p.doorways);
    const inside = (p, r) => r.x >= p.x && r.y >= p.y && r.x + r.w <= p.x + p.w && r.y + r.h <= p.y + p.h;
    tallWalls = game.obstacles.filter((o) => game.pieces.length === 0 || buildings.some((b) => inside(b, o)));
    tallWallsFor = game.obstacles;
  }
  return tallWalls;
}

// --- Input: keyboard and mouse ---

const mouse = { x: 0, y: 0, firing: false };
let aimWith = 'mouse'; // whichever was used last: 'mouse' or 'controller'
let controllerAim = { x: 1, y: 0 }; // last right-stick direction (top-down view)
let viewButtonWasDown = false;
const mouseCaptured = () => document.pointerLockElement === canvas;

window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyR' && game.phase === 'gameOver') game = newGame();
  if (e.code === 'KeyV' && !e.repeat) setView(view === '3d' ? '2d' : '3d');
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
});
canvas.addEventListener('mousemove', (e) => {
  if (view === '3d') {
    if (!mouseCaptured()) return;
    yaw += e.movementX * MOUSE_TURN;
  } else {
    // The canvas may be drawn smaller or bigger than 800x600, so scale back to game units.
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * ARENA.width;
    mouse.y = ((e.clientY - rect.top) / rect.height) * ARENA.height;
  }
  aimWith = 'mouse';
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (view === '3d' && !mouseCaptured()) {
    canvas.requestPointerLock(); // the first click captures the mouse instead of firing
    return;
  }
  mouse.firing = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.firing = false;
});
window.addEventListener('blur', () => {
  for (const key of Object.values(keyMap)) input[key] = false;
  mouse.firing = false;
});

// --- Input: combined every frame into what the rules understand ---

function readInput(dt) {
  const keyX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const keyY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  let stick = { x: 0, y: 0 };
  let controllerFiring = false;
  let controllerJump = false;

  const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
  if (pad) {
    const controller = readGamepad(pad);
    if (controller.active) aimWith = 'controller';
    stick = controller.move;
    if (controller.aim) controllerAim = controller.aim;
    if (view === '3d') yaw += controller.look.x * STICK_TURN * dt;
    controllerFiring = controller.firing;
    controllerJump = controller.jump;
    if (controller.restart && game.phase === 'gameOver') game = newGame();
    if (controller.switchView && !viewButtonWasDown) setView(view === '3d' ? '2d' : '3d');
    viewButtonWasDown = controller.switchView;
  }

  input.firing = mouse.firing || controllerFiring;
  input.jump = input.jumpKey || controllerJump;
  input.aimAssist = aimWith === 'controller' ? CONTROLLER_AIM_ASSIST : 0;

  if (view === '3d') {
    // Forward is wherever you're facing; the rules aim at a point out past the crosshair.
    Object.assign(input, moveFromInput(-keyY - stick.y, keyX + stick.x, yaw));
    camera = cameraPosition(game.player, yaw, buildingWalls());
    const target = aimPoint(camera, yaw);
    input.mouseX = target.x;
    input.mouseY = target.y;
  } else {
    input.moveX = keyX + stick.x;
    input.moveY = keyY + stick.y;
    if (aimWith === 'controller') {
      // The rules aim at a point, so aim 100 px out in the stick's direction.
      input.mouseX = game.player.x + controllerAim.x * 100;
      input.mouseY = game.player.y + controllerAim.y * 100;
    } else {
      input.mouseX = mouse.x;
      input.mouseY = mouse.y;
    }
  }
}

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
  const dt = Math.min((now - last) / 1000, MAX_CATCH_UP);
  leftover += dt;
  last = now;
  readInput(dt);
  while (leftover >= STEP) {
    game = step(game, input, STEP);
    leftover -= STEP;
  }
  camera = cameraPosition(game.player, yaw, buildingWalls());
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
  ctx.scale(1 + player.z / 120, 1 + player.z / 120); // look bigger (closer) while jumping
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

// --- Map ---

const FLOOR = { house: '#4a3b2c', shed: '#38452f' };
const CAR_COLOURS = ['#a4262c', '#2d5d9f', '#c9c9c9', '#3f3f3f'];

function contains(piece, rect) {
  return rect.x >= piece.x && rect.y >= piece.y && rect.x + rect.w <= piece.x + piece.w && rect.y + rect.h <= piece.y + piece.h;
}

function drawMap() {
  // Floors inside buildings
  for (const piece of game.pieces) {
    if (FLOOR[piece.kind]) {
      ctx.fillStyle = FLOOR[piece.kind];
      ctx.fillRect(piece.x, piece.y, piece.w, piece.h);
    }
  }
  // Building walls (and hand-placed obstacles, which belong to no piece)
  for (const wall of game.obstacles) {
    const owner = game.pieces.find((p) => contains(p, wall));
    if (owner && !FLOOR[owner.kind]) continue;
    ctx.fillStyle = '#8f8678';
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeStyle = '#5c554b';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
  }
  game.pieces.forEach((piece, i) => {
    if (piece.kind === 'car') drawCar(piece, CAR_COLOURS[(game.seed + i) % CAR_COLOURS.length]);
    if (piece.kind === 'crate') drawCrate(piece);
    if (piece.kind === 'lowWall') drawLowWall(piece);
  });
}

function drawCar(car, colour) {
  const horizontal = car.w > car.h;
  ctx.save();
  ctx.translate(car.x + car.w / 2, car.y + car.h / 2);
  if (!horizontal) ctx.rotate(Math.PI / 2);
  const length = Math.max(car.w, car.h);
  const width = Math.min(car.w, car.h);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(-length / 2 + 2, -width / 2 + 3, length, width);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(-length / 2, -width / 2, length, width, 8);
  ctx.fill();
  ctx.fillStyle = '#1d2733'; // windscreen and back window
  ctx.fillRect(length * 0.12, -width / 2 + 5, 9, width - 10);
  ctx.fillRect(-length * 0.32, -width / 2 + 6, 7, width - 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // roof
  ctx.fillRect(-length * 0.22, -width / 2 + 6, length * 0.32, width - 12);
  ctx.restore();
}

function drawCrate(crate) {
  ctx.fillStyle = '#9c6b30';
  ctx.fillRect(crate.x, crate.y, crate.w, crate.h);
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 3;
  ctx.strokeRect(crate.x + 1.5, crate.y + 1.5, crate.w - 3, crate.h - 3);
  ctx.beginPath();
  ctx.moveTo(crate.x + 3, crate.y + 3);
  ctx.lineTo(crate.x + crate.w - 3, crate.y + crate.h - 3);
  ctx.moveTo(crate.x + crate.w - 3, crate.y + 3);
  ctx.lineTo(crate.x + 3, crate.y + crate.h - 3);
  ctx.stroke();
}

function drawLowWall(wall) {
  ctx.fillStyle = '#6e6e6e';
  ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
  ctx.strokeStyle = '#4d4d4d';
  ctx.lineWidth = 1.5;
  const horizontal = wall.w > wall.h;
  for (let i = 20; i < Math.max(wall.w, wall.h); i += 20) {
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(wall.x + i, wall.y);
      ctx.lineTo(wall.x + i, wall.y + wall.h);
    } else {
      ctx.moveTo(wall.x, wall.y + i);
      ctx.lineTo(wall.x + wall.w, wall.y + i);
    }
    ctx.stroke();
  }
  ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
}

function drawBullet(bullet) {
  const tail = 0.02; // tracer length, in seconds of travel
  limb(bullet.x - bullet.vx * tail, bullet.y - bullet.vy * tail, bullet.x, bullet.y, 3, '#ffd23f');
}

function centredText(text, y, size, colour) {
  ctx.fillStyle = colour;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, SCREEN.width / 2, y);
}

function draw() {
  ctx.clearRect(0, 0, SCREEN.width, SCREEN.height);

  if (view === '3d') {
    view3d.render(game, { yaw, camera });
    drawCrosshair();
    if (!mouseCaptured() && aimWith === 'mouse' && game.phase !== 'gameOver') {
      centredText('Click to look around with the mouse (Esc to let go)', SCREEN.height - 60, 18, '#eee');
    }
  } else {
    // Shrink the whole map to fit the screen.
    ctx.save();
    ctx.scale(SCREEN.width / ARENA.width, SCREEN.height / ARENA.height);
    drawMap();
    for (const bullet of game.bullets) drawBullet(bullet);
    for (const zombie of game.zombies) drawZombie(zombie);
    drawPlayer(game.player);
    ctx.restore();
  }
  drawHud();
}

function drawCrosshair() {
  const cx = SCREEN.width / 2;
  const cy = SCREEN.height / 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(cx + dx * 4, cy + dy * 4);
    ctx.lineTo(cx + dx * 11, cy + dy * 11);
  }
  ctx.stroke();
}

function drawHud() {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#ddd';
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Round ${game.round}`, 12, 24);
  ctx.fillText(`Zombies left: ${game.zombiesToSpawn + game.zombies.length}`, 12, 46);
  ctx.textAlign = 'right';
  ctx.fillText(`Best: ${Math.max(best, game.round)}`, SCREEN.width - 12, 24);
  if (game.seed !== null) {
    ctx.fillStyle = '#888';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Map seed: ${game.seed}`, SCREEN.width - 12, SCREEN.height - 12);
  }

  if (game.phase === 'roundBreak') {
    centredText(`ROUND ${game.round}`, SCREEN.height / 2, 72, '#b5001b');
  }
  if (game.phase === 'gameOver') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);
    centredText('GAME OVER', SCREEN.height / 2 - 30, 64, '#e5383b');
    centredText(`You reached round ${game.round}`, SCREEN.height / 2 + 20, 24, '#ddd');
    centredText('Press R (or A / ✕) to restart', SCREEN.height / 2 + 60, 20, '#aaa');
  }
  ctx.shadowBlur = 0;
}
