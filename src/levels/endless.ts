import type { LevelDef, Weight } from '../core/types';
import { solveLevel } from '../core/solver';
import { B, L, M, P, S, build, fair } from './builder';

/** Small deterministic RNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Structure templates for endless mode, from easy to hard. */
const TEMPLATES = [
  () => B(2, P(M), P(M)),
  () => B(3, P(S), P(L)),
  () => B(3, B(2, P(S), P(S)), P(L)),
  () => B(3, P(L), P(M), 1, 2),
  () => B(3, B(2, P(S), P(M)), B(2, P(M), P(S))),
  () => B(3, B(2, P(S), P(M), 2, 1), P(L)),
  () => B(2, B(1, P(S), P(M)), B(2, P(M), P(M))),
  () => B(3, B(2, B(1, P(S), P(S)), P(M)), P(L)),
  () => B(3, B(2, P(S), P(L), 2, 1), B(2, P(L), P(S), 1, 2)),
  () => B(3, B(2, P(S), B(1, P(S), P(S))), B(2, P(M), P(M))),
];

/**
 * Endless mode: round `round` (0-based) of run `seed`. Harder templates, longer queues and
 * closer lava as rounds go by. Always solvable with zero falls (checked with the solver).
 */
export function endlessLevel(seed: number, round: number): LevelDef {
  const r = rng(seed * 7919 + round * 104729 + 1);
  const maxT = Math.min(TEMPLATES.length - 1, 1 + round);
  const minT = Math.max(0, maxT - 3);
  for (let attempt = 0; attempt < 100; attempt++) {
    const t = minT + Math.floor(r() * (maxT - minT + 1));
    const len = Math.min(11, 5 + Math.floor(round / 2) + Math.floor(r() * 3));
    const heavy = Math.min(0.25, 0.1 + round * 0.02);
    const queue: Weight[] = Array.from({ length: len }, () => {
      const x = r();
      return (x < heavy ? 3 : x < 0.55 ? 2 : 1) as Weight;
    });
    const root = build(fair(TEMPLATES[t](), Math.max(...queue)));
    if (!solveLevel({ id: 'x', root, queue, lavaGap: 5 })) continue;
    // lava: smallest safe distance + slack that shrinks over the run
    let lo = 0;
    let hi = 5;
    for (let k = 0; k < 8; k++) {
      const mid = (lo + hi) / 2;
      if (solveLevel({ id: 'x', root, queue, lavaGap: mid })) hi = mid;
      else lo = mid;
    }
    const slack = Math.max(0.2, 0.7 - round * 0.05);
    return { id: `E${round + 1}`, root, queue, lavaGap: Math.round((hi + slack) * 20) / 20 };
  }
  // Fallback: a trivially solvable level.
  return { id: `E${round + 1}`, root: build(B(2, P(M), P(M))), queue: [1, 1, 1, 1], lavaGap: 1.5 };
}
