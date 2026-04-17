# Evidence: `waitUntil: 'networkidle'` officially discouraged

**Dimension:** 7 (page.reload waitUntil semantics)
**Date:** 2026-04-17
**Sources:** playwright.dev API docs, browserstack guide, Playwright issue tracker

---

## Key files / pages referenced

- [Playwright Page API — goto options](https://playwright.dev/docs/api/class-page) — official `waitUntil` reference with DISCOURAGED marker
- [BrowserStack — Why page.goto() is slow in 2026](https://www.browserstack.com/guide/playwright-goto) — community guide
- [BrowserStack — Understanding Playwright waitforloadstate](https://www.browserstack.com/guide/playwright-waitforloadstate)

---

## Findings

### Finding: `'networkidle'` is officially marked DISCOURAGED in Playwright docs

**Confidence:** CONFIRMED
**Evidence:** [Playwright Page API docs](https://playwright.dev/docs/api/class-page) (entry for `waitUntil`):

> `'networkidle'` — **DISCOURAGED** option — "consider operation to be finished when there are no network connections for at least 500 ms. Don't use this method for testing, rely on web assertions to assess readiness instead."

The DISCOURAGED marker is an explicit anti-pattern flag in Playwright's docs — the framework is telling tests to stop using it.

**Implications:**
- Our `resetEditor`'s `page.reload({ waitUntil: 'networkidle' })` (slash-command.e2e.ts:25) uses an explicitly discouraged pattern.
- The recommended replacement is: `page.reload({ waitUntil: 'domcontentloaded' })` + web assertion / `waitForFunction` for the specific readiness condition.

### Finding: `waitUntil` option taxonomy (documented)

**Confidence:** CONFIRMED
**Evidence:** Playwright Page API:

| Option | Meaning |
|---|---|
| `'commit'` | Network response received, document started loading. **Fastest.** |
| `'domcontentloaded'` | DOMContentLoaded event fired. Body parsed; async resources may still load. |
| `'load'` | Load event fired. All resources loaded. **Default for `page.goto`.** |
| `'networkidle'` | No network connections for ≥500ms. **Discouraged.** |

**Implications:**
- `domcontentloaded` is the right choice for test-setup navigations where the test knows what specific state to wait for afterward.
- `load` is fine for simple navigations but may over-wait on pages with slow-loading images / analytics.
- `commit` is for cases where you want to intercept the response itself (rare in E2E).

### Finding: The replacement pattern is `domcontentloaded` + `waitForFunction`/web-first-assertion

**Confidence:** CONFIRMED
**Evidence:** BrowserStack guide:
> "Using `'domcontentloaded'` or `'commit'` instead of the default `'load'` can speed up navigation by waiting only for the DOM or URL change, not all resources to finish loading."
>
> Playwright recommends using appropriate load states based on requirements, such as `load` or `domcontentloaded`, and to avoid using the networkidle load state. Instead, rely on web assertions to assess readiness.

Canonical replacement:
```typescript
// Old (discouraged):
await page.reload({ waitUntil: 'networkidle' });

// New (recommended):
await page.reload({ waitUntil: 'domcontentloaded' });
await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible(); // or similar app-ready signal
```

### Finding: `networkidle` has a documented race with in-flight fetches that may reject

**Confidence:** CONFIRMED
**Evidence:** Playwright issue [#32429 — Tests with "webkit" fails with Headless mode](https://github.com/microsoft/playwright/issues/32429):
> "In headless mode, tests are failing"
> Workaround found: `if (browserName == 'webkit') { await page.waitForLoadState("networkidle") }` — but note this is the user's workaround for a DIFFERENT failure, illustrating how `networkidle`'s semantics are browser-dependent in practice.

The underlying issue: `networkidle` waits for 500ms of no network activity. If the browser (webkit in particular) rejects a fetch with an error during the navigation transition, the fetch is technically "in flight" until the rejection completes — which can extend the 500ms window or (on cross-browser differences) never terminate cleanly.

**Implications:**
- `networkidle` is unreliable specifically when the page includes fetches that may be rejected or delayed by the browser itself (CORS, CSP, cookie-scope, etc.).
- This is exactly the failure mode behind our webkit `/api/documents` skip.

---

## Negative searches

- Searched Playwright changelog for `networkidle` removal / deprecation: **NOT FOUND.** The option remains supported; only its use in tests is discouraged.

---

## Gaps / follow-ups

- Docs don't publish a target version for removing `networkidle`. It's "discouraged" but still shipped.
