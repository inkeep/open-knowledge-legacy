---
title: "React 19 Concurrency Primitives + Playwright: What Tests Wait For"
description: "Factual survey of community patterns for waiting through React 19's startTransition, Suspense, use(promise), and Activity in Playwright E2E tests. Documents present-state primitives, conventions, and the gap where a named pattern is absent."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - React 19
  - React 19.2
  - Playwright
  - react-error-boundary
  - React Testing Library
topics:
  - E2E testing
  - concurrency primitives
  - Suspense
  - transitions
  - test determinism
---

# React 19 Concurrency Primitives + Playwright: What Tests Wait For

**Purpose:** When a React 19 app uses `<Suspense>`, `useTransition` / `isPending`, `use(promise)`, and `<Activity>` to orchestrate navigation, what do Playwright tests wait for to verify navigation completed? This report surveys the community conventions, primitives, and documentation gaps — a factual baseline for downstream spec work on E2E observability.

---

## Executive Summary

**The honest headline: the React-19-concurrency + Playwright testing space has no named pattern as of April 2026.** React stable 19 shipped late 2024; React 19.2 (Activity) shipped 2025-10-01. Neither the Playwright community nor the React team has published a canonical "here's how you test through these primitives" guide. The community has instead converged on a composition: **assert on the post-state DOM with web-first assertions and trust Playwright's auto-wait** — because that's what React's concurrency primitives ultimately resolve into.

This works because React 19's concurrency model, despite internal complexity, surfaces externally only as DOM changes over time. `startTransition` returns nothing and provides no external completion callback. `isPending` lives in component state and is only visible if bound to a DOM attribute. `use(promise)` resolves into real DOM via the normal render pipeline. `<Activity mode="hidden">` uses plain `display: none`. **Every concurrency primitive eventually collapses to "observable DOM state," which is exactly Playwright's contract.**

The gaps that matter:

