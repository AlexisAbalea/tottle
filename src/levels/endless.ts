import type { LevelDef, Weight } from '../core/types';
import { solveLevel } from '../core/solver';
import { totalCapacity } from '../core/structure';
import { B, P, build } from './builder';

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
  () => B(2, P(3), P(3)),
  () => B(3, B(2, P(2), P(2)), P(4)),
  () => B(3, B(2, P(2), P(2)), B(2, P(2), P(2))),
  () => B(3, P(4), P(3), 1, 2),
  () => B(3, B(2, P(2), P(3), 2, 1), P(4)),
  () => B(2, B(1, P(2), P(2)), B(2, P(3), P(3))),
  () => B(3, B(2, B(1, P(2), P(2)), P(3)), P(5)),
  () => B(3, B(2, P(2), P(3), 2, 1), B(2, P(3), P(2), 1, 2)),
  () => B(3, B(2, P(2), B(1, P(2), P(2))), B(2, P(3), P(3))),
  () => B(4, B(2, P(2), P(2)), B(2, P(3), P(4), 2, 1), 2, 1),
];

/**
 * Endless mode: round `round` (0-based) of run `seed`. Harder templates and longer queues
 * as rounds go by. Always solvable with zero falls (checked with the solver).
 */
export function endlessLevel(seed: number, round: number): LevelDef {
  const r = rng(seed * 7919 + round * 104729 + 1);
  const maxT = Math.min(TEMPLATES.length - 1, 1 + round);
  const minT = Math.max(0, maxT - 3);
  for (let attempt = 0; attempt < 200; attempt++) {
    const t = minT + Math.floor(r() * (maxT - minT + 1));
    const root = build(TEMPLATES[t]());
    const cap = totalCapacity(root);
    const len = Math.min(cap, 5 + Math.floor(round / 2) + Math.floor(r() * 3));
    const heavy = Math.min(0.3, 0.1 + round * 0.02);
    const queue: Weight[] = Array.from({ length: len }, () => {
      const x = r();
      return (x < heavy ? 3 : x < 0.55 ? 2 : 1) as Weight;
    });
    const lv: LevelDef = { id: `E${round + 1}`, root, queue };
    if (solveLevel(lv)) return lv;
  }
  // Fallback: a trivially solvable level.
  return { id: `E${round + 1}`, root: build(B(2, P(3), P(3))), queue: [1, 1, 1, 1] };
}
