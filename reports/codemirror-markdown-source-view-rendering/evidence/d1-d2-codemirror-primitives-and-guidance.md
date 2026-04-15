# Evidence: D1 + D2 — CodeMirror 6 primitives and authoritative guidance

**Dimensions:** D1 (primitives), D2 (authoritative guidance)
**Date:** 2026-04-14
**Sources:** codemirror.net/docs, discuss.codemirror.net, codemirror/dev GitHub issues, @lezer/markdown grammar, cloned `segphault/codemirror-rich-markdoc`

---

## Key references

- https://codemirror.net/docs/ref/ — Reference manual
- https://codemirror.net/examples/decoration/ — Decoration examples
- https://codemirror.net/docs/guide/ — System guide (ViewPlugin vs StateField)
- https://github.com/codemirror/view/blob/main/src/decoration.ts — Decoration source
- https://github.com/lezer-parser/markdown/blob/main/README.md — Node types (Table, TableRow, TableCell, FencedCode, HTMLBlock)
- https://discuss.codemirror.net/t/how-to-use-line-wrapping-in-codemirror-6/4924
- https://discuss.codemirror.net/t/editor-driven-line-wrapping/5125
- https://discuss.codemirror.net/t/how-to-replace-content-with-widget/4288
- https://discuss.codemirror.net/t/positioning-block-level-widgets/3060
- https://github.com/codemirror/dev/issues/800 — Decoration span affects line wrapping
- https://codemirror.net/examples/million/ — Huge doc demo (viewport culling)

---

## D1 — Primitive inventory

### Decoration family

| Primitive | Scope | What it does | Suited for |
|---|---|---|---|
| `Decoration.line({attributes})` | zero-length at line start | adds attrs/class to the line's DOM wrapper | per-line CSS (line highlight, `white-space` override) |
| `Decoration.mark({attributes})` | inline range | wraps text in a `<span>` with attrs/class | inline syntax highlighting, underlines |
| `Decoration.replace({widget})` | any range (inline or multi-line) | HIDES source, optionally renders widget in its place | folding, block replacement (tables, code, HTML blocks) |
| `Decoration.widget({widget, side, block})` | zero-length insertion | INSERTS a widget without hiding source | images, inline annotations, line-spanning block inserts |

**`block: true` vs `block: false`** — widget/replace with `block: true` creates a line-spanning block widget; `false` produces an inline widget rendered within the text flow.

### WidgetType (subclass interface)

`toDOM(view)` → create DOM node; `updateDOM(dom, view)` → optional in-place update (return false to skip); `eq(other)` → equality check enables reuse across updates; `ignoreEvent(event)` → whether editor should handle event; `compare(other)` → overlap precedence; `destroy(dom)` → cleanup; `estimatedHeight` → height hint for viewport management.

Evidence: https://github.com/codemirror/view/blob/main/src/decoration.ts (authoritative source)

### Atomic ranges

`EditorView.atomicRanges.from(stateField, fn)` — facet where fields contribute `RangeSet<null>` ranges that cursor motion treats as indivisible. Cursor skips over the range; `Delete`/`Backspace` remove the whole range in one step.

Keymap requirement: only takes effect when a keymap like `standardKeymap` is installed. Otherwise cursor navigation ignores atomic ranges.
Evidence: https://discuss.codemirror.net/t/im-missing-something-about-how-atomicrange-works/8007

Example provide-pattern:

```ts
// From renderBlock.ts of codemirror-rich-markdoc (adapted)
StateField.define({
  create: s => RangeSet.of(replaceBlocks(s, config), true),
  update: (d, tr) => RangeSet.of(replaceBlocks(tr.state, config), true),
  provide: f => EditorView.decorations.from(f),
  // Atomic variant would add:
  // + EditorView.atomicRanges.from(f, decs => /* RangeSet<null> over decorated ranges */)
});
```

### ViewPlugin vs StateField (critical distinction — load-bearing)

**Marijn Haverbeke, discuss.codemirror.net #4288:**

