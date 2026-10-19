import { describe, it, expect } from 'vitest';
import { createGame, step, zombiesInRound, zombieSpeedForRound, spawnIntervalForRound } from '../src/game.js';
import { generateMap, ARENA } from '../src/map.js';
import { buildNamedMap } from '../src/maps.js';

const STEP = 1 / 60;

// A game in an empty arena (no buildings), so tests aren't affected by random maps.
// The player starts at (400, 300), near the top-left corner of the arena, so tests
// can use small, easy numbers.
function emptyGame(options = {}) {
  const game = createGame({ obstacles: [], ...options });
  game.player.x = 400;
  game.player.y = 300;
  return game;
}

function input(overrides = {}) {
  return { up: false, down: false, left: false, right: false, mouseX: 0, mouseY: 0, firing: false, ...overrides };
}

// Runs the game for `seconds` in small fixed steps, like the browser does.
function run(game, inp, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) game = step(game, inp, STEP);
  return game;
}

describe('new game', () => {
  it('starts in a ROUND 1 pause with the player in the centre and no zombies', () => {
    const game = createGame({ obstacles: [] });
    expect(game.round).toBe(1);
    expect(game.phase).toBe('roundBreak');
    expect(game.player.x).toBe(ARENA.width / 2);
    expect(game.player.y).toBe(ARENA.height / 2);
    expect(game.zombies).toEqual([]);
  });
});

describe('movement', () => {
  it('moves the player right at 200 px/s while D is held', () => {
    const game = run(emptyGame(), input({ right: true }), 1);
    expect(game.player.x).toBeCloseTo(600);
    expect(game.player.y).toBeCloseTo(300);
  });

  it('moves no faster diagonally than in a straight line', () => {
    const game = run(emptyGame(), input({ up: true, right: true }), 1);
    const distance = Math.hypot(game.player.x - 400, game.player.y - 300);
    expect(distance).toBeCloseTo(200);
  });

  it('moves at half speed with the stick pushed halfway', () => {
    const game = run(emptyGame(), input({ moveX: 0.5, moveY: 0 }), 1);
    expect(game.player.x).toBeCloseTo(500);
  });

  it('moves no faster than full speed with the stick pushed fully diagonally', () => {
    const game = run(emptyGame(), input({ moveX: 1, moveY: 1 }), 1);
    const distance = Math.hypot(game.player.x - 400, game.player.y - 300);
    expect(distance).toBeCloseTo(200);
  });

  // These stay inside the opening 3 s pause, so no zombies can interfere.
  it('stops the player at the top-left edges', () => {
    const game = run(emptyGame(), input({ left: true, up: true }), 2.9);
    expect(game.player.x).toBe(12);
    expect(game.player.y).toBe(12);
  });

  it('stops the player at the bottom-right edges', () => {
    const game = emptyGame();
    game.player.x = ARENA.width - 400;
    game.player.y = ARENA.height - 300;
    const after = run(game, input({ right: true, down: true }), 2.9);
    expect(after.player.x).toBe(ARENA.width - 12);
    expect(after.player.y).toBe(ARENA.height - 12);
  });
});

describe('shooting', () => {
  const aimRight = { mouseX: 700, mouseY: 300 };

  it('fires a bullet the moment the button is pressed', () => {
    const game = step(emptyGame(), input({ ...aimRight, firing: true }), STEP);
    expect(game.bullets).toHaveLength(1);
  });

  it('sends bullets towards the mouse at 500 px/s', () => {
    let game = step(emptyGame(), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 29 * STEP);
    expect(game.bullets[0].x).toBeCloseTo(400 + 26 + 250);
    expect(game.bullets[0].y).toBeCloseTo(303);
  });

  it('fires 5 shots per second while the button is held', () => {
    // Shots at 0, 0.2 and 0.4 s. Short enough that no bullet has left the arena yet.
    const game = run(emptyGame(), input({ ...aimRight, firing: true }), 0.59);
    expect(game.bullets).toHaveLength(3);
  });

  it('removes bullets that leave the arena', () => {
    let game = step(emptyGame(), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 3.5);
    expect(game.bullets).toEqual([]);
  });
});

