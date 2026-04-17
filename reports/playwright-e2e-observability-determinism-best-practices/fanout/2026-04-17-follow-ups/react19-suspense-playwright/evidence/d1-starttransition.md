---
name: D1 evidence — startTransition completion
dimension: Waiting for startTransition completion
date: 2026-04-16
sources:
  - https://react.dev/reference/react/useTransition
  - https://react.dev/reference/react/startTransition
  - https://react.dev/reference/react/Suspense
  - https://github.com/microsoft/playwright/issues/15660
---

# Evidence: Waiting for `startTransition` completion

**Dimension:** When `startTransition(() => setState(x))` fires and a Suspense boundary re-suspends, what do Playwright tests wait for?

## Key pages referenced

- `react.dev/reference/react/useTransition` — official `useTransition` reference
- `react.dev/reference/react/startTransition` — top-level `startTransition` API
- `react.dev/reference/react/Suspense` — fallback semantics under transitions
- `github.com/microsoft/playwright/issues/15660` — `locator.waitForTransition()` feature request (CSS transitions, not React)

## Findings

### Finding: React provides no external "transition complete" signal
**Confidence:** CONFIRMED
**Evidence:** `react.dev/reference/react/useTransition`

From the React reference docs (WebFetch extract):
> "The `startTransition` function **does not return anything**. You cannot await or check if a Transition is complete outside the component that calls `useTransition`. The `isPending` flag is the only signal available to the calling component."

`startTransition` does not return a promise. The only completion signal React exposes is the `isPending` boolean transitioning from `true` → `false`, which is internal to the component calling `useTransition`.

**Implications:** Playwright cannot "await a transition" directly. Tests must wait for an *observable DOM consequence* of the transition completing — typically either (a) the new UI appearing, or (b) a bound `isPending` indicator disappearing.

### Finding: During a `startTransition`, previously-visible content stays visible
**Confidence:** CONFIRMED
**Evidence:** `react.dev/reference/react/Suspense`

From the Suspense reference (WebFetch extract):
> "If Suspense was displaying content for the tree, but then it suspended again, the `fallback` will be shown again unless the update causing it was caused by `startTransition` or `useDeferredValue`."
>
> "With startTransition — prevents unwanted fallback. React waits for enough data to load, keeps existing content visible while new content loads, only shows fallbacks for newly rendered Suspense boundaries."

**Implications:** Asserting on "old content visible" is ambiguous during a transition — the old content is *intentionally* still there while the next render resolves. Tests must assert on something unique to the *new* rendered state, not on the old one going away.

### Finding: Playwright has no `waitForTransition` primitive; the React case is downstream
**Confidence:** CONFIRMED
**Evidence:** `github.com/microsoft/playwright/issues/15660`

The feature request opened by @janosh (March 2022) asks for `locator.waitForTransition()` but is scoped to CSS transitions. `waitForElementState('stable')` is noted as insufficient when elements stay in place during transitions. The issue text does not mention React transitions, and the fetched page did not reveal community workarounds for the React case.

**Implications:** The React-transition wait pattern is not an indexed Playwright API concept. Tests compose it from existing primitives (`locator.waitFor`, `expect(locator).toBeVisible()`, `expect.poll`).

### Finding: The documented community pattern is "wait for the post-transition UI element"
**Confidence:** INFERRED
**Evidence:** Multiple sources cross-referenced; no single canonical write-up

Synthesis from search results:
- Playwright's Next.js testing guide (`nextjs.org/docs/pages/guides/testing/playwright`) shows `page.waitForURL()` + assertions on new-page content, not any transition-level wait.
- Checkly / BrowserStack guides uniformly recommend web-first assertions (`expect(locator).toBeVisible()`) auto-wait until the new UI appears.
- The React docs' own transition patterns (pending="🌀 Updating…", `opacity: isPending ? 0.7 : 1`) produce DOM-observable state *during* the transition, but the "done" state is just "new UI is now rendered."

**Implications:** The standard pattern is: fire the action, assert on the new UI via a web-first assertion. No transition-specific primitive needed *if* the new UI has a distinguishable selector.

## Gaps / follow-ups
- No primary source found that prescribes "how to wait through a `startTransition` that re-suspends" as a named pattern. It's solved *ad hoc* per app.
- No evidence of a `__REACT_DEVTOOLS_GLOBAL_HOOK__`-based wait pattern surfacing in the Playwright community — React DevTools is a debugging surface, not a test API.
