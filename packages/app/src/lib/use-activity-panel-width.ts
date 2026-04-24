/**
 * useActivityPanelWidth — user-adjustable width for the Agent Activity
 * Panel with localStorage persistence.
 *
 * D-P12 (originally DIRECTED at 480 px fixed) is refined here: the panel
 * opens at 480 px on first use, then honors whatever width the user set
 * via the drag handle on subsequent opens. Width persists across tabs
 * and reloads via `localStorage('ok-activity-panel-width-v1')` — versioned
 * key matching the `ok-theme-v1` / `ok-pin-v1` / `ok-editor-mode-v1`
 * precedent.
 *
 * Width is clamped to [`MIN_PANEL_WIDTH`, `MAX_PANEL_WIDTH`] — 320 px keeps
 * the collapsed file-row affordances (carrot + filename + stat + ts) from
 * overflowing; 900 px caps the overlay so it never hides the entire editor.
 *
 * Persistence failures (localStorage disabled, quota exceeded) are silent.
 * Panel state is tab-scoped per FR-P21; persistence is a quality-of-life
 * nice-to-have, not load-bearing. Corrupt values (non-numeric, out of range)
 * fall back to the default — same pattern as `use-editor-mode.ts`.
 */
import { useEffect, useState } from 'react';

/** Keeps the collapsed-row header elements legible without wrapping. */
export const MIN_PANEL_WIDTH = 320;
/** Caps the overlay so the editor remains partly visible. */
export const MAX_PANEL_WIDTH = 900;
/** First-use default, matches the original SPEC D-P12 target. */
export const DEFAULT_PANEL_WIDTH = 480;

const STORAGE_KEY = 'ok-activity-panel-width-v1';

/** Clamp + round any candidate width to a valid integer pixel count. */
export function clampPanelWidth(candidate: number): number {
  if (!Number.isFinite(candidate)) return DEFAULT_PANEL_WIDTH;
  const rounded = Math.round(candidate);
  if (rounded < MIN_PANEL_WIDTH) return MIN_PANEL_WIDTH;
  if (rounded > MAX_PANEL_WIDTH) return MAX_PANEL_WIDTH;
  return rounded;
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_PANEL_WIDTH;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PANEL_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      // Matches use-editor-mode.ts FR-8: warn once on corrupt value; fall back.
      console.warn('[activity-panel-width] invalid persisted value, resetting', { raw });
      return DEFAULT_PANEL_WIDTH;
    }
    return clampPanelWidth(parsed);
  } catch {
    // localStorage may throw in private browsing + certain Safari contexts.
    return DEFAULT_PANEL_WIDTH;
  }
}

interface UseActivityPanelWidthResult {
  width: number;
  setWidth: (next: number) => void;
}

export function useActivityPanelWidth(): UseActivityPanelWidthResult {
  const [width, setWidthState] = useState<number>(() => readStoredWidth());

  // Persist on every change. Write is fire-and-forget; a storage throw is
  // tolerated silently so the panel stays usable under quota or private mode.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // No-op — see module JSDoc.
    }
  }, [width]);

  const setWidth = (next: number): void => {
    setWidthState(clampPanelWidth(next));
  };

  return { width, setWidth };
}
