import type { LevelDef } from '../core/types';
import { B, L, M, P, S, level } from './builder';

/**
 * The 20 hand-made levels. Queues and lava distances tuned with scripts/tune-levels.ts
 * (lava = smallest distance that still allows 3 stars, plus slack; never burnt on move 1).
 *
 * Concepts:  1–3 tutorial (hand hint), one beam · 4–8 sub-beams · 9+ arms of different lengths.
 * Difficulty: regular levels alternate easy / medium and slowly ramp up;
 *             every 5th level is HARD, every 10th is VERY HARD (checked by a test using
 *             core/difficulty.ts → myopicRate).
 * Platform sizes: S (6), M (9), L (12) width units; a Tottler of weight w takes w + 1.
 */
export const LEVELS: LevelDef[] = [
  // 1 — tap left, tap right.
  level('1', B(2, P(M), P(M)), '1 1 1 1', 1.05, true),
  // 2 — a heavier Tottler appears.
  level('2', B(2, P(M), P(M)), '2 1 1 1 2 2', 1.3, true),
  // 3 — a small and a large platform; the big one arrives last.
  level('3', B(3, P(S), P(L)), '1 1 1 1 1 3', 1.15, true),
  // 4 — first sub-beam.
  level('4', B(3, B(2, P(S), P(S)), P(L)), '1 3 1 1 2 2 2', 0.9),
  // 5 — HARD: a touchy sub-beam and lots of heavy ones. Only one perfect path.
  level('5', B(2, B(1, P(S), P(M)), B(2, P(M), P(S))), '2 1 2 1 2 3 2 3 2', 1.55),

  // 6 — a sub-beam on each side.
  level('6', B(3, B(2, P(S), P(M)), B(2, P(M), P(S))), '2 2 1 3 1 1 1 3', 1.5),
  // 7 — one touchy sub-beam.
  level('7', B(2, B(1, P(S), P(M)), B(2, P(M), P(M))), '1 2 2 3 2 1 2 1', 1.5),
  // 8 — three levels deep.
  level('8', B(3, B(2, B(1, P(S), P(S)), P(M)), P(L)), '1 1 1 2 2 3 2 1 2', 1.05),
  // 9 — a long arm counts double.
  level('9', B(2, P(L), P(S), 1, 2), '1 2 2 1 2 1', 1.3),
  // 10 — VERY HARD: deep mobile, uneven arm, three big ones.
  level(
    '10',
    B(3, B(2, P(M), B(1, P(S), P(S))), B(2, P(M), P(L), 1, 2)),
    '1 2 3 2 1 3 1 1 2 3 1',
    1.3,
  ),

  // 11 — big ones on the long arm?
  level('11', B(3, P(L), P(M), 1, 2), '2 2 2 3 1 1 2', 1.3),
  // 12 — uneven sub-beam.
  level('12', B(3, B(2, P(S), P(M), 2, 1), P(L)), '3 1 1 3 2 3 1 1', 1.45),
  // 13 — two uneven sub-beams.
  level('13', B(3, B(2, P(S), P(L), 2, 1), B(2, P(L), P(S), 1, 2)), '1 1 3 1 3 2 1 1 2 2', 1.85),
  // 14 — long root arm.
  level('14', B(4, B(2, P(M), P(M)), B(2, P(M), P(L), 2, 1), 2, 1), '1 2 1 2 3 1 3 2 1 1', 1.6),
  // 15 — HARD: deep and uneven, mostly heavy Tottlers.
  level(
    '15',
    B(3, B(3, B(2, P(S), P(S)), P(M), 1, 2), B(2, P(L), P(M), 2, 1)),
    '2 2 2 1 2 3 3 2 2 2 2',
    1.75,
  ),

  // 16 — uneven root.
  level('16', B(3, B(2, P(S), P(M)), B(2, P(M), P(L), 1, 2), 1, 2), '2 1 3 1 2 2 1 1 2', 1.45),
  // 17 — touchy pair far out.
  level('17', B(3, B(2, B(1, P(S), P(S)), P(M), 2, 1), P(L)), '3 1 2 1 1 2 3 2 1 1', 1),
  // 18 — the long mobile.
  level(
    '18',
    B(4, B(2, P(S), B(2, P(S), P(S)), 2, 1), B(3, P(M), P(L), 1, 2)),
    '2 2 3 1 1 2 1 1 1 2',
    1.5,
  ),
  // 19 — lava close, uneven everywhere.
  level(
    '19',
    B(4, B(2, P(M), P(M), 1, 2), B(3, P(M), B(1, P(S), P(S)), 2, 1)),
    '1 2 1 2 2 1 3 1 2 1',
    0.9,
  ),
  // 20 — VERY HARD: the grand mobile. Four perfect paths only.
  level(
    '20',
    B(5, B(3, P(M), B(2, P(S), P(S), 1, 2), 2, 1), B(4, B(1, P(S), P(S)), P(L), 1, 2)),
    '1 1 3 2 1 3 1 1 2 2 2',
    1.65,
  ),
];
