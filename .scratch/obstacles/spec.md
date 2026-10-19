# Spec: Random maps with buildings and cover

Status: ready-for-agent

## Problem Statement

The arena is an empty box, so every game plays the same: you run in circles. I want buildings I can run into, and cover I can run around. I want the layout to be different every game, while always staying fair.

## Solution

Every new game generates a random map. It has a house with two doorways, a shed with one doorway, two cars, four crates and a low wall. Walls and objects block you, zombies and bullets. Zombies find their way around obstacles and in through doorways to reach you (pathfinding). Generated maps always follow fairness rules, and each map has a seed number, so a good map can be played again.

The view stays top-down for this spec. The 3D third-person view is the next spec, built on top of this one.

## User Stories

1. As a player, I want a different map every time I start a game, so that games don't all feel the same.
2. As a player, I want the map to stay the same for the whole game, so that I can learn it and plan.
3. As a player, I want a house with two doorways that I can run into, so that I can hold a room like in CoD Zombies.
4. As a player, I want a shed with one doorway, so that there's a risky spot where I can hold one chokepoint, or get trapped.
5. As a player, I want cars, crates and a low wall to run around, so that I can break line of sight and lead zombies around corners.
6. As a player, I want to be blocked by walls and objects but slide along them, so that I don't stick to walls when I brush past them.
7. As a player, I want my bullets to stop when they hit a wall or object, so that cover works the way it looks.
8. As a player, I want zombies to walk around obstacles and through doorways to reach me, so that hiding is never a free win.
9. As a player, I want zombies to walk straight at me when nothing is in the way, so that they move naturally rather than in a zig-zag.
10. As a player, I want zombies never to walk through walls, so that the map makes sense.
11. As a player, I want there always to be a gap of at least 40 px between objects, so that I can squeeze between anything.
12. As a player, I want nothing placed within 100 px of where I start, so that I'm never boxed in on round 1.
13. As a player, I want doorways never to be blocked, so that buildings are always usable.
14. As a player, I want every open space to be reachable, so that I can never be sealed into a pocket where zombies can't reach me (or that I can't escape).
15. As a player, I want to see the map's seed number on screen, so that I can share or replay a good map.
16. As a player, I want to replay a map by opening the game with `?seed=<number>` in the address, so that I can practise on a map I like.
17. As a developer, I want maps generated from a seed number, so that a test with a fixed seed always gets the same map.

## Implementation Decisions

- **The map is a grid of 20 px tiles,** 40 × 30 tiles for the 800 × 600 arena. Every obstacle lines up with the grid. Building walls are 1 tile (20 px) thick, and doorways are 2 tiles (40 px) wide, so players and zombies (24 px wide) fit through.
- **Pieces,** with sizes in tiles:

  | Piece | Size | Notes |
  |---|---|---|
  | House | 10 × 7 | Hollow, with walls 1 tile thick and 2 doorways on different sides |
  | Shed | 6 × 5 | Hollow, with 1 doorway |
  | Car (×2) | 4 × 2 | Randomly horizontal or vertical |
  | Crate (×4) | 2 × 2 | |
  | Low wall | 6 × 1 | Randomly horizontal or vertical |

  Doorways never sit at a corner. Every piece is solid, including the low wall: it blocks movement and bullets (shooting over low cover could come later).
- **New map module (no browser code):** `generateMap(seed)` returns `{ seed, pieces, obstacles }`.
  - `pieces` lists each piece with its kind, outline and doorways (used for drawing).
  - `obstacles` is the list of solid rectangles: each crate, car and wall, plus each wall section of a building, so doorways are gaps.
  - The map uses its own seeded random number generator, so the same seed always gives the same map.
- **Fairness rules.** The generator places pieces biggest first, at random grid positions. A position is rejected if:
  - the piece is less than 2 tiles from the arena edge (keeps the edges open for zombies coming in);
  - the piece is less than 2 tiles from any other piece (the 40 px gap, which also keeps doorways clear);
  - the piece is less than 100 px from the centre (the player's start).

  After placing every piece, the generator checks that every open tile can be reached from the arena edge. If a piece can't be placed or the check fails, the whole map starts again (still from the same seed, so the result is repeatable).
- **`createGame` options:**
  - `seed`: which map to build. A random seed is used if it isn't given.
  - `obstacles`: an exact list of rectangles to use instead of generating a map. Tests use `[]` for the old empty arena, or place a single wall.
  - `random`: as before, used only for zombie spawns.
- **Collisions with obstacles:**
  - The player and zombies are circles. After moving, they're pushed out of any rectangle they overlap. Pushing out sideways is what makes sliding along walls work.
  - Zombies are pushed out of walls after being pushed apart from each other, so walls always win.
  - A bullet is removed when it touches an obstacle.
- **Zombie pathfinding:**
  - Each step, the game builds a flow field: it measures the distance in tiles from the player's tile to every open tile (a breadth-first search, or BFS).
  - If a zombie has a clear straight line to the player (that line misses every obstacle widened by the zombie's radius), it walks straight at them.
  - Otherwise, it walks towards the centre of the neighbouring tile closest to the player. Neighbours include diagonals, but not ones that would cut the corner of a wall.
  - Zombies outside the arena use the nearest edge tile.
- **Browser layer:**
  - Draws the pieces top-down: building walls with a lighter floor inside, cars, crates and the low wall.
  - Shows the seed in the HUD.
  - Reads `?seed=` from the address. Restarting keeps that seed if one was given, and otherwise picks a new random one.

## Testing Decisions

- **The map module** is tested over many seeds (for example, 100). For every one:
  - It has the right pieces: 1 house with 2 doorways, 1 shed with 1 doorway, 2 cars, 4 crates and 1 low wall.
  - Every piece is inside the arena with a 2-tile margin, at least 2 tiles from every other piece, and at least 100 px from the centre.
  - Every open tile can be reached from the edge.

  Also, the same seed gives the same map and different seeds give different maps.
- **The rules** are tested through `createGame` / `step`, with hand-placed obstacles:
  - The player stops at a crate.
  - The player slides along a wall.
  - A bullet stops at a wall, and a zombie behind it survives.
  - A zombie walks around a wall to reach the player, without ever overlapping the wall.
  - A zombie gets into a room through its only doorway.
- **Existing tests** create games with `obstacles: []`, so they keep testing the rules in an empty arena.

## Out of Scope

- The 3D view (the next spec)
- Doors that open and close
- CoD-style barricades
- Windows
- Shooting over low cover
- Bigger maps than the screen
- Different map themes
- Choosing a map from a menu
- Zombies spawning inside buildings
- Aim assist ignoring zombies behind walls

## Further Notes

- The flow field (BFS from the player) is a classic piece of game AI. It's how lots of strategy and survival games move crowds of enemies cheaply: one search per step, shared by every zombie.
- If late rounds feel too easy because zombies queue at doorways, that's working as intended: chokepoints are the CoD Zombies tactic. Barricades and windows are a later spec.
