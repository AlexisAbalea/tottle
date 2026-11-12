/** Saved progression. Pure functions; the storage is injected (localStorage in the browser). */
export interface Progress {
  version: 1;
  /** Index (0-based) of the level the app opens on. Equals the level count when all are done. */
  level: number;
  /** Best stars per level index (0 = not finished). */
  stars: number[];
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
  return { version: 1, level: 0, stars: [], perfect: [], endlessBest: 0, muted: false };
}

export function loadProgress(store: KeyValueStore | null | undefined): Progress {
  const base = defaultProgress();
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Progress>;
    if (p.version !== 1) return base;
    return {
      version: 1,
      level: Number.isInteger(p.level) && p.level! >= 0 ? p.level! : 0,
      stars: Array.isArray(p.stars)
        ? p.stars.map((s) => Math.max(0, Math.min(3, Number(s) || 0)))
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

/** Record a finished level. Keeps the best result and moves the "current level" forward. */
export function recordLevel(
  p: Progress,
  index: number,
  stars: number,
  perfect: boolean,
  levelCount: number,
): Progress {
  const next: Progress = { ...p, stars: p.stars.slice(), perfect: p.perfect.slice() };
  if (stars > 0) {
    next.stars[index] = Math.max(next.stars[index] ?? 0, stars);
    next.perfect[index] = (next.perfect[index] ?? false) || perfect;
    next.level = Math.min(levelCount, Math.max(p.level, index + 1));
  }
  for (let i = 0; i < next.stars.length; i++) next.stars[i] ??= 0;
  for (let i = 0; i < next.perfect.length; i++) next.perfect[i] ??= false;
  return next;
}

export function recordEndless(p: Progress, score: number): Progress {
  return { ...p, endlessBest: Math.max(p.endlessBest, score) };
}
