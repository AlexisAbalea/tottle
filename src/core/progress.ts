/** Saved progression. Pure functions; the storage is injected (localStorage in the browser). */
export interface Progress {
  version: 1;
  /** Index (0-based) of the level the app opens on. Equals the level count when all are done. */
  level: number;
  /** Levels finished (index → true). */
  completed: boolean[];
  perfect: boolean[];
  endlessBest: number;
  muted: boolean;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = 'tottle.progress.v1';

export function defaultProgress(): Progress {
  return { version: 1, level: 0, completed: [], perfect: [], endlessBest: 0, muted: false };
}

export function loadProgress(store: KeyValueStore | null | undefined): Progress {
  const base = defaultProgress();
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Progress> & { stars?: number[] };
    if (p.version !== 1) return base;
    return {
      version: 1,
      level: Number.isInteger(p.level) && p.level! >= 0 ? p.level! : 0,
      // older saves stored stars per level: any star means finished
      completed: Array.isArray(p.completed)
        ? p.completed.map(Boolean)
        : Array.isArray(p.stars)
          ? p.stars.map((s) => Number(s) > 0)
          : [],
      perfect: Array.isArray(p.perfect) ? p.perfect.map(Boolean) : [],
      endlessBest: Number(p.endlessBest) || 0,
      muted: !!p.muted,
    };
  } catch {
    return base;
  }
}

export function saveProgress(store: KeyValueStore | null | undefined, p: Progress) {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Private mode or full storage: progress just won't persist.
  }
}

/** Record a won level and move the "current level" forward. */
export function recordLevel(
  p: Progress,
  index: number,
  perfect: boolean,
  levelCount: number,
): Progress {
  const next: Progress = { ...p, completed: p.completed.slice(), perfect: p.perfect.slice() };
  next.completed[index] = true;
  next.perfect[index] = (next.perfect[index] ?? false) || perfect;
  next.level = Math.min(levelCount, Math.max(p.level, index + 1));
  for (let i = 0; i < next.completed.length; i++) next.completed[i] ??= false;
  for (let i = 0; i < next.perfect.length; i++) next.perfect[i] ??= false;
  return next;
}

export function recordEndless(p: Progress, score: number): Progress {
  return { ...p, endlessBest: Math.max(p.endlessBest, score) };
}
