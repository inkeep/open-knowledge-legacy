/**
 * useEditorMode — persists the user's editor mode (`wysiwyg` / `source`) as a
 * user-global preference that survives refreshes, new tabs, and new Electron
 * windows on the same origin. Cross-window preference changes are re-applied
 * when this window regains focus (Excalidraw Pattern C — SPEC D7).
 *
 * The hook's `useState` initializer prefers `window.__OK_EDITOR_MODE__`, which
 * the FOUC-prevention inline script in `packages/app/index.html` sets before
 * React mounts. This gives flash-free first paint for users whose persisted
 * mode is `source`.
 *
 * Live `storage` event auto-apply was rejected (SPEC D7): the mode-swap CSS
 * class `.ok-mode-hidden` preserves DOM presence via `content-visibility` but
 * still interrupts IME composition and in-flight drag-selection — the cost
 * outweighs the eventual-consistency benefit on an unfocused window.
 *
 * Consumed by `EditorPane` only. Do NOT wrap in a React Context (ASK_FIRST
 * per SPEC §15 — consumer count is 1, Context would add indirection without
 * benefit).
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ok-editor-mode-v1';

export type EditorModeValue = 'wysiwyg' | 'source';

const DEFAULT_MODE: EditorModeValue = 'wysiwyg';

declare global {
  interface Window {
    /**
     * Set by the FOUC-prevention inline script in `packages/app/index.html`
     * before React mounts. Exactly `'wysiwyg' | 'source'` on a valid path;
     * may be `undefined` in non-browser test harnesses. Read once by
     * `readInitialMode()` and never mutated.
     */
    __OK_EDITOR_MODE__?: EditorModeValue;
  }
}

/** Type guard — exported for unit testing. */
export function isEditorModeValue(raw: unknown): raw is EditorModeValue {
  return raw === 'wysiwyg' || raw === 'source';
}

/**
 * Read the persisted mode directly from storage. Returns the default on miss,
 * invalid value, or storage access throw. Pure + injectable — exported for
 * unit testing.
 */
export function readPersistedMode(
  storage: Pick<Storage, 'getItem'> = localStorage,
): EditorModeValue {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (isEditorModeValue(raw)) return raw;
  } catch {
    // Privacy mode / quota / serialization — fall through to default.
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
 * React hook. Returns `[mode, setMode]`. Every `setMode` call updates React
 * state AND writes to localStorage synchronously. On window `focus`, re-reads
 * storage and updates state if the persisted value differs from current — the
 * functional-update form short-circuits the reducer when values are equal so
 * equal-value writes don't schedule re-renders.
 */
export function useEditorMode(): readonly [EditorModeValue, (next: EditorModeValue) => void] {
  const [mode, setMode] = useState<EditorModeValue>(readInitialMode);

  useEffect(() => {
    function handleFocus() {
      const next = readPersistedMode();
      setMode((current) => (current === next ? current : next));
    }
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  function persistAndSet(next: EditorModeValue) {
    setMode(next);
    persistMode(next);
  }

  return [mode, persistAndSet] as const;
}
