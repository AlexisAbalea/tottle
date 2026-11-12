import { describe, expect, it } from 'vitest';
import type { BeamNode, LevelDef, Loads, Tottler, Weight } from './types';
import { allImbalances, beamStatus, imbalance, nodeWeight, tiltRatio } from './balance';
import { createGame, place, resolveFalls } from './game';
import { starsFor } from './score';
import { listPlatforms, validateStructure } from './structure';
import { countSolutions, hint, solveLevel } from './solver';

const P = (id: string, capacity = 3) => ({ kind: 'platform' as const, id, capacity });
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

// Three-level mobile:
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
  it('computes weight of nested subtrees', () => {
    const loads: Loads = { p1: [T(1)], p2: [T(3)], p3: [T(2)], p4: [], p5: [T(1), T(1)] };
    expect(nodeWeight(nested, loads)).toBe(8);
    expect(nodeWeight(nested.left.child, loads)).toBe(4);
    expect(nodeWeight(nested.right.child, loads)).toBe(4);
  });

  it('uses weight × arm length (torque) on each beam', () => {
    const loads: Loads = { p1: [T(1)], p2: [T(3)], p3: [T(2)], p4: [], p5: [T(1), T(1)] };
    const imb = allImbalances(nested, loads);
    expect(imb.A).toBe(3 - 1);
    expect(imb.B).toBe(0 - 2);
    // C: left = 1 × 2 (B carries 2), right = 2 × 2 (p5 carries 2)
    expect(imb.C).toBe(4 - 2);
    // root: left = A total 4, right = C total 4
    expect(imb.root).toBe(0);
  });

  it('gives a signed tilt ratio and a colour status', () => {
    const b = beam('b', 4, P('l'), P('r'));
    expect(tiltRatio(b, { l: [], r: [T(2)] })).toBe(0.5);
    expect(tiltRatio(b, { l: [T(3)], r: [] })).toBe(-0.75);
    expect(beamStatus(0)).toBe('green');
    expect(beamStatus(0.5)).toBe('green');
    expect(beamStatus(-0.75)).toBe('orange');
    expect(beamStatus(1)).toBe('red');
    expect(beamStatus(1.25)).toBe('over');
    const zeroTol = beam('z', 0, P('l'), P('r'));
    expect(tiltRatio(zeroTol, { l: [], r: [T(1)] })).toBe(2);
  });
});

describe('fall rule', () => {
  it('drops the last Tottler placed on the heavy side, then re-checks', () => {
    const b = beam('b', 1, P('l', 5), P('r', 5));
    const loads: Loads = { l: [T(1, 0)], r: [T(1, 1), T(2, 2), T(1, 3)] };
    // imbalance = 4 - 1 = 3 > 1 → remove placedAt 3 (w1) → 2 > 1 → remove placedAt 2 (w2) → 0
    const falls = resolveFalls(b, loads);
    expect(falls.map((f) => f.tottler.placedAt)).toEqual([3, 2]);
    expect(falls.every((f) => f.side === 'right' && f.beamId === 'b')).toBe(true);
    expect(imbalance(b, loads)).toBe(0);
  });

  it('chooses the latest across all platforms of a heavy sub-tree', () => {
    const root = beam('root', 1, beam('s', 9, P('a'), P('b')), P('c'));
    const loads: Loads = { a: [T(1, 5)], b: [T(1, 1)], c: [] };
    const falls = resolveFalls(root, loads);
    expect(falls).toHaveLength(1);
    expect(falls[0].tottler.placedAt).toBe(5);
    expect(falls[0].platformId).toBe('a');
  });
});

describe('game flow', () => {
  const level: LevelDef = {
    id: 't',
    root: beam('root', 2, P('L', 3), P('R', 3)),
    queue: [1, 2, 1, 3],
  };

  it('places Tottlers, records falls and ends with stars', () => {
    let g = createGame(level);
    expect(g.queue.map((t) => t.weight)).toEqual([1, 2, 1, 3]);
    let r = place(g, 'L');
    expect(r.events[0]).toMatchObject({ type: 'placed', platformId: 'L', slot: 0 });
    g = r.state;
    r = place(g, 'R'); // 2 vs 1 → ok
    g = r.state;
    r = place(g, 'R'); // 3 vs 1 → imbalance 2, ok (red)
    g = r.state;
    expect(g.falls).toBe(0);
    r = place(g, 'R'); // 6 vs 1 → falls
    g = r.state;
    expect(r.events.map((e) => e.type)).toEqual(['placed', 'fell', 'end']);
    expect(g.falls).toBe(1);
    expect(g.status).toBe('won');
    expect(r.events.at(-1)).toMatchObject({ stars: 2, perfect: false });
  });

  it('refuses a full platform and ignores moves after the end', () => {
    const lv: LevelDef = { id: 'x', root: beam('r', 9, P('L', 1), P('R', 2)), queue: [1, 1, 1] };
    let g = createGame(lv);
    g = place(g, 'L').state;
    expect(place(g, 'L').events).toEqual([]);
    g = place(g, 'R').state;
    const end = place(g, 'R');
    expect(end.events.at(-1)).toMatchObject({ type: 'end', stars: 3, perfect: false });
    expect(place(end.state, 'R').events).toEqual([]);
  });

  it('flags Perfect when the main beam is level at the end', () => {
    const lv: LevelDef = { id: 'x', root: beam('r', 2, P('L'), P('R')), queue: [2, 1, 1] };
    let g = createGame(lv);
    g = place(g, 'L').state;
    g = place(g, 'R').state;
    const end = place(g, 'R');
    expect(end.events.at(-1)).toMatchObject({
      type: 'end',
      status: 'won',
      stars: 3,
      perfect: true,
    });
  });

  it('fails the level after more than 10 falls', () => {
    const lv: LevelDef = {
      id: 'x',
      root: beam('r', 0, P('L', 20), P('R', 20)),
      queue: Array(14).fill(1) as Weight[],
    };
    let g = createGame(lv);
    for (let i = 0; i < 11; i++) g = place(g, 'L').state;
    expect(g.falls).toBe(11);
    expect(g.status).toBe('failed');
  });
});

describe('score', () => {
  it('maps falls to stars', () => {
    expect([0, 1, 2, 3, 10, 11].map(starsFor)).toEqual([3, 2, 2, 1, 1, 0]);
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
    const lv: LevelDef = { id: 'i', root: beam('r', 1, P('L', 1), P('R', 1)), queue: [3, 1] };
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
