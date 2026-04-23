/**
 * useEditorMode — persists the user's editor mode (`wysiwyg` / `source`) as a
 * user-global preference that survives refreshes, new tabs, and new Electron
 * windows on the same origin.
 *
 * Read-once at load (SPEC D9, supersedes D7): the hook reads localStorage
 * exactly once via its `useState` initializer. `persistAndSet` writes to
 * localStorage on every caller invocation so the last toggle wins at the next
 * load. Open tabs/windows do NOT update each other live — each is its own
 * session for its lifetime. Cross-window sync (Excalidraw Pattern C / next-
 * themes Pattern A / BroadcastChannel Pattern B) was rejected: the spontaneous
 * mode-flip on tab-focus surprises the user regardless of IME/drag-selection
 * protection.
 *
 * The `useState` initializer prefers `window.__OK_EDITOR_MODE__`, which the
 * FOUC-prevention inline script in `packages/app/index.html` sets before React
 * mounts. This gives flash-free first paint for users whose persisted mode is
 * `source`.
 *
 * Consumed by `EditorPane` only. Do NOT wrap in a React Context (ASK_FIRST
 * per SPEC §15 — consumer count is 1, Context would add indirection without
 * benefit).
 */
import { useState } from 'react';

const STORAGE_KEY = 'ok-editor-mode-v1';

/**
 * Single source of truth for the persistable editor-mode value set. Derive
 * `EditorModeValue` and the `isEditorModeValue` guard from this constant so a
 * future mode addition updates the type and the guard atomically.
 */
export const EDITOR_MODE_VALUES = ['wysiwyg', 'source'] as const;

export type EditorModeValue = (typeof EDITOR_MODE_VALUES)[number];

const DEFAULT_MODE: EditorModeValue = 'wysiwyg';

declare global {
  interface Window {
    /**
     * Set by the FOUC-prevention inline script in `packages/app/index.html`
     * before React mounts. The inline script is untyped, so the value here is
     * untrusted — readers MUST validate via `isEditorModeValue()` before use.
     * Typed as `unknown` (not `EditorModeValue`) so the compiler compels that
     * validation at every read site.
     */
    __OK_EDITOR_MODE__?: unknown;
  }
}

/** Type guard — exported for unit testing. */
export function isEditorModeValue(raw: unknown): raw is EditorModeValue {
  return (EDITOR_MODE_VALUES as readonly unknown[]).includes(raw);
}

/**
 * Read the persisted mode directly from storage. Returns the default on miss,
 * invalid value, or storage access throw. Pure + injectable — exported for
 * unit testing.
 *
 * On a structurally invalid persisted value (SPEC FR-8: prior-version schema
 * violation or manual localStorage tampering), logs a single bracket-prefix
 * `console.warn` so "my preference doesn't persist" reports are diagnosable.
 * The storage-throw branch stays silent — privacy-mode / quota throws are a
 * normal environmental condition, not a bug.
 */
export function readPersistedMode(
  storage: Pick<Storage, 'getItem'> = localStorage,
): EditorModeValue {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_MODE;
    if (isEditorModeValue(raw)) return raw;
    console.warn('[editor-mode] invalid persisted value, falling back to default', { raw });
  } catch {
    // Privacy mode / quota / serialization — stay silent; only the invalid-
    // value branch above logs (FR-8 "Warning logged").
  }
  return DEFAULT_MODE;
}

/**
 * Read the initial mode for the hook's useState initializer. Precedence:
 *   1. `window.__OK_EDITOR_MODE__` — set by the FOUC inline script (authoritative first-paint value)
 *   2. Fresh localStorage read — fallback for SSR / test harnesses / unexpected boot order
 *   3. Default (`'wysiwyg'`)
 * Pure + injectable — exported for unit testing.
 */
export function readInitialMode(
  win: { __OK_EDITOR_MODE__?: unknown } = window,
  storage: Pick<Storage, 'getItem'> = localStorage,
): EditorModeValue {
  const preloaded = win.__OK_EDITOR_MODE__;
  if (isEditorModeValue(preloaded)) return preloaded;
  return readPersistedMode(storage);
}

/**
 * Persist mode to storage. Swallows throws (privacy mode, quota) with a
 * `[editor-mode]` bracket-prefix console.warn per CLAUDE.md logging
 * conventions. Returns true on success, false on throw. Pure + injectable —
 * exported for unit testing.
 */
export function persistMode(
  next: EditorModeValue,
  storage: Pick<Storage, 'setItem'> = localStorage,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, next);
    return true;
  } catch (err) {
    console.warn('[editor-mode] persist failed', err);
    return false;
  }
}

/**
 * React hook. Returns `[mode, setMode]`. Reads localStorage exactly once via
 * the `useState` initializer. Every `setMode` call updates React state AND
 * writes to localStorage so the last toggle wins at the next load. The hook
 * does NOT listen for cross-window changes — open tabs remain independent
 * until one reloads (SPEC D9).
 */
export function useEditorMode(): readonly [EditorModeValue, (next: EditorModeValue) => void] {
  const [mode, setMode] = useState<EditorModeValue>(readInitialMode);

  function persistAndSet(next: EditorModeValue) {
    setMode(next);
    persistMode(next);
  }

  return [mode, persistAndSet] as const;
}
