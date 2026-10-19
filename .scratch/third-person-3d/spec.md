# Spec: 3D third-person view

Status: ready-for-agent

## Problem Statement

The game is top-down, but I want it to feel like Fortnite or CoD Zombies. I want to be behind my character in 3D, look around with the mouse or right stick, and see buildings and zombies at ground level.

## Solution

A real 3D view with a camera over your right shoulder, about as far back as Fortnite's. Your character sits slightly left of centre, and a crosshair marks the centre of the screen. The mouse or right stick turns you and the camera together. WASD or the left stick moves you relative to where you're facing. RT or the left mouse button fires at the crosshair. The map, zombies and rules are exactly the same as before: only the view and the controls change. Pressing V (or View / Share on a controller) switches back to the old top-down view.

## User Stories

1. As a player, I want the camera behind and slightly to the right of my character, about as far back as in Fortnite, so that it feels like a real third-person shooter.
2. As a player, I want to turn left and right by moving the mouse, so that I can look around.
3. As a player, I want to turn with the right stick, faster the further I push it, so that I can look around on a controller.
4. As a player, I want W / left stick up to move me the way I'm facing, and A/D to strafe sideways, so that movement feels like Fortnite.
5. As a player, I want a crosshair in the centre of the screen, and my bullets to go where it points, so that I can aim.
6. As a player, I want my character to face where I'm aiming, so that it looks right.
7. As a player, I want the camera to move in closer rather than going through a wall when I back up against a building, so that I never lose sight of my character.
8. As a player, I want low things (crates, cars, the low wall) not to push the camera in, so that the camera doesn't jump around.
9. As a player, I want 3D buildings with walls I can walk between, cars, crates and a low wall, so that the map from the last spec looks real.
10. As a player, I want blocky 3D zombies with green skin, red eyes and arms reaching out, whose legs move as they walk, so that they look like zombies.
11. As a player, I want my character to be a blocky person in a blue shirt holding a gun, so that I can tell where I am.
12. As a player, I want the area beyond the arena to fade into fog, so that zombies coming in from the edges appear out of the darkness.
13. As a player, I want bullets shown as glowing yellow tracers, so that I can see my shots.
14. As a player, I want the round number, zombies left, best round and map seed on screen, as before, so that I know how I'm doing.
15. As a player, I want to click the game to capture the mouse (and press Esc to release it), so that I can turn without the pointer leaving the window.
16. As a player, I want V or View / Share to switch between the 3D view and the old top-down view, so that I can choose.
17. As a player, I want the game to fill as much of my window as it can, so that 3D isn't tiny.

## Implementation Decisions

- **The rules don't change.** The game is still worked out on the flat 2D map (`game.js` and its tests are untouched). 3D is only how it's drawn, plus how the controls are turned into the same input as before.
- **Scale:** 1 game unit = 1 px of the old map, which is about 2.4 cm. Heights:

  | Thing | Height |
  |---|---|
  | Characters | 74 (about 1.8 m) |
  | Building walls | 96 |
  | Cars | 56 |
  | Low wall | 36 |
  | Crates | 40 |
  | Bullets (fly at chest height) | 50 |

- **Camera (Fortnite-like):**
  - It sits 130 units behind the player, 30 to the right and 95 up.
  - It looks along your facing direction, tilted slightly down. Looking up and down isn't included, because bullets fly flat.
  - Its field of view is 65° vertically.
- **Camera collision:** if a building wall is between the player and where the camera wants to be, the camera moves in to just in front of the wall. Only building walls count, because cars, crates and the low wall are below the camera.
- **Aiming:** the browser layer turns the camera's facing into the same aim point the rules already understand: a point 400 units out from the camera along the facing direction. Bullets fly from the player to that point, so they cross the crosshair at about that distance. Controller aim assist (5%) still applies.
- **New pure module (no browser code):** `camera.js`.
  - `moveFromInput(forward, strafe, yaw)` turns forward/sideways input into map directions (`moveX`, `moveY`).
  - `cameraPosition(player, yaw, walls)` returns the camera's map position after camera collision.
  - `aimPoint(camera, yaw)` returns the point the rules should aim at.
  - Shared line-versus-rectangle maths moves into a small `geometry.js` used by both `game.js` and `camera.js`.
- **Controller:** `readGamepad` also returns `look`, the right stick with its strength kept (not just its direction). Turning speed is up to 3 radians per second (about 170°/s) at a full push. View / Share (button 8) switches views.
- **Mouse:** clicking the game captures the mouse (pointer lock). Turning is 0.0025 radians per pixel of mouse movement, and Esc releases the mouse. While the mouse is captured, the left button fires.
- **3D drawing** (a new browser module using Three.js):
  - Builds the map's meshes once per game.
  - Reuses meshes for zombies and bullets.
  - Animates legs from each character's position, so they only move when the character moves.
  - Uses fog from about 300 units away, a dark dusk sky, and a sun that casts shadows.
  - Buildings have **no roofs**, like ruined buildings, so the camera never has to go inside a roof.
- **HUD:** drawn on a 2D canvas laid over the 3D view. It shows:
  - the same text as before;
  - a crosshair;
  - the "ROUND n" and "GAME OVER" screens;
  - a "Click to look around" prompt while the mouse isn't captured.
- **Top-down view:** kept exactly as it is now, behind the V toggle. It uses the old world-direction movement and mouse aiming.

## Testing Decisions

- **`camera.js` is tested directly:**
  - Forward and strafe movement point the right way for different facings.
  - The camera sits behind and to the right of the player.
  - The camera moves in front of a wall that's behind the player.
  - The aim point is straight ahead of the camera.
- **`readGamepad`** is tested to return `look` with its strength.
- **`game.js` tests** stay as they are and must keep passing after the geometry move.
- **3D drawing, pointer lock and the feel of the camera** are checked by playing.

## Out of Scope

- Looking up and down, and shooting up or down
- Aim-down-sights or zoom
- Roofs and building interiors with ceilings
- Textures or imported 3D models (everything is coloured blocks)
- Sound
- First-person view
- Changing mouse sensitivity in-game (it's a constant in the code)
- A bigger map

## Further Notes

- The map is the same size as before, so in 3D it's a compact arena (about 19 m × 14 m), more Nacht der Untoten than Fortnite island. A bigger map could be a later spec.
- Because everything is blocks with colours, there are no image files to load, and the game still works offline.
