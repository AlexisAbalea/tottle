// Searches queues + lava distance for each level structure so that it hits a target difficulty.
// Difficulty = myopicRate (share of "myopic" players who get 3 stars, see core/difficulty.ts).
// Run: npx vite-node scripts/tune-levels.ts [levelName ...]
import { B, L, M, P, S, build } from '../src/levels/builder';
import type { LevelDef, Weight } from '../src/core/types';
import { solveLevel, countSolutions } from '../src/core/solver';
import { createGame, place } from '../src/core/game';
import { myopicRate } from '../src/core/difficulty';
import { computeLayout, platformPoses } from '../src/core/geometry';

let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// lava = slack added above the smallest lava gap that still allows 3 stars
type Spec = {
  name: string;
  draft: ReturnType<typeof B>;
  len: number;
  mix: number[];
  target: number;
  lava: number;
  min3?: number;
  tries?: number;
};
const HARD = { mix: [3, 4, 3], tries: 1200 };
const specs: Spec[] = [
  { name: '1', draft: B(2, P(M), P(M)), len: 4, mix: [1, 0, 0], target: 1, lava: 0.6 },
  { name: '2', draft: B(2, P(M), P(M)), len: 6, mix: [5, 4, 0], target: 0.9, lava: 0.5 },
  { name: '3', draft: B(3, P(S), P(L)), len: 6, mix: [4, 4, 2], target: 0.7, lava: 0.4, min3: 1 },
  {
    name: '4',
    draft: B(3, B(2, P(S), P(S)), P(L)),
    len: 7,
    mix: [5, 4, 1],
    target: 0.65,
    lava: 0.4,
  },
  {
    name: '5',
    draft: B(2, B(1, P(S), P(M)), B(2, P(M), P(S))),
    len: 9,
    ...HARD,
    target: 0.08,
    lava: 0.1,
    min3: 2,
  },
  {
    name: '6',
    draft: B(3, B(2, P(S), P(M)), B(2, P(M), P(S))),
    len: 8,
    mix: [4, 4, 2],
    target: 0.6,
    lava: 0.35,
  },
  {
    name: '7',
    draft: B(2, B(1, P(S), P(M)), B(2, P(M), P(M))),
    len: 8,
    mix: [4, 4, 2],
    target: 0.5,
    lava: 0.3,
  },
  {
    name: '8',
    draft: B(3, B(2, B(1, P(S), P(S)), P(M)), P(L)),
    len: 9,
    mix: [4, 4, 2],
    target: 0.45,
    lava: 0.3,
    min3: 1,
  },
  { name: '9', draft: B(2, P(L), P(S), 1, 2), len: 6, mix: [5, 4, 1], target: 0.5, lava: 0.35 },
  {
    name: '10',
    draft: B(3, B(2, P(M), B(1, P(S), P(S))), B(2, P(M), P(L), 1, 2)),
    len: 11,
    ...HARD,
    target: 0.0,
    lava: 0.05,
    min3: 3,
  },
  {
    name: '11',
    draft: B(3, P(L), P(M), 1, 2),
    len: 7,
    mix: [4, 4, 2],
    target: 0.55,
    lava: 0.3,
    min3: 1,
  },
  {
    name: '12',
    draft: B(3, B(2, P(S), P(M), 2, 1), P(L)),
    len: 8,
    mix: [4, 4, 2],
    target: 0.45,
    lava: 0.3,
    min3: 1,
  },
  {
    name: '13',
    draft: B(3, B(2, P(S), P(L), 2, 1), B(2, P(L), P(S), 1, 2)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.4,
    lava: 0.25,
    min3: 2,
  },
  {
    name: '14',
    draft: B(4, B(2, P(M), P(M)), B(2, P(M), P(L), 2, 1), 2, 1),
    len: 10,
    mix: [4, 4, 2],
    target: 0.35,
    lava: 0.25,
    min3: 2,
  },
  {
    name: '15',
    draft: B(3, B(3, B(2, P(S), P(S)), P(M), 1, 2), B(2, P(L), P(M), 2, 1)),
    len: 11,
    ...HARD,
    target: 0.05,
    lava: 0.1,
    min3: 2,
  },
  {
    name: '16',
    draft: B(3, B(2, P(S), P(M)), B(2, P(M), P(L), 1, 2), 1, 2),
    len: 9,
    mix: [4, 4, 2],
    target: 0.4,
    lava: 0.25,
    min3: 1,
  },
  {
    name: '17',
    draft: B(3, B(2, B(1, P(S), P(S)), P(M), 2, 1), P(L)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.35,
    lava: 0.2,
    min3: 2,
  },
  {
    name: '18',
    draft: B(4, B(2, P(S), B(2, P(S), P(S)), 2, 1), B(3, P(M), P(L), 1, 2)),
    len: 10,
    mix: [5, 4, 2],
    target: 0.35,
    lava: 0.25,
    min3: 1,
    tries: 800,
  },
  {
    name: '19',
    draft: B(4, B(2, P(M), P(M), 1, 2), B(3, P(M), B(1, P(S), P(S)), 2, 1)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.3,
    lava: 0.2,
    min3: 1,
    tries: 800,
  },
  {
    name: '20',
    draft: B(5, B(3, P(M), B(2, P(S), P(S), 1, 2), 2, 1), B(4, B(1, P(S), P(S)), P(L), 1, 2)),
    len: 11,
    ...HARD,
    target: 0.0,
    lava: 0.05,
    min3: 2,
  },
];

const firstMoveBurns = (lv: LevelDef) => {
  const g = createGame(lv);
  return g.platforms.some((p) => place(g, p.id).state.failReason === 'lava');
};

const only = process.argv.slice(2);
for (const s of specs) {
  if (only.length && !only.includes(s.name)) continue;
  const root = build(s.draft);
  let best: { q: Weight[]; m: number; gap: number } | null = null;
  const tries = s.tries ?? 400;
  for (let t = 0; t < tries; t++) {
    const total = s.mix[0] + s.mix[1] + s.mix[2];
    const queue: Weight[] = Array.from({ length: s.len }, () => {
      const r = rnd() * total;
      return (r < s.mix[0] ? 1 : r < s.mix[0] + s.mix[1] ? 2 : 3) as Weight;
    });
    if (s.min3 && queue.filter((w) => w === 3).length < s.min3) continue;
    if (Number(s.name) >= 4 && queue.filter((w) => w === 1).length > s.len / 2) continue;
    if (!solveLevel({ id: s.name, root, queue, lavaGap: 5 })) continue;
    let lo = 0;
    let hi = 5;
    for (let k = 0; k < 10; k++) {
      const mid = (lo + hi) / 2;
      if (solveLevel({ id: s.name, root, queue, lavaGap: mid })) hi = mid;
      else lo = mid;
    }
    let gap = Math.ceil((hi + s.lava) * 20) / 20;
    while (firstMoveBurns({ id: s.name, root, queue, lavaGap: gap }))
      gap = Math.round((gap + 0.05) * 100) / 100;
    const lv: LevelDef = { id: s.name, root, queue, lavaGap: gap };
    if (!solveLevel(lv)) continue;
    const m = myopicRate(lv, 120, t + 1);
    if (!best || Math.abs(m - s.target) < Math.abs(best.m - s.target)) best = { q: queue, m, gap };
    if (Math.abs(m - s.target) < 0.03) break;
  }
  if (!best) {
    console.log(s.name, 'no solvable queue');
    continue;
  }
  const lv = { id: s.name, root, queue: best.q, lavaGap: best.gap };
  const poses = platformPoses(root, computeLayout(root), {}, {});
  const xs = Object.values(poses);
  const span =
    Math.max(...xs.map((p) => p.x + p.width / 2)) - Math.min(...xs.map((p) => p.x - p.width / 2));
  console.log(
    `L${s.name}: '${best.q.join(' ')}' lava=${best.gap} rate=${(myopicRate(lv) * 100).toFixed(1)}% sols=${countSolutions(lv)} width=${span.toFixed(1)}`,
  );
}
