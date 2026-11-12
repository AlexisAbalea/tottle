import type { LevelDef } from '../core/types';
import { B, L, M, P, S, level } from './builder';

/**
 * The 15 hand-made levels. Queues and lava distances were tuned with scripts/tune-levels.ts
 * (lava = smallest distance that still allows 3 stars, plus some slack).
 *  1–3   tutorial (animated hand shows where to tap), one beam
 *  4–8   sub-beams
 *  9–15  arms of different lengths (torque = weight × distance)
 * Platform sizes: S (6), M (9), L (12) width units; a Tottler of weight w takes w + 1.
 * Every level is checked by a test: it must be solvable with 3 stars.
 */
export const LEVELS: LevelDef[] = [
  // 1 — tap left, tap right.
  level('1', B(2, P(M), P(M)), '1 1 1 1', 1.05, true),
  // 2 — a heavier Tottler appears.
  level('2', B(2, P(M), P(M)), '2 1 1 1 2 2', 1.25, true),
  // 3 — a small and a large platform; the big one arrives last.
  level('3', B(3, P(S), P(L)), '2 1 1 1 1 3', 1.45, true),

  // 4 — first sub-beam.
  level('4', B(3, B(2, P(S), P(S)), P(L)), '3 2 1 2 3 1 1', 0.8),
  // 5 — a sub-beam on each side.
  level('5', B(3, B(2, P(S), P(M)), B(2, P(M), P(S))), '2 1 2 1 3 2 1 2', 1.4),
  // 6 — one touchy sub-beam.
  level('6', B(2, B(1, P(S), P(M)), B(2, P(M), P(M))), '2 1 1 2 2 2 1 1', 1.75),
  // 7 — three levels deep.
  level('7', B(3, B(2, B(1, P(S), P(S)), P(M)), P(L)), '2 2 1 3 2 2 1 3 2 1', 1.35),
  // 8 — big mobile.
  level('8', B(3, B(2, P(S), B(1, P(S), P(S))), B(2, P(M), P(M))), '2 2 3 1 2 2 1 1 1 1 3', 1.2),

  // 9 — a long arm counts double.
  level('9', B(2, P(L), P(S), 1, 2), '1 2 2 2 1 2', 1.2),
  // 10 — big ones on the long arm?
  level('10', B(3, P(L), P(M), 1, 2), '1 3 2 3 2 1 1', 1.3),
  // 11 — uneven sub-beam, lava close.
  level('11', B(3, B(2, P(S), P(M), 2, 1), P(L)), '3 2 1 1 2 1 1 3', 0.75),
  // 12 — two uneven sub-beams.
  level('12', B(3, B(2, P(S), P(L), 2, 1), B(2, P(L), P(S), 1, 2)), '1 2 1 3 1 2 1 2 1 3', 1.6),
  // 13 — long root arm.
  level('13', B(4, B(2, P(M), P(M)), B(2, P(M), P(L), 2, 1), 2, 1), '2 1 1 1 3 1 2 1 3 2', 2.05),
  // 14 — deep and uneven.
  level(
    '14',
    B(3, B(3, B(2, P(S), P(S)), P(M), 1, 2), B(2, P(L), P(M), 2, 1)),
    '2 1 2 1 2 1 3 1 3 1',
    1.5,
  ),
  // 15 — the grand mobile, lava very close.
  level(
    '15',
    B(4, B(2, P(S), B(2, P(S), P(S)), 2, 1), B(3, P(M), P(L), 1, 2)),
    '1 2 1 2 1 2 3 3 1 1 2',
    0.75,
  ),
];
