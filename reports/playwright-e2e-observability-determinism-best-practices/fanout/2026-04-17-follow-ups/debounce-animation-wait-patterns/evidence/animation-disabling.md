---
dimension: Animation disabling in tests
date: 2026-04-16
sources:
  - https://playwright.dev/docs/api/class-page
  - https://playwright.dev/docs/api/class-pageassertions
  - https://playwright.dev/docs/test-configuration
  - https://x.com/playwrightweb/status/1509265453356503040
  - https://github.com/motiondivision/motion/blob/main/CLAUDE.md
  - https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next
  - https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
---

# Evidence: Animation disabling in tests

## Key sources
- [Playwright: page.emulateMedia API (class-page)](https://playwright.dev/docs/api/class-page)
- [Playwright: toHaveScreenshot animations option](https://playwright.dev/docs/api/class-pageassertions)
- [Playwright: Test configuration (use.reducedMotion)](https://playwright.dev/docs/test-configuration)
- [Playwright 1.20 release tweet](https://x.com/playwrightweb/status/1509265453356503040) — "Disable CSS animations" milestone.
- [Motion (Framer Motion) CLAUDE.md](https://github.com/motiondivision/motion/blob/main/CLAUDE.md)
- [Ash Connolly: Playwright visual regression in Next.js](https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

---

## Findings

### Finding: Playwright ships three layered mechanisms for disabling/fast-forwarding animations
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/api/class-page, https://playwright.dev/docs/api/class-pageassertions, https://playwright.dev/docs/test-configuration

**Mechanism A — Per-screenshot fast-forward.** `toHaveScreenshot({ animations: 'disabled' })` (default) "stops CSS animations, CSS transitions and Web Animations. Finite animations are fast-forwarded to completion, so they'll fire transitionend event. Infinite animations are canceled to initial state, and then played over after the screenshot."

**Mechanism B — Per-page media emulation.**

```javascript
await page.emulateMedia({ reducedMotion: 'reduce' });
```

Sets the `prefers-reduced-motion: reduce` media query for the page. Apps that guard animations behind `@media (prefers-reduced-motion: no-preference)` (or Tailwind's `motion-safe:` utility) will skip rendering them.

**Mechanism C — Global config.**

```typescript
// playwright.config.ts
use: {
  reducedMotion: 'reduce',
},
```

Applied to every test context.

**Implications:** Mechanisms A and B/C address different scopes and different app contracts. A works only during `toHaveScreenshot`; B/C work everywhere but depend on the app respecting the media query. A fully animation-free test run typically combines B/C with either (i) `animations: 'disabled'` on visual comparisons, or (ii) app-level motion-safe guards.

---

### Finding: `prefers-reduced-motion: reduce` requires app cooperation
**Confidence:** CONFIRMED
**Evidence:** https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion, https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next

The media query is only honored if the app's CSS wraps animations in `@media (prefers-reduced-motion: no-preference)` or equivalent, or if a global CSS override neutralizes `transition` / `animation` properties when the opposite query is set. Connolly's Next.js recipe explicitly pairs Playwright's `reducedMotion: 'reduce'` config with an app CSS block such as:

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

**Implications:** Emulating `reduce` without the CSS override silently does nothing. Adopting this mechanism is a two-file change — config + stylesheet. Teams sometimes inject the override as an `addStyleTag` hook on page load instead of shipping it to production.

---

### Finding: Framer Motion / Motion exposes `MotionGlobalConfig.skipAnimations` for test cutover
**Confidence:** CONFIRMED (community usage; first-party docs for the flag partially reached)
**Evidence:** https://dev.to/pgarciacamou/mocking-framer-motion-v9-7jh, community posts in the Motion project's issue tracker

Pattern: inject a build/runtime flag, and in the app entry point toggle Motion's skip:

```javascript
import { MotionGlobalConfig } from 'framer-motion';
if (window.__SKIP_ANIMATIONS__) {
  MotionGlobalConfig.skipAnimations = true;
}
```

`skipAnimations = true` causes Motion to render animations in their end state without playing. This applies to JS-driven animations Motion controls; CSS-driven animations are unaffected and need Mechanism B above.

Note: the Motion project's public `CLAUDE.md` surveyed did *not* document `MotionGlobalConfig.skipAnimations` (404 on the direct API page, and the CLAUDE.md does not mention the flag). Usage is confirmed via third-party community posts and Motion source code but is not formally surfaced in the top-level docs pages reached.

**Implications:** The `skipAnimations` mechanism is load-bearing for Framer Motion-heavy apps because `prefers-reduced-motion` does not reach JS-driven animations unless the app's Motion components explicitly guard on `useReducedMotion()`. Relying on `skipAnimations` requires shipping a conditional in the entry — or wrapping in `<MotionConfig reducedMotion="always">`.

---

### Finding: The accepted pattern for visual-regression tests is full animation disable; correctness tests prefer targeted waits
**Confidence:** INFERRED
**Evidence:** https://www.chromatic.com/docs/animations/, https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next

Chromatic (Storybook's visual-regression service) and Playwright's `toHaveScreenshot` both default to disabling animations for snapshot stability. By contrast, correctness-focused tests (functional assertions on UI) generally keep animations enabled and use `getAnimations().finished`, `toHaveCSS`, or `data-state` assertions — because animation behavior is *part of the contract being tested* for interactive UIs (menu opens, content fades in, toast auto-dismisses).

**Implications:** Choice of disable-globally vs. wait-per-animation is driven by whether the test is asserting *visual output* (disable) or *interaction behavior* (wait). Tests that conflate these (e.g., disabling animations, then asserting `aria-hidden="false"` on the post-open state) lose coverage of the animation itself — which is where CLS, pointer-event-during-transition, and focus-trap-during-transition bugs hide.

---

### Finding: Build-time environment flags are the "nuclear option" for full animation bypass
**Confidence:** CONFIRMED
**Evidence:** https://dev.to/pgarciacamou/mocking-framer-motion-v9-7jh, https://ashconnolly.com/blog/playwright-visual-regression-testing-in-next

Teams set an env var (`NEXT_PUBLIC_E2E_TESTING=1`, `VITE_DISABLE_ANIMATIONS=1`, etc.) and gate animation components:

```jsx
const Motion = process.env.NEXT_PUBLIC_E2E_TESTING ? 'div' : motion.div;
```

Or replace Motion with a jest/vitest mock at module level.

**Implications:** This is the most invasive option and breaks production parity (the component tree differs between test and prod). It's reserved for cases where `skipAnimations` / `prefers-reduced-motion` doesn't reach every animated surface (e.g., third-party components that hard-code `motion.div` without `MotionConfig` at the right boundary). Trade-off: animation-related coverage is lost entirely.

---

## Negative searches

- Searched Motion's official docs site (motion.dev) for a dedicated `skipAnimations` reference page. Received 404 on `/docs/react-reduced-motion`; the CLAUDE.md in the Motion repo does not describe the flag. Flag is real but not authoritatively documented in the sources reached.
- Searched for an equivalent global-skip flag in `@react-spring/web` and `@react-aria`. **NOT FOUND** in the primary docs reached; React-Aria defers to `prefers-reduced-motion`.

## Gaps / follow-ups

- Official Motion v11+ docs for `MotionGlobalConfig.skipAnimations` — whether the flag is under a different name or has been superseded by `<MotionConfig reducedMotion="always">` at tree root.
- React Spring's position on testing — do they document a "instant settle" API or defer entirely to `prefers-reduced-motion` config.
