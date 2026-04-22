/**
 * useEditorMode — unit tests for the pure-logic surfaces:
 *   - `isEditorModeValue` (type-guard)
 *   - `readPersistedMode` (storage read + validation + throw swallow)
 *   - `readInitialMode` (window-global > storage > default precedence)
 *   - `persistMode` (storage write + throw swallow with console.warn)
 *
 * Repo convention (see NavigatorApp.test.ts / interaction-layer.test.ts): no
 * @testing-library/react, no happy-dom. The React state-transition behavior
 * (useState init, focus listener registration/dispatch) is exercised by the
 * Playwright E2E suite added in US-004 (`editor-mode-persistence.e2e.ts`
 * tests T1, T3, T6, T7, T8).
 *
 * These unit tests cover the entire input-validation + storage-interaction
 * surface so the Playwright tier focuses on user-facing behavior.
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import {
  type EditorModeValue,
  isEditorModeValue,
  persistMode,
  readInitialMode,
  readPersistedMode,
  useEditorMode,
} from './use-editor-mode';

// ---------------------------------------------------------------------------
// Fake storage (minimal `getItem` / `setItem` surface)
// ---------------------------------------------------------------------------

interface FakeStorage {
  getItem: ReturnType<typeof mock>;
  setItem: ReturnType<typeof mock>;
}

function storageWith(value: string | null): FakeStorage {
  return {
    getItem: mock(() => value),
    setItem: mock(() => undefined),
  };
}

function storageThatThrowsOnGet(err: Error = new Error('privacy mode')): FakeStorage {
  return {
    getItem: mock(() => {
      throw err;
    }),
    setItem: mock(() => undefined),
  };
}

function storageThatThrowsOnSet(err: Error = new Error('quota exceeded')): FakeStorage {
  return {
    getItem: mock(() => null),
    setItem: mock(() => {
      throw err;
    }),
  };
}

// ---------------------------------------------------------------------------
// isEditorModeValue
// ---------------------------------------------------------------------------

describe('isEditorModeValue — type guard', () => {
  test("accepts 'wysiwyg'", () => {
    expect(isEditorModeValue('wysiwyg')).toBe(true);
  });

  test("accepts 'source'", () => {
    expect(isEditorModeValue('source')).toBe(true);
  });

  test('rejects other strings (garbage value, case-mismatch, diff mode)', () => {
    expect(isEditorModeValue('garbage')).toBe(false);
    expect(isEditorModeValue('WYSIWYG')).toBe(false);
    expect(isEditorModeValue('diff')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isEditorModeValue('')).toBe(false);
  });

  test('rejects null, undefined, numbers, objects', () => {
    expect(isEditorModeValue(null)).toBe(false);
    expect(isEditorModeValue(undefined)).toBe(false);
    expect(isEditorModeValue(0)).toBe(false);
    expect(isEditorModeValue({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readPersistedMode — storage read + validation + throw swallow
// ---------------------------------------------------------------------------

describe('readPersistedMode — localStorage read with validation', () => {
  test("returns 'wysiwyg' when storage is empty (default fallback — FR-3)", () => {
    const storage = storageWith(null);
    expect(readPersistedMode(storage)).toBe('wysiwyg');
  });

  test("returns 'source' when storage holds 'source'", () => {
    const storage = storageWith('source');
    expect(readPersistedMode(storage)).toBe('source');
  });

  test("returns 'wysiwyg' when storage holds 'wysiwyg' (round-trip)", () => {
    const storage = storageWith('wysiwyg');
    expect(readPersistedMode(storage)).toBe('wysiwyg');
  });

  test("falls back to 'wysiwyg' when storage holds an invalid value (FR-8, manual tampering)", () => {
    const storage = storageWith('garbage');
    expect(readPersistedMode(storage)).toBe('wysiwyg');
  });

  test("falls back to 'wysiwyg' when storage holds 'diff' (diff mode never persisted — SPEC §6 FR-6)", () => {
    const storage = storageWith('diff');
    expect(readPersistedMode(storage)).toBe('wysiwyg');
  });

  test("returns 'wysiwyg' and swallows when getItem throws (FR-7, privacy mode)", () => {
    const storage = storageThatThrowsOnGet();
    expect(readPersistedMode(storage)).toBe('wysiwyg');
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  test('reads exactly once per call (no redundant storage access)', () => {
    const storage = storageWith('source');
    readPersistedMode(storage);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  test('uses the correct storage key (ok-editor-mode-v1 — storage-key rename is 1-way door)', () => {
    const storage = storageWith(null);
    readPersistedMode(storage);
    expect(storage.getItem).toHaveBeenCalledWith('ok-editor-mode-v1');
  });
});

// ---------------------------------------------------------------------------
// readInitialMode — window-global > storage > default precedence
// ---------------------------------------------------------------------------

describe('readInitialMode — precedence: window global > storage > default', () => {
  test("prefers window.__OK_EDITOR_MODE__ when set to 'source' (FOUC source of truth)", () => {
    const win = { __OK_EDITOR_MODE__: 'source' as const };
    const storage = storageWith('wysiwyg'); // even if storage says wysiwyg
    expect(readInitialMode(win, storage)).toBe('source');
    // The preload bypasses storage read entirely — no getItem call.
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  test("prefers window.__OK_EDITOR_MODE__ when set to 'wysiwyg'", () => {
    const win = { __OK_EDITOR_MODE__: 'wysiwyg' as const };
    const storage = storageWith('source');
    expect(readInitialMode(win, storage)).toBe('wysiwyg');
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  test('falls back to localStorage when window global is unset', () => {
    const win = {};
    const storage = storageWith('source');
    expect(readInitialMode(win, storage)).toBe('source');
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  test('falls back to localStorage when window global is an invalid value', () => {
    const win = { __OK_EDITOR_MODE__: 'garbage' };
    const storage = storageWith('source');
    expect(readInitialMode(win, storage)).toBe('source');
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  test('falls back to localStorage when window global is null', () => {
    const win = { __OK_EDITOR_MODE__: null };
    const storage = storageWith('source');
    expect(readInitialMode(win, storage)).toBe('source');
  });

  test("falls back to default 'wysiwyg' when both window global and storage are empty (first-time user)", () => {
    const win = {};
    const storage = storageWith(null);
    expect(readInitialMode(win, storage)).toBe('wysiwyg');
  });

  test("falls back to default 'wysiwyg' when both window global and storage hold invalid values", () => {
    const win = { __OK_EDITOR_MODE__: 'garbage' };
    const storage = storageWith('also-garbage');
    expect(readInitialMode(win, storage)).toBe('wysiwyg');
  });

  test('falls back gracefully when storage throws and window global is unset', () => {
    const win = {};
    const storage = storageThatThrowsOnGet();
    expect(readInitialMode(win, storage)).toBe('wysiwyg');
  });
});

// ---------------------------------------------------------------------------
// persistMode — storage write + throw swallow + [editor-mode] warn prefix
// ---------------------------------------------------------------------------

describe('persistMode — localStorage write with error swallow + warn logging', () => {
  let warnSpy: ReturnType<typeof spyOn> | undefined;

  beforeEach(() => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = undefined;
  });

  test("writes 'source' to storage under the correct key", () => {
    const storage = storageWith(null);
    const ok = persistMode('source', storage);
    expect(ok).toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith('ok-editor-mode-v1', 'source');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("writes 'wysiwyg' to storage under the correct key", () => {
    const storage = storageWith(null);
    const ok = persistMode('wysiwyg', storage);
    expect(ok).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith('ok-editor-mode-v1', 'wysiwyg');
  });

  test('returns false and logs warn when setItem throws (FR-7, privacy-mode / quota)', () => {
    const storage = storageThatThrowsOnSet();
    const ok = persistMode('source', storage);
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Bracket-prefix format per CLAUDE.md "Logging conventions" section.
    const firstCall = warnSpy?.mock.calls[0];
    expect(firstCall?.[0]).toBe('[editor-mode] persist failed');
    // Second arg is the error — included for observability, not a structured JSON event.
    expect(firstCall?.[1]).toBeInstanceOf(Error);
  });

  test('write throw is fully swallowed — caller never sees the exception', () => {
    const storage = storageThatThrowsOnSet();
    // Must not throw; return value alone communicates failure.
    expect(() => persistMode('source', storage)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Module shape smoke test — guards against refactor drift on the public API
// ---------------------------------------------------------------------------

describe('module exports — public API shape', () => {
  test('useEditorMode is a function (React hook)', () => {
    expect(typeof useEditorMode).toBe('function');
  });

  test('pure helpers are exported for unit testing', () => {
    expect(typeof isEditorModeValue).toBe('function');
    expect(typeof readPersistedMode).toBe('function');
    expect(typeof readInitialMode).toBe('function');
    expect(typeof persistMode).toBe('function');
  });

  test('EditorModeValue type is usable at runtime via values', () => {
    // Type-only guard — the assertion is that TS compiles this line.
    const modes: EditorModeValue[] = ['wysiwyg', 'source'];
    expect(modes).toHaveLength(2);
  });
});
