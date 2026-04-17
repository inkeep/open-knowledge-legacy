---
name: D6 evidence — Anti-patterns and gotchas
dimension: Known anti-patterns in React 19 + Playwright testing
date: 2026-04-16
sources:
  - https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md
  - https://www.checklyhq.com/blog/never-use-page-waitfortimeout/
  - https://github.com/microsoft/playwright/issues/19835
  - https://github.com/microsoft/playwright/issues/22897
  - https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts
  - https://github.com/testing-library/react-testing-library/issues/1375
---

# Evidence: Anti-patterns and gotchas

**Dimension:** What does the community flag as wrong in the React 19 + Playwright space?

## Findings

### Finding: `page.waitForTimeout()` is universally discouraged
**Confidence:** CONFIRMED
**Evidence:** `eslint-plugin-playwright/rules/no-wait-for-timeout`, Checkly blog, multiple guides

From the ESLint rule doc:
> "The `no-wait-for-timeout` rule in `eslint-plugin-playwright` disallows usage of `page.waitForTimeout()`. Hard timeouts are an anti-pattern — they lower performance, increase the chances of a script breaking, and often introduce test flakiness."

From Checkly (`Why You Shouldn't Use page.waitForTimeout()`):
> "The delay has no awareness of what is happening in the browser. It does not wait for elements to render, API calls to complete, or animations to finish. It only waits for a predefined duration, whether the application is ready or not."

This applies doubly to React 19 concurrency — transitions can be instant or take seconds depending on Suspense resolution, so fixed sleeps are either wasteful or insufficient.

**Mitigation:** Web-first assertions (`expect(locator).toBeVisible()`), `locator.waitFor`, `expect.poll`.

### Finding: `waitForLoadState('networkidle')` is flaky for modern React apps
**Confidence:** CONFIRMED
**Evidence:** Playwright issues #19835, #22897, #14132; `browserstack.com/guide/playwright-waitforloadstate`

From Playwright docs / issues (search extracts):
> "`waitForLoadState('networkidle')` is discouraged and can be flaky since network calls happen frequently with reporting calls."
>
> "With Playwright's strict `networkidle`, `page.waitForLoadState('networkidle')` can hang indefinitely when there are persistent connections (WebSockets, SSE, analytics pings, health checks)."
>
> "`networkidle` waits until there are no network connections for at least 500 ms, and there's no way to change this value."

**Implications for React 19 + Suspense apps:**
- Apps with WebSocket-backed subscriptions (Hocuspocus, socket.io, GraphQL subscriptions) that feed `use(promise)` will never reach network-idle.
- Suspense boundaries that resolve from persistent streams don't emit a "done loading" network signal.
- The correct wait is on the DOM consequence of the promise resolving, not on network state.

**Mitigation:** Assert on post-resolution DOM; do not use `networkidle` as a Suspense-resolution proxy.

### Finding: React 19 introduced parallel-sibling-render regression in Suspense; affects test timing
**Confidence:** CONFIRMED
**Evidence:** TkDodo "React 19 and Suspense - A Drama in 3 Acts"

From TkDodo's post (WebFetch extract):
> "In React 19, sibling components no longer render in parallel when one suspends. Instead, React 19 stops rendering siblings once a suspension is detected, creating a 'waterfall' effect for data fetching."
>
> "The team reasoned that continuing to render siblings of a suspended component 'will block showing the fallback' and wastes computational resources since those render results get discarded anyway."

**Implications for testing:**
- Tests that previously saw parallel resolution (e.g., multiple panels rendering simultaneously) may now see serial resolution. Wait patterns that expected a specific order may still pass but for different reasons; tests that asserted on a "partially-loaded" intermediate may no longer reach that state.
- `React.lazy` + Suspense code-splitting now behaves serially too — tests must either preload bundles or tolerate longer wait windows.

### Finding: React Testing Library has a React 19 Suspense-stuck regression
**Confidence:** CONFIRMED
**Evidence:** `github.com/testing-library/react-testing-library/issues/1375`

From the issue (search + fetch extract):
> "Over 300 tests started to fail because of suspended components kept rendering their fallbacks and never their children after upgrading from React 18.3.1 to React 19.0.0."
>
> "Default behavior: Tests using Suspense render only the fallback and never resolve to show child components."

This is an RTL-specific issue (JSDOM + `act()` scheduling). Playwright tests do not hit it because they run against real browsers with real schedulers.

**Implication for Playwright teams:** This is a known pitfall when *migrating* Suspense-bound logic from component tests (RTL) to E2E tests (Playwright). Code that appears broken in RTL may work fine end-to-end — the failure mode is the test infrastructure, not the application.

### Finding: Webkit-specific Next.js App Router navigation bug under Playwright
**Confidence:** CONFIRMED
**Evidence:** `github.com/microsoft/playwright/issues/26091`

Issue title: "[BUG] Webkit does not properly navigate after onSubmit (NextJS App Router)." Reported pattern: a `useTransition` in a search form doesn't complete its router navigation under Playwright Webkit. Workaround discussions mention timing / waiting for specific DOM.

**Implications:** Webkit is a known weaker spot for concurrent-navigation tests. Cross-browser test matrices may need browser-scoped wait tolerances.

### Finding: No `locator.waitForTransition()` primitive (React or CSS)
**Confidence:** CONFIRMED
**Evidence:** `github.com/microsoft/playwright/issues/15660` — open feature request since 2022

Absence of a primitive is itself the gotcha: tests combining Suspense fallback transitions with CSS transitions must assert on steady-state DOM, not on transition lifecycle.

### Finding: No `busy` option on `getByRole` (yet)
**Confidence:** CONFIRMED
**Evidence:** `github.com/microsoft/playwright/issues/36233` — open feature request

A `getByRole('cell', { busy: false })` filter does not exist. Teams that want to select "the loaded row, not the skeleton" must use `.locator('[aria-busy="false"]')` or scope queries differently. This is a completeness gap, not a correctness gap.

### Finding: "Wait for transitions to complete" has no community best-practice write-up
**Confidence:** INFERRED (via negative search)
**Evidence:** Searches for "React 19 Playwright transition", "Suspense Playwright test pattern", "useTransition Playwright e2e" returned generic Playwright wait guides, React API docs, and tangentially-related blog posts — but no authoritative "here's the pattern" canonical source.

**The state of the art as of 2026-04:**
- React 19 stable released late 2024; React 19.2 (Activity) released 2025-10-01.
- Playwright and testing-community content has not converged on a named pattern for "test through a React concurrency primitive."
- The de facto pattern is: "assert on the post-state DOM with a web-first assertion; trust Playwright's auto-wait to cover the transition window."

This absence is the most important finding of this fanout: **the React 19 + Playwright testing space is underdocumented as of April 2026**. Teams must compose primitives and test against observable DOM outcomes rather than framework-internal concurrency events.

## Gaps / follow-ups

- Whether the absence will persist into React 20 / Playwright 1.5x is uncertain — a formal pattern may emerge as Activity adoption grows.
- `getByRole({ busy })` support would materially improve this story if/when it lands.
