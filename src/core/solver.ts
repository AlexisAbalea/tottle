import type { LevelDef, PlatformNode, Weight } from './types';
import { firstOverTolerance, platformWeights, tottlerWidth, usedWidth } from './balance';
import { computeLayout, lavaLevel, platformsInLava, type NodeLayout } from './geometry';
import { listPlatforms } from './structure';
import type { GameState } from './game';

/**
 * Solver for "3 stars" (zero falls, no lava). In a zero-fall run nobody is ever removed,
 * so only the total weight and used width of each platform matter, not the order.
 */
interface Ctx {
  level: LevelDef;
  platforms: PlatformNode[];
  layout: Map<string, NodeLayout>;
  lava: number;
}

function makeCtx(level: LevelDef): Ctx {
  const layout = computeLayout(level.root);
  return { level, platforms: listPlatforms(level.root), layout, lava: lavaLevel(level, layout) };
}

/** Can weight `w` go on platform i without any fall or lava? */
function safeMove(ctx: Ctx, weights: number[], widths: number[], i: number, w: Weight): boolean {
  if (widths[i] + tottlerWidth(w) > ctx.platforms[i].size) return false;
  const map: Record<string, number> = {};
  ctx.platforms.forEach((p, k) => (map[p.id] = weights[k] + (k === i ? w : 0)));
  if (firstOverTolerance(ctx.level.root, map)) return false;
  return platformsInLava(ctx.level, ctx.layout, ctx.lava, map).length === 0;
}

function search(
  ctx: Ctx,
  queue: Weight[],
  step: number,
  weights: number[],
  widths: number[],
  memo: Set<string>,
  path: number[],
): boolean {
  if (step === queue.length) return true;
  const key = step + '|' + weights.join(',') + '|' + widths.join(',');
  if (memo.has(key)) return false;
  const w = queue[step];
  for (let i = 0; i < ctx.platforms.length; i++) {
    if (!safeMove(ctx, weights, widths, i, w)) continue;
    weights[i] += w;
    widths[i] += tottlerWidth(w);
    path.push(i);
    const ok = search(ctx, queue, step + 1, weights, widths, memo, path);
    weights[i] -= w;
    widths[i] -= tottlerWidth(w);
    if (ok) return true;
    path.pop();
  }
  memo.add(key);
  return false;
}

function solveFrom(ctx: Ctx, queue: Weight[], weights: number[], widths: number[]) {
  const path: number[] = [];
  const ok = search(ctx, queue, 0, weights.slice(), widths.slice(), new Set(), path);
  return ok ? path.map((i) => ctx.platforms[i].id) : null;
}

/** A sequence of platform ids that finishes the level with zero falls, or null. */
export function solveLevel(level: LevelDef): string[] | null {
  const ctx = makeCtx(level);
  const zeros = ctx.platforms.map(() => 0);
  return solveFrom(ctx, level.queue, zeros, zeros);
}

/** Number of distinct zero-fall solutions (capped). Used to measure level difficulty. */
export function countSolutions(level: LevelDef, cap = 100000): number {
  const ctx = makeCtx(level);
  const memo = new Map<string, number>();
  const rec = (step: number, weights: number[], widths: number[]): number => {
    if (step === level.queue.length) return 1;
    const key = step + '|' + weights.join(',') + '|' + widths.join(',');
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let n = 0;
    const w = level.queue[step];
    for (let i = 0; i < ctx.platforms.length && n < cap; i++) {
      if (!safeMove(ctx, weights, widths, i, w)) continue;
      weights[i] += w;
      widths[i] += tottlerWidth(w);
      n += rec(step + 1, weights, widths);
      weights[i] -= w;
      widths[i] -= tottlerWidth(w);
    }
    n = Math.min(n, cap);
    memo.set(key, n);
    return n;
  };
  const zeros = ctx.platforms.map(() => 0);
  return rec(0, zeros.slice(), zeros.slice());
}

/**
 * Suggest the next platform for the current game state:
 *  1. the first move of a zero-fall continuation, if one exists;
 *  2. otherwise any move that is safe right now;
 *  3. otherwise the platform with the most free room.
 */
export function hint(state: GameState): string | null {
  if (state.status !== 'playing' || state.queue.length === 0) return null;
  const ctx = makeCtx(state.level);
  const pw = platformWeights(state.loads);
  const weights = ctx.platforms.map((p) => pw[p.id] ?? 0);
  const widths = ctx.platforms.map((p) => usedWidth(state.loads, p.id));
  const queue = state.queue.map((t) => t.weight);
  const sol = solveFrom(ctx, queue, weights, widths);
  if (sol) return sol[0];
  for (let i = 0; i < ctx.platforms.length; i++) {
    if (safeMove(ctx, weights, widths, i, queue[0])) return ctx.platforms[i].id;
  }
  let best = 0;
  ctx.platforms.forEach((p, i) => {
    if (p.size - widths[i] > ctx.platforms[best].size - widths[best]) best = i;
  });
  return ctx.platforms[best].id;
}
