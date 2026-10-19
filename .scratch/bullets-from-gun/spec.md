# Spec: Bullets come out of the gun

Status: ready-for-agent

## Problem Statement

Bullets start from the middle of my character's body, at a fixed height. When I jump they still come out at waist height, so they never look like they're coming out of my gun.

## Solution

Every bullet starts at the end of the gun's barrel, at the gun's height, whatever you're doing: standing, running, mid-jump, with any survivor and any gun. Because bullets now fly at a real height, the height of cover matters for shooting just as it does for jumping.

## User Stories

1. As a player, I want bullets to start at the end of my gun, so that shooting looks right.
2. As a player, I want bullets fired mid-jump to come out at the height my gun is at, so that jump-shots look right.
3. As a player, I want longer guns (the sniper) to fire from further out than short ones (the SMG), so that each gun looks right.
4. As a player, I want my shots to fly over low walls and fences, which are below gun height, so that what I see matches what happens.
5. As a player, I want crates to still block standing shots, but to be able to jump-shoot over them, so that height means something.

## Implementation Decisions

- **Each weapon has a `muzzle` distance:** how far in front of the player's centre the barrel ends, in map units, after the 0.75 character scale.

  | Gun | Muzzle distance |
  |---|---|
  | Rifle | 26 |
  | Shotgun | 28 |
  | SMG | 20 |
  | Sniper | 36 |

- **The gun is held 3 units to the right of centre,** and at height 39 (`GUN_HEIGHT`).
- **A new bullet** starts at `player + aim direction × muzzle + right × 3`, with `z = player.z + GUN_HEIGHT`. Its direction is the same as before, so aim and aim assist don't change.
- **Bullets keep their height `z`.** An obstacle only stops a bullet if it's taller than the bullet. Obstacles with no height (tests) still count as infinitely tall.
  - Standing shots (z 39) now fly over low walls (36) and fences (30), but crates (40) and everything taller block them.
  - Jump-shots can clear crates, and at the top of a jump even cars and the bus.
- **Zombies are hit at any bullet height.** Zombies are 57 tall and a jump only reaches about 60, so this keeps jump-shots useful.
- **The 3D view** draws each tracer at its bullet's `z`, so tracers leave the barrel. The top-down view is unchanged, but its tracers now start at the barrel too.

## Testing Decisions

- A rifle bullet starts at the end of the barrel (26 in front, 3 to the right).
- The sniper fires from further out than the SMG.
- A bullet fired mid-jump starts higher than one fired standing.
- A standing shot flies over a low wall and kills the zombie behind it.
- A standing shot is stopped by a crate, but a jump-shot clears it.
- The existing aim and aim-assist tests keep passing, because the direction is unchanged.

## Out of Scope

- Bullet drop or arcs
- Aiming up or down
- Headshots
- Muzzle flash
