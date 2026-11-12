import type { LevelDef } from './types';
import { createGame, place } from './game';

/** Small deterministic RNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Difficulty measure: share of "myopic" players who get 3 stars. A myopic player picks at
 * random among the moves that are safe right now (no fall, no lava), without looking ahead.
 * 1 = trivial, 0 = needs real planning. Deterministic (seeded) so tests can rely on it.
 */
export function myopicRate(level: LevelDef, runs = 200, seed = 1): number {
  const r = rng(seed);
  let ok = 0;
  for (let n = 0; n < runs; n++) {
    let g = createGame(level);
    while (g.status === 'playing') {
      const ids = g.platforms.map((p) => p.id);
      const safe = ids.filter((id) => {
        const s = place(g, id).state;
        return s.falls === g.falls && s.status !== 'failed';
      });
      const pool = safe.length ? safe : ids;
      g = place(g, pool[Math.floor(r() * pool.length)]).state;
    }
    if (g.status === 'won' && g.falls === 0) ok++;
  }
  return ok / runs;
}
