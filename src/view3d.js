// 3D view of the game, drawn with Three.js. Browser-only, and only draws:
// the rules in game.js decide everything.
// See .scratch/third-person-3d/spec.md.
//
// The game runs on a flat map with x and y. In 3D, map x stays x, map y
// becomes z, and 3D y is height.

import * as THREE from 'three';
import { CAMERA_HEIGHT } from './camera.js';
import { ARENA } from './map.js';

const WALL_HEIGHT = 96;
const LOW_WALL_HEIGHT = 36;
const BULLET_HEIGHT = 34; // below crate and low-wall tops, so bullets visibly hit them
const CHARACTER_SCALE = 0.75;
const LOOK_HEIGHT = 42; // the camera looks ahead at about this height
const CAR_COLOURS = [0xa4262c, 0x2d5d9f, 0xc9c9c9, 0x3f3f3f];
const FLOOR_COLOURS = { house: 0x4a3b2c, shed: 0x38452f };
const SKY = 0x4a5a72; // early-evening blue

const materials = new Map();
function material(colour, glow = false) {
  const key = `${colour}-${glow}`;
  if (!materials.has(key)) {
    materials.set(key, glow ? new THREE.MeshBasicMaterial({ color: colour }) : new THREE.MeshLambertMaterial({ color: colour }));
  }
  return materials.get(key);
}

// A box whose centre is at (x, y, z).
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? material(mat) : mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A map angle (0 = facing +x, PI/2 = facing +y) as a 3D turn around the up axis.
function turnTo(object, angle) {
  object.rotation.y = -angle;
}

export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 400, 1400);

  const camera = new THREE.PerspectiveCamera(65, 4 / 3, 1, 3000);

  // Dusk lighting: soft sky light plus a low sun that casts shadows. The sun
  // follows the player, so shadows stay sharp near you on the big map.
  scene.add(new THREE.HemisphereLight(0xb8c8e8, 0x5a5444, 3.2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.6)); // lifts the shady sides of walls
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
  const SUN_OFFSET = new THREE.Vector3(400, 700, -400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 10, far: 2500 });
  scene.add(sun, sun.target);

  // Ground: grass stretching into the fog, with the dirt arena on top.
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), material(0x3a4a2e));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(ARENA.width / 2, -0.5, ARENA.height / 2);
  grass.receiveShadow = true;
  const arena = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.width, ARENA.height), material(0x6a604c));
  arena.rotation.x = -Math.PI / 2;
  arena.position.set(ARENA.width / 2, 0, ARENA.height / 2);
  arena.receiveShadow = true;
  scene.add(grass, arena);

  let mapGroup = null;
  let mapFor = null;
  const player = makePerson(false);
  scene.add(player.group);
  const zombies = [];
  const bullets = [];
  let playerStride = 0;
  let lastPlayer = null;

  function render(game, view) {
    if (mapFor !== game.obstacles) {
      if (mapGroup) scene.remove(mapGroup);
      mapGroup = buildMap(game);
      scene.add(mapGroup);
      mapFor = game.obstacles;
    }

    // Player: faces the camera direction; legs move with distance walked.
    if (lastPlayer) playerStride += Math.hypot(game.player.x - lastPlayer.x, game.player.y - lastPlayer.y) * 0.08;
    lastPlayer = { x: game.player.x, y: game.player.y };
    player.group.position.set(game.player.x, game.player.z, game.player.y);
    sun.target.position.set(game.player.x, 0, game.player.y);
    sun.position.copy(sun.target.position).add(SUN_OFFSET);
    turnTo(player.group, view.yaw);
    walk(player, playerStride);

    // Zombies: reuse meshes, adding more when a round needs them.
    while (zombies.length < game.zombies.length) {
      const zombie = makePerson(true);
      zombies.push(zombie);
      scene.add(zombie.group);
    }
    zombies.forEach((mesh, i) => {
      const zombie = game.zombies[i];
      mesh.group.visible = Boolean(zombie);
      if (!zombie) return;
      mesh.group.position.set(zombie.x, 0, zombie.y);
      turnTo(mesh.group, Math.atan2(game.player.y - zombie.y, game.player.x - zombie.x));
      walk(mesh, (zombie.x + zombie.y) * 0.08);
    });

    // Bullets: short glowing tracers pointing along their flight.
    while (bullets.length < game.bullets.length) {
      const tracer = box(18, 2, 2, material(0xffd23f, true));
      tracer.castShadow = false;
      bullets.push(tracer);
      scene.add(tracer);
    }
    bullets.forEach((tracer, i) => {
      const bullet = game.bullets[i];
      tracer.visible = Boolean(bullet);
      if (!bullet) return;
      const angle = Math.atan2(bullet.vy, bullet.vx);
      tracer.position.set(bullet.x - Math.cos(angle) * 9, BULLET_HEIGHT, bullet.y - Math.sin(angle) * 9);
      turnTo(tracer, angle);
    });

    // Camera: over the shoulder, looking along the facing direction, tilted slightly down.
    camera.position.set(view.camera.x, CAMERA_HEIGHT, view.camera.y);
    camera.lookAt(view.camera.x + Math.cos(view.yaw) * 300, LOOK_HEIGHT, view.camera.y + Math.sin(view.yaw) * 300);

    renderer.render(scene, camera);
  }

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return { render, resize };
}

// --- Map ---

