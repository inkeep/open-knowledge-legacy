# Evidence: Accessibility Requirements (D4)

**Dimension:** WCAG / ARIA / forced-colors / prefers-reduced-motion constraints for block selection indicators
**Date:** 2026-04-16
**Sources:** WCAG 2.1 + 2.2 normative specs, ARIA 1.2 spec, MDN CSS references, published a11y guidance (Sara Soueidan, Adrian Roselli, Deque, TetraLogical, tempertemper)

---

## Key files / pages referenced

- `w3.org/TR/WCAG21/` — 2.4.7 Focus Visible (AA), 1.4.11 Non-text Contrast (AA)
- `w3.org/WAI/WCAG22/Understanding/focus-appearance.html` — 2.4.13 Focus Appearance (AAA, minimum-area + contrast formula)
- `w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum` — 2.4.11 (AA, WCAG 2.2 addition)
- `w3.org/TR/wai-aria-1.2/` — `aria-selected`, `aria-activedescendant`
- `developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors` — forced-colors behavior of box-shadow (none), outline (preserved, auto-colored)
- `developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion`
- `developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible` — keyboard-initiated focus heuristic
- `sarasoueidan.com/blog/focus-indicators/` — dual-outline (black + white halo) pattern
- `tempertemper.net/blog/windows-high-contrast-mode-and-focus-outlines` — WHCM fallback recommendations
- `automattic.design/2021/03/12/accessibility-in-the-block-editor/` — Gutenberg block Navigation mode

---

## Findings

### Finding: `box-shadow` is forced to `none` in Windows High Contrast Mode; `outline` is preserved and re-colored to system colors
**Confidence:** CONFIRMED
**Evidence:** MDN `@media/forced-colors`

> "In forced-colors mode, the text-shadow and box-shadow properties are forced to none. outline-color is forced to system colors..."

**Implications:** A selection indicator built ONLY on `box-shadow` disappears entirely for WHCM users — a WCAG 2.4.7 violation. Every block-selection indicator must include an `outline` as primary or fallback layer. If the design calls for box-shadow (rounded corners, opacity, multiple rings), pair it with a transparent-placeholder outline that becomes visible in WHCM:

```css
.block:focus-visible {
  outline: 3px solid transparent;  /* invisible in normal mode */
  box-shadow: 0 0 0 3px var(--ring);
}
@media (forced-colors: active) {
  .block:focus-visible {
    outline-color: CanvasText;  /* or just omit — auto-forced */
  }
}
```

---

### Finding: WCAG 2.4.13 (Focus Appearance, AAA) sets concrete pixel+contrast requirements
**Confidence:** CONFIRMED
**Evidence:** w3.org/WAI/WCAG22/Understanding/focus-appearance.html

Normative quote:
> "An area of the focus indicator meets all the following: (1) is at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component; (2) has a contrast ratio of at least 3:1 between the same pixels in the focused and unfocused states."

For a 100×40 px block: minimum indicator area ≈ 280 CSS pixels (perimeter of 2px-thick ring). A 3px solid outline comfortably exceeds this. Dashed/dotted lines need to be ≥4px thick to account for gaps.

**Implications:** Even though 2.4.13 is AAA (not required for AA compliance), it's the only criterion that gives concrete numeric guidance. Most serious editors target it. Concretely:
- 3px solid outline is the practical minimum
- 3:1 contrast between focused + unfocused states
- If unfocused state has NO indicator, the 3:1 is measured against the block background

---

### Finding: `:focus-visible` is the correct pseudo for keyboard-initiated selection — `:focus` shows after mouse clicks and creates visual noise
**Confidence:** CONFIRMED
**Evidence:** MDN `:focus-visible`; CSS Selectors Level 4 spec

`:focus-visible` matches only when the user-agent heuristic decides focus should be visible — typically keyboard (tab, arrow keys), not pointer-click. Supported across all modern browsers since March 2022 (Baseline Widely Available).

**Implications:** For block editors, click-to-select should NOT trigger the selection ring (the user already knows where they clicked); keyboard-nav should. Use `:focus-visible`, not `:focus`. For our own non-native block elements, apply the equivalent pattern: distinguish pointer-initiated from keyboard-initiated selection, show the ring only for the latter.

For non-native elements (e.g., a div styled with a `.is-selected` class driven by PM NodeSelection), you're not using `:focus-visible` directly — but the principle translates: track the selection origin and only paint the ring when it was keyboard-initiated. Alternatively, always paint it (Anytype's model) and accept that pointer-click users see the ring too.

---

### Finding: The dual-outline (black outline + white halo) pattern guarantees contrast against any background
**Confidence:** CONFIRMED
**Evidence:** sarasoueidan.com/blog/focus-indicators/

Pattern:
```css
.block:focus-visible {
  outline: 3px solid black;           /* 21:1 against white */
  box-shadow: 0 0 0 6px white;        /* separates outline from dark backgrounds */
}
```

Black outline has >21:1 contrast against any light background; white halo separates it from dark backgrounds. Meets 2.4.13 and 1.4.11 simultaneously. The canonical robust-any-theme focus indicator.