describe('round rules', () => {
  it('starts with 5 zombies and adds one each round, up to 30', () => {
    expect(zombiesInRound(1)).toBe(5);
    expect(zombiesInRound(2)).toBe(6);
    expect(zombiesInRound(26)).toBe(30);
    expect(zombiesInRound(40)).toBe(30);
  });

  it('starts zombies at half your speed and overtakes you at round 18', () => {
    expect(zombieSpeedForRound(1)).toBe(100);
    expect(zombieSpeedForRound(17)).toBeLessThan(200);
    expect(zombieSpeedForRound(18)).toBeGreaterThan(200);
    expect(zombieSpeedForRound(26)).toBe(250);
  });

  it('adds 1% speed per round after round 26, never above 1.5x your speed', () => {
    expect(zombieSpeedForRound(27)).toBeCloseTo(252.5);
    expect(zombieSpeedForRound(28)).toBeCloseTo(255.025);
    for (let round = 1; round <= 200; round++) {
      expect(zombieSpeedForRound(round)).toBeLessThanOrEqual(300);
    }
    expect(zombieSpeedForRound(100)).toBe(300);
  });

  it('spawns zombies faster each round, down to one every 0.3 s', () => {
    expect(spawnIntervalForRound(1)).toBeCloseTo(1.0);
    expect(spawnIntervalForRound(2)).toBeCloseTo(0.95);
    expect(spawnIntervalForRound(15)).toBeCloseTo(0.3);
    expect(spawnIntervalForRound(30)).toBeCloseTo(0.3);
  });
});

// A game in round 1, past the opening pause, with nothing left to spawn,
// so a test can place its own zombies.
function playingGame(zombies, obstacles = [], options = {}) {
  const game = emptyGame({ obstacles, ...options });
  game.phase = 'playing';
  game.zombiesToSpawn = 0;
  game.zombies = zombies.map(([x, y]) => ({ x, y, r: 12 }));
  return game;
}

// A predictable stand-in for Math.random, so test runs are repeatable.
function seededRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('zombies', () => {
  it('does not spawn zombies during the ROUND 1 pause', () => {
    const game = run(emptyGame(), input(), 2.9);
    expect(game.zombies).toEqual([]);
  });

  it('starts spawning once the pause is over', () => {
    const game = run(emptyGame(), input(), 3.1);
    expect(game.phase).toBe('playing');
    expect(game.zombies.length).toBeGreaterThan(0);
  });

  // Steps a game for `seconds`, recording where each zombie was when it first appeared.
  function spawnSpots(game, inp, seconds) {
    const spots = [];
    const seen = new Set();
    for (let t = 0; t < seconds && game.phase !== 'gameOver'; t += STEP) {
      game = step(game, inp, STEP);
      for (const z of game.zombies) {
        if (seen.has(z)) continue;
        seen.add(z);
        spots.push({ x: z.x, y: z.y, distance: Math.hypot(z.x - game.player.x, z.y - game.player.y), game });
      }
    }
    return spots;
  }

  it('spawns zombies inside the arena, never within 10 tiles (200 px) of the player', () => {
    for (let seed = 1; seed <= 20; seed++) {
      // Player hides in the top-left corner.
      const spots = spawnSpots(emptyGame({ random: seededRandom(seed) }), input({ left: true, up: true }), 3.5);
      expect(spots.length).toBeGreaterThan(0);
      for (const spot of spots) {
        expect(spot.x).toBeGreaterThanOrEqual(0);
        expect(spot.x).toBeLessThanOrEqual(ARENA.width);
        expect(spot.y).toBeGreaterThanOrEqual(0);
        expect(spot.y).toBeLessThanOrEqual(ARENA.height);
        expect(spot.distance).toBeGreaterThanOrEqual(200 - 5); // it may already have taken one step
      }
    }
  });

  it('spawns zombies all over the map, not just at the edges', () => {
    let deepInside = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const spot of spawnSpots(emptyGame({ random: seededRandom(seed) }), input(), 7)) {
        const fromEdge = Math.min(spot.x, spot.y, ARENA.width - spot.x, ARENA.height - spot.y);
        if (fromEdge > 200) deepInside++;
      }
    }
    expect(deepInside).toBeGreaterThan(10);
  });

  it('never spawns zombies inside walls or objects', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = createGame({ seed, random: seededRandom(seed) });
      for (const spot of spawnSpots(game, input(), 8)) {
        for (const wall of spot.game.obstacles) expect(overlapDepth({ ...spot, r: 12 }, wall)).toBeLessThan(0.01);
      }
    }
  });

  it('still spawns fairly if the random numbers are unlucky', () => {
    const game = run(emptyGame({ random: () => 0 }), input({ left: true, up: true }), 3.05);
    const z = game.zombies[0];
    expect(Math.hypot(z.x - game.player.x, z.y - game.player.y)).toBeGreaterThanOrEqual(200);
  });

  it('walks towards the player at the round speed', () => {
    const game = run(playingGame([[100, 300]]), input(), 1);
    expect(game.zombies[0].x).toBeCloseTo(200);
    expect(game.zombies[0].y).toBeCloseTo(300);
  });

  it('pushes overlapping zombies apart', () => {
    const game = step(playingGame([[100, 300], [105, 300]]), input(), STEP);
    const [a, b] = game.zombies;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(24 - 1e-9);
  });

  it('dies when a bullet hits it, and the bullet is used up', () => {
    const game = run(playingGame([[600, 300], [700, 50]]), input({ mouseX: 700, mouseY: 300, firing: true }), STEP);
    const after = run(game, input(), 0.5);
    expect(after.zombies).toHaveLength(1);
    expect(after.bullets).toEqual([]);
  });

  it('ends the game when a zombie touches the player', () => {
    const game = step(playingGame([[420, 300]]), input(), STEP);
    expect(game.phase).toBe('gameOver');
  });

  it('freezes the game once it is over', () => {
    let game = step(playingGame([[420, 300]]), input(), STEP);
    const x = game.player.x;
    game = run(game, input({ right: true, firing: true, mouseX: 700, mouseY: 300 }), 1);
    expect(game.player.x).toBe(x);
    expect(game.bullets).toEqual([]);
  });
});

