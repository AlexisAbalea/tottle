import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { generatedLevel } from './generated';
import { levelDef } from './catalog';
import { solveLevel } from '../core/solver';
import { depthOf, loneTottlerSafe, validateStructure } from '../core/structure';

describe('hand-made levels', () => {
  it('has 20 levels', () => expect(LEVELS).toHaveLength(20));

  // Physics branch: winnability and first-move safety are checked with real physics in
  // src/sim/sim.test.ts (the old rule-based solver no longer drives the game).
  for (const lv of LEVELS) {
    it(`level ${lv.id} is valid and fair`, () => {
      validateStructure(lv.root);
      expect(loneTottlerSafe(lv.root, Math.max(...lv.queue))).toBe(true);
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

describe('generated levels (after the hand-made ones)', () => {
  it('level n is always the same, fair and rule-solvable', () => {
    for (let n = 21; n <= 60; n++) {
      const a = generatedLevel(n);
      expect(a).toEqual(generatedLevel(n));
      expect(a.id).toBe(String(n));
      validateStructure(a.root);
      expect(loneTottlerSafe(a.root, Math.max(...a.queue))).toBe(true);
      expect(solveLevel(a)).not.toBeNull();
    }
  });

  it('the catalogue never ends', () => {
    expect(levelDef(20)).toBe(LEVELS[19]);
    expect(levelDef(21).id).toBe('21');
    expect(levelDef(5000).queue.length).toBeGreaterThan(3);
  });
});
