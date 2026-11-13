import type { LevelDef } from '../core/types';
import { LEVELS } from './levels';
import { generatedLevel } from './generated';

/** Number of hand-made levels; after them, levels are generated from their number. */
export const HANDMADE_COUNT = LEVELS.length;

/** Level n (1-based). There is no last level. */
export function levelDef(n: number): LevelDef {
  return n <= HANDMADE_COUNT ? LEVELS[n - 1] : generatedLevel(n);
}
