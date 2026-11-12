/** More falls than this and the level is lost. */
export const MAX_FALLS = 10;

/**
 * Stars for a finished level:
 *   0 falls      → 3 stars
 *   1–2 falls    → 2 stars
 *   3–10 falls   → 1 star
 *   11+ falls    → failed (0)
 */
export function starsFor(falls: number): number {
  if (falls <= 0) return 3;
  if (falls <= 2) return 2;
  if (falls <= MAX_FALLS) return 1;
  return 0;
}

/** Stars still reachable during play (shown at the top of the screen). */
export function starsRemaining(falls: number): number {
  return starsFor(falls);
}
