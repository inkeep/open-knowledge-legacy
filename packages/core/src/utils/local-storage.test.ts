import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { safeLocalStorageGet, safeLocalStorageSet } from './local-storage';

const storage = new Map<string, string>();

function makeStub(overrides?: Partial<Storage>): Storage {
  return {
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
    ...overrides,
  };
}

beforeEach(() => {
  storage.clear();
  (globalThis as Record<string, unknown>).localStorage = makeStub();
});

afterEach(() => {
  storage.clear();
});

describe('safeLocalStorageGet', () => {
  test('returns stored value', () => {
    localStorage.setItem('test-key', 'hello');
    expect(safeLocalStorageGet('test-key')).toBe('hello');
  });

  test('returns null for missing key', () => {
    expect(safeLocalStorageGet('nonexistent')).toBeNull();
  });

  test('returns null when getItem throws SecurityError', () => {
    (globalThis as Record<string, unknown>).localStorage = makeStub({
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    expect(safeLocalStorageGet('any')).toBeNull();
  });

  test('returns null when localStorage is undefined', () => {
    (globalThis as Record<string, unknown>).localStorage = undefined;
    expect(safeLocalStorageGet('any')).toBeNull();
  });
});

describe('safeLocalStorageSet', () => {
  test('stores a value', () => {
    safeLocalStorageSet('key', 'value');
    expect(localStorage.getItem('key')).toBe('value');
  });

  test('silently no-ops on QuotaExceededError', () => {
    (globalThis as Record<string, unknown>).localStorage = makeStub({
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    expect(() => safeLocalStorageSet('key', 'value')).not.toThrow();
  });

  test('silently no-ops on SecurityError', () => {
    (globalThis as Record<string, unknown>).localStorage = makeStub({
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    expect(() => safeLocalStorageSet('key', 'value')).not.toThrow();
  });

  test('silently no-ops when localStorage is undefined', () => {
    (globalThis as Record<string, unknown>).localStorage = undefined;
    expect(() => safeLocalStorageSet('key', 'value')).not.toThrow();
  });
});
