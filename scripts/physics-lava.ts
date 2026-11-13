// Physics branch: finds, for each level, the lava distance such that
//  (a) no single first drop (heaviest Tottler, platform centre) reaches the lava, and
//  (b) the bot can win the level with real physics.
// Run: npx vite-node scripts/physics-lava.ts [levelNumbers...]
import RAPIER from '@dimforge/rapier3d-compat';
import { LEVELS } from '../src/levels/levels';
import { Sim } from '../src/sim/sim';
import { DROP_GAP, botPlay } from '../src/sim/bot';
import type { LevelDef, Weight } from '../src/core/types';

await RAPIER.init();

function firstDropSafe(lv: LevelDef): boolean {
  const sim = new Sim(RAPIER, lv);
  const w = Math.max(...lv.queue) as Weight;
  let ok = true;
  for (const p of Object.values(sim.platformStates())) {
    const t = sim.clone();
    t.drop({ id: 1, weight: w }, p.x, t.surfaceBelow(p.x)! + DROP_GAP);
    for (let i = 0; i < 180 && ok; i++) {
      t.stepFixed();
      if (t.lavaHit()) ok = false;
    }
    t.free();
    if (!ok) break;
  }
  sim.free();
  return ok;
}

const only = process.argv.slice(2).map(Number);
for (const lv of LEVELS) {
  if (only.length && !only.includes(Number(lv.id))) continue;
  let gap = lv.lavaGap ?? 1.2;
  while (!firstDropSafe({ ...lv, lavaGap: gap }) && gap < 6)
    gap = Math.round((gap + 0.1) * 100) / 100;
  gap = Math.round((gap + 0.1) * 100) / 100; // a little slack
  while (!botPlay(RAPIER, { ...lv, lavaGap: gap }) && gap < 6)
    gap = Math.round((gap + 0.1) * 100) / 100;
  console.log(`${lv.id} ${lv.lavaGap} -> ${gap}`);
}