describe('rounds', () => {
  it('starts a 3 second pause and then round 2 once round 1 is cleared', () => {
    let game = step(playingGame([]), input(), STEP);
    expect(game.phase).toBe('roundBreak');
    expect(game.round).toBe(2);
    game = run(game, input(), 3.1);
    expect(game.phase).toBe('playing');
  });

  it('sends one more zombie in round 2', () => {
    let game = step(playingGame([]), input(), STEP);
    game = run(game, input(), 3.05);
    expect(game.round).toBe(2);
    expect(game.zombies.length).toBeGreaterThan(0);
    expect(game.zombiesToSpawn + game.zombies.length).toBe(6);
  });

  it('counts the zombies left this round for the HUD', () => {
    const game = run(emptyGame(), input(), 3.05);
    expect(game.zombiesToSpawn + game.zombies.length).toBe(5);
  });
});

describe('aim assist', () => {
  // Fires one bullet aiming straight right from the centre, and returns its angle in degrees.
  function shotAngle(zombies, aimAssist) {
    const game = step(playingGame(zombies), input({ mouseX: 700, mouseY: 300, firing: true, aimAssist }), STEP);
    const bullet = game.bullets[0];
    return (Math.atan2(bullet.vy, bullet.vx) * 180) / Math.PI;
  }

  // A zombie 300 px from the centre of the arena, at `degrees` from straight right.
  function zombieAt(degrees) {
    const radians = (degrees * Math.PI) / 180;
    return [400 + Math.cos(radians) * 300, 300 + Math.sin(radians) * 300];
  }

  it('turns a bullet 5% of the way towards a zombie near the aim', () => {
    expect(shotAngle([zombieAt(10)], 0.05)).toBeCloseTo(0.5, 1);
  });

  it('leaves the bullet alone with no aim assist', () => {
    expect(shotAngle([zombieAt(10)], 0)).toBeCloseTo(0);
  });

  it('ignores zombies more than 30 degrees from the aim', () => {
    expect(shotAngle([zombieAt(45)], 0.05)).toBeCloseTo(0);
  });

  it('picks the zombie closest to the aim direction', () => {
    expect(shotAngle([zombieAt(20), zombieAt(-8)], 0.05)).toBeCloseTo(-0.4, 1);
  });
});

