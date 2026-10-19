// Round-by-round lighting. No browser code, so it can be tested.
// See .scratch/maps-characters-settings/spec.md.

export const DIMMEST = 0.75;
const FADE_SECONDS = 2;

// A random brightness for a new round: between 75% and 100% of full.
export function brightnessForRound(random = Math.random) {
  return DIMMEST + random() * (1 - DIMMEST);
}

// Moves part of the way from `current` to `target` (all of it after 2 s),
// so the light changes smoothly instead of jumping.
export function fadeTowards(current, target, dt) {
  return current + (target - current) * Math.min(1, dt / FADE_SECONDS);
}
