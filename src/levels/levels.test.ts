import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { endlessLevel } from './endless';
import { solveLevel } from '../core/solver';
import { myopicRate } from '../core/difficulty';
import { createGame, place } from '../core/game';
import { depthOf, validateStructure } from '../core/structure';

describe('hand-made levels', () => {
  it('has 20 levels', () => expect(LEVELS).toHaveLength(20));

  for (const lv of LEVELS) {
    it(`level ${lv.id} is valid and can be finished with 3 stars`, () => {
      validateStructure(lv.root);
      const sol = solveLevel(lv);
      expect(sol, `level ${lv.id} has no 3-star solution`).not.toBeNull();
      let g = createGame(lv);
      for (const pid of sol!) g = place(g, pid).state;
      expect(g.status).toBe('won');
      expect(g.falls).toBe(0);
    });

    it(`level ${lv.id}: no first move drops a platform into the lava`, () => {
      const g = createGame(lv);
      for (const p of g.platforms) expect(place(g, p.id).state.failReason).not.toBe('lava');
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

describe('difficulty curve', () => {
  // Every 5th level is a hard one, every 10th a very hard one; the others stay easy / medium.
  const rates = LEVELS.map((lv) => myopicRate(lv));

  it('each block of 5 ends with its hardest level', () => {
    for (let end = 5; end <= LEVELS.length; end += 5) {
      const block = rates.slice(end - 5, end - 1);
      expect(rates[end - 1], `level ${end}`).toBeLessThan(Math.min(...block));
      expect(rates[end - 1], `level ${end} should be hard`).toBeLessThanOrEqual(0.2);
    }
  });

  it('levels 10 and 20 are very hard: the hardest of their 10 and < 5% for a myopic player', () => {
    for (let end = 10; end <= LEVELS.length; end += 10) {
      const others = rates.slice(end - 10, end - 1);
      expect(rates[end - 1]).toBeLessThan(Math.min(...others));
      expect(rates[end - 1]).toBeLessThan(0.05);
    }
  });

  it('regular levels are not hard', () => {
    rates.forEach((r, i) => {
      if ((i + 1) % 5 !== 0) expect(r, `level ${i + 1}`).toBeGreaterThan(0.2);
    });
  });
});
