# Spec: Zombie Arena (first playable)

Status: ready-for-agent

## Problem Statement

I'm learning how to develop software with AI, and I want a game I can actually play, not a demo. It has to run locally in my browser with almost instant feedback when I change something. I want a playable result within about an hour, built in a way I can keep extending later.

## Solution

A top-down, browser-based zombie shooter in the style of CoD Zombies / Dead Ops Arcade. You move with WASD and shoot towards the mouse. Zombies come in rounds: each round has more and faster zombies than the last, with a short pause between rounds. One touch from a zombie means game over. Your score is the round you reached, and your best round is remembered.

Characters are drawn top-down in code (no image files). The player is a person in a blue shirt holding a gun, turning to face the mouse. Zombies have green skin, ragged clothes, red eyes and arms reaching towards you, and their arms sway as they shamble. Bullets are short yellow tracers. Hitboxes stay as circles, so the drawings never change the rules.

## User Stories

1. As a player, I want to open the game in my browser and start playing straight away, so that there's nothing to set up.
2. As a player, I want to move with W, A, S and D, so that I can run away from zombies.
3. As a player, I want diagonal movement to be no faster than straight movement, so that movement feels fair.
4. As a player, I want to be stopped at the edges of the arena, so that I can't run off the screen.
5. As a player, I want to fire bullets towards my mouse cursor, so that I can aim while moving in a different direction.
6. As a player, I want to keep firing while I hold the mouse button, so that I don't have to click over and over.
7. As a player, I want a limit on how fast I fire, so that shooting has a rhythm and isn't a solid stream of bullets.
8. As a player, I want bullets to disappear when they leave the arena, so that the game doesn't slow down over time.
9. As a player, I want a zombie to die when a bullet hits it, so that I can fight back.
10. As a player, I want the bullet to disappear when it hits a zombie, so that one bullet kills only one zombie.
11. As a player, I want zombies to appear just outside the edge of the arena, so that they never appear on top of me.
12. As a player, I want zombies to walk straight towards me, so that they're always a threat.
13. As a player, I want zombies to start out slower than me, so that I can dodge them in the early rounds, like in CoD Zombies.
14. As a player, I want the game to end as soon as a zombie touches me, so that every round is tense.
15. As a player, I want the game to be split into numbered rounds, so that I can feel myself making progress.
16. As a player, I want each round to have a set number of zombies, so that I know a round ends when I've killed them all.
17. As a player, I want zombies to appear one at a time over the course of a round, so that I'm not swarmed instantly.
18. As a player, I want each round to have one more zombie than the last, up to a maximum of 30, so that the game keeps getting harder.
19. As a player, I want zombies to get faster every round until they overtake me, so that later rounds force me to shoot instead of run.
19a. As a player, I want zombie speed to keep creeping up by 1% a round once the zombie count has maxed out at 30, so that the game still gets harder after round 26.
19b. As a player, I want zombies never to be more than 1.5× my speed, so that the game stays possible to play.
20. As a player, I want a short pause showing the next round number when I clear a round, so that I can catch my breath, like in CoD Zombies.
21. As a player, I want to see the current round number while I play, so that I know how far I've got.
22. As a player, I want to see a "Game Over" screen showing the round I reached, so that I know how I did.
23. As a player, I want to press R after a game over to start again from round 1, so that I can quickly try again.
24. As a player, I want my best round saved in the browser and shown on screen, so that I have something to beat next time.
25. As a developer, I want to see my changes in the browser as soon as I save the code, so that I get feedback quickly.
26. As a developer, I want the game rules tested automatically, so that I can change the code without accidentally breaking the rules.

## Implementation Decisions

- **Platform:** browser only, written in plain JavaScript using an HTML canvas and no game engine. Vite runs the dev server, which reloads the page when code is saved. Vitest runs the tests. Both use the Node 24 already installed.
- **Arena:** a fixed 800×600 area.
- **Two parts, kept separate:**
  - **Game logic** (no browser code): creates a new game and advances it by one step, given the player's input and how much time has passed. It has no access to the canvas, keyboard, mouse or clock. This is the only part with automated tests.
  - **Browser layer:** reads the keyboard and mouse, runs the game loop, draws the current state on the canvas, and loads and saves the best round in the browser's storage.
- **Interface of the game logic:**
  - `createGame()` returns a new game state for round 1.
  - `step(state, input, dt)` returns the next state. `input` holds which movement keys are held, the mouse position and whether the mouse button is held. `dt` is the time passed, in seconds.
  - The state includes the player, zombies, bullets, round number, game phase (`playing`, `roundBreak`, or `gameOver`) and the timers.
  - Random choices, such as where a zombie spawns, come from a random-number function passed in when the game is created. That way tests can control them.
