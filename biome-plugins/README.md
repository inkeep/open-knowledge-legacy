# Biome GritQL plugins

Custom lint rules for this workspace, registered via the top-level `plugins` array in [`biome.jsonc`](../biome.jsonc). Each `.grit` file is a single GritQL pattern (or `or { ... }` of patterns) emitting diagnostics via `register_diagnostic()`.

Plugins surface as lint errors during `biome check` (i.e. `bun run lint` and `bun run check`) and as inline editor squiggles via the Biome LSP.

## Convention

**All custom Biome lint enforcement uses GritQL plugins** — [PRECEDENTS.md #42](../PRECEDENTS.md#custom-lint-enforcement-precedent-42). Use a `.grit` file under this directory + a fixture-file test. The fixture-file test is non-negotiable: it preserves the mutation-self-test property by asserting an exact diagnostic count on a fixture pairing positive cases with negative cases.

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

D19 enforcement. Forbids direct electron IPC primitives (`webContents.send`, `ipcMain.handle/on`, `ipcRenderer.invoke/on/once`) outside the typed-wrapper files. Consumers must route through `createInvoker` / `createHandler` / `sendToRenderer` from `packages/desktop/src/shared/`. See [PRECEDENTS.md #14](../PRECEDENTS.md) for the IPC discipline rationale.

Test: [`packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts`](../packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts).

### `no-resolved-value-theme-source.grit`

1-way theme contract. Forbids resolving the user-intent theme value at the `bridge.setThemeSource(...)` call site. The contract is 1-way: pass the unresolved CRDT value (`'system' | 'light' | 'dark'`) verbatim. `'system'` delegates appearance tracking to macOS via `nativeTheme`; resolving at the call site (via `matchMedia` or a `prefersDark ? 'dark' : 'light'` ternary) loses tracking. See [PRECEDENTS.md #40(a)](../PRECEDENTS.md) for the renderer-state↔main-state contract.

Detection patterns (call expressions only — type-declarations are naturally excluded):
- `setThemeSource($arg)` where `$arg` contains `matchMedia` (any form)
- `setThemeSource($arg)` where `$arg` contains both `'light'` and `'dark'` string literals (likely a ternary, either order)
- Matches both bare-call and member-call shapes (`obj.setThemeSource(...)`)

Test: [`packages/desktop/tests/integration/no-resolved-value-theme-source.test.ts`](../packages/desktop/tests/integration/no-resolved-value-theme-source.test.ts).

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
        message = "<actionable error message — name the rule + how to fix>"
    )
}
```

**Regex matching note:** GritQL regex matches the ENTIRE node text. For substring matches, use `r"(?s).*<term>.*"` — the `.*` wildcards bracket the term, and `(?s)` enables single-line mode so `.` matches newlines (needed for multi-line argument expressions).

### 2. Register in `biome.jsonc`

Add the path to the top-level `plugins` array.

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
- **Per-plugin path filters.** GritQL doesn't support file-path allowlists. The natural scope of the GritQL pattern (e.g., JSX-only) is the primary mechanism for excluding files; inline `// biome-ignore` comments handle the residual.
- **CLI string content.** `process.stderr.write('...')` / `console.log` template-literal content is not reliably matchable via GritQL call-expression patterns (false-positive rate too high). Review discipline covers these surfaces.

## References

- [Biome Linter Plugins](https://biomejs.dev/linter/plugins/)
- [Biome GritQL Plugin Recipes](https://biomejs.dev/recipes/gritql-plugins/)
- [GritQL Patterns reference](https://docs.grit.io/language/patterns)
- [PRECEDENTS.md #42](../PRECEDENTS.md#custom-lint-enforcement-precedent-42) — the architectural decision codifying this convention.
- [PRECEDENTS.md #14](../PRECEDENTS.md) — IPC discipline (enforced by `no-loosely-typed-webcontents-ipc.grit`).
- [PRECEDENTS.md #40(a)](../PRECEDENTS.md) — renderer-state↔main-state propagation (enforced by `no-resolved-value-theme-source.grit`).
