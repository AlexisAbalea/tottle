import type { BeamNode, LevelDef, Loads, PlatformNode, Side, Tottler, Weight } from './types';
import { firstOverTolerance, imbalance } from './balance';
import { listPlatforms, platformIdsUnder } from './structure';
import { MAX_FALLS, starsFor } from './score';

export type GameStatus = 'playing' | 'won' | 'failed';

export interface GameState {
  level: LevelDef;
  platforms: PlatformNode[];
  loads: Loads;
  /** Waiting Tottlers; index 0 is the current one. */
  queue: Tottler[];
  fallen: Tottler[];
  falls: number;
  placedCount: number;
  status: GameStatus;
}

export type GameEvent =
  | { type: 'placed'; tottler: Tottler; platformId: string; slot: number }
  | { type: 'fell'; tottler: Tottler; platformId: string; beamId: string; side: Side }
  | { type: 'end'; status: 'won' | 'failed'; stars: number; falls: number; perfect: boolean };

export function createGame(level: LevelDef): GameState {
  const platforms = listPlatforms(level.root);
  const loads: Loads = {};
  for (const p of platforms) loads[p.id] = [];
  return {
    level,
    platforms,
    loads,
    queue: level.queue.map((w, i) => ({ id: i + 1, weight: w, placedAt: -1 })),
    fallen: [],
    falls: 0,
    placedCount: 0,
    status: 'playing',
  };
}

export function cloneLoads(loads: Loads): Loads {
  const out: Loads = {};
  for (const k of Object.keys(loads)) out[k] = loads[k].slice();
  return out;
}

export function freeSlots(state: GameState, platformId: string): number {
  const p = state.platforms.find((x) => x.id === platformId);
  if (!p) return 0;
  return p.capacity - state.loads[platformId].length;
}

export function canPlace(state: GameState, platformId: string): boolean {
  return state.status === 'playing' && state.queue.length > 0 && freeSlots(state, platformId) > 0;
}

/**
 * Resolve falls on a set of loads, in place. Rule (deterministic):
 *  while some beam is over tolerance (checked top→bottom, left→right):
 *    on that beam's heavy side, the most recently placed Tottler slides off and falls.
 */
export function resolveFalls(
  root: BeamNode,
  loads: Loads,
): { tottler: Tottler; platformId: string; beamId: string; side: Side }[] {
  const out: { tottler: Tottler; platformId: string; beamId: string; side: Side }[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    const beam = firstOverTolerance(root, loads);
    if (!beam) break;
    const side: Side = imbalance(beam, loads) > 0 ? 'right' : 'left';
    let best: { t: Tottler; pid: string; idx: number } | null = null;
    for (const pid of platformIdsUnder(beam[side].child)) {
      loads[pid].forEach((t, idx) => {
        if (!best || t.placedAt > best.t.placedAt) best = { t, pid, idx };
      });
    }
    if (!best) break; // cannot happen: a heavy side always carries weight
    const b = best as { t: Tottler; pid: string; idx: number };
    loads[b.pid].splice(b.idx, 1);
    out.push({ tottler: b.t, platformId: b.pid, beamId: beam.id, side });
  }
  return out;
}

/** Place the current Tottler on a platform. Returns the new state and what happened. */
export function place(
  state: GameState,
  platformId: string,
): { state: GameState; events: GameEvent[] } {
  if (!canPlace(state, platformId)) return { state, events: [] };
  const loads = cloneLoads(state.loads);
  const [current, ...rest] = state.queue;
  const tottler: Tottler = { ...current, placedAt: state.placedCount };
  const slot = loads[platformId].length;
  loads[platformId].push(tottler);
  const events: GameEvent[] = [{ type: 'placed', tottler, platformId, slot }];

  const falls = resolveFalls(state.level.root, loads);
  for (const f of falls) events.push({ type: 'fell', ...f });

  const next: GameState = {
    ...state,
    loads,
    queue: rest,
    fallen: [...state.fallen, ...falls.map((f) => f.tottler)],
    falls: state.falls + falls.length,
    placedCount: state.placedCount + 1,
  };

  if (next.falls > MAX_FALLS) {
    next.status = 'failed';
    events.push({ type: 'end', status: 'failed', stars: 0, falls: next.falls, perfect: false });
  } else if (next.queue.length === 0) {
    next.status = 'won';
    events.push({
      type: 'end',
      status: 'won',
      stars: starsFor(next.falls),
      falls: next.falls,
      perfect: isPerfect(next),
    });
  }
  return { state: next, events };
}

/** "Perfect": the main beam is exactly horizontal. */
export function isPerfect(state: GameState): boolean {
  return Math.abs(imbalance(state.level.root, state.loads)) < 1e-9;
}

export function currentWeight(state: GameState): Weight | null {
  return state.queue[0]?.weight ?? null;
}
