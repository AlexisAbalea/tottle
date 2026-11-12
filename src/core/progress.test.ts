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
    let p = recordLevel(defaultProgress(), 0, 3, true, 15);
    p = recordEndless(p, 12);
    saveProgress(s, p);
    expect(loadProgress(s)).toEqual(p);
    s.setItem(STORAGE_KEY, '{nope');
    expect(loadProgress(s)).toEqual(defaultProgress());
  });

  it('keeps best stars and advances the current level', () => {
    let p = recordLevel(defaultProgress(), 0, 2, false, 15);
    expect(p.level).toBe(1);
    p = recordLevel(p, 0, 1, false, 15);
    expect(p.stars[0]).toBe(2);
    expect(p.level).toBe(1);
    p = recordLevel(p, 1, 0, false, 15); // failed: no progress
    expect(p.level).toBe(1);
    p = recordLevel(p, 14, 3, false, 15);
    expect(p.level).toBe(15);
    expect(p.stars[5]).toBe(0);
  });
});
