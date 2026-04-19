---
dimension: Editor-Heavy Test Suite Specifics
date: 2026-04-16
sources: github.com/TypeCellOS/BlockNote, github.com/Milkdown/milkdown, github.com/facebook/lexical, github.com/udecode/plate, github.com/outline/outline
---

# Evidence: Editor-Heavy Test Suite Specifics

**Dimension:** D4 — Editor-Heavy Test Suite Specifics (P0 Moderate)
**Date:** 2026-04-16

## Projects surveyed

### BlockNote (TypeCellOS/BlockNote)
**Playwright config** — `tests/playwright.config.ts` (https://github.com/TypeCellOS/BlockNote/blob/main/tests/playwright.config.ts):
No `trace`/`video`/`screenshot` settings → defaults to `off`. Reporter in CI:
```ts
reporter: process.env.CI
  ? [["dot"], ["github"], ["blob", { outputDir: "blob-report" }], ["html", { open: "never" }]]
  : [["list", { printSteps: true }], ["html", { open: "on-failure" }]],
```
**Workflow** — `.github/workflows/build.yml`:
```yaml
- uses: actions/upload-artifact@v7
  if: ${{ !cancelled() }}
  with:
    name: blob-report-${{ matrix.browser }}-${{ matrix.shardIndex }}
    path: tests/blob-report/
    retention-days: 1

- uses: actions/upload-artifact@v7
  if: ${{ !cancelled() }}
  with:
    name: playwright-report-${{ matrix.browser }}-${{ matrix.shardIndex }}
    path: tests/playwright-report/
    retention-days: 30

- uses: actions/upload-artifact@v7
  with:
    name: playwright-report-merged
    path: tests/playwright-report/
    retention-days: 30
```
**Matrix:** `chromium | firefox | webkit` × shard `1/2 | 2/2`.
**Gate:** `if: ${{ !cancelled() }}` — uploads on BOTH pass and fail (required for merge step).
**Retention:** 1 day (blob, build); 30 days (per-shard + merged HTML).
**Notes:** No trace/video/screenshot — relies on `blob` reporter diagnostics only. Canonical Playwright-docs merge pattern.

### Milkdown (Milkdown/milkdown)
**Playwright config** — `e2e/playwright.config.ts` (https://github.com/Milkdown/milkdown/blob/main/e2e/playwright.config.ts):
```ts
use: {
  baseURL: process.env.CI ? 'http://127.0.0.1:4173' : 'http://localhost:5173',
  trace: 'on-first-retry',
},
// workers: 1 on CI, retries: 2 on CI
```
**Workflow** — `.github/workflows/ci.yml`:
```yaml
- uses: actions/upload-artifact@v7
  if: ${{ failure() }}
  with:
    name: test-results-e2e-${{ matrix.shard }}
    path: e2e/test-results/
    retention-days: 7
```
**Matrix:** 5-shard, `fail-fast: false`.
**Gate:** `if: ${{ failure() }}` — failure-only (stricter than Playwright-docs `!cancelled()`).
**Retention:** 7 days.

### Lexical (facebook/lexical)
**Playwright config:** File exists at `packages/lexical-playground/` but not reachable via canonical names in this session. Workflow passes no trace/video/screenshot CLI flags, so config defaults apply.
**Workflow** — `.github/workflows/call-e2e-test.yml`:
```yaml
- uses: actions/upload-artifact@v7
  if: failure()
  with:
    name: Test Results ${{ inputs.os }}-${{ inputs.browser }}-${{ inputs.editor-mode }}-${{ inputs.prod && 'prod' || 'dev' }}-${{ inputs.node-version }}-${{ inputs.override-react-version }}-${{ inputs.flaky && 'flaky' || '' }}
    path: ${{ env.test_results_path }}
    retention-days: 7
```
**Matrix:** 3 OSes × `chromium | firefox | webkit` × `rich-text | plain-text | rich-text-with-collab` × dev/prod × React-version × flaky-vs-stable.
**Gate:** `if: failure()`.
**Retention:** 7 days.
**Notes:** Very large matrix; `continue-on-error` for flaky entries. 7-day retention across the entire matrix.

### Plate (udecode/plate)
**Playwright config** — `tooling/config/playwright.config.ts`:
```ts
use: {
  actionTimeout: 0,
  baseURL: 'http://localhost:3000',
  trace: 'on-first-retry',
},
// workers: process.env.CI ? 1 : undefined
// reporter: 'github' on CI
```
**Workflow artifact config:** No dedicated e2e artifact upload found on `main`.
**Notes:** Minimal — `trace: 'on-first-retry'` matches Playwright-docs default; no video/screenshot overhead.

### Outline (outline/outline)
**Playwright config** — `src/end-to-end/playwright.config.ts` (in-repo):
```ts
use: {
  actionTimeout: 0,
  baseURL: "http://localhost:3000",
  trace: "on-first-retry",
  screenshot: "only-on-failure",
  video: "off",  // comment: "Disable video recording to reduce overhead"
},
```
**Workflow:** `.github/workflows/ci.yml` runs Jest/unit only — NOT Playwright.
**Notes:** Negative case — the largest editor-SaaS OSS project in sample maintains a Playwright config but does not run it in public CI; relies on Jest sharding (4 shards) instead.

### TipTap (ueberdosis/tiptap), Novel (steven-tey/novel), ProseMirror
**Notes:** No public Playwright workflow or config on main branches located via GitHub Contents API or code search. Novel has only `release.yaml`; TipTap public CI does not surface a Playwright suite; ProseMirror repos do not use Playwright.

---

## Cross-project convergence

| Project | trace | video | screenshot | retention-days | if gate |
|---------|-------|-------|------------|----------------|---------|
| BlockNote | (default: off) | (default: off) | (default: off) | 1d blob, 30d final | `!cancelled()` |
| Milkdown | `on-first-retry` | off | off | 7d | `failure()` |
| Lexical | (config unreachable) | (no CLI flag) | (no CLI flag) | 7d | `failure()` |
| Plate | `on-first-retry` | off | off | N/A (no upload) | N/A |
| Outline | `on-first-retry` | **off** (explicit) | `only-on-failure` | N/A (Playwright not in CI) | N/A |

**Convergence:**
- `trace: 'on-first-retry'` where trace is configured (Milkdown, Plate, Outline — 3/3 projects with explicit trace setting)
- `video: 'off'` near-universal; Outline comments rationale: "Disable video recording to reduce overhead"
- 7-day retention dominant when `if: failure()` is used (Milkdown, Lexical)
- BlockNote's 30-day + `!cancelled()` is an outlier driven by merge-step requirements (needs all shards regardless of pass/fail)

## Negative searches

- `microsoft/playwright` and each editor repo's issue tracker — no "our traces got too big" post-mortems located.
- Lexical `playwright.config.{ts,js}` not resolvable via raw GitHub / code search (both returned 404 at expected paths).
- No BlockNote PR/issue discussion located for the deliberate `retention-days: 1` on `playwright-build`.

## Gaps

- Lexical config contents unconfirmed (inferred that defaults apply because workflow passes no CLI flags).
- No public post-mortems from sampled projects on artifact-size incidents — the convergent choices suggest learned behavior but rationale is not written down.
- Why Novel and TipTap skip Playwright entirely (preferred visual-regression? capacity?) is out of scope and undocumented.
