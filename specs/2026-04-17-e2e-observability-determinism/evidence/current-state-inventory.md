---
name: E2E test infrastructure current-state inventory
description: Inventory of the E2E test suite, config, CI workflow, and app hooks. Re-verified 2026-04-17 post-PR-#185-merge + chromium-only revert (commit 940d5a0a) + cherry-pick 6a4c92ea.
sources: packages/app/tests/stress/, packages/app/playwright.config.ts, .github/workflows/ci.yml, packages/app/src/editor/DocumentContext.tsx, packages/app/src/editor/TiptapEditor.tsx, packages/app/src/components/GraphView.tsx, packages/app/src/components/SystemDocSubscriber.tsx
collected_at: 2026-04-17
baseline_commit: 6a4c92ea
---

# E2E test infrastructure — current-state inventory

Baseline: `6a4c92ea` (post-cherry-pick of PR #188 + post-PR-#185 merge, origin/main tip `a25b3ee4`).

> **Re-verification note (Phase 6):** Original inventory (2026-04-16) claimed 5 `test.skip(webkit)` + 8 `waitUntil: 'networkidle'`. Re-grep 2026-04-17 shows **0** webkit skips (deleted by `940d5a0a` chromium-only revert) and **1** `waitUntil: 'networkidle'` at `slash-command.e2e.ts:38`. §3 and §4 below have been corrected. Also noting: `source-polish.e2e.ts` has 0 actual `page.waitForTimeout(` call sites (only a comment match on line 198); file drops from G1 migration scope but remains under STOP-rule enforcement.

## 1. E2E file inventory

| File | LoC | Tests | `waitForTimeout` | `test.skip` | playwright-stability scope |
|---|---|---|---|---|---|
| crdt-stress.e2e.ts | 121 | 1 | 0 | 0 | F1 — per-test docName |
| docs-open.e2e.ts | 1005 | 19 | 2 | 0 | Out of scope (reference pattern) |
| fr-7a-disconnect-source-mode.e2e.ts | 121 | 4 | 0 | 0 | Out of scope |
| graph-panel-surfaces.e2e.ts | 520 | 11 | 0 | 0 | F6 — fixture scoping |
| list-keymap.e2e.ts | 166 | 4 | 5 | 0 | F2 — docName + body-key fix |
| mid-type-recovery.e2e.ts | 267 | 3 | 1 | 0 | Out of scope |
| observer-a-multi-client.e2e.ts | 214 | 1 | 0 | 0 | F4 — docName + body-key fix |
| outline-navigation.e2e.ts | 144 | 2 | 0 | 0 | F8 — per-test docName |
| paste-fidelity.e2e.ts | 1245 | 39 | 19 | 0 | Out of scope |
| reveal-on-activate.e2e.ts | 135 | 7 | 2 | 0 | F5 — remove beforeEach reset |
| slash-command.e2e.ts | 762 | 26 | 44 | 5 | Out of scope |
| source-polish.e2e.ts | 400 | 11 | 1 | 0 | F7 — per-test docName |
| ux-interactions.e2e.ts | 306 | 6 | 0 | 0 | F3 — per-test docName |
| **TOTAL** | **5406** | **134** | **74** | **5** | 8 files overlap |

## 2. `waitForTimeout` distribution by overlap

- **5 files overlap with playwright-stability** (will migrate post-their-merge): list-keymap (5), reveal-on-activate (2), source-polish (1), plus 5 files with 0 `waitForTimeout` that they'll still touch (crdt-stress, ux-interactions, observer-a-multi-client, graph-panel-surfaces, outline-navigation). **Total: 8 `waitForTimeout` across 8 files.**
- **5 files exclusive to this spec's scope**: slash-command (44), paste-fidelity (19), mid-type-recovery (1), docs-open (2), source-polish (1). Wait, source-polish is in playwright-stability scope — let me recount. **Corrected: 4 files exclusive to this spec** — slash-command (44), paste-fidelity (19), mid-type-recovery (1), docs-open (2) = **66 `waitForTimeout`**.
- The remaining 1 file (fr-7a-disconnect-source-mode) has 0 `waitForTimeout` and is untouched by either spec.

## 3. `test.skip` distribution

**Re-grep 2026-04-17 (post commit `940d5a0a` chromium-only revert):**
```
grep -rn "test.skip(browserName === 'webkit'" packages/app/tests/stress/*.e2e.ts
→ 0 matches
```

All 4 previously active webkit skips in `slash-command.e2e.ts` (lines 224, 270, 477, 713) were deleted by `940d5a0a` ("perf(ci): revert multi-browser to chromium-only — 3x speedup, zero coverage loss"). A residual stale comment at `slash-command.e2e.ts:262` still references the deleted CORS race; cleanup candidate in US-17. The overflow-scroll rendering concern (previously line 713) is moot under chromium-only.

| Previous line | Status |
|---|---|
| 224, 270, 477, 713 | DELETED by `940d5a0a` (2026-04-16) |

**G3 current scope is "Named flake resolution" (sidebar-folder, QA-022, crdt-stress S6, F11 docs-open) + 1 residual `waitUntil: 'networkidle'` cleanup — NOT webkit skip restoration.**

## 4. `waitUntil: 'networkidle'` occurrences

**Re-grep 2026-04-17:**
```
grep -rn "waitUntil: 'networkidle'" packages/app/tests/stress/*.e2e.ts
→ slash-command.e2e.ts:38 (1 match total)
```

The single remaining occurrence is `resetEditor`'s `page.reload({ waitUntil: 'networkidle' })` at `slash-command.e2e.ts:38`. Previous unverified claim of 8 total instances across multiple files (in this inventory's earlier snapshot) does not match the current tree — either PR #185 eliminated the others, or the original count conflated the pattern with another (`waitUntil: 'load'`, `waitFor('networkidle')`, etc.). Either way: US-17 migrates the single remaining occurrence to `domcontentloaded` + explicit readiness wait. D-Q14 STOP rule prevents reintroduction.