- **Starting values** (adjust them by playing):

  | Setting | Value |
  |---|---|
  | Player speed | 200 px/s |
  | Player radius | 12 px |
  | Fire rate | 5 shots/s |
  | Bullet speed | 500 px/s |
  | Bullet radius | 3 px |
  | Zombie radius | 12 px |
  | Zombies in round *n* | min(5 + (n − 1), 30): one more each round, max 30 from round 26 |
  | Zombie speed, rounds 1–26 | 100 + 6 × (n − 1) px/s: half your speed in round 1, faster than you from round 18, 250 by round 26 |
  | Zombie speed, round 27+ | 1% faster than the previous round (compounding), capped at 300 px/s (1.5× player speed), reached around round 45 |
  | Time between zombie spawns | 1.0 s, falling by 0.05 s each round, minimum 0.3 s |
  | Pause between rounds | 3 s |

- **Collisions:** every object is a circle. Two objects collide when the distance between their centres is less than or equal to the sum of their radii.
- **Rules for each step,** in this order: move the player (then keep them inside the arena), fire a bullet if allowed, move the bullets, remove bullets outside the arena, spawn a zombie if one is due, move the zombies, push overlapping zombies apart, remove zombies hit by bullets (along with those bullets), check whether a zombie touches the player (game over), then check whether the round is over.
- **Fair spawns:** a zombie spawns at a random point just outside the arena edge, at least 250 px from the player. If the random point is too close, pick again. Without this rule, a 300 px/s zombie could spawn right beside a player standing near a wall and kill them before they could react.
- **No stacking:** zombies that overlap are pushed apart until they just touch. Without this rule, all the zombies chasing you would merge into one blob, which looks wrong and is too easy to shoot.
- **Shooting:** the first bullet fires the moment the button is pressed. After that, bullets fire at the fire rate while the button is held.
- **Game start:** a new game opens with a 3-second "ROUND 1" pause, so you're ready before the first zombie appears.
- **Round breaks:** during a pause you can still move and shoot, but no zombies spawn.
- **End of a round:** a round is over when all of its zombies have spawned and been killed. The game then pauses for 3 seconds before starting round *n* + 1.
- **Score:** the round you were on when you died. Your best round is the highest score you've ever had in this browser.
- **On-screen info (HUD):** the current round, how many zombies are left this round, and your best round. Game over shows the round you reached and the text "Press R to restart".
- **Restart:** pressing R during game over creates a brand-new game.
- **Fixed time steps:** the browser layer always advances the game in steps of 1/60 s. If more time has passed (for example, on a slow frame), it runs several steps in a row, but never more than 0.25 s worth, so switching away from the tab doesn't make the game jump. Without this rule, one long frame could move a bullet past a zombie without the collision ever being checked.

## Testing Decisions

- **One thing to test: the game logic,** through `createGame` and `step` only. Tests check what a player would notice ("after this, the zombie is gone", "the round is now 2"), not how the code works inside.
- **No tests for drawing or input.** You check those by playing.
- **What to test:**
  - Movement, including diagonal speed and staying inside the arena.
  - Fire rate while the button is held.
  - Bullets moving and leaving the arena.
  - A bullet killing a zombie.
  - Zombies spawning outside the arena, at least 250 px from the player, and moving towards the player.
  - Overlapping zombies being pushed apart.
  - A new game starting in a "ROUND 1" pause with no zombies.
  - A zombie touching the player causes game over.
  - Zombie count per round (5 in round 1, 30 in round 26, still 30 in round 40).
  - Zombie speed per round (100 in round 1, 250 in round 26, 1% more in round 27, never above 300).
  - Clearing a round leads to the pause, then the next round.
- There are no existing tests in the repo to copy from yet, so this spec sets the pattern.

## Out of Scope

These are for later specs:

- Points and kills
- A shop between rounds, wall weapons or the mystery box
- Power-ups (Max Ammo, Nuke, Insta-Kill)
- Health, reloading and ammo
- Different zombie types
- Obstacles or walls inside the arena
- Image sprites, animations beyond the zombie arm sway, sound, or a menu screen
- Mobile or controller support
- Publishing the game online

## Further Notes

- The aim of the first hour is a version that's fun to play. The numbers above are starting guesses, and we'll change them after playing.
- A natural next spec is **points per kill and a shop between rounds**, which takes it further towards CoD Zombies.
- **Balance worries to check by playing:** in late rounds, 30 zombies at 1.5× your speed might be impossible with a single gun at 5 shots/s. If so, the first fixes are a faster fire rate or a pierce power-up, not slower zombies.
