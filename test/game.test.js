import { describe, it, expect } from 'vitest';
import { createGame, step, zombiesInRound, zombieSpeedForRound, spawnIntervalForRound } from '../src/game.js';

const STEP = 1 / 60;

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
    const game = createGame();
    expect(game.round).toBe(1);
    expect(game.phase).toBe('roundBreak');
    expect(game.player.x).toBe(400);
    expect(game.player.y).toBe(300);
    expect(game.zombies).toEqual([]);
  });
});

describe('movement', () => {
  it('moves the player right at 200 px/s while D is held', () => {
    const game = run(createGame(), input({ right: true }), 1);
    expect(game.player.x).toBeCloseTo(600);
    expect(game.player.y).toBeCloseTo(300);
  });

  it('moves no faster diagonally than in a straight line', () => {
    const game = run(createGame(), input({ up: true, right: true }), 1);
    const distance = Math.hypot(game.player.x - 400, game.player.y - 300);
    expect(distance).toBeCloseTo(200);
  });

  it('moves at half speed with the stick pushed halfway', () => {
    const game = run(createGame(), input({ moveX: 0.5, moveY: 0 }), 1);
    expect(game.player.x).toBeCloseTo(500);
  });

  it('moves no faster than full speed with the stick pushed fully diagonally', () => {
    const game = run(createGame(), input({ moveX: 1, moveY: 1 }), 1);
    const distance = Math.hypot(game.player.x - 400, game.player.y - 300);
    expect(distance).toBeCloseTo(200);
  });

  // These stay inside the opening 3 s pause, so no zombies can interfere.
  it('stops the player at the top-left edges', () => {
    const game = run(createGame(), input({ left: true, up: true }), 2.9);
    expect(game.player.x).toBe(12);
    expect(game.player.y).toBe(12);
  });

  it('stops the player at the bottom-right edges', () => {
    const game = run(createGame(), input({ right: true, down: true }), 2.9);
    expect(game.player.x).toBe(788);
    expect(game.player.y).toBe(588);
  });
});

describe('shooting', () => {
  const aimRight = { mouseX: 700, mouseY: 300 };

  it('fires a bullet the moment the button is pressed', () => {
    const game = step(createGame(), input({ ...aimRight, firing: true }), STEP);
    expect(game.bullets).toHaveLength(1);
  });

  it('sends bullets towards the mouse at 500 px/s', () => {
    let game = step(createGame(), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 29 * STEP);
    expect(game.bullets[0].x).toBeCloseTo(650);
    expect(game.bullets[0].y).toBeCloseTo(300);
  });

  it('fires 5 shots per second while the button is held', () => {
    // Shots at 0, 0.2 and 0.4 s. Short enough that no bullet has left the arena yet.
    const game = run(createGame(), input({ ...aimRight, firing: true }), 0.59);
    expect(game.bullets).toHaveLength(3);
  });

  it('removes bullets that leave the arena', () => {
    let game = step(createGame(), input({ ...aimRight, firing: true }), STEP);
    game = run(game, input(aimRight), 2);
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
function playingGame(zombies) {
  const game = createGame();
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
    const game = run(createGame(), input(), 2.9);
    expect(game.zombies).toEqual([]);
  });

  it('starts spawning once the pause is over', () => {
    const game = run(createGame(), input(), 3.1);
    expect(game.phase).toBe('playing');
    expect(game.zombies.length).toBeGreaterThan(0);
  });

  it('spawns zombies outside the arena, at least 250 px from the player', () => {
    for (let seed = 1; seed <= 20; seed++) {
      // Player hides in the top-left corner, the worst case for fair spawns.
      let game = run(createGame({ random: seededRandom(seed) }), input({ left: true, up: true }), 3.05);
      for (const z of game.zombies) {
        const outside = z.x < 0 || z.x > 800 || z.y < 0 || z.y > 600;
        expect(outside).toBe(true);
        expect(Math.hypot(z.x - game.player.x, z.y - game.player.y)).toBeGreaterThanOrEqual(250);
      }
      expect(game.zombies.length).toBeGreaterThan(0);
    }
  });

  it('still spawns fairly if the random numbers are unlucky', () => {
    const game = run(createGame({ random: () => 0 }), input({ left: true, up: true }), 3.05);
    const z = game.zombies[0];
    expect(Math.hypot(z.x - game.player.x, z.y - game.player.y)).toBeGreaterThanOrEqual(250);
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
    const game = run(createGame(), input(), 3.05);
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
