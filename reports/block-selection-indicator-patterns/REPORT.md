---
title: "Block-Level Selection Indicator Patterns in Rich-Text Editors"
description: "Survey of how production block editors (Notion, Tiptap, Lexical, Anytype, Outline, BlockNote, Figma et al.) visually signal block-level selection/focus, with concrete CSS techniques for avoiding the 'double outline' problem on blocks that already have their own border chrome. WCAG 2.1/2.2 + ARIA + forced-colors constraints included."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Notion
  - Tiptap
  - Lexical
  - Anytype
  - Outline
  - BlockNote
  - Craft
  - Figma
  - WordPress Gutenberg
  - ProseMirror
  - Tailwind
  - WCAG 2.2
  - ARIA 1.2
topics:
  - block selection UX
  - focus indicators
  - CSS outline vs box-shadow
  - forced-colors mode
  - double-outline problem
  - nested selection
  - multi-block selection
  - transition timing
  - data-state pattern
---

# Block-Level Selection Indicator Patterns in Rich-Text Editors

**Purpose:** Catalog concrete visual techniques for signaling "this block is selected" in a rich-text / block editor — especially when the selected block has its own border-radius + border (Callouts, Cards, Steps, embedded code). Identify which patterns avoid the "double outline" visual collision, and which respect WCAG / forced-colors / ARIA constraints. Aimed at editor authors picking a replacement for the naive `box-shadow: 0 0 0 2px` ring.

---

## Executive Summary

Across 13+ surveyed editors and frameworks, **no single universal pattern exists** — every serious editor special-cases at least one block type. But the patterns *do* cluster into a small number of reusable techniques, and the trade-offs are predictable. Four findings drive the recommendations:

1. **`box-shadow` is silently broken in Windows High Contrast Mode.** The property is forced to `none` in forced-colors. Any indicator built purely on `box-shadow` disappears entirely for WHCM users — a WCAG 2.4.7 violation. `outline` is preserved + auto-colored by the system. Every robust indicator pairs box-shadow with an outline fallback, or uses outline as the primary.

2. **The cleanest solutions to the double-outline problem put the selection BEHIND or INSIDE the block's own chrome, not ON TOP.** Tiptap's `DragHandle` extension uses a `::before` with `z-index: -1` — a behind-content halo. Anytype uses `::after` with semi-transparent fill that sits on top of the border but tints through it. Lexical's `PageBreakNode` simply swaps the existing border's color. All three eliminate the visual collision by refusing to paint a second line.

3. **Anytype has the most mature production catalog**, with a dual-pattern: `::after` fill overlay for most blocks, `::before` outer ring (`-2px` offset, `calc(100% + 4px)` width) for media blocks where an overlay would dim the image. Adaptive `border-radius` per block type. Explicit CSS classes for mouse vs keyboard selection (`.isSelectionSelected` vs `.isKeyboardFocused`).

4. **Figma's "separate rendering layer" is the gold standard but not directly portable to HTML/CSS editors.** Figma's selection, handles, and multi-select unions live in a WebGL layer above the canvas. The DOM equivalent (absolutely-positioned SVG overlay computed from `getBoundingClientRect`) is viable but high-complexity; reserved for editors that need multi-select handles.

**Key Findings:**

- **Forced-colors compatibility:** `outline` preserved; `box-shadow` disabled. Never ship a box-shadow-only indicator. Pair with a transparent-placeholder outline.
- **Behind-content halo (T10):** `::before` with `z-index: -1` is the cleanest fix for double-outline. Used by Tiptap DragHandle.
- **Border-color swap (T9):** For blocks with existing borders, replace the color instead of adding a ring. Zero double-outline. Used by Lexical PageBreakNode, Tiptap HorizontalRule, Outline math blocks.
- **Overlay-tint (T11):** `::after` with semi-transparent fill works on any block color — but dims content. Notion / Anytype general pattern.
- **WCAG 2.4.13 minimums:** 3px solid outline, 3:1 contrast between focused + unfocused, ≥280 CSS-pixel indicator area for typical blocks. AAA-level but the only criterion with concrete numbers.
- **Gutter pattern (T14):** A thin left-side bar (like WordPress Gutenberg) sidesteps the double-outline problem entirely by moving the indicator off the block. Weaker visual signal.
- **Transition timing cap: 150–300ms for interactive state changes** (NN/G + Material 3). The 500ms marketing-entrance default feels laggy for selection toggles. Exit 100–150ms (faster than entry, per Emil Kowalski).
- **`data-state` attributes over class toggling** (Radix, Sonner, Vaul). Multiple orthogonal states compose cleanly without class explosion; `[data-selected="true"][data-dragging="true"]` is readable where class combinations aren't.
- **Nested selection: innermost wins for visible chrome.** No surveyed editor outlines both parent and child. Gutenberg propagates `has-child-selected` via store (not `:has()`) for z-index lift + focus-mode preservation, but never an outline. A breadcrumb is the orientation aid for deep nesting.
- **Multi-select: per-block overlay + 100ms fade-in** (Gutenberg). Three mutually-exclusive classes distinguish subtypes: `is-selected` / `is-multi-selected` / `is-partially-selected` (text caret inside).
- **Separate-layer rendering (Figma/tldraw style) is overkill for rich-text block editors** — baseline ~1400-2600 LoC vs ~20-100 LoC for inline CSS equivalents. The exception is **action toolbars** attached to selection: `@floating-ui/dom`'s `autoUpdate` + virtual elements (Tiptap BubbleMenu pattern) solves scroll/resize sync in ~30 LoC and composes cleanly. **The practical hybrid: inline CSS for the outline, Floating UI for the toolbar.**

