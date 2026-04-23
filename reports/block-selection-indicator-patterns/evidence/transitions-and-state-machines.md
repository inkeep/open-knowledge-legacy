# Evidence: Transition Timing + State Machines (D5b)

**Dimension:** How to animate selection state changes — timing, easing, state composition, CSS-only entry/exit
**Date:** 2026-04-16
**Sources:** Emil Kowalski (Sonner/Vaul/blog), Nielsen Norman Group, Material 3 Motion, Radix UI, MDN (@starting-style, transition-behavior), web.dev, WordPress Gutenberg SCSS

---

## Key files / pages referenced

- [emilkowal.ski/ui/great-animations](https://emilkowal.ski/ui/great-animations)
- [emilkowal.ski/ui/good-vs-great-animations](https://emilkowal.ski/ui/good-vs-great-animations)
- [nngroup.com/articles/animation-duration](https://www.nngroup.com/articles/animation-duration/)
- [m3.material.io/styles/motion](https://m3.material.io/styles/motion)
- [github.com/emilkowalski/vaul](https://github.com/emilkowalski/vaul) — iOS-spring cubic-bezier
- [github.com/emilkowalski/sonner](https://github.com/emilkowalski/sonner) — entry/exit timing asymmetry
- [radix-ui.com/primitives/docs/guides/styling](https://www.radix-ui.com/primitives/docs/guides/styling) — data-state pattern
- [developer.mozilla.org/en-US/docs/Web/CSS/@starting-style](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style)
- [developer.mozilla.org/en-US/docs/Web/CSS/transition-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/transition-behavior)
- [web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)
- [developer.chrome.com/blog/entry-exit-animations](https://developer.chrome.com/blog/entry-exit-animations)
- WordPress Gutenberg `packages/block-editor/src/components/block-list/content.scss` — 100ms fade-in on multi-select

---

## Findings

### Finding: Interactive UI state transitions should cap at 150–300ms; 500ms is the pain threshold
**Confidence:** CONFIRMED
**Evidence:** NN/G Animation Duration article; Material 3 Motion

> "At 500ms, animations start to feel like a drag for users." — NN/G
> "Short durations (100ms) feel snappy; longer durations (500ms+) feel sluggish for interactive UI." — Material 3 easing-and-duration tokens

Canonical guidance across sources converges on:
- Simple feedback (toggle, checkbox): ~100ms
- Selection highlight / dropdown open: 150–200ms
- Substantial UI change (modal open): 200–300ms
- Pain threshold: 500ms

**Implications:** The 500ms entrance default used in marketing animations is wrong for selection-state transitions. Selection ring appearing/disappearing on `.is-selected` toggle should be 150–200ms.

---

### Finding: Exit animations are typically faster than entry (Emil Kowalski convention)
**Confidence:** CONFIRMED
**Evidence:** Sonner source + Emil Kowalski blog posts

Sonner entry: ~200ms with ease-out. Exit: ~150ms with sharper ease-in. Vaul same asymmetry. Pattern rationale from Emil: "Users have committed to moving on once they dismiss; the exit should feel snappy, not linger."

Pattern:
```css
.block[data-selected="true"] { transition: opacity 200ms ease-out; }
.block[data-selected="false"] { transition: opacity 150ms cubic-bezier(0.7, 0, 0.84, 0); }
```

---

### Finding: Dragging state should have zero transition (`transition: none`)
**Confidence:** CONFIRMED
**Evidence:** Vaul source, Emil Kowalski animation principle

During active manipulation (drag, resize), every position update needs to be immediate. A 200ms transition during drag creates perceived input lag. Vaul disables all transitions on `data-dragging="true"` via `transition: 'none'`.

```css
.block[data-dragging="true"] {
  transition: none;
}
```

---

### Finding: Easing — ease-out for entry, ease-in (or sharp) for exit, never linear
**Confidence:** CONFIRMED
**Evidence:** Emil Kowalski "Great Animations" + Material 3

| Curve | Cubic-bezier | Use |
|---|---|---|
| ease-out (default entry) | `(0.25, 0.46, 0.45, 0.94)` | Selection ring appearing; dropdowns opening |
| Exit (sharp) | `(0.95, 0.05, 0.795, 0.035)` | Selection ring dismissing |
| iOS spring | `(0.32, 0.72, 0, 1)` | Bouncy without overshoot (Vaul default) |
| Linear — avoid | `(0, 0, 1, 1)` | Feels mechanical; never for UI state |
| ease-in-out — avoid | `(0.42, 0, 0.58, 1)` | Slow at both ends; sluggish for interactive |

Emil's dictum: "The timing function is the most important part of any animation."

---

### Finding: `data-state` attributes outperform class toggling for multi-state composition
**Confidence:** CONFIRMED
**Evidence:** Radix UI styling guide; Sonner / Vaul / shadcn source

Rather than toggling classes, Radix + Emil Kowalski's libraries use `data-state`, `data-selected`, `data-focused` attributes. Benefits:

1. **Mutually-exclusive values** on a single attribute: `data-state="open" | "closed" | "transitioning"`
2. **Orthogonal states compose cleanly**: `[data-selected="true"][data-dragging="true"]` without explosion
3. **Transition on attribute value change** works identically to class changes
4. **Testing is cleaner**: `element.dataset.state` vs parsing `element.className`

Working example for block selection with 3+ orthogonal states:

```css
.block { transition: box-shadow 200ms ease-out; }

.block[data-selected="true"] {
  box-shadow: 0 0 0 2px var(--ring);
}
.block[data-selected="true"][data-needs-config="true"] {
  box-shadow: 0 0 0 2px var(--ring), 0 0 0 4px var(--ring-hint);
}
.block[data-dragging="true"] {
  box-shadow: none;
  transition: none;
}
```

---

### Finding: `@starting-style` + `transition-behavior: allow-discrete` enables CSS-only enter/exit from `display: none`
**Confidence:** CONFIRMED
**Evidence:** MDN, web.dev Baseline Entry Animations

Baseline August 2024. Chrome 117+, Safari 17.4+, Firefox 129+.

```css
.block[data-selected="true"]::before {
  content: '';
  opacity: 1;
  transition: opacity 200ms ease-out, display 200ms allow-discrete;

  @starting-style {
    opacity: 0;
  }
}

.block:not([data-selected="true"])::before {
  opacity: 0;
  display: none;
}
```

Eliminates the need for a JS-driven mount/unmount or `IntersectionObserver` to animate a selection ring's appearance.

**Fallback pattern:**
```css
@supports not (@starting-style (--test: red)) {
  /* Instant swap for older browsers */
  .block::before { transition: none; }
}
```

---

### Finding: Compositor-safe properties for selection transitions = `opacity`, `transform`, `filter`
**Confidence:** CONFIRMED
**Evidence:** web.dev Compositor-Only Properties

| Property | Thread | Use for selection |
|---|---|---|
| `opacity` | Compositor | ✅ Ring fade-in/out |
| `transform` | Compositor | ✅ Scale-in, slide |
| `filter` | Compositor (often) | ⚠️ blur expensive on low-end |
| `box-shadow` | Paint | ⚠️ Animate opacity via pseudo-element opacity, not box-shadow spread |
| `outline-width` | Paint + Layout | ❌ Avoid — causes reflow |
| `border-width` | Paint + Layout | ❌ Avoid — causes reflow |
| `width`/`height` | Layout | ❌ Avoid |

For a selection ring animating in/out, the right pattern is a pseudo-element with static `box-shadow` / `outline` whose `opacity` animates.

---

### Finding: Reduced-motion "no-motion-first" pattern — keep opacity/color, opt-in to spatial motion
**Confidence:** CONFIRMED
**Evidence:** /animate skill + CSS-Tricks + Smashing Magazine

Rather than the blanket `* { animation: none !important }`, compose:

```css
.block[data-selected="true"]::before {
  opacity: 1;
  transition: opacity 200ms ease-out;   /* always active */
}

@media (prefers-reduced-motion: no-preference) {
  .block[data-selected="true"]::before {
    transform: scale(1);
    transition: opacity 200ms ease-out, transform 200ms ease-out;
    /* starts at scale(0.95), animates to 1 — spatial motion */
  }
}
```

Fade-in is safe under reduced-motion (opacity change is not vestibular-triggering). Scale, translate, rotate are not — they opt in.

---

### Finding: State-machine (XState) patterns prevent impossible selection-state combinations
**Confidence:** CONFIRMED
**Evidence:** XState docs + Tim Deschryver essays

For editors with many selection sub-states (unselected → hover → selected → focused → dragging → drop-target), explicit state machine avoids:
- "dragging AND hovering" visual conflicts
- transitions that shouldn't exist (unselected → dragging)
- flicker when multiple state changes arrive in same frame

Data-attribute reflection of machine state:

```jsx
const [state] = useMachine(blockSelectionMachine);
return <div data-state={state.value}>...</div>;
```

```css
[data-state="hover"] { background: rgba(0,0,0,0.03); }
[data-state="selected"],
[data-state="selectedFocused"],
[data-state="dropTarget"] { box-shadow: 0 0 0 2px var(--ring); }
[data-state="dragging"] { transition: none; opacity: 0.7; }
```

**When to reach for state machine:** 5+ overlapping states. For <5 orthogonal flags, data-attributes compose fine.

---

### Finding: `will-change: transform, box-shadow` promotes compositor layer during animation
**Confidence:** CONFIRMED
**Evidence:** web.dev Compositor article

`will-change` hints to the browser to allocate a compositor layer. Use sparingly — over-use causes memory overhead. For a selection ring that animates, apply only to the specific animating property:

```css
.block { will-change: box-shadow; }  /* only the property that animates */
```

Not:
```css
.block { will-change: auto; }  /* forces everything; waste */
```

---

### Finding: Notion / Gutenberg multi-select fade-in uses 100ms
**Confidence:** CONFIRMED (Gutenberg), INFERRED (Notion)
**Evidence:** Gutenberg `content.scss` keyframes; Notion inferred from interaction observation

Gutenberg:
```css
@keyframes selection-overlay__fade-in-animation {
  from { opacity: 0; }
  to { opacity: 0.4; }
}
.block-editor-block-list__block.is-multi-selected {
  animation: selection-overlay__fade-in-animation 0.1s ease-out;
  animation-fill-mode: forwards;
}
```

100ms is even shorter than the 150–200ms general recommendation — reasonable for multi-select where the user expects instantaneous feedback after a drag-rect or shift-click.

---

## Gaps / follow-ups

- Exact Notion halo timing not confirmed (Notion closed-source; inferred from observation only).
- Sonner/Vaul source analysis did not extract exact cubic-bezier values for all their state transitions — some are likely framer-motion tokens not directly reusable as CSS values.
- Whether Lexical's selection state transitions have a documented timing convention in its playground not found.
