// 3D view of the game, drawn with Three.js. Browser-only, and only draws:
// the rules in game.js decide everything.
// See .scratch/third-person-3d/spec.md.
//
// The game runs on a flat map with x and y. In 3D, map x stays x, map y
// becomes z, and 3D y is height.

import * as THREE from 'three';
import { CAMERA_HEIGHT } from './camera.js';
import { ARENA, HEIGHTS } from './map.js';

const CHARACTER_SCALE = 0.75;
const LOOK_HEIGHT = 42; // the camera looks ahead at about this height
const CAR_COLOURS = [0xa4262c, 0x2d5d9f, 0xc9c9c9, 0x3f3f3f];
const FLOOR_COLOURS = { house: 0x4a3b2c, shed: 0x38452f };
const WALL_COLOURS = { house: 0x8f8678, shed: 0x8f8678, wall: 0x8f8678, perimeter: 0x5f6266 };
const SKY = 0x4a5a72; // early-evening blue

const materials = new Map();
function material(colour, glow = false) {
  const key = `${colour}-${glow}`;
  if (!materials.has(key)) {
    materials.set(key, glow ? new THREE.MeshBasicMaterial({ color: colour }) : new THREE.MeshLambertMaterial({ color: colour }));
  }
  return materials.get(key);
}

// A box whose centre is at (x, y, z). `mat` is a material or a colour.
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat instanceof THREE.Material ? mat : material(mat));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A map angle (0 = facing +x, PI/2 = facing +y) as a 3D turn around the up axis.
function turnTo(object, angle) {
  object.rotation.y = -angle;
}

// light: true for phones: no shadows, no antialiasing, lower resolution.
export function createView3D(canvas, { light = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !light });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, light ? 1.25 : 2));
  renderer.shadowMap.enabled = !light;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 400, 1400);

  const camera = new THREE.PerspectiveCamera(65, 4 / 3, 1, 3000);

  // Dusk lighting: soft sky light plus a low sun that casts shadows. The sun
  // follows the player, so shadows stay sharp near you on the big map.
  const LIGHT = { sky: 3.2, ambient: 0.6, sun: 3.2 };
  const skyLight = new THREE.HemisphereLight(0xb8c8e8, 0x5a5444, LIGHT.sky);
  const ambient = new THREE.AmbientLight(0xffffff, LIGHT.ambient); // lifts the shady sides of walls
  scene.add(skyLight, ambient);
  const sun = new THREE.DirectionalLight(0xffe2b8, LIGHT.sun);
  const SUN_OFFSET = new THREE.Vector3(400, 700, -400);
  sun.castShadow = !light;
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
  let player = makePerson(null);
  scene.add(player.group);

  // Swaps the player's model for a survivor's look and gun.
  function setCharacter(character) {
    scene.remove(player.group);
    player = makePerson(character);
    scene.add(player.group);
  }

  // 1 is full brightness; 0.75 is the dimmest round.
  function setBrightness(b) {
    skyLight.intensity = LIGHT.sky * b;
    ambient.intensity = LIGHT.ambient * b;
    sun.intensity = LIGHT.sun * b;
    scene.background.setHex(SKY).multiplyScalar(b);
    scene.fog.color.copy(scene.background);
  }
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
    turnTo(player.group, view.facing ?? view.yaw); // the gun points where bullets go
    walk(player, playerStride);

    // Zombies: reuse meshes, adding more when a round needs them.
    while (zombies.length < game.zombies.length) {
      const zombie = makePerson('zombie');
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
      tracer.position.set(bullet.x - Math.cos(angle) * 9, bullet.z, bullet.y - Math.sin(angle) * 9); // at the height it was fired from
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

  return { render, resize, setCharacter, setBrightness };
}

// --- Map ---

function buildMap(game) {
  const group = new THREE.Group();

  // Floors inside buildings
  for (const piece of game.pieces) {
    if (!piece.doorways) continue;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(piece.w, piece.h), material(FLOOR_COLOURS[piece.kind] ?? FLOOR_COLOURS.house));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(piece.x + piece.w / 2, 0.5, piece.y + piece.h / 2);
    floor.receiveShadow = true;
    group.add(floor);
  }

  game.obstacles.forEach((o, i) => {
    const height = o.height ?? HEIGHTS.wall;
    const cx = o.x + o.w / 2;
    const cz = o.y + o.h / 2;
    if (o.kind === 'car') group.add(makeCar(o, CAR_COLOURS[i % CAR_COLOURS.length]));
    else if (o.kind === 'bus') group.add(makeBus(o));
    else if (o.kind === 'container') group.add(makeContainer(o));
    else if (o.kind === 'crate') group.add(box(o.w, height, o.h, crateMaterial(), cx, height / 2, cz));
    else if (o.kind === 'lowWall') group.add(box(o.w, height, o.h, 0x6e6e6e, cx, height / 2, cz));
    else if (o.kind === 'fence') group.add(makeFence(o));
    else group.add(box(o.w, height, o.h, o.colour ?? WALL_COLOURS[o.kind] ?? 0x8f8678, cx, height / 2, cz)); // walls
  });
  return group;
}

// Something long, lying along x, turned to match a map rectangle.
function placeAlong(object, rect) {
  object.position.set(rect.x + rect.w / 2, 0, rect.y + rect.h / 2);
  if (rect.h > rect.w) object.rotation.y = Math.PI / 2;
  return object;
}

