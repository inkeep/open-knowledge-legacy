/**
 * Renderer-side mirror of `packages/desktop/src/shared/labels.ts`.
 *
 * Inclusion rule: only strings duplicated across two-or-more cross-package
 * surfaces belong here. Single-site labels stay inline at their call site.
 *
 * The app package does not import from `@inkeep/open-knowledge-desktop`
 * (same rationale as `desktop-bridge-types.ts` — three-way duplication
 * avoids cross-package module-resolution issues). Drift between the two
 * copies is caught by `packages/desktop/tests/integration/labels-drift.test.ts`.
 */

export const SWITCH_PROJECT_LABEL_WITH_ELLIPSIS = 'Switch Project…' as const;
