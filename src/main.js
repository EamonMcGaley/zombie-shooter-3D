// Browser layer: menus, keyboard, mouse and controller, the game loop, and
// drawing in 3D (third person) or top-down. All the rules live in game.js.

import { createGame, step, ARENA } from './game.js';
import { readGamepad, menuDirections } from './gamepad.js';
import { moveFromInput, cameraPosition, aimPoint, CAMERA_HEIGHT } from './camera.js';
import { createView3D } from './view3d.js';
import { CHARACTERS } from './characters.js';
import { createMenus } from './menus.js';
import { brightnessForRound, fadeTowards } from './lighting.js';
import { isTouchDevice, createTouchControls } from './touchControls.js';
import { lookTurn } from './touch.js';

const STEP = 1 / 60;
const MAX_CATCH_UP = 0.25;
const BEST_KEY = 'zombie-arena-best-round';
const SETTINGS_KEY = 'zombie-arena-settings';
const CHOICE_KEY = 'zombie-arena-choice';
const CONTROLLER_AIM_ASSIST = 0.05; // 5%: turn this up if aim assist feels too weak
const MOUSE_TURN = 0.0025; // radians per pixel of mouse movement, at 1.0x sensitivity
const STICK_TURN = 3; // radians per second with the right stick fully pushed, at 1.0x

const MAP_CHOICES = [
  { key: 'random', label: 'Random', blurb: 'One of the three, picked for you' },
  { key: 'avenue', label: 'Atomic Avenue', blurb: 'Two houses, a bus, back yards' },
  { key: 'yard', label: 'Container Yard', blurb: 'Tiny yard of containers' },
  { key: 'bunker', label: 'The Bunker', blurb: 'The bunker' },
  { key: 'generated', label: 'Random layout', blurb: 'A new generated map' },
];

const stage = document.getElementById('stage');
const canvas = document.getElementById('game'); // top-down view, or the HUD over the 3D view
const ctx = canvas.getContext('2d');
// HUD coordinates: always 600 tall, and as wide as the window's shape needs.
const SCREEN = { width: canvas.width, height: canvas.height };
// How the top-down view fits the map on screen: one scale for both directions
// (so the map keeps its shape), centred.
const topDown = { scale: 1, x: 0, y: 0 };
const onTouchDevice = isTouchDevice();
// Phones get lighter graphics (no shadows, lower resolution) so they run smoothly.
const view3d = createView3D(document.getElementById('view3d'), { light: onTouchDevice });

const input = { up: false, down: false, left: false, right: false, mouseX: 0, mouseY: 0, firing: false };
const keyMap = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Space: 'jumpKey' };

// --- Saved choices and settings ---

function load(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key)) };
  } catch {
    return { ...fallback };
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: it just won't be remembered.
  }
}

const settings = load(SETTINGS_KEY, { mouse: 1, stick: 1, touch: 1 });
const choice = load(CHOICE_KEY, { character: 0, map: 0 });
let best = loadBest();

// Older versions saved the best round as a plain number; newer ones as { round }.
function loadBest() {
  try {
    const saved = JSON.parse(localStorage.getItem(BEST_KEY));
    return typeof saved === 'number' ? saved : Number(saved?.round) || 0;
  } catch {
    return 0;
  }
}

// The address can pick a map: ?map=yard, or ?seed=123 for a generated layout.
const params = new URLSearchParams(location.search);
const urlSeed = Number.parseInt(params.get('seed'), 10);
const urlMap = MAP_CHOICES.findIndex((m) => m.key === params.get('map'));
if (urlMap >= 0) choice.map = urlMap;

const character = () => CHARACTERS[choice.character] ?? CHARACTERS[0];

function newGame() {
  const options = { map: MAP_CHOICES[choice.map]?.key ?? 'random', weapon: character().weapon };
  if (!Number.isNaN(urlSeed)) options.seed = urlSeed;
  return createGame(options);
}

// --- Game state ---

let screen = 'menu'; // 'menu' (start screen) | 'playing' | 'paused'
let game = newGame();
let view = '3d'; // '3d' (third person) or '2d' (top-down)
let yaw = 0; // which way you face in 3D: 0 is +x on the map
let camera = cameraPosition(game.player, yaw, []);
let brightness = 1;
let targetBrightness = 1;
let lightingRound = 0; // the round the current target brightness was picked for
view3d.setCharacter(character());

function startGame() {
  if (onTouchDevice) goFullscreen();
  game = newGame();
  yaw = 0;
  lightingRound = 0;
  screen = 'playing';
  menus.hide();
  if (view === '3d' && aimWith === 'mouse') canvas.requestPointerLock();
}

