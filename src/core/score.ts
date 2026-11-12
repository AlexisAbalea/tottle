/** At this many falls the level is lost. */
export const MAX_FALLS = 10;

/**
 * Stars for a finished level (every fall costs):
 *   0 falls      → 3 stars
 *   1 fall       → 2 stars
 *   2–9 falls    → 1 star (finishing always keeps one)
 *   10+ falls    → lost (0)
 */
export function starsFor(falls: number): number {
  if (falls <= 0) return 3;
  if (falls === 1) return 2;
  if (falls < MAX_FALLS) return 1;
  return 0;
}

/** Stars still reachable during play (shown at the top of the screen). */
export function starsRemaining(falls: number): number {
  return starsFor(falls);
}
