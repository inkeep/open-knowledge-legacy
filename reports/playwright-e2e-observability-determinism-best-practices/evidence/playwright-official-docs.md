# Evidence: Playwright Official Documentation — Best Practices

**Dimension:** 1, 3, 6, 7 (core official guidance)
**Date:** 2026-04-17
**Sources:** playwright.dev docs (best-practices, trace-viewer, actionability, page API, waitForLoadState)

---

## Key files / pages referenced

- [Playwright Best Practices](https://playwright.dev/docs/best-practices) — flagship guidance doc
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) — debugging tool reference
- [Auto-waiting (Actionability)](https://playwright.dev/docs/actionability) — locator auto-wait contract
- [Page API — goto / reload](https://playwright.dev/docs/api/class-page) — waitUntil option reference

---

## Findings

### Finding: Playwright's `best-practices` doc names trace viewer as the canonical CI debug surface

**Confidence:** CONFIRMED
**Evidence:** [Playwright Best Practices](https://playwright.dev/docs/best-practices):
> "For CI failures, use the Playwright trace viewer instead of videos and screenshots. The trace viewer gives you a full trace of your tests as a local Progressive Web App (PWA) that can easily be shared."
>
> "Traces are configured in the Playwright config file and are set to run on CI on the first retry of a failed test."

**Implications:**
- Playwright's own guidance is `trace: 'on-first-retry'` on CI.
- Trace is primary; video + screenshot are supplementary, not duplicative.
- The trace file is self-contained (PWA); developers open with `bunx playwright show-trace trace.zip` locally — no server needed.

### Finding: Web-first assertions with auto-waiting are the recommended default

**Confidence:** CONFIRMED
**Evidence:** [Playwright Best Practices](https://playwright.dev/docs/best-practices):
> "By using web first assertions Playwright will wait until the expected condition is met."
>
> "Assertions such as `toBeVisible()` will wait and retry if needed" versus manual checks that "won't wait a single second, it will just check the locator is there and return immediately."

And [Actionability](https://playwright.dev/docs/actionability):
> "Locators come with auto waiting and retry-ability. Auto waiting means that Playwright performs a range of actionability checks on the elements, such as ensuring the element is visible and enabled before it performs the click."

**Implications:**
- The default for any "wait for UI state" is a web-first assertion (`expect(locator).toBeVisible()`, `toHaveText`, `toHaveAttribute`, `toHaveCount`, etc.).
- `waitForFunction` / `expect.poll` / `locator.waitFor` are escape hatches for conditions that don't map to the built-in assertion set.
- The decision order is: (1) web-first assertion; (2) if no matching assertion, `locator.waitFor({state})`; (3) if that's not enough, `expect.poll`; (4) if that's still not enough, `waitForFunction` against page-context state.

### Finding: CI best practices — install only needed browsers + Linux preferred

**Confidence:** CONFIRMED
**Evidence:** [Playwright Best Practices](https://playwright.dev/docs/best-practices):
> "Setup CI/CD and run your tests frequently. The more often you run your tests the better."
>
> "Use Linux when running your tests on CI as it is cheaper."
>
> "Only install needed browsers to save both download time and disk space on your CI machines"

**Implications:**
- Our current `playwright install chromium webkit firefox` is aligned with the best-practices guidance when cross-browser parity is a goal (editor-layer project; verified via OSS survey that BlockNote + Milkdown do the same).
- Linux-based ubuntu-latest is Playwright's own recommendation.

### Finding: Cross-browser testing is recommended where user reach matters

**Confidence:** CONFIRMED
**Evidence:** [Playwright Best Practices](https://playwright.dev/docs/best-practices):
> "Testing across all browsers ensures your app works for all users. In your config file you can set up projects adding the name and which browser or device to use."

**Implications:**
- Our chromium + webkit + firefox project matrix is aligned.
- Not all OSS projects do this (GitButler, Cline, Plasmic run Chromium-only on CI) — it's a deliberate product decision based on audience.

### Finding: Retries config is documented but left to the user to decide

**Confidence:** CONFIRMED (negative — docs don't prescribe a specific retry count)
**Evidence:** Playwright's [Retries docs](https://playwright.dev/docs/test-retries):
> Retries are configured as `retries: 2` in common examples; community convergence on 2 for CI.
> Playwright tracks retries in the test report via `status: 'flaky'` for tests that passed on retry.

**`failOnFlakyTests` option** (added in Playwright v1.52): [TestConfig API](https://playwright.dev/docs/api/class-testconfig). CLI flag `--fail-on-flaky-tests`. Example: `defineConfig({ failOnFlakyTests: !!process.env.CI })`. Tracked in [issue #34397](https://github.com/microsoft/playwright/issues/34397).

**Implications:**
- The framework distinguishes `flaky` (passed on retry) from `passed`/`failed`/`skipped` in reports — teams can see retry signal without setting `failOnFlakyTests`.
- Setting `failOnFlakyTests: true` fails CI on any retry-success; this is stricter than community default but valid for teams who want zero tolerance for flakes.

---

## Negative searches

- Searched for official guidance against `networkidle` in the Best Practices page: **NOT FOUND there specifically.** The `networkidle` discouragement appears on the [Page API doc](https://playwright.dev/docs/api/class-page) (see separate evidence file), not the best-practices overview.
- Searched for official guidance on `waitForTimeout` in the Best Practices page: **IMPLIED but not named directly.** The auto-waiting guidance implicitly discourages hardcoded timeouts.

---

## Gaps / follow-ups

- Playwright's docs don't explicitly enumerate a retries policy — the "retries: 2 on CI" norm is community-established (surveyed repos unanimous), not docs-prescribed.
