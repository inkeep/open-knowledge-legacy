import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DEFAULT_DEPTH, MAX_DEPTH, MIN_DEPTH, readPersistedDepth } from './directory-color';

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
  test('exports expected depth constants', () => {
    expect(MIN_DEPTH).toBe(0);
    expect(DEFAULT_DEPTH).toBe(1);
    expect(MAX_DEPTH).toBe(5);
  });
});

describe('readPersistedDepth', () => {
  test('returns DEFAULT_DEPTH when localStorage is empty', () => {
    expect(readPersistedDepth()).toBe(DEFAULT_DEPTH);
  });

  test('reads valid integer from localStorage', () => {
    localStorage.setItem('ok-graph-depth-v1', '3');
    expect(readPersistedDepth()).toBe(3);
  });

  test('clamps values above MAX_DEPTH', () => {
    localStorage.setItem('ok-graph-depth-v1', '99');
    expect(readPersistedDepth()).toBe(MAX_DEPTH);
  });

  test('clamps values below MIN_DEPTH', () => {
    localStorage.setItem('ok-graph-depth-v1', '-5');
    expect(readPersistedDepth()).toBe(MIN_DEPTH);
  });

  test('returns DEFAULT_DEPTH for non-integer strings', () => {
    localStorage.setItem('ok-graph-depth-v1', 'garbage');
    expect(readPersistedDepth()).toBe(DEFAULT_DEPTH);
  });

  test('returns DEFAULT_DEPTH for empty string', () => {
    localStorage.setItem('ok-graph-depth-v1', '');
    expect(readPersistedDepth()).toBe(DEFAULT_DEPTH);
  });
});
