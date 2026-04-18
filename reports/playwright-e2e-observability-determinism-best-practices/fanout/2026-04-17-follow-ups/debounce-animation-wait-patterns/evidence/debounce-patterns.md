---
dimension: Debounce-settled patterns
date: 2026-04-16
sources:
  - https://playwright.dev/docs/test-assertions
  - https://playwright.dev/docs/api/class-clock
  - https://github.com/microsoft/playwright/blob/main/docs/src/clock.md
  - https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs
  - https://www.checklyhq.com/docs/learn/playwright/assertions/
---

# Evidence: Debounce-settled patterns

## Key sources
- [Playwright: Assertions docs](https://playwright.dev/docs/test-assertions) — `expect.poll`, `expect.toPass`, web-first auto-retrying assertions.
- [Playwright: Clock API (class-clock)](https://playwright.dev/docs/api/class-clock) — deterministic browser time control.
- [Playwright: clock.md on GitHub](https://github.com/microsoft/playwright/blob/main/docs/src/clock.md) — primary reference for `install` / `runFor` / `fastForward` / `pauseAt`.
- [TestDouble: Jest timers vs. waitFor for debounced inputs](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs) — quantified 10-100× speedup claim.
- [Checkly: Playwright assertions best practices](https://www.checklyhq.com/docs/learn/playwright/assertions/) — community guidance endorsing web-first assertions over hard waits.

---

## Findings

### Finding: Web-first auto-retrying assertions absorb the debounce window transparently
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/test-assertions

Playwright documents web-first auto-retrying assertions including `toBeVisible()`, `toBeAttached()`, `toHaveText()`, `toContainText()`, `toHaveAttribute()`, `toHaveCSS()`, plus page-level `toHaveURL()` and `toHaveTitle()`. These poll internally until the condition holds or the timeout elapses. When the assertion target is the DOM side-effect of a debounced handler (e.g., the filtered result list), the assertion's internal retry loop naturally waits past the debounce window with no explicit delay. The Playwright docs page does not contain dedicated guidance for "debounced state" — the technique is expressed as: assert the terminal effect, not the intermediate schedule.

**Implications:** The canonical pattern in Playwright is not "wait 300 ms then assert" but "assert the effect with an auto-retrying matcher." The timeout parameter (default 5 s per assertion) absorbs debounce windows an order of magnitude larger without manual math.

---

### Finding: `expect.poll` is the escape hatch when the observable is not a DOM property
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/test-assertions

The docs define `expect.poll` for conditions where no built-in matcher fits:

```javascript
await expect.poll(async () => {
  const response = await page.request.get('https://api.example.com');
  return response.status();
}, {
  message: 'make sure API eventually succeeds',
  timeout: 10000,
}).toBe(200);
```

Custom intervals are supported:

```javascript
await expect.poll(async () => {
  const response = await page.request.get('https://api.example.com');
  return response.status();
}, {
  intervals: [1_000, 2_000, 10_000],
  timeout: 60_000
}).toBe(200);
```

**Implications:** `expect.poll` is the condition-based replacement for `waitForTimeout` when the settled state is a derived computation (network status, an evaluated predicate, a count) rather than a DOM attribute a standard matcher can read. The poll function must be side-effect free and fast to evaluate.

---

### Finding: `expect.toPass` retries a block of assertions as a group
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/test-assertions

```javascript
await expect(async () => {
  const response = await page.request.get('https://api.example.com');
  expect(response.status()).toBe(200);
}).toPass({
  intervals: [1_000, 2_000, 10_000],
  timeout: 60_000
});
```

**Implications:** `toPass` is used when *several* assertions must succeed together — a match for "debounce has settled AND the derived count matches AND the status chip flipped." Each retry re-runs the entire inner block. Cost scales with block complexity; Checkly recommends reserving `toPass` for genuinely complex or flaky scenarios and preferring individual web-first assertions otherwise.

---

### Finding: Playwright's Clock API (v1.45+) replaces wall-clock waits with deterministic time advance
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/api/class-clock, https://github.com/microsoft/playwright/blob/main/docs/src/clock.md

`page.clock.install()` replaces browser time primitives: `Date`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `requestAnimationFrame`, `cancelAnimationFrame`, `requestIdleCallback`, `cancelIdleCallback`, `performance`. Subsequent methods:

- `runFor(ticks)` — "Advance the clock, firing all the time-related callbacks." Accepts ms or "01:00" style strings.
- `fastForward(ticks)` — "Advance the clock by jumping forward in time. Only fires due timers at most once" (models a laptop-lid-close skip).
- `pauseAt(time)` — "Advance the clock by jumping forward in time and pause the time."
- `resume()` — "Resumes timers. Once this method is called, time resumes flowing."
- `setFixedTime(time)` — `Date.now()` / `new Date()` pinned; timers still run.
- `setSystemTime(time)` — "Sets system time, but does not trigger any timers."

For debounced handlers, the canonical flow is: install clock before navigation → perform the user action → `await page.clock.runFor(debounceMs)` → assert the settled state. The debounce callback fires synchronously relative to the test's perceived time.

**Implications:** The Clock API removes both non-determinism and wall-clock delay for debounce tests. Since v1.45 (July 2024), tests no longer have to choose between "set a polling timeout wider than the debounce" and "use a fake timer only in unit tests." Caveat: `install()` must precede navigation or the page can stall during load.

---

### Finding: Fake-timer debounce testing delivers 10-100× speedup in component tests (RTL context)
**Confidence:** CONFIRMED (author's own benchmark; single-vendor data point)
**Evidence:** https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs

TestDouble's article reports "a 10 - 100x improvement in the speed of the tests. The difference? Using `jest.useFakeTimers()`." The recommended configuration pairs fake timers with user-event:

```javascript
jest.useFakeTimers();
const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
// ...
await user.type(input, "Hello");
act(() => {
  jest.advanceTimersByTime(300);
});
```

**Implications:** This pattern is the React Testing Library analogue of Playwright's Clock API and predates it by years. Directly portable idea: advance the clock by exactly the debounce delay rather than polling. Known gotcha: lodash's `debounce` uses recursive `setTimeout`, so `jest.runAllTimers()` can infinite-loop — use `advanceTimersByTime(N)` with a bounded delta (documented in [lodash#2893](https://github.com/lodash/lodash/issues/2893) and [jest#3465](https://github.com/jestjs/jest/issues/3465)).

---

### Finding: Checkly and the broader community frame `waitForTimeout` as the anti-pattern debounce problem
**Confidence:** CONFIRMED
**Evidence:** https://www.checklyhq.com/docs/learn/playwright/assertions/

Checkly's guide says: "When you have page components you want to ensure are loading quickly, or you have page components that you know take some time to load, it's tempting to reach for a hard wait." Their prescription is web-first assertions with built-in 5-second polling. `expect.poll` is recommended "for dynamic content"; `expect.toPass` for "flaky or complex scenarios."

**Implications:** The community-consensus replacement for `waitForTimeout(<debounce-ms>)` is a web-first assertion on the debounce's terminal effect — not an explicit "wait for debounce idle" primitive.

---

## Negative searches

- Searched Playwright docs and GitHub issues for "debounce" as a first-class concept. **NOT FOUND:** Playwright exposes no native "debounce-settled" primitive; the closest is `expect.poll` / web-first assertions + Clock API.
- Searched for "data-debounce-state" or an equivalent community data-attribute convention to signal debounce idle. **NOT FOUND** in Radix UI, shadcn/ui, or Reakit/Ariakit documentation surfaces reached during this research.

## Gaps / follow-ups

- Whether TipTap's suggestion / slash-menu extension exposes a DOM-observable "filter debounced" flag — TipTap docs describe trigger/filter/escape flow but do not document a specific test marker.
- Whether BlockNote, Plate, Milkdown, or Novel.sh editors document a data-attribute convention for "menu has finished filtering." No primary source confirmed during this pass.
