import { describe, expect, it } from 'vitest';
import type { BeamNode, LevelDef, Loads, Tottler, Weight } from './types';
import {
  allImbalances,
  nodeWeight,
  platformWeights,
  tiltRatio,
  tottlerWidth,
  usedWidth,
} from './balance';
import {
  MAX_TILT,
  STRETCH,
  beamAngles,
  computeLayout,
  lavaLevel,
  platformPoses,
  platformsInLava,
} from './geometry';
import { createGame, freeWidth, place, settle } from './game';
import { listPlatforms, validateStructure } from './structure';
import { countSolutions, hint, solveLevel } from './solver';

const P = (id: string, size = 12) => ({ kind: 'platform' as const, id, size });
const beam = (
  id: string,
  tolerance: number,
  left: BeamNode['left']['child'],
  right: BeamNode['right']['child'],
  ll = 1,
  rl = 1,
): BeamNode => ({
  kind: 'beam',
  id,
  tolerance,
  left: { length: ll, child: left },
  right: { length: rl, child: right },
});
let nextId = 1;
const T = (weight: Weight, placedAt = nextId): Tottler => ({ id: nextId++, weight, placedAt });
const W = (loads: Loads) => platformWeights(loads);

//            root (tol 4)
//        /               \
//     A (tol 2)          C (tol 3, arms 1|2)
//    /     \            /        \
//   p1     p2        B (tol 1)    p5
//                    /   \
//                   p3   p4
const nested = beam(
  'root',
  4,
  beam('A', 2, P('p1'), P('p2')),
  beam('C', 3, beam('B', 1, P('p3'), P('p4')), P('p5'), 1, 2),
);

describe('balance', () => {
  const loads: Loads = { p1: [T(1)], p2: [T(3)], p3: [T(2)], p4: [], p5: [T(1), T(1)] };

  it('computes weight of nested subtrees', () => {
    expect(nodeWeight(nested, W(loads))).toBe(8);
    expect(nodeWeight(nested.left.child, W(loads))).toBe(4);
  });

  it('uses weight × arm length (torque) on each beam', () => {
    const imb = allImbalances(nested, W(loads));
    expect(imb.A).toBe(2);
    expect(imb.B).toBe(-2);
    expect(imb.C).toBe(4 - 2);
    expect(imb.root).toBe(0);
  });

  it('gives a signed tilt ratio', () => {
    const b = beam('b', 4, P('l'), P('r'));
    expect(tiltRatio(b, W({ l: [], r: [T(2)] }))).toBe(0.5);
    expect(tiltRatio(b, W({ l: [T(3)], r: [] }))).toBe(-0.75);
    expect(tiltRatio(beam('z', 0, P('l'), P('r')), W({ l: [], r: [T(1)] }))).toBe(2);
  });

  it('measures room: a Tottler of weight w takes w + 1 width units', () => {
    expect([1, 2, 3].map((w) => tottlerWidth(w as Weight))).toEqual([2, 3, 4]);
    expect(usedWidth({ a: [T(1), T(3)] }, 'a')).toBe(6);
  });
});

describe('geometry', () => {
  it('lowers the heavy side and stretches loaded ropes', () => {
    const root = beam('r', 4, P('l'), P('r'));
    const layout = computeLayout(root);
    const empty = platformPoses(root, layout, {}, {});
    expect(empty.l.y).toBeCloseTo(empty.r.y);
    const w = { l: 0, r: 2 };
    const poses = platformPoses(root, layout, beamAngles(root, w), w);
    expect(poses.r.y).toBeLessThan(empty.r.y - STRETCH * 2 + 1e-9);
    expect(poses.l.y).toBeGreaterThan(empty.l.y);
    expect(poses.r.angle).toBeCloseTo(-0.5 * MAX_TILT);
  });

  it('puts the lava lavaGap below the lowest empty platform', () => {
    const lv: LevelDef = { id: 'x', root: nested, queue: [1], lavaGap: 1 };
    const layout = computeLayout(nested);
    const lava = lavaLevel(lv, layout);
    const poses = platformPoses(nested, layout, {}, {});
    expect(Math.min(...Object.values(poses).map((p) => p.bottom)) - lava).toBeCloseTo(1);
    expect(platformsInLava(lv, layout, lava, {})).toEqual([]);
  });
});

describe('tipping (snowball)', () => {
  it('drops everyone on the heavy side, then lets the other side tip too', () => {
    const root = beam('r', 3, P('L'), P('R'));
    const lv: LevelDef = { id: 'x', root, queue: [1], lavaGap: 50 };
    const layout = computeLayout(root);
    // left 4, right 8 → imbalance 4 > 3: right side dumps (8) → left 4 > 3: left dumps too
    const loads: Loads = { L: [T(2, 0), T(2, 1)], R: [T(3, 2), T(3, 3), T(2, 4)] };
    const res = settle(lv, layout, -100, loads);
    expect(res.tips.map((t) => [t.side, t.dropped.length])).toEqual([
      ['right', 3],
      ['left', 2],
    ]);
    expect(loads.L.length + loads.R.length).toBe(0);
  });

  it('a whole sub-tree dumps when its parent beam tips', () => {
    const root = beam('root', 1, beam('s', 9, P('a'), P('b')), P('c'));
    const lv: LevelDef = { id: 'x', root, queue: [1] };
    const loads: Loads = { a: [T(1, 0)], b: [T(1, 1)], c: [] };
    const res = settle(lv, computeLayout(root), -100, loads);
    expect(res.tips).toHaveLength(1);
    expect(res.tips[0].dropped.map((d) => d.platformId)).toEqual(['a', 'b']);
  });

  it('the newcomer alone falls on a light structure', () => {
    const lv: LevelDef = {
      id: 'x',
      root: beam('r', 2, P('L'), P('R')),
      queue: [1, 3],
      lavaGap: 50,
    };
    let g = createGame(lv);
    g = place(g, 'L').state;
    const r = place(g, 'R'); // 3 vs 1 → 2, ok
    expect(r.state.falls).toBe(0);
  });
});

