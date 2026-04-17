# Playwright E2E Stability — Per-Test Document Isolation

**Status:** Approved
**Baseline commit:** `fa0050a4`
**Branch:** `worktree-playwright-stability`

---

## §1 Problem Statement

**Situation:** The Playwright E2E test suite (`packages/app/tests/stress/*.e2e.ts`) contains 82+ tests across 12 files. Under Playwright's default parallel worker execution, ~11 tests flake — different test fails each run, with a ~57% CI failure rate on the `playwright` check.

**Complication:** 5 of 7 test files that write content use a hardcoded global `test-doc` document name. `POST /api/test-reset` defaults to `test-doc` when `?docName=` is absent. `POST /api/agent-write-md` defaults to `test-doc` when `docName` is absent from the body. With Playwright's default parallel workers (4+ on CI), concurrent tests mutate the same CRDT doc — resets, writes, and sidebar navigations interfere across workers.

**Resolution:** Migrate all affected test files to per-test unique document names using the pattern already established in `docs-open.e2e.ts` (which passes reliably). Fix two `mode` vs `position` body key bugs. Remove one unnecessary `beforeEach` reset.

---

## §2 Root Causes (verified via source-code inspection)

### RC1: Shared `test-doc` global state

**Files affected:** `crdt-stress.e2e.ts`, `list-keymap.e2e.ts`, `ux-interactions.e2e.ts`, `observer-a-multi-client.e2e.ts`, `reveal-on-activate.e2e.ts`

**Server behavior (verified):**
- `api-extension.ts:1676` — `test-reset` handler: `resolveAlias(url.searchParams.get('docName') ?? 'test-doc')`
- `api-extension.ts:1084-1086` — `agent-write-md` handler: defaults to `'test-doc'` when `docName` absent from body

**Playwright config (verified):** `playwright.config.ts` has NO `workers` setting, NO `fullyParallel` setting. Default: parallel with `workers = # CPU cores`.

### RC2: `mode` vs `position` body key bug

- `observer-a-multi-client.e2e.ts:119` — sends `{ mode: 'replace' }`, server reads `body.position` → silently falls back to `append`
- `list-keymap.e2e.ts:41` — same bug: `{ mode: 'replace' }` instead of `{ position: 'replace' }`

### RC3: Graph fixture contention

`graph-panel-surfaces.e2e.ts` uses `seedGraphFixtures()` which creates fixed doc names (`alpha`, `beta`, `gamma`, `zeta`). Parallel graph test invocations race on the same fixture content. Additionally, `seedGraphFixtures()` calls `test-reset` without `?docName=`, resetting `test-doc` and interfering with other parallel tests.

### RC4: Unnecessary `beforeEach` reset

`reveal-on-activate.e2e.ts` calls `POST /api/test-reset` (no `?docName=`) in `beforeEach`. The tests in this file don't write to `test-doc` — they only need `nested-doc.md` (pre-seeded by `playwright.config.ts`). The reset creates cross-test interference without providing test-level isolation.

---

## §3 In Scope

| ID | What | Fix |
|---|---|---|
| F1 | `crdt-stress.e2e.ts` — per-test docName isolation | Generate unique docName, use `?docName=` in `test-reset`, pass `docName` in `agent-write-md` body, navigate via hash |
| F2 | `list-keymap.e2e.ts` — per-test docName + fix `mode→position` | Same isolation pattern + change `mode: 'replace'` to `position: 'replace'` in `seedMarkdown` |
| F3 | `ux-interactions.e2e.ts` — per-test docName | Same isolation pattern for all tests in this file |
| F4 | `observer-a-multi-client.e2e.ts` — per-test docName + fix `mode→position` | Same isolation + fix body key |
| F5 | `reveal-on-activate.e2e.ts` — remove unnecessary `beforeEach` reset | Delete the `test-reset` call from `beforeEach`. Tests that need a doc create their own per-test doc; tests that only read pre-seeded fixtures (`test-doc.md`, `nested-doc.md`) work without any reset. Read-only sidebar references to pre-seeded fixtures are acceptable — the issue was the WRITE-path `test-reset` call interfering with parallel tests. |
| F6 | `graph-panel-surfaces.e2e.ts` — per-test fixture scoping | `seedGraphFixtures()` should use per-test unique doc names (e.g., `alpha-{uuid}`) and pass them through to all helpers. Remove the `test-reset` call from `seedGraphFixtures()`. |
| F7 | `source-polish.e2e.ts` — per-test docName isolation | Same isolation pattern. Added under greenfield directive ("no deferred tech debt") after initial 6-file migration — same bug pattern, same fix. |
| F8 | `outline-navigation.e2e.ts` — per-test docName isolation | Same isolation pattern. Seeds via `createPage` + `replaceDoc` with per-test docName; page-headings poll uses per-test docName. |

## §4 Out of Scope

- New test coverage or new test files
- Changes to server API (`test-reset`, `agent-write-md`)
- Changes to application code (React components, providers, etc.)
- Changes to `docs-open.e2e.ts` (already correct)
- Changes to `fr-7a-disconnect-source-mode.e2e.ts` (not in flake map)

## §5 Reference Pattern

`docs-open.e2e.ts` demonstrates the correct pattern:

```typescript
async function createPage(path: string) {
  const res = await fetch(`${BASE}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (res.status === 409) return;
  if (!res.ok) throw new Error(`create-page failed: ${res.status}`);
}

async function replaceDoc(docName: string, markdown: string) {
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, markdown, position: 'replace' }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
}

async function seedDocs(docs: Array<{ name: string; markdown: string }>) {
  // NOTE: this unscoped test-reset is acceptable ONLY in docs-open.e2e.ts
  // because every test creates unique doc names — the reset clears any
  // leftover state but doesn't interfere with parallel tests since no
  // other test writes to these unique names. Do NOT copy this pattern
  // into tests that use hardcoded doc names.
  await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  for (const d of docs) await createPage(`${d.name}.md`);
  for (const d of docs) await replaceDoc(d.name, d.markdown);
}
```

Each test calls `seedDocs` with unique doc names. Navigation uses `openFromSidebar` (sidebar-scoped locator) or direct hash URL.

## §6 Acceptance Criteria

- [ ] AC1: `bunx playwright test --workers=4` passes 3 consecutive runs locally with 0 failures
- [ ] AC2: `bun run check` (root gate) passes
- [ ] AC3: No test file uses hardcoded `'test-doc'` as a doc name for write operations
- [ ] AC4: Every `agent-write-md` call uses `position:` (not `mode:`) for the write mode
- [ ] AC5: No test calls `POST /api/test-reset` without a `?docName=` parameter (except `docs-open.e2e.ts` which seeds unique docs per test via its own `seedDocs` pattern)
- [ ] AC6: `reveal-on-activate.e2e.ts` has no `beforeEach` that calls `test-reset`

## §7 Non-Goals

- Fixing the bridge-convergence fuzz failure (seed 1776386718697) — separate root cause (PR #172 pipeline changes), separate fix scope
- Adding Playwright retries in CI config — masks root cause rather than fixing it
- Setting `workers: 1` — trades parallelism for correctness (wrong tradeoff)
