# Evidence: CI Artifact Upload Patterns for Playwright

**Dimension:** 3, 4 (observability config + CI artifact upload)
**Date:** 2026-04-17
**Sources:** Playwright CI docs, GitHub Actions docs, community guides, OSS survey

---

## Key files / pages referenced

- [Playwright CI docs](https://playwright.dev/docs/ci-intro)
- [GitHub Actions — Playwright example](https://playwright.dev/docs/ci#github-actions)
- [Playwright Issue #24319 — screenshots+trace not uploaded after job run](https://github.com/microsoft/playwright/issues/24319)
- [Playwright Issue #23723 — Keep only artifacts of latest failure](https://github.com/microsoft/playwright/issues/23723)
- [Techlistic — Playwright CI/CD Integration with GitHub Actions 2026](https://www.techlistic.com/2026/02/playwright-cicd-integration-with-github.html)
- [TestingMint — Playwright Reporting and Test Artifacts](https://testingmint.com/chapter-15-playwright-reporting-and-test-artifacts/)
- [BrowserStack — Automating Playwright Tests with GitHub Actions](https://www.browserstack.com/guide/playwright-github-action)
- [DEV — Playwright with GitHub Actions](https://dev.to/stefanalfbo/playwright-with-github-actions-4m6i)
- [Momentic — Trace Viewer Master Guide](https://momentic.ai/blog/the-ultimate-guide-to-playwright-trace-viewer-master-time-travel-debugging)

---

## Findings

### Finding: Canonical CI artifact upload pattern (community convergence)

_Note: `actions/upload-artifact@v7` is the current stable release (from 2026-02-26 changelog). `@v4` remains supported as a minimum viable version. Both BlockNote and Milkdown's CI workflows use `@v7` today._

**Confidence:** CONFIRMED
**Evidence:** Multiple sources converge on this GitHub Actions workflow pattern:

```yaml
- name: Upload Playwright report
  if: ${{ !cancelled() }}
  uses: actions/upload-artifact@v7
  with:
    name: playwright-report
    path: packages/app/playwright-report/
    retention-days: 14

- name: Upload test-results (videos, traces, screenshots)
  if: failure()
  uses: actions/upload-artifact@v7
  with:
    name: test-results
    path: packages/app/test-results/
    retention-days: 14
```

Key idioms:
- **`if: ${{ !cancelled() }}`** for the HTML report — upload even on pass, so developers can inspect green runs if they want. (Some projects gate this with `if: failure()` too — tradeoff.)
- **`if: failure()`** for `test-results/` — videos, traces, screenshots only land on failure, so storage cost is zero on green runs.
- **`retention-days`** typically `7-14` for PR branches, `30` for main. `90` is the GHA default (too long).
- **Separate artifacts** for the report vs. the raw test-results — report is user-facing (HTML), test-results is raw (trace.zip, video.webm, screenshot.png).

### Finding: The HTML report is the primary developer entry point

**Confidence:** CONFIRMED
**Evidence:** [Playwright CI docs](https://playwright.dev/docs/ci-intro):
> "The HTML reporter is the default, and creates a self-contained folder that contains the report for the test run that can be served as a web page."

Developer flow:
1. CI fails → download `test-results/` artifact from the GH Actions run page
2. Extract → run `bunx playwright show-report` in the extracted folder
3. HTML opens in browser; navigate to the failing test; click "trace" → Playwright trace viewer opens as a PWA
4. Step through the trace: timeline, network, console, DOM snapshots per action

**Implications:**
- Reporter config: `reporter: [['html', { open: 'never' }], ['list']]`
- `open: 'never'` prevents Playwright from auto-opening the report in CI (which would crash). Local dev still works (`bunx playwright show-report`).
- `['list']` reporter shows test results in stdout during the run.
- No need for custom reporters unless you want structured JSON for a dashboard.

### Finding: Artifact size is manageable with retain-on-failure

**Confidence:** CONFIRMED
**Evidence:** Community guides:
> "When configuring Playwright with retries and `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`, and `screenshot: 'only-on-failure'`, artifacts can easily exceed 150MB even with just 5-6 failed test cases."

[Issue #23723](https://github.com/microsoft/playwright/issues/23723) discusses "Keep only artifacts of latest failure" as a feature request (not yet implemented).

**Implications:**
- 150MB per failing CI run is the reasonable upper bound.
- GitHub Actions allows up to 500 MiB per artifact by default; well within bounds.
- Retention cost: 14-day retention × ~150MB × N failing runs per week = manageable.
- For extreme cases, `trace: 'on-first-retry'` captures only the retry's trace (not both attempts), halving the cost.

### Finding: There is a known CI-upload bug to be aware of

**Confidence:** CONFIRMED
**Evidence:** [Issue #24319 — Screenshots + trace are not getting uploaded to artifact after a job run in github actions](https://github.com/microsoft/playwright/issues/24319):
> Thread documents cases where `test-results/` is empty because of output directory misalignment between Playwright config and the workflow.

**Implications:**
- **The `path:` in `actions/upload-artifact` must match Playwright's `outputDir` (default: `test-results/`) and the folder the HTML reporter writes to (default: `playwright-report/`).**
- If the playwright command runs from `packages/app`, the paths are `packages/app/test-results/` and `packages/app/playwright-report/` (relative to the repo root, not the test's cwd).
- Turbo-dispatched tests need care: `bunx turbo run test:e2e` runs the task in its package dir, so the artifact paths are relative to `packages/app/`.

### Finding: Recommended Playwright config for CI observability (community convergence)

**Confidence:** CONFIRMED
**Evidence:** OSS survey + community guides converge on:

```typescript
// playwright.config.ts
export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    trace: 'on-first-retry',        // or 'retain-on-failure' — both valid
    video: 'retain-on-failure',      // optional but recommended for editor-layer projects
    screenshot: 'only-on-failure',
  },
  // ...
});
```

Key points:
- **`retries: 2`** on CI is the dominant convention (per OSS survey).
- **`trace: 'on-first-retry'`** captures traces only when a failed test retries — zero cost on green runs.
- **`trace: 'retain-on-failure'`** captures traces on all failing tests (even final failures without retry) — slightly more cost, slightly better coverage. Acceptable alternative.
- **`video: 'retain-on-failure'`** — appropriate when visual flow matters (our editor).
- **`screenshot: 'only-on-failure'`** — cheap insurance, always on.

---

## Negative searches

- Searched for Playwright first-party artifact compression / deduplication: **NOT FOUND.** Traces are already compressed (zip); videos are WebM (compressed). No additional compression needed.

---

## Gaps / follow-ups

- None for this dimension.
