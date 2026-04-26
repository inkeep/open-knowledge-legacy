/**
 * Renderer-side mirror of `packages/desktop/src/shared/labels.ts`.
 *
 * Inclusion rule: only strings duplicated across two-or-more cross-package
 * surfaces belong here. Single-site labels stay inline at their call site.
 *
 * Same module-resolution constraint that forces the three-way duplication
 * of `desktop-bridge-types.ts` applies here — the app package's TypeScript
 * program cannot share modules with `@inkeep/open-knowledge-desktop`
 * directly. Two copies (desktop main + app renderer) suffice for label
 * constants; drift caught by the
 * `M1 invariant: SWITCH_PROJECT_LABEL_WITH_ELLIPSIS drift catcher` test in
 * `packages/desktop/tests/integration/m1-smoke.test.ts`.
 */

export const SWITCH_PROJECT_LABEL_WITH_ELLIPSIS = 'Switch Project…' as const;
