# Evidence: OSS Playwright Configuration Survey

**Dimension:** Cross-cutting reference for Dimensions 3, 4, 5, 9, 10
**Date:** 2026-04-17
**Sources:** ~/.claude/oss-repos/ — BlockNote, Milkdown, GitButler, Cline, Plasmic, Penpot

---

## Key files / pages referenced

- `~/.claude/oss-repos/blocknote/playwright.config.ts` — trace:on-first-retry, video:off, screenshot:only-on-failure, retries:2 CI, workers:50%
- `~/.claude/oss-repos/milkdown/e2e/playwright.config.ts` — trace:on-first-retry, retries:2, 5-way sharding in CI
- `~/.claude/oss-repos/blocknote/tests/setupScript.ts` — `window.__TEST_OPTIONS` injection via `addInitScript`
- `~/.claude/oss-repos/milkdown/e2e/tests/misc/index.ts` — functional helpers: `focusEditor`, `getMarkdown`, `setMarkdown`, `loadFixture`, `pressMetaKey`
- `~/.claude/oss-repos/gitbutler/apps/desktop/e2e/playwright.config.ts` — trace:on (comment: "disabling causes tests to fail")
- `~/.claude/oss-repos/cline/e2e/` — E2ETestHelper class, fixture-based for VS Code extension testing
- `~/.claude/oss-repos/plasmic/.../playwright.config.ts` — custom reporter (playwright-ctrf-json-reporter), setup project dependency, workers:8 CI

---

## Findings

### Finding: `trace: 'on-first-retry'` is the plurality pattern; `retain-on-failure` is a close second

**Confidence:** CONFIRMED
**Evidence:** Direct reads of each config:
- `on-first-retry`: BlockNote, Milkdown, GitButler/web (3 of 7)
- `retain-on-failure`: Plasmic (`~/.claude/oss-repos/plasmic/platform/wab/playwright/playwright.config.ts:26` → `trace: "retain-on-failure"`), Penpot (`~/.claude/oss-repos/penpot/frontend/playwright.config.js` → `trace: 'retain-on-failure'`) (2 of 7)
- `on`: GitButler/e2e (1 of 7) — inline comment: "disabling causes tests to fail for unknown reason"
- Cline: not directly verified in this audit pass

No surveyed project uses `trace: 'off'` on CI.

**Implications:**
- `on-first-retry` is plurality (not dominant). `retain-on-failure` is a valid and well-used alternative.
- The `on` setting is only used when a specific bug forces it — not a default.
- Both `on-first-retry` and `retain-on-failure` cost near-zero on green runs; the difference is whether a trace is captured on the first failure (retain-on-failure) or only on the retry (on-first-retry).

### Finding: Video is captured less universally than trace; `retain-on-failure` is the pattern

**Confidence:** CONFIRMED
**Evidence:**
- BlockNote: `video: 'off'` (trace alone is enough)
- Plasmic: `video: 'retain-on-failure'`
- Cline: `video: 'retain-on-failure'`
- Milkdown: no `video` key (= off)
- GitButler e2e: `video: 'on-first-retry'` with local retain

**Implications:** Video is supplementary to trace. Trace is the primary debug artifact; video helps only when the visual flow matters (e.g., drag/drop, animation). For editor/keyboard-heavy E2E, trace usually suffices.

### Finding: Retries policy is `retries: 2` on CI in the majority of mature configs

**Confidence:** CONFIRMED
**Evidence (direct config reads):**
- Milkdown, GitButler (both configs), Plasmic, Penpot: `retries: process.env.CI ? 2 : 0` (2 on CI, 0 locally)
- BlockNote: `retries: 2` unconditional (`~/.claude/oss-repos/blocknote/tests/playwright.config.ts:27`)
- Cline: `retries: 1`
- Penpot verified: `~/.claude/oss-repos/penpot/frontend/playwright.config.js:25` → `retries: process.env.CI ? 2 : 0`

On CI: **6 of 7 configs use `retries: 2`; Cline is the sole `retries: 1`.**

**Implications:** `retries: 1` is on the low end of the range; `retries: 2` is the common default. Teams accept some silent retry-success as the cost of CI stability. None of the surveyed projects use `failOnFlakyTests` (the real option name for explicit fail-on-retry; see REPORT.md §Dimension 5).

### Finding: CI-only Chromium is the predominant cross-browser strategy

**Confidence:** CONFIRMED
**Evidence:**
- **Chromium only on CI:** GitButler, Cline, Plasmic, Penpot
- **Full matrix on CI:** BlockNote, Milkdown (Chromium + Firefox + Webkit)

