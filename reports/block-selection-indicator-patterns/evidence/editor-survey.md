# Evidence: Editor Survey (D2)

**Dimension:** How production block editors signal block-level selection
**Date:** 2026-04-16
**Sources:** Outline (OSS), Notion (web), Craft (docs), Linear (web), BlockNote (OSS), Lexical playground (OSS), Tiptap examples (OSS), Sanity docs, Ghost Koenig (closed), Obsidian (closed), Anytype (OSS), AFFiNE (partial), Figma (docs)

---

## Key files / pages referenced

- `outline/shared/editor/components/Styles.ts:928-935` — ProseMirror-selectednode 2px outline
- `outline/shared/editor/components/Styles.ts:120-128` — math blocks use border+background (outline: none) to avoid double-outline
- `outline/shared/editor/components/Styles.ts:1291-1333` — callout .notice-block with 4px left border (NOT modified on selection)
- `outline/shared/editor/components/Styles.ts:1377-1399` — blockquote::before 2px left border (unchanged on selection)
- `outline/app/editor/index.tsx:947,954-962` — mention darkened outline pattern
- `tiptap/demos/src/Extensions/DragHandle/React/styles.scss:36-52` — `::before` pseudo with `z-index: -1` behind content
- `tiptap/demos/src/Nodes/Image/React/styles.scss:13-14` — `outline: 3px solid var(--purple)` on img
- `tiptap/demos/src/Nodes/HorizontalRule/React/styles.scss:12-14` — border-color swap (not add)
- `tiptap/demos/src/Extensions/Focus/React/styles.scss:29-32` — `box-shadow: 0 0 0 2px var(--purple)` has-focus
- `lexical-playground/src/themes/PlaygroundEditorTheme.css:333-343` — tableCellSelected `::after` with `mix-blend-mode: multiply`
- `lexical-playground/src/themes/PlaygroundEditorTheme.css:297-298` — tableSelected outline 2px
- `lexical-playground/src/nodes/DateTimeNode/DateTimeNode.css:18-20` — pill outline 2px on .selected
- `lexical-playground/src/nodes/PageBreakNode/index.css:58-64` — border-color swap on .selected
- `lexical-playground/src/nodes/PollNode.css:19-21` — outline 2px on .focused
- `anytype/src/scss/common.scss` — `.selectionTarget.isSelectionSelected::after` full-width fill overlay
- `anytype/src/scss/block/media.scss:9-13` — media `.isFocused::before` outer ring `left: -2px; width: calc(100% + 4px)`
- `anytype/src/scss/block/media.scss:17-21` — resize pattern overlay `mix-blend-mode: difference`
- `anytype/src/scss/block/common.scss:99-105` — drag-drop indicator bars

---

## Findings

### Finding: Outline uses ProseMirror's `.ProseMirror-selectednode` with a 2px solid outline; special-cases blocks that already have their own border
**Confidence:** CONFIRMED
**Evidence:** `outline/shared/editor/components/Styles.ts:928-935, 120-128`

```css
.ProseMirror-selectednode {
  outline: 2px solid ${props.theme.selected};
}

/* Math blocks override to avoid double outline */
.math-inline, .math-block {
  &.ProseMirror-selectednode {
    outline: none;
    border: 1px solid ${props.theme.codeBorder};
    background: ${props.theme.codeBackground};
  }
}
```

**Implications:** Outline team hit the double-outline problem on math blocks and explicitly opted out of outline for that node type — replacing with a border+background color swap. List items handle it via `::after` pseudo-element. Not a uniform solution — per-block handling.

---

### Finding: Tiptap's DragHandle extension uses a `::before` pseudo-element BEHIND content (negative z-index) — cleanest solution to double-outline
**Confidence:** CONFIRMED
**Evidence:** `tiptap/demos/src/Extensions/DragHandle/React/styles.scss:36-52`

```scss
.ProseMirror-selectednode {
  position: relative;

  &::before {
    content: '';
    position: absolute;
    z-index: -1;
    top: -0.25rem;
    left: -0.25rem;
    right: -0.25rem;
    bottom: -0.25rem;
    background-color: #70cff850;
    border-radius: 0.2rem;
  }
}
```