// Fill the screen and stay sideways, where the phone allows it (iPhones don't).
function goFullscreen() {
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.()
    .then(() => window.screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

function pauseGame() {
  if (screen !== 'playing' || game.phase === 'gameOver') return;
  screen = 'paused';
  mouse.firing = false;
  if (document.pointerLockElement) document.exitPointerLock();
  menus.showPause();
}

function resumeGame() {
  screen = 'playing';
  menus.hide();
  if (view === '3d' && aimWith === 'mouse') canvas.requestPointerLock();
}

function quitToMenu() {
  screen = 'menu';
  if (document.pointerLockElement) document.exitPointerLock();
  game = newGame(); // the chosen map, shown behind the start screen
  menus.showStart();
}

const menus = createMenus({
  characters: CHARACTERS,
  maps: MAP_CHOICES,
  choice,
  settings,
  onChoice() {
    save(CHOICE_KEY, choice);
    view3d.setCharacter(character());
    game = newGame(); // preview the chosen map behind the menu
  },
  onPlay: startGame,
  onResume: resumeGame,
  onQuit: quitToMenu,
  onSettings: () => save(SETTINGS_KEY, settings),
});
menus.showStart();

// --- Views ---

let leavingPointerLockOnPurpose = false;

function setView(next) {
  view = next;
  stage.classList.toggle('top-down', view === '2d');
  if (view === '2d' && document.pointerLockElement) {
    leavingPointerLockOnPurpose = true;
    document.exitPointerLock();
  }
}
setView('3d');

function fitToWindow() {
  const rect = stage.getBoundingClientRect();
  view3d.resize(rect.width, rect.height);
  SCREEN.height = 600;
  SCREEN.width = Math.round((600 * rect.width) / rect.height);
  canvas.width = SCREEN.width;
  canvas.height = SCREEN.height;
  topDown.scale = Math.min(SCREEN.width / ARENA.width, SCREEN.height / ARENA.height);
  topDown.x = (SCREEN.width - ARENA.width * topDown.scale) / 2;
  topDown.y = (SCREEN.height - ARENA.height * topDown.scale) / 2;
}
window.addEventListener('resize', fitToWindow);
fitToWindow();

// Anything taller than the camera blocks it (walls, containers); cars, crates,
// fences and the bus are below it.
let tallWallsFor = null;
let tallWalls = [];
function cameraBlockers() {
  if (tallWallsFor !== game.obstacles) {
    tallWalls = game.obstacles.filter((o) => (o.height ?? Infinity) > CAMERA_HEIGHT);
    tallWallsFor = game.obstacles;
  }
  return tallWalls;
}

// --- Input: keyboard and mouse ---

const mouse = { x: 0, y: 0, firing: false };
let aimWith = onTouchDevice ? 'touch' : 'mouse'; // whichever was used last: 'mouse', 'controller' or 'touch'
let controllerAim = { x: 1, y: 0 }; // last right-stick direction (top-down view)
const mouseCaptured = () => document.pointerLockElement === canvas;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (menus.isOpen()) {
    const arrows = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (arrows[e.code]) menus.navigate(arrows[e.code]);
    if (e.code === 'Enter') menus.confirm();
    if (e.code === 'Backspace') menus.back();
    if (e.code === 'KeyP' && screen === 'paused') resumeGame();
    return;
  }
  if (keyMap[e.code]) input[keyMap[e.code]] = true;
  if (e.code === 'KeyP') pauseGame();
  if (e.code === 'KeyR' && game.phase === 'gameOver') startGame();
  if (e.code === 'KeyM' && game.phase === 'gameOver') quitToMenu();
  if (e.code === 'KeyV' && !e.repeat) setView(view === '3d' ? '2d' : '3d');
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
});
canvas.addEventListener('mousemove', (e) => {
  if (view === '3d') {
    if (!mouseCaptured()) return;
    yaw += e.movementX * MOUSE_TURN * settings.mouse;
  } else {
    // Turn the mouse's screen position back into map units (undoing the top-down fit).
    const rect = canvas.getBoundingClientRect();
    mouse.x = (((e.clientX - rect.left) / rect.width) * SCREEN.width - topDown.x) / topDown.scale;
    mouse.y = (((e.clientY - rect.top) / rect.height) * SCREEN.height - topDown.y) / topDown.scale;
  }
  aimWith = 'mouse';
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || screen !== 'playing') return;
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
// Esc lets go of the mouse in 3D; treat that as pausing, like most PC shooters.
document.addEventListener('pointerlockchange', () => {
  if (mouseCaptured()) return;
  if (leavingPointerLockOnPurpose) {
    leavingPointerLockOnPurpose = false;
    return;
  }
  if (view === '3d') pauseGame();
});

// --- Input: controller ---

let padBefore = {}; // last frame's buttons, so a press only counts once

function readController() {
  const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
  if (!pad) return null;
  const controller = readGamepad(pad);
  const now = {
    up: controller.dpad.up,
    down: controller.dpad.down,
    left: controller.dpad.left,
    right: controller.dpad.right,
    confirm: controller.confirm,
    back: controller.back,
    pause: controller.pause,
    menu: controller.menu,
    view: controller.switchView,
  };
  controller.pressed = Object.fromEntries(Object.entries(now).map(([k, down]) => [k, down && !padBefore[k]]));
  padBefore = now;
  return controller;
}

const menuMemory = {}; // lets held directions repeat in menus

// Left stick or D-pad moves (and repeats while held), A confirms, B goes back,
// Start resumes from pause or plays straight away from the start screen.
function menuControls(controller, dt) {
  if (!controller) return;
  for (const dir of menuDirections(controller, menuMemory, dt)) menus.navigate(dir);
  if (controller.pressed.confirm) menus.confirm();
  if (controller.pressed.back) menus.back();
  if (controller.pressed.pause && screen === 'paused') resumeGame();
  else if (controller.pressed.pause && screen === 'menu') startGame();
}

// Everything the player is pressing, combined into what the rules understand.
function readInput(dt, controller) {
  const keyX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const keyY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  let stick = { x: 0, y: 0 };
  let controllerFiring = false;
  let controllerJump = false;

  // Touch: the joystick works like a left stick, dragging turns the camera.
  if (touch) {
    const fingers = touch.read();
    if (fingers.move.x || fingers.move.y || fingers.firing || fingers.lookDx) aimWith = 'touch';
    stick = { x: fingers.move.x, y: fingers.move.y };
    yaw += lookTurn(fingers.lookDx, settings.touch);
    controllerFiring = fingers.firing;
    controllerJump = fingers.jump;
  }

  if (controller) {
    if (controller.active) aimWith = 'controller';
    if (controller.move.x || controller.move.y) stick = controller.move;
    if (controller.aim) controllerAim = controller.aim;
    if (view === '3d') yaw += controller.look.x * STICK_TURN * settings.stick * dt;
    controllerFiring ||= controller.firing;
    controllerJump ||= controller.jump;
    if (game.phase === 'gameOver') {
      if (controller.pressed.confirm || controller.pressed.pause) startGame();
      if (controller.pressed.menu) quitToMenu();
    } else if (controller.pressed.pause) {
      pauseGame();
    }
    if (controller.pressed.view) setView(view === '3d' ? '2d' : '3d');
  }

  input.firing = mouse.firing || controllerFiring;
  input.jump = input.jumpKey || controllerJump;
  input.aimAssist = aimWith === 'mouse' ? 0 : CONTROLLER_AIM_ASSIST; // controller and touch get help

  if (view === '3d') {
    // Forward is wherever you're facing; the rules aim at a point out past the crosshair.
    Object.assign(input, moveFromInput(-keyY - stick.y, keyX + stick.x, yaw));
    camera = cameraPosition(game.player, yaw, cameraBlockers());
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

const touch = onTouchDevice
  ? createTouchControls({ onPause: pauseGame, onPlayAgain: startGame, onMenu: quitToMenu })
  : null;

// While developing (npm run dev), automated tests can peek at the game state.
// This is left out of published builds.
if (import.meta.env.DEV) {
  window.zombieArena = {
    state: () => ({ touch: onTouchDevice, yaw, shots: game.shotsFired, steps: stepCount, realMs: Math.round(performance.now()), screen, view, mapName: game.mapName, weapon: game.weapon, phase: game.phase, round: game.round, breakTimer: game.breakTimer, zombies: game.zombies.length, player: { ...game.player } }),
    // Keeps the game in its round-break pause (moving and shooting still work), so
    // tests can try the controls without zombies arriving.
    holdRoundBreak: () => {
      game.breakTimer = Infinity;
    },
  };
}

// --- Game loop: fixed 1/60 s steps, never catching up more than 0.25 s ---

let last = performance.now();
let leftover = 0;
let stepCount = 0; // for the debug hook

function frame(now) {
  const dt = Math.min((now - last) / 1000, MAX_CATCH_UP);
  last = now;
  const controller = readController();
  touch?.update({ menuOpen: screen !== 'playing', gameOver: game.phase === 'gameOver' });

  if (screen === 'playing') {
    leftover += dt;
    readInput(dt, controller);
    while (leftover >= STEP) {
      game = step(game, input, STEP);
      stepCount++;
      leftover -= STEP;
    }
  } else {
    leftover = 0;
    menuControls(controller, dt);
    if (screen === 'menu') yaw += dt * 0.15; // slowly look around the map behind the start screen
  }
  camera = cameraPosition(game.player, yaw, cameraBlockers());

  // Each new round gets a random brightness (75% to 100%), faded in smoothly.
  if (game.round !== lightingRound) {
    lightingRound = game.round;
    targetBrightness = brightnessForRound();
  }
  brightness = fadeTowards(brightness, targetBrightness, dt);
  view3d.setBrightness(brightness);

  if (game.phase === 'gameOver' && game.round > best) {
    best = game.round;
    save(BEST_KEY, { round: best });
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

  const { colours, weapon } = character();
  const gunLength = { rifle: 16, shotgun: 18, smg: 11, sniper: 24 }[weapon];

  // Gun, then arms holding it
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(8, 1, gunLength, weapon === 'shotgun' ? 5 : 4);
  limb(-1, 10, 11, 4, 4.5, colours.shirt);
  limb(-1, -10, 9, 1, 4.5, colours.shirt);
  ellipse(11, 4, 2.6, 2.6, colours.skin);
  ellipse(9, 1, 2.6, 2.6, colours.skin);

  ellipse(-1, 0, 7, 12, colours.shirt); // shoulders / shirt
  ellipse(0, 0, 6.5, 6.5, colours.skin); // head
  ellipse(-2, 0, 5.5, 6.2, colours.hair); // hair on the back of the head
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

const WALL_COLOURS = { perimeter: '#5f6266', container: '#a4442c', bus: '#e8b923', fence: '#f2f2f2' };

function drawMap() {
  // Floors inside buildings
  for (const piece of game.pieces) {
    if (!piece.doorways) continue;
    ctx.fillStyle = FLOOR[piece.kind] ?? FLOOR.house;
    ctx.fillRect(piece.x, piece.y, piece.w, piece.h);
  }
  game.obstacles.forEach((o, i) => {
    if (o.kind === 'car') return drawCar(o, CAR_COLOURS[i % CAR_COLOURS.length]);
    if (o.kind === 'crate') return drawCrate(o);
    if (o.kind === 'lowWall') return drawLowWall(o);
    // Walls, containers, the bus and fences: a filled block with an outline.
    ctx.fillStyle = o.colour ?? WALL_COLOURS[o.kind] ?? '#8f8678';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
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
    // While playing, the character faces the aim point, so the gun lines up with the bullets.
    const facing = screen === 'playing' ? Math.atan2(input.mouseY - game.player.y, input.mouseX - game.player.x) : yaw;
    view3d.render(game, { yaw, camera, facing });
    if (screen === 'playing') drawCrosshair();
    if (!onTouchDevice && screen === 'playing' && !mouseCaptured() && aimWith === 'mouse' && game.phase !== 'gameOver') {
      centredText('Click to look around with the mouse (Esc to let go)', SCREEN.height - 60, 18, '#eee');
    }
  } else {
    // Shrink the whole map to fit the screen.
    ctx.save();
    ctx.translate(topDown.x, topDown.y);
    ctx.scale(topDown.scale, topDown.scale);
    drawMap();
    for (const bullet of game.bullets) drawBullet(bullet);
    for (const zombie of game.zombies) drawZombie(zombie);
    drawPlayer(game.player);
    ctx.restore();
    ctx.fillStyle = `rgba(0, 0, 0, ${(1 - brightness).toFixed(3)})`;
    ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);
  }
  if (screen !== 'menu') drawHud();
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
  // On touch screens the pause button sits in the top-right corner, so move left of it.
  ctx.fillText(`Best: ${Math.max(best, game.round)}`, SCREEN.width - (onTouchDevice ? 90 : 12), 24);
  ctx.fillStyle = '#bbb';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(game.mapName, SCREEN.width - 12, SCREEN.height - 12);
  ctx.textAlign = 'left';
  ctx.fillText(`${character().name} · ${character().weaponName}`, 12, SCREEN.height - 12);

  if (game.phase === 'roundBreak') {
    centredText(`ROUND ${game.round}`, SCREEN.height / 2, 72, '#b5001b');
  }
  if (game.phase === 'gameOver') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);
    centredText('GAME OVER', SCREEN.height / 2 - 30, 64, '#e5383b');
    centredText(`You reached round ${game.round}`, SCREEN.height / 2 + 20, 24, '#ddd');
    if (!onTouchDevice) centredText('R or A / ✕: play again    M or Y / △: change survivor or map', SCREEN.height / 2 + 60, 18, '#aaa');
  }
  ctx.shadowBlur = 0;
}
