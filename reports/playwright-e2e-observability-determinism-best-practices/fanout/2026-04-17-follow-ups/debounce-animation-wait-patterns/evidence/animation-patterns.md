---
dimension: Animation-completion patterns
date: 2026-04-16
sources:
  - https://playwright.dev/docs/actionability
  - https://playwright.dev/docs/api/class-pageassertions
  - https://github.com/microsoft/playwright/issues/4055
  - https://dev.to/sergeyt/how-to-wait-animations-complete-in-playwright-script-50fb
  - https://www.thegreenreport.blog/articles/automating-animation-testing-with-playwright-a-practical-guide/automating-animation-testing-with-playwright-a-practical-guide.html
  - https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations
---

# Evidence: Animation-completion patterns

## Key sources
- [Playwright: Auto-waiting / actionability](https://playwright.dev/docs/actionability) — the "stable" check.
- [Playwright: toHaveScreenshot animations option](https://playwright.dev/docs/api/class-pageassertions) — fast-forward finite / cancel infinite semantics.
- [Playwright issue #4055 — Add waitForAnimation](https://github.com/microsoft/playwright/issues/4055) — community feature request & event-listener workaround.
- [DEV: How to wait for animations — MutationObserver recipe](https://dev.to/sergeyt/how-to-wait-animations-complete-in-playwright-script-50fb) — one community answer (acknowledged imperfect).
- [The Green Report: Automating animation testing with Playwright](https://www.thegreenreport.blog/articles/automating-animation-testing-with-playwright-a-practical-guide/automating-animation-testing-with-playwright-a-practical-guide.html) — waitForFunction + toHaveCSS recipes.

---

## Findings

### Finding: Playwright's `stable` actionability check handles layout-affecting animations automatically
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/actionability

> "An element is considered stable when it has maintained the same bounding box for at least two consecutive animation frames."

The check applies to `click`, `check`, `hover`, and `screenshot` actions (but not `fill`, per the actionability table). Playwright auto-waits the stable check before the action.

**Implications:** Any animation that changes position/size is waited-on automatically for actions that need it. The footgun is **visual-only animations** (opacity fade, background-color transitions, filter/blur) — these do not change the bounding box, so `stable` passes while the element is still mid-fade. Issue #4055 was filed specifically because `waitForElementState("stable")` "only detects animations affecting layout (not visual properties like opacity changes)."

---

### Finding: The community-recommended animation-wait primitive is Web Animations API `getAnimations()` + `Promise.all(a.finished)`
**Confidence:** CONFIRMED
**Evidence:** https://github.com/microsoft/playwright/issues/4055 (multiple commenters), https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations

The canonical in-page expression:

```javascript
await locator.evaluate(el =>
  Promise.all(
    el.getAnimations({ subtree: true }).map(a => a.finished)
  )
);
```

`Element.getAnimations({ subtree: true })` returns every active `CSSAnimation`, `CSSTransition`, and JS-driven `Animation` affecting the element or its descendants. Each animation exposes a `finished: Promise<Animation>` that resolves when the animation's play state becomes `"finished"`. `Promise.all` awaits every active animation regardless of type.

**Implications:** This is the single pattern that covers CSS transitions, CSS animations, and WAAPI calls uniformly. It works on any element with a live animation list. The only gap is **unstarted animations**: if the element is not yet animating (e.g., the trigger hasn't fired), `getAnimations()` returns empty and `Promise.all([])` resolves immediately — the pattern must be used *after* the animation is known to have started (typically by asserting `data-state="open"` first).

---

### Finding: `transitionend` / `animationend` event listeners are the pre-WAAPI pattern
**Confidence:** CONFIRMED
**Evidence:** https://github.com/microsoft/playwright/issues/4055

The issue's original workaround pattern:

```javascript
await page.$eval(selector, el => new Promise(resolve => {
  el.addEventListener('transitionend', resolve, { once: true });
  setTimeout(resolve, 2000); // fallback
}));
```

**Implications:** This is event-type-specific: `transitionend` for CSS transitions, `animationend` for CSS keyframe animations. A fallback `setTimeout` is typically added because both events do not fire if the transition is pre-empted, skipped, or the property value is identical to the starting value. This pattern is deterministic for single-property transitions with guaranteed firing; less reliable for compound animations. `getAnimations().finished` supersedes it.

---

### Finding: `getComputedStyle` polling via `waitForFunction` is the "assert terminal style" pattern
**Confidence:** CONFIRMED
**Evidence:** https://www.thegreenreport.blog/articles/automating-animation-testing-with-playwright-a-practical-guide/automating-animation-testing-with-playwright-a-practical-guide.html

```javascript
await page.waitForFunction(() => {
  const el = document.querySelector(".fade-in-element");
  return parseFloat(getComputedStyle(el).opacity) > 0.99;
});
```

Equivalent Playwright-native form via assertions:

```javascript
await expect(animatedElement).toHaveCSS("opacity", "1");
await expect(slidePanel).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
```

`toHaveCSS` is auto-retrying, so it polls until the computed style matches.

**Implications:** This is the most "Playwright-native" pattern — no `evaluate`, no custom promise, just a web-first assertion on the animated property. Works when the final computed value is known and stable. Does not work well for mid-motion checks (use `getAnimations` for that) or when the transform final value isn't easily expressible as a string the test can predict.

---

### Finding: `toHaveScreenshot({ animations: 'disabled' })` has specific fast-forward semantics
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/api/class-pageassertions

> "stops CSS animations, CSS transitions and Web Animations. Animations get different treatment depending on their duration:
> - finite animations are fast-forwarded to completion, so they'll fire `transitionend` event.
> - infinite animations are canceled to initial state, and then played over after the screenshot."

Default for `toHaveScreenshot` is `'disabled'`. Only other accepted value is `'allow'`.

**Implications:** The fast-forward semantics mean finite animations *do* reach their terminal state and fire terminal events even when "disabled" — the option is a "skip the duration, keep the end state" shortcut, not a full disable. Only valid inside the screenshot assertion; does not apply globally.

---

### Finding: MutationObserver + "N ticks of quiet" is a reported pattern but acknowledged imperfect
**Confidence:** CONFIRMED (pattern exists; author admits limits)
**Evidence:** https://dev.to/sergeyt/how-to-wait-animations-complete-in-playwright-script-50fb

The recipe polls a MutationObserver that increments a counter on any DOM mutation and decrements via `setInterval`. When the counter reaches zero the "quiet" state is assumed reached. Author: "This works, but not in 100% cases."

**Implications:** Listed for completeness. Not recommended when `getAnimations().finished` is available because WAAPI's `finished` promise is deterministic; MutationObserver-quiet is heuristic.

---

## Negative searches

- Searched for `page.waitForAnimation` or a native Playwright animation wait API. **NOT FOUND** as of the sources reached; issue [#4055](https://github.com/microsoft/playwright/issues/4055) (open since 2020) shows the feature was assigned P3-collecting-feedback and closed without adding the API.
- Searched for a shared Framer Motion recipe that exposes an "animation settled" DOM signal. **NOT FOUND** in motion/motion public docs reached during this pass; motion's own E2E tests use Playwright but do not document a public test-mode DOM marker.

## Gaps / follow-ups

- Whether `@react-spring/web` exposes a test-mode flag or a "settled" DOM state. Not reached during this pass.
- Whether Chromatic's `animations: 'pause'` (for Storybook) has a Playwright analogue beyond `toHaveScreenshot`'s `animations: 'disabled'`.