**Implications:** The semi-transparent blue rectangle sits BEHIND the block's own border via `z-index: -1`, so the block's own chrome paints on top. Eliminates double-outline by inversion: the selection is a background halo, not a foreground ring. Requires `position: relative` on the wrapper and an opaque background on the block.

---

### Finding: Lexical playground uses three distinct techniques depending on block type
**Confidence:** CONFIRMED
**Evidence:** Multiple files in `packages/lexical-playground/src/nodes/` and `themes/`

Three patterns observed:
1. **Simple outline** — `outline: 2px solid rgb(60, 132, 244)` for bordered pills (DateTimeNode, PollNode). Accepts a minor double-outline for small inline elements.
2. **Border-color swap** — `PageBreakNode.css:58-64` changes border color on `.selected` instead of adding an outline. Zero double-outline.
3. **`::after` + `mix-blend-mode: multiply`** — `PlaygroundEditorTheme.css:333-343` for table cells. The overlay blends with whatever sits beneath, so it works on any cell color. Uses system `highlight` color (automatic forced-colors compatibility).

```css
.ExampleEditorTheme__tableCellSelected::after {
  position: absolute;
  inset: 0;
  background-color: highlight;
  mix-blend-mode: multiply;
  content: '';
  pointer-events: none;
}
```

**Implications:** Lexical doesn't prescribe a single pattern — each node-view picks what fits its chrome. The mix-blend-mode technique is notable: paints over the cell border but tints rather than replaces.

---

### Finding: Anytype ships the most complete production catalog — dual-pattern based on block type, with explicit keyboard/mouse distinction
**Confidence:** CONFIRMED
**Evidence:** `anytype/src/scss/common.scss`, `block/media.scss`, `block/common.scss`

Key rules:

```scss
/* Most blocks: ::after overlay with semi-transparent fill */
.selectionTarget.isSelectionSelected::after,
.selectionTarget.isKeyboardFocused::after {
  display: block;
  position: absolute;
  inset: 0;
  background-color: var(--color-system-selection);  /* rgba(55, 122, 255, 0.25) */
  pointer-events: none;
  z-index: 10;
  content: "";
  border-radius: 2px;  /* overridden per block type: 0 for media, 8 for callouts */
}

/* Media blocks: ::before outer ring OUTSIDE content bounds */
.block.blockMedia .focusable.isFocused::before {
  content: "";
  position: absolute;
  left: -2px;
  top: 0;
  width: calc(100% + 4px);
  height: 100%;
  z-index: 1;
  border-radius: 6px;
  pointer-events: none;
  /* Outline-only, no fill — ring sits entirely outside block's border */
}

/* Text blocks: lower z-index so text cursor renders above overlay */
.block.blockText > .wrapContent > .selectionTarget.isSelectionSelected::after {
  z-index: 1;
}
```

**Implications:** Anytype has independently reached the pattern: overlay-fill for most blocks, outer-ring for blocks that already have strong chrome (media/images). Mouse vs keyboard selection tracked as separate CSS classes (`.isSelectionSelected` vs `.isKeyboardFocused`) — allows different behavior while sharing visual indicator. Adaptive border-radius per block type to match chrome.

Constants extracted: selection color `rgba(55, 122, 255, 0.25)`, z-index 10 (general) / 1 (text blocks) / 99 (resize overlays), media ring offset `-2px`, radius `6px` (media) / `8px` (callouts) / `2px` (default).

---

### Finding: Tiptap shows both outline and box-shadow patterns across its extension ecosystem — no single convention
**Confidence:** CONFIRMED
**Evidence:** `tiptap/demos/src/Nodes/` and `Extensions/`

- **Image / YouTube / FileHandler**: `outline: 3px solid var(--purple)` applied directly to img/iframe. No double-outline because the element has no border of its own.
- **HorizontalRule**: border-top color swap (`border-top: 1px solid var(--purple)` replaces the default gray).
- **Focus extension / Selection extension**: `box-shadow: 0 0 0 2px var(--purple)` on a wrapper class.
- **DragHandle extension**: the `::before` behind-content technique (above).