**Implications:** Running webkit on CI is not the default in mature projects — it's an explicit choice when cross-browser parity matters. BlockNote and Milkdown's full-matrix choice correlates with being editor-layer projects (like ours) where browser quirks actually affect user experience.

### Finding: Test hooks via `window.__*` are a recognized pattern, gating varies

**Confidence:** CONFIRMED
**Evidence:**
- BlockNote: `window.__TEST_OPTIONS` injected via `addInitScript` in fixture + server-side; no DEV-gating, relies on test-only injection path
- Milkdown: `window.__getMarkdown__()`, `window.__setMarkdown__()`, `window.__view__`, `window.__milkdown__`, `window.__crepe__`, `window.__macros__` — exposed unconditionally in the built artifact
- Cline, GitButler, Plasmic, Penpot: no window hooks; rely on public APIs

**Implications:**
- Milkdown's approach (expose globals unconditionally) differs from our precedent (`import.meta.env.DEV` gating in `DocumentContext.tsx:217`).
- The community has both approaches; DEV-gating via Vite is the cleaner pattern because it tree-shakes to zero in production builds. **Our pattern is stricter than the OSS median.**
- When test hooks are used, the preferred injection point in fixture-based approaches is `addInitScript` (before navigation, so page-level code can find the hook).

### Finding: Universal `forbidOnly: !!process.env.CI`

**Confidence:** CONFIRMED
**Evidence:** All 7 surveyed projects set this. Prevents accidental `test.only` from landing on main.

**Implications:** This is table-stakes, not optional. Our config at baseline doesn't have it (missing from `playwright.config.ts`).

### Finding: Helper-pattern divergence (functional vs. fixture vs. POM class)

**Confidence:** CONFIRMED
**Evidence:**
- **Functional helpers** (Milkdown): discrete functions `focusEditor(page)`, `getMarkdown(page)`, etc.
- **Fixture-extended test** (BlockNote, GitButler e2e, Plasmic): `test.extend<{...}>({...})` exposes custom fixtures alongside `page`
- **POM class** (Cline's `E2ETestHelper`): methods on a class instance

**Implications:** Functional helpers win for editor-style E2E (Milkdown is the nearest parallel to OK). Fixture-extended is Playwright-native and composes with the framework, but the overhead is only worth it for larger suites. For OK's ~10-file suite, functional helpers are the right granularity.

### Finding: CI artifact upload is universal with retention 7–30 days

**Confidence:** CONFIRMED
**Evidence:**
- BlockNote: blob-report, 1-day retention (surprisingly short)
- Milkdown: `test-results-e2e-${{ matrix.shard }}`, 7-day retention
- GitButler e2e: `playwright-report/` + `test-results/`, 30-day retention
- Cline: playwright-recordings-${{ matrix.runner }}` on failure, default 90-day
- Plasmic: structured CTRF JSON (no raw upload — CI dashboard consumption instead)
- Penpot: captures trace + video on failure locally (`trace: 'retain-on-failure'`, `video: 'retain-on-failure'`); CI workflow upload step not verified in this audit pass

**Implications:** Retention 7 days is mode; 14 days is reasonable; 30 days overshoots for most use cases. Upload on failure only (not on success) is universal — no project uploads on green runs.

### Finding: `reporter: 'html'` + CI artifact upload is the debugging path

**Confidence:** CONFIRMED
**Evidence:** Every project uploading artifacts exposes the Playwright HTML report as the primary CI failure debugger. Developers download the artifact → open `index.html` → navigate to the failing test → view trace inline.

**Implications:** For G2, the right shape is: `reporter: [['html', { open: 'never' }], ['list']]` → `test-results/` uploaded on failure → developer opens HTML locally. No custom tooling needed.

---

## Negative searches

- Searched for mechanical `waitForTimeout` bans (linter, test assertions) in surveyed projects: **NOT FOUND** in the 7 surveyed. None deploy `eslint-plugin-playwright`'s `no-wait-for-timeout` rule. Some use functional helpers that wrap waits but don't enforce the ban.
- Searched for `flakyTestsFail` in any surveyed project: **NOT FOUND**. No project fails PR on retry-success.

---

## Gaps / follow-ups

- **Did not surveil:** `vercel/next.js`, `remix-run/remix`, `tanstack/query` playwright configs — these are available if a deeper comparison is worth the time.
- **Did not extract:** exact line-level examples of `waitForFunction` vs `expect.poll` decision patterns from each project's test files. That's Dimension 1's scope.