function makeBus(rect) {
  const length = Math.max(rect.w, rect.h);
  const width = Math.min(rect.w, rect.h);
  const bus = new THREE.Group();
  bus.add(box(length, 58, width, 0xe8b923, 0, 41, 0)); // yellow body
  bus.add(box(length * 0.92, 14, width + 1, 0x1d2733, 0, 54, 0)); // window strip
  bus.add(box(length, 3, width + 1, 0x222222, 0, 30, 0)); // black stripe
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 6, 14), material(0x111111));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x * length * 0.35, 11, z * (width / 2 - 2));
    bus.add(wheel);
  }
  return placeAlong(bus, rect);
}

function makeContainer(rect) {
  const length = Math.max(rect.w, rect.h);
  const width = Math.min(rect.w, rect.h);
  const colour = new THREE.Color(rect.colour ?? '#a4442c');
  const darker = colour.clone().multiplyScalar(0.7);
  const container = new THREE.Group();
  container.add(box(length, HEIGHTS.container, width, colour.getHex(), 0, HEIGHTS.container / 2, 0));
  // Ridges down the long sides, like corrugated steel.
  for (let x = -length / 2 + 10; x < length / 2; x += 14) {
    container.add(box(4, HEIGHTS.container - 8, width + 2, darker.getHex(), x, HEIGHTS.container / 2, 0));
  }
  return placeAlong(container, rect);
}

function makeFence(rect) {
  const length = Math.max(rect.w, rect.h);
  const fence = new THREE.Group();
  fence.add(box(length, 4, 3, 0xf2f2f2, 0, 22, 0)); // rail
  fence.add(box(length, 4, 3, 0xf2f2f2, 0, 10, 0)); // rail
  for (let x = -length / 2 + 4; x < length / 2; x += 9) fence.add(box(5, HEIGHTS.fence, 2, 0xffffff, x, HEIGHTS.fence / 2, 1.5)); // pickets
  return placeAlong(fence, rect);
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
  return placeAlong(car, piece);
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

// `who` is 'zombie', or a survivor from characters.js (null means the default look).
function makePerson(who) {
  const isZombie = who === 'zombie';
  const looks = isZombie
    ? { skin: 0x86b26f, shirt: 0x6b5d45, trousers: 0x3b3b52 }
    : { skin: 0xe0ac69, shirt: 0x3a86ff, trousers: 0x23395d, hair: 0x4a2f1b, ...who?.colours };
  const group = new THREE.Group();

  const limb = (x, y, z, w, h, colour) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.add(box(w, h, w, colour, 0, -h / 2, 0));
    group.add(pivot);
    return pivot;
  };
  const legL = limb(0, 30, -5, 8, 30, looks.trousers);
  const legR = limb(0, 30, 5, 8, 30, looks.trousers);
  group.add(box(12, 30, 22, looks.shirt, 0, 45, 0)); // body
  group.add(box(15, 15, 15, looks.skin, 0, 68.5, 0)); // head
  const armL = limb(0, 57, -14, 7, 24, isZombie ? looks.skin : looks.shirt);
  const armR = limb(0, 57, 14, 7, 24, isZombie ? looks.skin : looks.shirt);

  if (isZombie) {
    group.add(box(13, 8, 9, 0x4e8040, 0.5, 38, 7)); // torn patch
    group.add(box(13, 6, 6, 0x7a2222, 0.5, 52, -6)); // bloodstain
    for (const z of [-3.5, 3.5]) group.add(box(1, 2.5, 2.5, material(0xff2a2a, true), 7.8, 70, z)); // red eyes
    armL.rotation.z = armR.rotation.z = Math.PI / 2; // arms reaching forward
  } else {
    group.add(box(16, 4, 16, looks.hair, -0.5, 77.5, 0)); // hair
    group.add(box(4, 10, 16, looks.hair, -6.5, 71, 0)); // back of the hair
    if (who?.id === 'ivy') group.add(box(4, 14, 5, looks.hair, -10, 64, 0)); // ponytail
    // Both arms swing forward, then turn inward to hold the gun.
    armL.rotation.set(0, -0.45, 1.45, 'YZX');
    armR.rotation.set(0, 0.35, 1.5, 'YZX');
    group.add(makeGun(who?.weapon ?? 'rifle'));
  }
  group.scale.setScalar(CHARACTER_SCALE);
  return { group, legL, legR, armL, armR, isZombie };
}

// Each weapon has its own shape, held out in front at chest height.
function makeGun(weapon) {
  const gun = new THREE.Group();
  if (weapon === 'shotgun') {
    gun.add(box(30, 6, 6, 0x3a3a3a, 23, 52, 4)); // barrel
    gun.add(box(9, 5, 7, 0x6b4520, 27, 48, 4)); // wooden pump
    gun.add(box(10, 7, 5, 0x6b4520, 6, 50, 4)); // stock
  } else if (weapon === 'smg') {
    gun.add(box(17, 8, 5, 0x2b2b2b, 18, 52, 4)); // body
    gun.add(box(3, 11, 3, 0x1a1a1a, 19, 44, 4)); // magazine
  } else if (weapon === 'sniper') {
    gun.add(box(42, 4, 4, 0x2f3b2f, 27, 53, 4)); // long barrel
    gun.add(box(12, 4, 4, 0x111111, 18, 58, 4)); // scope
    gun.add(box(10, 7, 5, 0x4a3b2c, 4, 51, 4)); // stock
  } else {
    gun.add(box(26, 6, 5, 0x2b2b2b, 22, 52, 4)); // rifle
    gun.add(box(3, 9, 3, 0x1a1a1a, 20, 46, 4)); // magazine
  }
  return gun;
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
