# Evidence: CSS/DOM Techniques (D5)

**Dimension:** Working CSS patterns for block selection indicators, with focus on avoiding the double-outline look
**Date:** 2026-04-16
**Sources:** MDN CSS references (outline, box-shadow, :has, clip-path, mix-blend-mode), Tailwind docs (v3/v4 ring utilities), Modern CSS Solutions, CSS-Tricks, Smashing Magazine (Windows High Contrast + CSS vars)

---

## Techniques catalog

### T1 — Outline + outline-offset (static ring)

```css
.block.is-selected {
  outline: 3px solid #2563eb;
  outline-offset: 2px;   /* positive = gap outside; negative = inside */
}
```

- **Pros:** No layout impact, forced-colors safe (outline is preserved + auto-colored), simple.
- **Cons:** `outline` respects `border-radius` only on modern browsers (Chrome 88+, Firefox 87+, Safari 16+). Can't use opacity/alpha easily. Overlaps the block's own border — causes double-outline if the block is bordered.
- **When:** Blocks without their own chrome; focus indicators on plain elements.

---

### T2 — Box-shadow ring

```css
.block.is-selected {
  box-shadow: 0 0 0 3px #2563eb;
}
/* Multiple rings */
.block.is-selected {
  box-shadow: 0 0 0 2px white, 0 0 0 5px #2563eb;
}
```

- **Pros:** Respects border-radius in all modern browsers. Full opacity/alpha control. Layered rings (white halo + color).
- **Cons:** ⚠️ **Forced to `none` in Windows High Contrast Mode** — invisible to WHCM users. Cannot be the only indicator without a transparent-outline fallback.
- **When:** Modern-browser projects where forced-colors fallback is provided separately.

---

### T3 — Transparent outline placeholder (layout-shift-proof + a11y)

```css
.block {
  outline: 3px solid transparent;  /* reserves space; invisible */
  outline-offset: 2px;
  transition: outline-color 0.15s;
}
.block.is-selected { outline-color: #2563eb; }

@media (forced-colors: active) {
  .block.is-selected { outline-color: CanvasText; }
}
```

- **Pros:** No layout shift on selection change. Forced-colors auto-handles. Canonical a11y pattern.
- **Cons:** Same border-radius caveats as T1.
- **When:** Whenever a11y is a hard requirement. Combine with T2 for visual polish.

---

### T4 — `:focus-visible` for keyboard-only indicator

```css
.block:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}
/* Mouse-clicked focus does NOT get a ring */
```

