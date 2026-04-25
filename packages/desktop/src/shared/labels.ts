/**
 * User-facing string constants surfaced from the desktop app's main process.
 *
 * Keep this file zero-dep — it loads in main, preload, and any test runner.
 * The renderer side (`packages/app/src/lib/desktop-labels.ts`) carries a
 * deliberately-mirrored copy because the app package does not import from
 * `@inkeep/open-knowledge-desktop`. Drift is caught by
 * `packages/desktop/tests/integration/labels-drift.test.ts`.
 */

/**
 * Shown on:
 *   - File → Switch Project… (menu accelerator `Cmd+Shift+N` preserved)
 *   - ProjectSwitcher dropdown's tail item
 *
 * The CommandPalette uses the no-ellipsis form (the palette already implies
 * "this opens something"); that variant lives in the app-side mirror only
 * because the desktop main process never references it.
 */
export const SWITCH_PROJECT_LABEL_WITH_ELLIPSIS = 'Switch Project…';