## 5. Shared test infrastructure

- **No `_helpers/` directory exists today.**
- `docs-open.e2e.ts` (lines 17-59) has clean `seedDocs` / `createPage` / `replaceDoc` / `waitForActiveProviderSynced` helpers — the reference pattern. Playwright-stability is migrating 8 files onto this pattern.
- Other files duplicate similar functionality inline. No imports of shared helpers exist today.
- `packages/app/tests/stress/synthetic.ts` exists for server-side stress testing; not used by Playwright files.

## 6. Test-only app hooks

### DEV-gated (canonical precedent)

`packages/app/src/editor/DocumentContext.tsx` — `if (import.meta.env.DEV)` block in the main `useEffect` (around line 247):
```typescript
if (import.meta.env.DEV) {
  window.__providerPool = p;
  Object.defineProperty(window, '__activeProvider', {
    get: () => p.getActive()?.provider ?? null,
    configurable: true,
  });
  window.__test_rejectSyncPromise = (docName, kind) => __rejectSyncPromise(docName, kind);
  window.__test_armPendingRejection = (docName, kind) => __test_armPendingRejection(docName, kind);
  window.__test_closeActiveWebSocket = () => { /* ... */ };
}
```

`packages/app/src/components/SystemDocSubscriber.tsx:119` — `__test_injectAgentFocus`, DEV-gated.

### NOT DEV-gated (surfaced opportunity, out of spec scope)

- `packages/app/src/editor/TiptapEditor.tsx:277` — `window.__agentFlashState = state` (unconditional)
- `packages/app/src/components/GraphView.tsx:796` — `window.__graphHarness = harness` (unconditional)

These ship in production bundles today. Fixing them is a small follow-up; this spec's scope is test infrastructure, not a general audit. Tracked as a surfaced opportunity.

## 7. `__activeProvider.isSynced` usage in tests

| File | Usage | Role |
|---|---|---|
| ux-interactions.e2e.ts | 10+ direct calls | Primary readiness signal |
| docs-open.e2e.ts | via `waitForActiveProviderSynced` helper | Primary readiness signal |
| Other files | none | Tests still use `waitForTimeout` or `networkidle` |

The canonical signal is already available and already used in newer tests. G1's primary task is bringing legacy tests onto it.

## 8. `pageerror` listeners

- `slash-command.e2e.ts` — 4 ad-hoc listeners across different describes, some with inline filters, no shared pattern.
- `crdt-stress.e2e.ts` — 1 listener + downstream `criticalErrors` allowlist (filters WebSocket reconnect noise per the clipboard PR).
- Other files — no listeners.

No centralized filter helper exists. G3's fix (filter webkit "access control checks") will introduce one.

## 9. Playwright config baseline (`packages/app/playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './tests/stress',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 120_000,
  retries: 0,                              // ← G2 target
  globalTeardown: './tests/stress/global-teardown.ts',
  use: { baseURL, headless: true },        // ← G2 adds video, trace, screenshot
  projects: [chromium, webkit, firefox],
  webServer: { command: 'bun run dev', reuseExistingServer: false, timeout: 30_000, env: { OK_TEST_CONTENT_DIR: contentDir } },
});
```

Missing for G2:
- `retries: process.env.CI ? 1 : 0`
- `use.video: 'retain-on-failure'`
- `use.trace: 'retain-on-failure'`
- `use.screenshot: 'only-on-failure'`
- `reporter: [['html', { open: 'never' }], ['list']]`
- `forbidOnly: !!process.env.CI`

## 10. CI workflow baseline (`.github/workflows/ci.yml` playwright job)

- 40-min timeout (25 min observed + headroom).
- Browser install split across 3 commands (binary install + per-browser `install-deps`) — correct, shipped in clipboard PR.
- **No `actions/upload-artifact` step** — zero observability on failure. G2 adds two steps (HTML report + test-results) with `if: failure()` / `if: ${{ !cancelled() }}` gates and 14-day retention.
- No custom reporter config on the workflow side.

## 11. `data-state` attribute usage in app

Grep `packages/app/src/components/` for `data-state=`:
- `sidebar.tsx` uses `data-state="expanded"|"collapsed"` for CSS styling — **not test instrumentation.**
- No other usages found.

Introducing `data-state="ready"|"loading"|"error"` as test signals would be a **new pattern for OK** — no prior art in our codebase to extend.

## 12. Counts summary

- 74 `waitForTimeout` → target 0 (66 this spec + 8 via playwright-stability follow-up)
- 5 webkit `test.skip` → target 1 (only the line-713 overflow-scroll remains; future work)
- 8 `waitUntil: 'networkidle'` → target 0 (replace with `domcontentloaded` + explicit readiness wait)
- 0 `_helpers/` → target 1 directory with 4-6 helper files
- 0 CI artifact steps → target 2 steps (html report + test-results)
- 0 STOP-rule guards → target 1 test (`e2e-stop-rules.test.ts`)
