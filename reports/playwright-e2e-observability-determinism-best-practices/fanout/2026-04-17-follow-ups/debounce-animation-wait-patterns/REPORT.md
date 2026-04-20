---
title: "Playwright Wait Patterns for Debounced, Animated, and Composed-Event UI State"
description: "Factual survey of community-established Playwright patterns for deterministic waits on three hard-to-wait-for UI state categories: debounced state updates, animation completion, and composed-event settling. Covers expect.poll, Clock API, getAnimations().finished, transitionend, data-state / aria-busy / aria-activedescendant conventions, and animation disabling mechanisms."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Playwright
  - Radix UI
  - Framer Motion
  - TipTap
  - React Testing Library
topics:
  - e2e testing
  - deterministic waits
  - animation testing
  - debounce testing
  - accessibility attributes
---

# Playwright Wait Patterns for Debounced, Animated, and Composed-Event UI State

**Purpose:** Provide an evidence-backed factual baseline for three hard-to-wait-for UI state categories in Playwright E2E tests — state that settles via debounce, state that settles via animation, and state that settles through a cascade of composed event handlers. Intended input for the parent report's G1 decision to replace `waitForTimeout` with condition-based waits.

---

## Executive Summary

Across the sources surveyed, the Playwright community has converged on a small set of primitives for each category. None of them are "wait for debounce idle" or "wait for animation done" as a single native API; instead, the patterns compose the library's web-first auto-retry semantics with the browser's own state surfaces (DOM attributes, Web Animations API, ARIA attributes) and — as of 1.45 — a fake-clock primitive.

**Key findings:**

