# Evidence: Nested + Multi-Block Selection (D7, D8)

**Dimension:** How editors handle (a) nested selection where a child block is selected inside a parent container, and (b) multi-block selection spanning a range of siblings
**Date:** 2026-04-16
**Sources:** WordPress Gutenberg (OSS), Tiptap (`extension-node-range` OSS), Lexical (OSS), Anytype (OSS), ProseMirror core docs, Figma help

---

## Key files / pages referenced

- `gutenberg/packages/block-editor/src/components/block-list/content.scss` — `.is-multi-selected`, `.has-child-selected`, focus-mode rules (lines 46-81, 149-154, 291-315)
- `gutenberg/packages/block-editor/src/components/block-list/use-block-props/index.js:189-212` — multi-state class assembly
- `gutenberg/packages/block-editor/src/components/block-breadcrumb/index.js:28-40` — parent-chain computation
- `gutenberg/PR #15537` — "Selecting Parent Blocks: Try clickthrough"
- `tiptap/packages/extension-node-range/src/helpers/getNodeRangeDecorations.ts:20-24` — per-node `Decoration.node()`
- `lexical/packages/lexical/src/LexicalSelection.ts:132-150` — NodeSelection / RangeSelection distinction
- `anytype-ts/src/scss/component/selection.scss` — `#selection-rect` union overlay
- [prosemirror.net/docs/ref](https://prosemirror.net/docs/ref/) — Selection types, Decoration API

---

## Nested-selection findings

### Finding: Gutenberg propagates `has-child-selected` up the ancestor chain via the store — no `:has()` selector used
**Confidence:** CONFIRMED
**Evidence:** `use-block-props/index.js:189-212`

```javascript
className: clsx(
  'block-editor-block-list__block',
  {
    'is-selected': isSelected,
    'is-highlighted': isHighlighted,
    'is-multi-selected': isMultiSelected,
    'is-partially-selected': isPartiallySelected,
    'has-child-selected': hasChildSelected,   // ← computed in store
  }
)
```

`hasChildSelected` is read from `blockEditorStore` — precomputed by store selectors when a descendant is selected, then applied as a class to all ancestors. CSS responds to class, no parent-selector needed.

**Implications:**
- Avoids `:has()` performance concerns (not universally well-optimized yet).
- Ancestry is first-class state, not derived from DOM structure.
- Plays nicely with React re-renders — class changes cleanly on selection change.

---

### Finding: Only the innermost block gets visible chrome (outline); ancestors get z-index/opacity adjustments only
**Confidence:** CONFIRMED
**Evidence:** `content.scss:149-154, 291-315`

```scss
.block-editor-block-list__block {
  &.has-negative-margin {
    &.is-selected,
    &.has-child-selected {
      z-index: z-index(".block-editor-block-list__block.is-selected");
      /* Only z-index lift — no outline on ancestor */
    }
  }
}

/* Focus mode — parents stay at full opacity if they contain the selection */
.is-focus-mode .block-editor-block-list__block:not(.has-child-selected) {
  opacity: 0.2;
}
.is-focus-mode .block-editor-block-list__block.is-selected { opacity: 1; }
```

Parent blocks of a selected child do NOT get an outline. They get raised z-index + (in focus mode) stay at full opacity while unselected siblings fade to 20%. The innermost selected block is the only one with a visible selection ring.

**Implications:**
- Users orient via the *chain of non-faded blocks* (focus mode) + the breadcrumb, not via stacked outlines.
- Avoids the "nested outlines" problem entirely by refusing to draw outer outlines.

---

### Finding: Tiptap's `NodeRangeSelection` decorates each included node identically via `Decoration.node()` — no parent/child distinction
**Confidence:** CONFIRMED
**Evidence:** `extension-node-range/src/helpers/getNodeRangeDecorations.ts`

```typescript
decorations.push(
  Decoration.node(pos, pos + node.nodeSize, {
    class: 'ProseMirror-selectednoderange',
  }),
)
```

Every node in the range gets the same class. Parent containers are NOT decorated separately. Styling is extension-specific — Tiptap ships no default CSS for this class.

**Implications:** Downstream of ProseMirror, editors choose their own rendering. Tiptap Pro and some community extensions provide CSS; the default is unstyled.

---

### Finding: Breadcrumb (Gutenberg footer) surfaces the ancestor chain explicitly
**Confidence:** CONFIRMED
**Evidence:** `block-breadcrumb/index.js:28-40`

```javascript
const { clientId, parents, hasSelection } = useSelect(select => {
  const { getSelectedBlockClientId, getEnabledBlockParents } =
    unlock(select(blockEditorStore));
  const selectedBlockClientId = getSelectedBlockClientId();
  return {
    parents: getEnabledBlockParents(selectedBlockClientId),
    clientId: selectedBlockClientId,
  };
}, []);
```

Rendered as `Document > Parent1 > Parent2 > SelectedBlock` in a fixed footer. Each segment is a button — clicking selects that ancestor. Provides orientation in deeply nested blocks without relying on stacked visual indicators.

**Implications:** A breadcrumb is the canonical orientation aid for nested blocks. Without it, a user deep in a Card-inside-Tab-inside-Tabs loses track of hierarchy.

---

### Finding: Anytype uses a single `#selection-rect` union overlay (no per-block chrome in multi-select)
**Confidence:** CONFIRMED
**Evidence:** `anytype-ts/src/scss/component/selection.scss`

```scss
#selection-rect {
  background: var(--color-system-selection);  /* transparent blue */
  border: 0.05em solid #2aa7ee;
}
```

Single overlay `div`, sized and positioned to span the bounding box of all selected blocks. Per-block rings are NOT applied during multi-select. Simpler visual at the cost of individual-block feedback.

---

### Finding: Hover resolution to innermost block uses DOM walk (`event.target` ancestry), not `:has()`
**Confidence:** CONFIRMED (Gutenberg), INFERRED (Tiptap, Lexical)
**Evidence:** Gutenberg event-handler patterns; general React editor architecture

When a user hovers, the event handler walks up from `event.target` to find the nearest `.block-editor-block-list__block`. That block is highlighted. Parent blocks receive no hover styling unless explicitly coded.

**Implications:** Hover targeting is precise. No "parent bubbles to innermost" ambiguity. But there's no `:has()`-style "parent styles itself when child is hovered" pattern in production editors.

---

### Finding: Gutenberg's clickthrough pattern requires *repeated clicks* to climb the hierarchy
**Confidence:** CONFIRMED
**Evidence:** [Gutenberg PR #15537](https://github.com/WordPress/gutenberg/pull/15537)

- First click: select innermost block
- Second click (same location): select parent
- Third click: grandparent
- Alternative: use breadcrumb to jump directly

Pattern trades discoverability (users need to learn the gesture) for precision (parent blocks don't eat clicks intended for children).

---

## Multi-select findings

### Finding: Gutenberg's multi-select uses per-block `::after` overlay + fade-in animation
**Confidence:** CONFIRMED
**Evidence:** `content.scss:46-81`

```scss
.block-editor-block-list__block.is-multi-selected:not(.is-partially-selected) {
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--wp-admin-theme-color);
    opacity: 0.4;
    outline: 2px solid transparent;  /* visible in high-contrast mode */
    animation: selection-overlay__fade-in-animation 0.1s ease-out;
    animation-fill-mode: forwards;
  }
}

@keyframes selection-overlay__fade-in-animation {
  from { opacity: 0; }
  to { opacity: 0.4; }
}
```

Each selected block gets its own overlay — no union outline. 0.1s fade-in on overlay appearance. Text-selected-within-block (`is-partially-selected`) suppresses the overlay to avoid conflicting with the text selection highlight.

---

### Finding: Three orthogonal Gutenberg classes distinguish selection subtypes
**Confidence:** CONFIRMED
**Evidence:** `use-block-props/index.js:189-212`

| Class | Meaning |
|---|---|
| `is-selected` | Single block, fully selected |
| `is-multi-selected` | Included in a contiguous multi-block range |
| `is-partially-selected` | Text selection within this block (but block itself not whole-selected) |
| `has-child-selected` | A descendant block is selected |
| `is-highlighted` | Hover target or focused during navigation |

The `.is-multi-selected:not(.is-partially-selected)` rule ensures the multi-select overlay only paints when the WHOLE block is in the range, not when a text caret is inside.

**Implications:** Mutually-exclusive subtypes with explicit "not" conditions prevent visual conflicts. A single boolean `selected` attr would be insufficient.

---

### Finding: Gutenberg focus mode fades non-selected (non-ancestor) blocks to 20%
**Confidence:** CONFIRMED
**Evidence:** `content.scss:291-315`

```scss
.is-focus-mode .block-editor-block-list__block:not(.has-child-selected) {
  opacity: 0.2;
}
.is-focus-mode .block-editor-block-list__block.is-selected { opacity: 1; }
```

The `:not(.has-child-selected)` negation keeps ancestors of the selected block visible — they have `has-child-selected`, so the fade doesn't apply. Everything else fades to 20%.

**Implications:** Focus mode is a spotlight that illuminates the selected block + its ancestry chain. Powerful orientation tool for nested blocks.

---

### Finding: Tiptap NodeRangeSelection supports `Shift+ArrowUp/Down` to extend the range
**Confidence:** CONFIRMED
**Evidence:** `extension-node-range` README + source

Methods on the selection class: `extendBackwards()`, `extendForwards()`. Bound to Shift-Arrow by default.

**Implications:** Range is cumulative — each arrow press adds one more node. Matches the familiar Shift-Arrow text-selection idiom but applied to blocks.

---

### Finding: Lexical has `$isRangeSelection` and `$isNodeSelection` but no default rendering for either
**Confidence:** CONFIRMED
**Evidence:** `LexicalSelection.ts:132-150`

RangeSelection (text-like, anchor+focus) and NodeSelection (wrapping single node) are API primitives. Rendering is delegated to the editor. React hook `useLexicalNodeSelection()` returns `[isSelected, setSelected, clear]` — the editor is responsible for applying its own classes and CSS.

**Implications:** Lexical is headless on selection visuals. Playground provides examples, but Lexical core does not ship a convention.

---

### Finding: No observed editor uses pure `:has()` parent-responds-to-child patterns for selection
**Confidence:** CONFIRMED (via negative search)
**Evidence:** Gutenberg trunk, Anytype, Tiptap demos — grep for `:has(` in CSS

All surveyed editors precompute parent/child state in their store/model and apply classes. The store-then-class pattern is preferred over `:has()` likely for: (1) browser compat (Firefox got `:has()` only in Nov 2023), (2) performance on large docs, (3) clearer debug path.

`:has()` is used for *decorative side-effects* in some projects (e.g., change a container's shadow based on its current state), but not for selection-propagation logic.

---

## Cross-editor summary

### Nested selection

| Editor | Nested visual chrome | Breadcrumb | Click-through to ancestor |
|---|---|---|---|
| Gutenberg | Innermost only (+ z-index lift on ancestors) | Yes (footer) | Yes (repeat-click) + breadcrumb |
| Tiptap (NodeRange) | Per-node decoration identical for all | No | No (direct click selects) |
| Lexical | Node-or-range; styling custom | No | No |
| Anytype | Union rect during multi-select; per-block chrome for single | No (inferred) | Direct click |
| Figma | Per-object outline + union outline for multi-select | Layer hierarchy panel | Alt-click to reach parent |

### Multi-select

| Editor | Multi-select rendering | Per-block? | Animation |
|---|---|---|---|
| Gutenberg | `::after` blue overlay, 40% opacity | Yes | 100ms fade-in |
| Anytype | Single union rect (`#selection-rect`) | No | None |
| Tiptap | `Decoration.node()` per node | Yes | None default |
| Lexical | None default | — | — |
| Figma | Per-object + union outline | Both | Outline draw |

---

## Converging best-practices

1. **Innermost wins for visible chrome.** No editor outlines both parent and child simultaneously. Ancestors get z-index lift / opacity change (Gutenberg focus mode) or nothing, but never an outline.
2. **State-based classes over CSS `:has()`** for ancestry propagation. More performant and debuggable.
3. **Breadcrumb is the orientation aid** when blocks nest deeply. Single-location ancestor display + click-to-jump.
4. **Per-block overlay + subtle tint** is the dominant multi-select technique; union outlines are rarer (Anytype, Figma).
5. **Three-class distinction** for selection subtypes: `is-selected`, `is-multi-selected`, `is-partially-selected` (text caret inside) — mutually exclusive rules avoid visual conflict.
6. **Keyboard extension of range via Shift-Arrow** (Tiptap) matches familiar text-selection idiom.

## Divergent choices

| Axis | Gutenberg | Tiptap | Lexical | Anytype | Figma |
|---|---|---|---|---|---|
| Parent ancestry indicator | `has-child-selected` class | ✗ | ✗ | ✗ | Layer panel |
| Breadcrumb | Yes | ✗ | ✗ | ✗ | Layer panel |
| Multi-select rendering | Per-block overlay | Per-node class | Custom | Union rect | Both |
| Fade animation | 100ms | ✗ | ✗ | ✗ | ✓ |
| Focus mode (spotlight) | Yes | ✗ | ✗ | ✗ | Isolate mode |

---

## Gaps / follow-ups

- **Notion's multi-select halo**: the `.notion-selectable-halo` element was surfaced in the earlier editor survey but exact CSS not captured — requires runtime DOM inspection of a live Notion page.
- **BlockNote nested selection**: source structure didn't surface selection logic at a shallow clone depth.
- **Lexical playground multi-block selection demo**: no concrete demo found to inspect. May not exist in the current playground.
- **`:has()` for decorative side-effects**: not surveyed — might be worth a focused pass if the report is extended.
