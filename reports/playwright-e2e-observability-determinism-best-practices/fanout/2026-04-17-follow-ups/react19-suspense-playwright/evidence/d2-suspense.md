---
name: D2 evidence — Suspense fallback waits
dimension: Testing through Suspense fallbacks
date: 2026-04-16
sources:
  - https://react.dev/reference/react/Suspense
  - https://playwright.dev/docs/actionability
  - https://playwright.dev/docs/api/class-locator
  - https://github.com/testing-library/react-testing-library/issues/1375
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy
---

# Evidence: Testing through Suspense fallbacks

**Dimension:** When a test navigates and the target suspends on `use(promise)`, the skeleton renders. What wait pattern gets the test to the POST-suspend state?

## Key pages referenced

- `react.dev/reference/react/Suspense` — fallback timing
- `playwright.dev/docs/actionability` — web-first assertions auto-wait on visibility/enabled
- `playwright.dev/docs/api/class-locator` — `locator.waitFor({state:'visible'|'hidden'})`
- `github.com/testing-library/react-testing-library/issues/1375` — RTL + React 19 Suspense divergence
- MDN `role="status"` and `aria-busy` references

## Findings

### Finding: Web-first assertions on post-suspend content are the canonical pattern
**Confidence:** CONFIRMED
**Evidence:** `playwright.dev/docs/actionability`; cross-referenced in Checkly and BrowserStack guides

Per Playwright's actionability doc (search result excerpt):
> "Playwright performs a range of actionability checks on elements before making actions to ensure these actions behave as expected, auto-waiting for all relevant checks to pass before performing the requested action."
>
> "To wait for an element to become visible, it's recommended to use Playwright's `toBeVisible` assertions. `toBeVisible`, `toBeEnabled`, `toBeChecked` and many more included assertions are asynchronous and wait for the elements to reach a certain state."

The pattern: locate a DOM node that only exists in the resolved state (e.g. `page.getByRole('main')` or a content heading) and use `expect(locator).toBeVisible()`. Playwright polls until the node appears — implicitly covering the full Suspense resolution.

**Implications:** No Suspense-specific API is needed *when* the post-suspend UI has a uniquely-identifiable selector.

### Finding: Waiting for the fallback to become hidden is an explicit alternative
**Confidence:** CONFIRMED
**Evidence:** `playwright.dev/docs/api/class-locator` + Next.js Playwright guide excerpts

From search extract:
> "If you need to wait for a status element to disappear, you can use Playwright's assertions: `expect(page.getByRole(...)).toBeHidden()`."
>
> Next.js testing guide pattern: `await expect(loader).toBeHidden({ timeout: 5000 })` to wait up to 5 seconds for a loading spinner.

`locator.waitFor({ state: 'hidden' })` and `expect(locator).toBeHidden()` both poll and succeed once the element is not visible. This is appropriate when the fallback has a distinct selector (e.g. `role="status"`, a skeleton class) and the post-suspend UI selector is ambiguous or shares structure.

### Finding: `role="status"` + `aria-busy` is the accessibility-native fallback signal
**Confidence:** CONFIRMED
**Evidence:** MDN `role="status"` and `aria-busy` references

From MDN (search extract):
> "Elements with the role `status` have an implicit `aria-live` value of `polite` and an implicit `aria-atomic` value of `true`. This makes `role="status"` ideal for displaying status messages and loading states."
>
> "The `aria-busy` attribute is a global ARIA state that indicates whether an element is currently being modified and helps assistive technologies understand that changes to the content are not yet complete."

An accessible Suspense fallback annotated `role="status" aria-busy="true"` is:
1. A screen-reader-friendly loading announcement, AND
2. A deterministic test signal — `page.getByRole('status')` locates it; `toBeHidden()` verifies completion.

**Caveat:** React's official Suspense docs do NOT recommend specific ARIA roles for fallbacks. Per the WebFetch of `react.dev/reference/react/Suspense`:
> "The documentation does NOT recommend specific ARIA roles such as `role="status"`, `aria-busy`, or `aria-live`. The provided documentation contains no accessibility guidance for fallback content."

So the pattern exists as a cross-community convention (MDN, adopted by RTL users, not prescribed by React).

### Finding: Playwright currently lacks a `busy` option on `getByRole`
**Confidence:** CONFIRMED
**Evidence:** `github.com/microsoft/playwright/issues/36233` (feature request, open as of search)

From the issue (WebFetch extract):
> "The requester wants to be able to filter role-based locators by their busy state, enabling test code like `.getByRole('cell', {busy: false})`. This would allow targeting elements that have finished loading (when `aria-busy` transitions from true to false)."

Workaround: combine `getByRole` with a CSS attribute selector, or use `locator.filter()` / `expect.poll`:
```ts
await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
// or
await expect(page.getByRole('status')).toBeHidden();
```

### Finding: RTL's React 19 Suspense fallback-stuck bug is React-side, not browser-side
**Confidence:** CONFIRMED (as scope clarification)
**Evidence:** `github.com/testing-library/react-testing-library/issues/1375`

From the issue (WebFetch extract):
> "Over 300 tests started to fail because of suspended components kept rendering their fallbacks and never their children after upgrading from React 18.3.1 to React 19.0.0."
>
> "Default behavior: Tests using Suspense render only the fallback and never resolve to show child components. With `act()` wrapper: the component unsuspends, but then prevents assertions against the fallback state."

**Implications:** This is a JSDOM + `act()` scheduling issue specific to RTL. Playwright tests run against a real browser with a real scheduler — Suspense resolves naturally as promises settle. The Playwright equivalent of this bug does not exist.

## Gaps / follow-ups

- No canonical "wait for specific Suspense boundary N among many" pattern found — the community solution is simply selector-specificity (pick a selector inside the boundary you care about).
- Whether `networkidle` is reliable for Suspense resolution is contested (see D6 anti-patterns file).
