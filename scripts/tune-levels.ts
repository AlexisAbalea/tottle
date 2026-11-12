// Searches queues for level structures so that each level hits a target difficulty.
// Difficulty = share of "myopic" players (random among moves that don't drop anyone now) who get 3 stars.
import { B, P, build } from '../src/levels/builder';
import type { LevelDef, Weight } from '../src/core/types';
import { solveLevel, countSolutions } from '../src/core/solver';
import { createGame, place, canPlace } from '../src/core/game';
import { totalCapacity } from '../src/core/structure';

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function myopic(lv: LevelDef, N: number) {
  let ok = 0;
  for (let n = 0; n < N; n++) {
    let g = createGame(lv);
    while (g.status === 'playing') {
      const opts = g.platforms.filter((p) => canPlace(g, p.id));
      const safe = opts.filter((p) => place(g, p.id).state.falls === g.falls);
      const pool = safe.length ? safe : opts;
      g = place(g, pool[Math.floor(Math.random() * pool.length)].id).state;
    }
    if (g.falls === 0) ok++;
  }
  return ok / N;
}

const specs: {
  name: string;
  draft: ReturnType<typeof B>;
  len: number;
  mix: number[];
  target: number;
}[] = [
  { name: '4', draft: B(3, B(2, P(2), P(2)), P(4)), len: 7, mix: [5, 4, 1], target: 0.8 },
  {
    name: '5',
    draft: B(3, B(2, P(2), P(2)), B(2, P(2), P(2))),
    len: 8,
    mix: [4, 4, 2],
    target: 0.65,
  },
  {
    name: '6',
    draft: B(2, B(1, P(2), P(2)), B(2, P(3), P(3))),
    len: 9,
    mix: [4, 4, 2],
    target: 0.55,
  },
  {
    name: '7',
    draft: B(3, B(2, B(1, P(2), P(2)), P(3)), P(5)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.45,
  },
  {
    name: '8',
    draft: B(3, B(2, P(2), B(1, P(2), P(2))), B(2, P(3), P(3))),
    len: 12,
    mix: [4, 4, 2],
    target: 0.35,
  },
  { name: '9', draft: B(2, P(4), P(2), 1, 2), len: 6, mix: [5, 4, 0], target: 0.6 },
  { name: '10', draft: B(3, P(4), P(3), 1, 2), len: 7, mix: [4, 4, 2], target: 0.5 },
  { name: '11', draft: B(3, B(2, P(2), P(3), 2, 1), P(4)), len: 8, mix: [4, 4, 2], target: 0.45 },
  {
    name: '12',
    draft: B(3, B(2, P(2), P(3), 2, 1), B(2, P(3), P(2), 1, 2)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.35,
  },
  {
    name: '13',
    draft: B(4, B(2, P(2), P(2)), B(2, P(3), P(4), 2, 1), 2, 1),
    len: 11,
    mix: [4, 4, 2],
    target: 0.3,
  },
  {
    name: '14',
    draft: B(3, B(3, B(2, P(2), P(2)), P(3), 1, 2), B(2, P(3), P(2), 2, 1)),
    len: 12,
    mix: [4, 4, 2],
    target: 0.25,
  },
  {
    name: '15',
    draft: B(4, B(2, P(2), B(2, P(2), P(2), 1, 2), 2, 1), B(3, B(1, P(2), P(2)), P(4), 1, 2)),
    len: 13,
    mix: [4, 4, 3],
    target: 0.2,
  },
];

const only = process.argv[2];
for (const s of specs) {
  if (only && s.name !== only) continue;
  const root = build(s.draft);
  const cap = totalCapacity(root);
  if (cap < s.len) {
    console.log(s.name, 'capacity too small');
    continue;
  }
  let best: { q: Weight[]; m: number; sols: number } | null = null;
  for (let tries = 0; tries < 3000; tries++) {
    const total = s.mix[0] + s.mix[1] + s.mix[2];
    const queue: Weight[] = Array.from({ length: s.len }, () => {
      const r = rnd() * total;
      return (r < s.mix[0] ? 1 : r < s.mix[0] + s.mix[1] ? 2 : 3) as Weight;
    });
    if (s.mix[2] > 0 && Number(s.name) >= 7 && queue.filter((w) => w === 3).length < 2) continue;
    if (Number(s.name) >= 7 && queue.filter((w) => w === 1).length > s.len / 2) continue;
    const lv: LevelDef = { id: s.name, root, queue };
    if (!solveLevel(lv)) continue;
    const m = myopic(lv, 150);
    if (!best || Math.abs(m - s.target) < Math.abs(best.m - s.target))
      best = { q: queue, m, sols: 0 };
    if (Math.abs(m - s.target) < 0.03) break;
  }
  if (!best) {
    console.log(s.name, 'no solvable queue');
    continue;
  }
  best.sols = countSolutions({ id: s.name, root, queue: best.q });
  console.log(
    `L${s.name}: '${best.q.join(' ')}'  myopic=${(best.m * 100).toFixed(0)}% sols=${best.sols}`,
  );
}