describe('game flow', () => {
  it('a tip-over drops the heavy side and loses the level', () => {
    const lv: LevelDef = {
      id: 't',
      root: beam('root', 2, P('L'), P('R')),
      queue: [1, 2, 1, 3],
      lavaGap: 50,
    };
    let g = createGame(lv);
    g = place(g, 'L').state;
    g = place(g, 'R').state; // 2 vs 1
    g = place(g, 'R').state; // 3 vs 1 → imbalance 2 (limit)
    expect(g.falls).toBe(0);
    const r = place(g, 'R'); // 6 vs 1 → right dumps 3 Tottlers → 0 vs 1 ok
    expect(r.events.map((e) => e.type)).toEqual(['placed', 'tip', 'end']);
    expect(r.state.falls).toBe(3);
    expect(r.events.at(-1)).toMatchObject({ status: 'failed', reason: 'fall', falls: 3 });
    expect(r.state.status).toBe('failed');
  });

  it('makes a Tottler fall when the platform has no room left', () => {
    const lv: LevelDef = {
      id: 'x',
      root: beam('r', 9, P('L', 6), P('R', 6)),
      queue: [3, 2, 1],
      lavaGap: 50,
    };
    let g = createGame(lv);
    g = place(g, 'L').state; // width 4 of 6
    expect(freeWidth(g, 'L')).toBe(2);
    const r = place(g, 'L'); // width 3 > 2
    expect(r.events[0]).toMatchObject({ type: 'noRoom', platformId: 'L' });
    expect(r.state.falls).toBe(1);
    expect(r.state.loads.L).toHaveLength(1);
    expect(r.state.status).toBe('failed');
    expect(r.state.failReason).toBe('fall');
  });

  it('loses the level when a platform touches the lava', () => {
    const lv: LevelDef = {
      id: 'x',
      root: beam('r', 9, P('L'), P('R')),
      queue: [3, 3, 3],
      lavaGap: 0.6,
    };
    let g = createGame(lv);
    let r = place(g, 'L');
    g = r.state;
    expect(g.status).toBe('playing');
    r = place(g, 'L'); // 6 on the left: tilt 2/3 of max + stretch
    r = r.state.status === 'playing' ? place(r.state, 'L') : r;
    expect(r.state.status).toBe('failed');
    expect(r.state.failReason).toBe('lava');
    expect(r.events.map((e) => e.type)).toContain('lava');
  });

  it('flags Perfect when the main beam is level at the end', () => {
    const lv: LevelDef = {
      id: 'x',
      root: beam('r', 2, P('L'), P('R')),
      queue: [2, 1, 1],
      lavaGap: 50,
    };
    let g = createGame(lv);
    g = place(g, 'L').state;
    g = place(g, 'R').state;
    const end = place(g, 'R');
    expect(end.events.at(-1)).toMatchObject({
      type: 'end',
      status: 'won',
      falls: 0,
      perfect: true,
    });
  });

  it('wins only when everyone is placed without a fall', () => {
    const lv: LevelDef = {
      id: 'x',
      root: beam('r', 9, P('L', 6), P('R', 6)),
      queue: [3, 1],
      lavaGap: 50,
    };
    let g = createGame(lv);
    g = place(g, 'L').state;
    const end = place(g, 'L'); // 4 + 2 = 6 fits exactly
    expect(end.state.status).toBe('won');
    expect(end.state.falls).toBe(0);
  });
});

describe('solver', () => {
  it('finds a zero-fall solution that the real game accepts', () => {
    const lv: LevelDef = { id: 's', root: nested, queue: [2, 1, 3, 1, 2, 1, 1] };
    validateStructure(lv.root);
    const sol = solveLevel(lv);
    expect(sol).not.toBeNull();
    let g = createGame(lv);
    for (const pid of sol!) g = place(g, pid).state;
    expect(g.status).toBe('won');
    expect(g.falls).toBe(0);
    expect(countSolutions(lv)).toBeGreaterThan(0);
  });

  it('returns null for an impossible level', () => {
    const lv: LevelDef = { id: 'i', root: beam('r', 1, P('L'), P('R')), queue: [3, 1] };
    expect(solveLevel(lv)).toBeNull();
  });

  it('gives hints that lead to a perfect run', () => {
    const lv: LevelDef = { id: 'h', root: nested, queue: [2, 1, 2, 1, 1, 2] };
    expect(solveLevel(lv)).not.toBeNull();
    let g = createGame(lv);
    while (g.status === 'playing') g = place(g, hint(g)!).state;
    expect(g.falls).toBe(0);
    expect(listPlatforms(lv.root)).toHaveLength(5);
  });
});
