# Spec: CoD maps, characters with weapons, settings, round lighting

Status: ready-for-agent

## Problem Statement

Random layouts are fun, but I want to play on maps I know: blocky versions of CoD maps. I want to pick a character, with each character's gun playing differently. I want to change mouse and controller sensitivity, and I want rounds to feel different through the lighting.

## Solution

- **A start screen.** It has:
  - four survivors to choose from, each with their own gun;
  - a map choice: Random (one of the three CoD maps, picked for you), Nuketown, Shipment, Nacht der Untoten, or Random layout (the old generated maps).
- **Map look:** the maps are blocky fan versions of the CoD layouts, built from the same kind of blocks as before plus a few new ones (shipping containers, a school bus, picket fences, interior walls, tall boundary walls).
- **Pause menu:** P, Start / Options or Esc pauses the game. The pause menu has mouse and controller sensitivity sliders, saved for next time.
- **Lighting:** each round, the lighting picks a random brightness between 75% and 100% of the current brightness.

## User Stories

1. As a player, I want a start screen where I pick my survivor and map before playing, so that each game starts the way I want.
2. As a player, I want four survivors, each with their own gun, so that picking a character changes how I play.
3. As a player, I want the rifle to work as it does now (5 shots/s, one zombie per bullet), so that the original feel is still there.
4. As a player, I want a shotgun that fires a spread of 6 pellets slowly and only reaches a short distance, so that it's great up close and useless far away.
5. As a player, I want an SMG that fires very fast with a slight wobble, so that it sprays.
6. As a player, I want a sniper that fires slowly but whose bullet passes through up to 5 zombies in a line, so that lining zombies up is rewarded.
7. As a player, I want each survivor to look different and hold a different-looking gun, so that I can tell who I'm playing.
8. As a player, I want a Nuketown map: two houses facing each other across a street, a bus in the middle, cars, garages, fenced back yards, and a boundary wall around it all.
9. As a player, I want a Shipment map: a small walled yard packed with shipping containers, so that it's close and chaotic.
10. As a player, I want a Nacht der Untoten map: a bunker with a main room, side rooms and several broken doorways, with a yard outside, so that it plays like classic zombies.
11. As a player, I want "Random" to pick one of the three maps for me, so that I don't have to choose.
12. As a player, I want the old randomly generated layout still available, so that nothing I liked is lost.
13. As a player, I want zombies to only appear somewhere they can actually reach me, so that none get stuck outside Shipment's walls.
14. As a player, I want low picket fences I can jump, but not the bus, containers or boundary walls, so that jumping still works the same way.
15. As a player, I want to pause with P, Esc or Start / Options, so that I can take a break.
16. As a player, I want mouse sensitivity and controller sensitivity sliders in the pause menu, so that turning feels right to me.
17. As a player, I want my sensitivity remembered next time, so that I set it once.
18. As a player, I want to use the start screen and pause menu with a controller (D-pad and A), so that I don't need the mouse.
19. As a player, I want to go back to the start screen after a game over, so that I can change survivor or map.
20. As a player, I want each round to have a random brightness between 75% and 100%, fading in during the round break, so that rounds feel different.
21. As a player, I want the HUD to show the map name, so that I know where I am.
22. As a player on an Xbox controller, I want B to jump, and on a PlayStation controller, I want ✕ to jump, so that jumping is on the button I expect for my controller.

## Implementation Decisions

- **Weapons are rules** (in `game.js`). `createGame({ weapon })` takes `'rifle'` (the default), `'shotgun'`, `'smg'` or `'sniper'`:

  | Weapon | Shots/s | Bullet speed | Pellets | Spread | Range | Zombies per bullet |
  |---|---|---|---|---|---|---|
  | Rifle | 5 | 500 | 1 | 0 | unlimited | 1 |
  | Shotgun | 2 | 450 | 6 | fanned evenly across 20° | 320 | 1 |
  | SMG | 11 | 520 | 1 | wobble of up to ±4° | unlimited | 1 |
  | Sniper | 1.8 | 1200 | 1 | 0 | unlimited | 5 |

  The shotgun and sniper were buffed from 1.4/s with 260 range and 1/s after bot playtesting (see Further Notes). The fire cooldown carries leftover time between shots, so fast guns really fire at their rate.

  - The SMG's wobble follows a fixed pattern based on how many shots have been fired, not random numbers, so it's testable.
  - Aim assist turns the whole shot.
  - Walls stop every bullet.
  - A bullet never hits the same zombie twice.
- **Characters** (browser side) each pair a look with a weapon:
  - **Jack:** blue shirt, rifle (the current character).
  - **Rosa:** red jacket, shotgun.
  - **Kenji:** green hoodie, SMG.
  - **Ivy:** grey and black, sniper.
