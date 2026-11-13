import type { LevelDef } from '../core/types';
import { B, L, M, P, S, level } from './builder';

/**
 * The 20 hand-made levels. Queues tuned with scripts/tune-levels.ts (rule model);
 * physics branch: lava distances re-derived with real physics by scripts/physics-lava.ts
 * (no single first drop reaches the lava, and the physics bot can win).
 *
 * Fairness: a lone Tottler never tips a beam (tolerance ≥ heaviest weight × longest arm).
 * Concepts:  1–3 tutorial (hand hint), one beam · 4–8 sub-beams · 9+ arms of different lengths.
 * Difficulty: regular levels alternate easy / medium and slowly ramp up;
 *             every 5th level is HARD, every 10th is VERY HARD (checked by a test using
 *             core/difficulty.ts → myopicRate).
 * Platform sizes: S (6), M (9), L (12) width units; a Tottler of weight w takes w + 1.
 */
export const LEVELS: LevelDef[] = [
  // 1 — tap left, tap right.
  level('1', B(2, P(M), P(M)), '1 1 1 1', 1.15, true),
  // 2 — a heavier Tottler appears.
  level('2', B(2, P(M), P(M)), '2 1 1 1 2 2', 1.4, true),
  // 3 — a small and a large platform; the big one arrives last.
  level('3', B(3, P(S), P(L)), '1 1 1 1 1 3', 1.25, true),
  // 4 — first sub-beam.
  level('4', B(3, B(3, P(S), P(S)), P(L)), '1 3 1 2 2 2 2', 1),
  // 5 — HARD: a sub-beam on each side, lots of big ones.
  level('5', B(3, B(3, P(S), P(M)), B(3, P(M), P(S))), '2 3 2 1 3 1 2 2 3', 1.25),

  // 6 — same mobile, kinder queue.
  level('6', B(3, B(3, P(S), P(M)), B(3, P(M), P(S))), '3 2 3 1 2 2 3 2', 1.8),
  // 7 — one side has more room.
  level('7', B(3, B(3, P(S), P(M)), B(3, P(M), P(M))), '2 1 2 3 2 3 2 2', 1.35),
  // 8 — three levels deep.
  level('8', B(3, B(3, B(3, P(S), P(S)), P(M)), P(L)), '2 1 3 2 1 2 2 3 1', 1.55),
  // 9 — a long arm counts double.
  level('9', B(6, P(L), P(S), 1, 2), '1 3 1 2 2 2', 1.05),
  // 10 — VERY HARD: deep mobile, uneven arm, six big ones.
  level(
    '10',
    B(3, B(3, P(M), B(3, P(S), P(S))), B(6, P(M), P(L), 1, 2)),
    '2 1 3 3 3 3 1 2 3 2 3',
    1.8,
  ),

  // 11 — big ones on the long arm?
  level('11', B(6, P(L), P(M), 1, 2), '3 3 2 1 2 1 2', 1.25),
  // 12 — uneven sub-beam, lava close.
  level('12', B(3, B(6, P(S), P(M), 2, 1), P(L)), '1 3 2 1 3 1 1 2', 1.15),
  // 13 — two uneven sub-beams.
  level('13', B(3, B(6, P(S), P(L), 2, 1), B(6, P(L), P(S), 1, 2)), '2 2 2 2 3 1 2 2 3 3', 1.45),
  // 14 — long root arm.
  level('14', B(6, B(3, P(M), P(M)), B(6, P(M), P(L), 2, 1), 2, 1), '1 1 2 1 2 2 1 3 3 2', 1.8),
  // 15 — HARD: deep and uneven, lava close.
  level(
    '15',
    B(3, B(6, B(3, P(S), P(S)), P(M), 1, 2), B(6, P(L), P(M), 2, 1)),
    '1 3 2 1 1 2 3 3 3 2 1',
    1.75,
  ),

  // 16 — uneven root.
  level('16', B(6, B(3, P(S), P(M)), B(6, P(M), P(L), 1, 2), 1, 2), '2 2 1 1 2 1 3 2 2', 1.75),
  // 17 — a small pair far out.
  level('17', B(3, B(6, B(3, P(S), P(S)), P(M), 2, 1), P(L)), '3 2 3 1 2 2 1 3 1 1', 1.9),
  // 18 — the long mobile.
  level(
    '18',
    B(4, B(6, P(S), B(3, P(S), P(S)), 2, 1), B(6, P(M), P(L), 1, 2)),
    '2 1 3 3 3 1 2 1 2 3',
    1.2,
  ),
  // 19 — lava very close, uneven everywhere.
  level(
    '19',
    B(4, B(6, P(M), P(M), 1, 2), B(6, P(M), B(3, P(S), P(S)), 2, 1)),
    '1 2 2 1 1 1 2 2 3 3',
    1.4,
  ),
  // 20 — VERY HARD: the grand mobile.
  level(
    '20',
    B(5, B(6, P(M), B(6, P(S), P(S), 1, 2), 2, 1), B(6, B(3, P(S), P(S)), P(L), 1, 2)),
    '2 2 2 2 2 3 2 3 3 1 3',
    1.3,
  ),
];