- **Pros:** Only keyboard users see the ring; click users don't see visual noise.
- **Cons:** Requires the element to receive DOM focus. For ProseMirror `NodeSelection` (which doesn't move DOM focus to the block), you'd apply an `.is-selected` class and manually distinguish origin via plugin state.
- **When:** For elements that are natively focusable. For PM-driven selection, emulate the pattern by tracking whether the last selection change was keyboard-initiated.

---

### T5 — Dual-outline (black + white halo) — a11y-robust against any background

```css
.block:focus-visible,
.block.is-selected {
  outline: 3px solid #000;
  box-shadow: 0 0 0 6px #fff;
}
@media (forced-colors: active) {
  .block:focus-visible { outline-color: CanvasText; }
}
```

- **Pros:** 21:1 contrast guaranteed; works on any page background + any block fill.
- **Cons:** Aesthetically "safety-focused" — looks utilitarian. Doesn't fit brand-themed editors.
- **When:** A11y-critical surfaces (government, healthcare). Can be the "accessibility fallback" layered under brand styling via `@supports` / media queries.

---

### T6 — CSS custom property swap (themeable)

```css
.block {
  box-shadow: 0 0 0 var(--ring-width, 0) var(--ring-color, transparent);
  transition: box-shadow 0.15s;
}
.block.is-selected { --ring-color: #2563eb; --ring-width: 3px; }
.block.is-focused  { --ring-color: #dc2626; --ring-width: 4px; }
@media (prefers-color-scheme: dark) {
  .block.is-selected { --ring-color: #60a5fa; }
}
```

- **Pros:** Theme-aware in one declaration. Easy to layer multiple selection states (focused vs selected vs error). Single source of truth.
- **Cons:** Still box-shadow based → needs forced-colors fallback.
- **When:** Design systems with multi-theme support.

---

### T7 — Tailwind `ring` utilities

```html
<div class="rounded-lg ring-2 ring-blue-500 ring-offset-2 ring-offset-white">...</div>
```

Generates (Tailwind v3):
```css
box-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
```

- **Pros:** Battle-tested, utility-first. `ring-inset` for inside rings. `ring-offset` for a gap + halo color.
- **Cons:** Same box-shadow caveats (forced-colors). Verbose HTML.
- **When:** Tailwind projects; prototyping.

---

### T8 — `:has()` to conditionally suppress the block's own border on selection

```css
.block { border: 2px solid #e5e7eb; border-radius: 8px; }

/* When selected, hide the inner border and show only the outer ring */
.block.is-selected { border-color: transparent; }
.wrapper:has(.block.is-selected) .block { border-color: transparent; }
```

- **Pros:** Eliminates double-outline by removing the inner line entirely. Clean visual.
- **Cons:** `:has()` requires Chrome 105+ / Safari 15.4+ / Firefox 121+. Changes the visual identity of the block (its chrome disappears during selection) — can be disorienting.
- **When:** Blocks where the outer ring is strong enough to convey block identity on its own.

---

### T9 — Border-color swap (replace, don't add)

```css
.block { border: 2px solid #e5e7eb; border-radius: 8px; }
.block.is-selected { border-color: #2563eb; border-width: 2px; }  /* same width, different color */
```

- **Pros:** Zero double-outline — the block's existing border IS the indicator. Minimal visual change.
- **Cons:** Requires the block to already have a border. Contrast shift may not hit WCAG 2.4.13 if both colors are similar-weight.
- **Used by:** Tiptap HorizontalRule, Lexical PageBreakNode.
- **When:** Blocks with a thin default border that can be strengthened/recolored for selection.

---

### T10 — `::before` pseudo-element behind content (Tiptap DragHandle pattern)

```css
.wrapper.is-selected {
  position: relative;
}
.wrapper.is-selected::before {
  content: '';
  position: absolute;
  inset: -0.25rem;         /* extends beyond block on all sides */
  background: rgba(112, 207, 248, 0.31);
  border-radius: calc(var(--block-radius) + 0.25rem);
  z-index: -1;             /* behind the block's own border */
  pointer-events: none;
}
```

- **Pros:** Selection lives BEHIND the block's border — no visual overlap at all. Elegant for blocks with their own chrome.
- **Cons:** Requires `position: relative` on the wrapper. Requires the block NOT to have an opaque background (or the halo is hidden). Requires a positive stacking context — `z-index: -1` only works if no ancestor has `z-index: auto`.
- **Used by:** Tiptap `extension-drag-handle-react` DragHandle styles.
- **When:** Wrapper has no opaque background of its own and there's a stable stacking context.

---

### T11 — `::after` overlay with opacity (Anytype general pattern)

```css
.wrapper.is-selected {
  position: relative;
}
.wrapper.is-selected::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(55, 122, 255, 0.25);
  pointer-events: none;
  border-radius: inherit;   /* matches wrapper radius */
  z-index: 10;              /* above content */
}
```

- **Pros:** Works on any block, any color. Semi-transparent overlay tints the block selection-color without hiding content. No double-outline because the overlay covers the border.
- **Cons:** Dims content behind the overlay. Needs per-block-type `border-radius` to match. Doesn't provide a distinct edge — can look vague without a paired outline.
- **Used by:** Anytype (all non-media blocks).
- **When:** Non-media blocks with modest chrome; want a Notion-like "selection tint" aesthetic.

---

### T12 — `::before` outer ring positioned OUTSIDE bounds (Anytype media pattern)

```css
.media-wrapper.is-selected { position: relative; }
.media-wrapper.is-selected::before {
  content: '';
  position: absolute;
  left: -2px; top: 0;
  width: calc(100% + 4px);
  height: 100%;
  border: 2px solid #2563eb;
  border-radius: 6px;
  pointer-events: none;
  /* No fill — just a ring around the outside of the block */
}
```

- **Pros:** Ring sits entirely outside the block's own border — never overlaps chrome. Perfect for media (images, embeds) with tight visual identity.
- **Cons:** Verbose; requires a wrapper. Doesn't work for elements that need to fit their parent's box tightly.
- **Used by:** Anytype media blocks.
- **When:** Blocks with strong chrome (images, embeds, cards) where you want a distinct "something is wrapped around this."

---

### T13 — `mix-blend-mode: multiply/difference` (contrast-agnostic tint)

```css
.block.is-selected::after {
  content: '';
  position: absolute;
  inset: 0;
  background: highlight;      /* system color */
  mix-blend-mode: multiply;   /* darkens whatever's behind */
  pointer-events: none;
}
```

- **Pros:** Auto-adapts contrast to any underlying color — no need to pick "the right blue" for each theme. Using `highlight` system color pulls in the user's OS accent.
- **Cons:** `mix-blend-mode` doesn't composite with all backdrops identically. Forced-colors interaction not well-documented.
- **Used by:** Lexical table cells, Anytype resize pattern.
- **When:** Blocks rendered over variable backgrounds (table cells, grid items).

---

### T14 — Gutter/side-bar indicator (no ring at all)

```css
.block { position: relative; padding-left: 1rem; }
.block::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: transparent;
  border-radius: 2px;
}
.block.is-selected::before { background: #2563eb; }
```

- **Pros:** Doesn't overlap block chrome at all. Works on ANY block regardless of its own border/corners. Minimal visual noise.
- **Cons:** Less immediately recognizable as "selection" than a ring. Consumes left margin space. Weaker signal for users unfamiliar with the pattern.
- **Used by:** WordPress Gutenberg (block-edit gutter), VS Code sidebar, Notion-style editors.
- **When:** Editors where a subtle, non-intrusive indicator is preferred; blocks have varied chrome.

---

### T15 — SVG overlay in a separate layer (Figma-style)

```jsx
{isSelected && (
  <svg style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
    <rect x={rect.left - 4} y={rect.top - 4}
          width={rect.width + 8} height={rect.height + 8}
          fill="none" stroke="#2563eb" strokeWidth="3" rx="8" />
  </svg>
)}
```

- **Pros:** Complete control. Unaffected by block's styling. Can draw multi-select union outlines easily. Scale handles, rotation handles, everything is possible.
- **Cons:** Requires JS for measurement + reposition on scroll/resize. Higher complexity. Does not respect forced-colors natively (SVG stroke is not system-colored).
- **Used by:** Figma, Framer, design-tool editors.
- **When:** Editor needs design-tool-level selection (multi-select, handles, transformation). Overkill for rich-text block editors in most cases.

---

### T16 — Negative outline-offset (inset ring)

```css
.block.is-selected {
  outline: 2px solid #2563eb;
  outline-offset: -4px;   /* ring inside the block, inside its own border */
}
```

- **Pros:** Ring never overlaps the block's outer border — always inside.
- **Cons:** Eats into content padding. Can clash with the block's own inner chrome. Rectangular in legacy browsers (doesn't follow border-radius).
- **When:** Blocks with enough padding that an inset ring doesn't obscure content.