- **Hand-made maps** live in a new module of map layouts, written in tiles on the same 80 × 60 grid. They're built into the same `{ pieces, obstacles }` shape as generated maps.
  - **Buildings** list their doorways explicitly as a side and an offset.
  - **Every obstacle now carries its `kind`** (and its colour, if it has one), so drawing no longer has to work out which piece an obstacle belongs to.
  - **New kinds and heights:**

    | Kind | Height |
    |---|---|
    | Interior wall | 96 |
    | Boundary wall | 120 |
    | Shipping container | 100 |
    | Bus | 70 |
    | Picket fence | 30 |

  - **Choosing a map:** `createGame({ map })` takes `'nuketown'`, `'shipment'`, `'nacht'`, `'random'` (one of those three) or `'generated'`. Passing `seed` still means a generated map. With no options, `createGame` picks one of the three hand-made maps. `game.mapName` is shown in the HUD.
- **Zombie spawns:** a random open tile that the player can walk to, at least 10 tiles away. Shipment's walls leave most of the field unreachable, and this keeps zombies out of it.
- **No 1-tile gaps** in hand-made maps. A zombie is 24 wide, so it can't fit through a 20 px gap, but the pathfinding thinks it can, and the zombie gets wedged. A map test checks this.
- **Stuck zombies respawn** (a safety net, as in CoD Zombies). A zombie with no path to the player for 2 s, or one that moves less than 20 px over a whole 5 s window, reappears at a new spawn point. This stops one stuck zombie from blocking a round forever.
- **One flow-field search per step** is shared by spawning, pathfinding and the stuck check. It uses typed arrays to avoid garbage-collection stutters.
- **Camera collision** uses every obstacle taller than the camera (taller than 75), instead of only building walls.
- **Lighting** gets a new small module, `lighting.js`: `brightnessForRound(random)` returns a value between 0.75 and 1.
  - The 3D view scales its lights and sky by that value, fading towards it over about 2 s.
  - The top-down view darkens the map by the same amount.
  - A new random brightness is picked whenever a new round or game starts.
- **Menus** are HTML overlays on top of the game.
  - **Start screen:** survivor cards, map choices and a Play button.
  - **Pause menu:** two sensitivity sliders (0.2× to 3×), Resume, and Quit to start screen.
  - Sensitivity is saved in the browser.
  - The game doesn't advance while a menu is open. Losing the captured mouse in 3D (Esc) pauses the game.
  - **Controller:** `readGamepad` reports the D-pad and Y / △. On menus, the D-pad moves the selection and changes values, A / ✕ selects, and Start / Options resumes from pause. At game over, A / ✕ or Start / Options restarts, and Y / △ returns to the start screen.
- **Jump button depends on the controller.** `readGamepad` looks at the controller's name (`pad.id`). PlayStation controllers (Sony's vendor id 054c, "DualSense", "DUALSHOCK" or "Wireless Controller") jump with ✕ (button 0). Xbox and any other controller jumps with B (button 1). Space still jumps on the keyboard.
- **Keyboard:** P pauses. At game over, R restarts and M returns to the start screen.

## Testing Decisions

- **Weapons:**
  - The shotgun fires 6 pellets across 20°, at its fire rate, and the pellets vanish past their range.
  - The SMG fires at 11/s with a wobble that stays within ±4°.
  - The sniper bullet kills 3 zombies standing in a line.
  - A rifle bullet kills only the first of two zombies in a line.
  - Walls still stop sniper bullets.
- **Hand-made maps,** for each of the three:
  - No obstacles overlap.
  - Doorways are clear.
  - Everything is inside the arena.
  - The player's start is open.
  - Every building has a floor the player can reach.
  - There's plenty of reachable space.

  Also, `createGame({ map })` builds the right map and `'random'` only picks the three CoD maps.
- **Spawns on Shipment** all land inside its walls.
- **`readGamepad`:**
  - It reports the D-pad and Y / △.
  - An Xbox pad jumps on B and not A.
  - A PlayStation pad jumps on ✕.
  - An unknown pad is treated like an Xbox pad.
- **`brightnessForRound`** always gives a value between 0.75 and 1.
- **Menus, pause, sensitivity and how the maps and characters look** are checked by playing and with screenshots.

## Out of Scope

- Exact copies of the real CoD maps (these are blocky fan layouts)
- Multiple floors or stairs
- Mystery box, perks or weapon buying
- Reloading or ammo
- Weapon switching during a game
- Character abilities
- Unlocking characters
- Online leaderboards

## Further Notes

- If this game is ever published, the CoD map names should be changed, because they belong to Activision. The survivors use original names for the same reason.
- **Bot playtest (32 games: 4 maps × 4 weapons × 2):**
  - **Found:**
    - a stuck zombie on Shipment in almost every game, from a 1-tile gap behind a container (Nuketown had one too, between a fence and a car);
    - an average step time of 0.7 ms, with spikes up to 47 ms;
    - the sniper (rounds 2–11) and shotgun (10–15) far behind the SMG (34–45) and rifle (17–38).
  - **After the fixes:**
    - no stuck zombies;
    - 0.15 ms average step time;
    - shotgun rounds 11–25, sniper rounds 8–22.
  - **Still open:** the SMG is the strongest weapon. The bot aims perfectly, so this is worth checking with human players before nerfing it.
