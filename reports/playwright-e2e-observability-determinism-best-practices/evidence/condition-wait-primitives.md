# Evidence: Condition-Wait Primitives — Decision Matrix

**Dimension:** 1 (condition-based waits primitives + decision criteria)
**Date:** 2026-04-17
**Sources:** Playwright docs, BrowserStack, Checkly docs, community guides

---

## Key files / pages referenced

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Actionability / Auto-waiting](https://playwright.dev/docs/actionability)
- [Playwright Locators](https://playwright.dev/docs/locators)
- [Locator API — waitFor method](https://playwright.dev/docs/api/class-locator)
- [BrowserStack — Playwright Wait Types 2026](https://www.browserstack.com/guide/playwright-wait-types)
- [Checkly — Dealing with waits and timeouts](https://www.checklyhq.com/docs/learn/playwright/waits-and-timeouts/)
- [CircleCI — Mastering waits and timeouts](https://circleci.com/blog/mastering-waits-and-timeouts-in-playwright/)
- [Yevhen Laichenkov — 17 Playwright mistakes](https://elaichenkov.github.io/posts/17-playwright-testing-mistakes-you-should-avoid/)
- [LambdaTest — waitForFunction with examples](https://www.lambdatest.com/automation-testing-advisor/javascript/playwright-internal-waitForFunction)

---

## Findings

### Finding: Playwright ships 5 primary wait primitives + built-in auto-wait

**Confidence:** CONFIRMED
**Evidence:** Playwright docs + community guides converge:

| Primitive | When it's right | Auto-wait built in? |
|---|---|---|
| **Web-first assertions** (`expect(locator).toBeVisible()`, `toHaveText`, `toHaveCount`, `toHaveAttribute`, `toHaveValue`, `toBeEnabled`, `toBeChecked`, ...) | The condition matches a built-in assertion shape. **Default choice.** | Yes |
| **`locator.waitFor({ state })`** | Waiting for locator state without asserting a value. States: `'visible'`, `'hidden'`, `'attached'`, `'detached'`. | Yes (explicit) |
| **`expect.poll(fn)`** | Polling a non-DOM condition that the `expect` API can verify (e.g., a value from `page.evaluate` that changes). | Yes (via `toBe` / `toEqual` / etc.) |
| **`page.waitForFunction(fn)`** | Custom page-context JavaScript condition. Returns when `fn` returns truthy. | N/A (it IS the wait) |
| **`page.waitForSelector(sel, { state })`** | (Legacy but supported.) Low-level selector wait. | Yes |
| **`page.waitForURL`** | Navigation target matched. | Yes |
| **`page.waitForResponse`** / **`waitForRequest`** | Specific network event. | Yes |

**Decision tree (community convergence):**

1. If there's a locator + expectation → **web-first assertion** (`expect(locator).toXxx()`).
2. Else if there's a locator + state → **`locator.waitFor({ state })`**.
3. Else if polling a scalar from page context → **`expect.poll(() => page.evaluate(...))`**.
4. Else (custom page-context JS condition with truthy semantics) → **`page.waitForFunction`**.
5. Else (waiting for navigation) → **`page.waitForURL`**.
6. Else (waiting for network) → **`page.waitForResponse` / `waitForRequest`**.
7. Never → **`page.waitForTimeout`** (see `enforcement-mechanisms.md`).

### Finding: Hard waits (`waitForTimeout`) are an explicit anti-pattern

**Confidence:** CONFIRMED
**Evidence:**

- [BrowserStack](https://www.browserstack.com/guide/playwright-wait-types): "Avoid Hard Waits: Avoid `waitForTimeout`. Hard-coded waits are a primary source of flaky and unreliable tests. Only use them for local debugging and not for test code that executes in a CI/CD platform."
- [Yevhen Laichenkov](https://elaichenkov.github.io/posts/17-playwright-testing-mistakes-you-should-avoid/): listed as a canonical Playwright testing mistake.
- [`eslint-plugin-playwright/no-wait-for-timeout`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md): the first-party lint rule against it.

The rule directly bans `waitForTimeout`: its doc title is "Disallow usage of `page.waitForTimeout`" and the "correct code" examples show `waitForLoadState()`, `waitForURL()`, `waitForFunction()` with an inline comment "Use signals such as network events, selectors becoming visible and others instead." The "anti-pattern" framing is community language (not the rule doc's own prose).

**Implications:**
- The community has consensus — this is not a style debate. Hard waits are wrong in CI.
- The refactor direction is from primitive-6 (waitForTimeout) to primitives 1-5 above.

### Finding: Web-first assertions are preferred over `expect.poll` when the shape matches

**Confidence:** CONFIRMED
**Evidence:** [BrowserStack](https://www.browserstack.com/guide/playwright-wait-types):
> "`expect.poll` is useful for polling, but in most cases, web-first assertions like `toHaveText`, `toBeVisible`, etc. are more concise and reliable. If you see `expect.poll` being used to check DOM state that can be done with web-first assertions, consider refactoring it to use web-first assertions instead."

**Implications:**
- `expect.poll` is an escape hatch for non-DOM polling (e.g., reading a value from `page.evaluate` that isn't a locator).
- Code review should push against `expect.poll` for DOM state — it's a signal of "not using the right tool."

### Finding: `locator.waitFor` is for the pre-@playwright/test world or for standalone waits

**Confidence:** CONFIRMED
**Evidence:** BrowserStack + Playwright docs:
> "If you're not using Playwright Test (web-first assertions are only available in @playwright/test) and you want to wait for an element to be visible, use `waitFor`. The button can be waited for using `await button.waitFor()`."

**Implications:**
- In @playwright/test (which we use), `locator.waitFor` is rarely needed — web-first assertions cover most cases.
- Use `locator.waitFor` when you want to wait without asserting (e.g., "before doing X, make sure Y is attached" — but then you often also want to click Y, and the click itself auto-waits).

### Finding: `waitForFunction` is the last resort for true custom conditions

**Confidence:** CONFIRMED
**Evidence:** [BrowserStack](https://www.browserstack.com/guide/playwright-wait-types):
> "Use `waitForFunction` when you need to wait for custom conditions that cannot be handled by built-in wait methods. You can use it to wait for a custom JavaScript condition to become true, which is useful for complex scenarios where element-based waits are not enough."

[LambdaTest](https://www.lambdatest.com/automation-testing-advisor/javascript/playwright-internal-waitForFunction): "`waitForFunction` is the most flexible wait as it allows you to wait for any given condition by executing a JavaScript function in the browser context until a truthy value is returned."

**Implications:**
- `waitForFunction` is the go-to for conditions like "is `window.__activeProvider?.synced === true`?" or "has the slash menu rendered AND is there a listbox-role element with children?"
- It's the right choice for CRDT-sync readiness, editor-state assertions, and any condition that reads non-DOM page state.

---

## Negative searches

- Searched for official Playwright guidance on preferring `expect.poll` over `waitForFunction`: **NOT FOUND** in docs. Community guidance favors web-first assertions over both, with `waitForFunction` ≥ `expect.poll` for truly custom JS conditions.

---

## Gaps / follow-ups

- None for this dimension.