function buildMap(game) {
  const group = new THREE.Group();
  const inside = (piece, r) => r.x >= piece.x && r.y >= piece.y && r.x + r.w <= piece.x + piece.w && r.y + r.h <= piece.y + piece.h;

  game.pieces.forEach((piece, i) => {
    if (FLOOR_COLOURS[piece.kind]) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(piece.w, piece.h), material(FLOOR_COLOURS[piece.kind]));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(piece.x + piece.w / 2, 0.5, piece.y + piece.h / 2);
      floor.receiveShadow = true;
      group.add(floor);
    }
    if (piece.kind === 'car') group.add(makeCar(piece, CAR_COLOURS[(game.seed + i) % CAR_COLOURS.length]));
    if (piece.kind === 'crate') group.add(box(piece.w, 40, piece.h, crateMaterial(), piece.x + piece.w / 2, 20, piece.y + piece.h / 2));
    if (piece.kind === 'lowWall') {
      group.add(box(piece.w, LOW_WALL_HEIGHT, piece.h, 0x6e6e6e, piece.x + piece.w / 2, LOW_WALL_HEIGHT / 2, piece.y + piece.h / 2));
    }
  });

  // Building walls, plus any obstacle that isn't part of a piece.
  for (const wall of game.obstacles) {
    const owner = game.pieces.find((p) => inside(p, wall));
    if (owner && !FLOOR_COLOURS[owner.kind]) continue;
    group.add(box(wall.w, WALL_HEIGHT, wall.h, 0x8f8678, wall.x + wall.w / 2, WALL_HEIGHT / 2, wall.y + wall.h / 2));
  }
  return group;
}

function makeCar(piece, colour) {
  const length = Math.max(piece.w, piece.h);
  const width = Math.min(piece.w, piece.h);
  const car = new THREE.Group();
  car.add(box(length, 24, width, colour, 0, 20, 0)); // body
  car.add(box(length * 0.55, 20, width * 0.9, 0x1d2733, -length * 0.05, 42, 0)); // cabin windows
  car.add(box(length * 0.5, 3, width * 0.86, colour, -length * 0.05, 53, 0)); // roof
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 6, 14), material(0x111111));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x * length * 0.32, 9, z * (width / 2 - 2));
    car.add(wheel);
  }
  car.position.set(piece.x + piece.w / 2, 0, piece.y + piece.h / 2);
  if (piece.h > piece.w) car.rotation.y = Math.PI / 2;
  return car;
}

let crate = null;
function crateMaterial() {
  if (crate) return crate;
  const art = document.createElement('canvas');
  art.width = art.height = 64;
  const g = art.getContext('2d');
  g.fillStyle = '#9c6b30';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#6b4520';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 58, 58);
  g.beginPath();
  g.moveTo(6, 6);
  g.lineTo(58, 58);
  g.moveTo(58, 6);
  g.lineTo(6, 58);
  g.stroke();
  const texture = new THREE.CanvasTexture(art);
  texture.colorSpace = THREE.SRGBColorSpace;
  crate = new THREE.MeshLambertMaterial({ map: texture });
  return crate;
}

// --- Characters ---
// Built facing +x, about 76 tall. Legs and arms hang from pivots so they can swing.

function makePerson(isZombie) {
  const skin = isZombie ? 0x86b26f : 0xe0ac69;
  const shirt = isZombie ? 0x6b5d45 : 0x3a86ff;
  const trousers = isZombie ? 0x3b3b52 : 0x23395d;
  const group = new THREE.Group();

  const limb = (x, y, z, w, h, colour) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.add(box(w, h, w, colour, 0, -h / 2, 0));
    group.add(pivot);
    return pivot;
  };
  const legL = limb(0, 30, -5, 8, 30, trousers);
  const legR = limb(0, 30, 5, 8, 30, trousers);
  group.add(box(12, 30, 22, shirt, 0, 45, 0)); // body
  group.add(box(15, 15, 15, skin, 0, 68.5, 0)); // head
  const armL = limb(0, 57, -14, 7, 24, isZombie ? skin : shirt);
  const armR = limb(0, 57, 14, 7, 24, isZombie ? skin : shirt);

  if (isZombie) {
    group.add(box(13, 8, 9, 0x4e8040, 0.5, 38, 7)); // torn patch
    group.add(box(13, 6, 6, 0x7a2222, 0.5, 52, -6)); // bloodstain
    for (const z of [-3.5, 3.5]) group.add(box(1, 2.5, 2.5, material(0xff2a2a, true), 7.8, 70, z)); // red eyes
    armL.rotation.z = armR.rotation.z = Math.PI / 2; // arms reaching forward
  } else {
    group.add(box(16, 4, 16, 0x4a2f1b, -0.5, 77.5, 0)); // hair
    group.add(box(4, 10, 16, 0x4a2f1b, -6.5, 71, 0)); // back of the hair
    // Both arms swing forward, then turn inward to hold the gun.
    armL.rotation.set(0, -0.45, 1.45, 'YZX');
    armR.rotation.set(0, 0.35, 1.5, 'YZX');
    group.add(box(26, 6, 5, 0x2b2b2b, 22, 52, 4)); // gun
  }
  group.scale.setScalar(CHARACTER_SCALE);
  return { group, legL, legR, armL, armR, isZombie };
}

// Swings legs (and zombie arms) based on how far the character has moved.
function walk(person, stride) {
  const swing = Math.sin(stride) * 0.6;
  person.legL.rotation.z = swing;
  person.legR.rotation.z = -swing;
  if (person.isZombie) {
    person.armL.rotation.z = Math.PI / 2 + Math.sin(stride) * 0.15;
    person.armR.rotation.z = Math.PI / 2 - Math.sin(stride) * 0.15;
  }
}
