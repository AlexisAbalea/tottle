import type { LevelDef } from '../core/types';
import { B, P, level } from './builder';

/**
 * The 15 hand-made levels (queues tuned with scripts/tune-levels.ts).
 *  1–3   tutorial (animated hand shows where to tap), one beam
 *  4–8   sub-beams
 *  9–15  arms of different lengths (torque = weight × distance)
 * Every level is checked by a test: it must be solvable with 3 stars.
 */
export const LEVELS: LevelDef[] = [
  // 1 — tap left, tap right.
  level('1', B(1, P(2), P(2)), '1 1 1 1', true),
  // 2 — a heavier Tottler appears.
  level('2', B(2, P(3), P(3)), '2 1 1 2 1 1', true),
  // 3 — the big one; watch the queue.
  level('3', B(2, P(3), P(3)), '2 3 1 2 1 3', true),

  // 4 — first sub-beam.
  level('4', B(3, B(2, P(2), P(2)), P(4)), '2 1 2 2 1 1 3'),
  // 5 — a sub-beam on each side.
  level('5', B(3, B(2, P(2), P(2)), B(2, P(2), P(2))), '1 2 1 2 3 3 2 1'),
  // 6 — one touchy sub-beam.
  level('6', B(2, B(1, P(2), P(2)), B(2, P(3), P(3))), '1 2 2 2 2 1 1 1 2'),
  // 7 — three levels deep.
  level('7', B(3, B(2, B(1, P(2), P(2)), P(3)), P(5)), '1 1 2 3 1 2 1 2 2 3'),
  // 8 — big mobile.
  level('8', B(3, B(2, P(2), B(1, P(2), P(2))), B(2, P(3), P(3))), '2 1 1 2 3 2 1 2 3 1 1 1'),

  // 9 — a long arm counts double.
  level('9', B(2, P(4), P(2), 1, 2), '1 2 2 2 2 1'),
  // 10 — big ones on the long arm?
  level('10', B(3, P(4), P(3), 1, 2), '1 3 2 2 3 1 1'),
  // 11 — uneven sub-beam.
  level('11', B(3, B(2, P(2), P(3), 2, 1), P(4)), '3 1 3 1 1 1 2 3'),
  // 12 — two uneven sub-beams.
  level('12', B(3, B(2, P(2), P(3), 2, 1), B(2, P(3), P(2), 1, 2)), '2 2 2 2 2 3 1 1 3 1'),
  // 13 — long root arm.
  level('13', B(4, B(2, P(2), P(2)), B(2, P(3), P(4), 2, 1), 2, 1), '2 2 1 2 2 2 1 1 3 1 3'),
  // 14 — deep and uneven.
  level(
    '14',
    B(3, B(3, B(2, P(2), P(2)), P(3), 1, 2), B(2, P(3), P(2), 2, 1)),
    '1 1 1 1 3 2 1 1 3 2 2 2',
  ),
  // 15 — the grand mobile.
  level(
    '15',
    B(4, B(2, P(2), B(2, P(2), P(2), 1, 2), 2, 1), B(3, B(1, P(2), P(2)), P(4), 1, 2)),
    '2 1 2 3 1 2 2 2 1 3 1 2 1',
  ),
];
