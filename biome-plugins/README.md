# Biome GritQL plugins

Custom lint rules for this workspace, registered in [`biome.jsonc`](../biome.jsonc) at the top-level `plugins` array (workspace-wide) OR a scoped `overrides[].plugins` entry (file-specific — used when the rule's invariant only applies to a known subset of files; see `playwright-topass-budget.grit` below). Each `.grit` file is a single GritQL pattern (or `or { ... }` of patterns) emitting diagnostics via `register_diagnostic()`.

Plugins surface as lint errors during `biome check` (i.e. `bun run lint` and `bun run check`) and as inline editor squiggles via the Biome LSP.

## Convention

**All custom Biome lint enforcement uses GritQL plugins** — [PRECEDENTS.md #42](../PRECEDENTS.md#custom-lint-enforcement-precedent-42). Use a `.grit` file under this directory + a fixture-file test. The fixture-file test is non-negotiable: it preserves the mutation-self-test property by asserting an exact diagnostic count on a fixture pairing positive cases with negative cases.

**Diagnostic messages name the fix and link the docs.** Every `register_diagnostic` message has two load-bearing pieces: (a) a noun-phrase or action verb-phrase that names what to do to fix the violation (the fix-noun — readers see this and know the next move without leaving the editor); (b) a trailing `See <docs-URL>` pointing at the rule's section in this README so the message stays self-documenting. Process metadata (decision markers like `D19:`, spec-section refs) does NOT belong in the diagnostic — it rots the same way it rots in source comments. The fixture test asserts both pieces are present (substring match for the fix-noun + URL regex) so the convention survives drift.

## Rules

### `microcopy-ellipsis.grit`

Flags U+2026 (`…`) in two JSX surfaces:
- **JSX text children** — `<span>Loading…</span>`
- **JSX attribute string values** for `placeholder | label | title | aria-label | description | tooltip`

The codebase reserves `…` for two cases only:
1. **macOS native menu items** (rendered via `Menu.buildFromTemplate` in `packages/desktop/src/main/menu.ts`). Native-OS convention for "opens a new surface" (Apple/Windows/GTK HIG).
2. **Truncation indicators** — where `…` literally means "I cut text here" (graph labels, breadcrumb collapse, search snippets, sha256 prefixes, token-prefix elisions).

The rule does NOT catch:
- Object-literal menu templates (`{ label: 'Settings…' }`) — naturally skipped because they're not JSX, which is correct (Electron menus belong to case #1).
- `…` in plain `.ts` files — naturally skipped because they're not JSX (graph-label-utils, suggest-links, etc. — these are all case #2 truncation utilities).
- `…` in CLI strings (`process.stderr.write('Cloning…')`) — uncaught gap; review discipline covers the small CLI surface.
- `…` in JSX expression-child string literals (`<span>{'Loading…'}</span>`) — uncaught gap; zero occurrences in the codebase today (developers write `<span>Loading…</span>` directly). If a realistic case emerges, add a `jsx_expression` pattern matching `string` literal children rather than retrofit ad-hoc.

Test: [`packages/app/tests/integration/microcopy-ellipsis.test.ts`](../packages/app/tests/integration/microcopy-ellipsis.test.ts).

### `no-loosely-typed-webcontents-ipc.grit`

IPC discipline enforcement. Forbids direct electron IPC primitives (`webContents.send`, `ipcMain.handle/on`, `ipcRenderer.invoke/on/once`) outside the typed-wrapper files. Consumers must route through `createInvoker` / `createHandler` / `sendToRenderer` from `packages/desktop/src/shared/ipc-*.ts`. See [PRECEDENTS.md #14](../PRECEDENTS.md) for the IPC discipline rationale.

Test: [`packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts`](../packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts).

### `no-resolved-value-theme-source.grit`

1-way theme contract. Forbids resolving the user-intent theme value at the `bridge.setThemeSource(...)` call site. The contract is 1-way: pass the unresolved CRDT value (`'system' | 'light' | 'dark'`) verbatim. `'system'` delegates appearance tracking to macOS via `nativeTheme`; resolving at the call site (via `matchMedia` or a `prefersDark ? 'dark' : 'light'` ternary) loses tracking. See [PRECEDENTS.md #40(a)](../PRECEDENTS.md) for the renderer-state↔main-state contract.

Detection patterns (call expressions only — type-declarations are naturally excluded):
- `setThemeSource($arg)` where `$arg` contains `matchMedia` (any form)
- `setThemeSource($arg)` where `$arg` contains both `'light'` and `'dark'` string literals (likely a ternary, either order)
- Matches both bare-call and member-call shapes (`obj.setThemeSource(...)`)

Test: [`packages/desktop/tests/integration/no-resolved-value-theme-source.test.ts`](../packages/desktop/tests/integration/no-resolved-value-theme-source.test.ts).

### `no-unportaled-editor-content.grit`

H6 cross-doc DOM bleed contract. `@tiptap/react`'s `PureEditorContent.componentDidMount` runs `element.append(...editor.view.dom.parentNode.childNodes)` — a sibling-vacuum primitive. When `view.dom` shares a parent with another editor's `view.dom` (e.g., V2 cache parked nodes, cross-Activity reconciliation transitions), the vacuum drags foreign content into the active wrapper. The structural fix is to render every `<EditorContent>` via `React.createPortal` into a per-Activity exclusively-owned DOM target, so `view.dom`'s parent only ever contains THIS editor's nodes.

The rule flags every JSX usage of `<EditorContent>` — both self-closing and child-bearing forms — and asks the author to suppress at the canonical portaled site (where the createPortal call lives) with `// biome-ignore lint/plugin/no-unportaled-editor-content: <reason>`. Adding a non-portaled `<EditorContent>` anywhere else in the codebase becomes a lint error, gated at editor-save / `bun run lint` time.

Canonical sanctioned shape (TiptapEditor.tsx):

```tsx
createPortal(
  <EditorContent editor={editor} className="..." />,
  portalTarget,
);
```

Plugin: [`biome-plugins/no-unportaled-editor-content.grit`](no-unportaled-editor-content.grit). Fixture: [`biome-plugins/__fixtures__/no-unportaled-editor-content.fixture.tsx`](__fixtures__/no-unportaled-editor-content.fixture.tsx). Test: [`packages/app/tests/integration/no-unportaled-editor-content.test.ts`](../packages/app/tests/integration/no-unportaled-editor-content.test.ts). See [PRECEDENTS.md #44](../PRECEDENTS.md) for the H6 cross-doc DOM bleed contract and [PRECEDENTS.md #42](../PRECEDENTS.md#custom-lint-enforcement-precedent-42) for the GritQL-plugin convention.

### `playwright-topass-budget.grit`

Flags `toPass({ timeout: N })` calls where `N` is a thousand-range literal below `15_000` (the canonical range `1_000`–`14_999`, with or without the `_` digit separator). The rule pairs with `tests/smoke/calibration.test.ts` Invariant B: the calibration unit test enforces the boundary at `bun run check` time (PR-tier gate); this plugin fires at editor-save / lint-time so authors see the regression instantly.

**Why 15s.** macOS `open(1)` Apple-Event delivery + window creation + IPC roundtrip empirically takes 2-8s on a healthy CI runner and can hit 8.8s under sustained load. 15s gives 2-3x headroom over typical worst case. Precedent: `external-link.e2e.ts:83` `firstWindow({ timeout: 15_000 })`.

**Scoped via `overrides[].plugins`** to `packages/desktop/tests/smoke/{deep-link,external-link}.e2e.ts` + the fixture itself. `packages/app`'s `*.e2e.ts` files drive Chromium in-process (NOT macOS `open(1)` Apple-Event dispatch), so their sub-15s `toPass` budgets are legitimate and must not be flagged. The override scope mirrors `tests/smoke/calibration.test.ts`'s `TOPASS_BUDGET_FILES` whitelist — same boundary, two enforcement layers (lint-time + check-time).

The rule does NOT catch:
- Sub-1000ms literals (e.g., `timeout: 500`) — the canonical range starts at `1_000`. Sub-1s budgets aren't realistic for the macOS Apple-Event path. Calibration unit test backstops all values regardless of magnitude.
- Non-literal expressions (variables, computed values, member access) — pattern matches numeric literals only. Calibration unit test reads the same regex contract from source text and would still catch non-literal forms via the parser's literal extraction.
- Invariant A (cumulative inner timeouts ≤ outer per-test budget) — requires aggregation across same-file helper-call graphs, which GritQL pattern matching can't express. Enforced exclusively by the calibration unit test.

Plugin: [`biome-plugins/playwright-topass-budget.grit`](playwright-topass-budget.grit). Fixture: [`biome-plugins/__fixtures__/playwright-topass-budget.fixture.tsx`](__fixtures__/playwright-topass-budget.fixture.tsx). Test: [`packages/desktop/tests/integration/playwright-topass-budget.test.ts`](../packages/desktop/tests/integration/playwright-topass-budget.test.ts). See [PRECEDENTS.md #42](../PRECEDENTS.md#custom-lint-enforcement-precedent-42) for the GritQL-plugin convention.

## Suppression

Inline `// biome-ignore` comments silence individual diagnostics. The most specific form names the rule and the reason:

```tsx
// biome-ignore lint/plugin/<rule-name>: <reason>
<span>…</span>
```

Empirically verified (matches Biome 2.4 suppression-comment syntax):
- `// biome-ignore lint: reason` (most generic — silences any lint diagnostic)
- `// biome-ignore lint/plugin: reason` (group level)
- `// biome-ignore lint/plugin/<rule-name>: reason` (specific — recommended)
- `// biome-ignore plugin: reason` does NOT work (missing `lint/` prefix)

Current production suppressions:
- `microcopy-ellipsis`: 2 sites (`AuthModal.tsx`, `Breadcrumb.tsx`)
- `no-loosely-typed-webcontents-ipc`: 15 sites (`preload/index.ts` ×12, `shared/ipc-send.ts` ×1, `tests/smoke/theme-sync.e2e.ts` ×2)
- `no-resolved-value-theme-source`: 0 sites
- `playwright-topass-budget`: 0 sites

## Adding a new plugin

### 1. Author the `.grit` file

Drop `<rule-name>.grit` in this directory. Each file is one GritQL pattern (or `or { ... }` of patterns):

```gritql
// <rule-name> — <one-line purpose>.
//
// <multi-line rationale>
//
// Suppress legitimate cases with:
//   // biome-ignore lint/plugin/<rule-name>: <reason>

language js

`some-pattern($args)` as $node where {
    register_diagnostic(
        span = $node,
        message = "<problem>. <fix-noun naming the action>. See https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#<rule-name>grit"
    )
}
```

**Message shape (load-bearing).** The diagnostic message has three parts in order: (1) the problem statement, (2) the fix-noun (the noun-phrase or action verb-phrase the reader applies to make the message go away), (3) `See <docs-URL>` pointing at this README's rule section. Anchor naming follows GitHub's auto-slug for code-fence-stripped headers — `### \`microcopy-ellipsis.grit\`` becomes `#microcopy-ellipsisgrit` (the dot is dropped, the backticks are stripped). Process metadata (decision tokens like `D19:`, spec citations) does NOT belong here — it rots like any other comment-discipline violation.

**Regex matching note:** GritQL regex matches the ENTIRE node text. For substring matches, use `r"(?s).*<term>.*"` — the `.*` wildcards bracket the term, and `(?s)` enables single-line mode so `.` matches newlines (needed for multi-line argument expressions).

### 2. Register in `biome.jsonc`

Pick the scope:

- **Workspace-wide** (default — used by `microcopy-ellipsis`, `no-loosely-typed-webcontents-ipc`, `no-resolved-value-theme-source`): add the path to the top-level `plugins` array. The rule fires on every linted file.
- **Scoped to specific files** (used by `playwright-topass-budget`): add an entry to the `overrides` array with `includes: [...]` listing the in-scope files (and the fixture path so the fixture test still triggers the rule) and `plugins: ['./biome-plugins/<rule-name>.grit']`. Use this when the rule's invariant only holds for a known subset of files — e.g., a budget that depends on a platform-specific code path. Document the scope-discipline rationale in the rule's docstring and assert it in the fixture-file test.

Either shape participates in the same `biome check` pass; the override form just adds Biome's path matcher in front of the GritQL pattern.

### 3. Author the fixture file

Place at `biome-plugins/__fixtures__/<rule-name>.fixture.tsx`. **Pair positive cases with negative cases** — the negative cases give the `toBe(N)` assertion real teeth. Typical fixture structure:
- 1+ positive case per pattern branch the rule has
- 2-4 negative cases that resemble positive ones but should NOT fire (adjacent methods on the same objects, type declarations, unrelated functions with the same name)

The main `bun run lint` does NOT reach the `biome-plugins/` directory (lint paths are `packages docs *.json *.jsonc *.ts`), so the deliberately-bad fixture content is invisible to the main lint.

### 4. Author the fixture-file test

Place at `packages/<host>/tests/integration/<rule-name>.test.ts` where `<host>` matches the package whose code the rule mainly targets. Template:

```ts
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// __dirname → packages/<host>/tests/integration/. Repo root is 4 levels up.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const FIXTURE_REL = 'biome-plugins/__fixtures__/<rule-name>.fixture.tsx';

describe('<rule-name> GritQL plugin', () => {
  test('fires on exactly N positive cases (and on no negative case)', () => {
    const result = spawnSync('bunx', ['biome', 'check', FIXTURE_REL], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    const fires = (output.match(/<unique diagnostic-message marker>/g) ?? []).length;
    expect(fires).toBe(N); // exact equality — see "Why toBe(N)?" below
    // Diagnostic message names the fix (action verb-phrase substring).
    expect(output).toContain('<fix-noun>');
    // Diagnostic message appends a docs URL — generic URL regex + anchor
    // substring. The anchor check keeps the regex from being vacuously
    // satisfied by an unrelated URL biome might surface elsewhere.
    expect(output).toMatch(/https?:\/\/[^\s]+/);
    expect(output).toContain('biome-plugins/README.md#<rule-name>grit');
  });

  test('plugin is registered in biome.jsonc', () => {
    const config = require(join(REPO_ROOT, 'biome.jsonc'));
    const plugins = config.plugins ?? [];
    expect(plugins).toContain('./biome-plugins/<rule-name>.grit');
  });
});
```

**Why `toBe(N)` and not `toBeGreaterThanOrEqual(N)`:** exact equality catches drift in BOTH directions. A weakened pattern that no longer fires on a positive case drops the count below N → test fails (the standard mutation-self-test property). A widened pattern that fires on a negative case raises the count above N → test also fails. The latter is the asymmetric-coverage win — pairing positive cases with negative cases gives the `toBe(N)` floor real meaning.

The "plugin is registered" test catches the failure mode where a `.grit` file is added but the `biome.jsonc#plugins` entry is missing.

**For override-scoped plugins** (step 2 second variant): swap the registration assertion for one that asserts the plugin is in `config.overrides[].plugins`, the matching override's `includes` covers every in-scope file (including the fixture), and the plugin is NOT at root `plugins[]` (so an accidental move from override to root, which would over-fire, fails). `playwright-topass-budget.test.ts` is the reference shape.

### 5. Verify

```bash
cd public/open-knowledge

# 1. Plugin loads + lint stays clean (after suppression comments at legitimate sites):
bun run lint

# 2. Fixture test fires the diagnostic on positive cases:
bun test packages/<host>/tests/integration/<rule-name>.test.ts

# 3. Mutation check (manual, one-time during dev):
#    Temporarily break the .grit pattern; re-run the test; confirm it FAILS;
#    restore the .grit pattern; re-run; confirm it passes.

# 4. False-positive widening check (manual, one-time):
#    Add a positive case to the fixture WITHOUT bumping N in the test.
#    Re-run; confirm it FAILS. This verifies toBe(N) is load-bearing.
```

### 6. Document the rule in this README

Add a section under `## Rules` with: what it flags, what it doesn't catch, links to the plugin + test + relevant precedents.

## Out of scope

- **Autofix.** Biome 2.4's GritQL plugins are diagnostic-only. Plugin diagnostics cannot apply code fixes. If autofix is required, a different enforcement mechanism is needed (build-time codemod, separate `--fix` script).
- **GritQL-internal path filters.** GritQL itself doesn't support file-path allowlists. The natural scope of the GritQL pattern (e.g., JSX-only) is the primary in-pattern mechanism for excluding files; inline `// biome-ignore` comments handle the residual. When a rule needs explicit per-file scoping, register the plugin under Biome's `overrides[].plugins` instead (see `playwright-topass-budget` and step 2 of "Adding a new plugin") — that runs the path matcher at the Biome layer before invoking the GritQL pattern.
- **CLI string content.** `process.stderr.write('...')` / `console.log` template-literal content is not reliably matchable via GritQL call-expression patterns (false-positive rate too high). Review discipline covers these surfaces.

## References

- [Biome Linter Plugins](https://biomejs.dev/linter/plugins/)
- [Biome GritQL Plugin Recipes](https://biomejs.dev/recipes/gritql-plugins/)
- [GritQL Patterns reference](https://docs.grit.io/language/patterns)
- [PRECEDENTS.md #42](../PRECEDENTS.md#custom-lint-enforcement-precedent-42) — the architectural decision codifying this convention.
- [PRECEDENTS.md #14](../PRECEDENTS.md) — IPC discipline (enforced by `no-loosely-typed-webcontents-ipc.grit`).
- [PRECEDENTS.md #40(a)](../PRECEDENTS.md) — renderer-state↔main-state propagation (enforced by `no-resolved-value-theme-source.grit`).
