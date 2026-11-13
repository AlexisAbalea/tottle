import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BeamNode, LevelDef, Weight } from '../core/types';
import { LEVELS } from '../levels/levels';
import { Sim } from './sim';
import { DROP_GAP, botPlay, bestDrop, physicsLavaGap } from './bot';
import { levelDef } from '../levels/catalog';

beforeAll(async () => {
  await RAPIER.init();
});

const P = (id: string, size = 12) => ({ kind: 'platform' as const, id, size });
const twoPans = (tol = 6): BeamNode => ({
  kind: 'beam',
  id: 'b',
  tolerance: tol,
  left: { length: 1, child: P('L') },
  right: { length: 1, child: P('R') },
});
const run = (sim: Sim, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) sim.stepFixed();
};
const dropAt = (sim: Sim, id: number, weight: Weight, x: number) =>
  sim.drop({ id, weight }, x, sim.surfaceBelow(x)! + DROP_GAP);

describe('physics sim', () => {
  const level: LevelDef = { id: 't', root: twoPans(), queue: [1], lavaGap: 1.5 };

  it('hangs level when empty (calibrated)', () => {
    const sim = new Sim(RAPIER, level);
    run(sim, 1);
    expect(Math.abs(sim.beamStates().b.angle)).toBeLessThan(0.01);
    expect(sim.lavaHit()).toBeNull();
    sim.free();
  });

  it('a Tottler dropped on a platform stays there and lowers its side', () => {
    const sim = new Sim(RAPIER, level);
    const L = sim.platformStates().L;
    dropAt(sim, 1, 2, L.x);
    run(sim, 2);
    const t = sim.tottlerStates()[0];
    expect(Math.abs(t.x - L.x)).toBeLessThan(0.3);
    expect(t.y).toBeGreaterThan(L.y - 1);
    expect(sim.beamStates().b.angle).toBeGreaterThan(0.02); // left side down = positive z rotation
    expect(sim.lavaHit()).toBeNull();
    sim.free();
  });

  it('an off-centre Tottler tilts its platform towards it', () => {
    const sim = new Sim(RAPIER, level);
    const L = sim.platformStates().L;
    dropAt(sim, 1, 3, L.x - L.width * 0.35);
    run(sim, 2);
    expect(sim.platformStates().L.angle).toBeGreaterThan(0.02); // left edge goes down
    sim.free();
  });

  it('released over nothing, a Tottler falls into the lava', () => {
    const sim = new Sim(RAPIER, level);
    expect(sim.surfaceBelow(0)).toBeNull(); // between the two pans
    sim.drop({ id: 1, weight: 1 }, 0, -1);
    run(sim, 2);
    expect(sim.lavaHit()).toEqual({ tottlerId: 1 });
    sim.free();
  });

  it('a newcomer dropped between two Tottlers pushes them aside', () => {
    const sim = new Sim(RAPIER, level);
    const L = sim.platformStates().L;
    dropAt(sim, 1, 1, L.x - 0.32);
    run(sim, 1);
    dropAt(sim, 2, 1, L.x + 0.32);
    run(sim, 1);
    const before = sim.tottlerStates().map((t) => t.x);
    dropAt(sim, 3, 1, L.x);
    run(sim, 2);
    const after = sim.tottlerStates();
    expect(after[0].x).toBeLessThan(before[0] - 0.02);
    expect(after[1].x).toBeGreaterThan(before[1] + 0.02);
    sim.free();
  });

  it('a small Tottler can rest on top of two big ones', () => {
    const sim = new Sim(RAPIER, level);
    const L = sim.platformStates().L;
    dropAt(sim, 1, 3, L.x - 0.4);
    run(sim, 1);
    dropAt(sim, 2, 3, L.x + 0.4);
    run(sim, 1);
    dropAt(sim, 3, 1, L.x);
    run(sim, 3);
    const small = sim.tottlerStates().find((t) => t.id === 3)!;
    expect(small.y).toBeGreaterThan(sim.platformStates().L.y + 1); // on the big ones' heads
    expect(sim.lavaHit()).toBeNull();
    sim.free();
  });

  it('a copy evolves exactly like the original', () => {
    const a = new Sim(RAPIER, level);
    dropAt(a, 1, 2, a.platformStates().R.x + 0.3);
    run(a, 0.5);
    const b = a.clone();
    run(a, 1);
    run(b, 1);
    expect(b.tottlerStates()).toEqual(a.tottlerStates());
    a.free();
    b.free();
  });

  it('suggests a safe first drop', () => {
    const sim = new Sim(RAPIER, LEVELS[0]);
    const s = bestDrop(sim, { id: 1, weight: 1 });
    expect(s).not.toBeNull();
    sim.free();
  });
});

describe('levels with real physics', () => {
  for (const lv of LEVELS) {
    it(`level ${lv.id}: no single first drop on a platform reaches the lava`, () => {
      const sim = new Sim(RAPIER, lv);
      for (const [, p] of Object.entries(sim.platformStates())) {
        const t = sim.clone();
        dropAt(t, 1, Math.max(...lv.queue) as Weight, p.x);
        run(t, 2);
        expect(t.lavaHit()).toBeNull();
        t.free();
      }
      sim.free();
    });

    it(`level ${lv.id} can be won (bot, real physics)`, { timeout: 60_000 }, () => {
      expect(botPlay(RAPIER, lv)).not.toBeNull();
    });
  }
});

describe('generated levels with real physics', () => {
  for (let n = 21; n <= 30; n++) {
    it(
      `level ${n} can be won once its lava distance is set with physics`,
      { timeout: 60_000 },
      () => {
        const def = levelDef(n);
        expect(botPlay(RAPIER, { ...def, lavaGap: physicsLavaGap(RAPIER, def) })).not.toBeNull();
      },
    );
  }
});
