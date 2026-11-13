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

/** Structure templates for generated levels, from easy to hard. */
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
 * Level n (> the hand-made ones), generated from its number: always the same level for the
 * same n. Difficulty ramps up slowly; every 5th level is harder, every 10th much harder.
 * Rule-solvable with zero falls; the lava distance is then adjusted with real physics by
 * `physicsLavaGap` (sim/bot.ts) before playing.
 */
export function generatedLevel(n: number): LevelDef {
  const r = rng(n * 7919 + 104729);
  let round = Math.min(30, Math.floor((n - 21) / 2));
  if (n % 10 === 0) round += 8;
  else if (n % 5 === 0) round += 4;
  const maxT = Math.min(TEMPLATES.length - 1, 2 + round);
  const minT = Math.max(0, maxT - 4);
  for (let attempt = 0; attempt < 100; attempt++) {
    const t = minT + Math.floor(r() * (maxT - minT + 1));
    const len = Math.min(12, 6 + Math.floor(round / 3) + Math.floor(r() * 3));
    const heavy = Math.min(0.3, 0.12 + round * 0.015);
    const queue: Weight[] = Array.from({ length: len }, () => {
      const x = r();
      return (x < heavy ? 3 : x < 0.55 ? 2 : 1) as Weight;
    });
    const root = build(fair(TEMPLATES[t](), Math.max(...queue)));
    if (!solveLevel({ id: 'x', root, queue, lavaGap: 5 })) continue;
    // lava (rule model): smallest distance that keeps a zero-fall solution
    let lo = 0;
    let hi = 5;
    for (let k = 0; k < 8; k++) {
      const mid = (lo + hi) / 2;
      if (solveLevel({ id: 'x', root, queue, lavaGap: mid })) hi = mid;
      else lo = mid;
    }
    return { id: String(n), root, queue, lavaGap: Math.ceil(hi * 20) / 20 };
  }
  return { id: String(n), root: build(B(2, P(M), P(M))), queue: [1, 1, 1, 1], lavaGap: 1.5 };
}