- **Debounce:** The canonical replacement for `waitForTimeout(<debounce-ms>)` is an auto-retrying web-first assertion on the debounce's *terminal DOM effect*. When no DOM effect is readable via a built-in matcher, `expect.poll` with a returned value is the documented fallback. For fully deterministic control, Playwright's [Clock API](https://playwright.dev/docs/api/class-clock) (since v1.45) replaces browser time primitives — `install()` + `runFor(ms)` advances the debounce synchronously, matching the pattern React Testing Library users have had with `jest.useFakeTimers()` for years (reported 10-100× speedup by [TestDouble](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs)).
- **Animation:** Playwright's [built-in `stable` actionability check](https://playwright.dev/docs/actionability) auto-waits for layout-affecting animations ("maintained the same bounding box for at least two consecutive animation frames") but *does not* cover visual-only animations (opacity, color, filter). The community-recommended primitive for that case is `element.getAnimations({ subtree: true })` + `Promise.all(a.finished)` — a Web Animations API pattern that covers CSS transitions, CSS animations, and WAAPI calls uniformly. `transitionend`/`animationend` event listeners are the pre-WAAPI alternative. `toHaveCSS` on the terminal style value is the most Playwright-native form when the final computed value is predictable.
- **Composed events:** The consensus pattern is "assert the terminal observable only" rather than enumerating intermediate steps. For keyboard-driven menus (slash menus, comboboxes, autocompletes), `aria-activedescendant` and `aria-selected` on options are the W3C APG-standardized terminal observables and settle after the full cascade (open + filter + reposition + highlight). `aria-busy="false"` is the ARIA convention for "subtree stable again." `expect.poll` with a composite predicate is the documented fallback when no single attribute captures the full state.
- **Data-attributes:** [Radix UI's `data-state="open"|"closed"` convention](https://www.radix-ui.com/primitives/docs/guides/animation) is the de-facto React headless-library standard, applied consistently to every stateful part (Root, Trigger, Content, Header). It is *not* a cross-library "ready/loading/error" state machine — each library (React-Aria, Headless UI, Ariakit) defines its own per-component vocabulary. The only truly portable "subtree-settling" signal is the W3C's `aria-busy`; a Playwright feature request ([#36233](https://github.com/microsoft/playwright/issues/36233)) to add `getByRole({ busy: false })` is open but P3.
- **Animation disabling:** Three layered mechanisms exist: per-screenshot (`toHaveScreenshot({ animations: 'disabled' })` — fast-forwards finite, cancels infinite), per-context (`page.emulateMedia({ reducedMotion: 'reduce' })` or `use: { reducedMotion: 'reduce' }` in config — requires app CSS to honor the media query), and app-level (`MotionGlobalConfig.skipAnimations` for Framer Motion; build-flag stubs for the nuclear option). The accepted split is: disable animations for visual-regression tests; keep animations enabled and wait per-animation for correctness tests, because animation behavior is part of the contract being tested.

---

## Research Rubric

| # | Dimension | Depth |
|---|-----------|-------|
| 1 | Debounce-settled patterns | Deep |
| 2 | Animation-completion patterns | Deep |
| 3 | Composed-event settling | Deep |
| 4 | Signal exposure via data-attributes | Moderate |
| 5 | Animation disabling in tests | Moderate |

**Stance:** Factual (not recommendation-forming). Evidence is third-party only. No 1P codebase analysis.

---

## Detailed Findings

### Dimension 1: Debounce-settled patterns

**Finding:** Playwright exposes no "debounce-settled" primitive; the three community-established patterns are (a) a web-first auto-retrying assertion on the debounce's terminal DOM effect, (b) `expect.poll` with a returned value when the observable is not a DOM attribute, and (c) the Clock API (v1.45+) for deterministic time advance.

**Evidence:** [evidence/debounce-patterns.md](evidence/debounce-patterns.md)

**Pattern A — auto-retry on the terminal effect:**

```javascript
await searchInput.fill('hello');
await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
// no explicit wait; toHaveCount polls through the debounce
```

Works when the debounce's settled output is a DOM-readable property ([text](https://playwright.dev/docs/test-assertions), [count](https://playwright.dev/docs/test-assertions), [attribute](https://playwright.dev/docs/test-assertions)). Default timeout (5 s) absorbs debounce windows an order of magnitude wider than typical (200-500 ms) without parameter tuning.

**Pattern B — `expect.poll` for derived state:**

```javascript
await expect.poll(async () => {
  return await page.evaluate(() => window.__searchStore.resultsReady);
}, { timeout: 10_000 }).toBe(true);
```

Documented in the [Playwright assertions docs](https://playwright.dev/docs/test-assertions). `expect.poll`'s `intervals` option supports back-off strategies (`intervals: [1_000, 2_000, 10_000]`).

**Pattern C — Clock API for deterministic time:**

```javascript
await page.clock.install();
await page.goto('/search');
await searchInput.fill('hello');
await page.clock.runFor(300); // advance past 300ms debounce
await expect(listbox).toBeVisible();
```

The [Clock docs](https://playwright.dev/docs/api/class-clock) enumerate the mocked primitives: `Date`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `requestAnimationFrame`, `cancelAnimationFrame`, `requestIdleCallback`, `cancelIdleCallback`, `performance`. `install()` must run before navigation or the page may stall during load.

**Implications:**
- Pattern A is the default and rarely needs anything more. Pattern B handles derived-state cases (e.g., a MobX/Zustand/Redux store flag). Pattern C is the escape hatch when (i) the debounce interacts with other time-sensitive logic you need to isolate, or (ii) wall-clock waits cause unacceptable test-duration cost.
- [TestDouble's RTL benchmark](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs) ("10 - 100x improvement in the speed of the tests") is a single-vendor data point from the Jest/RTL world but motivates the same arithmetic in Playwright's Clock API — advancing time by `300 ms` of simulated clock is cheaper than polling for 300 ms of real time.
- Known lodash hazard: `_.debounce` uses recursive `setTimeout`, so unbounded `runAllTimers()` can infinite-loop ([lodash#2893](https://github.com/lodash/lodash/issues/2893)). Use bounded `runFor(N)` with N = debounce delay.

**Decision triggers:**
- If debounce windows are comfortably under the test timeout and tests are fast enough today, Pattern A is sufficient.
- If debounce tests are dominating wall-clock test time, adopt Pattern C selectively on the slowest files.

---

### Dimension 2: Animation-completion patterns

**Finding:** Playwright's actionability `stable` check handles layout-animated elements automatically; for visual-only animations (opacity, color, transform), the community primitives are `getAnimations().finished`, `transitionend`/`animationend` listeners, and `toHaveCSS` on terminal values.

**Evidence:** [evidence/animation-patterns.md](evidence/animation-patterns.md)

**The built-in `stable` check** ([actionability docs](https://playwright.dev/docs/actionability)): "An element is considered stable when it has maintained the same bounding box for at least two consecutive animation frames." Applied automatically to `click`, `check`, `hover`, `screenshot`. [Issue #4055](https://github.com/microsoft/playwright/issues/4055) was filed in 2020 specifically because `stable` does not cover opacity/color/filter transitions — the bounding box doesn't change during a fade.

**Pattern A — `getAnimations().finished`:**

```javascript
await menu.evaluate(el =>
  Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished))
);
```

Covers CSS transitions, CSS animations, and WAAPI calls uniformly (per [MDN: Element.getAnimations](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations)). Gotcha: returns empty array if no animation is running; must be sequenced *after* the animation is known to have started (e.g., after `data-state="open"` flips).

**Pattern B — `transitionend` / `animationend` with fallback:**

```javascript
await page.$eval('.modal', el => new Promise(resolve => {
  el.addEventListener('transitionend', resolve, { once: true });
  setTimeout(resolve, 2000); // fallback if event doesn't fire
}));
```

The [Playwright #4055 issue](https://github.com/microsoft/playwright/issues/4055) recommends this workaround. Single-property, event-specific; the fallback exists because `transitionend` does not fire if the transition is pre-empted or the start/end values are equal. Superseded by Pattern A when WAAPI is available.

**Pattern C — `toHaveCSS` on terminal value:**

```javascript
await expect(modal).toHaveCSS('opacity', '1');
await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
```

Most Playwright-native. Requires predicting the terminal computed value — fine for `opacity: 1` or the identity transform; brittle for matrix strings driven by responsive units. The [Green Report's Playwright animation guide](https://www.thegreenreport.blog/articles/automating-animation-testing-with-playwright-a-practical-guide/automating-animation-testing-with-playwright-a-practical-guide.html) documents this pattern alongside a `waitForFunction` variant polling `getComputedStyle`.

**Pattern D — `toHaveScreenshot({ animations: 'disabled' })`:** Per the [page-assertions docs](https://playwright.dev/docs/api/class-pageassertions), "finite animations are fast-forwarded to completion, so they'll fire `transitionend` event. Infinite animations are canceled to initial state, and then played over after the screenshot." Applies only inside the screenshot assertion — not a general-purpose wait.

**Implications:**
- For any Playwright codebase, Pattern A (WAAPI `.finished`) is the most general — a single expression covers transitions, animations, and JS-driven motion. Ship it as a test helper once and reuse.
- Pattern C is the idiomatic form when the test already knows the terminal value; it also fails with a better error message (expected `opacity: 1`, got `opacity: 0.6`) than a generic "animation didn't finish."
- Issue [#4055](https://github.com/microsoft/playwright/issues/4055) (open since 2020, P3-collecting-feedback) is the persistent signal that no first-party `waitForAnimation` is planned; teams need to own the primitive.

---

### Dimension 3: Composed-event settling

**Finding:** The community pattern is to pick the *terminal observable* in the cascade and assert on it — not to enumerate intermediate steps. For menu-style cascades, `aria-activedescendant` and `aria-selected` (from the W3C Combobox pattern) are the standard terminals. `aria-busy="false"` is the ARIA-native "subtree done updating" signal. `expect.poll` with a composite predicate is the fallback for genuinely multi-dimensional state.

**Evidence:** [evidence/composed-event-patterns.md](evidence/composed-event-patterns.md)

**Template — slash menu / combobox:**

```javascript
await input.pressSequentially('/h1');
// terminal observable after: open → filter → reposition → highlight
await expect(combobox).toHaveAttribute('aria-activedescendant', 'option-heading-1');
```

Per [MDN: aria-activedescendant](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant), the attribute "identifies the currently active element when focus is on a composite widget, combobox, textbox, group, or application." The [W3C ARIA Authoring Practices Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) mandates that it reference the highlighted option's `id`. When filter or selection changes, the attribute updates — *after* the full cascade.

**Template — region that updates multiple things:**

```javascript
await expect(region).toHaveAttribute('aria-busy', 'false');
```

MDN documents `aria-busy` as indicating "an element is currently being modified" so assistive tech can wait. The app-side contract: set `aria-busy="true"` at the start of the cascade, flip to `false` when every subscriber has reported in. Testing Library's `getByRole` already supports `{ busy: false }` as a first-class filter; Playwright [issue #36233](https://github.com/microsoft/playwright/issues/36233) proposes the same but is P3-collecting-feedback. Today the explicit attribute assertion is the accepted form.

**Template — composite state, no single terminal:**

```javascript
await expect.poll(async () => {
  const [open, active, count] = await Promise.all([
    menu.getAttribute('data-state'),
    combobox.getAttribute('aria-activedescendant'),
    options.count(),
  ]);
  return { open, active, count };
}).toEqual({ open: 'open', active: 'option-h1', count: 3 });
```

Reserved for genuine compound conditions. Most slash-menu tests don't need this — a single `aria-activedescendant` assertion subsumes "menu open, filter ran, highlight moved."

**Implications:**
- TipTap's [Suggestion utility docs](https://tiptap.dev/docs/editor/api/utilities/suggestion) describe the trigger / filter / close flow but expose no TipTap-provided test-state marker (the popup UI is integrator-owned). Tests rely on whatever the integrator's dropdown library exposes — Tippy.js's `data-state="visible"`, Floating UI's positioning class, or `aria-activedescendant` on the editor's content-editable root.
- `requestIdleCallback` and `queueMicrotask` flushes are *not* recommended community primitives for settling. The Playwright Clock mocks rIC but only for deterministic time advance, not for settling checks. Tests wait on the DOM state, not the event-loop queue.

**Decision triggers:**
- If the app already emits ARIA attributes conformant to the W3C APG, tests have a terminal observable for free. If not, introducing `aria-activedescendant` gives both accessibility and testability with one change.
- Reach for `expect.poll` composite only when three or more independent effects must all land and no existing DOM attribute captures the AND.

---

### Dimension 4: Signal exposure via data-attributes

**Finding:** [Radix UI's `data-state`](https://www.radix-ui.com/primitives/docs/guides/animation) is the dominant React headless-library convention for component state (`"open"|"closed"`, `"checked"|"unchecked"|"indeterminate"`, etc.) applied to every stateful part. It is *not* a cross-library "ready/loading/error" state-machine standard — each library defines its own vocabulary. The only portable "subtree settled" signal across libraries is the W3C's `aria-busy`.

**Evidence:** [evidence/data-attribute-conventions.md](evidence/data-attribute-conventions.md)

**Radix convention (per-component attribute reference).** The [Accordion docs](https://www.radix-ui.com/primitives/docs/components/accordion) show:

| Part | Attributes |
|------|-----------|
| Root | `[data-orientation]: "vertical" \| "horizontal"` |
| Item / Header / Trigger / Content | `[data-state]: "open" \| "closed"`, `[data-disabled]`, `[data-orientation]` |

CSS variables expose computed dimensions: `--radix-accordion-content-width`, `--radix-accordion-content-height`.

**Playwright assertion form:**

```javascript
await expect(trigger).toHaveAttribute('data-state', 'open');
```

**Timing subtlety.** Radix's `data-state` is the *lead indicator* of a state change, not the trail indicator. It flips when the state machine transitions, *before* the animation plays. Radix's internal `Presence` component keeps the element mounted through `data-state="closed"` so the unmount animation runs to completion. For tests, this means `data-state="open"` asserts that the state machine has opened the component, but CSS transitions may still be mid-run. Pairing `data-state` with `getAnimations().finished` is the clean sequence for "opened AND animation done."

**Cross-library comparison:**

| Library | Disclosure attribute | State machine attribute |
|---|---|---|
| Radix Primitives | `data-state="open"\|"closed"` | Same, plus `"checked"\|"unchecked"\|"indeterminate"` |
| Headless UI (Tailwind Labs) | `data-headlessui-state="open"`, `data-open`, `data-closed` | Per-component |
| React-Aria | `aria-expanded`, `data-focused`, `data-hovered`, `data-pressed` | No global convention |
| Ariakit (Reakit) | `aria-expanded` + `aria-activedescendant` | Follows ARIA APG |
| Ad-hoc (observed in bug reports) | `data-ready`, `data-loading`, `data-busy` | xstate-influenced `data-state="loading\|idle\|error"` |

**Implications:**
- For teams shipping their own components, Radix's naming is the lowest-friction convention — it's documented, widely recognized in the React ecosystem, and the CSS-selector pattern doubles as an animation driver and a test surface.
- For assertions that should generalize across third-party libraries in the same app, `aria-*` attributes are the only stable contract.
- `aria-busy` is the portable "settled" signal. Even without Playwright's native `getByRole({ busy: false })` filter ([issue #36233](https://github.com/microsoft/playwright/issues/36233) — open, P3), `toHaveAttribute('aria-busy', 'false')` works today.

---

### Dimension 5: Animation disabling in tests

**Finding:** Playwright provides three layered disable mechanisms, each with a different scope and app-cooperation requirement. The accepted split is: disable animations for *visual regression* tests (snapshot stability); keep animations enabled and wait per-animation for *correctness* tests (animation behavior is part of the contract).

**Evidence:** [evidence/animation-disabling.md](evidence/animation-disabling.md)

**Mechanism A — per-screenshot fast-forward.**

```javascript
await expect(page).toHaveScreenshot('login.png', { animations: 'disabled' });
```

Per the [page-assertions docs](https://playwright.dev/docs/api/class-pageassertions), `'disabled'` (the default) "stops CSS animations, CSS transitions and Web Animations. Finite animations are fast-forwarded to completion, so they'll fire `transitionend` event. Infinite animations are canceled to initial state, and then played over after the screenshot." Scope: the screenshot assertion only. Value: finite animations reach their terminal state deterministically.

**Mechanism B — per-page media emulation.**

```javascript
await page.emulateMedia({ reducedMotion: 'reduce' });
// or globally
export default defineConfig({ use: { reducedMotion: 'reduce' } });
```

Sets the `prefers-reduced-motion: reduce` media query. Requires the app to honor it — either by wrapping animations in `@media (prefers-reduced-motion: no-preference)` (Tailwind's `motion-safe:` utility) or by adding a global CSS override like [Ash Connolly's recipe](https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Without the CSS cooperation, emulation is silently a no-op.

**Mechanism C — library-level skip.** Framer Motion / Motion exposes `MotionGlobalConfig.skipAnimations = true`; Motion components render at end state without playing. Required because `prefers-reduced-motion` doesn't reach JS-driven animations unless each component calls `useReducedMotion()` or `<MotionConfig reducedMotion="always">` wraps the tree. *Caveat:* this flag is referenced in third-party community posts but was not surfaced in the Motion docs reached during this pass — its authoritative API status is less documented than Playwright's own options. `<MotionConfig reducedMotion="always">` at the tree root is the documented alternative.

**Mechanism D — build-flag stubs.** Conditional replacement of animated components with unanimated equivalents:

```jsx
const Motion = process.env.NEXT_PUBLIC_E2E_TESTING ? 'div' : motion.div;
```

Most invasive; breaks production parity. Reserved for cases where the other mechanisms don't reach every animated surface.

**Trade-offs:**

| Test purpose | Recommended mechanism | Why |
|---|---|---|
| Visual regression / screenshots | A (+ B for stability) | Snapshots are stable without sacrificing functional coverage |
| Correctness / interaction | None — keep animations on | Animation behavior (focus during transition, pointer events during fade) is part of the contract |
| Very slow test suites dominated by animation wait | B + C for specific animated subsystems | Tradeoff: lose animation-related coverage on those paths |

**Implications:**
- Global "disable all animations" has a real coverage cost: bugs that only manifest during the transition (focus loss, pointer-event timing, scroll lock escape, animated-modal keyboard trap) disappear from the test matrix. Teams report shipping these bugs to production when tests ran animation-free (informal community observation; no single-source citation).
- Mechanism B is the cleanest first step because it composes with the existing app's accessibility contract. Mechanism A handles the screenshot-specific case. Mechanisms C and D are app-specific and should be reached for deliberately, not by default.

---

## Limitations & Open Questions

### Dimensions not fully covered
- **TipTap / BlockNote / Milkdown slash-menu test-state markers:** Confirmed TipTap does not provide a test-specific DOM marker and defers to integrator conventions. Did not reach authoritative primary sources for BlockNote, Milkdown, Plate, or Novel.sh.
- **`@react-spring/web` test mode:** No official "skip" or "instant settle" API surfaced in the sources reached this pass.
- **Motion (Framer Motion) `skipAnimations` authoritative reference:** `motion.dev/docs/react-reduced-motion` returned 404; the pattern is community-reported but not authoritatively documented in the source pages reached.

### Out of scope (per rubric)
- Per-test docName isolation
- Bridge-convergence fuzz testing
- Tool comparison across E2E frameworks
- 1P codebase analysis
- Mobile testing

---

## References

### Evidence files
- [evidence/debounce-patterns.md](evidence/debounce-patterns.md) — `expect.poll`, Clock API, fake timers, terminal-effect auto-retry.
- [evidence/animation-patterns.md](evidence/animation-patterns.md) — `getAnimations().finished`, `transitionend`, `toHaveCSS`, actionability `stable`.
- [evidence/composed-event-patterns.md](evidence/composed-event-patterns.md) — `aria-activedescendant`, `aria-busy`, terminal observable principle.
- [evidence/data-attribute-conventions.md](evidence/data-attribute-conventions.md) — Radix `data-state`, cross-library comparison.
- [evidence/animation-disabling.md](evidence/animation-disabling.md) — `toHaveScreenshot` options, `emulateMedia`, `MotionGlobalConfig`.

### External sources

**Playwright (official):**
- [Playwright: Assertions](https://playwright.dev/docs/test-assertions)
- [Playwright: Auto-waiting / actionability](https://playwright.dev/docs/actionability)
- [Playwright: Clock API](https://playwright.dev/docs/api/class-clock)
- [Playwright: clock.md source](https://github.com/microsoft/playwright/blob/main/docs/src/clock.md)
- [Playwright: PageAssertions (toHaveScreenshot)](https://playwright.dev/docs/api/class-pageassertions)
- [Playwright: Page API (emulateMedia)](https://playwright.dev/docs/api/class-page)
- [Playwright: Test configuration (use.reducedMotion)](https://playwright.dev/docs/test-configuration)
- [Playwright issue #4055 — Add waitForAnimation](https://github.com/microsoft/playwright/issues/4055)
- [Playwright issue #36233 — Add busy option to getByRole](https://github.com/microsoft/playwright/issues/36233)
- [Playwright 1.20 release (animation disable announcement)](https://x.com/playwrightweb/status/1509265453356503040)

**Headless component libraries:**
- [Radix UI: Animation guide](https://www.radix-ui.com/primitives/docs/guides/animation)
- [Radix UI: Accordion](https://www.radix-ui.com/primitives/docs/components/accordion)
- [TipTap: Suggestion utility](https://tiptap.dev/docs/editor/api/utilities/suggestion)

**Web standards / MDN:**
- [MDN: Element.getAnimations()](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations)
- [MDN: aria-activedescendant](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant)
- [MDN: aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)
- [MDN: aria-expanded](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded)
- [MDN: prefers-reduced-motion media query](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [W3C WAI ARIA Authoring Practices: Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Sarah Higley: "aria-activedescendant is not focus"](https://sarahmhigley.com/writing/activedescendant/)

**Community guides and discussions:**
- [Checkly: Playwright assertions best practices](https://www.checklyhq.com/docs/learn/playwright/assertions/)
- [BrowserStack: Understanding Playwright assertions](https://www.browserstack.com/guide/playwright-assertions)
- [The Green Report: Automating animation testing with Playwright](https://www.thegreenreport.blog/articles/automating-animation-testing-with-playwright-a-practical-guide/automating-animation-testing-with-playwright-a-practical-guide.html)
- [TestDouble: Jest timers vs. waitFor for debounced inputs](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs)
- [DEV: How to wait for animations to complete in Playwright](https://dev.to/sergeyt/how-to-wait-animations-complete-in-playwright-script-50fb)
- [Ash Connolly: Playwright visual regression in Next.js](https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next)
- [DEV: Mocking Framer Motion v9](https://dev.to/pgarciacamou/mocking-framer-motion-v9-7jh)
- [Chromatic: Animations testing docs](https://www.chromatic.com/docs/animations/)
- [Testing Library: ByRole queries](https://testing-library.com/docs/queries/byrole/)
- [lodash issue #2893 — debounce breaks fake timers](https://github.com/lodash/lodash/issues/2893)
