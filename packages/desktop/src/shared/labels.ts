/**
 * User-facing string constants surfaced from the desktop app's main process.
 *
 * Inclusion rule: only strings duplicated across two-or-more cross-package
 * surfaces belong here. Single-site labels stay inline at their call site.
 *
 * Keep this file zero-dep — it loads in main, preload, and any test runner.
 * The renderer side (`packages/app/src/lib/desktop-labels.ts`) carries a
 * deliberately-mirrored copy because the app package does not import from
 * `@inkeep/open-knowledge-desktop`. Drift is caught by
 * `packages/desktop/tests/integration/labels-drift.test.ts`.
 */

/**
 * Shown on every "re-summon the Project Navigator" affordance:
 *   - File → Switch Project… (menu accelerator `Cmd+Shift+N` preserved)
 *   - ProjectSwitcher dropdown's tail item
 *   - CommandPalette entry
 *
 * The ellipsis form matches the sibling `Open folder on disk…` palette item
 * — every cmdk row that opens a picker / dialog / new surface keeps it.
 */
export const SWITCH_PROJECT_LABEL_WITH_ELLIPSIS = 'Switch Project…' as const;
