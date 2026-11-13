import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  defaultProgress,
  loadProgress,
  recordEndless,
  recordLevel,
  saveProgress,
} from './progress';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}

describe('progress', () => {
  it('starts at level 1 with nothing saved', () => {
    expect(loadProgress(memStore())).toEqual(defaultProgress());
    expect(loadProgress(null).level).toBe(0);
  });

  it('round-trips through storage and survives garbage', () => {
    const s = memStore();
    let p = recordLevel(defaultProgress(), 0, true, 20);
    p = recordEndless(p, 12);
    saveProgress(s, p);
    expect(loadProgress(s)).toEqual(p);
    s.setItem(STORAGE_KEY, '{nope');
    expect(loadProgress(s)).toEqual(defaultProgress());
  });

  it('reads older saves that stored stars', () => {
    const s = memStore();
    s.setItem(STORAGE_KEY, JSON.stringify({ version: 1, level: 2, stars: [3, 1], perfect: [] }));
    expect(loadProgress(s)).toMatchObject({ level: 2, completed: [true, true] });
  });

  it('advances the current level on a win', () => {
    let p = recordLevel(defaultProgress(), 0, false, 20);
    expect(p.level).toBe(1);
    p = recordLevel(p, 0, false, 20); // replaying does not go back
    expect(p.level).toBe(1);
    p = recordLevel(p, 19, false, 20);
    expect(p.level).toBe(20);
    expect(p.completed[5]).toBe(false);
  });
});
