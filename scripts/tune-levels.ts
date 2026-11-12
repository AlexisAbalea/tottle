// Searches queues for level structures so that each level hits a target difficulty.
// Difficulty = share of "myopic" players (random among moves that are safe right now)
// who finish with 3 stars. Run: npx vite-node scripts/tune-levels.ts [levelName]
import { B, L, M, P, S, build } from '../src/levels/builder';
import type { LevelDef, Weight } from '../src/core/types';
import { solveLevel, countSolutions } from '../src/core/solver';
import { createGame, place } from '../src/core/game';
import { computeLayout, lavaLevel, platformPoses } from '../src/core/geometry';

let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

export function myopic(lv: LevelDef, N: number) {
  let ok = 0;
  for (let n = 0; n < N; n++) {
    let g = createGame(lv);
    while (g.status === 'playing') {
      const ids = g.platforms.map((p) => p.id);
      const safe = ids.filter((id) => {
        const r = place(g, id).state;
        return r.falls === g.falls && r.status !== 'failed';
      });
      const pool = safe.length ? safe : ids;
      g = place(g, pool[Math.floor(Math.random() * pool.length)]).state;
    }
    if (g.status === 'won' && g.falls === 0) ok++;
  }
  return ok / N;
}

// lava = slack added above the smallest lava gap that still allows 3 stars
type Spec = {
  name: string;
  draft: ReturnType<typeof B>;
  len: number;
  mix: number[];
  target: number;
  lava: number;
  min3?: number;
};
const specs: Spec[] = [
  { name: '1', draft: B(2, P(M), P(M)), len: 4, mix: [1, 0, 0], target: 1, lava: 0.6 },
  { name: '2', draft: B(2, P(M), P(M)), len: 6, mix: [5, 4, 0], target: 0.9, lava: 0.5 },
  { name: '3', draft: B(3, P(S), P(L)), len: 6, mix: [4, 4, 2], target: 0.7, lava: 0.4, min3: 1 },
  {
    name: '4',
    draft: B(3, B(2, P(S), P(S)), P(L)),
    len: 7,
    mix: [5, 4, 1],
    target: 0.7,
    lava: 0.4,
  },
  {
    name: '5',
    draft: B(3, B(2, P(S), P(M)), B(2, P(M), P(S))),
    len: 8,
    mix: [4, 4, 2],
    target: 0.6,
    lava: 0.35,
  },
  {
    name: '6',
    draft: B(2, B(1, P(S), P(M)), B(2, P(M), P(M))),
    len: 8,
    mix: [4, 4, 2],
    target: 0.5,
    lava: 0.3,
  },
  {
    name: '7',
    draft: B(3, B(2, B(1, P(S), P(S)), P(M)), P(L)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.4,
    lava: 0.3,
    min3: 2,
  },
  {
    name: '8',
    draft: B(3, B(2, P(S), B(1, P(S), P(S))), B(2, P(M), P(M))),
    len: 11,
    mix: [4, 4, 2],
    target: 0.3,
    lava: 0.25,
    min3: 2,
  },
  { name: '9', draft: B(2, P(L), P(S), 1, 2), len: 6, mix: [5, 4, 1], target: 0.6, lava: 0.35 },
  {
    name: '10',
    draft: B(3, P(L), P(M), 1, 2),
    len: 7,
    mix: [4, 4, 2],
    target: 0.5,
    lava: 0.3,
    min3: 2,
  },
  {
    name: '11',
    draft: B(3, B(2, P(S), P(M), 2, 1), P(L)),
    len: 8,
    mix: [4, 4, 2],
    target: 0.4,
    lava: 0.25,
    min3: 2,
  },
  {
    name: '12',
    draft: B(3, B(2, P(S), P(L), 2, 1), B(2, P(L), P(S), 1, 2)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.3,
    lava: 0.25,
    min3: 2,
  },
  {
    name: '13',
    draft: B(4, B(2, P(M), P(M)), B(2, P(M), P(L), 2, 1), 2, 1),
    len: 10,
    mix: [4, 4, 2],
    target: 0.25,
    lava: 0.2,
    min3: 2,
  },
  {
    name: '14',
    draft: B(3, B(3, B(2, P(S), P(S)), P(M), 1, 2), B(2, P(L), P(M), 2, 1)),
    len: 10,
    mix: [4, 4, 2],
    target: 0.2,
    lava: 0.2,
    min3: 2,
  },
  {
    name: '15',
    draft: B(4, B(2, P(S), B(2, P(S), P(S)), 2, 1), B(3, P(M), P(L), 1, 2)),
    len: 11,
    mix: [4, 4, 3],
    target: 0.15,
    lava: 0.15,
    min3: 2,
  },
];

const only = process.argv[2];
for (const s of specs) {
  if (only && s.name !== only) continue;
  const root = build(s.draft);
  let best: { q: Weight[]; m: number; gap: number } | null = null;
  for (let tries = 0; tries < 400; tries++) {
    const total = s.mix[0] + s.mix[1] + s.mix[2];
    const queue: Weight[] = Array.from({ length: s.len }, () => {
      const r = rnd() * total;
      return (r < s.mix[0] ? 1 : r < s.mix[0] + s.mix[1] ? 2 : 3) as Weight;
    });
    if (s.min3 && queue.filter((w) => w === 3).length < s.min3) continue;
    if (Number(s.name) >= 4 && queue.filter((w) => w === 1).length > s.len / 2) continue;
    if (!solveLevel({ id: s.name, root, queue, lavaGap: 5 })) continue;
    // smallest lava gap that still allows a 3-star run, then add the spec's slack
    let lo = 0;
    let hi = 5;
    for (let k = 0; k < 10; k++) {
      const mid = (lo + hi) / 2;
      if (solveLevel({ id: s.name, root, queue, lavaGap: mid })) hi = mid;
      else lo = mid;
    }
    const gap = Math.round((hi + s.lava) * 20) / 20;
    const lv: LevelDef = { id: s.name, root, queue, lavaGap: gap };
    if (!solveLevel(lv)) continue;
    const m = myopic(lv, 120);
    if (!best || Math.abs(m - s.target) < Math.abs(best.m - s.target)) best = { q: queue, m, gap };
    if (Math.abs(m - s.target) < 0.04) break;
  }
  if (!best) {
    console.log(s.name, 'no solvable queue');
    continue;
  }
  const lv = { id: s.name, root, queue: best.q, lavaGap: best.gap };
  const layout = computeLayout(root);
  const poses = platformPoses(root, layout, {}, {});
  const span =
    Math.max(...Object.values(poses).map((p) => p.x + p.width / 2)) -
    Math.min(...Object.values(poses).map((p) => p.x - p.width / 2));
  console.log(
    `L${s.name}: '${best.q.join(' ')}' lava=${best.gap} myopic=${(best.m * 100).toFixed(0)}% sols=${countSolutions(lv)} width=${span.toFixed(1)} lavaY=${lavaLevel(lv).toFixed(2)}`,
  );
}