---

## Drag interaction patterns (D6)

### DP1 — Hide selection ring on source during drag (Tiptap, BlockNote)

```css
.block.is-dragging {
  opacity: 0.6;
  box-shadow: none !important;
  outline: 2px dashed #9ca3af;
}
```

Replaces the selection ring with a low-key dashed outline on the source during drag. Prevents visual collision between the drag ghost + the source's selection ring.

---

### DP2 — Drop-target zone highlight + drop-position line (Atlassian Pragmatic D&D)

```css
.drop-zone.is-over {
  outline: 2px solid #3b82f6;
  outline-offset: -2px;
  background: rgba(59, 130, 246, 0.05);
}
.drop-position-line {
  position: absolute; left: 0; right: 0; height: 2px;
  background: #2563eb;
}
```

Coarse feedback (container highlight) + fine feedback (insertion line at exact drop position).

---

### DP3 — Drop target only (Notion conservative)

Source stays unchanged; only the drop target block receives a distinct bright ring. Works when drag operations are infrequent and a quiet source is preferred.

---

### DP4 — Drag handle animates, block content doesn't (Tiptap primary)

Only the drag handle changes visual state (color, icon, box-shadow) during drag; the block itself remains pristine. Minimal, non-distracting.

---

### DP5 — Custom drag ghost via `DataTransfer.setDragImage()`

Replace the browser's default ghost with a styled preview. Used by design tools (Figma, Framer). Expensive but gives full control.

---

## Comparison matrix

| # | Technique | Border-radius safe | Forced-colors safe | Layout impact | Suppresses double-outline | Complexity |
|---|---|---|---|---|---|---|
| T1 | outline + offset | Modern browsers only | ✅ | None | ❌ (overlaps) | Low |
| T2 | box-shadow ring | ✅ | ❌ | None | Partial (overlays) | Low |
| T3 | transparent outline placeholder | ✅ | ✅ | None | ❌ | Low |
| T4 | `:focus-visible` | N/A | ✅ | N/A | N/A | Low |
| T5 | dual-outline (b+w) | ✅ | ✅ | None | Partial | Low |
| T6 | custom-property swap | ✅ | depends | None | Partial | Medium |
| T7 | Tailwind ring | ✅ | ❌ | None | Partial | Very low |
| T8 | `:has()` suppress border | ✅ | ✅ (if paired with outline) | None | ✅ | Medium |
| T9 | border-color swap | ✅ | ✅ | None | ✅ | Very low |
| T10 | ::before behind (z-index:-1) | ✅ | ✅ (if paired) | None | ✅ | Medium |
| T11 | ::after overlay | ✅ | depends on color | None | ✅ | Medium |
| T12 | ::before outer ring | ✅ | depends | None | ✅ | Medium |
| T13 | mix-blend-mode tint | ✅ | depends | None | ✅ | Medium |
| T14 | gutter/side-bar | N/A | ✅ | Margin | ✅ | Low |
| T15 | SVG overlay layer | ✅ | ❌ natively | None | ✅ | High |
| T16 | negative outline-offset | Modern browsers only | ✅ | Inset into content | ✅ | Low |

---

## Gaps / follow-ups

- Forced-colors interaction with `mix-blend-mode` is poorly documented.
- Browser support for `:has()` still excludes Firefox before 121 (Nov 2023) — progressive-enhancement strategy may be needed.
- T15 (SVG overlay) could be paired with `forced-colors` media query to swap stroke to `CanvasText` manually.