---

## Research Rubric

**Report name:** `block-selection-indicator-patterns`
**Stance:** Factual (catalog + analysis), Conclusions allowed but lightweight
**Framing:** 3P external

| # | Dimension | Priority | Covered in |
|---|---|---|---|
| D1 | Selection indicator taxonomy | P0 Deep | §Taxonomy + Comparison matrix |
| D2 | Editor survey (13+ editors) | P0 Deep | §Editor survey + [editor-survey.md](evidence/editor-survey.md) |
| D3 | Double-outline handling | P0 Deep | §Double-outline problem |
| D4 | Accessibility (WCAG/ARIA/forced-colors/reduced-motion) | P0 Moderate | §Accessibility + [a11y-requirements.md](evidence/a11y-requirements.md) |
| D5 | CSS/DOM implementation techniques | P1 Moderate | §CSS techniques + [css-techniques.md](evidence/css-techniques.md) |
| D6 | Drag interaction patterns | P1 Light | §Drag interaction |
| D5b | Transition timing + state machines (follow-up pass) | P1 Moderate | §Transition timing + [transitions-and-state-machines.md](evidence/transitions-and-state-machines.md) |
| D7 | Nested + multi-block selection UX (follow-up pass) | P1 Moderate | §Nested + multi-block + [nested-and-multi-selection.md](evidence/nested-and-multi-selection.md) |
| D9 | Separate-layer rendering (follow-up pass) | P1 Deep | §Separate-layer rendering + [separate-layer-rendering.md](evidence/separate-layer-rendering.md) |
| D10 | Non-goals | — | Not covered: text-caret selection, non-editor selection UIs, mobile touch-selection, abstract color theory, Framer closed-source speculation, canvas/WebGL pipelines as primary content renderer |

---

## Taxonomy of techniques (D1)

Organized by where the indicator is painted relative to the block's own chrome:

| Group | Paint location | Techniques |
|---|---|---|
| **Outside the block** | Fully outside the block's border; ring/handles in a halo region | T1 outline+offset, T2 box-shadow ring, T5 dual-outline, T12 outer `::before`, T15 SVG overlay layer |
| **On the block** | Overlaps the block's own chrome | T3 transparent-outline placeholder, T6 custom-property swap, T7 Tailwind ring, T11 `::after` overlay-tint, T13 mix-blend-mode |
| **Inside the block** | Ring inside the border, consuming padding | T16 negative outline-offset |
| **Behind the block** | Halo behind content; block's own chrome paints on top | T10 `::before` with `z-index: -1` |
| **Replacing the block's chrome** | Ring replaces, not adds | T8 `:has()` suppress inner border + outer ring, T9 border-color swap |
| **Off the block** | Indicator lives elsewhere (gutter, handle, breadcrumb) | T14 gutter bar, DP4 handle-only animation |
| **ARIA-only** | No visual change; screen-reader announcement only | `aria-selected`, `aria-activedescendant` — complementary to visual, not replacement |

Full technical catalog in [evidence/css-techniques.md](evidence/css-techniques.md).

---

## The double-outline problem (D3)

**Setup:** The wrapper element applies a selection ring. The block inside already has its own border + border-radius. Result:

```
┌── selection ring (outer)
│ ┌── block's own border (inner)
│ │ ┌── content
│ │ │
│ │ └──
│ └──
└──
```

Two concentric lines with slightly different radii. Visually muddy.

### Six empirical solutions observed in production editors

| Solution | Where used | Mechanism | Trade-off |
|---|---|---|---|
| **Replace, don't add** (T9) | Lexical `PageBreakNode`, Tiptap `HorizontalRule`, Outline math blocks | Swap the block's existing border color on `.selected`. Same width, new color. | Requires the block to already have a border. Contrast-shift may not meet WCAG 2.4.13 without a width increase. |
| **Behind-content halo** (T10) | Tiptap `extension-drag-handle-react` | `::before` with `z-index: -1` sits behind the block's own border. Block chrome paints on top. | Needs `position: relative` wrapper, no opaque block background, a stable stacking context. |
| **Overlay tint** (T11) | Anytype (all non-media blocks), Notion (inferred) | `::after` with `background: rgba(..., 0.25)` above border. Semi-transparent, so border shows through. | Dims content. Must match `border-radius` per block type. Doesn't provide a distinct edge. |
| **Outer ring outside bounds** (T12) | Anytype (media blocks) | `::before` positioned at `left: -2px; width: calc(100% + 4px)`. Ring lives entirely outside block. | Requires a wrapper. Extra specificity per block type. |
| **Suppress inner border** (T8) | Modern design systems | `:has(.is-selected) .inner { border-color: transparent }` removes the block's own border during selection; outer ring is the only line. | Requires `:has()` (modern browsers only). Alters the block's visual identity — can be disorienting. |
| **Mix-blend-mode tint** (T13) | Lexical table cells, Anytype resize feedback | `::after` with `background: highlight; mix-blend-mode: multiply` darkens through the existing border. | Blend behavior varies per backdrop. Forced-colors interaction unclear. |

