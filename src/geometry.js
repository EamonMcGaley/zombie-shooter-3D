// Shared shape maths for the rules and the camera.

// Where the line from `a` to `b` first enters `rect`, as a fraction from 0 (at a)
// to 1 (at b), or null if it misses. Uses the slab method: find where the line is
// inside the rectangle's x range and its y range, and check those overlap.
export function lineEntry(a, b, rect) {
  let enter = 0;
  let leave = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, rect.x, rect.x + rect.w],
    [a.y, b.y - a.y, rect.y, rect.y + rect.h],
  ]) {
    if (delta === 0) {
      if (start <= min || start >= max) return null;
      continue;
    }
    let t1 = (min - start) / delta;
    let t2 = (max - start) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    enter = Math.max(enter, t1);
    leave = Math.min(leave, t2);
    if (enter >= leave) return null;
  }
  return enter;
}

export function grow(rect, by) {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by };
}
