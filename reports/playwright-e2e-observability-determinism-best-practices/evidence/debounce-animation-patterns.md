---
dimension: Follow-up C — Debounce, animation, composed-event waits
date: 2026-04-17
sources:
  - playwright.dev
  - github.com/microsoft/playwright
  - developer.mozilla.org
  - w3.org/WAI/ARIA/apg
  - www.radix-ui.com/primitives
  - testdouble.com
  - www.thegreenreport.blog
---

# Evidence: Debounce, animation, and composed-event wait patterns

**Primary question:** How does the Playwright community wait for state that settles via debounce, animation, or cascaded event handlers?

---

## Findings

### Finding: Three community-established debounce-wait patterns

**Confidence:** CONFIRMED
**Evidence:** Playwright exposes no "debounce-settled" primitive. The patterns:

**Pattern A — auto-retry on terminal DOM effect** (default, documented in [Playwright assertions](https://playwright.dev/docs/test-assertions)):

```js
await searchInput.fill('hello');
await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
// toHaveCount polls through the debounce; default 5s timeout absorbs 200-500ms windows
```

**Pattern B — `expect.poll` for non-DOM state:**

```js
await expect.poll(async () => {
  return await page.evaluate(() => window.__searchStore.resultsReady);
}, { timeout: 10_000 }).toBe(true);
```

`expect.poll`'s `intervals` option supports back-off: `intervals: [1_000, 2_000, 10_000]`.

**Pattern C — Clock API** (v1.45+), per [Playwright: Clock API](https://playwright.dev/docs/api/class-clock):

```js
await page.clock.install();
await page.goto('/search');
await searchInput.fill('hello');
await page.clock.runFor(300);
await expect(listbox).toBeVisible();
```

Mocked primitives per [clock.md source](https://github.com/microsoft/playwright/blob/main/docs/src/clock.md): `Date`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `requestAnimationFrame`, `cancelAnimationFrame`, `requestIdleCallback`, `cancelIdleCallback`, `performance`. `install()` must run before navigation.

**Measured speedup from fake timers:** [TestDouble — Jest timers vs. waitFor for debounced inputs](https://testdouble.com/insights/jest-timers-vs-waitfor-debounced-inputs) reports "10 - 100x improvement in the speed of the tests." Single-vendor data from Jest/RTL, but the arithmetic transfers to Playwright's Clock API.

**Known hazard:** [lodash issue #2893](https://github.com/lodash/lodash/issues/2893) documents that `_.debounce` uses recursive `setTimeout`, so unbounded `runAllTimers()` can infinite-loop. Use bounded `runFor(N)` with N = debounce delay.

---

### Finding: Playwright's `stable` actionability covers layout, not opacity

**Confidence:** CONFIRMED
**Evidence:** [Playwright actionability docs](https://playwright.dev/docs/actionability):

> "An element is considered stable when it has maintained the same bounding box for at least two consecutive animation frames."

Applied automatically to `click`, `check`, `hover`, `screenshot`.

[microsoft/playwright#4055](https://github.com/microsoft/playwright/issues/4055) was filed in 2020 specifically because `stable` does not cover opacity/color/filter transitions — the bounding box doesn't change during a fade. Still open, P3.

---

### Finding: `getAnimations().finished` is the most general animation-completion primitive

**Confidence:** CONFIRMED
**Evidence:** Per [MDN: Element.getAnimations()](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations), returns all `Animation` objects affecting the element. Combined with `Animation.finished` promise:

```js
await menu.evaluate(el =>
  Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished))
);
```

Covers CSS transitions, CSS animations, and WAAPI calls uniformly.

**Gotcha:** Returns empty array if no animation is running; must be sequenced *after* the animation is known to have started (e.g., after `data-state="open"` flips).

---

### Finding: `transitionend` listener with fallback

**Confidence:** CONFIRMED
**Evidence:** Per [Playwright issue #4055](https://github.com/microsoft/playwright/issues/4055) community comments:

```js
await page.$eval('.modal', el => new Promise(resolve => {
  el.addEventListener('transitionend', resolve, { once: true });
  setTimeout(resolve, 2000); // fallback — transitionend doesn't fire if start === end
}));
```

Single-property, event-specific. The fallback exists because `transitionend` does not fire if the transition is pre-empted or the start/end values are equal. Superseded by WAAPI `.finished` when available.

---

### Finding: `toHaveCSS` on terminal value is Playwright-native

**Confidence:** CONFIRMED
**Evidence:** Per [Playwright assertions docs](https://playwright.dev/docs/test-assertions) + [The Green Report's Playwright animation guide](https://www.thegreenreport.blog/articles/automating-animation-testing-with-playwright-a-practical-guide/automating-animation-testing-with-playwright-a-practical-guide.html):

```js
await expect(modal).toHaveCSS('opacity', '1');
await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
```

Requires predicting the terminal computed value — fine for `opacity: 1` or the identity transform; brittle for matrix strings driven by responsive units.

---

### Finding: `toHaveScreenshot({ animations: 'disabled' })` is screenshot-scoped only

**Confidence:** CONFIRMED
**Evidence:** Per [Playwright page-assertions docs](https://playwright.dev/docs/api/class-pageassertions):

> "`'disabled'` (the default) — stops CSS animations, CSS transitions and Web Animations. Finite animations are fast-forwarded to completion, so they'll fire `transitionend` event. Infinite animations are canceled to initial state, and then played over after the screenshot."

Scope: the screenshot assertion only. Not a general-purpose wait.

---

### Finding: `aria-activedescendant` is the terminal observable for menu cascades

**Confidence:** CONFIRMED
**Evidence:** Per [MDN: aria-activedescendant](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant):

> "Identifies the currently active element when focus is on a composite widget, combobox, textbox, group, or application."

Per the [W3C ARIA Authoring Practices Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/), the attribute must reference the highlighted option's `id`. When filter or selection changes, the attribute updates *after* the full cascade.

Canonical Playwright form:

```js
await input.pressSequentially('/h1');
// terminal observable after: open → filter → reposition → highlight
await expect(combobox).toHaveAttribute('aria-activedescendant', 'option-heading-1');
```

Per [Sarah Higley — "aria-activedescendant is not focus"](https://sarahmhigley.com/writing/activedescendant/), the attribute is the semantic truth of "which option is active," independent of DOM focus.

---

### Finding: `aria-busy="false"` is the ARIA-native "subtree settled" signal

**Confidence:** CONFIRMED
**Evidence:** Per [MDN: aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy):

> "Indicates an element is currently being modified and that assistive technologies should wait."

```js
await expect(region).toHaveAttribute('aria-busy', 'false');
```

App-side contract: set `aria-busy="true"` at the start of the cascade, flip to `false` when every subscriber has reported in. [Testing Library's `getByRole`](https://testing-library.com/docs/queries/byrole/) already supports `{ busy: false }` as a first-class filter; Playwright [issue #36233](https://github.com/microsoft/playwright/issues/36233) proposes the same but is P3-collecting-feedback.

---

### Finding: Radix UI's `data-state` is the dominant React headless convention

**Confidence:** CONFIRMED
**Evidence:** Per [Radix UI: Animation guide](https://www.radix-ui.com/primitives/docs/guides/animation) + [Accordion component docs](https://www.radix-ui.com/primitives/docs/components/accordion):

| Part | Attributes |
|------|-----------|
| Root | `[data-orientation]: "vertical" \| "horizontal"` |
| Item / Header / Trigger / Content | `[data-state]: "open" \| "closed"`, `[data-disabled]`, `[data-orientation]` |

Playwright assertion form:

```js
await expect(trigger).toHaveAttribute('data-state', 'open');
```

**Timing subtlety.** Radix's `data-state` is the *lead indicator* — it flips when the state machine transitions, before the animation plays. Radix's internal `Presence` component keeps the element mounted through `data-state="closed"` so the unmount animation runs to completion. Pair with `getAnimations().finished` for "opened AND animation done."

**Cross-library vocabulary is not portable:**

| Library | Disclosure attribute |
|---|---|
| Radix Primitives | `data-state="open"\|"closed"` |
| Headless UI (Tailwind Labs) | `data-headlessui-state="open"`, `data-open`, `data-closed` |
| React-Aria | `aria-expanded`, `data-focused`, `data-hovered`, `data-pressed` |
| Ariakit (Reakit) | `aria-expanded` + `aria-activedescendant` (ARIA APG) |

The only portable "settled" signal across libraries is W3C's `aria-busy`.

---

### Finding: Animation disabling — three layered mechanisms

**Confidence:** CONFIRMED
**Evidence:**

**Mechanism A — per-screenshot fast-forward** (per [page-assertions docs](https://playwright.dev/docs/api/class-pageassertions)):

```js
await expect(page).toHaveScreenshot('login.png', { animations: 'disabled' });
```

**Mechanism B — per-page media emulation** (per [Playwright Page API](https://playwright.dev/docs/api/class-page)):

```js
await page.emulateMedia({ reducedMotion: 'reduce' });
// or globally
export default defineConfig({ use: { reducedMotion: 'reduce' } });
```

Requires app CSS to honor `prefers-reduced-motion: reduce`. Per [Ash Connolly's recipe](https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next):

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

Without CSS cooperation, emulation is silently a no-op.

**Mechanism C — library-level skip.** `<MotionConfig reducedMotion="always">` at tree root for Framer Motion (documented). `MotionGlobalConfig.skipAnimations = true` is community-reported but was not surfaced in the Motion docs pages reached.

**Mechanism D — build-flag stubs:**

```jsx
const Motion = process.env.NEXT_PUBLIC_E2E_TESTING ? 'div' : motion.div;
```

Most invasive; breaks production parity.

**Accepted split:**

| Test purpose | Recommended mechanism | Why |
|---|---|---|
| Visual regression / screenshots | A (+ B for stability) | Snapshots stable without sacrificing functional coverage |
| Correctness / interaction | None — keep animations on | Animation behavior is part of the contract |
| Animation-dominated slow suites | B + C for specific subsystems | Lose animation coverage on those paths |

Global "disable all animations" has real coverage cost: bugs that manifest only during transition (focus loss, pointer-event timing, scroll lock escape, animated-modal keyboard trap) disappear from the test matrix.

---

## Negative searches

- `requestIdleCallback` / `queueMicrotask` flushes as settling primitives: **NOT FOUND** as a recommended community pattern. The Playwright Clock mocks rIC but only for deterministic time advance, not for settling checks.
- TipTap / BlockNote / Milkdown slash-menu test-state markers: TipTap confirmed to NOT provide a test-specific DOM marker per [TipTap Suggestion utility docs](https://tiptap.dev/docs/editor/api/utilities/suggestion); BlockNote, Milkdown, Plate, Novel.sh not authoritatively surveyed.

---

## Gaps / follow-ups

- Framer Motion `MotionGlobalConfig.skipAnimations` authoritative reference — `motion.dev/docs/react-reduced-motion` returned 404 during research pass.
- `@react-spring/web` test mode — no official "skip" / "instant settle" API surfaced.
