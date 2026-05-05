import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test';
import { readNumericOverride, resetPerfOverrideWarnings } from './env-override';

const hadWindow = typeof (globalThis as { window?: unknown }).window !== 'undefined';

describe('readNumericOverride', () => {
  const originalEnv = { ...import.meta.env };
  let warnSpy: ReturnType<typeof spyOn>;

  beforeAll(() => {
    if (!hadWindow) {
      (globalThis as unknown as { window: unknown }).window = globalThis;
    }
  });

  afterAll(() => {
    if (!hadWindow) {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  beforeEach(() => {
    resetPerfOverrideWarnings();
    if (typeof window !== 'undefined') {
      delete window.__okPerfOverrides;
    }
    for (const key of Object.keys(import.meta.env)) {
      if (key.startsWith('VITE_OK_PERF_')) {
        delete (import.meta.env as Record<string, unknown>)[key];
      }
    }
    warnSpy = spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const key of Object.keys(originalEnv)) {
      (import.meta.env as Record<string, unknown>)[key] = (originalEnv as Record<string, unknown>)[
        key
      ];
    }
    warnSpy.mockRestore();
    resetPerfOverrideWarnings();
  });

  test('returns default when no override is set', () => {
    expect(readNumericOverride('MAX_CACHE', 10)).toBe(10);
    expect(readNumericOverride('BYTES_CACHE_THRESHOLD', 500_000)).toBe(500_000);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('returns window override when set and numeric', () => {
    window.__okPerfOverrides = { MAX_CACHE: 50 };
    expect(readNumericOverride('MAX_CACHE', 10)).toBe(50);
  });

  test('warns exactly once per key when window override fires', () => {
    window.__okPerfOverrides = { MAX_CACHE: 50 };
    readNumericOverride('MAX_CACHE', 10);
    readNumericOverride('MAX_CACHE', 10);
    readNumericOverride('MAX_CACHE', 10);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('MAX_CACHE = 50');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('window.__okPerfOverrides');
  });

  test('returns env override when window is unset and env has a numeric value', () => {
    (import.meta.env as Record<string, string>).VITE_OK_PERF_BYTES_CACHE_THRESHOLD = '10000000';
    expect(readNumericOverride('BYTES_CACHE_THRESHOLD', 500_000)).toBe(10_000_000);
  });

  test('window override takes precedence over env override', () => {
    window.__okPerfOverrides = { MAX_CACHE: 99 };
    (import.meta.env as Record<string, string>).VITE_OK_PERF_MAX_CACHE = '42';
    expect(readNumericOverride('MAX_CACHE', 10)).toBe(99);
  });

  test('falls back to default when env value is not numeric', () => {
    (import.meta.env as Record<string, string>).VITE_OK_PERF_MAX_CACHE = 'not-a-number';
    expect(readNumericOverride('MAX_CACHE', 10)).toBe(10);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('not numeric');
  });

  test('rejects non-finite window override (NaN / Infinity)', () => {
    window.__okPerfOverrides = { MAX_CACHE: Number.NaN };
    expect(readNumericOverride('MAX_CACHE', 10)).toBe(10);

    window.__okPerfOverrides = { MAX_CACHE: Number.POSITIVE_INFINITY };
    expect(readNumericOverride('MAX_CACHE', 10)).toBe(10);
  });

  test('zero is a valid override value (distinguishes from unset)', () => {
    window.__okPerfOverrides = { MAX_CACHE: 0 };
    expect(readNumericOverride('MAX_CACHE', 10)).toBe(0);
  });

  test('warn-once cache is keyed per override key', () => {
    window.__okPerfOverrides = { MAX_CACHE: 50, VIEW_COUNT_CACHE_THRESHOLD: 100 };
    readNumericOverride('MAX_CACHE', 10);
    readNumericOverride('VIEW_COUNT_CACHE_THRESHOLD', 50);
    readNumericOverride('MAX_CACHE', 10); // suppressed
    readNumericOverride('VIEW_COUNT_CACHE_THRESHOLD', 50); // suppressed
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  test('resetPerfOverrideWarnings clears the once-cache so tests can re-observe warnings', () => {
    window.__okPerfOverrides = { MAX_CACHE: 50 };
    readNumericOverride('MAX_CACHE', 10);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    resetPerfOverrideWarnings();
    readNumericOverride('MAX_CACHE', 10);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  test('PROD short-circuit returns default ignoring all override channels', () => {
    const original = (import.meta.env as Record<string, unknown>).PROD;
    try {
      (import.meta.env as Record<string, unknown>).PROD = true;
      window.__okPerfOverrides = { MAX_CACHE: 999 };
      (import.meta.env as Record<string, string>).VITE_OK_PERF_BYTES_CACHE_THRESHOLD = '10000000';
      expect(readNumericOverride('MAX_CACHE', 10)).toBe(10);
      expect(readNumericOverride('BYTES_CACHE_THRESHOLD', 500_000)).toBe(500_000);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      (import.meta.env as Record<string, unknown>).PROD = original;
    }
  });
});
