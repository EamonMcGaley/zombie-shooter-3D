// Hand-made maps: original layouts inspired by classic shooter maps. No browser code.
// See .scratch/maps-characters-settings/spec.md.
//
// Layouts are written in tiles (20 px) on the 80 x 60 grid. The player
// always starts in the middle, at tile (40, 30), so that area is kept clear.

import { TILE, doorwayRect, solidParts } from './map.js';

// Small helpers so the layouts read like a list of things on the map.
const piece = (kind) => (x, y, w, h, extra = {}) => ({ kind, x, y, w, h, ...extra });
const house = piece('house');
const shed = piece('shed');
const wall = piece('wall');
const perimeter = piece('perimeter');
const container = piece('container');
const bus = piece('bus');
const car = piece('car');
const fence = piece('fence');
const lowWall = piece('lowWall');
const crate = (x, y) => piece('crate')(x, y, 2, 2);

// A tall wall around the whole 80 x 60 map.
const border = [perimeter(0, 0, 80, 1), perimeter(0, 59, 80, 1), perimeter(0, 1, 1, 58), perimeter(79, 1, 1, 58)];

export const MAPS = {
  // Two houses facing each other across a cul-de-sac, a bus in the street,
  // garages, cars, and fenced back yards.
  avenue: {
    name: 'Atomic Avenue',
    pieces: [
      ...border,
      house(6, 16, 16, 12, { colour: '#d9b44a', doors: [['right', 5], ['top', 7], ['bottom', 3]] }), // yellow house
      shed(8, 34, 10, 8, { colour: '#c9a640', doors: [['right', 3]] }), // yellow garage
      house(58, 32, 16, 12, { colour: '#7fae6a', doors: [['left', 5], ['bottom', 7], ['top', 3]] }), // green house
      shed(62, 18, 10, 8, { colour: '#6f9a5b', doors: [['left', 3]] }), // green garage
      bus(33, 21, 12, 3),
      car(27, 34, 4, 2),
      car(48, 40, 2, 4),
      car(50, 13, 4, 2),
      car(27, 10, 2, 4), // 2 tiles from the fence, so zombies fit between
      fence(4, 8, 20, 1), // yellow house back yard
      fence(24, 8, 1, 6),
      fence(56, 51, 20, 1), // green house back yard
      fence(55, 46, 1, 6),
      lowWall(24, 46, 6, 1),
      lowWall(50, 25, 6, 1),
      crate(30, 40),
      crate(46, 28),
      crate(12, 48),
      crate(66, 10),
      crate(36, 50),
      crate(44, 8),
    ],
  },

  // A small walled yard packed with shipping containers. Most of the field
  // outside the walls can't be reached.
  yard: {
    name: 'Container Yard',
    pieces: [
      perimeter(20, 15, 40, 1),
      perimeter(20, 44, 40, 1),
      perimeter(20, 16, 1, 28),
      perimeter(59, 16, 1, 28),
      container(24, 19, 7, 3, { colour: '#a4442c' }),
      container(37, 18, 3, 7, { colour: '#2d5d9f' }), // 2 tiles from the wall, so zombies fit behind it
      container(47, 19, 7, 3, { colour: '#3f7a3f' }),
      container(23, 27, 3, 7, { colour: '#2d5d9f' }),
      container(54, 26, 3, 7, { colour: '#a4442c' }),
      container(28, 37, 7, 3, { colour: '#3f7a3f' }),
      container(45, 37, 7, 3, { colour: '#c27a2c' }),
      crate(32, 26),
      crate(46, 27),
      crate(33, 32),
      crate(45, 32),
    ],
  },

  // A bunker with a main room, a side room and a "help" room, broken
  // doorways on every side, and a yard with sandbags and trucks outside.
  bunker: {
    name: 'The Bunker',
    pieces: [
      ...border,
      house(20, 14, 40, 32, { colour: '#8a7f6a', doors: [['left', 14], ['right', 12], ['top', 20], ['bottom', 26]] }),
      wall(34, 15, 1, 13), // side room wall, above its doorway
      wall(34, 30, 1, 15), // side room wall, below its doorway
      wall(35, 22, 10, 1), // help room wall, left of its doorway
      wall(47, 22, 12, 1), // help room wall, right of its doorway
      crate(50, 38),
      crate(24, 40),
      crate(43, 17),
      lowWall(24, 20, 6, 1),
      lowWall(38, 40, 6, 1),
      lowWall(8, 10, 6, 1), // sandbags outside
      lowWall(66, 50, 6, 1),
      lowWall(66, 6, 1, 6),
      car(8, 48, 4, 2),
      car(70, 30, 2, 4),
      crate(12, 28),
      crate(66, 22),
    ],
  },
};

// Turns a layout (in tiles) into the same { name, pieces, obstacles } shape as a generated map.
export function buildNamedMap(key) {
  const layout = MAPS[key];
  if (!layout) throw new Error(`No map called ${key}`);
  const pieces = layout.pieces.map(({ doors, x, y, w, h, ...rest }) => {
    const placed = { ...rest, x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE };
    if (doors) placed.doorways = doors.map(([side, offset]) => doorwayRect(placed, side, offset));
    return placed;
  });
  return { name: layout.name, pieces, obstacles: pieces.flatMap(solidParts) };
}