### What not to do

Observed as anti-patterns across the survey:

- **Additive outline + box-shadow** on top of an already-bordered block. Produces three concentric lines.
- **Uniform outline strategy** without per-block handling. Every mature editor special-cases at least one block type (media, math, code). Expecting one rule to cover all cases is unrealistic.

---

## Editor survey (D2)

Full findings in [evidence/editor-survey.md](evidence/editor-survey.md). Summary:

| Editor | Technique | Double-outline handling | Evidence |
|---|---|---|---|
| **[Outline](https://github.com/outline/outline)** | `.ProseMirror-selectednode { outline: 2px solid }` | Per-block special-cases. Math blocks use `outline: none` + border+background swap. List items use `::after` pseudo. Callouts and blockquotes keep their left-border unchanged. | `shared/editor/components/Styles.ts:928-935, 120-128` |
| **[Tiptap DragHandle](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react)** | `::before` with `z-index: -1` behind content | Behind-content halo — no visual overlap with block chrome (T10) | `demos/src/Extensions/DragHandle/React/styles.scss:36-52` |
| **Tiptap (other extensions)** | Mixed: `outline: 3px` on images/embeds, `box-shadow: 0 0 0 2px` on focus/selection, border-color swap on horizontal rule | No single convention across extensions | `demos/src/Nodes/*/styles.scss`, `demos/src/Extensions/Focus/styles.scss` |
| **[Lexical playground](https://github.com/facebook/lexical)** | Three distinct patterns per block type: outline (pills), border-color swap (page break), `mix-blend-mode: multiply` overlay (tables) | Per-block-type; tables use `highlight` system color + blend mode | `packages/lexical-playground/src/themes/PlaygroundEditorTheme.css:297-298, 333-343`; `src/nodes/PageBreakNode/index.css:58-64` |
| **[Anytype](https://github.com/anyproto/anytype-ts)** | Dual-pattern: `::after` overlay-tint for most blocks, `::before` outer ring for media. `.isSelectionSelected` (mouse) vs `.isKeyboardFocused` (keyboard) tracked separately. Adaptive border-radius per block type. | Multi-strategy, block-type-aware. Most complete production catalog. | `src/scss/common.scss`, `src/scss/block/media.scss:9-13`, `src/ts/component/selection/target.tsx` |
| **[Notion](https://www.notion.com)** (inferred) | `.notion-selectable-halo` overlay element. Drag handle in left margin. | Selection as a separate DOM overlay, not inline styling | Web search results; closed-source |
| **Craft** | Native-UI colored framing (macOS/iOS) | Not CSS-inspectable | MacStories review |
| **Linear** | ProseMirror-based; specifics not documented | Not found | Help docs |
| **[WordPress Gutenberg](https://github.com/WordPress/gutenberg)** | Gutter + block navigation mode; drag handle | Gutter indicator sidesteps overlap; selection lives in chrome, not on block | Automattic design writeup |
| **[BlockNote](https://github.com/TypeCellOS/BlockNote)** | Internal (Mantine-themed); not exposed as surface CSS | Unknown | Source scan |
| **[AFFiNE](https://github.com/toeverything/AFFiNE)** / BlockSuite | Frame-based selection in edgeless + linear doc mode; differs per mode | Unknown | Partial source access |
| **Sanity Portable Text** | Schema-driven, minimal shipped UI | Delegated to integrators | sanity.io/docs |
| **Ghost Koenig** | Lexical-based, Ghost-specific styling not located | Unknown | Closed |
| **Obsidian** | Callouts + community themes; CodeMirror-based for markdown | Managed by CodeMirror, not CSS | Community docs |
| **[Figma](https://www.figma.com)** | Selection + handles in separate rendering layer (WebGL). Multi-select union outline. | Not a DOM editor — Figma pattern inspires T15 (SVG overlay) but isn't a direct CSS model. | Help docs |

### Cross-editor patterns

- **Outline for unbordered blocks:** Universal default. Tiptap images, Lexical pills, Outline content.
- **Replace-not-add for bordered blocks:** Lexical PageBreak, Tiptap HorizontalRule, Outline math.
- **`::after` overlay with semi-transparent fill:** Anytype general, Notion halo.
- **Behind-content halo:** Tiptap DragHandle, Anytype media.
- **Mix-blend-mode tint:** Lexical tables, Anytype resize.
- **Gutter/handle pattern:** Notion, Gutenberg — affordance off the block.

No editor surveyed uses a single uniform rule for all block types. Every one has at least one special case.

---

## Accessibility (D4)

Full evidence in [evidence/a11y-requirements.md](evidence/a11y-requirements.md). Critical constraints:

### Forced-colors mode (Windows High Contrast)

`box-shadow` is **forced to `none`** in `forced-colors: active`. `outline` is preserved and auto-colored to system colors (`CanvasText`, `Highlight`). [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors) confirms:

> "In forced-colors mode, the text-shadow and box-shadow properties are forced to none. outline-color is forced to system colors..."

**Implication:** A box-shadow-only indicator is invisible to WHCM users. Pair with a transparent-placeholder outline:

```css
.block.is-selected {
  outline: 3px solid transparent;
  box-shadow: 0 0 0 3px var(--ring);
}
@media (forced-colors: active) {
  .block.is-selected { outline-color: CanvasText; }
}
```

### WCAG 2.4.13 Focus Appearance (AAA)

> "An area of the focus indicator [is] at least as large as a 2 CSS pixel thick perimeter of the unfocused component; has a contrast ratio of at least 3:1 between focused and unfocused states."

For a 100×40px block: minimum 280 CSS-pixel indicator area. Practical minimums: **3px solid outline**, **3:1 contrast shift**. AAA, not required for AA — but the only criterion with concrete numeric guidance.

### WCAG 2.4.7 Focus Visible (AA), 2.4.11 Focus Not Obscured (AA, 2.2)

Hard baselines. Indicator must be visually detectable; must not be fully hidden by sticky headers or modals. The sticky-header case is the common failure mode.

### 1.4.11 Non-text Contrast (AA)

3:1 against ALL adjacent colors. If the ring spans block-fill + page-background, both must pass. Sara Soueidan's **dual-outline pattern** (`outline: 3px solid black; box-shadow: 0 0 0 6px white`) guarantees this:

- Black vs white: 21:1
- White halo separates outline from dark backgrounds

### `:focus-visible` vs `:focus`

`:focus-visible` shows the ring only on keyboard-initiated focus. `:focus` shows it after mouse clicks too (visual noise). Modern editors use `:focus-visible`. For PM-driven selection where DOM focus doesn't move to the block, track keyboard-vs-pointer origin explicitly (Anytype's `.isSelectionSelected` vs `.isKeyboardFocused` class pattern).

### `prefers-reduced-motion`

Any pulsing/scaling animations on the indicator must be disabled via:

```css
@media (prefers-reduced-motion: reduce) {
  .block.is-selected { animation: none; }
}
```

Users with vestibular disorders experience motion sickness from pulsing glows.

### ARIA

Screen readers do NOT infer selection from CSS. Announce via:
- `aria-selected="true"` on `role="gridcell"` or `role="option"` children
- `aria-activedescendant="block-42"` on a container (DOM focus stays on parent)
- `aria-live="polite"` region to announce selection changes

Without ARIA, screen-reader users hear block content but not its selection state.

### Navigation mode (WordPress Gutenberg pattern)

For nested block editors, tab-through-everything navigation is slow. Gutenberg's pattern: press ESC to enter Navigation mode; arrow keys jump block-to-block without entering content. Live region announces the mode change. Dramatically improves keyboard usability.

---

## CSS techniques (D5)

Full catalog with code + trade-offs in [evidence/css-techniques.md](evidence/css-techniques.md). Comparison matrix:

| # | Technique | Border-radius safe | Forced-colors safe | Layout impact | Suppresses double-outline | Complexity |
|---|---|---|---|---|---|---|
| T1 | outline + offset | Modern browsers only | ✅ | None | ❌ | Low |
| T2 | box-shadow ring | ✅ | ❌ | None | Partial | Low |
| T3 | transparent-outline placeholder | ✅ | ✅ | None | ❌ | Low |
| T4 | `:focus-visible` gate | N/A | ✅ | N/A | N/A | Low |
| T5 | dual-outline (black + white) | ✅ | ✅ | None | Partial | Low |
| T6 | custom-property swap | ✅ | depends | None | Partial | Medium |
| T7 | Tailwind ring | ✅ | ❌ | None | Partial | Very low |
| T8 | `:has()` + inner-border suppress | ✅ | ✅ (with outline) | None | ✅ | Medium |
| T9 | border-color swap | ✅ | ✅ | None | ✅ | Very low |
| T10 | `::before` behind (`z-index: -1`) | ✅ | ✅ (with outline) | None | ✅ | Medium |
| T11 | `::after` overlay tint | ✅ | depends on color | None | ✅ | Medium |
| T12 | `::before` outer ring | ✅ | depends | None | ✅ | Medium |
| T13 | mix-blend-mode tint | ✅ | depends | None | ✅ | Medium |
| T14 | gutter / side-bar | N/A | ✅ | Margin | ✅ | Low |
| T15 | SVG overlay separate layer | ✅ | ❌ natively | None | ✅ | High |
| T16 | negative outline-offset (inset) | Modern browsers only | ✅ | Inset into padding | ✅ | Low |

### Pattern cheat-sheet

- **Non-bordered block + simple editor:** T1 (outline) or T4 + T1.
- **Bordered block with consistent chrome:** T9 (border-color swap) — zero double-outline, minimal code.
- **Bordered block with varied chrome + want distinct "selected" aesthetic:** T10 (behind halo) OR T11 (overlay tint) OR T12 (outer ring).
- **Design system with forced-colors compliance:** T3 (transparent-outline placeholder) paired with T2/T6 for visual.
- **A11y-critical "works on any theme":** T5 (dual-outline).
- **Table cells / grid cells:** T13 (mix-blend-mode).
- **Editor chrome that shouldn't overlap the block at all:** T14 (gutter).
- **Design-tool-level selection:** T15 (SVG overlay).

---

## Transition timing + state machines (D5b)

Three points from marketing-animation practice (`/animate` skill, GTM plugin) translate directly to selection-state transitions. Not load-bearing on the pattern ranking above, but useful when implementing whichever technique is chosen.

### Interactive UI timing cap: 150–300ms

The 500ms entrance duration common in marketing-site animations is wrong for selection-state transitions — those are interactive UI, not scroll-triggered reveals. Per [Nielsen Norman Group](https://www.nngroup.com/articles/response-times-3-important-limits/) and [Material 3 Motion](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs), interactive UI (dropdowns, modals, selection state) should cap at **150–300ms**. Anything longer feels laggy; anything shorter feels snappy but jarring on a busy interface. For block-selection ring appearing/disappearing:

- **150ms** — perceived as instant; good for click-initiated selection where user already knows where they clicked
- **200ms** — default for state transitions; feels intentional but not slow
- **300ms** — upper bound; use for keyboard-initiated selection where the eye needs time to track

Easing: `ease-out` (CSS) or cubic-bezier `(0.16, 1, 0.3, 1)` (easeOutExpo) for entry; `ease-in` for exit. Asymmetric timing (entry slower than exit, or vice versa) is observed in Sonner/Vaul but not universally applied.

### `data-state` attribute pattern over class toggling

[Sonner](https://github.com/emilkowalski/sonner), [Vaul](https://github.com/emilkowalski/vaul), [Radix UI](https://github.com/radix-ui/primitives), and [shadcn/ui](https://ui.shadcn.com/) all use `data-state="..."` attributes rather than class toggling for animated state. The pattern:

```css
.block {
  transition: box-shadow 200ms ease-out, background-color 200ms ease-out;
}
.block[data-selected="true"] {
  box-shadow: 0 0 0 2px var(--ring);
}
.block[data-selected="true"][data-needs-config="true"] {
  box-shadow: 0 0 0 2px var(--ring), 0 0 0 4px var(--ring-hint);
}
.block[data-dragging="true"] {
  box-shadow: none;
  opacity: 0.6;
}
```

**Why `data-*` over classes:** multiple orthogonal states compose cleanly (`data-selected="true" data-dragging="true"`) without exploding the class list. CSS selectors remain readable. And values aren't just boolean — `data-state="selected"` vs `data-state="hover"` vs `data-state="dragging"` allows mutually-exclusive states on a single attribute. Emil Kowalski's body of work (~12k stars on Sonner alone) is the canonical demonstration.

### CSS-only enter/exit with `@starting-style` + `transition-behavior: allow-discrete`

If the selection ring should fade in rather than pop in, this can now be pure CSS (no `IntersectionObserver`, no JS-driven mount/unmount). [Baseline](https://web.dev/baseline) August 2024 (Chrome 117+, Safari 17.4+, Firefox 129+):

```css
.block[data-selected="true"]::before {
  content: '';
  position: absolute;
  inset: -4px;
  border: 2px solid var(--ring);
  border-radius: calc(var(--block-radius) + 4px);
  opacity: 1;
  transition: opacity 200ms ease-out, display 200ms allow-discrete;

  @starting-style {
    opacity: 0;
  }
}

/* Exit: ring fades out before unmount */
.block:not([data-selected="true"])::before {
  opacity: 0;
}
```

For editors targeting modern browsers only, this eliminates the need for a selection-transition wrapper. Firefox 121 shipped `:has()` in Nov 2023 and `@starting-style` in Aug 2024 — both are now widely deployable.

### Compositor-safe properties only

For a selection ring transition, animate `opacity` and `transform` (via box-shadow or pseudo-element scale), not `outline-width` or `border-width`. The latter cause paint/layout thrash; the former run on the compositor thread. This is why the `::before` / `::after` patterns (T10, T11, T12) animate opacity rather than width — they compose better.

### Reduced-motion composition

Per `/animate`'s no-motion-first pattern: **opacity and color transitions stay active under `prefers-reduced-motion: reduce`; only spatial motion opts in.** A ring fading in is safe. A ring sliding in from the side is not. Apply:

```css
.block[data-selected="true"]::before {
  transition: opacity 200ms ease-out;  /* always active */
}
@media (prefers-reduced-motion: no-preference) {
  .block[data-selected="true"]::before {
    transition: opacity 200ms ease-out, transform 200ms ease-out;  /* adds spatial motion */
  }
  .block[data-selected="true"]::before {
    transform: scale(1);  /* starts at 0.95, scales to 1 */
  }
}
```

This is more robust than the common blanket `@media (prefers-reduced-motion: reduce) { * { animation: none } }` rule, which kills helpful transitions indiscriminately.

---

## Drag interaction (D6)

Five patterns observed:

1. **Hide source selection ring + dashed placeholder** (Tiptap, BlockNote) — `opacity: 0.6; box-shadow: none !important; outline: 2px dashed #9ca3af`. Prevents visual collision between drag ghost + source ring.
2. **Drop-zone container highlight + position line** (Atlassian Pragmatic D&D) — coarse feedback (container) + fine feedback (insertion line at exact drop position).
3. **No change on source, drop-target only** (Notion) — quieter visual, simpler state management.
4. **Drag handle animates, block content doesn't** (Tiptap primary) — minimal; focus on the handle.
5. **Custom drag ghost via `DataTransfer.setDragImage`** (Figma, Framer) — full control, higher complexity.

For a block editor using selection rings, **Pattern 1** is the most common convention: selection ring is replaced by a subdued dashed outline during drag, avoiding a "ring on top of ghost" look.

---

## Nested + multi-block selection (D7)

Full evidence in [evidence/nested-and-multi-selection.md](evidence/nested-and-multi-selection.md). Directly relevant for editors with compound components (Card inside Cards, Step inside Steps, Tab inside Tabs).

### Nested selection: innermost wins for visible chrome

Across surveyed editors, **no one outlines both parent and child simultaneously**. The dominant pattern (WordPress Gutenberg) assigns the parent a `has-child-selected` class — computed in the store when a descendant is selected — and uses it for z-index lift + opacity preservation (focus mode), but never a visible outline. The innermost selected block is the only one with a ring.

```scss
/* Gutenberg: ancestor lift, no outline */
.block.is-selected,
.block.has-child-selected {
  z-index: 1;
}

/* Focus mode: ancestors stay visible while unrelated siblings fade */
.is-focus-mode .block:not(.has-child-selected) { opacity: 0.2; }
.is-focus-mode .block.is-selected { opacity: 1; }
```

**Implications for our use case** (Cards-in-Cards, Steps-in-Steps, Tabs-with-Tab): when a child block is selected, don't paint an outline on the parent. The parent's chrome (its border, header, etc.) is enough to signal containment; the child's ring indicates "selection is here." For orientation, add a **breadcrumb** (Gutenberg-style) rather than stacked outlines.

### State-based classes over `:has()` for ancestry

No surveyed editor uses `:has()` to propagate selection state up the tree. All precompute ancestry in the store/model and apply classes. Reasons: performance (pre-Firefox-121 compat, large-doc perf), debuggability, clearer React re-render semantics.

### Multi-block selection: per-block overlay + fade-in dominant

| Editor | Multi-select rendering |
|---|---|
| Gutenberg | `::after` per block, 40% blue overlay, 100ms fade-in |
| Anytype | Single union rect (`#selection-rect`) spanning all |
| Tiptap | `Decoration.node()` per node with `ProseMirror-selectednoderange` class |
| Lexical | Custom per-editor (no default) |
| Figma | Per-object outline + union outline simultaneously |

Most common: **per-block overlay** (Gutenberg, Tiptap). Union rect (Anytype) is simpler but loses individual-block feedback. Figma's combined per-object + union is the most informative but harder to achieve in HTML/CSS.

### Three-class selection subtype (Gutenberg pattern)

Gutenberg distinguishes selection subtypes via mutually-exclusive classes:

| Class | Meaning |
|---|---|
| `is-selected` | Single block, whole-block selected |
| `is-multi-selected` | Part of a contiguous range |
| `is-partially-selected` | Text caret inside block, block itself not selected |
| `has-child-selected` | A descendant is selected (ancestor indicator) |
| `is-highlighted` | Hover or nav target |

Critical rule: `.is-multi-selected:not(.is-partially-selected)` ensures the multi-select overlay doesn't paint when text is selected inside the block. Without this negation, multi-select overlay conflicts with text selection highlight.

### Keyboard + click conventions

| Pattern | Editor | Behavior |
|---|---|---|
| Shift-Arrow extends range | Tiptap NodeRangeSelection | Each press adds one more block to the range |
| Repeat-click climbs ancestry | Gutenberg ("clickthrough") | 1st click = innermost, 2nd = parent, 3rd = grandparent |
| Click breadcrumb segment | Gutenberg | Jumps directly to any ancestor |
| Alt-click | Figma | Reach parent container |

### Focus mode as orientation aid

Gutenberg's "focus mode" fades all non-ancestor blocks to 20% opacity. The selected block + its ancestry chain stay at 100%. Creates a spotlight that makes deep-nested location visible without stacked outlines. Worth considering for editors with heavy nesting.

---

## Separate-layer rendering (D9)

Full evidence in [evidence/separate-layer-rendering.md](evidence/separate-layer-rendering.md). Deep-dive on [tldraw](https://github.com/tldraw/tldraw), [Excalidraw](https://github.com/excalidraw/excalidraw), [React Flow](https://github.com/xyflow/xyflow), [Floating UI](https://github.com/floating-ui/floating-ui), and the [Tiptap BubbleMenu](https://github.com/ueberdosis/tiptap/tree/main/packages/extension-bubble-menu) pattern.

### What the production pattern actually looks like

tldraw's layer stack:
```
.tl-canvas
├── .tl-html-layer.tl-shapes       ← per-shape DOM (user content)
├── .tl-overlays                    ← transparent hit-test layer
│   ├── <canvas> .tl-canvas-indicators   ← N-shape outlines in ONE canvas pass
│   ├── .tl-html-layer              ← shared transform with .tl-shapes
│   │   └── <svg> .tl-selection__fg ← selection box + 8 resize handles
│   └── <svg> .tl-user-handles      ← per-shape custom handles
└── .tl-canvas__in-front            ← context menus, floating UI
```

Three architectural patterns that actually scale:

1. **Shared CSS transform on parent layer** eliminates per-element coordinate transforms. tldraw applies one `scale() translate()` to both the shape layer and the overlay layer via `useQuickReactor`. They move in lockstep on camera change without recalculating anything.

2. **Canvas for many outlines, SVG for the selection box.** `CanvasShapeIndicators` renders every selected-shape outline in a single 2D-canvas pass — O(1) DOM nodes regardless of selection count. The selection BOX + handles stay SVG (DOM-inspectable + a11y-amenable).

3. **Signal-driven state, not derived state.** Selection is an atom; bounds are `@computed` over it. Anything that reads bounds auto-subscribes; anything that writes shapes auto-invalidates. No manual dependency tracking, no stale closures.

### Floating UI is the production reference for position-sync

Rather than writing `ResizeObserver` + scroll listener + RAF batching + coordinate math yourself, [`@floating-ui/dom`'s `autoUpdate`](https://floating-ui.com/docs/autoupdate) combines all of them with the elegant `unobserve/reobserve-via-RAF` trick to prevent resize-loops:

```typescript
const resizeObserver = new ResizeObserver(([firstEntry]) => {
  resizeObserver.unobserve(floating)                 // break potential loop
  cancelAnimationFrame(reobserveFrame)
  reobserveFrame = requestAnimationFrame(() =>
    resizeObserver?.observe(floating)                // reobserve next frame
  )
  update()
})
```

Plus scroll on all overflow ancestors (passive), `IntersectionObserver` for layout-shift detection, and optional per-frame RAF loop for transform-based motion. Use this — don't reinvent.

### Virtual elements decouple positioning from DOM presence

Floating UI's `computePosition(reference, floating, ...)` accepts any object with `{ getBoundingClientRect, getClientRects }`. Tiptap's BubbleMenu uses this to anchor toolbars to any selection type:

- **TextSelection** → `posToDOMRect(view, from, to)` — computed rect from PM positions
- **NodeSelection** → actual DOM node's `getBoundingClientRect()`
- **CellSelection** → `combineDOMRects(fromDOM, toDOM)` — union of two cells

This is the single most reusable pattern from the entire dimension. A block-level action toolbar tracking your selection is ~30 lines of code sitting on top of `@tiptap/extension-bubble-menu` or a thin wrapper around Floating UI.

### Performance machinery checklist (if you go separate-layer)

From [evidence/separate-layer-rendering.md](evidence/separate-layer-rendering.md) and [Floating UI autoUpdate](https://github.com/floating-ui/floating-ui/blob/master/packages/dom/src/autoUpdate.ts):

- **`useLayoutEffect`** over `useEffect` for measurement (prevents paint-flicker)
- **`useSyncExternalStore`** when subscribing to external position state (tearing-safe under concurrent mode)
- **`ResizeObserver` + RAF batching** for observing the selected block's size
- **Scroll listeners with `{ passive: true }`** on all overflow ancestors
- **`IntersectionObserver` culling** for virtualization beyond ~50 selected items
- **FastDOM read-then-write batching** — measure all, then mutate all, to avoid N layouts
- **Never mutate the observed element inside ResizeObserver callback** — ResizeObserverLoopError guard

### The honest verdict for a rich-text block editor

| Signal | Which direction |
|---|---|
| Multi-select with group operations (drag/resize/delete many) | Separate layer likely worth it |
| Resize/rotation handles beyond block's own chrome | Separate layer worth it |
| Zoom/pan is a product feature | Separate layer mandatory |
| Canvas-style lasso-select, bounding-box manipulation | Separate layer mandatory |
| Multi-cursor collaboration indicators | Separate layer worth it |
| 500+ blocks with multi-select spanning most | Canvas-indicator layer helps |
| Action toolbar tracking selection | **Floating UI BubbleMenu — low overhead, do this regardless** |
| Single-block selection, per-block chrome carries the indicator | Inline CSS techniques (T9/T10/T11) are sufficient |
| <100 blocks typical | Separate layer is over-engineering |

**For most rich-text block editors, including the one this report was commissioned for:** inline CSS techniques (T9 border-color swap, T10 behind-content halo, T11 overlay tint) for the selection OUTLINE + Floating UI + virtual elements (Tiptap BubbleMenu pattern) for the action TOOLBAR. That's the hybrid.

Deferring the tldraw-style full separate-layer architecture until a second feature arrives that actually needs it (multi-select-with-group-ops, media resize handles, zoom/pan) is the right call. Baseline complexity estimate: **~1400-2600 LoC** for a minimal implementation (store, overlay layer, handles, sync, a11y). Inline CSS equivalents are 20-100 LoC per variant.

---

## Conclusions

Three load-bearing observations:

1. **The "double-outline" problem has no universal fix — every serious editor uses at least one block-type special case.** Uniform rules break down on media, callouts, code blocks, or inline elements. Expect to ship 2–3 techniques: one default + exceptions for blocks with strong chrome.

2. **The three cleanest single-technique solutions, ranked by complexity:** T9 (border-color swap) is the simplest when every block has a border; T10 (behind-content halo) is the most visually elegant but needs wrapper discipline; T11 (overlay tint) is the most forgiving but dims content. All three eliminate double-outline at the cost of losing a distinct "new ring."

3. **A11y-compliance and aesthetic polish are not either-or.** The transparent-outline-placeholder + box-shadow pairing gives both: visible ring in normal mode, auto-visible outline in WHCM, smooth transitions, WCAG 2.4.13 compliance. This pattern has no downside over `box-shadow`-alone besides slightly more verbose CSS.

### Ranked shortlist of patterns worth adopting in a new block editor

| Rank | Pattern | Why |
|---|---|---|
| 1 | **T3 + T10 combo** — transparent-outline-placeholder + `::before` behind-content halo | Cleanest visual; WHCM-safe; no double-outline; works on any bordered block with a stacking context |
| 2 | **T9 border-color swap** | Simplest for editors where every block has a border; zero extra layers |
| 3 | **T11 `::after` overlay tint (Anytype style)** | Most forgiving — works on any block color. Accept minor content dimming. |
| 4 | **T14 gutter bar** | Sidesteps the problem entirely by moving the indicator off the block. Loses visual strength but gains simplicity + universality. |
| 5 | **T15 SVG overlay layer** | Reserved for editors that need multi-select, handles, or Figma-level control. High complexity. |

Not recommended for new editors:
- **T1 or T2 alone** on bordered blocks — produces double-outline.
- **T16 negative outline-offset** — unreliable across browsers + consumes content padding.
- **T13 mix-blend-mode** — great for tables, but forced-colors interaction is under-specified for general blocks.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Linear, Craft, Obsidian, Ghost Koenig, BlockNote:** selection CSS not surfaced in public documentation or easily inspectable. Would require runtime DOM inspection of live web apps to fully characterize.
- **AFFiNE / BlockSuite edgeless mode:** selection UI likely differs from linear doc mode; not fully explored.
- **Forced-colors interaction with `mix-blend-mode`:** MDN documentation thin; empirical testing in WHCM recommended before committing to T13.

### Out of scope (per rubric)

- Text-level selection indicators (carets, selection highlights)
- Non-editor selection UIs (list items, checkboxes, grid selection)
- Mobile touch-selection UX
- Color theory / brand-specific color choice for indicators

---

## References

### Evidence Files
- [editor-survey.md](evidence/editor-survey.md) — production findings across 13+ editors with source citations
- [a11y-requirements.md](evidence/a11y-requirements.md) — WCAG/ARIA/forced-colors/reduced-motion normative requirements
- [css-techniques.md](evidence/css-techniques.md) — 16 CSS techniques with code, trade-offs, and comparison matrix
- [transitions-and-state-machines.md](evidence/transitions-and-state-machines.md) — timing, easing, `data-state` patterns, `@starting-style`, compositor-safe properties
- [nested-and-multi-selection.md](evidence/nested-and-multi-selection.md) — Gutenberg's `has-child-selected`, Tiptap NodeRangeSelection, Anytype union rect, breadcrumb + focus-mode patterns
- [separate-layer-rendering.md](evidence/separate-layer-rendering.md) — tldraw/Excalidraw/React Flow/Floating UI/Tiptap BubbleMenu architecture deep-dives + position-sync machinery + "when is it worth it" verdict

### External Sources — Specs

- [WCAG 2.2 Understanding 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [WCAG 2.2 Understanding 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum)
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/)
- [WAI-ARIA Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
- [MDN `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)
- [MDN `@media (forced-colors)`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)
- [MDN `@media (prefers-reduced-motion)`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [MDN outline / outline-offset](https://developer.mozilla.org/en-US/docs/Web/CSS/outline)
- [MDN box-shadow](https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow)
- [MDN `:has()`](https://developer.mozilla.org/en-US/docs/Web/CSS/:has)

### External Sources — Editor source

- [Outline shared/editor/components/Styles.ts](https://github.com/outline/outline/blob/main/shared/editor/components/Styles.ts)
- [Tiptap demos DragHandle React styles](https://github.com/ueberdosis/tiptap/tree/main/demos/src/Extensions/DragHandle/React)
- [Tiptap BubbleMenu plugin](https://github.com/ueberdosis/tiptap/tree/main/packages/extension-bubble-menu)
- [Lexical playground PlaygroundEditorTheme.css](https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/themes/PlaygroundEditorTheme.css)
- [Anytype SCSS block selection](https://github.com/anyproto/anytype-ts/tree/main/src/scss/block)
- [tldraw selection foreground](https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/canvas/TldrawSelectionForeground.tsx)
- [tldraw canvas shape indicators](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/components/default-components/CanvasShapeIndicators.tsx)
- [Excalidraw selection rendering](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/renderer/interactiveScene.ts)
- [React Flow NodesSelection](https://github.com/xyflow/xyflow/tree/main/packages/react/src/components/NodesSelection)
- [Floating UI computePosition](https://github.com/floating-ui/floating-ui/blob/master/packages/core/src/computePosition.ts)
- [Floating UI autoUpdate](https://github.com/floating-ui/floating-ui/blob/master/packages/dom/src/autoUpdate.ts)
- [Tailwind Ring Width utilities](https://tailwindcss.com/docs/ring-width)

### External Sources — A11y guidance

- [Sara Soueidan: A Guide to Designing Accessible Focus Indicators](https://www.sarasoueidan.com/blog/focus-indicators/)
- [Deque: Designing Useful and Usable Focus Indicators](https://www.deque.com/blog/give-site-focus-tips-designing-usable-focus-indicators/)
- [tempertemper: Windows High Contrast Mode and Focus Outlines](https://www.tempertemper.net/blog/windows-high-contrast-mode-and-focus-outlines)
- [Automattic Design: Accessibility in the Block Editor](https://automattic.design/2021/03/12/accessibility-in-the-block-editor/)
- [Atlassian Design: Pragmatic D&D Drop Indicator](https://atlassian.design/components/pragmatic-drag-and-drop/optional-packages/react-drop-indicator/)

### Related Research

- [context-bridge-registry-architecture/](../context-bridge-registry-architecture/) — complementary NodeView pattern for compound component selection state propagation
- [fumadocs-ecosystem-component-blocks-reuse/](../fumadocs-ecosystem-component-blocks-reuse/) — descriptor registry patterns (adjacent concern, not selection-specific)
