# Spec: Play on phones and tablets (and publish online)

Status: ready-for-agent

## Problem Statement

I can only play on a PC with a keyboard, mouse or controller. I want to play on my phone with touch controls like Fortnite mobile, and I want to open it from anywhere, not just my PC.

## Solution

- **Touch controls on touch screens:**
  - A floating joystick under the left thumb moves you.
  - Dragging on the right half of the screen looks around.
  - FIRE and JUMP buttons sit on the right. Dragging while holding FIRE also aims, like Fortnite.
  - A pause button sits in the top corner.
- **On phones:**
  - The graphics get lighter: no shadows and a lower resolution.
  - The page can't be zoomed or scrolled by accident.
  - Turning the phone sideways is asked for if it's held upright.
- **Online:** the game is built into a folder of files that can be uploaded to a free website host. Before it goes public, the CoD map names are replaced with original names.

## User Stories

1. As a phone player, I want a joystick that appears wherever I put my left thumb, so that I don't have to find an exact spot.
2. As a phone player, I want pushing the joystick further to move me faster, like a controller stick, so that I can walk or run.
3. As a phone player, I want to drag anywhere on the right half to look around, so that turning feels like Fortnite mobile.
4. As a phone player, I want a FIRE button I can hold, and drag to aim while firing, so that I can shoot and turn at once.
5. As a phone player, I want a JUMP button, so that I can jump over crates.
6. As a phone player, I want a pause button, so that I can reach the pause menu and sensitivity.
7. As a phone player, I want a touch sensitivity slider in the pause menu, saved like the others, so that turning speed suits me.
8. As a phone player, I want "Play again" and "Menu" buttons on the game-over screen, because I have no R key or controller.
9. As a phone player, I want the light aim assist that controllers get, because aiming with a thumb is hard.
10. As a phone player, I want the start screen and pause menu to work by tapping, so that I can choose my survivor, map and settings.
11. As a phone player, I want the page not to zoom, scroll or select text when I tap fast, so that the controls never break.
12. As a phone player, I want to be told to turn my phone sideways when it's upright, so that the game has room.
13. As a phone player, I want the game to run smoothly, even if it looks a bit plainer, so that it's playable.
14. As a phone player, I want the game to go fullscreen when I press Play (where the phone allows it), so that it fills the screen.
15. As a player on a PC, I want nothing to change for me: no touch buttons and the same graphics.
16. As the game's maker, I want a published version I can share with a link, without Activision's map names in it.

## Implementation Decisions

- **Touch detection:** the touch controls and phone graphics switch on when the device's main pointer is "coarse" (a finger), or when it reports touch points. A PC with a mouse is unaffected.
- **New pure module `touch.js` (no browser code):**
  - `joystickVector(start, current, radius)` returns `{ x, y }`, each between −1 and 1. It ignores a small dead zone (15% of the radius) and caps the vector at full strength beyond the radius. Up on screen is negative y, like a controller stick.
  - `lookTurn(dx, sensitivity)` returns the yaw change for a horizontal drag of `dx` pixels: `dx × 0.006 × sensitivity`.
- **Touch layer** (browser): a full-window layer above the game, shown only on touch devices.
  - **Left half:** each new touch there starts the joystick at that point. Its ring and knob are drawn, it follows the finger, and it disappears on release. Its vector feeds forward/strafe like the left stick.
  - **Right half:** a touch that isn't on a button turns the camera as it drags.
  - **FIRE:** holding it fires, and dragging it also turns.
  - **JUMP:** tapping it jumps.
  - **Pause (‖):** tapping it opens the pause menu.
  - **Multitouch:** each finger is tracked by its own id, so moving, looking and firing all work at once.
  - **Game over:** "Play again" and "Menu" buttons appear.
  - **Upright phone:** a "Turn your phone sideways" message covers the screen.
- **Settings** gain `touch` (0.2× to 3×, default 1), with a third slider, "Touch sensitivity", added to the pause menu after the other two.
- **Aim assist:** touch aiming gets the same 5% as the controller.
- **The page:**
  - Zooming is turned off (`maximum-scale=1, user-scalable=no`).
  - The game area has `touch-action: none` and no text selection.
  - Pressing Play on a touch device asks for fullscreen and landscape. If the phone refuses, nothing happens and the game carries on.
- **Phone graphics:** `createView3D(canvas, { light: true })` turns shadows off, turns antialiasing off and draws at no more than 1.25× pixel density.
- **Publishing:**
  - `npm run build` makes a `dist` folder that works from any web address (relative paths, so it works in a sub-folder like GitHub Pages).
  - The debug hook isn't included.
  - The CoD map names are replaced before publishing, with the new names agreed with the user.
  - Uploading the folder is done by the user, on their own account, after they confirm.

## Testing Decisions

- **`touch.js`:**
  - No movement inside the dead zone.
  - Full strength at the radius and beyond, never more than 1.
  - Half-way gives about half strength.
  - Up is negative y.
  - `lookTurn` scales with sensitivity.
- **Menus:** the pause menu's Resume and Quit are now further down. The existing tests are updated, and a new one checks that the touch sensitivity row works.
- **In a phone-sized Chrome with touch** (Puppeteer's touch emulation):
  - The touch layer shows.
  - Tapping Play starts the game.
  - Dragging the joystick moves the player.
  - Dragging on the right turns the view.
  - Holding FIRE fires.
  - The pause button pauses.
  - The game-over buttons work.
  - There are no page errors.
- **On a desktop-sized window without touch:** no touch layer.

## Out of Scope

- An installable app (PWA or app stores)
- Rumble and haptics
- Gyro aiming
- Remapping or moving the touch buttons
- Running offline after it's published
- Online accounts or leaderboards