// How far a circle pokes into a rectangle (0 if it doesn't).
function overlapDepth(circle, rect) {
  const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  return Math.max(0, circle.r - Math.hypot(circle.x - nearestX, circle.y - nearestY));
}

// Runs a game until it's over (or time runs out), checking each step that no
// zombie is inside a wall.
function runUntilCaught(game, seconds) {
  for (let t = 0; t < seconds && game.phase !== 'gameOver'; t += STEP) {
    game = step(game, input(), STEP);
    for (const zombie of game.zombies) {
      for (const wall of game.obstacles) expect(overlapDepth(zombie, wall)).toBeLessThan(0.01);
    }
  }
  return game;
}

describe('maps', () => {
  it('builds the map from the seed', () => {
    const game = createGame({ seed: 5 });
    expect(game.seed).toBe(5);
    expect(game.obstacles).toEqual(generateMap(5).obstacles);
  });

  it('builds a hand-made map by name', () => {
    const game = createGame({ map: 'yard' });
    expect(game.mapName).toBe('Container Yard');
    expect(game.obstacles).toEqual(buildNamedMap('yard').obstacles);
  });

  it('picks one of the three hand-made maps for "random" and when nothing is chosen', () => {
    const names = new Set();
    for (let i = 0; i < 40; i++) {
      names.add(createGame({ map: 'random' }).mapName);
      names.add(createGame().mapName);
    }
    expect([...names].sort()).toEqual(['Atomic Avenue', 'Container Yard', 'The Bunker']);
  });

  it('can still build a generated layout', () => {
    const game = createGame({ map: 'generated' });
    expect(Number.isInteger(game.seed)).toBe(true);
    expect(game.mapName).toBe(`Random layout ${game.seed}`);
  });

  it('only spawns zombies where they can reach the player (inside Container Yard\'s walls)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      let game = createGame({ map: 'yard', random: seededRandom(seed) });
      game = run(game, input(), 3 + 4 * 1.0 + 0.1);
      expect(game.zombies.length).toBeGreaterThan(2);
      for (const z of game.zombies) {
        expect(z.x).toBeGreaterThan(20 * 20);
        expect(z.x).toBeLessThan(60 * 20);
        expect(z.y).toBeGreaterThan(15 * 20);
        expect(z.y).toBeLessThan(45 * 20);
      }
    }
  });
});

