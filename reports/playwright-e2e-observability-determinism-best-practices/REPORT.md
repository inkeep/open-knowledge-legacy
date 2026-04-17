---
title: "Playwright E2E Observability + Determinism Best Practices"
description: "Factual survey of Playwright community conventions for condition-based waits, failure observability (retries/video/trace/screenshot), WebKit headless quirks, cross-browser skip-vs-filter-vs-fix decisions, and helper organization, plus five deep-dive follow-ups on CRDT readiness signals (Yjs/Hocuspocus/Logseq/tldraw), React 19 Suspense + useTransition testing, debounce/animation/composed-event wait patterns, editor E2E test design (BlockNote/Milkdown/Lexical/Tiptap), and trace artifact size + GitHub Actions storage economics. Source material for the 2026-04-17-e2e-observability-determinism spec."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - Playwright
  - GitHub Actions
  - WebKit
  - eslint-plugin-playwright
  - Vite
  - React 19
  - Radix UI
  - Yjs
  - Hocuspocus
  - BlockNote
  - Milkdown
  - Lexical
  - Logseq
  - tldraw
topics:
  - E2E test observability
  - condition-based waits
  - cross-browser parity
  - CI artifact management
  - test harness organization
  - CRDT readiness signals
  - React 19 concurrency
  - debounce testing
  - animation testing
  - editor E2E patterns
---

# Playwright E2E Observability + Determinism — Best Practices

**Purpose:** Provide an evidence-backed factual baseline for the Playwright community's conventions on (a) replacing hardcoded timing waits with condition-based waits, (b) making CI failures debuggable via retries + trace + video + screenshot + artifact upload, (c) handling WebKit headless localhost CORS quirks, and (d) organizing shared helpers — for consumption by the `2026-04-17-e2e-observability-determinism` spec.

**Stance:** Factual. This report does not prescribe "what Open Knowledge should do" — it documents what the community has converged on and what the tradeoffs look like. The spec consumes these findings and makes project-specific decisions.

---

## Executive Summary

The Playwright community has converged on a small set of patterns across all four dimensions this spec needs. The convergence is strong enough that deviating requires justification, not adoption. Key findings:

**Condition waits:** `page.waitForTimeout()` is a named anti-pattern with a first-party lint rule against it ([`no-wait-for-timeout`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md)). The community's replacement order is: (1) **web-first assertions** (`expect(locator).toBeVisible()`, etc.) → (2) `locator.waitFor({ state })` → (3) `expect.poll()` for non-DOM polling → (4) `page.waitForFunction()` for custom page-context JS conditions → (5) `page.waitForURL` / `waitForResponse` for navigation+network events. Web-first assertions are the default; the others are escape hatches.

**Failure observability:** The convergent CI config across 7 mature OSS projects is `retries: 2` (on CI — 6 of 7 projects; Cline alone uses 1), plus trace capture (plurality `on-first-retry`, 2 projects `retain-on-failure`, 1 `on`), `screenshot: 'only-on-failure'`, and `video: 'retain-on-failure'` (when used) — plus GitHub Actions `actions/upload-artifact@v7` (current stable; v4 is the minimum viable version) for both `playwright-report/` (always) and `test-results/` (on failure), with 7-14 day retention. Playwright's own best-practices doc names the [trace viewer](https://playwright.dev/docs/trace-viewer) as the canonical CI debug surface.

