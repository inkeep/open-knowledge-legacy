---
name: D5 evidence — Error boundary + Suspense transitions
dimension: Error boundary testing through use(promise) rejections
date: 2026-04-16
sources:
  - https://github.com/bvaughn/react-error-boundary/blob/main/README.md
  - https://react.dev/reference/react/Suspense
  - https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/
  - https://blog.logrocket.com/react-error-handling-react-error-boundary/
---

# Evidence: Error boundary transitions

**Dimension:** When `use(rejectedPromise)` throws into a `react-error-boundary` fallback, what do tests wait for? How do they test the "Try again" reset flow?

## Findings

### Finding: `use(rejectedPromise)` propagates to the nearest Error Boundary
**Confidence:** CONFIRMED
**Evidence:** freecodecamp Modern React Data Fetching Handbook; React docs `use` reference

From the freecodecamp handbook (search extract):
> "The `use()` API lets you read Promises and Context values during render, and it integrates with Suspense and Error Boundaries. If you pass a Promise, React will suspend the component until it resolves. If it rejects, your nearest Error Boundary renders."

**Implications:** The test-observable event is the Error Boundary's fallback DOM rendering. Tests wait on that rendering, not on the promise rejecting at runtime.

### Finding: `react-error-boundary` exposes `resetKeys` + `resetErrorBoundary` as reset mechanisms
**Confidence:** CONFIRMED
**Evidence:** `github.com/bvaughn/react-error-boundary` README

From the README (search extract):
> "`resetKeys` is an array of values that, when changed, will trigger a reset of the error boundary, allowing the error boundary to automatically retry and render the component tree when certain props or state values change."
>
> "An `ErrorFallback` component takes `error` and `resetErrorBoundary` as props, with a button `onClick={resetErrorBoundary}` that displays 'Try again'."

**Implications:** Playwright tests of the retry flow have two paths:
1. **Imperative retry** — click the "Try again" button bound to `resetErrorBoundary`. Test: `await page.getByRole('button', { name: /try again/i }).click()`.
2. **Declarative reset** — change the `resetKeys` value (e.g., navigate away). Test: perform the navigation, assert the error fallback is no longer rendered.

### Finding: The canonical wait pattern is web-first assertions on the fallback, then on the recovered state
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

Pattern (synthesized from the sources):
```ts
// 1. Trigger the failing navigation / action
await page.getByRole('link', { name: 'Broken doc' }).click();

// 2. Wait for the error fallback to appear
await expect(page.getByRole('alert')).toBeVisible();
// or: await expect(page.getByText(/something went wrong/i)).toBeVisible();

// 3. Interact with the retry
await page.getByRole('button', { name: /try again/i }).click();

// 4. Wait for either recovery (new UI) or re-failure (same fallback, possibly with different text)
await expect(page.getByRole('alert')).toBeHidden();
await expect(page.getByRole('main')).toBeVisible();
```

`role="alert"` is the conventional ARIA role for error messages (implicit `aria-live="assertive"`), giving tests a semantic locator. No primary source *mandates* `role="alert"`, but the ErrorFallback examples in `react-error-boundary` and LogRocket blog posts show it being used.

### Finding: Testing the cached-rejection-persistence case is under-documented
**Confidence:** INFERRED (via negative search)
**Evidence:** No primary source describes this specific scenario

A subtle case: if the `use(promise)` cache holds a rejected promise, re-rendering the same component re-throws. Only invalidating the cache entry + re-rendering clears the error. Tests of this cycle:
- Fire error → assert fallback visible
- Click "Try again" (which must invalidate the rejected promise in the app's cache, not just reset the ErrorBoundary) → assert recovery

No primary source found that walks through this pattern end-to-end with Playwright. It exists in app-level patterns but not in the testing literature. Community sources (TanStack Query's `QueryErrorResetBoundary`) solve the analogous problem for queries, not for raw `use(promise)`.

### Finding: `onReset` ordering is load-bearing when retry must invalidate upstream state
**Confidence:** CONFIRMED
**Evidence:** `react-error-boundary` README

From the README pattern:
```jsx
<ErrorBoundary
  FallbackComponent={Fallback}
  onReset={() => {
    // Invalidate upstream state HERE, before state is cleared
  }}
  resetKeys={[someKey]}
>
```

The `onReset` callback fires *before* the error boundary clears its internal error state. For Suspense-backed apps where the promise cache needs invalidation, this ordering matters. A test verifying retry works must therefore verify:
1. The new render doesn't immediately re-throw (implying cache was invalidated).
2. A fresh fetch/promise occurs.

Both conditions collapse to observable DOM in practice — the post-retry UI must appear.

## Gaps / follow-ups

- No Playwright-specific guide on testing `react-error-boundary`'s `FallbackComponent` vs `fallback` vs `fallbackRender` variants.
- No primary source on simulating promise rejections in Playwright to drive Error Boundaries — projects use either network mocking (`page.route()`) or app-level test routes.
