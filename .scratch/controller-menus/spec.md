# Spec: Using the menus with a controller

Status: ready-for-agent

## Problem Statement

With a controller I can't choose my survivor, choose the map, or change sensitivity.

- The start screen opens with the selection on PLAY, so left and right do nothing, and nothing says to press up.
- The pause menu opens on Resume, with the same problem.
- Only the D-pad works in menus, not the left stick.
- Holding a direction doesn't repeat.

## Solution

Menus open on the first thing you'd want to change. The left stick and the D-pad both move around, and holding a direction repeats. A confirms and moves on, B goes back, and Start is a shortcut.

## User Stories

1. As a controller player, I want the start screen to open with the survivors selected, so that pushing left or right changes my survivor straight away.
2. As a controller player, I want up and down to move between survivors, maps and PLAY, so that I can reach the map choice.
3. As a controller player, I want the left stick to work in menus as well as the D-pad, so that I can use whichever I reach for.
4. As a controller player, I want holding a direction to keep changing the value, so that I can sweep a sensitivity slider quickly.
5. As a controller player, I want A / ✕ to confirm my survivor and move to the map, then to PLAY, then start, so that I can go through the screen with one button.
6. As a controller player, I want B / ○ to go back a row (or resume, when paused), so that I can fix a mistake.
7. As a controller player, I want Start / Options to start the game straight away from the start screen, so that I can be quick.
8. As a controller player, I want the pause menu to open on controller sensitivity, so that left and right change it straight away.
9. As a player, I want the on-screen hints to say how to use the controller, so that I don't have to guess.

## Implementation Decisions

- **`readGamepad`** also returns `back` (B / ○, button 1).
  - On Xbox, B is also the jump button. That's fine, because jump only matters in-game and back only matters in menus.
- **New pure helper `menuDirections(controller, memory, dt)`** in the controller module. It turns the D-pad or left stick into menu moves:
  - The stick counts once it's pushed past 0.5, along whichever axis it's pushed furthest.
  - The first push gives one move. Holding gives another after 0.4 s, then one every 0.12 s.
  - Letting go resets it.
  - `memory` is an object the caller keeps between frames.
- **Menus:**
  - **Start screen:**
    - It opens on the survivor row.
    - Confirm moves survivors → map → PLAY → start the game.
    - Back moves up a row.
    - Clicking a card also selects its row.
  - **Pause menu:**
    - The rows are controller sensitivity, mouse sensitivity, Resume, and Quit to start screen. It opens on controller sensitivity.
    - Confirm does what the selected button does (on a slider, it moves down).
    - Back resumes.
  - **Keyboard:** the arrows move, Enter confirms, and Backspace goes back.
- **Hints** on both screens describe the controls for the controller, the keyboard and the mouse.

## Testing Decisions

- **`menuDirections`** is tested with fake controller readings:
  - a single press;
  - no repeat before 0.4 s, then repeats;
  - the stick works the same as the D-pad;
  - small stick drift is ignored;
  - letting go resets it.
- **The menus** are tested on a pretend web page (happy-dom), driven only through the menu's own controls (`navigate`, `confirm` and `back`), the way a controller would drive them:
  - The start screen opens on survivors, and right picks the next survivor.
  - Down then right changes the map.
  - Confirm walks through to PLAY and starts the game.
  - Back goes up a row.
  - The pause menu opens on controller sensitivity. Right and left change it by 0.1 and it's saved, within 0.2× to 3×.
  - Confirm on Quit quits, and back resumes.
- **`readGamepad`** reports B / ○ as `back`.

## Out of Scope

- Remapping buttons
- Rumble
- Navigating with the right stick
