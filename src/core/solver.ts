import type { BeamNode, LevelDef, PlatformNode, Weight } from './types';
import { listBeams, listPlatforms, parentMap } from './structure';
import type { GameState } from './game';

/**
 * Fast solver for "3 stars" (zero falls). Because a zero-fall run never removes anyone,
 * only the total weight and count on each platform matter, not the placement order.
 */
interface Ctx {
  platforms: PlatformNode[];
  beams: BeamNode[];
  /** For each beam: per platform index, signed lever factor (−len for left side, +len for right). */
  factors: number[][];
}

function makeCtx(root: BeamNode): Ctx {
  const platforms = listPlatforms(root);
  const beams = listBeams(root);
  const parents = parentMap(root);
  const factors = beams.map((beam) =>
    platforms.map((p) => {
      // Walk up from the platform until we reach `beam`; the side we came from decides the sign.
      let id = p.id;
      for (;;) {
        const link = parents.get(id);
        if (!link) return 0;
        if (link.beam === beam) {
          return link.side === 'left' ? -beam.left.length : beam.right.length;
        }
        id = link.beam.id;
      }
    }),
  );
  return { platforms, beams, factors };
}

function safe(ctx: Ctx, weights: number[]): boolean {
  for (let b = 0; b < ctx.beams.length; b++) {
    let imb = 0;
    const f = ctx.factors[b];
    for (let i = 0; i < weights.length; i++) imb += f[i] * weights[i];
    if (Math.abs(imb) > ctx.beams[b].tolerance + 1e-9) return false;
  }
  return true;
}

function search(
  ctx: Ctx,
  queue: Weight[],
  step: number,
  weights: number[],
  counts: number[],
  memo: Set<string>,
  path: number[],
): boolean {
  if (step === queue.length) return true;
  const key = step + '|' + weights.join(',') + '|' + counts.join(',');
  if (memo.has(key)) return false;
  const w = queue[step];
  for (let i = 0; i < ctx.platforms.length; i++) {
    if (counts[i] >= ctx.platforms[i].capacity) continue;
    weights[i] += w;
    counts[i] += 1;
    if (safe(ctx, weights)) {
      path.push(i);
      if (search(ctx, queue, step + 1, weights, counts, memo, path)) {
        weights[i] -= w;
        counts[i] -= 1;
        return true;
      }
      path.pop();
    }
    weights[i] -= w;
    counts[i] -= 1;
  }
  memo.add(key);
  return false;
}

/** A sequence of platform ids that finishes the level with zero falls, or null. */
export function solveLevel(level: LevelDef): string[] | null {
  const ctx = makeCtx(level.root);
  return solveFrom(
    ctx,
    level.queue,
    ctx.platforms.map(() => 0),
    ctx.platforms.map(() => 0),
  );
}

function solveFrom(
  ctx: Ctx,
  queue: Weight[],
  weights: number[],
  counts: number[],
): string[] | null {
  const path: number[] = [];
  const ok = search(ctx, queue, 0, weights.slice(), counts.slice(), new Set(), path);
  return ok ? path.map((i) => ctx.platforms[i].id) : null;
}

/** Number of distinct zero-fall solutions (capped). Used to measure level difficulty. */
export function countSolutions(level: LevelDef, cap = 100000): number {
  const ctx = makeCtx(level.root);
  const memo = new Map<string, number>();
  const rec = (step: number, weights: number[], counts: number[]): number => {
    if (step === level.queue.length) return 1;
    const key = step + '|' + weights.join(',') + '|' + counts.join(',');
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let n = 0;
    const w = level.queue[step];
    for (let i = 0; i < ctx.platforms.length && n < cap; i++) {
      if (counts[i] >= ctx.platforms[i].capacity) continue;
      weights[i] += w;
      counts[i]++;
      if (safe(ctx, weights)) n += rec(step + 1, weights, counts);
      weights[i] -= w;
      counts[i]--;
    }
    n = Math.min(n, cap);
    memo.set(key, n);
    return n;
  };
  return rec(
    0,
    ctx.platforms.map(() => 0),
    ctx.platforms.map(() => 0),
  );
}

/**
 * Suggest the next platform for the current game state:
 *  1. the first move of a zero-fall continuation, if one exists;
 *  2. otherwise any move that does not make someone fall right now;
 *  3. otherwise any platform with room.
 */
export function hint(state: GameState): string | null {
  if (state.status !== 'playing' || state.queue.length === 0) return null;
  const ctx = makeCtx(state.level.root);
  const weights = ctx.platforms.map((p) => state.loads[p.id].reduce((s, t) => s + t.weight, 0));
  const counts = ctx.platforms.map((p) => state.loads[p.id].length);
  const queue = state.queue.map((t) => t.weight);
  const sol = solveFrom(ctx, queue, weights, counts);
  if (sol) return sol[0];
  for (let i = 0; i < ctx.platforms.length; i++) {
    if (counts[i] >= ctx.platforms[i].capacity) continue;
    weights[i] += queue[0];
    const ok = safe(ctx, weights);
    weights[i] -= queue[0];
    if (ok) return ctx.platforms[i].id;
  }
  const free = ctx.platforms.findIndex((p, i) => counts[i] < p.capacity);
  return free >= 0 ? ctx.platforms[free].id : null;
}