1. **No Playwright `waitForTransition` / `waitForSuspense` / `busy: false` primitive exists.** Open feature requests (microsoft/playwright#15660, #36233) remain unlanded.
2. **`waitForLoadState('networkidle')` is an anti-pattern** for apps with persistent subscriptions (WebSockets, streams) that feed `use(promise)` — the network never idles.
3. **React Testing Library's React 19 Suspense bug (issue #1375)** is JSDOM-specific. Playwright's real-browser context does not hit it; teams migrating from RTL to Playwright should expect this divergence.
4. **No documented convention exists for exposing `isPending` as a Playwright-observable signal.** Projects that want one must bind `isPending` to an `aria-busy` attribute or a `data-*` attribute themselves.

**Key Findings:**
- **`startTransition` completion is not externally observable**: tests must wait for post-transition DOM, not for the transition itself.
- **Suspense fallbacks are Playwright-ready via `toBeHidden()`**: `role="status"` + `aria-busy` is the MDN-aligned convention, though React's own Suspense docs do not prescribe ARIA roles.
- **`isPending` becomes testable only when mirrored to the DOM**: `aria-busy={isPending}` is the semantic mirror; data attributes are equivalent.
- **`<Activity mode="hidden">` is already discriminated by Playwright**: `display: none` makes `toBeVisible()` / `getByRole` skip hidden mounts automatically.
- **Error boundary retries test as ordinary UI flows**: click "Try again", assert post-retry DOM. `role="alert"` is the conventional (not mandated) fallback role.
- **The React 19 + Playwright space is underdocumented**: the absence of a named pattern is itself the most important finding for downstream work.

---

## Research Rubric

| Dimension | Depth | Non-goals |
|---|---|---|
| D1 — Waiting for `startTransition` completion | Deep | |
| D2 — Testing through `<Suspense>` fallbacks | Deep | |
| D3 — `isPending` as a test signal | Moderate | |
| D4 — `<Activity>` mount/unmount testing | Deep | |
| D5 — Error boundary transitions | Moderate | |
| D6 — Anti-patterns and gotchas | Moderate | Per-test docName isolation, bridge-convergence fuzzing, Playwright-vs-other comparison, mobile/iOS, 1P Open Knowledge codebase analysis |

---

## Detailed Findings

### D1 — Waiting for `startTransition` Completion

**Finding:** React exposes no external "transition complete" signal. Playwright tests wait for an observable DOM consequence of the transition resolving — usually the new post-transition UI.

**Evidence:** [evidence/d1-starttransition.md](evidence/d1-starttransition.md)

Per the [React useTransition reference](https://react.dev/reference/react/useTransition), `startTransition` returns `undefined`; the only exposed signal is the `isPending` boolean internal to the calling component. There is no equivalent of a promise resolution, event, or DevTools API that a Playwright test could wait on.

Per the [React Suspense reference](https://react.dev/reference/react/Suspense), during a `startTransition`-driven update that re-suspends, React **preserves the previously-visible content** rather than falling back to the skeleton. This means tests that assert "old content gone, new content shown" must target something *unique to the new state*, because the old state is intentionally still visible mid-transition.

The Playwright community does not have a `locator.waitForTransition()` primitive; a feature request ([microsoft/playwright#15660](https://github.com/microsoft/playwright/issues/15660)) from 2022 remains open and is scoped to CSS transitions anyway. No alternative primitive for React transitions exists in the Playwright API surface.

**The idiomatic pattern:** fire the action, call a web-first assertion on a selector unique to the post-transition state. Playwright's auto-wait covers the transition window implicitly.

```ts
await page.getByRole('link', { name: 'Next doc' }).click();
await expect(page.getByRole('heading', { name: 'Next doc' })).toBeVisible();
```

**Decision triggers:**
- If your post-transition UI lacks a unique selector (e.g., it's a different document in the same editor shell), you must either add one or wait on a disappearing transition indicator.
- If the transition keeps old content visible for > assertion timeout, the default timeout may fail before React swaps.

**Remaining uncertainty:** No primary source found for "how to wait on a `startTransition` that re-suspends inside a long-running promise." The pattern is app-specific.

---

### D2 — Testing Through `<Suspense>` Fallbacks

**Finding:** Two idiomatic patterns exist: (a) `expect(post-suspend-locator).toBeVisible()` and (b) `expect(fallback-locator).toBeHidden()`. The `role="status"` + `aria-busy` ARIA convention gives the fallback a deterministic locator — but React's own Suspense docs do not prescribe specific ARIA roles.

**Evidence:** [evidence/d2-suspense.md](evidence/d2-suspense.md)

Per [Playwright's actionability docs](https://playwright.dev/docs/actionability), web-first assertions (`toBeVisible`, `toBeHidden`, `toBeEnabled`) auto-wait until the condition holds. For Suspense, this is sufficient — the fallback is plain DOM, and the post-suspend children are plain DOM, both observable via standard locators.

Per [MDN role="status"](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role), elements with `role="status"` have implicit `aria-live="polite"` and `aria-atomic="true"` — a natural fit for Suspense fallbacks. Combined with `aria-busy="true"`, the fallback becomes both screen-reader-friendly and deterministically locatable via `page.getByRole('status')` or `page.locator('[aria-busy="true"]')`.

Notably, the [React Suspense reference](https://react.dev/reference/react/Suspense) contains **no guidance on ARIA roles for fallbacks** — this is an MDN/community convention, not a React prescription.

Playwright has an open feature request ([microsoft/playwright#36233](https://github.com/microsoft/playwright/issues/36233)) for `getByRole(..., { busy: false })` that would make this pattern first-class. Until it lands, tests use:

```ts
// Pattern A — wait for post-suspend UI
await expect(page.getByRole('main')).toBeVisible();

// Pattern B — wait for fallback to disappear
await expect(page.getByRole('status')).toBeHidden();

// Pattern C — combine aria-busy filter
await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
```

**Important scope clarification:** The [React Testing Library + React 19 Suspense bug](https://github.com/testing-library/react-testing-library/issues/1375) (reporter: "over 300 tests started to fail because suspended components kept rendering their fallbacks") is a JSDOM + `act()` scheduling issue. Playwright runs against real browsers where Suspense resolves naturally. Teams migrating from RTL to Playwright should not expect the bug to carry over.

**Decision triggers:**
- Annotate the Suspense fallback with `role="status"` + `aria-busy="true"` if you want a deterministic and accessibility-aligned wait target.
- Pattern A is robust when the post-suspend UI is uniquely identifiable; Pattern B is more robust under dynamic post-suspend structure.

---

### D3 — `isPending` as a Test Signal

**Finding:** `isPending` is React-internal. It becomes Playwright-observable only when the component mirrors it to a DOM attribute (`aria-busy`, `data-pending`, className, etc.). No framework-level DevTools hook or global export exists.

**Evidence:** [evidence/d3-ispending.md](evidence/d3-ispending.md)

The [React useTransition docs](https://react.dev/reference/react/useTransition) describe four idiomatic uses of `isPending`: toggling a className, adjusting opacity, disabling a button, or rendering loading text. All produce DOM state. None are standardized — there is no prescribed attribute name.

The MDN-aligned binding is `aria-busy={isPending}` on the transition-affected region, which serves both assistive technology and test determinism:

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

[React issue #28923](https://github.com/facebook/react/issues/28923) documents a bug where `isPending` didn't flip back to `false` under certain conditions in a pre-stable React 19 revision. The broader lesson: any test wait bound to component state inherits that state's fragility surface. Waiting on *post-transition content* is more robust than waiting on *the transition ending*.

**"Wait for transition to both start AND complete" is not a documented pattern.** Negative search — no Playwright issue, blog post, or React guide describes this. Tests that want to verify the transition actually happened (not merely that the end state matches) would need custom instrumentation, and no community source recommends this.

**Decision triggers:**
- If you need a deterministic pending-state wait, bind `isPending` to `aria-busy` at the enclosing region.
- If you just need to wait for completion, prefer web-first assertions on the post-state DOM (more robust).

---

### D4 — `<Activity>` Mount/Unmount Testing

**Finding:** React 19.2's `<Activity mode="hidden">` uses `display: none` on the children. Playwright's default visibility semantics already discriminate it: `toBeVisible()` matches the active mount, `getByRole` skips hidden mounts, and `toBeHidden()` confirms the hidden mount. No data-attribute convention is needed for basic discrimination — though projects with duplicate accessible names across mounts may want one.

**Evidence:** [evidence/d4-activity.md](evidence/d4-activity.md)

Per the [React Activity reference](https://react.dev/reference/react/Activity) and the [React 19.2 release notes](https://react.dev/blog/2025/10/01/react-19-2) (released 2025-10-01):

> "Hidden mode uses `display: none`. DOM preservation: child DOM elements remain in the DOM but are hidden. State preservation: React state and internal component state are saved. Effect cleanup: all Effects are cleaned up."

Per Playwright's visibility contract ([actionability](https://playwright.dev/docs/actionability)):

> "Playwright considers an element as visible if it does not have `visibility:hidden`. Elements of zero size or with `display:none` are not considered visible."

The two collapse cleanly: an `<Activity mode="hidden">` subtree is treated as hidden by Playwright's built-in locator semantics. `getByRole`'s default `includeHidden: false` excludes hidden-Activity mounts from role queries automatically.

**Where the default falls short:** when multiple Activity mounts share the same accessible name (e.g., three editor instances all containing `<textarea aria-label="Document body">`), Playwright's strict-mode locator may still match multiple nodes — some hidden, some visible — and raise a strict-mode violation. The community has no canonical convention for this case. Project-level conventions observed in community write-ups (LogRocket, Medium):

```tsx
<Activity mode={isActive ? 'visible' : 'hidden'}>
  <div data-active={isActive ? '' : undefined}>
    {children}
  </div>
</Activity>
```

```ts
// Scope to the active mount
await expect(page.locator('[data-active] >> role=textbox[name="Document body"]')).toHaveValue('…');
```

**Subscription-lifecycle caveat:** React Effects are what pause in hidden mode, not arbitrary application logic. Side effects that bypass React's Effect lifecycle (direct DOM manipulation, CRDT observers wired outside `useEffect`, manual event listeners) continue running in hidden-Activity subtrees. Tests that assume "hidden means quiesced" must verify the pause mechanism is Effect-based.

**StrictMode caveat:** [Activity + StrictMode](https://react.dev/reference/react/Activity) intentionally cycles mount/unmount in development to surface cleanup bugs. Tests against a dev build may see extra mount/unmount cycles that don't occur in production.

**The ecosystem is early.** Searches for "Playwright + Activity" return Playwright component-testing docs and generic visibility guides — no Activity-specific testing write-ups surfaced as of 2026-04-16. This is expected for a feature released six months earlier.

**Decision triggers:**
- For apps with unique selectors per active mount, Playwright's default behavior is sufficient.
- For apps with duplicated selectors across Activity mounts, add a project-level `data-active` attribute to the wrapper.
- For apps relying on "hidden means paused," audit whether subscriptions are Effect-scoped.

---

### D5 — Error Boundary Transitions

**Finding:** When `use(rejectedPromise)` throws, the nearest Error Boundary renders its fallback. Tests wait on that fallback DOM. The "Try again" retry flow tests as an ordinary click interaction — but the retry must invalidate any rejected-promise cache, or the boundary re-throws on re-render.

**Evidence:** [evidence/d5-error-boundary.md](evidence/d5-error-boundary.md)

Per the [react-error-boundary README](https://github.com/bvaughn/react-error-boundary/blob/main/README.md) and the [freeCodeCamp Modern React Data Fetching Handbook](https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/):

> "The `use()` API lets you read Promises and Context values during render. If it rejects, your nearest Error Boundary renders."
>
> "`resetKeys` is an array of values that, when changed, will trigger a reset of the error boundary."

The canonical Playwright test pattern:

```ts
await page.getByRole('link', { name: 'Broken doc' }).click();

// Wait for the error fallback
await expect(page.getByRole('alert')).toBeVisible();

// Interact with "Try again"
await page.getByRole('button', { name: /try again/i }).click();

// Assert recovery (or re-failure, if deterministic)
await expect(page.getByRole('alert')).toBeHidden();
await expect(page.getByRole('main')).toBeVisible();
```

`role="alert"` is the conventional ARIA role for the error fallback (implicit `aria-live="assertive"`). Neither React nor `react-error-boundary` *mandates* it; community write-ups use it because it's the semantically correct role.

**The load-bearing detail:** `react-error-boundary`'s `onReset` callback fires *before* the boundary clears its internal error state. If the application uses a promise cache for `use(promise)` (a module-level `Map<key, Promise>` or similar), `onReset` must invalidate the cached rejected promise — otherwise the next render re-reads the same rejected promise and re-throws. This is app-layer concern; Playwright tests surface it only as "retry doesn't recover." A test that asserts recovery after clicking "Try again" indirectly validates the cache invalidation.

**Decision triggers:**
- Use `role="alert"` on your ErrorFallback for deterministic locator and accessibility alignment.
- If "Try again" doesn't recover in tests, suspect `onReset` ordering or missing cache invalidation.

---

### D6 — Anti-Patterns and Gotchas

**Finding:** Four concrete anti-patterns apply specifically to React 19 + Playwright; one broad gotcha dominates.

**Evidence:** [evidence/d6-anti-patterns.md](evidence/d6-anti-patterns.md)

#### A1 — `page.waitForTimeout()` is banned
Enforced by [`eslint-plugin-playwright/no-wait-for-timeout`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md) and echoed by [Checkly](https://www.checklyhq.com/blog/never-use-page-waitfortimeout/). Fixed sleeps are unaware of browser state and guaranteed to be either wasteful or insufficient. For React 19 apps, where transition duration depends on Suspense resolution, the gap is worse.

#### A2 — `waitForLoadState('networkidle')` is flaky for subscription-backed apps
Per [Playwright issue #19835](https://github.com/microsoft/playwright/issues/19835) and Playwright's own docs, `networkidle` hangs when WebSockets, SSE, analytics beacons, or health checks keep connections active. Apps that feed `use(promise)` from persistent streams **never reach network-idle**. Wait on DOM consequences, not on network state.

#### A3 — Migrating Suspense tests from RTL to Playwright will surface false failures
The [RTL React 19 Suspense bug (#1375)](https://github.com/testing-library/react-testing-library/issues/1375) keeps components stuck on fallbacks. This is JSDOM + `act()` specific; Playwright's real-browser scheduling does not exhibit it. Failures in RTL after a React 19 upgrade may resolve cleanly when lifted to Playwright.

#### A4 — React 19 turned parallel Suspense siblings into serial waterfalls
Per [TkDodo's "React 19 and Suspense - A Drama in 3 Acts"](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts):

> "In React 19, sibling components no longer render in parallel when one suspends. The team reasoned that continuing to render siblings of a suspended component 'will block showing the fallback' and wastes computational resources since those render results get discarded anyway."

Tests that previously observed parallel-resolving panels now see serial resolution. Wait-time tolerances may need adjustment. `React.lazy` code-splits are affected too — tests must preload or tolerate longer waits.

#### A5 — Webkit + Next.js App Router navigation quirks
Per [Playwright issue #26091](https://github.com/microsoft/playwright/issues/26091), a `useTransition`-driven form submit under Webkit may fail to navigate in Playwright. Cross-browser matrices need browser-scoped wait tolerances.

#### The dominant broad gotcha: there is no named pattern
Across all searches (Playwright issues, React RFC notes, TkDodo, Kent C. Dodds, testing-library discussions, Next.js docs, Remix docs, shadcn-ui examples), **no authoritative source publishes a "this is how you test through React 19 concurrency primitives with Playwright" guide** as of April 2026. The de facto pattern is "assert on post-state DOM, trust Playwright's auto-wait." Primitives compose; patterns are app-specific. **Teams building on React 19 concurrency in Playwright-tested systems should expect to author their own conventions** and not rely on a canonical community playbook.

---

## Limitations & Open Questions

### Dimensions covered at moderate depth where deeper coverage could help

- **D3 isPending mirroring conventions:** the `aria-busy` vs `data-pending` vs className tradeoffs are not empirically compared in any source found. The MDN-aligned choice (`aria-busy`) has accessibility benefits; the data-attribute choice has simpler selector semantics.
- **D5 Error boundary cache invalidation:** the interplay between `onReset`, `resetKeys`, and custom promise caches is under-documented in testing contexts specifically.

### Dimensions where community evidence is genuinely absent (NOT FOUND)

- **Testing Activity prerender "data loaded before navigation":** no primary source describes how to verify prerender actually warmed a subtree before the user navigated. The theoretical pattern (`toBeAttached()` then later `toBeVisible()`) is not documented.
- **Playwright wait patterns that combine multiple concurrency primitives:** e.g., an Activity flip that fires a `startTransition` that suspends on `use(promise)`. Each primitive is documented in isolation; no composed pattern is published.
- **React DevTools hook as a Playwright signal:** theoretically possible via `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` but found no community usage for tests.

### Out of scope (per rubric)

- Per-test docName isolation, bridge-convergence fuzz, Playwright-vs-Cypress, mobile/iOS, Open Knowledge codebase analysis.

---

## References

### Evidence Files
- [evidence/d1-starttransition.md](evidence/d1-starttransition.md) — waiting for `startTransition` completion
- [evidence/d2-suspense.md](evidence/d2-suspense.md) — Suspense fallback waits
- [evidence/d3-ispending.md](evidence/d3-ispending.md) — `isPending` as test signal
- [evidence/d4-activity.md](evidence/d4-activity.md) — `<Activity>` mount/unmount
- [evidence/d5-error-boundary.md](evidence/d5-error-boundary.md) — Error boundary transitions
- [evidence/d6-anti-patterns.md](evidence/d6-anti-patterns.md) — Anti-patterns and gotchas

### External Sources

**React official:**
- [React 19.2 blog post](https://react.dev/blog/2025/10/01/react-19-2)
- [useTransition reference](https://react.dev/reference/react/useTransition)
- [startTransition reference](https://react.dev/reference/react/startTransition)
- [Suspense reference](https://react.dev/reference/react/Suspense)
- [Activity reference](https://react.dev/reference/react/Activity)
- [React 19.2.0 GitHub release](https://github.com/facebook/react/releases/tag/v19.2.0)
- [React issue #28923 — isPending stuck](https://github.com/facebook/react/issues/28923)
- [Deferred unmounting RFC #128](https://github.com/reactjs/rfcs/issues/128)

**Playwright:**
- [Playwright actionability](https://playwright.dev/docs/actionability)
- [Playwright Locator API](https://playwright.dev/docs/api/class-locator)
- [Playwright assertions](https://playwright.dev/docs/test-assertions)
- [microsoft/playwright#15660 — waitForTransition feature request](https://github.com/microsoft/playwright/issues/15660)
- [microsoft/playwright#36233 — busy option on getByRole](https://github.com/microsoft/playwright/issues/36233)
- [microsoft/playwright#19835 — networkidle hangs on persistent connections](https://github.com/microsoft/playwright/issues/19835)
- [microsoft/playwright#26091 — Webkit Next.js App Router navigation bug](https://github.com/microsoft/playwright/issues/26091)
- [eslint-plugin-playwright/no-wait-for-timeout](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md)

**Accessibility (MDN):**
- [aria-busy attribute](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)
- [role="status"](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role)

**Community:**
- [TkDodo — React 19 and Suspense: A Drama in 3 Acts](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts)
- [react-error-boundary README](https://github.com/bvaughn/react-error-boundary/blob/main/README.md)
- [React Testing Library issue #1375 — Suspense stuck on React 19](https://github.com/testing-library/react-testing-library/issues/1375)
- [Checkly — Why You Shouldn't Use page.waitForTimeout()](https://www.checklyhq.com/blog/never-use-page-waitfortimeout/)
- [freeCodeCamp — Modern React Data Fetching Handbook](https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/)