> "You have to provide your decorations from a **state field**, not a view plugin, if they are able to change the vertical structure of the editor content (because the viewport depends on that structure, and view plugins update after the viewport has been computed)."

Rule of thumb:
- **StateField** → decorations that add/remove/replace block content, insert block widgets, or anything else that changes document height
- **ViewPlugin** → decorations that only affect inline styling (marks), DOM side effects, event handlers, viewport-aware imperative logic

Evidence: https://discuss.codemirror.net/t/how-to-replace-content-with-widget/4288

Confirmed in practice by `codemirror-rich-markdoc`:
- `renderBlock.ts` (block-replace: Table, Blockquote, MarkdocTag) → `StateField`
- `richEdit.ts` (inline marks: hide `EmphasisMark`, `LinkMark`, `CodeMark` when cursor elsewhere) → `ViewPlugin`

### Compartment / reconfigure

`new Compartment()` + `.of(ext)` wrap an extension; `view.dispatch({ effects: compartment.reconfigure(newExt) })` swaps it at runtime without rebuilding the editor.

Canonical use: toggle `EditorView.lineWrapping` without remounting.

```ts
const wrapCompartment = new Compartment();
// initial state:
wrapCompartment.of(EditorView.lineWrapping)
// later:
view.dispatch({ effects: wrapCompartment.reconfigure([]) }); // turn off
view.dispatch({ effects: wrapCompartment.reconfigure(EditorView.lineWrapping) }); // on
```

Evidence: https://discuss.codemirror.net/t/how-to-use-line-wrapping-in-codemirror-6/4924

### MatchDecorator

Factory that scans document text for regex matches and emits decorations; typically wrapped in a ViewPlugin. Limited to regex context — cannot detect "only inside a code block" (that requires `syntaxTree`).

### syntaxTree + @lezer/markdown

`syntaxTree(state)` returns the Lezer parse tree. Traverse via `.iterate({ from, to, enter(node) {...}, leave(node) {...} })`. Node names from `@lezer/markdown`: `Document`, `Paragraph`, `Heading` (`ATXHeading1`…`ATXHeading6`), `Blockquote`, `OrderedList`, `BulletList`, `ListItem`, `FencedCode`, `CodeBlock`, `HTMLBlock`, `LinkReference`, `Link`, `Image`, `Emphasis`, `StrongEmphasis`, `InlineCode`, `HardBreak`, `URL`, `MarkdocTag`, plus (with GFM extension bundle): `Table`, `TableHeader`, `TableRow`, `TableCell`, `TableDelimiter`, `Strikethrough`, `TaskMarker`.

Evidence: https://github.com/lezer-parser/markdown/blob/main/README.md

### Theming — baseTheme vs theme

`EditorView.baseTheme({...})` — low-precedence CSS; use for plugin defaults. `EditorView.theme({...})` — higher-precedence; consumer-facing theme.

---

## D2 — Authoritative guidance

### On `EditorView.lineWrapping` and long-line performance

