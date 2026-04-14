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

describe('readPersistedDepth', () => {
  test('returns DEFAULT_DEPTH when localStorage is empty', async () => {
    const { readPersistedDepth, DEFAULT_DEPTH } = await import('./directory-color');
    expect(readPersistedDepth()).toBe(DEFAULT_DEPTH);
  });

  test('reads valid integer from localStorage', async () => {
    localStorage.setItem('ok-graph-depth-v1', '3');
    const { readPersistedDepth } = await import('./directory-color');
    expect(readPersistedDepth()).toBe(3);
  });

  test('clamps values above MAX_DEPTH', async () => {
    localStorage.setItem('ok-graph-depth-v1', '99');
    const { readPersistedDepth, MAX_DEPTH } = await import('./directory-color');
    expect(readPersistedDepth()).toBe(MAX_DEPTH);
  });

  test('clamps values below MIN_DEPTH', async () => {
    localStorage.setItem('ok-graph-depth-v1', '-5');
    const { readPersistedDepth, MIN_DEPTH } = await import('./directory-color');
    expect(readPersistedDepth()).toBe(MIN_DEPTH);
  });

  test('returns DEFAULT_DEPTH for non-integer strings', async () => {
    localStorage.setItem('ok-graph-depth-v1', 'garbage');
    const { readPersistedDepth, DEFAULT_DEPTH } = await import('./directory-color');
    expect(readPersistedDepth()).toBe(DEFAULT_DEPTH);
  });

  test('returns DEFAULT_DEPTH for empty string', async () => {
    localStorage.setItem('ok-graph-depth-v1', '');
    const { readPersistedDepth, DEFAULT_DEPTH } = await import('./directory-color');
    expect(readPersistedDepth()).toBe(DEFAULT_DEPTH);
  });
});
