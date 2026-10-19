# Spec: Bigger map, jumping, smaller characters

Status: ready-for-agent

## Problem Statement

In 3D the map feels cramped (about 19 m × 14 m), the characters look big, and I can't jump. In a third-person shooter I expect to hop over low things.

## Solution

- The map doubles in size, to 1600 × 1200, with about four times as many buildings and objects.
- You can jump with Space (or A / ✕). A jump clears crates and the low wall, so it's an escape move, but you can't clear cars or buildings. Zombies can't jump, and they still kill you if they touch you mid-air.
- Characters are drawn 25% smaller.

## User Stories

1. As a player, I want a map twice as wide and twice as long, so that there's room to run in 3D.
2. As a player, I want more buildings and objects on the bigger map, so that it doesn't feel empty.
3. As a player, I want to jump with Space or A / ✕, so that I can hop like in Fortnite.
4. As a player, I want to jump over crates and the low wall, so that I can escape over cover zombies have to walk around.
5. As a player, I want cars and buildings to still block me when I jump, so that the map still has proper walls.
6. As a player, I want to be unable to jump again until I land, so that there's no flying (no double jump).
7. As a player, I want a zombie touching me mid-air to still end the game, so that jumping isn't a cheat.
8. As a player, I want characters 25% smaller, so that the world feels bigger around me.
9. As a player, I want the top-down view to still show the whole map, so that it keeps working.
10. As a player, I want zombies to appear at random spots all over the map, never within 10 blocks of me, so that the bigger map doesn't mean long waits for zombies to walk in from the edge.
11. As a player, I want the 3D world brighter, so that I can see what's around me.

## Implementation Decisions

- **Arena:** 80 × 60 tiles of 20 px (1600 × 1200). The arena size is defined once, in the map module, and everything else uses it.
- **Pieces:**

  | Piece | Count |
  |---|---|
  | House | 4 |
  | Shed | 4 |
  | Car | 8 |
  | Low wall | 4 |
  | Crate | 16 |

  All the fairness rules from the obstacles spec still apply.
- **Obstacle heights (now part of the rules):**

  | Obstacle | Height |
  |---|---|
  | Crate | 40 |
  | Low wall | 36 |
  | Car | 56 |
  | Building wall | 96 |

  Hand-placed obstacles with no height count as infinitely tall, so the existing tests are unaffected.
- **Jumping (rules):**
  - The player has a height `z` above the ground. `input.jump` starts a jump only while `z` is 0.
  - A jump starts upward at 330 units/s, and gravity pulls down at 900 units/s². That gives a peak of about 60, and about 0.43 s spent above 40, which is enough to cross a crate while running.
  - The player is only pushed out of obstacles taller than their current `z`. If they come down onto something, it pushes them off sideways, because you can't stand on things.
  - Zombies, bullets and pathfinding ignore heights: zombies can't jump, and every obstacle still blocks bullets and zombies.
- **Controller:** `readGamepad` returns `jump` when A / ✕ is pressed. It still restarts the game after game over.
- **3D view:**
  - Characters are scaled to 0.75.
  - The camera height drops from 95 to 75, and the look-at height from 55 to 42, to match. The camera is still 130 behind.
  - The player is drawn at height `z`.
  - Bullet tracers fly at height 34, below crate and low-wall tops, so bullets visibly hit them.
  - The ground, sun, shadows and fog are sized to the bigger arena.
- **Zombie spawns (replaces the old "outside the edge, 250 px away" rule):**
  - A zombie appears at the centre of a random open tile anywhere on the map, including inside buildings, but never inside a wall.
  - It's always at least 10 tiles (200 px) from the player. It tries up to 30 random tiles, then falls back to the corner tile furthest from the player.
  - A zombie is wider than a tile, so it's pushed out of any wall it pokes into.
- **Lighting:** a lighter evening-blue sky and fog, stronger sky and sun light, an ambient light to lift shady walls, and lighter ground colours.
- **Top-down view:** the whole map is drawn scaled down to fit the 800 × 600 canvas. The HUD stays full size, and the player's drawing grows slightly while in the air.

## Testing Decisions

- **Map tests** use the arena size from the map module, and check the new piece counts and obstacle heights over 100 seeds.
- **Jump tests:**
  - You go up and come back down.
  - There's no double jump.
  - You clear a crate while running.
  - A car stops you even mid-jump.
- **Existing rule tests** are rewritten to use the arena centre and size, instead of the old 800 × 600 numbers.
- **Visuals and feel** are checked by playing and with screenshots.

## Out of Scope

- Standing on top of objects
- Crouching or sliding
- Fall damage
- Zombies jumping
- Shooting over low cover

## Further Notes

- 200 px is fairly close once zombies are fast: at round 45 speed (300/s), a zombie can reach you about 0.7 s after it appears. If late rounds feel unfair, the fix is to raise the minimum spawn distance.
