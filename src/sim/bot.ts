import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { LevelDef } from '../core/types';
import { Sim, tottlerShape } from './sim';

/** Seconds everything must hold after the last drop to win. */
export const HOLD_SECONDS = 3;
/** How high above the surface below the finger a Tottler is released. */
export const DROP_GAP = 0.45;
const STEPS_AFTER_DROP = 100;

export interface BotMove {
  platformId: string;
  /** -1 … 1 across the platform width */
  offset: number;
  x: number;
}

/** World x where a Tottler is released, for a platform and an offset across it. */
export function dropX(sim: Sim, platformId: string, offset: number): number {
  const p = sim.platformStates()[platformId];
  return p.x + (offset * p.width) / 2;
}

/** Release height for x: just above whatever is below (null = only lava below). */
export function dropY(sim: Sim, x: number): number | null {
  const s = sim.surfaceBelow(x);
  return s === null ? null : s + DROP_GAP;
}

function risk(sim: Sim): number {
  // the more beams lean and the closer platforms are to the lava, the worse
  let r = 0;
  for (const b of Object.values(sim.beamStates())) r += Math.abs(b.angle) * 4;
  for (const p of Object.values(sim.platformStates())) {
    r += Math.abs(p.angle) * 6;
    r += Math.max(0, 1.2 - (p.bottom - sim.lava)) * 3;
  }
  return r;
}

interface Line {
  sim: Sim;
  moves: BotMove[];
  score: number;
}

/**
 * Player with real physics, used to prove levels can be won. Beam search: keeps the `width`
 * safest lines of play; for each, tries several drop points on every platform, simulates each
 * on a copy of the world and scores the result (lean, closeness to lava, stacking, motion).
 * Returns the moves if the level was won (everyone placed, nothing in the lava for
 * HOLD_SECONDS), else null.
 */
export function botPlay(
  R: typeof RAPIER_NS,
  level: LevelDef,
  offsets = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75],
  log?: (msg: string) => void,
  width = 3,
): BotMove[] | null {
  const start = new Sim(R, level);
  for (let i = 0; i < 60; i++) start.stepFixed();
  let lines: Line[] = [{ sim: start, moves: [], score: 0 }];
  try {
    for (let i = 0; i < level.queue.length; i++) {
      const spec = { id: i + 1, weight: level.queue[i] };
      const next: Line[] = [];
      for (const line of lines) {
        const sim = line.sim;
        const seen = new Set<string>();
        for (const [pid, p] of Object.entries(sim.platformStates())) {
          for (const offset of offsets) {
            const x = dropX(sim, pid, offset);
            const surface = sim.surfaceBelow(x);
            if (surface === null) continue;
            const key = `${pid}:${Math.round(x * 10)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const stacked = surface > p.y + 0.15; // landing on someone's head
            const trial = sim.clone();
            trial.drop(spec, x, surface + DROP_GAP);
            let lost = false;
            for (let k = 0; k < STEPS_AFTER_DROP && !lost; k++) {
              trial.stepFixed();
              if (k % 10 === 9 && trial.lavaHit()) lost = true;
            }
            const moving = trial
              .tottlerStates()
              .some((t) => Math.hypot(t.vx, t.vy) > 0.5 || t.y < trial.lava + 0.3);
            if (lost || trial.lavaHit()) {
              trial.free();
              continue;
            }
            const score =
              risk(trial) + (moving ? 6 : 0) + (stacked ? 2.5 : 0) + Math.abs(offset) * 0.05;
            next.push({
              sim: trial,
              moves: [...line.moves, { platformId: pid, offset, x }],
              score,
            });
          }
        }
      }
      for (const l of lines) l.sim.free();
      next.sort((a, b) => a.score - b.score);
      for (const l of next.slice(width)) l.sim.free();
      lines = next.slice(0, width);
      if (!lines.length) {
        log?.(`tottler ${i + 1} (w${spec.weight}): no safe drop`);
        return null;
      }
      log?.(
        `tottler ${i + 1} (w${spec.weight}) → ${lines[0].moves.at(-1)!.platformId} ${lines[0].moves.at(-1)!.offset} risk ${lines[0].score.toFixed(2)}`,
      );
    }
    // the 3-second hold, for each remaining line
    for (const line of lines) {
      let ok = true;
      for (let k = 0; k < HOLD_SECONDS * 60 + 30 && ok; k++) {
        line.sim.stepFixed();
        if (line.sim.lavaHit()) ok = false;
      }
      if (ok) return line.moves;
      log?.(`hold failed for a line: ${JSON.stringify(line.sim.lavaHit())}`);
    }
    return null;
  } finally {
    for (const l of lines) l.sim.free();
  }
}

/**
 * Quick one-move suggestion (tutorial hand): try a few drop points on every platform,
 * simulate one second each, keep the safest. Cheap enough to run in the browser.
 */
export function bestDrop(
  sim: Sim,
  spec: { id: number; weight: 1 | 2 | 3 },
  offsets = [-0.5, -0.25, 0, 0.25, 0.5],
): { platformId: string; x: number; y: number } | null {
  let best: { platformId: string; x: number; y: number; score: number } | null = null;
  for (const [pid, p] of Object.entries(sim.platformStates())) {
    for (const offset of offsets) {
      const x = p.x + (offset * p.width) / 2;
      const surface = sim.surfaceBelow(x);
      if (surface === null) continue;
      const stacked = surface > p.y + 0.15;
      const trial = sim.clone();
      trial.drop({ id: 9999, weight: spec.weight }, x, surface + DROP_GAP);
      for (let k = 0; k < 60; k++) trial.stepFixed();
      const lost = trial.lavaHit() !== null;
      const score = risk(trial) + (stacked ? 2.5 : 0) + Math.abs(offset) * 0.05;
      trial.free();
      if (!lost && (!best || score < best.score)) best = { platformId: pid, x, y: p.y, score };
    }
  }
  return best && { platformId: best.platformId, x: best.x, y: best.y };
}

/** True if no single first drop (heaviest Tottler, platform centre) reaches the lava. */
export function firstDropSafe(R: typeof RAPIER_NS, level: LevelDef): boolean {
  const sim = new Sim(R, level);
  const w = Math.max(...level.queue) as 1 | 2 | 3;
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

/** Slack added above the first-drop-safe lava distance for generated levels. */
export const GENERATED_LAVA_SLACK = 0.4;

/**
 * Lava distance for a generated level, with real physics: raise it until no first drop can
 * reach the lava, then add some slack. Cheap enough to run in the browser.
 */
export function physicsLavaGap(R: typeof RAPIER_NS, level: LevelDef): number {
  let gap = level.lavaGap ?? 1.2;
  for (let i = 0; i < 40 && !firstDropSafe(R, { ...level, lavaGap: gap }); i++) gap += 0.1;
  return Math.round((gap + GENERATED_LAVA_SLACK) * 100) / 100;
}

export { tottlerShape };
