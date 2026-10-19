# Spec: Controller support

Status: ready-for-agent

## Problem Statement

Zombie Arena can only be played with keyboard and mouse. I want to play it on a controller (Xbox or PlayStation), the way twin-stick games like Dead Ops Arcade are meant to be played.

## Solution

Plug in a controller (or connect it over Bluetooth), press any button, and play. The left stick moves you, and pushing it only partway makes you walk slower. The right stick turns to aim, and RT / R2 fires. A light aim assist nudges controller shots towards nearby zombies. Keyboard and mouse still work, and you can switch between them and the controller at any time.

## User Stories

1. As a player, I want to move with the left stick, so that I can play without a keyboard.
2. As a player, I want a gentle push on the left stick to move me slowly, so that I have fine control.
3. As a player, I want a full push in any direction, including diagonals, to move me at normal top speed and no faster, so that the controller doesn't give me an advantage.
4. As a player, I want small stick drift to be ignored (a "dead zone"), so that my character doesn't creep around when I'm not touching the stick.
5. As a player, I want the right stick to only turn where I'm aiming, not shoot, so that I can look around without wasting shots.
6. As a player, I want my character to keep facing my last aim direction when I let go of the right stick, so that it doesn't snap back.
7. As a player, I want to fire with RT / R2, so that shooting feels like a console shooter.
7a. As a player, I want a light aim assist when I use a controller, so that aiming with a stick is about as fair as aiming with a mouse.
8. As a player, I want to restart after game over with A / ✕ or Start / Options, so that I don't need the keyboard.
9. As a player, I want the keyboard and mouse to keep working, so that I can use whichever I like.
10. As a player, I want the game to follow whichever I used last (mouse or controller) for aiming, so that the two don't fight each other.

## Implementation Decisions

- **The game rules accept analog movement.** The input to `step` can include `moveX` and `moveY`, each between −1 and 1. The player moves at `PLAYER_SPEED ×` the length of that vector, capped at 1. When they aren't given, the WASD booleans work as before.
- **New pure controller module (no browser code).** `readGamepad(pad)` takes an object shaped like a browser `Gamepad` (`axes`, `buttons`) using the standard button layout. It returns:
  - `move`: the left stick, after the dead zone.
  - `aim`: a direction of length 1 from the right stick, or `null` if the stick is inside the dead zone.
  - `firing`: true if RT / R2 is pressed past halfway. The right stick never fires.
  - `restart`: true if A / ✕ or Start / Options is pressed.
  - `active`: true if any stick is outside the dead zone or any button is pressed.
- **Dead zone:** 0.2. Stick readings shorter than this count as zero. Readings longer than this are rescaled, so movement starts smoothly from 0 at the edge of the dead zone and reaches 1 at a full push.
- **Aim assist (a game rule):** the input to `step` can include `aimAssist`, a strength from 0 to 1. When a bullet is fired, the game finds the zombie whose direction is closest to the aim direction. If that zombie is within 30° of it, the bullet turns `aimAssist ×` the angle between them towards the zombie. The browser layer sends 0.05 (5%) when aiming with the controller and 0 when aiming with the mouse.
- **Standard mapping:** left stick is axes 0–1, right stick is axes 2–3, A / ✕ is button 0, RT / R2 is button 7 and Start / Options is button 9.
- **Browser layer:** reads the first connected controller every frame. Aiming follows whichever was used last: moving the mouse switches to the mouse, and using the controller switches to the controller. With the controller, the aim point is set 100 px from the player in the last aim direction, so the rules still receive a mouse position.

## Testing Decisions

- `readGamepad` is tested with fake pad objects. It has no browser code, so this needs no real controller.
- Analog movement is tested through `step`, like the other movement tests:
  - Half a stick push gives half speed.
  - Aim assist turns a bullet 5% of the way towards a zombie within 30°. It leaves the bullet alone when no zombie is within 30° or the strength is 0, and it picks the zombie closest to the aim direction.
  - A full diagonal push gives no more than full speed.
- Reading the browser's controller and switching between mouse and controller are checked by playing with a real controller.

## Out of Scope

- Remapping buttons
- Rumble
- Two-player co-op
- On-screen button prompts

## Further Notes

- Browsers only show a controller to a page after a button has been pressed while the page is open. So the first button press "wakes up" the controller.