describe('weapons', () => {
  const aimRight = { mouseX: 700, mouseY: 300 };
  const angleOf = (bullet) => (Math.atan2(bullet.vy, bullet.vx) * 180) / Math.PI;

  it('uses the rifle unless told otherwise', () => {
    expect(emptyGame().weapon).toBe('rifle');
  });

  it('only kills the first of two zombies in a line with the rifle', () => {
    let game = step(playingGame([[500, 300], [540, 300]]), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 0.3);
    expect(game.zombies).toHaveLength(1);
  });

  it('fires 6 shotgun pellets fanned across 20 degrees', () => {
    const game = step(emptyGame({ weapon: 'shotgun' }), input({ ...aimRight, firing: true }), STEP);
    expect(game.bullets).toHaveLength(6);
    const angles = game.bullets.map(angleOf);
    expect(Math.min(...angles)).toBeCloseTo(-10);
    expect(Math.max(...angles)).toBeCloseTo(10);
  });

  it('fires the shotgun twice a second', () => {
    // Count trigger pulls, not pellets: pellets from earlier blasts may have vanished (range).
    expect(run(emptyGame({ weapon: 'shotgun' }), input({ ...aimRight, firing: true }), 0.4).shotsFired).toBe(1);
    expect(run(emptyGame({ weapon: 'shotgun' }), input({ ...aimRight, firing: true }), 0.6).shotsFired).toBe(2);
  });

  it('makes shotgun pellets vanish after a short distance', () => {
    let game = step(emptyGame({ weapon: 'shotgun' }), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 0.4); // 180 px: still flying
    expect(game.bullets.length).toBeGreaterThan(0);
    game = run(game, input(aimRight), 0.4); // 360 px: past the 320 px range
    expect(game.bullets).toEqual([]);
  });

  it('fires the SMG 11 times a second with a small wobble', () => {
    const game = run(emptyGame({ weapon: 'smg' }), input({ ...aimRight, firing: true }), 0.5);
    expect(game.bullets).toHaveLength(6);
    const angles = game.bullets.map(angleOf);
    for (const angle of angles) expect(Math.abs(angle)).toBeLessThanOrEqual(4 + 1e-9);
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('kills a line of zombies with one sniper bullet', () => {
    let game = step(playingGame([[500, 300], [550, 300], [600, 300], [700, 50]], [], { weapon: 'sniper' }), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 0.3);
    expect(game.zombies).toHaveLength(1);
  });

  it('still stops sniper bullets at walls', () => {
    const wall = { x: 500, y: 240, w: 20, h: 120 };
    let game = step(playingGame([[600, 300]], [wall], { weapon: 'sniper' }), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 0.3);
    expect(game.zombies).toHaveLength(1);
  });
});

describe('obstacles', () => {
  it('stops the player at a crate', () => {
    const game = run(emptyGame({ obstacles: [{ x: 500, y: 280, w: 40, h: 40 }] }), input({ right: true }), 2.9);
    expect(game.player.x).toBeCloseTo(488);
  });

  it('lets the player slide along a wall', () => {
    const wall = { x: 300, y: 260, w: 400, h: 20 };
    const game = run(emptyGame({ obstacles: [wall] }), input({ up: true, right: true }), 1);
    expect(game.player.y).toBeCloseTo(292);
    expect(game.player.x).toBeGreaterThan(520);
  });

  it('stops bullets at walls, so zombies behind them survive', () => {
    const wall = { x: 500, y: 240, w: 20, h: 120 };
    let game = step(playingGame([[700, 300]], [wall]), input({ mouseX: 700, mouseY: 300, firing: true }), STEP);
    game = run(game, input(), 0.5);
    expect(game.bullets).toEqual([]);
    expect(game.zombies).toHaveLength(1);
  });

  it('sends zombies around a wall to reach the player', () => {
    const wall = { x: 300, y: 200, w: 20, h: 200 };
    const game = runUntilCaught(playingGame([[200, 300]], [wall]), 8);
    expect(game.phase).toBe('gameOver');
  });

  it('moves a zombie somewhere else if it has no way to reach the player', () => {
    // A sealed box the zombie can never get out of.
    const box = [
      { x: 900, y: 200, w: 100, h: 20 },
      { x: 900, y: 300, w: 100, h: 20 },
      { x: 900, y: 220, w: 20, h: 80 },
      { x: 980, y: 220, w: 20, h: 80 },
    ];
    const inBox = (z) => z.x > 900 && z.x < 1000 && z.y > 200 && z.y < 320;
    let game = playingGame([[950, 260]], box);
    game = run(game, input(), 1.5);
    expect(inBox(game.zombies[0])).toBe(true); // still trapped after 1.5 s
    game = run(game, input(), 1);
    expect(inBox(game.zombies[0])).toBe(false); // moved somewhere it can reach the player
  });

  it('sends zombies into a room through its only doorway', () => {
    // A room around the player, with the doorway on the far side from the zombie.
    const room = [
      { x: 320, y: 220, w: 160, h: 20 }, // top
      { x: 320, y: 360, w: 160, h: 20 }, // bottom
      { x: 320, y: 240, w: 20, h: 120 }, // left
      { x: 460, y: 240, w: 20, h: 40 }, // right, above the doorway
      { x: 460, y: 320, w: 20, h: 40 }, // right, below the doorway
    ];
    const game = runUntilCaught(playingGame([[100, 300]], room), 12);
    expect(game.phase).toBe('gameOver');
  });
});

describe('jumping', () => {
  const crate = { x: 460, y: 280, w: 40, h: 40, height: 40 };
  const car = { x: 460, y: 280, w: 40, h: 40, height: 56 };

  it('goes up and comes back down', () => {
    let game = step(emptyGame(), input({ jump: true }), STEP);
    game = run(game, input(), 0.2);
    expect(game.player.z).toBeGreaterThan(30);
    game = run(game, input(), 1);
    expect(game.player.z).toBe(0);
  });

  it('cannot jump again until landing', () => {
    let game = emptyGame();
    let highest = 0;
    for (let i = 0; i < 90; i++) {
      game = step(game, input({ jump: true }), STEP);
      highest = Math.max(highest, game.player.z);
    }
    expect(highest).toBeLessThan(62);
  });

  it('is stopped by a crate when not jumping', () => {
    const game = run(emptyGame({ obstacles: [crate] }), input({ right: true }), 1);
    expect(game.player.x).toBeCloseTo(448);
  });

  it('clears a crate while running', () => {
    let game = step(emptyGame({ obstacles: [crate] }), input({ right: true, jump: true }), STEP);
    game = run(game, input({ right: true }), 1);
    expect(game.player.x).toBeGreaterThan(512);
  });

  it('cannot clear a car', () => {
    let game = step(emptyGame({ obstacles: [car] }), input({ right: true, jump: true }), STEP);
    game = run(game, input({ right: true }), 1);
    expect(game.player.x).toBeCloseTo(448);
  });

  it('still gets caught by a zombie mid-air', () => {
    const game = step(playingGame([[420, 300]]), input({ jump: true }), STEP);
    expect(game.phase).toBe('gameOver');
  });
});

describe('bullets come out of the gun', () => {
  const aimRight = { mouseX: 700, mouseY: 300 };
  // Fires one shot (from a fresh game, or the one given) and returns where the
  // bullet started: its position minus the one step it has already flown.
  function firstShot(game) {
    game = step(game, input({ ...aimRight, firing: true }), STEP);
    const b = game.bullets[game.bullets.length - 1];
    return { x: b.x - b.vx * STEP, y: b.y - b.vy * STEP, z: b.z, playerZ: game.player.z };
  }

  // Fires one shot right (standing, or from mid-jump) past an obstacle at
  // x 500-540, and says whether the bullet made it to the far side.
  function getsPast(obstacle, { jumping = false } = {}) {
    let game = emptyGame({ obstacles: [obstacle] });
    if (jumping) {
      game = step(game, input({ jump: true }), STEP);
      game = run(game, input(), 0.15); // up in the air
    }
    game = step(game, input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 0.4); // long enough to reach x 600+
    return game.bullets.some((b) => b.x > 560);
  }

  it('starts a rifle bullet at the end of the barrel, 26 ahead and 3 to the right', () => {
    const start = firstShot(emptyGame());
    expect(start.x).toBeCloseTo(426);
    expect(start.y).toBeCloseTo(303);
    expect(start.z).toBe(39);
  });

  it('fires the long sniper from further out than the short SMG', () => {
    const sniper = firstShot(emptyGame({ weapon: 'sniper' }));
    const smg = firstShot(emptyGame({ weapon: 'smg' }));
    expect(sniper.x).toBeGreaterThan(smg.x + 10);
  });

  it('fires from higher up while jumping', () => {
    let game = step(emptyGame(), input({ jump: true }), STEP);
    game = run(game, input(), 0.2);
    const shot = firstShot(game);
    expect(shot.playerZ).toBeGreaterThan(20);
    expect(shot.z).toBeCloseTo(shot.playerZ + 39);
  });

  it('shoots over a low wall (below gun height)', () => {
    expect(getsPast({ x: 500, y: 240, w: 40, h: 120, height: 36 })).toBe(true);
  });

  it('is stopped by a crate when standing, but a jump-shot clears it', () => {
    const crate = { x: 500, y: 240, w: 40, h: 120, height: 40 };
    expect(getsPast(crate)).toBe(false);
    expect(getsPast(crate, { jumping: true })).toBe(true);
  });

  it('is always stopped by a tall wall, even mid-jump', () => {
    const wall = { x: 500, y: 240, w: 40, h: 120, height: 96 };
    expect(getsPast(wall, { jumping: true })).toBe(false);
  });
});