**From forum maintainer responses (https://discuss.codemirror.net/t/how-to-use-line-wrapping-in-codemirror-6/4924):** `EditorView.lineWrapping` is the ONE extension that enables soft-wrap, applied editor-wide. No per-line toggle in core.

**No virtualization of wrapped-line height.** A 3000-char logical line that wraps to 37 visual lines renders all 37 lines' height into the DOM — CM6 uses viewport culling, but at the granularity of logical lines, not visual lines within a logical line.

**Marijn's stance on per-line wrap control** (https://discuss.codemirror.net/t/editor-driven-line-wrapping/5125): declined to add hanging-indent / per-line wrap control to core. The recommended approaches are:
1. Disable `lineWrapping` globally and insert `<br/>` block widgets at wrap boundaries (full custom control)
2. Use a line decoration setting `white-space: pre` on lines where wrapping should be disabled (overrides the editor-wide `pre-wrap` behavior per-line)
3. Replace the long-line region with a widget (Decoration.replace + block widget)

### On multi-line / block widgets

**Widget layout quirks** (https://discuss.codemirror.net/t/positioning-block-level-widgets/3060): avoid CSS `margin` on block widgets — they confuse CM's height calculations, especially on the final document line. Use `padding` / `border` inside the widget instead.

**Preferred way to create multi-line widgets** (https://discuss.codemirror.net/t/preferred-way-to-create-multi-line-widget/4865): use `Decoration.widget({ widget, block: true })` or `Decoration.replace({ widget, block: true })` from a `StateField`. Plugins (`ViewPlugin`) cannot contribute height-changing decorations reliably (viewport computed before plugin update).

**Vertical cursor motion through block widgets** — historically fragile; fixed in recent CM6 (`v6.39.4` fixed widgets at `side: 1` at line start/end blocking down-arrow).
Evidence: https://discuss.codemirror.net/t/v6-39-3-cant-navigate-through-block-widget-with-side-1-another-language-issue/9607

### On decoration × line-wrap interactions

**codemirror/dev#800 — "Decoration span affects line wrapping":** Inline `Decoration.mark` spans inject `<span>` elements into the text flow. Chrome/Safari wrap text differently when inline spans are present vs plain text, so highlighting a match can shift the line-breaking point visually. No mitigation shipped. A proposed fix is to render decorations in a separate overlay layer (like `drawSelection` does for cursor/selection) — not implemented.

Evidence: https://github.com/codemirror/dev/issues/800

### On atomic ranges

**Discussion #9701** (atomic-range deletion semantics): user requested "atomic on cursor motion but not on deletion"; Marijn: "This is outside of what `atomicRanges` provides." Workaround: a transaction filter that moves selection out of the range on arrow navigation while letting deletion proceed character-by-character.
Evidence: https://discuss.codemirror.net/t/atomic-range-behave-as-atomic-when-caret-moves-behave-as-normal-with-deletion/9701

**Keymap requirement** (Discussion #8007): atomic ranges only take effect when a keymap like `standardKeymap` is installed.
Evidence: https://discuss.codemirror.net/t/im-missing-something-about-how-atomicrange-works/8007

**Cursor trapped in atomic range** (Discussion #9512): pre-2025 bug where typing at the start of an atomic range could trap cursor inside; fixed in later versions (reported fixed in 0.21.4+ of the relevant package; confirm version against your CM6 installation).
Evidence: https://discuss.codemirror.net/t/cursor-trapped-in-atomic-range/9512

### On performance at scale

**Viewport culling via `estimatedHeight`**: Widgets with accurate `estimatedHeight` avoid scroll jank. Without it, CM uses a default estimate and may need to reflow on first viewport entry.

**MatchDecorator performance bug (historical, fixed)**: earlier MatchDecorator rebuilt on every keystroke; after fix (https://discuss.codemirror.net/t/performance-issues-with-extension/8896), performance scales with viewport size, not document size.

**No maintainer-quantified benchmark** for N-hundred block widgets on one document. Viewport culling is the design bet.

---

## Negative / gap findings

- **No built-in per-line wrap-disable extension** in CM6 core. Marijn's stance has consistently been that this is a consumer-territory problem solvable by line decorations + CSS.
- **No built-in "live preview" / "source reveal on cursor" pattern** — it's a recipe, not an API. The recipe: StateField containing replace decorations + guard `if (cursor.from >= node.from && cursor.to <= node.to) return false` (skip decorating when cursor is inside).
- **No virtualized soft-wrap.** A 37-visual-line logical line fully renders.

---

## Gaps / follow-ups

- `@lezer/markdown` GFM extension: confirm the exact import path and whether Table nodes are automatic or opt-in. (Likely opt-in via `markdown({ extensions: [GFM] })` or similar — verify for any implementation.)
- No firsthand benchmarks for N-hundred block widgets at edit time — the closest is `codemirror.net/examples/million/` (huge line count, not widget count). Benchmarking would strengthen performance claims.
