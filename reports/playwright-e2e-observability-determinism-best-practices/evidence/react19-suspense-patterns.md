---
dimension: Follow-up B — React 19 concurrency + Playwright
date: 2026-04-17
sources:
  - react.dev (official docs)
  - github.com/facebook/react
  - playwright.dev
  - github.com/microsoft/playwright
  - developer.mozilla.org
  - tkdodo.eu
  - github.com/bvaughn/react-error-boundary
  - github.com/testing-library/react-testing-library
---

# Evidence: React 19 concurrency primitives + Playwright E2E patterns

**Primary question:** When a React 19 app uses `<Suspense>`, `useTransition` / `isPending`, `use(promise)`, and `<Activity>` to orchestrate navigation, what do Playwright tests wait for?

---

## Findings

### Finding: `startTransition` returns `undefined` — no external completion signal

**Confidence:** CONFIRMED
**Evidence:** [React useTransition reference](https://react.dev/reference/react/useTransition):

> "startTransition function: Lets you mark a state update as a transition."

Returns nothing. The only exposed signal is the `isPending` boolean internal to the calling component. There is no equivalent of a promise resolution, event, or DevTools API that a Playwright test could wait on.

Per the [React Suspense reference](https://react.dev/reference/react/Suspense):

> "During a startTransition-driven update that re-suspends, React preserves the previously-visible content rather than falling back to the skeleton."

**Implication for tests:** "Old content gone, new content shown" assertions must target something unique to the new state, because the old state is intentionally still visible mid-transition.

The idiomatic pattern:

```ts
await page.getByRole('link', { name: 'Next doc' }).click();
await expect(page.getByRole('heading', { name: 'Next doc' })).toBeVisible();
```

Feature request [microsoft/playwright#15660](https://github.com/microsoft/playwright/issues/15660) (2022) for `waitForTransition` remains open and scoped to CSS transitions — no equivalent for React transitions exists in the Playwright API surface.

---

### Finding: Suspense fallback waits — two idiomatic patterns

**Confidence:** CONFIRMED
**Evidence:** Per [Playwright's actionability docs](https://playwright.dev/docs/actionability), web-first assertions (`toBeVisible`, `toBeHidden`, `toBeEnabled`) auto-wait until the condition holds.

Per [MDN role="status"](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role):

> "Elements with `role='status'` have implicit `aria-live='polite'` and `aria-atomic='true'`."

**The [React Suspense reference](https://react.dev/reference/react/Suspense) contains no guidance on ARIA roles for fallbacks — this is an MDN/community convention, not a React prescription.**

Canonical patterns:

```ts
// Pattern A — wait for post-suspend UI
await expect(page.getByRole('main')).toBeVisible();

// Pattern B — wait for fallback to disappear
await expect(page.getByRole('status')).toBeHidden();

// Pattern C — combine aria-busy filter
await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
```

[microsoft/playwright#36233](https://github.com/microsoft/playwright/issues/36233) proposes `getByRole(..., { busy: false })` as a first-class filter but is P3-collecting-feedback.

---

### Finding: React Testing Library Suspense bug is JSDOM-specific; Playwright does not hit it

**Confidence:** CONFIRMED
**Evidence:** [testing-library/react-testing-library#1375](https://github.com/testing-library/react-testing-library/issues/1375):

> "Over 300 tests started to fail because suspended components kept rendering their fallbacks."

This is a JSDOM + `act()` scheduling issue. Playwright runs against real browsers where Suspense resolves naturally. Teams migrating from RTL to Playwright should not expect the bug to carry over.

---

### Finding: `isPending` is testable only when mirrored to DOM

**Confidence:** CONFIRMED
**Evidence:** The [React useTransition docs](https://react.dev/reference/react/useTransition) describe four idiomatic uses of `isPending`: toggling a className, adjusting opacity, disabling a button, or rendering loading text. All produce DOM state. None are standardized — there is no prescribed attribute name.

The MDN-aligned binding is `aria-busy={isPending}`:

```tsx
function Panel() {
  const [isPending, startTransition] = useTransition();
  return <div aria-busy={isPending}>{/* ... */}</div>;
}
```

```ts
// Playwright waits for the transition to finish
await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
```

[React issue #28923](https://github.com/facebook/react/issues/28923) documents a pre-stable React 19 bug where `isPending` didn't flip back to `false` under certain conditions — broader lesson: any test wait bound to component state inherits that state's fragility surface.

**"Wait for transition to both start AND complete" is not a documented pattern.** Negative search — no Playwright issue, blog post, or React guide describes this. Tests that want to verify the transition happened would need custom instrumentation, and no community source recommends this.

---

### Finding: `<Activity mode="hidden">` uses `display: none` — Playwright's defaults already discriminate

**Confidence:** CONFIRMED
**Evidence:** [React 19.2 release notes](https://react.dev/blog/2025/10/01/react-19-2) (released 2025-10-01):

> "Hidden mode uses `display: none`. DOM preservation: child DOM elements remain in the DOM but are hidden. State preservation: React state and internal component state are saved. Effect cleanup: all Effects are cleaned up."

Per Playwright's [actionability docs](https://playwright.dev/docs/actionability):

> "Playwright considers an element as visible if it does not have `visibility:hidden`. Elements of zero size or with `display:none` are not considered visible."

The two collapse cleanly. `getByRole`'s default `includeHidden: false` excludes hidden-Activity mounts automatically.

**Where the default falls short:** multiple Activity mounts sharing the same accessible name (three editor instances with `<textarea aria-label="Document body">`) may trigger Playwright strict-mode violations. The community fallback is a `data-active` wrapper attribute:

```tsx
<Activity mode={isActive ? 'visible' : 'hidden'}>
  <div data-active={isActive ? '' : undefined}>
    {children}
  </div>
</Activity>
```

```ts
await expect(page.locator('[data-active] >> role=textbox[name="Document body"]')).toHaveValue('…');
```

**Subscription-lifecycle caveat:** React Effects pause in hidden mode, not arbitrary application logic. Side effects bypassing React's Effect lifecycle (direct DOM manipulation, CRDT observers wired outside `useEffect`, manual event listeners) continue running in hidden-Activity subtrees.

**StrictMode caveat:** [Activity + StrictMode](https://react.dev/reference/react/Activity) cycles mount/unmount in development to surface cleanup bugs. Tests against a dev build may see extra mount/unmount cycles.

---

### Finding: Error boundary retry ordering is load-bearing

**Confidence:** CONFIRMED
**Evidence:** [react-error-boundary README](https://github.com/bvaughn/react-error-boundary/blob/main/README.md), [freeCodeCamp Modern React Data Fetching Handbook](https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/):

> "The `use()` API lets you read Promises and Context values during render. If it rejects, your nearest Error Boundary renders."
>
> "`resetKeys` is an array of values that, when changed, will trigger a reset of the error boundary."

Canonical Playwright test pattern:

```ts
await page.getByRole('link', { name: 'Broken doc' }).click();
await expect(page.getByRole('alert')).toBeVisible();
await page.getByRole('button', { name: /try again/i }).click();
await expect(page.getByRole('alert')).toBeHidden();
await expect(page.getByRole('main')).toBeVisible();
```

**Load-bearing detail:** `react-error-boundary`'s `onReset` callback fires *before* the boundary clears its internal error state. If the application uses a promise cache for `use(promise)` (module-level `Map<key, Promise>`), `onReset` must invalidate the cached rejected promise — otherwise the next render re-reads the same rejected promise and re-throws. Test that asserts recovery indirectly validates the cache invalidation.

`role="alert"` (implicit `aria-live="assertive"`) is the conventional ARIA role for the error fallback. Neither React nor `react-error-boundary` mandates it; community write-ups use it because it's the semantically correct role.

---

### Finding: React 19 changed parallel Suspense siblings to serial waterfalls

**Confidence:** CONFIRMED
**Evidence:** [TkDodo — React 19 and Suspense: A Drama in 3 Acts](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts):

> "In React 19, sibling components no longer render in parallel when one suspends. The team reasoned that continuing to render siblings of a suspended component 'will block showing the fallback' and wastes computational resources since those render results get discarded anyway."

Tests that previously observed parallel-resolving panels now see serial resolution. Wait-time tolerances may need adjustment.

---

### Finding: `waitForLoadState('networkidle')` hangs on subscription-backed apps

**Confidence:** CONFIRMED
**Evidence:** [microsoft/playwright#19835](https://github.com/microsoft/playwright/issues/19835). WebSockets, SSE, analytics beacons, or health checks keep connections active; apps feeding `use(promise)` from persistent streams never reach network-idle.

---

### Finding: WebKit + Next.js App Router navigation quirks

**Confidence:** CONFIRMED
**Evidence:** [microsoft/playwright#26091](https://github.com/microsoft/playwright/issues/26091) — a `useTransition`-driven form submit under WebKit may fail to navigate in Playwright. Cross-browser matrices need browser-scoped wait tolerances.

---

## Negative searches

- `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` as a Playwright test signal: **NOT FOUND** in any community write-up.
- Testing Activity prerender ("data loaded before navigation"): **NOT FOUND** in primary sources.
- Composed patterns (e.g., Activity flip → `startTransition` → `use(promise)` suspension): **NOT FOUND** — each primitive is documented in isolation.
- Authoritative "this is how you test React 19 concurrency primitives with Playwright" guide: **NOT FOUND** across Playwright issues, React RFC notes, TkDodo, Kent C. Dodds, testing-library discussions, Next.js docs, Remix docs, shadcn-ui examples.

---

## Gaps / follow-ups

- `aria-busy` vs `data-pending` vs className tradeoffs for `isPending` mirror — not empirically compared.
- Interplay between `onReset`, `resetKeys`, and custom promise caches — under-documented in testing contexts.
- `page.screencast` (Playwright 1.59) default encoding parameters not yet published.
