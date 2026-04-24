# Evidence: WebKit Headless Localhost CORS + Page-Lifecycle Quirks

**Dimension:** 6 (webkit headless localhost CORS + page-lifecycle quirks)
**Date:** 2026-04-17
**Sources:** Playwright GitHub issue tracker (open + closed), community threads

---

## Key files / pages referenced

**WebKit-specific (primary citations):**
- [Issue #32429 — Tests with "webkit" fails with Headless mode](https://github.com/microsoft/playwright/issues/32429) — flagship thread, 2024-2026
- [Issue #12975 — WebKit forces HTTPS on localhost](https://github.com/microsoft/playwright/issues/12975)
- [Issue #20124 — how to resolve cors issues on webkit browser](https://github.com/microsoft/playwright/issues/20124)
- [Issue #8279 — Webkit Headless behavior not working as expected](https://github.com/microsoft/playwright/issues/8279)

**Cross-browser CORS context (not WebKit-specific):**
- [Issue #17631 — How to resolve CORS when page.evaluate method executes Javascript](https://github.com/microsoft/playwright/issues/17631) — general CORS question
- [Issue #27903 — Playwright chromium sends an ORIGIN header in headful but not in headless](https://github.com/microsoft/playwright/issues/27903) — Chromium-specific
- [Issue #19904 — setExtraHTTPHeaders + CORS](https://github.com/microsoft/playwright/issues/19904) — **Chromium is the failing browser** in this thread; Firefox and WebKit work fine
- [Issue #4031 — Access-Control-Allow-Origin issue](https://github.com/microsoft/playwright/issues/4031) — Chromium with `--disable-web-security`; not WebKit
- [Issue #2661 — --disable-web-security seems does not work](https://github.com/microsoft/playwright/issues/2661) — Chromium launcher flag; not applicable to WebKit

---

## Findings

### Finding: WebKit headless and headful behave differently for localhost / CORS

**Confidence:** CONFIRMED
**Evidence:** [Issue #32429](https://github.com/microsoft/playwright/issues/32429), 2024-09-03, Playwright 1.46.1:
> "In headless mode, tests are failing" — tests pass with `--headed` but fail in headless.

The submitter's workaround:
```javascript
if (browserName == 'webkit') {
    await page.waitForLoadState("networkidle");
}
```

**Implications:**
- Webkit headless has documented behavior differences from headful that impact test reliability.
- Adding `waitForLoadState("networkidle")` is a common workaround, but this IS the anti-pattern we're trying to move away from (see `networkidle-discouraged.md`).

### Finding: WebKit treats same-origin localhost fetches as a stricter CORS boundary in headless mode

**Confidence:** CONFIRMED for WebKit-specific. Evidence primarily from [Issue #20124](https://github.com/microsoft/playwright/issues/20124) (resolving CORS issues on webkit browser), [Issue #32429](https://github.com/microsoft/playwright/issues/32429) (WebKit headless test failures), and [Issue #12975](https://github.com/microsoft/playwright/issues/12975) (WebKit forces HTTPS on localhost).

**Implications:**
- The failure mode is well-known and documented; the community has repeatedly raised it for WebKit specifically.
- The error wording "access control checks" is webkit's idiomatic CORS rejection message.
- Playwright does not treat this as a Playwright bug — it's webkit engine behavior that Playwright surfaces faithfully.

**Cross-browser context (separate):** Issue #27903 documents a Chromium-specific origin-header difference in headless mode, and Issue #4031 is a Chromium CORS thread. Both are relevant to the broader "CORS behaviors differ across browsers in headless" landscape but don't directly support the WebKit-specific failure mode.

### Finding: Common workarounds in the wild

**Confidence:** CONFIRMED (catalog of approaches documented in threads)

| Workaround | Where used | Notes |
|---|---|---|
| `waitForLoadState('networkidle')` | Issue #32429 reporter | Works but uses discouraged option |
| `page.route()` with CORS headers in response | Issue #17631, #2641 | Requires mocking — not a fit for same-origin real fetches |
| `bypassCSP: true` context option | Multiple issues | Broad hammer; disables all CSP |
| `ignoreHTTPSErrors: true` | Multiple issues | For cert issues, not CORS per se |
| `--disable-web-security` arg | Issue #2661 (Chromium thread) | **Chromium-only flag**; WebKit launcher does not accept arbitrary Chromium args |
| `setExtraHTTPHeaders` for Origin | Issue #19904 | Issue thread reports Chromium as the broken browser — WebKit/Firefox work with extra headers; result is inconclusive for "use to fix WebKit CORS" |
| Filter error in `page.on('pageerror')` | Community pattern | The approach we already use for WebSocket reconnect noise |
| Switch `waitUntil` from `networkidle` to `domcontentloaded` | Community pattern + aligns with Playwright's [DISCOURAGED marker on `networkidle`](https://playwright.dev/docs/api/class-page) | Avoids the race that surfaces the CORS error |

**Implications:**
- `bypassCSP`, `ignoreHTTPSErrors`, and `--disable-web-security` are sledgehammers (and `--disable-web-security` doesn't apply to WebKit at all) — they change the security model across the whole test run.
- The surgical fix is either:
  - (a) Switch `waitUntil` away from `networkidle` so the page-reload doesn't race with the CORS-rejected fetch, OR
  - (b) Filter the specific `'access control checks'` message in `pageerror` listeners, OR
  - (c) Both (defense in depth).
- `setExtraHTTPHeaders` for Origin has browser-dependent behavior — the open issue thread documents Chromium as the failing browser, not WebKit. Don't rely on it as a WebKit fix.

### Finding: No official Playwright-side fix planned

**Confidence:** INFERRED
**Evidence:** [Issue #32429](https://github.com/microsoft/playwright/issues/32429) is open; multiple related issues remain open across multiple versions (1.46 → 1.59+). Maintainer responses (where present) typically redirect to "use waitForLoadState or adjust your test" — not "we'll fix this in the engine."

**Implications:**
- This is a workaround-territory problem, not a waiting-for-upstream problem.
- The spec's G3 fix can land independently; no need to pin on an upstream fix.

### Finding: The `waitUntil: 'networkidle'` interaction with rejected fetches is the real root cause

**Confidence:** INFERRED (from tracing the mechanism)
**Evidence:** Cross-correlation of the issues:
1. `networkidle` waits for 500ms of no network activity ([Page API docs](https://playwright.dev/docs/api/class-page)).
2. A CORS-rejected fetch in WebKit is emitted as a `pageerror` event (Issue #32429) AND may leave an in-flight request that the `networkidle` counter doesn't cleanly terminate.
3. Under `page.reload({ waitUntil: 'networkidle' })`, this creates a timing window where the `pageerror` fires during the wait, the test's listener throws, and the reload is abandoned ("Test ended").

**Implications:**
- Fixing `waitUntil` alone removes the race (the reload completes before the pageerror has a chance to fire inside the reload's synchronous span).
- Fixing the pageerror listener alone filters the error (but leaves the `networkidle` anti-pattern in place).
- Both fixes together = recommended (defense in depth, matches community pattern).

---

## Negative searches

- Searched Playwright changelog for WebKit CORS behavior fix in 2026 releases: **NOT FOUND.** Issue #32429 remains open.
- Searched for a first-party Playwright workaround baked into the framework (context option, project setting): **NOT FOUND.** No official first-class fix.

---

## Gaps / follow-ups

- Did not trace WebKit WPE source code for the exact CORS-check implementation — that's out of depth for this spec (we only need to know the behavior, not the WPE internals).