**Implications:** Tiptap as a project punts on a canonical selection indicator — each extension author picks their own. Documentation example for DragHandle demonstrates the most sophisticated technique; others use simple outline or box-shadow.

---

### Finding: Notion uses a `.notion-selectable-halo` overlay element (not inline pseudo), which suggests a separate render layer model
**Confidence:** INFERRED (from DOM inspection reports; Notion is closed-source)
**Evidence:** Web search results describing `.notion-selectable-halo` class name and Notion's drag handle behavior

Multi-block selection appears to create a halo `div` element that visually overlays selected blocks rather than styling them directly. Drag handle lives in left margin, activated on hover.

**Implications:** Notion's approach treats selection as a rendering concern separate from the block's own styling — similar in spirit to Figma's separate-layer model, but implemented via DOM overlays.

---

### Finding: Craft uses native-UI colored framing on macOS/iOS; not CSS-inspectable
**Confidence:** INFERRED
**Evidence:** MacStories review + Craft help docs

Block and Focus blocks in Craft "stand out visually thanks to colored framing." iOS swipe gesture selects whole block. Implementation is platform-native (not web/CSS), so not reusable as a CSS pattern.

---

### Finding: Linear's doc/block editor selection UX is not publicly documented
**Confidence:** NOT FOUND
**Evidence:** Linear help docs, changelog, public design system

Linear uses ProseMirror-based editors. No specific documentation found on how block-level selection is rendered or whether it handles bordered blocks differently. Assumed to use ProseMirror defaults.

---

### Finding: Figma uses a completely separate rendering layer for selection UI — applicable as inspiration, not directly as CSS
**Confidence:** INFERRED (Figma renders via Canvas/WebGL)
**Evidence:** Figma help docs (partially accessible)

Selection strokes + handles live in a separate layer above the canvas. Handles sit outside the frame bounds. Multi-select produces a union outline encompassing all items. This is the gold standard for "select things that already have their own styling," but requires a dedicated rendering pipeline (WebGL/Canvas), not achievable with inline CSS on the selected element itself.

**Implications for DOM editors:** To replicate in HTML/CSS, use absolutely-positioned overlay `div` or SVG layer computed from `getBoundingClientRect()` (technique #12 in CSS evidence). Expensive but gives Figma-level control.

---

### Finding: BlockNote's selection styling is encapsulated inside components — not exposed as surface CSS
**Confidence:** UNCERTAIN
**Evidence:** `blocknote/packages/react/src/components/`; shallow source scan

Uses Mantine UI theming internally; no centralized selection CSS visible at package surface. Would require deeper build-output inspection or runtime DOM inspection to extract.

---

## Cross-editor patterns summary

Convergences observed across multiple editors independently:

1. **Outline for blocks without their own border** (Tiptap images, Lexical pills, Outline defaults). Universal default.
2. **Replace-not-add for blocks with borders** (Lexical PageBreak, Tiptap HorizontalRule, Outline math blocks). Change the block's own border color on selected state.
3. **`::after` overlay with low-opacity fill** for bordered chromed blocks where replacing the border is wrong (Anytype general blocks). Sits on top of border but semi-transparent.
4. **`::before` behind-content** (Tiptap DragHandle, Anytype media) — puts selection in a background layer via `z-index: -1` or `z-index: 1` with outer offset.
5. **`mix-blend-mode`** for contrast-agnostic tint (Lexical tables, Anytype resize feedback).
6. **Gutter/drag-handle** as primary affordance (Notion, WordPress Gutenberg) with block-chrome kept unchanged.

"Don'ts" observed:

- **Don't** layer an outline + box-shadow on top of a block that already has its own border. The triple-line effect is visible in several editors' less-polished surfaces.
- **Don't** apply a single global technique. Every major editor has per-block-type special cases.

---

## Gaps / follow-ups

- Linear's block-selection CSS could not be confirmed — would require live DOM inspection of their web app.
- BlockNote's internal selection pattern not surfaced — would benefit from runtime inspection.
- Craft's exact framing colors/sizes not documented; requires macOS screenshot analysis.
- Ghost Koenig uses Lexical but Ghost-specific styling wasn't located.
