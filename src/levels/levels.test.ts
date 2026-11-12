import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { endlessLevel } from './endless';
import { solveLevel } from '../core/solver';
import { createGame, place } from '../core/game';
import { depthOf, totalCapacity, validateStructure } from '../core/structure';

describe('hand-made levels', () => {
  it('has 15 levels', () => expect(LEVELS).toHaveLength(15));

  for (const lv of LEVELS) {
    it(`level ${lv.id} is valid and can be finished with 3 stars`, () => {
      validateStructure(lv.root);
      expect(totalCapacity(lv.root)).toBeGreaterThanOrEqual(lv.queue.length);
      const sol = solveLevel(lv);
      expect(sol, `level ${lv.id} has no 3-star solution`).not.toBeNull();
      let g = createGame(lv);
      for (const pid of sol!) g = place(g, pid).state;
      expect(g.status).toBe('won');
      expect(g.falls).toBe(0);
    });
  }

  it('follows the progression: 1-3 tutorial, 4-8 sub-beams, 9-15 uneven arms', () => {
    const uneven = (n: (typeof LEVELS)[number]['root']): boolean =>
      n.left.length !== n.right.length ||
      (n.left.child.kind === 'beam' && uneven(n.left.child)) ||
      (n.right.child.kind === 'beam' && uneven(n.right.child));
    LEVELS.forEach((lv, i) => {
      const n = i + 1;
      expect(!!lv.tutorial).toBe(n <= 3);
      if (n <= 3) expect(depthOf(lv.root)).toBe(1);
      if (n >= 4 && n <= 8) {
        expect(depthOf(lv.root)).toBeGreaterThan(1);
        expect(uneven(lv.root)).toBe(false);
      }
      if (n >= 9) expect(uneven(lv.root)).toBe(true);
    });
  });
});

describe('endless mode', () => {
  it('generates solvable, deterministic rounds', () => {
    for (let round = 0; round < 12; round++) {
      const a = endlessLevel(42, round);
      const b = endlessLevel(42, round);
      expect(a).toEqual(b);
      expect(solveLevel(a)).not.toBeNull();
    }
  });
});
