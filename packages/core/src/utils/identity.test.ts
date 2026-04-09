import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generateRandomColor, generateRandomName, getIdentity, HUMAN_COLORS } from './identity';

// --- Stub browser globals for bun test environment ---

const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (_index: number) => null,
};

beforeEach(() => {
  storage.clear();
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
  (globalThis as Record<string, unknown>).window = {
    location: { search: '' },
  };
});

afterEach(() => {
  storage.clear();
});

describe('generateRandomName', () => {
  test('returns a two-word name (adjective + animal)', () => {
    const name = generateRandomName();
    const parts = name.split(' ');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });
});

describe('generateRandomColor', () => {
  test('returns a color from the palette', () => {
    const color = generateRandomColor();
    expect((HUMAN_COLORS as readonly string[]).includes(color)).toBe(true);
  });
});

describe('getIdentity', () => {
  test('returns expected shape', () => {
    const identity = getIdentity();
    expect(identity).toHaveProperty('name');
    expect(identity).toHaveProperty('color');
    expect(identity).toHaveProperty('coeditor');
    expect(identity).toHaveProperty('tabId');
    expect(typeof identity.name).toBe('string');
    expect(typeof identity.color).toBe('string');
    expect(typeof identity.coeditor).toBe('string');
    expect(typeof identity.tabId).toBe('string');
  });

  test('generates UUID tabId', () => {
    const identity = getIdentity();
    expect(identity.tabId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test('tabId is unique per call', () => {
    const a = getIdentity();
    const b = getIdentity();
    expect(a.tabId).not.toBe(b.tabId);
  });

  test('persists name to localStorage', () => {
    const identity = getIdentity();
    expect(localStorage.getItem('ok-user-name')).toBe(identity.name);
  });

  test('persists color to localStorage', () => {
    const identity = getIdentity();
    expect(localStorage.getItem('ok-user-color')).toBe(identity.color);
  });

  test('reads persisted name from localStorage', () => {
    localStorage.setItem('ok-user-name', 'Test User');
    const identity = getIdentity();
    expect(identity.name).toBe('Test User');
  });

  test('reads persisted color from localStorage', () => {
    localStorage.setItem('ok-user-color', '#FF0000');
    const identity = getIdentity();
    expect(identity.color).toBe('#FF0000');
  });

  test('defaults coeditor to standalone', () => {
    const identity = getIdentity();
    expect(identity.coeditor).toBe('standalone');
  });

  test('reads coeditor from query param', () => {
    (globalThis as Record<string, unknown>).window = {
      location: { search: '?coeditor=cursor' },
    };
    const identity = getIdentity();
    expect(identity.coeditor).toBe('cursor');
  });

  test('color is from the curated palette on first generation', () => {
    const identity = getIdentity();
    expect((HUMAN_COLORS as readonly string[]).includes(identity.color)).toBe(true);
  });
});
