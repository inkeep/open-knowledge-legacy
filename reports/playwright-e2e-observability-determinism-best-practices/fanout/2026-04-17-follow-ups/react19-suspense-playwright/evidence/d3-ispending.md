---
name: D3 evidence — isPending as a test signal
dimension: isPending as a Playwright wait signal
date: 2026-04-16
sources:
  - https://react.dev/reference/react/useTransition
  - https://github.com/facebook/react/issues/28923
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy
  - https://playwright.dev/docs/api/class-locator
---

# Evidence: `isPending` as a Playwright wait signal

**Dimension:** Does the community use `isPending` (via data-attribute, `aria-busy`, or DevTools hook) as a Playwright wait signal?

## Findings

### Finding: `isPending` is React-internal; browsers see only what the component renders
**Confidence:** CONFIRMED
**Evidence:** `react.dev/reference/react/useTransition`

From the React reference (WebFetch extract):
> "`isPending` switches to `true` at the first call to `startTransition()`. Stays `true` until all Actions complete and the final state is shown. Returns `false` when the Transition is complete."
>
> "The `isPending` flag is the only signal available to the calling component."

`isPending` lives in React component state. There is no global runtime API, DevTools hook, or window export that surfaces it. Playwright can only observe it if the component *renders* something derived from it.

### Finding: The community pattern is binding `isPending` to an observable DOM attribute
**Confidence:** CONFIRMED
**Evidence:** `react.dev/reference/react/useTransition` + search results

React's own docs show idiomatic pending-state renderings:
```jsx
if (isPending) return <b className="pending">{children}</b>;
// or
<section style={{ opacity: isPending ? 0.7 : 1 }}>
// or
<button disabled={isPending}>Submit</button>
// or
{isPending ? "🌀 Updating..." : value}
```

Per the search result on Next.js + useTransition: `isPending` state is used to conditionally render a loading spinner, which a Playwright selector like `page.locator('[data-pending]')` can wait on.

**Implications:** The canonical test-friendly pattern is for the component to emit a data attribute, class, or ARIA attribute that mirrors `isPending`, e.g. `<div data-pending={isPending ? '' : undefined}>` or `<div aria-busy={isPending}>`.

### Finding: `aria-busy` is the semantic-web-aligned mirror
**Confidence:** CONFIRMED
**Evidence:** MDN `aria-busy` reference

From MDN (search extract):
> "`aria-busy` indicates whether an element is currently being modified. When multiple parts of a live region need to be loaded before changes are announced, set `aria-busy="true"` until loading is complete, then set to `aria-busy="false"`."

An `aria-busy={isPending}` attribute on a transition-affected region gives both a screen-reader signal and a Playwright wait target:
```ts
await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
```

However, React's `useTransition` docs do NOT recommend `aria-busy` explicitly — the binding is an app-layer convention, not a framework prescription.

### Finding: `isPending` can get stuck under some conditions
**Confidence:** CONFIRMED
**Evidence:** `github.com/facebook/react/issues/28923`

Filed bug: "[React 19] useTransition()'s pending state does not go back to false." This was observed pre-stable React 19. Implications for testing: if a test relies on `isPending` flipping back to `false` and the component's promise never resolves (or resolves in a way React can't detect), the test wait will time out. This is the same fragility surface as any state-bound test signal.

### Finding: "Wait for transition to have BOTH started and completed" is not a documented primitive
**Confidence:** NOT FOUND
**Evidence:** Negative search — no community write-up describes a "wait until `isPending` was true and is now false" pattern

Searched:
- Playwright GitHub issues for `useTransition`, `isPending`, `startTransition`
- Blog posts, TkDodo, Kent C. Dodds
- React Testing Library issues

Nothing prescribes "verify the transition actually happened by observing the pending→idle cycle." Community practice collapses to "assert the post-transition UI." If the transition is instant and never visibly flips `isPending`, tests don't notice — because the post-transition UI is what they check.

This is consistent with the Playwright philosophy: assert on observable user-visible outcomes, not on framework-internal state.

## Gaps / follow-ups

- No evidence of projects exposing `isPending` through a React DevTools hook or `window.__REACT_TEST_HOOK__` for tests. This would be a custom instrumentation choice and not documented in any primary source found.
- No primary source on whether `expect.poll(() => page.evaluate(() => /* read React fiber */))` is used in practice — it's theoretically possible but nobody writes about it (likely considered overreach).
