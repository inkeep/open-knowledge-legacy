---
name: D4 evidence — Activity mount/unmount testing
dimension: React 19.2 Activity testing
date: 2026-04-16
sources:
  - https://react.dev/reference/react/Activity
  - https://react.dev/blog/2025/10/01/react-19-2
  - https://github.com/facebook/react/releases/tag/v19.2.0
  - https://github.com/reactjs/rfcs/issues/128
---

# Evidence: `<Activity>` mount/unmount testing

**Dimension:** How do tests distinguish "content exists but is hidden-Activity mounted" vs "active mount"? Any data-attribute conventions?

## Findings

### Finding: `<Activity mode="hidden">` renders children with `display: none` — DOM present, styled invisible
**Confidence:** CONFIRMED
**Evidence:** `react.dev/reference/react/Activity`

From the official Activity reference (WebFetch extract):
> "**Hidden mode (`mode="hidden"`)**:
> - Visual hiding: Uses `display: none` CSS property
> - DOM preservation: Child DOM elements remain in the DOM but are hidden
> - State preservation: React state and internal component state are saved
> - Effect cleanup: All Effects are cleaned up (components are conceptually unmounted)
> - Re-rendering: Children still re-render in response to new props at lower priority
> - No output for text-only components: `<Activity mode="hidden"><TextComponent /></Activity>` produces no DOM output since there's no element to apply visibility to"

React 19.2 was released 2025-10-01 per `react.dev/blog/2025/10/01/react-19-2` and the GitHub release `v19.2.0`.

**Implications:** A browser test can distinguish hidden vs visible Activity mounts via computed style (`display: none`), layout (`getBoundingClientRect()` returns 0/0, `offsetParent === null`), or ARIA tree membership — all of which are natural Playwright signals (`toBeVisible()` fails for `display:none` elements by default).

### Finding: Playwright's default visibility checks already discriminate hidden Activity
**Confidence:** CONFIRMED
**Evidence:** `playwright.dev/docs/actionability`

From search extract:
> "Playwright considers an element as visible if it does not have the attribute `visibility:hidden`. Elements of zero size or with `display:none` are not considered visible."
>
> "By default, `getByRole` ignores elements that are hidden or disabled. Use `includeHidden: true` only when testing elements that are intentionally not visible."

An `<Activity mode="hidden">` subtree automatically satisfies `toBeHidden()` and is excluded from `getByRole` default matching. A test that asserts `expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible()` will match the *active* mount and ignore hidden-Activity duplicates of the same role — without any explicit data-attribute convention.

**Caveat:** If duplicate accessible names exist across multiple Activity mounts, role locators may still hit strict-mode violations. Scope queries with `locator.filter()` or an explicit active-mount wrapper attribute.

### Finding: React does not provide data attributes or DevTools APIs identifying Activity state
**Confidence:** CONFIRMED (via negative search)
**Evidence:** `react.dev/reference/react/Activity` — no `data-*` or ARIA attribute documented

The Activity reference contains no prescribed attribute like `data-activity-mode`. Community write-ups (LogRocket, Medium) demonstrate user-authored attributes (`<div data-activity-child>...`) but these are example-code conventions, not framework-emitted.

**Implications:** Projects wanting explicit "active vs hidden Activity" selectors must add their own attribute at the wrapper:
```jsx
<Activity mode={isActive ? 'visible' : 'hidden'}>
  <div data-activity-mode={isActive ? 'visible' : 'hidden'}>
    ...
  </div>
</Activity>
```
This is a project-local convention; no primary source recommends a standard attribute name.

### Finding: Effects-unmount in hidden mode is a testing semantic, not a DOM semantic
**Confidence:** CONFIRMED
**Evidence:** `react.dev/reference/react/Activity` + GitHub RFC #128

From the Activity reference:
> "When hidden: Effects are cleaned up — their cleanup functions run. Subscriptions are cancelled. Timers/listeners are removed."
>
> "When becoming visible: Effects are re-created. Subscriptions are re-established. Component state is restored."

From RFC #128 (Deferred unmounting, search extract):
> "The Activity component lets you hide and later restore a component, preserving the internal state of its child components. Conceptually, the children are unmounted, but React saves their state for later."

**Implications for Playwright:**
- Subscriptions that wrote to Y.js docs, WebSockets, or timers are torn down in hidden mode — a test asserting a subscription-driven side effect can rely on "hidden means stopped."
- DOM state (input values, textarea contents, scroll position) is *preserved* in hidden mode because the DOM node isn't unmounted. A test asserting `textarea` value across a hide/reveal cycle sees the preserved value.
- **Gotcha:** Non-React side effects that bypass React's Effect lifecycle (Y.js observers, direct DOM manipulation) may continue running in hidden mode — because React Effects are what pause, not application logic. The React 19.2 docs highlight subscriptions won't be active for hidden parts, but that applies to Effect-wrapped subscriptions specifically.

### Finding: `<StrictMode>` eagerly cycles Activity mount/unmount in development
**Confidence:** CONFIRMED
**Evidence:** `react.dev/reference/react/Activity`

From the Activity docs:
> "Use `<StrictMode>` to catch problematic Effects. StrictMode will eagerly perform Activity mount/unmount cycles to reveal side effects that aren't properly cleaned up."

**Implications for Playwright:** Tests running against a StrictMode-wrapped tree in dev builds may see additional mount/unmount cycles that production won't. If a test fails only in dev, Activity + StrictMode is a suspect.

### Finding: Testing Activity in Playwright is under-documented as of search date
**Confidence:** INFERRED
**Evidence:** Negative search — `playwright + Activity` searches returned Playwright component-testing docs, not Activity-specific content

No blog posts, Playwright issues, or community guides surfaced that specifically target Activity testing. React 19.2 was released 2025-10-01; the ecosystem hasn't produced indexed best-practices content yet (as of searches run 2026-04-16). The practical implication: projects testing Activity today are composing from first principles on top of `display:none`/`aria-hidden` primitives.

## Gaps / follow-ups

- No primary source found on "how to test that Activity prerender actually loaded data before user navigation." The expected pattern would be `expect(page.getByText(...)).toBeAttached()` (visible-or-hidden match) combined with a later `toBeVisible()` — but this is theoretical, not documented.
- The interaction of Activity with `<ViewTransition>` (also 19.2) and its testing story is likewise uncharted.
