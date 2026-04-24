# Evidence: Cross-Browser Parity — Skip vs. Filter vs. Fix

**Dimension:** 10 (skip vs filter vs fix)
**Date:** 2026-04-17
**Sources:** Playwright docs (annotations), community guides, OSS project patterns

---

## Key files / pages referenced

- [Playwright Test Annotations](https://playwright.dev/docs/test-annotations) — test.skip, test.fixme, test.fail, test.slow
- [Test class API](https://playwright.dev/docs/api/class-test)
- [Platform Development Playbook — Playwright Guidelines](https://playbook.platformdev.amdigital.co.uk/Ways-of-Working/Toolkit/Test-Engineering/Best-Practices/Playwright-Test-Automation-Guidelines/)
- [Test Automation Mastery — Conditional Skipping](https://testautomationmastery.com/mastering-conditional-test-skipping-in-playwright/)

---

## Findings

### Finding: Playwright offers three annotations with different semantics

**Confidence:** CONFIRMED
**Evidence:** [Playwright Test Annotations](https://playwright.dev/docs/test-annotations):

| Annotation | Semantic | Reporting |
|---|---|---|
| `test.skip(condition, reason)` | "This test should not run in this configuration. Don't fix — intentionally not applicable." | Reported as skipped. **No expected fix timeline.** |
| `test.fixme(condition, reason)` | "This test is broken and should be fixed. Skip for now but flag as pending work." | Reported as fixme. **Implies a pending fix.** |
| `test.fail(condition)` | "This test is expected to fail. If it passes, the annotation is wrong." | Reported as expected failure. |

From [Platform Development Playbook](https://playbook.platformdev.amdigital.co.uk/Ways-of-Working/Toolkit/Test-Engineering/Best-Practices/Playwright-Test-Automation-Guidelines/):
> "Use test.fixme to mark a test that is known to be failing and requires a fix. Playwright will not run the test and it will be skipped. This should be used in instances where the test logic is fine but the test is failing due to a known defect. There should be a BLI in place to fix this within the next 2 sprints and we are aware a fix is in the works."

**Implications:**
- **`test.skip`** is for intentional non-applicability ("clipboard tests don't run on Safari because Safari's clipboard model differs").
- **`test.fixme`** is for "this SHOULD work; we're not blocking CI on it; someone is going to fix it."
- **`test.fail`** is rare — for known-bugs-we-accept.
- Our current use of `test.skip(browserName === 'webkit', ...)` is semantically questionable because the test SHOULD work on webkit; we just haven't fixed the race. **`test.fixme` is more honest** — but this spec's G3 is to eliminate the annotation entirely.

### Finding: Three approaches to cross-browser incompatibility — skip, filter, fix

**Confidence:** INFERRED (from community patterns across multiple sources)

**Decision tree:**

1. **Fix the root cause** — when the incompatibility is in our code / test logic, not the browser engine.
   - Example: replacing `networkidle` with `domcontentloaded` to remove a race that only affects webkit.
   - Example: exposing a data attribute that all browsers surface identically, replacing timing-dependent DOM polling.
   - **Best outcome.** Zero skips; full cross-browser coverage.

2. **Filter the error** — when the browser engine emits a benign error that our test's error handlers catch unnecessarily.
   - Example: webkit's "access control checks" error during `page.reload` — the error is known-benign (the fetch will retry or the UI doesn't depend on it), we just shouldn't trip on it.
   - Example: our existing WebSocket reconnect filter in `crdt-stress.e2e.ts`.
   - **Acceptable** when the error is idempotent noise. Document the filter with an inline comment.

3. **Skip the test** — when the browser genuinely lacks the capability we're testing.
   - Example: tests of `ClipboardItem.write()` on browsers that don't support it.
   - Example: `test.skip(!isMacOS, 'Cmd key behavior is macOS-only')`.
   - **Last resort.** Use `test.skip` with a clear reason.

4. **`test.fixme`** — when we know a fix is coming.
   - Transitional state; should not linger. If a `test.fixme` sits for 2+ sprints, it graduates to either fix or skip.

**Implications:**
- Our current 3 webkit skips at lines 224, 270, 477 are actually **"fix the root cause"** candidates — the code CAN work on webkit, we just have a race.
- The skip at line 713 (overflow-scroll rendering) is ambiguous — might be "fix the test" (use a more robust delta measurement) or "skip" (webkit's overflow-scroll behaves differently by design). Needs investigation — out of scope for this spec (noted as Future Work in the E2E observability spec).

### Finding: Playwright's `test.use()` can enable per-project skips with a cleaner surface

**Confidence:** CONFIRMED
**Evidence:** [Test class API](https://playwright.dev/docs/api/class-test):

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /accessibility\.e2e\.ts/,  // skip specific files on webkit
    },
  ],
});
```

Or use `test.skip` at describe-level:
```typescript
test.describe('accessibility', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'reason');
  // all tests in this block skip on webkit
});
```

**Implications:**
- `testIgnore` at the project level is file-granular and config-declarative — cleanest when an entire file doesn't apply to a browser.
- `test.skip` at describe level is test-group-granular — used when some tests in a file apply and others don't.
- Per-test `test.skip` is the most granular but also the noisiest.
- **Our pattern should be:** prefer fix → filter → describe-level skip → per-test skip. Always with a written rationale.

### Finding: `test.skip` at the start of a test is the correct placement

**Confidence:** CONFIRMED
**Evidence:** [Test Automation Mastery](https://testautomationmastery.com/mastering-conditional-test-skipping-in-playwright/):
> "One of the most critical aspects of using test.skip() effectively is its placement within your test code. It's essential to place this function at the start of your test, before any other operations or assertions."

**Implications:**
- Skip evaluations should fire as early as possible to avoid partial test setup before the skip triggers.
- For describe-level skips, the `test.skip(condition, reason)` call inside `beforeEach` runs before the beforeEach's body — correct placement.

---

## Negative searches

- Searched for Playwright community data on "what % of tests use skip vs fixme": **NOT FOUND** as a quantitative survey.

---

## Gaps / follow-ups

- Did not benchmark skip vs. filter performance impact (probably negligible; not worth investigating).
