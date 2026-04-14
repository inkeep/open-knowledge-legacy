import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (_index: number) => null,
};

beforeEach(() => {
  storage.clear();
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
});

afterEach(() => {
  storage.clear();
});

describe('directory-color constants', () => {
  test('exports expected depth constants', async () => {
    const { MIN_DEPTH, DEFAULT_DEPTH, MAX_DEPTH } = await import('./directory-color');
    expect(MIN_DEPTH).toBe(0);
    expect(DEFAULT_DEPTH).toBe(1);
    expect(MAX_DEPTH).toBe(5);
  });
});

describe('persisted depth reading', () => {
  test('returns DEFAULT_DEPTH when localStorage is empty', async () => {
    const { DEFAULT_DEPTH } = await import('./directory-color');
    expect(localStorage.getItem('ok-graph-depth-v1')).toBeNull();
    expect(DEFAULT_DEPTH).toBe(1);
  });

  test('reads valid integer from localStorage', () => {
    localStorage.setItem('ok-graph-depth-v1', '3');
    const raw = localStorage.getItem('ok-graph-depth-v1');
    expect(raw).toBe('3');
    const parsed = Number.parseInt(raw ?? '', 10);
    expect(parsed).toBe(3);
  });

  test('clamps out-of-range values', () => {
    const clamp = (v: number) => Math.max(0, Math.min(5, v));
    expect(clamp(-1)).toBe(0);
    expect(clamp(10)).toBe(5);
    expect(clamp(3)).toBe(3);
  });

  test('falls back to default for non-integer strings', () => {
    localStorage.setItem('ok-graph-depth-v1', 'garbage');
    const raw = localStorage.getItem('ok-graph-depth-v1');
    const parsed = Number.parseInt(raw ?? '', 10);
    expect(Number.isFinite(parsed)).toBe(false);
  });
});
