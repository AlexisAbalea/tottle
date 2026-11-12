// Prints solvability and difficulty stats for every level. Run: npx vite-node scripts/analyze-levels.ts
import { LEVELS } from '../src/levels/levels';
import { countSolutions, solveLevel } from '../src/core/solver';
import { createGame, place, canPlace } from '../src/core/game';
import { listPlatforms, totalCapacity } from '../src/core/structure';

function randomRun(lv: (typeof LEVELS)[number]) {
  let g = createGame(lv);
  while (g.status === 'playing') {
    const opts = g.platforms.filter((p) => canPlace(g, p.id));
    g = place(g, opts[Math.floor(Math.random() * opts.length)].id).state;
  }
  return g;
}
// "Myopic" player: picks any move that does not cause a fall right now (random among them).
function myopicRun(lv: (typeof LEVELS)[number]) {
  let g = createGame(lv);
  while (g.status === 'playing') {
    const opts = g.platforms.filter((p) => canPlace(g, p.id));
    const safe = opts.filter((p) => place(g, p.id).state.falls === g.falls);
    const pick = (safe.length ? safe : opts)[
      Math.floor(Math.random() * (safe.length ? safe.length : opts.length))
    ];
    g = place(g, pick.id).state;
  }
  return g;
}
for (const lv of LEVELS) {
  const sol = solveLevel(lv);
  const N = 2000;
  let r3 = 0,
    m3 = 0;
  for (let i = 0; i < N; i++) {
    if (randomRun(lv).falls === 0) r3++;
    if (myopicRun(lv).falls === 0) m3++;
  }
  console.log(
    `L${lv.id.padStart(2)} plats=${listPlatforms(lv.root).length} cap=${totalCapacity(lv.root)} q=${lv.queue.length} solvable=${!!sol} sols=${countSolutions(lv)} random3★=${((100 * r3) / N).toFixed(1)}% myopic3★=${((100 * m3) / N).toFixed(1)}%`,
  );
}
