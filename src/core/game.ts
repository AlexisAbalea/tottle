import type { LevelDef, Loads, PlatformNode, Side, Tottler, Weight } from './types';
import { firstOverTolerance, imbalance, platformWeights, tottlerWidth, usedWidth } from './balance';
import { computeLayout, lavaLevel, platformsInLava, type NodeLayout } from './geometry';
import { listPlatforms, platformIdsUnder } from './structure';
import { MAX_FALLS, starsFor } from './score';

export type GameStatus = 'playing' | 'won' | 'failed';
export type FailReason = 'falls' | 'lava';

export interface GameState {
  level: LevelDef;
  platforms: PlatformNode[];
  layout: Map<string, NodeLayout>;
  /** Height of the lava surface (root pivot at 0). */
  lava: number;
  loads: Loads;
  /** Waiting Tottlers; index 0 is the current one. */
  queue: Tottler[];
  fallen: Tottler[];
  falls: number;
  placedCount: number;
  status: GameStatus;
  failReason?: FailReason;
  /** Platform that touched the lava, if any. */
  burnt?: string;
}

export interface Dropped {
  tottler: Tottler;
  platformId: string;
}

export type GameEvent =
  /** The Tottler landed on the platform. */
  | { type: 'placed'; tottler: Tottler; platformId: string }
  /** No room left on the platform: the Tottler bounces off and falls. */
  | { type: 'noRoom'; tottler: Tottler; platformId: string }
  /** A beam tipped over: everyone on its heavy side falls. `after` = loads once they are gone. */
  | { type: 'tip'; beamId: string; side: Side; dropped: Dropped[]; after: Loads }
  /** A platform touched the lava: it breaks and the level is lost. */
  | { type: 'lava'; platformId: string }
  | {
      type: 'end';
      status: 'won' | 'failed';
      reason?: FailReason;
      stars: number;
      falls: number;
      perfect: boolean;
    };

export function createGame(level: LevelDef): GameState {
  const platforms = listPlatforms(level.root);
  const layout = computeLayout(level.root);
  const loads: Loads = {};
  for (const p of platforms) loads[p.id] = [];
  return {
    level,
    platforms,
    layout,
    lava: lavaLevel(level, layout),
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

/** Remaining width (width units) on a platform. */
export function freeWidth(state: GameState, platformId: string): number {
  const p = state.platforms.find((x) => x.id === platformId);
  if (!p) return 0;
  return p.size - usedWidth(state.loads, platformId);
}

export function fits(state: GameState, platformId: string, weight: Weight): boolean {
  return freeWidth(state, platformId) >= tottlerWidth(weight);
}

/** Any platform can be tapped while playing (a full one makes the Tottler fall). */
export function canPlace(state: GameState, platformId: string): boolean {
  return (
    state.status === 'playing' &&
    state.queue.length > 0 &&
    state.platforms.some((p) => p.id === platformId)
  );
}

/**
 * Settle the mobile after a change, in place. Deterministic rule:
 *   1. while a beam is over its limit (checked top→bottom, left→right):
 *      everyone on its heavy side falls, the beam swings back (snowball);
 *   2. once everything holds, any platform touching the lava breaks.
 */
export function settle(
  level: LevelDef,
  layout: Map<string, NodeLayout>,
  lava: number,
  loads: Loads,
): { tips: Extract<GameEvent, { type: 'tip' }>[]; burnt: string | null } {
  const tips: Extract<GameEvent, { type: 'tip' }>[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const beam = firstOverTolerance(level.root, platformWeights(loads));
    if (!beam) break;
    const side: Side = imbalance(beam, platformWeights(loads)) > 0 ? 'right' : 'left';
    const dropped: Dropped[] = [];
    for (const pid of platformIdsUnder(beam[side].child)) {
      for (const t of loads[pid]) dropped.push({ tottler: t, platformId: pid });
      loads[pid] = [];
    }
    tips.push({ type: 'tip', beamId: beam.id, side, dropped, after: cloneLoads(loads) });
  }
  const burnt = platformsInLava(level, layout, lava, platformWeights(loads));
  return { tips, burnt: burnt[0] ?? null };
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
  const events: GameEvent[] = [];
  const fallen: Tottler[] = [];
  let burnt: string | null = null;

  if (!fits(state, platformId, tottler.weight)) {
    events.push({ type: 'noRoom', tottler, platformId });
    fallen.push(tottler);
  } else {
    loads[platformId].push(tottler);
    events.push({ type: 'placed', tottler, platformId });
    const res = settle(state.level, state.layout, state.lava, loads);
    for (const tip of res.tips) {
      events.push(tip);
      for (const d of tip.dropped) fallen.push(d.tottler);
    }
    burnt = res.burnt;
  }

  const next: GameState = {
    ...state,
    loads,
    queue: rest,
    fallen: [...state.fallen, ...fallen],
    falls: state.falls + fallen.length,
    placedCount: state.placedCount + 1,
  };

  if (burnt) {
    next.status = 'failed';
    next.failReason = 'lava';
    next.burnt = burnt;
    events.push({ type: 'lava', platformId: burnt });
    events.push({
      type: 'end',
      status: 'failed',
      reason: 'lava',
      stars: 0,
      falls: next.falls,
      perfect: false,
    });
  } else if (next.falls >= MAX_FALLS) {
    next.status = 'failed';
    next.failReason = 'falls';
    events.push({
      type: 'end',
      status: 'failed',
      reason: 'falls',
      stars: 0,
      falls: next.falls,
      perfect: false,
    });
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
  return Math.abs(imbalance(state.level.root, platformWeights(state.loads))) < 1e-9;
}

export function currentWeight(state: GameState): Weight | null {
  return state.queue[0]?.weight ?? null;
}