**Implications:** If a blue/brand-color ring is needed, it must be specifically chosen to meet 3:1 against both the block background AND the page background. Dual-outline sidesteps this by using the color endpoints (pure black, pure white).

---

### Finding: `prefers-reduced-motion` must disable pulsing/scaling indicator animations
**Confidence:** CONFIRMED
**Evidence:** MDN `@media/prefers-reduced-motion`

Users with vestibular disorders experience motion sickness from pulsing glows, scale-in rings, etc. Safe alternatives: instant color shift, opacity change, static outline.

```css
.block:focus-visible { animation: pulse 1.5s infinite; }
@media (prefers-reduced-motion: reduce) {
  .block:focus-visible { animation: none; box-shadow: 0 0 0 3px blue; }
}
```

**Implications:** If a selection indicator has any motion (fade-in, pulse, scale), gate it on this media query. Static outline is always safe.

---

### Finding: `aria-selected` and `aria-activedescendant` are the canonical ARIA patterns for "this block is selected"
**Confidence:** CONFIRMED
**Evidence:** WAI-ARIA 1.2, WAI-ARIA Authoring Practices (Grid pattern)

Two patterns:

1. **`aria-selected="true"`** on the block element — requires a parent with a role that supports selection (`role="grid"` + `role="gridcell"`, or `role="listbox"` + `role="option"`). Screen readers announce "selected" state.

2. **`aria-activedescendant="block-42"`** on a parent container — DOM focus stays on the container; the child is "virtually focused." Author-styled via CSS. Lighter-weight for custom widgets.

WordPress Gutenberg uses `role="article"` on blocks with explicit focus management (no `aria-selected`) — a valid third pattern when blocks are treated as document-like content rather than selectable options.

**Implications:** Without ARIA, screen reader users hear the block's content but not its selection state. For a rich-text editor with block-level selection, at minimum announce the state via ARIA (or `aria-live` on selection change).

---

### Finding: WCAG 2.4.11 (Focus Not Obscured, AA) requires the focused element to remain at least partially visible
**Confidence:** CONFIRMED
**Evidence:** w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum

> "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content."

Matters when a selection ring could be hidden behind sticky headers, toolbars, or modals. Z-index bug.

**Implications:** For block editors with sticky header chrome, ensure the selection ring for any focused block never lands fully behind the header. Either scroll-into-view on selection change, or lower the sticky header's z-index on selection. Common failure mode.

---

### Finding: 1.4.11 Non-text Contrast (AA) requires 3:1 against all adjacent colors
**Confidence:** CONFIRMED
**Evidence:** w3.org/TR/WCAG21/#non-text-contrast

If the selection indicator spans multiple backgrounds (the block's fill + the page background outside the block), it must maintain 3:1 against both. Dual-outline pattern (above) handles this automatically.

**Implications:** A blue ring that contrasts against white-page fails if the block has a blue callout tint. Either pick a different color (dual-outline), use mix-blend-mode (auto-adapts), or apply the ring only inside one color region.

---

### Finding: Block editors benefit from a "Navigation mode" (keyboard-only) analogous to WordPress Gutenberg
**Confidence:** CONFIRMED
**Evidence:** automattic.design block editor a11y writeup

Gutenberg's Navigation mode: press ESC to enter → arrow keys jump block-to-block without entering content. Live-region announces "Navigation mode on." Dramatically improves keyboard usability for complex nested blocks.

**Implications:** Pure "tab through everything" navigation is slow and tedious for a nested block editor (tab through every prop panel, every inline element, every drag handle). A Navigation mode that lets users move between top-level blocks is a well-known pattern worth implementing.

---

## Do / Don't summary

| Practice | DO | DON'T | Source |
|---|---|---|---|
| Primary indicator | `outline` (forced-colors safe) | `box-shadow` only | MDN forced-colors |
| Keyboard-only indicator | `:focus-visible` | `:focus` (shows post-click) | MDN :focus-visible |
| Thickness | ≥3px solid | 1-2px thin lines | WCAG 2.4.13 |
| Contrast | 3:1 in focused vs unfocused | Low-contrast (e.g. white-on-white) | WCAG 1.4.11, 2.4.13 |
| Any-background robustness | Dual-outline (black outline + white box-shadow halo) | Brand-color-only ring | sarasoueidan.com |
| Forced-colors | Include outline fallback always | Assume box-shadow works | MDN forced-colors |
| Animations | Gate on `prefers-reduced-motion` | Always-on pulse/scale | MDN prefers-reduced-motion |
| ARIA | `aria-selected` / `aria-activedescendant` | Visual-only indicator | ARIA 1.2 |
| Obscuring | Ensure ring never fully hidden by chrome | Sticky headers over selection | WCAG 2.4.11 |

---

## Gaps / follow-ups

- WCAG 2.4.13 is AAA — factual but not required for AA compliance. Report should flag which criteria are AA (must) vs AAA (nice-to-have).
- `aria-activedescendant` practical pitfalls (screen reader support varies) not fully documented.
- Gutenberg's exact Navigation-mode implementation (ESC-to-enter, arrow keys, live region announcement) not inspected at source level.