**WebKit headless CORS quirks:** WebKit headless has documented behavior differences from headful and from Chromium/Firefox around localhost CORS ([#32429](https://github.com/microsoft/playwright/issues/32429), [#4031](https://github.com/microsoft/playwright/issues/4031), [#12975](https://github.com/microsoft/playwright/issues/12975), [#27903](https://github.com/microsoft/playwright/issues/27903)). The `page.reload({ waitUntil: 'networkidle' })` + in-flight rejected fetch interaction is a specific failure mode. Playwright officially **discourages `networkidle`** — the option is marked DISCOURAGED in the Page API docs with the guidance "Don't use this method for testing, rely on web assertions to assess readiness instead." The community surgical fixes are (a) switch `waitUntil` to `'domcontentloaded'` + explicit app-ready signal, (b) filter the benign "access control checks" error in `pageerror` listeners, or (c) both (defense in depth).

**Cross-browser parity:** The decision hierarchy is **fix > filter > skip**. `test.skip` is intentional non-applicability (capability missing); `test.fixme` is "broken but fix pending" (transitional, should not linger); `test.fail` is expected failure. Using `test.skip` for "race condition we haven't fixed yet" is semantically wrong per Playwright's annotation contract — `test.fixme` is more honest, but eliminating the annotation entirely (via fix or filter) is the goal.

**Helper organization:** Three dominant patterns: functional helpers (~5-20 files), `test.extend` fixtures (~15-40 files), POM class (~40+). Below ~20 files, **functional helpers win** (Milkdown pattern, BlockNote partially). Co-locate in `tests/stress/_helpers/` or similar leading-underscore dir. Promote to fixtures later without throwing away the functions.

**Enforcement:** [`eslint-plugin-playwright`](https://www.npmjs.com/package/eslint-plugin-playwright) includes `no-wait-for-timeout`, `no-useless-await`, `missing-playwright-await`, and related rules. [Biome shipped native Playwright rules](https://github.com/biomejs/biome/pull/8960) via PR #8960 (merged 2026-02-16) — `noPlaywrightWaitForTimeout` is available today as a nursery rule. For projects using Biome primarily, three viable paths exist: (1) enable Biome's nursery `noPlaywrightWaitForTimeout` directly, (2) add `eslint-plugin-playwright` for a broader ruleset, (3) a hand-rolled grep-based guard test (repo-local pattern already in use for other STOP rules). No surveyed project deploys mechanical bans today — all rely on code-review discipline + the community norm.

**Key Findings:**
- **`waitForTimeout` is anti-pattern**, enforced by a first-party lint rule; 5 replacement primitives with a clear decision tree.
- **`networkidle` is officially DISCOURAGED** in Playwright docs — `'domcontentloaded'` + web-first assertion is the replacement.
- **WebKit headless has documented CORS/localhost quirks** — surgical fixes are `waitUntil` change + pageerror filter, not skip.
- **Convergent CI config exists** — `retries: 2` / `trace` as `on-first-retry` or `retain-on-failure` / video + screenshot on failure / artifact upload with 7-14 day retention.
- **Functional helpers win for small-to-medium suites** (~5-20 files); fixtures win at ~15-40; POM class at 40+.

**Deep-dive follow-ups (2026-04-17 fanout) — at-a-glance:**
- **A. CRDT readiness signals (9-project survey):** no community convention exists for Yjs/Hocuspocus editors; Logseq ships a hidden production DOM element (`<div.hidden data-testid="rtc-tx">{:local-tx N :remote-tx M}</div>`) whose text content carries counter-based convergence state — the strongest pattern surveyed. Hocuspocus exposes `provider.on('synced')` / `provider.synced` / `hasUnsyncedChanges`, but the convention is underused in tests.
- **B. React 19 Suspense + `useTransition` + Playwright:** no named pattern exists as of April 2026 — the community consensus is "assert on post-state DOM; trust Playwright's auto-wait." `isPending` is only testable when mirrored to a DOM attribute (`aria-busy` is the MDN-aligned convention); `<Activity mode="hidden">` uses `display: none` and is already discriminated by Playwright's default visibility semantics.
- **C. Debounce / animation / composed-event waits:** no native "debounce-idle" or "animation-done" primitive exists. Community patterns: Playwright's [Clock API](https://playwright.dev/docs/api/class-clock) (v1.45+) for deterministic debounce, `element.getAnimations().finished` (WAAPI) for animation completion, `aria-activedescendant` and `aria-busy` as ARIA-native terminal observables, and Radix UI's `data-state="open"|"closed"` as the dominant React headless-library convention.
- **D. Editor E2E test design (BlockNote, Milkdown, Lexical, Tiptap):** convergence on `focusEditor → page.keyboard.type(str) → assert` with editor state exposed on `window` for assertion. Functional helpers + feature-grouped organization (no POM). Slash-menu pattern: `waitForSelector(menuClass)` + ~100ms focus-handoff buffer + filter + `Enter`/click. BlockNote uses 76 `waitForTimeout` calls in end-to-end specs; Milkdown 26; neither has an enforcement rule.
- **E. Trace artifact size management:** trace size is 1-50 MB per test typical, multi-GB for file-upload suites ([#20157](https://github.com/microsoft/playwright/issues/20157)); video is ~7.5 MB/min on Chromium (hardcoded VP8 at 1 Mbit/s, [#31424](https://github.com/microsoft/playwright/issues/31424)). GitHub Actions free-plan storage is 500 MB pooled with Packages, billed at $0.25/GB-month over quota. Editor-heavy OSS converges on `trace: 'on-first-retry'` + `video: 'off'` + `retention-days: 7` + `if: failure()`; BlockNote is the outlier (30d + `!cancelled()` for merge-report workflow).

**Targeted follow-up (2026-04-17 update) — `page.clock` × Y.js/Hocuspocus compatibility:**
- **`page.clock.install()`** overrides `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`, `performance`, `Event.timeStamp` — but NOT `queueMicrotask`, `MessageChannel.postMessage`, WebSocket timers, or `fetch` response timing.
- **Y.js (yjs@13.6.30) uses `performance.now` 13 times** (awareness-meta timestamps + internal instrumentation) and `setTimeout` 2 times (deferred-work patterns). All overridden.
- **Hocuspocus provider uses `setInterval` 3 times** (awareness heartbeat, connection checker, forceSync — our config's 5000ms) and `setTimeout` 1 time (reconnect-after-close delay). All overridden under `page.clock`.
- **WebSocket messages flow in real time** regardless of `page.clock` — initial sync protocol, Yjs `update` events, and Hocuspocus message delivery are not affected.
- **Verdict:** `page.clock` is **compatible with Y.js/Hocuspocus for UI-debounce testing** when installed AFTER `provider.synced === true` (so connection-layer timers have stabilized). It is **incompatible** with connection-lifecycle tests (disconnect/reconnect, forceSync behavior, awareness outdated detection) — those require real timer progression. No Yjs/Hocuspocus community usage of `page.clock` was found in search; our spec would be pioneering the combination.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|---|---|---|---|
| 1 | Condition-based waits — primitives + decision criteria | P0 | Deep | ✅ |
| 2 | Test hooks vs. DOM signals — boundary | P0 | Deep | ✅ |
| 3 | Video / trace / screenshot config | P0 | Deep | ✅ |
| 4 | CI artifact upload patterns | P0 | Moderate | ✅ |
| 5 | Retries on CI — semantics + flake tolerance | P0 | Moderate | ✅ |
| 6 | WebKit headless localhost CORS + lifecycle quirks | P0 | Deep | ✅ |
| 7 | `page.reload` / `page.goto` `waitUntil` semantics | P0 | Moderate | ✅ |
| 8 | Enforcing `waitForTimeout` bans mechanically | P1 | Moderate | ✅ |
| 9 | Shared helper extraction patterns | P1 | Moderate | ✅ |
| 10 | Cross-browser parity — skip vs. filter vs. fix | P0 | Moderate | ✅ |

---

## Detailed Findings

### Dimension 1 — Condition-based waits: primitives + decision criteria

**Finding:** Playwright ships 5 primary wait primitives plus implicit auto-wait on locator actions. The community decision tree is: **web-first assertion → locator.waitFor → expect.poll → waitForFunction → (navigation/network)**. `page.waitForTimeout` is the anti-pattern and is never correct in CI test code.

**Evidence:** [evidence/condition-wait-primitives.md](evidence/condition-wait-primitives.md)

**Decision matrix:**

| If the condition is… | Use |
|---|---|
| A locator's value, state, or count (matches a built-in assertion) | **Web-first assertion**: `expect(locator).toBeVisible()`, `toHaveText`, `toHaveCount`, `toHaveAttribute`, etc. |
| A locator's state (no assertion — you just want to wait) | **`locator.waitFor({ state })`** with `'visible'`, `'hidden'`, `'attached'`, `'detached'` |
| A scalar / object from `page.evaluate` that mutates | **`expect.poll(() => page.evaluate(...))`** with a `.toBe()` / `.toEqual()` check |
| A custom page-context JS condition with truthy semantics | **`page.waitForFunction(fn)`** |
| A navigation target URL | **`page.waitForURL(pattern)`** |
| A specific network request or response | **`page.waitForRequest` / `waitForResponse`** |
| "Just sleep N ms" | **Never** in CI. `page.waitForTimeout` is [explicitly banned](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md). |

**Implications:**
- For a suite with 55 `waitForTimeout` calls, the replacement work is per-call: identify the real condition, pick the matching primitive.
- Many "wait 300ms after typing" calls collapse to `expect(locator).toBeVisible()` once the right locator is identified.
- For editor-specific readiness (CRDT synced, debounce settled, internal state transitioned), `waitForFunction` against a test-hook or data-attribute is appropriate.

**Decision triggers (when this matters):**
- Any `waitForTimeout` in a CI-run test is a flake waiting to happen — fix unconditionally.
- If a replacement needs a new signal (data-attribute, test hook), that's the prompt to introduce one.

**Remaining uncertainty:**
- For some UI states (e.g., "the CodeMirror source view has re-parsed after a paste"), the right signal may not exist yet — exposing one is a design decision that the spec will make.

---

### Dimension 2 — Test hooks vs. DOM signals

**Finding:** Both patterns are valid; the boundary is **DOM-reachability**. DOM signal (ARIA role, data-attribute, text content) when the state is user-observable; test hook (`window.__test_*`, DEV-gated) when the state is app-internal and exposing it as DOM would be incidental. `import.meta.env.DEV` is the Vite-native gating pattern — statically replaced at build-time, tree-shaken from production.

**Evidence:** [evidence/test-hooks-patterns.md](evidence/test-hooks-patterns.md), [evidence/oss-config-survey.md](evidence/oss-config-survey.md)

**Boundary rule:**
- **Prefer DOM signal when** the condition is user-observable, a role/text/label/data-attribute captures it, or a web-first assertion matches the shape.
- **Prefer test hook when** the condition is app-internal (CRDT state, provider flag, debounce-settled), no DOM signal naturally captures it, and DOM-enriching the UI would be incidental complexity.

**Examples (from OSS survey):**
- Milkdown exposes `window.__getMarkdown__()`, `window.__view__`, etc. — unconditional (ships in prod builds). Works but not strict.
- BlockNote uses `context.addInitScript(...)` via Playwright fixture — zero production footprint, but limited to page-context setup.
- Open Knowledge's existing precedent (DocumentContext.tsx:217) is **`if (import.meta.env.DEV) { window.__activeProvider = ...; }`** — statically replaced + tree-shaken. This is the tightest pattern; more restrictive than Milkdown's, simpler than BlockNote's fixture.

**Implications:**
- Projects using Vite should prefer the `import.meta.env.DEV` gate. It's the one pattern that provides strict production-bundle cleanliness AND in-app state access.
- Before adding a new hook, ask: could a `data-*` attribute expose the same state without hooks?

**Decision triggers (when this matters):**
- Introducing a new hook is a precedent-setting choice; once one hook exists, more will follow. Establish the gating discipline early.
- If a hook surface grows past ~5-10 properties, consider consolidating behind a single `window.__ok_test = { ... }` object to reduce namespace pollution.

---

### Dimension 3 — Video / trace / screenshot configuration

**Finding:** The plurality community config is `trace: 'on-first-retry'` with `retain-on-failure` as a valid alternative (OSS split in the 7-project survey: 3 `on-first-retry`, 2 `retain-on-failure`, 1 `on`), plus `screenshot: 'only-on-failure'` and `video: 'retain-on-failure'` (when used). Playwright officially names the **trace viewer as the canonical CI debug tool** — trace is primary, video and screenshot are supplementary. The `on-first-retry` / `retain-on-failure` variants have near-zero cost on green runs.

**Evidence:** [evidence/playwright-official-docs.md](evidence/playwright-official-docs.md), [evidence/ci-artifact-patterns.md](evidence/ci-artifact-patterns.md), [evidence/oss-config-survey.md](evidence/oss-config-survey.md)

**From [Playwright Best Practices](https://playwright.dev/docs/best-practices):**
> "For CI failures, use the Playwright trace viewer instead of videos and screenshots. The trace viewer gives you a full trace of your tests as a local Progressive Web App (PWA) that can easily be shared."

**Config shape (community convergence):**
```typescript
use: {
  trace: 'on-first-retry',        // or 'retain-on-failure' — both valid
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',     // optional; add if visual flow matters (editor/animation)
},
```

**Trade-offs:**

| Option | Cost | When right |
|---|---|---|
| `trace: 'on-first-retry'` | Only on retries. Zero cost on first-pass green. | Retries-enabled suites. Most common. |
| `trace: 'retain-on-failure'` | On all failing tests, even without retry. | When you want to capture the first failure, not wait for retry. |
| `trace: 'on'` | Always. High cost. | Only when debugging a stubborn intermittent — rare. |
| `video: 'retain-on-failure'` | Video recording during test, kept only on failure. ~2-5 MB per failing test. | Editor/animation/drag-drop. Supplementary. |
| `screenshot: 'only-on-failure'` | Cheap. Only on failure. | Always on. |

**Implications:**
- The cost model is binary: green runs pay near-zero; failures pay the full capture cost. Budget is straightforward.
- For CI with 2-5 failing tests per failing run, artifact size stays under ~150 MB — well within GHA limits.

**Decision triggers (when this matters):**
- If CI runs are consistently green for weeks, `trace: 'on-first-retry'` gives you nothing (no trace captured) — you'd want `on-all-retries` or `retain-on-failure` to capture at the first sign of trouble.
- If CI runs fail frequently, `on-first-retry` saves storage on flakes but misses the first failure's trace.

---

### Dimension 4 — CI artifact upload patterns

**Finding:** The canonical pattern is two `actions/upload-artifact@v7` steps in the workflow — one for `playwright-report/` (always), one for `test-results/` (on failure), with 7-14 day retention. `@v7` is current stable (2026-02-26 release); `@v4` is minimum viable. Separate from CI runtime config, needs matching paths between Playwright's `outputDir` and the GitHub Actions `path:`.

**Evidence:** [evidence/ci-artifact-patterns.md](evidence/ci-artifact-patterns.md)

**Canonical workflow pattern:**

```yaml
- name: Upload Playwright HTML report
  if: ${{ !cancelled() }}
  uses: actions/upload-artifact@v7
  with:
    name: playwright-report
    path: packages/app/playwright-report/
    retention-days: 14

- name: Upload Playwright test-results (traces, videos, screenshots)
  if: failure()
  uses: actions/upload-artifact@v7
  with:
    name: test-results
    path: packages/app/test-results/
    retention-days: 14
```

**Playwright reporter config:**
```typescript
reporter: [
  ['html', { open: 'never' }],   // open: 'never' prevents auto-open in CI
  ['list'],                       // show progress in stdout
]
```

**Gotchas:**
- Path mismatch: if `playwright test` runs inside a subfolder (e.g., via turbo from `packages/app`), the artifact path must be prefixed accordingly. See [issue #24319](https://github.com/microsoft/playwright/issues/24319).
- `if: failure()` vs `if: ${{ !cancelled() }}`: the former uploads only when a job fails; the latter uploads even on cancellation but not on success. Use `!cancelled()` for the HTML report (so developers can inspect green runs when they want to); use `failure()` for `test-results/` (zero-cost on green).

**Developer workflow on failure:**
1. CI fails → open the GH Actions run page → download `test-results` artifact → extract
2. `bunx playwright show-trace trace.zip` → trace viewer opens as PWA in browser
3. Navigate timeline, inspect network / console / DOM at each action

**Implications:**
- No special tooling needed on dev machines beyond Playwright itself.
- The HTML report + trace combo is self-contained — no CI dashboard dependency.

---

### Dimension 5 — Retries on CI: semantics + flake tolerance

**Finding:** `retries: 2` on CI is the dominant convention — 6 of 7 surveyed OSS projects (BlockNote, Milkdown, GitButler both configs, Plasmic, Penpot); Cline alone uses `retries: 1`. Playwright's report distinguishes `flaky` (passed on retry) from `passed`/`failed` without requiring `failOnFlakyTests`. Teams treat `flaky` as a soft signal to investigate, not a hard failure.

**Evidence:** [evidence/playwright-official-docs.md](evidence/playwright-official-docs.md), [evidence/oss-config-survey.md](evidence/oss-config-survey.md)

**Community ranges (CI values):**
- **`retries: 1`** — Cline. Conservative; one retry is enough for most transient issues.
- **`retries: 2`** — Milkdown, GitButler (both), Plasmic, Penpot (all via `process.env.CI ? 2 : 0`); BlockNote (unconditional `retries: 2`). Dominant default; allows 2 retries for CI scheduler noise + browser cold starts.
- **`retries: 3+`** — Rare; signals a systemic stability problem.

**Trade-offs:**
- `retries: 1` forces tighter stability discipline but requires cleaner test hygiene.
- `retries: 2` allows CI to ride through ~95% of runner-level noise without wasting developer time on manual reruns.
- Higher retries mask real bugs — at some threshold, "flaky" becomes "broken but hidden."

**`failOnFlakyTests` (Playwright setting, added v1.52):**
- Off by default. When on, any test that passed only after retry fails the run.
- CLI flag: `--fail-on-flaky-tests`.
- Zero of the 7 surveyed projects use it — community treats retry-success as acceptable.
- [Playwright issue #34397](https://github.com/microsoft/playwright/issues/34397) tracks the feature; documented surface is `defineConfig({ failOnFlakyTests: !!process.env.CI })`.

**Implications:**
- Retries are a PR-time convenience, not a quality gate. Use them; track the `flaky` count in the HTML report to catch systemic stability degradation.
- Teams wanting stricter flake-detection can opt into `failOnFlakyTests: true` on CI without changing `retries`.

---

### Dimension 6 — WebKit headless localhost CORS + lifecycle quirks

**Finding:** WebKit headless has **documented, multi-issue-tracked behavior differences** from headful and from Chromium/Firefox around localhost + CORS. The specific failure mode relevant here — `page.reload({ waitUntil: 'networkidle' })` racing with a fetch that WebKit rejects as "access control checks" — is not a Playwright bug and is not fixable in the engine. The surgical fixes are in the test code.

**Evidence:** [evidence/webkit-headless-cors.md](evidence/webkit-headless-cors.md), [evidence/networkidle-discouraged.md](evidence/networkidle-discouraged.md)

**The mechanism:**
1. `networkidle` waits for 500ms of no network activity.
2. A CORS-rejected fetch in WebKit is emitted as a `pageerror` event AND may leave an in-flight request that the `networkidle` counter doesn't cleanly terminate.
3. The test's `pageerror` listener catches the error, throws, and the reload is abandoned mid-flight ("Test ended").

**Tracked upstream (WebKit-specific):**
- [#32429](https://github.com/microsoft/playwright/issues/32429) — WebKit headless tests fail; workarounds discussed. Primary citation.
- [#12975](https://github.com/microsoft/playwright/issues/12975) — WebKit forces HTTPS on localhost.
- [#20124](https://github.com/microsoft/playwright/issues/20124) — How to resolve CORS issues specifically on WebKit browser.
- [#8279](https://github.com/microsoft/playwright/issues/8279) — WebKit headless behavior not working as expected.

**Cross-browser context (related but not WebKit-specific):**
- [#27903](https://github.com/microsoft/playwright/issues/27903) — Chromium origin header differs headful/headless (Chromium-specific).

**Surgical fixes (what the community actually does):**

| Fix | Notes | Verdict |
|---|---|---|
| **Switch `waitUntil: 'networkidle'` → `'domcontentloaded'`** + explicit readiness wait | Removes the race at its source. Aligns with Playwright's own [discouragement of `networkidle`](https://playwright.dev/docs/api/class-page). | **Recommended.** |
| **Filter the `'access control checks'` error in `pageerror` listeners** | Same pattern as existing WebSocket reconnect filters. Known-benign error filtered specifically. | **Recommended as defense in depth.** |
| **Both (A + B)** | Root cause fix + safety net for any residual occurrence. | **Best outcome.** |
| `bypassCSP: true` context option | Broad hammer; disables CSP globally. | Discouraged — overly broad. |
| `ignoreHTTPSErrors: true` | For cert issues, not CORS. | Irrelevant to this failure. |
| `--disable-web-security` arg | Chromium-only flag; WebKit's launcher does not accept arbitrary Chromium args. | Not applicable to WebKit. |
| `setExtraHTTPHeaders` for Origin | Behavior differs per browser; relevant open issues are Chromium-centric, not WebKit. | Inconclusive for WebKit; do not rely. |

**Implications:**
- Our `resetEditor` with `waitUntil: 'networkidle'` IS the problem. Playwright docs mark `networkidle` DISCOURAGED; this is one of the specific failure modes they're warning against.
- The recommended fix direction is unambiguous: switch `waitUntil` + filter the pageerror + introduce an app-ready signal (existing `window.__activeProvider` already provides `synced` state).

---

### Dimension 7 — `page.reload` / `page.goto` `waitUntil` semantics

**Finding:** `'networkidle'` is **officially discouraged** by Playwright. The recommended pattern is `'domcontentloaded'` plus an explicit web-first assertion or `waitForFunction` for the specific readiness condition.

**Evidence:** [evidence/networkidle-discouraged.md](evidence/networkidle-discouraged.md)

**Direct quote from [Playwright Page API docs](https://playwright.dev/docs/api/class-page):**
> `'networkidle'` — **DISCOURAGED** — "consider operation to be finished when there are no network connections for at least 500 ms. Don't use this method for testing, rely on web assertions to assess readiness instead."

**Taxonomy:**

| Option | Meaning | When right |
|---|---|---|
| `'commit'` | Response received, document started loading. | Intercepting responses (rare). |
| `'domcontentloaded'` | DOMContentLoaded fired; body parsed. | **Recommended for tests.** Follow with explicit readiness wait. |
| `'load'` | Load event fired; all resources loaded. | Default for `page.goto`. Fine for simple navigations. |
| `'networkidle'` | No network connections for ≥500ms. | **DISCOURAGED.** |

**Canonical replacement:**
```typescript
// Old (discouraged):
await page.reload({ waitUntil: 'networkidle' });

// New (recommended):
await page.reload({ waitUntil: 'domcontentloaded' });
await expect(page.getByRole('button', { name: 'test-doc.md' })).toBeVisible();
// Or for non-DOM readiness:
await page.waitForFunction(() => window.__activeProvider?.synced === true);
```

**Implications:**
- `networkidle` is a trap — it appears to "wait for the app to settle" but its semantics are browser-dependent and fetch-rejection-sensitive.
- Every `page.goto` or `page.reload` that uses `networkidle` should be migrated.

---

### Dimension 8 — Enforcing `waitForTimeout` bans mechanically

**Finding:** Three viable enforcement paths exist today. [`eslint-plugin-playwright`](https://github.com/playwright-community/eslint-plugin-playwright) includes a first-party `no-wait-for-timeout` rule. [Biome shipped native Playwright rules](https://github.com/biomejs/biome/pull/8960) via PR #8960 (merged 2026-02-16; includes `noPlaywrightWaitForTimeout` as a nursery rule). Hand-rolled grep tests are a valid minimal alternative with repo-precedent.

**Evidence:** [evidence/enforcement-mechanisms.md](evidence/enforcement-mechanisms.md)

**Options analysis:**

| Option | Pros | Cons |
|---|---|---|
| Enable Biome's `noPlaywrightWaitForTimeout` (nursery rule) | Native to Biome; zero new deps if Biome is already the linter; ships today | Nursery rules are experimental — severity defaults are conservative and may change across Biome versions |
| Add `eslint-plugin-playwright` | First-class rule with extensive Playwright ruleset (no-wait-for-timeout + ~10 others); stable and widely deployed | Adds ESLint dep alongside Biome; two linters to maintain |
| Hand-rolled grep test (`waitforTimeout-ban.test.ts`) | Minimal code; matches repo precedent for STOP rules (e.g. `wysiwyg-stop-rule.test.ts`); no new dep | Less expressive than a real linter; doesn't catch related patterns |

**Rule behavior (from [no-wait-for-timeout doc](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md)):** The rule "Disallow[s] usage of `page.waitForTimeout`." The rule doc shows incorrect code (`await page.waitForTimeout(5000)`) alongside correct alternatives as code examples: `page.waitForLoadState()`, `page.waitForURL('/home')`, `page.waitForFunction(() => ...)`. The "anti-pattern" framing is community-standard across guides (BrowserStack, Playwright best-practices) but not in the rule doc itself.

**Other rules in `eslint-plugin-playwright` worth enabling for a Playwright project:**
- `missing-playwright-await` — catches missing `await` on Playwright actions
- `no-useless-await` — flags `await` on non-promise values
- `no-page-pause` — flags `page.pause()` left in code
- `no-element-handle` — discourages ElementHandle in favor of Locator

**Implications:**
- All three paths are viable today; the decision depends on the linter stack already in place and the appetite for nursery-grade rules.
- A hand-rolled grep test is still attractive for projects that want zero config overhead and an immediate STOP-rule precedent alignment.

---

### Dimension 9 — Shared helper extraction patterns

**Finding:** Three patterns. **Functional helpers** for small-to-medium suites (~5-20 files); **`test.extend` fixtures** for mid-size (~15-40 files); **POM class** for large (~40+ files). The size thresholds are heuristic ranges — the overlap reflects that the decision is about per-test setup/teardown, not raw file count: fixtures win when there's teardown to manage; functions win when the helper is pure.

**Evidence:** [evidence/helpers-organization.md](evidence/helpers-organization.md), [evidence/oss-config-survey.md](evidence/oss-config-survey.md)

**Pattern matrix:**

| Pattern | Shape | Fits | OSS examples |
|---|---|---|---|
| Functional helpers | `await focusEditor(page)` | Pure functions; no per-test setup | Milkdown |
| `test.extend` fixtures | `const test = base.extend<{ editor: Editor }>({ editor: async ({ page }, use) => {...} })` | Per-test setup/teardown; fixture lifecycle | BlockNote, GitButler, Plasmic |
| POM class | `class Editor { constructor(page); async focus(); async getMarkdown(); }` | Stateful workflows; multi-page flows | Cline |

**Canonical `_helpers/` layout:**
```
tests/stress/
├── _helpers/
│   ├── slash-menu.ts       — waitForSlashMenuOpen, waitForSlashMenuFiltered, ...
│   ├── editor-state.ts     — waitForEditorReady, waitForEditorEmpty
│   ├── provider.ts         — waitForProviderSynced, waitForProviderConnected
│   └── error-filters.ts    — filterBenignWebkitErrors, filterWebSocketReconnect
├── slash-command.e2e.ts
└── ...
```

**Implications:**
- Leading-underscore dirs are community convention for co-located non-test files; Playwright's `testMatch: /.*\.e2e\.ts$/` naturally excludes them.
- For a 10-20-file suite, functional helpers are the right container. Functions compose into fixtures later without throwing them away.

---

### Dimension 10 — Cross-browser parity: skip vs. filter vs. fix

**Finding:** The decision hierarchy is **fix > filter > skip**. Each annotation in Playwright's taxonomy has a specific semantic: `test.skip` is "not applicable," `test.fixme` is "broken but fix coming," `test.fail` is "expected failure." Using `test.skip` for "we haven't fixed this yet" is semantically wrong — `test.fixme` is the honest alternative — but the goal is to eliminate the annotation entirely.

**Evidence:** [evidence/skip-vs-filter-vs-fix-patterns.md](evidence/skip-vs-filter-vs-fix-patterns.md)

**Decision hierarchy (in order of preference):**

1. **Fix the root cause** — when the incompatibility is in test logic / our code, not the browser engine.
2. **Filter the error** — when the browser engine emits a known-benign error that the test's handlers catch unnecessarily. Document the filter.
3. **`test.fixme`** — when a fix is pending (transitional state; should not linger beyond 2 sprints).
4. **`test.skip`** — when the browser genuinely lacks the capability. Last resort.

**Annotation semantics (from [Playwright Test Annotations](https://playwright.dev/docs/test-annotations)):**

| Annotation | Semantic | Reporting | Correct for |
|---|---|---|---|
| `test.skip(cond, reason)` | Not applicable in this config | Skipped (with `reason` annotation) | Capability genuinely missing on this browser/platform |
| `test.fixme(cond, reason)` | Broken but fix coming | Skipped with `fixme` annotation metadata (reporter surfaces the label; underlying bucket is "skipped") | Known-broken tests with a fix in progress |
| `test.fail(cond)` | Expected to fail | Expected-failure — passes when the test actually fails, fails when it passes | Documented bugs we accept |

> Reporter-specific note: the HTML reporter shows `fixme` as a distinct annotation label, but Playwright's API-level status bucket for both `skip` and `fixme` is "skipped" with annotation metadata. Custom reporters may render these differently.

**Implications:**
- A project using `test.skip(webkit, 'networkidle race')` is miscategorizing — the capability IS on webkit; the test just has a race. Either fix the race or use `test.fixme`.
- Eliminating the annotation entirely (fix or filter) is the goal. The spec's G3 is this.

---

## Deep-dive follow-ups (2026-04-17 fanout)

Five follow-up investigations commissioned after the initial 10-dimension report. Each investigates an area adjacent to the parent rubric where the initial pass had breadth but not depth. Findings are factual — documenting what the community does, not what any specific project should do.

### A — CRDT readiness signals for collaborative editors

**Finding:** Across nine surveyed collaborative-editor projects — Tiptap, Hocuspocus, y-prosemirror, y-tiptap, BlockNote, Outline, tldraw, HedgeDoc, AFFiNE, and Logseq — **there is no common convention** for signaling CRDT readiness to E2E tests. What exists is a spectrum from "rely on implicit retry" (HedgeDoc's 15s Cypress `defaultCommandTimeout`, Tiptap core's `.wait(100)`) to "ship hidden production DOM elements carrying CRDT transaction counters" (Logseq). DOM-element existence (`waitForSelector('.ProseMirror')`) is the universal minimum but is insufficient — an attached editor root does not guarantee the provider has synced or that the PM schema has been applied.

**Evidence:** [evidence/crdt-readiness-signals.md](evidence/crdt-readiness-signals.md)

**Signal catalog (ranked by robustness):**

| Pattern | Shape | Project |
|---|---|---|
| Hidden production DOM element with test-id carrying counter state | `<div.hidden data-testid="rtc-tx">{:local-tx N :remote-tx M}</div>` | **Logseq** — `src/main/frontend/components/rtc/indicator.cljs:176` |
| Provider event listener | `provider.on('synced', handler)` | Hocuspocus `HocuspocusProvider.ts:194` |
| Provider property polling | `provider.synced === true` | Hocuspocus `HocuspocusProvider.ts:145` |
| Provider constructor callback | `new HocuspocusProvider({ onSynced() { ... } })` | Hocuspocus `onSynced.ts:9-13` |
| App-layer composite sync state | `isLocalSynced && isRemoteSynced` | Outline `MultiplayerEditor.tsx:159-167, 256-260` |
| Tiptap extension-layer callback | `new Collaboration({ onFirstRender() { ... } })` | Tiptap `extension-collaboration/src/collaboration.ts:71, 216` |
| Per-mutation signal (post-mutation quiescence) | `provider.on('unsyncedChanges', ...)` + poll `hasUnsyncedChanges === false` | Hocuspocus `hasUnsyncedChanges.ts:25-39, 72-86` |
| Named editor-load fixture | `await waitForEditorLoad(page)` | AFFiNE test kit |
| `window.__provider` / `window.__hocuspocus` globals | — | **NOT FOUND** in any surveyed test file |
| `data-synced` DOM attribute | — | **NOT FOUND** (Logseq's `data-testid="rtc-tx"` is counter-carrying, not boolean) |

**The Logseq pattern is the standout.** Source (production code): `[:div.hidden {"data-testid" "rtc-tx"} (pr-str {:local-tx local-tx :remote-tx remote-tx})]`. Consumer (test code): reads `textContent`, parses EDN. Because it carries structured counters rather than a boolean flag, tests can poll until `local-tx == remote-tx && > baseline` — a strictly richer signal than `synced=true`, usable for cross-peer convergence and per-mutation quiescence alike. It is not DEV-gated; it ships in production DOM for all users (cost: ~30 bytes of hidden DOM).

**The `provider.synced` vs `onFirstRender` distinction is load-bearing.** `provider.synced` flips when the client has received `SyncStep2` from the server — guarantees CRDT state is current but does NOT guarantee the ProseMirror schema has been applied. Tiptap's `onFirstRender` callback fires after y-prosemirror finishes CRDT → PM materialization — a tighter bound for "editor is ready for keystroke input." Neither is exposed to tests by default.

**y-prosemirror's own test suite documents a mandatory post-dispatch wait:**

```js
/**
 * Dispatch a transaction to a ProseMirror view and wait a tick so that any
 * deferred sync-plugin follow-up work (e.g. adjustments scheduled via
 * `setTimeout(..., 0)`) has a chance to run before the test proceeds.
 */
const safeDispatch = async (view, tr) => {
  view.dispatch(tr)
  await promise.wait(1)
}
```

At least one macrotask tick must elapse after any ProseMirror transaction before y-prosemirror's CRDT state reflects the change. This is documented only in the test file, not in y-prosemirror's README or sync-plugin source.

**Implications:**
- Cross-peer E2E testing is rare across the surveyed ecosystem. Only Logseq has production-grade primitives for it — `with-wait-tx-updated` macro polls counter equality after a mutation, plus a separate `button.cloud.on.idle` DOM gate.
- BlockNote, tldraw, HedgeDoc, and AFFiNE have no cross-peer E2E tests in the surveyed test files — collaborative convergence is either tested at unit-level (y-prosemirror, Hocuspocus in-process) or not tested at all.
- tldraw's `apps/examples/e2e/shared-e2e.ts:44-52` exposes a `window.editor` global for tests to call the editor's public API directly, sidestepping DOM-event simulation for setup/teardown. This does not address per-edit quiescence (`sleep(2000)` with "historically flaky without the sleep" appears twice in `test-rich-text-toolbar.spec.ts`).

**Decision triggers:**
- Single-sync-layer apps (WebSocket only, no IndexedDB) → provider event/property suffices.
- Multi-sync-layer apps (IndexedDB + WebSocket; dual-CRDT) → composite state (like Outline) or counter-based (like Logseq) is required.
- Counter-based signals enable per-mutation convergence assertions; boolean `synced` only supports initial-load assertions.

**Remaining uncertainty:**
- AFFiNE's `waitForEditorLoad` implementation was not fetched — the fixture's internals (DOM-only vs provider-aware vs composite) remain unknown.
- AFFiNE uses y-octo (Rust Yjs port); the JS-side sync exposure was not traced to source.

---

### B — React 19 concurrency primitives + Playwright

**Finding:** The React 19 concurrency + Playwright testing space has **no named pattern** as of April 2026. React stable 19 shipped late 2024; React 19.2 (Activity) shipped 2025-10-01. Neither the Playwright community nor the React team has published a canonical guide. The community has converged on a composition: **assert on the post-state DOM with web-first assertions and trust Playwright's auto-wait** — because React's concurrency primitives ultimately resolve into observable DOM changes. The absence of a named pattern is itself the most important finding.

**Evidence:** [evidence/react19-suspense-patterns.md](evidence/react19-suspense-patterns.md)

**What each primitive exposes externally:**

| Primitive | External surface | How tests wait |
|---|---|---|
| `startTransition(fn)` | Returns `undefined` — no completion signal, no event, no DevTools hook | Wait on a post-transition DOM selector unique to the new state |
| `useTransition` `isPending` | Component-internal boolean | Only testable when mirrored to DOM (`aria-busy={isPending}` is MDN-aligned) |
| `<Suspense fallback={...}>` | Fallback is plain DOM | Two patterns: `expect(post-suspend-locator).toBeVisible()` or `expect(fallback-locator).toBeHidden()` |
| `use(promise)` | Resolves into real DOM via normal render pipeline | Wait on the DOM consequence; error propagates to nearest ErrorBoundary |
| `<Activity mode="hidden">` | Uses `display: none` on children | Playwright's default visibility semantics already discriminate it |

**The `role="status"` + `aria-busy` ARIA convention gives Suspense fallbacks a deterministic locator** — per [MDN role="status"](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role), elements with `role="status"` have implicit `aria-live="polite"` and `aria-atomic="true"`. But the [React Suspense reference](https://react.dev/reference/react/Suspense) contains no guidance on ARIA roles for fallbacks — this is an MDN/community convention, not a React prescription.

**Canonical Playwright wait patterns:**

```ts
// Wait for post-transition state
await page.getByRole('link', { name: 'Next doc' }).click();
await expect(page.getByRole('heading', { name: 'Next doc' })).toBeVisible();

// Wait for fallback to disappear
await expect(page.getByRole('status')).toBeHidden();

// Wait for isPending mirror (when app binds aria-busy={isPending})
await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

// Error boundary recovery
await page.getByRole('button', { name: /try again/i }).click();
await expect(page.getByRole('alert')).toBeHidden();
```

**`<Activity>` + Playwright visibility.** Per the [React 19.2 release notes](https://react.dev/blog/2025/10/01/react-19-2): "Hidden mode uses `display: none`. DOM preservation: child DOM elements remain in the DOM but are hidden. State preservation: React state and internal component state are saved. Effect cleanup: all Effects are cleaned up." Per Playwright's [actionability docs](https://playwright.dev/docs/actionability): "Elements of zero size or with `display:none` are not considered visible." The two collapse cleanly — `getByRole`'s default `includeHidden: false` excludes hidden-Activity mounts from role queries automatically. Where this falls short: multiple Activity mounts sharing the same accessible name (duplicate editors with `aria-label="Document body"`) can still trigger strict-mode locator violations; a project-level `data-active` attribute on the wrapper is the community fallback.

**Open feature requests blocking first-class support:**
- [microsoft/playwright#15660](https://github.com/microsoft/playwright/issues/15660) — `waitForTransition` feature request (2022; scoped to CSS transitions, unlanded).
- [microsoft/playwright#36233](https://github.com/microsoft/playwright/issues/36233) — `getByRole({ busy: false })` filter (P3-collecting-feedback).

**Anti-patterns specifically for React 19 + Playwright:**
- **`waitForLoadState('networkidle')` is flaky for subscription-backed apps** — [microsoft/playwright#19835](https://github.com/microsoft/playwright/issues/19835). WebSockets, SSE, analytics beacons, or health checks keep connections active; apps feeding `use(promise)` from persistent streams never reach network-idle. Wait on DOM consequences, not network state.
- **React 19 changed parallel Suspense siblings to serial waterfalls.** Per [TkDodo — React 19 and Suspense: A Drama in 3 Acts](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts): "In React 19, sibling components no longer render in parallel when one suspends. The team reasoned that continuing to render siblings of a suspended component 'will block showing the fallback' and wastes computational resources since those render results get discarded anyway." Tests that previously observed parallel-resolving panels now see serial resolution.
- **WebKit + Next.js App Router navigation quirks** — [microsoft/playwright#26091](https://github.com/microsoft/playwright/issues/26091). A `useTransition`-driven form submit under WebKit may fail to navigate.
- **RTL-to-Playwright migration surfaces false failures.** The [RTL React 19 Suspense bug #1375](https://github.com/testing-library/react-testing-library/issues/1375) keeps components stuck on fallbacks in JSDOM + `act()` scheduling. Playwright's real-browser scheduling does not exhibit it; RTL failures after React 19 upgrade may resolve cleanly when lifted to Playwright.

**Implications:**
- Error boundary retry ordering is load-bearing: `react-error-boundary`'s `onReset` callback fires *before* the boundary clears its internal error state. If the app uses a module-level promise cache for `use(promise)`, `onReset` must invalidate the cached rejected promise — otherwise the next render re-reads the same rejected promise and re-throws. A Playwright test that asserts recovery after clicking "Try again" indirectly validates this cache invalidation.
- "Wait for transition to both start AND complete" is not a documented pattern. Tests that want to verify a transition actually happened (not merely that the end state matches) must author their own instrumentation.

**Remaining uncertainty:**
- Testing Activity prerender ("data loaded before navigation") — no primary source describes how to verify prerender actually warmed a subtree.
- React DevTools hook (`window.__REACT_DEVTOOLS_GLOBAL_HOOK__`) as a Playwright signal — theoretically possible, no community usage located.

---

### C — Debounce, animation, and composed-event wait patterns

**Finding:** Playwright exposes no native "debounce-idle" or "animation-done" primitive. The community has converged on compositions of Playwright's web-first auto-retry semantics with the browser's own state surfaces (DOM attributes, Web Animations API, ARIA attributes) and — as of v1.45 — a fake-clock primitive for deterministic time advance.

**Evidence:** [evidence/debounce-animation-patterns.md](evidence/debounce-animation-patterns.md)

#### Debounce-settled waits

Three community-established patterns:

```ts
// Pattern A — auto-retry on terminal DOM effect (default)
await searchInput.fill('hello');
await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
// toHaveCount polls through the debounce; default 5s timeout absorbs debounce windows

// Pattern B — expect.poll for non-DOM state
await expect.poll(async () => {
  return await page.evaluate(() => window.__searchStore.resultsReady);
}, { timeout: 10_000 }).toBe(true);

// Pattern C — Clock API (v1.45+) for deterministic time advance
await page.clock.install();
await page.goto('/search');
await searchInput.fill('hello');
await page.clock.runFor(300);                              // advance past 300ms debounce
await expect(listbox).toBeVisible();
```

The [Clock docs](https://playwright.dev/docs/api/class-clock) enumerate the mocked primitives: `Date`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `requestAnimationFrame`, `cancelAnimationFrame`, `requestIdleCallback`, `cancelIdleCallback`, `performance`. `install()` must run before navigation. [TestDouble's RTL benchmark](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs) reports "10-100× improvement" in test speed from fake timers on debounced inputs — the same arithmetic applies to Playwright's Clock API. Known hazard: `_.debounce` uses recursive `setTimeout`, so unbounded `runAllTimers()` can infinite-loop ([lodash#2893](https://github.com/lodash/lodash/issues/2893)); use bounded `runFor(N)` with N = debounce delay.

#### Animation-completion waits

Playwright's built-in [`stable` actionability check](https://playwright.dev/docs/actionability) auto-waits for layout-affecting animations ("maintained the same bounding box for at least two consecutive animation frames") but does not cover visual-only animations (opacity, color, filter) — [microsoft/playwright#4055](https://github.com/microsoft/playwright/issues/4055), open since 2020, P3.

```ts
// Pattern A — WAAPI .finished (most general; covers CSS transitions, CSS animations, WAAPI calls)
await menu.evaluate(el =>
  Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished))
);
// Gotcha: returns empty array if no animation running; sequence AFTER animation has started

// Pattern B — transitionend with fallback
await page.$eval('.modal', el => new Promise(resolve => {
  el.addEventListener('transitionend', resolve, { once: true });
  setTimeout(resolve, 2000); // fallback — transitionend doesn't fire if start === end
}));

// Pattern C — toHaveCSS on terminal value (most Playwright-native when terminal is predictable)
await expect(modal).toHaveCSS('opacity', '1');
await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

// Pattern D — toHaveScreenshot animation:disabled (screenshot-scoped only)
await expect(page).toHaveScreenshot('login.png', { animations: 'disabled' });
// Per page-assertions docs: "finite animations are fast-forwarded to completion;
// infinite animations are canceled to initial state"
```

#### Composed-event settling

The community pattern is "assert the terminal observable only." For menu-style cascades (slash menu, combobox, autocomplete), the W3C ARIA Authoring Practices-mandated `aria-activedescendant` attribute is the deterministic terminal observable — it settles AFTER the full open + filter + reposition + highlight cascade.

```ts
// Slash menu / combobox
await input.pressSequentially('/h1');
await expect(combobox).toHaveAttribute('aria-activedescendant', 'option-heading-1');

// Region that updates multiple things
await expect(region).toHaveAttribute('aria-busy', 'false');

// Genuine compound state (use only when no single attribute captures the AND)
await expect.poll(async () => {
  const [open, active, count] = await Promise.all([
    menu.getAttribute('data-state'),
    combobox.getAttribute('aria-activedescendant'),
    options.count(),
  ]);
  return { open, active, count };
}).toEqual({ open: 'open', active: 'option-h1', count: 3 });
```

#### Data-attribute state machines

[Radix UI's `data-state`](https://www.radix-ui.com/primitives/docs/guides/animation) is the dominant React headless-library convention — applied to every stateful part (Root, Trigger, Content, Header) with values like `"open"|"closed"`, `"checked"|"unchecked"|"indeterminate"`. It is **not a cross-library "ready/loading/error" state-machine standard** — each library defines its own per-component vocabulary. Timing subtlety: Radix's `data-state` is the *lead indicator* (flips when the state machine transitions, before the animation plays); pair with `getAnimations().finished` for "opened AND animation done."

Cross-library comparison:

| Library | Disclosure attribute | State machine attribute |
|---|---|---|
| Radix Primitives | `data-state="open"\|"closed"` | Same, plus `"checked"\|"unchecked"\|"indeterminate"` |
| Headless UI (Tailwind Labs) | `data-headlessui-state="open"`, `data-open`, `data-closed` | Per-component |
| React-Aria | `aria-expanded`, `data-focused`, `data-hovered`, `data-pressed` | No global convention |
| Ariakit (Reakit) | `aria-expanded` + `aria-activedescendant` | Follows ARIA APG |

**The only portable "subtree settled" signal across libraries is the W3C's `aria-busy`.** `toHaveAttribute('aria-busy', 'false')` works today; [microsoft/playwright#36233](https://github.com/microsoft/playwright/issues/36233) tracks a first-class `getByRole({ busy: false })` filter.

#### Animation disabling in tests

| Test purpose | Mechanism | Scope | App cooperation |
|---|---|---|---|
| Visual regression / screenshots | `toHaveScreenshot({ animations: 'disabled' })` | Per-screenshot | None — Playwright fast-forwards finite / cancels infinite |
| Per-test or per-config | `page.emulateMedia({ reducedMotion: 'reduce' })` or `use: { reducedMotion: 'reduce' }` | Per-context | Requires app CSS to honor `@media (prefers-reduced-motion: reduce)` |
| Framer Motion opt-out | `<MotionConfig reducedMotion="always">` at root; `MotionGlobalConfig.skipAnimations = true` (community-reported, less documented) | Library-specific | Requires each component to call `useReducedMotion()` unless global |
| Nuclear | Build-flag stub: `const Motion = process.env.NEXT_PUBLIC_E2E_TESTING ? 'div' : motion.div` | App-wide | Breaks production parity |

The community-accepted split: **disable animations for visual regression tests; keep animations enabled and wait per-animation for correctness tests** — because animation behavior (focus during transition, pointer events during fade, scroll lock escape, animated-modal keyboard trap) is part of the contract being tested.

**Implications:**
- For teams shipping their own components, Radix's naming is the lowest-friction convention — documented, widely recognized in the React ecosystem, and the CSS-selector pattern doubles as animation driver and test surface.
- For assertions that should generalize across third-party libraries in the same app, `aria-*` attributes are the only stable contract.
- [Testrig's case study](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/) documents 60%+ overall reduction from stacking animation-disable with screenshot / video cost controls.

**Remaining uncertainty:**
- `@react-spring/web` test mode — no official "skip" or "instant settle" API surfaced.
- Framer Motion `MotionGlobalConfig.skipAnimations` — community-reported; not in the Motion docs pages reached. `<MotionConfig reducedMotion="always">` is the documented alternative.

---

### D — Editor E2E test design patterns (code-first catalog)

**Finding:** Across BlockNote (20 E2E specs), Milkdown (40+ specs), Lexical (48+ specs), and Tiptap (2 Cypress legacy specs), the shape of an editor E2E test converges on a shared template: `focusEditor → page.keyboard.type(str) → assert`. Editor state is universally exposed on `window` for test access. Helpers are functional + feature-grouped; no surveyed project uses Page Object Model classes or `test.extend` fixtures wrapping editor operations.

**Evidence:** [evidence/editor-e2e-patterns.md](evidence/editor-e2e-patterns.md)

**The editor E2E template (synthesized from all four projects):**

```ts
// Shared helpers (either flat utils/ or misc/index.ts)
export async function focusEditor(page: Page);                         // entry point
export async function getMarkdown(page: Page): Promise<string>;        // OR getDoc() returning JSON
export async function pressMetaKey(page: Page): Promise<() => Promise<void>>;  // OR use ControlOrMeta
export async function openSlashMenu(page: Page);                       // press '/' + waitForSelector
export async function executeSlashCommand(page: Page, cmd: string);    // open + wait + type + Enter
export async function waitNextFrame(page: Page);                       // rAF × 2 — deterministic paint wait

// Test body template
test.beforeEach(async ({page}) => await page.goto(BASE_URL));
test('feature X', async ({page}) => {
  await focusEditor(page);
  await page.keyboard.type('setup text');                              // no delay on multi-char
  await page.keyboard.press('Enter', { delay: 10 });                   // delay on race-sensitive single-key
  await executeSlashCommand(page, 'h1');
  await page.keyboard.type('target content');

  // Assert — stack as many layers as invariants require
  await expect(page.locator('h1')).toHaveText('target content');
  expect(await getMarkdown(page)).toBe('# target content\n');
});
```

**Typing API choice.** `page.keyboard.type()` for multi-character input in 100% of observed cases. `keyboard.press(Key, { delay })` for race-sensitive single keys (Enter/Tab/Arrow — BlockNote uses `TYPE_DELAY = 10`). No surveyed editor uses `locator.fill()` or `pressSequentially()` for editor text input.

**Editor state exposed on `window`.** Every project exposes a test-only API:

| Project | Global API | Source |
|---|---|---|
| BlockNote | `window.ProseMirror.getJSON()` | `tests/src/utils/editor.ts:27-28` |
| Milkdown | `window.__getMarkdown__()`, `window.__setMarkdown__(md)`, `window.commands.addTable?.()` | `e2e/tests/misc/index.ts:12, 19` |
| Lexical | `window.lexicalEditor = document.querySelector('[data-lexical-editor="true"]').__lexicalEditor` | `utils/index.mjs` (`exposeLexicalEditor`) |

DOM alone is insufficient for editor-state assertions — round-trip markdown equality or JSON-snapshot assertion against the editor's own public API is the standard.

**Slash-menu / suggestion-extension pattern** (two-tier wait):

```ts
// blocknote/tests/src/utils/slashmenu.ts:4-15
export async function openSlashMenu(page: Page) {
  await page.keyboard.press("/");
  await page.waitForSelector(SLASH_MENU_SELECTOR);       // event-based — menu appeared
}

export async function executeSlashCommand(page: Page, command: string) {
  await openSlashMenu(page);
  await page.waitForTimeout(100);                        // focus-handoff buffer
  await page.keyboard.type(command);                     // filter
  await page.keyboard.press("Enter");                    // select first match
  await page.waitForTimeout(500);                        // command-execute insurance
}
```

Selector conventions: BlockNote uses feature-class selectors (`.bn-suggestion-menu`, `.bn-grid-suggestion-menu`) + `data-test="..."` for named buttons. Lexical uses semantic class selectors (`.typeahead-popover`, `.typeahead-popover .icon.h1`). Neither uses text-based selectors (`getByText("Heading 1")`) — avoids i18n brittleness. Mentions and slash-menu are isomorphic; a single `openSuggestionMenu(page, triggerChar)` helper serves both.

**Helper organization — three valid shapes in the wild:**

| Shape | Project | File count | When it fits |
|---|---|---|---|
| One file per UI surface, flat `utils/` | BlockNote | 10 | Medium suite (~20 specs), multiple surfaces |
| Single `misc/index.ts` module | Milkdown | 1 (6 exports) | Small surface, < 10 shared helpers |
| Split `utils/` + `keyboardShortcuts/` | Lexical | 2+ dirs, ~60 exports | Large suite (48+ specs), domain-shaped divisions |

All three use named function exports taking `page: Page` as first argument. Each test file uses `test.beforeEach(async ({page}) => await page.goto(URL))` for per-test isolation.

**Cross-platform shortcut strategies — three coexist:**

```ts
// Strategy 1 — Playwright's ControlOrMeta token (minimal ceremony — BlockNote)
await page.keyboard.press("ControlOrMeta+Alt+1");

// Strategy 2 — Runtime process.platform check returning release callback (Milkdown)
export async function pressMetaKey(page: Page) {
  const isMac = process.platform === 'darwin'
  const key = isMac ? 'Meta' : 'Control'
  await page.keyboard.down(key)
  return () => page.keyboard.up(key)
}

// Strategy 3 — Browser-side navigator.platform detection (Lexical — required for
// genuinely divergent keys like Cmd+Arrow vs Home)
export async function moveToLineBeginning(page) {
  if (IS_MAC) {
    await keyDownCtrlOrMeta(page);
    await page.keyboard.press('ArrowLeft');
    await keyUpCtrlOrMeta(page);
  } else {
    await page.keyboard.press('Home');
  }
}
```

**Assertion styles — four layers coexist within any mature suite:**

| Style | Target | Example |
|---|---|---|
| Locator auto-retry | Visible text / structure | `expect(editor.locator('h1')).toHaveText('Heading1')` |
| Markdown round-trip equality | Parser + serializer | `expect(await getMarkdown(page)).toBe('# Heading1\n')` |
| JSON snapshot | Full editor state | `expect(doc).toMatchSnapshot('enterSelectionNotEmpty.json')` |
| HTML tagged-template | Rendered HTML subtree | `await assertHTML(page, html\`<h1 ...>...</h1>\`)` |
| PNG screenshot (sparingly) | Visual rendering | `expect(await page.screenshot()).toMatchSnapshot('slash_menu_page_down.png')` |

Milkdown's dual-assert per test (DOM + markdown round-trip) covers both view-layer and parser/serializer regressions in one case. BlockNote's `compareDocToSnapshot(page, name)` helper (at `tests/src/utils/editor.ts:25-48`) is used 20+ times across `keyboardhandlers.test.ts`. Lexical's `assertHTML(page, expectedHtml, ...{ignoreClasses, ignoreInlineStyles, ignoreDir})` accepts normalization options (at `utils/index.mjs:605-634`).

**Timing-primitive counts in mature editor suites:**

| Project | `waitForTimeout` | Top value | Per-spec average | Enforcement |
|---|---|---|---|---|
| BlockNote (end-to-end specs) | 76 | 58× 500ms | ~3-4 per spec | None |
| BlockNote (including `utils/`) | 84 | — | — | None |
| Milkdown | 26 | 17× 100ms | < 1 per spec | None |
| Tiptap Playwright | 0 | — | — | Cypress legacy only |

Even mature editor projects ship with many `waitForTimeout` calls. None of the surveyed projects deploy mechanical bans. Milkdown's lower ratio correlates with active use of event-based alternatives: `waitForSelector`, `waitForEvent('console')`, and `waitNextFrame` via double `requestAnimationFrame`:

```ts
// milkdown/e2e/tests/misc/index.ts:62-72
export async function waitNextFrame(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { resolve() })
      })
    })
  })
}
```

**Implications:**
- No surveyed project attempted a wholesale migration off `waitForTimeout` with a STOP-rule; migration is incremental and opportunistic.
- Exposing editor state on `window` (test-only) is the shared pattern for assertion primitives — even projects otherwise averse to globals (Milkdown) ship `__getMarkdown__()` for this purpose.

**Remaining uncertainty:**
- Lexical's `assertHTML` internal normalization implementation summarized via WebFetch, not read byte-for-byte.
- Slate, AFFiNE, ProseMirror examples were in the target list but not deeply surveyed in this pass.

---

### E — Trace artifact size management

**Finding:** Trace size is 1-50 MB per test typical for reasonable editor workloads, with file-upload / large-payload tests pushing multi-GB ([microsoft/playwright#20157](https://github.com/microsoft/playwright/issues/20157)). Video scales linearly with duration at ~7.5 MB/min on Chromium (VP8 at 1 Mbit/s is hardcoded per [#31424](https://github.com/microsoft/playwright/issues/31424) — not publicly configurable). GitHub Actions free-plan artifact storage is 500 MB pooled with Packages; overage bills at $0.25/GB-month. Editor-heavy OSS (Milkdown, Lexical, Plate) converges on `trace: 'on-first-retry'` + `video: 'off'` + `retention-days: 7` + `if: failure()`; BlockNote is the outlier (30-day + `!cancelled()` for its blob-merge-report workflow). The `if:` gate is higher-leverage than `retention-days` — ~20× bytes at 95%-green vs ~4× for 30d→7d.

This refines the parent Dimension 3 finding that green runs pay near-zero: the cost distribution across failing runs depends on capture strategy. A 5-failing-test CI run with median 20 MB traces lands near 100 MB; a file-upload-heavy suite could exceed 1 GB with the same test count. The parent's "~150 MB per failing CI run" estimate is a reasonable mid-range figure for editor-heavy suites without file-upload tests, but the data-backed range is 5-250 MB per failing run depending on test complexity and DOM size.

**Evidence:** [evidence/artifact-size-management.md](evidence/artifact-size-management.md)

**Artifact size taxonomy:**

| Artifact | Size | Driver |
|---|---|---|
| Trace (typical) | 1-50 MB | Action count × DOM size; each action records 3 DOM snapshots (Before/Action/After) |
| Trace (complex editor app) | ~47 MB ([Momentic guide](https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging)) | DOM-heavy pages land in upper half of normal range |
| Trace (file-upload / large payload) | 135 MB → multi-GB ([#20157](https://github.com/microsoft/playwright/issues/20157)) | Network body capture is unbounded |
| Video | ~7.5 MB/min Chromium default | VP8 at 1 Mbit/s hardcoded (not publicly configurable per [#31424](https://github.com/microsoft/playwright/issues/31424)) |
| Screenshot (1280×720 desktop PNG) | 50-300 KB | — |
| Screenshot (full-page long-doc) | 1-2 MB | — |
| JPEG with `quality` option | 5-10× smaller than PNG (lossy) | — |

**GitHub Actions storage reality (April 2026):**

| Plan | Free artifact storage | Shared with | Overage rate |
|---|---|---|---|
| Free | 500 MB | GitHub Packages | $0.25/GB-month |
| Pro | 1 GB | GitHub Packages | $0.25/GB-month |
| Team | 2 GB | GitHub Packages | $0.25/GB-month |
| Enterprise Cloud | 50 GB | GitHub Packages | $0.25/GB-month |

Key hard limits ([GitHub billing docs](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions) / [upload-artifact README](https://github.com/actions/upload-artifact)):
- 500 artifacts per job.
- Retention: default 90 days, max 90 public / 400 private or org.
- Per-artifact byte ceiling: NOT currently published. Legacy v3-era "2 GB / 5 GB" figures no longer appear on [docs.github.com/en/actions/reference/limits](https://docs.github.com/en/actions/reference/limits).
- Storage usage recalculated every 6-12 hours; deletes do not instantly free quota ([community discussion #169789](https://github.com/orgs/community/discussions/169789)).

**upload-artifact version timeline:**

| Version | Date | Notable change |
|---|---|---|
| v4.0.0 | 2023-12-14 | GA; artifacts immutable + job-scoped; v3 "merge on same name" pattern broken |
| v4.4+ | — | Hidden files excluded by default (`include-hidden-files: true` to override) |
| v5.0.0 | 2024-10-24 | Node 20/24 runtime bump |
| v6.0.0 | 2024-12-12 | Node 24 default |
| v7.0.0 | 2026-02-26 | ESM; `archive: false` for single-file unzipped uploads ([changelog](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/)) |

v3 was deprecated [2024-04-16](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/); matrix jobs are now forced onto distinct artifact names per shard or `actions/upload-artifact/merge@v4`. Compute prices reduced up to 39% starting 2026-01-01 ([changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)); **storage prices unchanged**.

**Cost-reduction patterns ranked by leverage:**

| # | Pattern | Savings | Complexity |
|---|---|---|---|
| 1 | `trace: 'on-first-retry'` | ~95% fewer traces vs `'on'` at 1-5% flake rate | Low |
| 2 | `if: failure()` gate | ~20× bytes at 95%-green pipelines | Low |
| 3 | `video: 'off'` | 60-70% of total bytes | Low |
| 4 | Video 640×480 override | 9 MB → 2.7 MB (70%) per [Testrig case study](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/) | Low |
| 5 | `screenshot: 'only-on-failure'` | 850 KB → 420 KB (51%) per Testrig | Low |
| 6 | `retention-days: 7` vs 30 | ~4× cost reduction | Low |
| 7 | Trace sub-options (`screenshots: false`, `sources: false`) | 30-60% per trace (inferred) | Medium |
| 8 | Pre-upload `tar -czf` bundling | 900 MB → 175 MB, 1.5h → 25s ([community discussion #166576](https://github.com/orgs/community/discussions/166576)) | Medium |
| 9 | FFmpeg post-encode `.webm` → `.mp4 crf 25` | ~50% additional per Testrig | Medium-High |
| 10 | Tiered `retention-days` (1d blob + 14d final) | ~14× vs flat 14d | Medium |
| 11 | `compression-level: 9` on HTML, `0` on pre-compressed | Text shrinks; avoids double-work on pre-compressed (`trace.zip`, `.webm`) | Low |
| 12 | Matrix sharding | Cap-avoidance only, not reduction | Medium |

**Editor-heavy OSS config reality:**

| Project | trace | video | screenshot | retention | `if:` gate | Matrix |
|---|---|---|---|---|---|---|
| [BlockNote](https://github.com/TypeCellOS/BlockNote/blob/main/tests/playwright.config.ts) | (default off) | (default off) | (default off) | 1d blob / 30d final | `!cancelled()` | 3 browsers × 2 shards |
| [Milkdown](https://github.com/Milkdown/milkdown/blob/main/e2e/playwright.config.ts) | `on-first-retry` | off | off | 7d | `failure()` | 5 shards |
| [Lexical](https://github.com/facebook/lexical/blob/main/.github/workflows/call-e2e-test.yml) | (workflow passes no flag) | (no flag) | (no flag) | 7d | `failure()` | 3 OS × 3 browser × 3 mode |
| [Plate](https://github.com/udecode/plate/blob/main/tooling/config/playwright.config.ts) | `on-first-retry` | off | off | N/A (no upload) | N/A | Unsharded |
| [Outline](https://github.com/outline/outline) | `on-first-retry` | off (explicit: "Disable video recording to reduce overhead") | `only-on-failure` | N/A (Playwright not in public CI) | N/A | N/A |

BlockNote's outlier pattern (30-day retention + `!cancelled()`) is driven by its blob-report merge workflow that requires ALL shard outputs regardless of pass/fail. Milkdown and Lexical demonstrate that 7-day retention suffices even at large matrix scale.

**Trace format evolution 1.40+.** Trace format is stable across releases (zero compression-format changes in 1.40 → 1.59 per release-note scan). Change velocity is at the mode and tooling level, not the serialization layer:

| Version | Change |
|---|---|
| 1.43 | `retain-on-first-failure` trace mode (trace for first run, none for retries) |
| 1.49 | `tracing.group()` method; canvas snapshots draw preview |
| 1.50 | Canvas-content display disabled by default (error-prone); key-press metadata shown |
| 1.53 | "New Steps" UI in Trace Viewer + HTML reporter |
| 1.59 | CLI trace-analysis commands (`npx playwright trace actions --grep`); unified `page.screencast` API; `artifactsDir` on `browserType.launch()` |

User requests for per-trace compression-level control ([#29218](https://github.com/microsoft/playwright/issues/29218)) were closed `P3-collecting-feedback` without implementation.

**Retention-days tradeoffs.** The Playwright docs `retention-days: 30` example ([ci.md](https://playwright.dev/docs/ci)) is HTML-report only — not for raw traces. Report-only artifacts are small; `test-results/` dirs with traces are mostly bytes. Teams copying the 30 value verbatim for trace-heavy dirs over-retain. Debugging window in practice (inferred from convergence, not surveyed): if nobody opens a trace within 5 business days, they're not going to. 7d covers Fri-fail → Mon-investigate; 14d covers a week-off contributor; 30d is vacation/hand-off insurance.

Cost math:
```
monthly_cost = retention_days × failure_rate × shard_count × avg_artifact_GB × ($0.25/GB-month / 30)
```
For a 5-shard suite with 50 MB trace bundles, 2% fail rate, 30-day retention: `30 × 0.02 × 5 × 0.05 = 0.15 GB-days ≈ immaterial`. Costs dominate when retention defaults to 90d, failure rate spikes during a flake crisis, or traces balloon to GBs.

**Implications:**
- Derivable state (build output, `node_modules`) should live in cache ($0.07/GiB-month per the [2025-11-20 changelog](https://github.blog/changelog/2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/), 3.6× cheaper per GB and separate quota), not in artifacts.
- PR-branch vs main-branch retention asymmetry is rare — none of the four sampled repos conditionally branch retention on `github.ref`. Main-branch failures are rare and already captured by the PR's artifact at the same commit; flat retention is simpler.

**Vendor-incentive bias flag:** GitHub sets both quotas and overage rates and controls the 6-12h recalc window. Verifiable via docs/changelog but self-interested.

**Remaining uncertainty:**
- Per-action DOM-snapshot size histogram on real editor pages is not published by Playwright; requires local profiling via `unzip trace.zip && du -ah resources/`.
- Empirical per-artifact byte ceiling for v4+ unconfirmed; `archive: false` × `compression-level` interaction undocumented.
- No measurement of how often traces actually ARE opened within 1/3/7/14/30 days post-failure; the "5 business days" heuristic is inferred from convergence, not surveyed.
- Only one end-to-end measured-savings study ([Testrig](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/)) exists; its 60%+ figure is single-vendor.

---

### Cross-cutting observations

Several threads run across the five follow-ups that none individually surfaces as a named pattern.

**Thread 1 — DOM-exposed state is the universal escape hatch.** When no native Playwright primitive exposes an app's internal state (provider sync, debounce settled, Activity mount active, editor transaction quiesced, `isPending` pending), the community answer is the same across every follow-up: **emit the state to the DOM and assert on it**. The specific forms vary:
- Logseq: `<div.hidden data-testid="rtc-tx">{:local-tx N :remote-tx M}</div>` (production DOM, text content carries counter state) — follow-up A.
- Radix UI: `data-state="open"|"closed"` on every stateful part (production DOM, attribute carries enum state) — follow-up C.
- W3C ARIA APG: `aria-busy="false"` on a region (production DOM, attribute signals quiescence) — follow-up C.
- MDN-aligned React 19 convention: `aria-busy={isPending}` mirror of `useTransition`'s internal boolean — follow-up B.
- BlockNote: `data-test="italic"` on named buttons (test-only attribute, avoids i18n-brittle text selectors) — follow-up D.

These are variations on one principle: **if state isn't in the DOM, tests can't see it; if it is in the DOM, every test framework can read it.** This connects to parent Dimension 2's test-hooks-vs-DOM boundary — the follow-ups collectively argue that DOM-signal is preferred even for internally-complex state, as long as the emission is cheap.

**Thread 2 — No first-party primitive exists for the patterns teams most need.** Four open Playwright feature requests appear across multiple follow-ups:
- [microsoft/playwright#4055](https://github.com/microsoft/playwright/issues/4055) — `waitForAnimation` (2020, P3; animation-completion covered by WAAPI workaround) — follow-up C.
- [microsoft/playwright#15660](https://github.com/microsoft/playwright/issues/15660) — `waitForTransition` for React transitions (2022, unlanded) — follow-up B.
- [microsoft/playwright#19835](https://github.com/microsoft/playwright/issues/19835) — `networkidle` hangs on persistent connections — follow-up B (also feeds parent Dimension 6).
- [microsoft/playwright#36233](https://github.com/microsoft/playwright/issues/36233) — `getByRole({ busy: false })` filter (P3-collecting-feedback) — follow-ups B and C.

The community gap each fills is real; the absence of movement across years suggests these are unlikely to land soon. Teams that need them must build their own primitives.

**Thread 3 — Counter-based signals strictly dominate boolean signals for convergence tests.** Follow-up A's Logseq `rtc-tx` pattern carries `{local-tx N, remote-tx M}` counters; tests poll until `local == remote && > baseline`. Follow-up E's trace-format evolution notes that Playwright's own trace records every action with three DOM snapshots — counter-equivalent granularity, used for forensic debugging rather than live assertion. Follow-up C's `expect.poll` with a composite predicate (`{open, active, count}`) is the generic version of the same idea. **Boolean `synced`, `ready`, or `aria-busy="false"` can only answer "has it happened?" — counters and structured state can answer "has it happened since my reference point?"** For per-mutation quiescence (not just initial load), the latter is strictly required.

**Thread 4 — `page.waitForTimeout` is endemic even in mature editor projects.** Even projects with sophisticated test infrastructure ship with dozens to hundreds of `waitForTimeout` calls: BlockNote 76 (end-to-end specs only; 84 with utils), Milkdown 26, tldraw uses `sleep(2000)` with explicit "historically flaky without" comments (follow-ups A, D). None of the surveyed projects deploys a STOP rule against it. Parent Dimension 8's three enforcement paths (Biome nursery rule, `eslint-plugin-playwright`, hand-rolled grep test) are technically available today but not deployed in surveyed OSS — the community norm is code-review discipline, not mechanical enforcement. This gap between availability and adoption is itself a finding: **the cost of maintaining a `waitForTimeout` budget is non-trivial, and no editor project has judged it worth paying yet**.

**Thread 5 — The `if:` gate is the universally underappreciated lever.** Follow-up E's ranking puts `if: failure()` at #2 with ~20× byte reduction at 95%-green pipelines. Parent Dimension 4's "`!cancelled()` for HTML report, `failure()` for test-results" split implements the tradeoff. Few public posts discuss it; the convergence in editor-OSS configs is stronger than the documentation suggests. This aligns with follow-up E's Testrig-case-study observation that stacked cost optimizations (video 640×480 + screenshot only-on-failure + ffmpeg post-encode) deliver 60%+ overall — but `if: failure()` alone covers most of the gap for green-biased pipelines.

**Thread 6 — Editor state must be exposed on `window` for non-trivial assertions.** Follow-up D documents that every surveyed editor project (BlockNote, Milkdown, Lexical) exposes editor state on `window` for tests. Follow-up A extends this to the CRDT layer: tldraw exposes `window.editor` for setup/teardown; HedgeDoc bypasses keystroke simulation entirely via `cy.setCodemirrorContent`. The pattern is the same principle as Thread 1 — but at the JS-object level rather than DOM-attribute level. The canonical forms: `window.ProseMirror.getJSON()` (BlockNote), `window.__getMarkdown__()` + `window.__setMarkdown__()` (Milkdown), `window.lexicalEditor` (Lexical). **DOM alone is insufficient for editor-state assertions** — round-trip markdown equality or JSON-snapshot assertion against the editor's own public API is the shared convention.

---

### Targeted follow-up — `page.clock` × Y.js / Hocuspocus compatibility

**Finding:** Playwright's `page.clock.install()` (v1.45+) overrides `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`, `performance`, and `Event.timeStamp` — but NOT `queueMicrotask`, `MessageChannel.postMessage`, WebSocket timers, or `fetch` response timing. Y.js core (yjs@13.6.30) uses `performance.now` (×13) and `setTimeout` (×2), all overridden. Hocuspocus provider uses `setInterval` (×3: awareness heartbeat, connection checker, forceSync) and `setTimeout` (×1: reconnect delay), all overridden. **The WebSocket layer flows in real time regardless of `page.clock` state** — initial sync messages, Yjs updates, and Hocuspocus protocol messages are not affected.

**Evidence:** [evidence/page-clock-crdt-compatibility.md](evidence/page-clock-crdt-compatibility.md)

**Compatibility matrix:**

| Test category | Compatible with `page.clock`? | Notes |
|---|---|---|
| UI debounce / keystroke timing (Observer A's 50ms, typing defer's 300ms, chunked-paste rAF) | ✅ Yes | Install clock AFTER `provider.synced === true` to let connection-layer timers stabilize |
| Editor-state after typing | ✅ Yes | Same — debounces advance deterministically via `clock.runFor(N)` |
| Animation completion | ✅ Yes | `requestAnimationFrame` is overridden |
| Initial provider sync | ⚠️ Mixed — use real time | Install clock only AFTER sync completes |
| Disconnect + auto-reconnect | ❌ No | Hocuspocus's connection-checker `setInterval` and reconnect-delay `setTimeout` are frozen |
| Long-running multi-client awareness propagation | ❌ No | Awareness heartbeat `setInterval` is frozen — own state won't re-broadcast |
| Tests that rely on `forceSync` interval firing | ❌ No | `forceSyncInterval` timer is frozen |
| Tests spanning Hocuspocus `messageReconnectTimeout` windows | ❌ No | Connection checker is frozen |

**Implications:**
- `page.clock` is a **selectively-opt-in** primitive for OK's test suite — not a default to install globally.
- The recommended helper shape (synthesized from the findings, not prescribed by any surveyed project): `installClockAfterSync(page)` — awaits `provider.synced`, then installs clock. Tests that need determinism for debounce-timing opt in explicitly.
- **No surveyed Yjs/Hocuspocus project uses `page.clock` today.** The spec would be pioneering the combination. This is not a blocker — the API semantics are well-defined — but means we won't find prior-art templates to copy.
- **Decision trigger:** If our debounce-heavy tests (slash-menu timing, Observer A convergence) prove unreliable under `waitForFunction` alone, `page.clock` is a principled escalation. If they're reliable, `page.clock` is an optional optimization for speed, not a correctness-required tool.

**Decision triggers (when this matters):**
- If tests need to advance 300ms+ synchronously (vs. waiting wall-clock) and do NOT depend on connection lifecycle → `page.clock` is ideal.
- If a test's subject IS the Hocuspocus connection lifecycle → must use real time; `page.clock` is disqualified.
- If a test uses `forceSync` as its safety net → `page.clock` disables the safety net.

**Remaining uncertainty:**
- Not prototyped end-to-end. Confidence is based on API docs + direct source inspection of yjs@13.6.30 and @hocuspocus/provider; a concrete 30-minute spike in the spec's implementation phase would elevate to CONFIRMED behavior.
- Behavior during WebSocket re-open while clock is installed is undefined in our synthesis — tests should set up connection state before installing.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **`flakyTestsFail` semantics** (Dimension 5): found that no surveyed OSS project uses it; didn't find a deep analysis of when it's appropriate. Probably rare.
- **Exact cost-benefit of `trace: 'on'` vs `'on-first-retry'`**: convergence is strong but detailed benchmark data wasn't surfaced.
- **BrowserStack / SauceLabs real-device WebKit as an alternative to Playwright's webkit**: out of scope.
- **AFFiNE's `waitForEditorLoad` fixture internals** (follow-up A): not fetched — DOM-only vs provider-aware vs composite is unknown.
- **React DevTools hook as a Playwright signal** (follow-up B): theoretically possible via `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`; no community usage located.
- **Empirical per-artifact byte ceiling** for upload-artifact v4+ (follow-up E): v3-era "2 GB / 5 GB" figures are no longer in current docs; v4+ ceiling is unpublished.
- **Per-action DOM-snapshot size histogram** on real editor pages (follow-up E): not published by Playwright; requires local profiling.

### Out of Scope (per Rubric)

- Per-test docName isolation for the 5 shared-`test-doc` E2E files — covered by `playwright-stability` spec.
- Playwright vs. Cypress/WebdriverIO tool comparison — covered by [`agent-browser-vs-playwright-crdt-testing`](../agent-browser-vs-playwright-crdt-testing/REPORT.md).
- Bridge-convergence fuzz — user-excluded.
- 1P Open Knowledge codebase analysis — belongs in the downstream spec.
- Mobile / iOS real-device testing — different scope.

---

## References

### Evidence Files

- [evidence/oss-config-survey.md](evidence/oss-config-survey.md) — 7-project Playwright config survey
- [evidence/playwright-official-docs.md](evidence/playwright-official-docs.md) — Best Practices doc + Trace Viewer + CI guidance
- [evidence/networkidle-discouraged.md](evidence/networkidle-discouraged.md) — `waitUntil` taxonomy + official discouragement
- [evidence/webkit-headless-cors.md](evidence/webkit-headless-cors.md) — Issue tracker analysis + surgical fix catalog
- [evidence/condition-wait-primitives.md](evidence/condition-wait-primitives.md) — 5 wait primitives + decision tree
- [evidence/enforcement-mechanisms.md](evidence/enforcement-mechanisms.md) — eslint-plugin-playwright + Biome + grep-test options
- [evidence/test-hooks-patterns.md](evidence/test-hooks-patterns.md) — test hooks vs DOM signals + Vite DEV gating
- [evidence/helpers-organization.md](evidence/helpers-organization.md) — functional vs fixture vs POM
- [evidence/skip-vs-filter-vs-fix-patterns.md](evidence/skip-vs-filter-vs-fix-patterns.md) — annotation taxonomy + decision hierarchy
- [evidence/ci-artifact-patterns.md](evidence/ci-artifact-patterns.md) — GitHub Actions workflow patterns
- [evidence/crdt-readiness-signals.md](evidence/crdt-readiness-signals.md) — CRDT editor readiness patterns (follow-up A)
- [evidence/react19-suspense-patterns.md](evidence/react19-suspense-patterns.md) — React 19 concurrency + Playwright (follow-up B)
- [evidence/debounce-animation-patterns.md](evidence/debounce-animation-patterns.md) — Debounce, animation, composed-event waits (follow-up C)
- [evidence/editor-e2e-patterns.md](evidence/editor-e2e-patterns.md) — Editor E2E test design catalog (follow-up D)
- [evidence/artifact-size-management.md](evidence/artifact-size-management.md) — Trace/video/storage economics (follow-up E)
- [evidence/page-clock-crdt-compatibility.md](evidence/page-clock-crdt-compatibility.md) — `page.clock` × Y.js / Hocuspocus compatibility (2026-04-17 targeted update)

### External Sources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Playwright Actionability / Auto-waiting](https://playwright.dev/docs/actionability)
- [Playwright Page API (`waitUntil`)](https://playwright.dev/docs/api/class-page)
- [Playwright Test Annotations](https://playwright.dev/docs/test-annotations)
- [Playwright Fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright POM docs](https://playwright.dev/docs/pom)
- [eslint-plugin-playwright — no-wait-for-timeout](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md)
- [eslint-plugin-playwright npm](https://www.npmjs.com/package/eslint-plugin-playwright)
- [biomejs/biome PR #8960](https://github.com/biomejs/biome/pull/8960)
- [Vite — Env Variables and Modes](https://vite.dev/guide/env-and-mode)
- [Playwright Issue #32429](https://github.com/microsoft/playwright/issues/32429)
- [Playwright Issue #4031](https://github.com/microsoft/playwright/issues/4031)
- [Playwright Issue #12975](https://github.com/microsoft/playwright/issues/12975)
- [Playwright Issue #27903](https://github.com/microsoft/playwright/issues/27903)
- [Playwright Issue #19904](https://github.com/microsoft/playwright/issues/19904)
- [Playwright Issue #24319 (CI artifact paths)](https://github.com/microsoft/playwright/issues/24319)
- [BrowserStack — Playwright Wait Types 2026](https://www.browserstack.com/guide/playwright-wait-types)
- [BrowserStack — Why page.goto() is slow 2026](https://www.browserstack.com/guide/playwright-goto)
- [Checkly — Waits and timeouts](https://www.checklyhq.com/docs/learn/playwright/waits-and-timeouts/)
- [CircleCI — Mastering waits and timeouts in Playwright](https://circleci.com/blog/mastering-waits-and-timeouts-in-playwright/)
- [Yevhen Laichenkov — 17 Playwright testing mistakes](https://elaichenkov.github.io/posts/17-playwright-testing-mistakes-you-should-avoid/)
- [Murat Ozcan — Page Objects vs. Functional Helpers](https://dev.to/muratkeremozcan/page-objects-vs-functional-helpers-2akj)
- [Checkly — POMs and Fixtures](https://www.checklyhq.com/blog/page-object-models-and-fixtures-with-playwright/)

**Follow-up A — CRDT readiness signals (collaborative-editor projects):**
- [Tiptap](https://github.com/ueberdosis/tiptap) — Cypress tests in `tests/cypress/integration/`; `onFirstRender` callback in `packages/extension-collaboration/src/collaboration.ts`
- [Hocuspocus](https://github.com/ueberdosis/hocuspocus) — `HocuspocusProvider.ts`, `MessageReceiver.ts`; `retryableAssertion` in `tests/utils/`
- [y-prosemirror](https://github.com/yjs/y-prosemirror) — `safeDispatch` in `tests/suggestions.test.js`
- [BlockNote](https://github.com/TypeCellOS/BlockNote) — Playwright tests in `tests/src/end-to-end/`
- [Outline](https://github.com/outline/outline) — `MultiplayerEditor.tsx` dual-state sync hooks
- [tldraw](https://github.com/tldraw/tldraw) — Playwright tests in `apps/examples/e2e/`
- [HedgeDoc](https://github.com/hedgedoc/hedgedoc) — Cypress tests in `frontend/cypress/e2e/`
- [AFFiNE](https://github.com/toeverything/AFFiNE) — Playwright tests in `tests/affine-local/e2e/`
- [Logseq](https://github.com/logseq/logseq) — Clojure Playwright (Wally) in `clj-e2e/`; `src/main/frontend/components/rtc/indicator.cljs` (production `rtc-tx` DOM element)

**Follow-up B — React 19 concurrency + Playwright:**
- [React 19.2 blog post](https://react.dev/blog/2025/10/01/react-19-2)
- [React useTransition reference](https://react.dev/reference/react/useTransition)
- [React Suspense reference](https://react.dev/reference/react/Suspense)
- [React Activity reference](https://react.dev/reference/react/Activity)
- [React issue #28923 — isPending stuck](https://github.com/facebook/react/issues/28923)
- [microsoft/playwright#15660 — waitForTransition feature request](https://github.com/microsoft/playwright/issues/15660)
- [microsoft/playwright#36233 — busy option on getByRole](https://github.com/microsoft/playwright/issues/36233)
- [microsoft/playwright#19835 — networkidle hangs on persistent connections](https://github.com/microsoft/playwright/issues/19835)
- [microsoft/playwright#26091 — Webkit Next.js App Router navigation bug](https://github.com/microsoft/playwright/issues/26091)
- [MDN: role="status"](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role)
- [MDN: aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)
- [TkDodo — React 19 and Suspense: A Drama in 3 Acts](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts)
- [react-error-boundary README](https://github.com/bvaughn/react-error-boundary/blob/main/README.md)
- [React Testing Library issue #1375 — Suspense stuck on React 19](https://github.com/testing-library/react-testing-library/issues/1375)
- [freeCodeCamp — Modern React Data Fetching Handbook](https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/)

**Follow-up C — Debounce, animation, composed-event waits:**
- [Playwright: Clock API](https://playwright.dev/docs/api/class-clock)
- [Playwright: PageAssertions (toHaveScreenshot)](https://playwright.dev/docs/api/class-pageassertions)
- [Playwright: Test configuration (use.reducedMotion)](https://playwright.dev/docs/test-configuration)
- [Playwright issue #4055 — Add waitForAnimation](https://github.com/microsoft/playwright/issues/4055)
- [Radix UI: Animation guide](https://www.radix-ui.com/primitives/docs/guides/animation)
- [Radix UI: Accordion](https://www.radix-ui.com/primitives/docs/components/accordion)
- [MDN: Element.getAnimations()](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations)
- [MDN: aria-activedescendant](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant)
- [MDN: prefers-reduced-motion media query](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [W3C WAI ARIA Authoring Practices: Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Sarah Higley — "aria-activedescendant is not focus"](https://sarahmhigley.com/writing/activedescendant/)
- [The Green Report — Automating animation testing with Playwright](https://www.thegreenreport.blog/articles/automating-animation-testing-with-playwright-a-practical-guide/automating-animation-testing-with-playwright-a-practical-guide.html)
- [TestDouble — Jest timers vs. waitFor for debounced inputs](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs)
- [Ash Connolly — Playwright visual regression in Next.js](https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next)
- [TipTap Suggestion utility docs](https://tiptap.dev/docs/editor/api/utilities/suggestion)
- [lodash issue #2893 — debounce breaks fake timers](https://github.com/lodash/lodash/issues/2893)

**Follow-up D — Editor E2E test design:**
- [BlockNote tests/](https://github.com/TypeCellOS/BlockNote/tree/main/tests) — `utils/editor.ts`, `utils/slashmenu.ts`, `end-to-end/keyboardhandlers.test.ts`
- [Milkdown e2e/](https://github.com/Milkdown/milkdown/tree/main/e2e) — `tests/misc/index.ts`, `tests/input/heading.spec.ts`
- [Lexical playground __tests__](https://github.com/facebook/lexical/tree/main/packages/lexical-playground/__tests__) — `utils/index.mjs`, `keyboardShortcuts/index.mjs`
- [Tiptap tests/cypress](https://github.com/ueberdosis/tiptap/tree/main/tests/cypress)

**Follow-up E — Trace artifact size + GHA storage:**
- [Playwright Trace Viewer docs](https://playwright.dev/docs/trace-viewer)
- [Playwright Videos docs](https://playwright.dev/docs/videos)
- [Playwright Release Notes](https://playwright.dev/docs/release-notes)
- [Playwright Sharding docs](https://playwright.dev/docs/test-sharding)
- [microsoft/playwright#8263 — Smaller trace files](https://github.com/microsoft/playwright/issues/8263)
- [microsoft/playwright#20157 — Large uploads & trace size](https://github.com/microsoft/playwright/issues/20157)
- [microsoft/playwright#29218 — Reduce sizes of screenshots and trace files](https://github.com/microsoft/playwright/issues/29218)
- [microsoft/playwright#29531 — retain-on-first-failure modes](https://github.com/microsoft/playwright/issues/29531)
- [microsoft/playwright#31424 — Video quality control](https://github.com/microsoft/playwright/issues/31424)
- [microsoft/playwright#32405 — Trace sub-option parity](https://github.com/microsoft/playwright/issues/32405)
- [GitHub Actions billing docs](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- [GitHub Actions reference limits](https://docs.github.com/en/actions/reference/limits)
- [GitHub retention-days configuration docs](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)
- [actions/upload-artifact releases](https://github.com/actions/upload-artifact/releases)
- [GitHub changelog — v3 deprecation (2024-04-16)](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)
- [GitHub changelog — Artifacts v4 GA (2023-12-14)](https://github.blog/changelog/2023-12-14-github-actions-artifacts-v4-is-now-generally-available/)
- [GitHub changelog — Cache >10 GB (2025-11-20)](https://github.blog/changelog/2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/)
- [GitHub changelog — Non-zipped artifacts / v7 (2026-02-26)](https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/)
- [GitHub changelog — Pricing update (2025-12-16)](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)
- [GitHub Community Discussion #166576 — managing artifact storage](https://github.com/orgs/community/discussions/166576)
- [GitHub Community Discussion #169789 — quota-hit](https://github.com/orgs/community/discussions/169789)
- [Testrig — How We Reduced Playwright Test Artifact Storage by More Than 60%](https://www.testrigtechnologies.com/how-testrig-reduced-playwright-test-artifact-storage-by-more-than-60-real-ci-cd-insights/)
- [Momentic — Trace Viewer Guide](https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging)
- [BlockNote playwright.config.ts](https://github.com/TypeCellOS/BlockNote/blob/main/tests/playwright.config.ts)
- [Milkdown playwright.config.ts](https://github.com/Milkdown/milkdown/blob/main/e2e/playwright.config.ts)
- [Lexical call-e2e-test.yml](https://github.com/facebook/lexical/blob/main/.github/workflows/call-e2e-test.yml)
- [Plate playwright.config.ts](https://github.com/udecode/plate/blob/main/tooling/config/playwright.config.ts)
- [Outline ci.yml](https://github.com/outline/outline/blob/main/.github/workflows/ci.yml)

### Related Research

- [e2e-blocked-qa-validation-options](../e2e-blocked-qa-validation-options/REPORT.md) — routeWebSocket timing bugs, test-hook alternatives, Y.js awareness injection (adjacent; problem-specific rather than best-practice survey)
- [agent-browser-vs-playwright-crdt-testing](../agent-browser-vs-playwright-crdt-testing/REPORT.md) — Playwright vs. alternatives for CRDT testing (tool selection, not usage patterns)
- [ts-monorepo-ci-test-pipeline-patterns](../ts-monorepo-ci-test-pipeline-patterns/REPORT.md) — broader CI pipeline patterns
