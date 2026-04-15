# Evidence: D4 — codemirror-rich-markdoc deep dive

**Dimension:** D4 — Reference implementation of block-widget-replace for tables + live-preview reveal pattern
**Date:** 2026-04-14
**Sources:** Cloned repo at `/tmp/cm-rich-markdoc/` (from https://github.com/segphault/codemirror-rich-markdoc)

---

## Key files

- `/tmp/cm-rich-markdoc/src/richEdit.ts` — ViewPlugin for inline marks (hide `EmphasisMark`, etc. when cursor outside)
- `/tmp/cm-rich-markdoc/src/renderBlock.ts` — **StateField** for block-level `Decoration.replace` with widget for Table, Blockquote, MarkdocTag
- `/tmp/cm-rich-markdoc/src/index.ts` — composes both + custom syntax highlight + Lezer extension
- `/tmp/cm-rich-markdoc/src/tagParser.ts` — extends the markdown parser for Markdoc `{% tag %}` syntax

---

## Findings

### Finding D4-1: Block replacement uses a StateField providing `Decoration.replace({ widget, block: true })`
**Confidence:** CONFIRMED
**Evidence:** `renderBlock.ts:76-83, 100-113`

```ts
const decoration = Decoration.replace({
  widget: new RenderBlockWidget(text, config),
  block: true,
});
decorations.push(decoration.range(node.from, node.to));
// ...
return StateField.define<DecorationSet>({
  create(state) { return RangeSet.of(replaceBlocks(state, config), true); },
  update(decorations, transaction) {
    return RangeSet.of(replaceBlocks(transaction.state, config), true);
  },
  provide(field) { return EditorView.decorations.from(field); },
});
```

Directly confirms the maintainer-recommended pattern: structure-changing decorations come from a **StateField**, not a ViewPlugin.

### Finding D4-2: Cursor-reveal is a one-line guard in the detection loop
**Confidence:** CONFIRMED
**Evidence:** `renderBlock.ts:73-74`

```ts
if (cursor.from >= node.from && cursor.to <= node.to)
  return false;  // do NOT emit the replace decoration for this node
```

The `false` return in `.iterate({ enter })` stops the iterator from descending into the node AND from emitting the decoration. When the cursor leaves, the StateField re-runs on the next transaction (update) and the decoration comes back.

Implication: the "Live Preview reveal on cursor entry" pattern is a **StateField + syntaxTree + cursor-range-overlap check** — three well-documented CM6 primitives composed. Not a custom extension point.

### Finding D4-3: Block detection uses `syntaxTree().iterate` matching specific node names
**Confidence:** CONFIRMED
**Evidence:** `renderBlock.ts:48-52`

```ts
syntaxTree(state).iterate({
  from, to,
  enter(node) {
    if (!['Table', 'Blockquote', 'MarkdocTag'].includes(node.name))
      return;
    // ...
  }
});
```

Uses the Lezer markdown parser's node names directly — `Table` requires the GFM extension in the markdown language config. `Blockquote` is standard markdown.

Implication: To target additional constructs (fenced code, HTML blocks, frontmatter), append node names to the filter. `FencedCode`, `HTMLBlock`, and `FrontMatter` (if using remark-frontmatter parser extension) are all valid.

### Finding D4-4: Widget DOM is `contenteditable="false"` and renders arbitrary HTML
**Confidence:** CONFIRMED
**Evidence:** `renderBlock.ts:28-34`

```ts
toDOM(): HTMLElement {
  let content = document.createElement('div');
  content.setAttribute('contenteditable', 'false');
  content.className = 'cm-markdoc-renderBlock';
  content.innerHTML = this.rendered;
  return content;
}
```

Using `contenteditable="false"` ensures CM6 treats the widget as opaque — keystrokes and mouse selection inside it are intercepted by the browser, not routed into the editor. `ignoreEvent(): false` (line 36-38) further delegates event handling to browser defaults on the widget DOM.

Implication: the replaced widget is a **non-editable preview**. To edit, the user must move the cursor to it (which removes the decoration via D4-2), revealing the source markdown.

### Finding D4-5: ViewPlugin handles inline-mark decorations in parallel with StateField block decorations
**Confidence:** CONFIRMED
**Evidence:** `richEdit.ts:29-74`

```ts
export default class RichEditPlugin implements PluginValue {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.process(view); }
  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.selectionSet)
      this.decorations = this.process(update.view);
  }
  process(view: EditorView): DecorationSet {
    // syntaxTree iterate; hide EmphasisMark/LinkMark/CodeMark when
    // cursor is NOT inside the enclosing Emphasis/Link/Code node
  }
}
```

Inline marks (hide `**` markers when emphasis is not being edited) live in the ViewPlugin. Block structural changes (Table replace) live in the StateField. The separation aligns with Marijn's ViewPlugin/StateField rule.

### Finding D4-6: The widget has `eq()` returning a broken check (typo in source)
**Confidence:** CONFIRMED (but low-relevance for our synthesis)
**Evidence:** `renderBlock.ts:24-26`

```ts
eq(widget: RenderBlockWidget): boolean {
  return widget.source === widget.source;  // NOTE: compares widget.source to itself
}
```

This is a typo (should compare `this.source === widget.source`), causing every update to rebuild widget DOM instead of reusing. Doesn't invalidate the pattern — just a perf bug in this reference implementation.

---

## Pattern summary (extracted)

**"Obsidian Live Preview in ~100 lines":**

```
┌─ StateField ──────────────────────────────┐
│ syntaxTree.iterate → find ['Table',       │
│                             'Blockquote', │
│                             'FencedCode'] │
│ if (cursor is inside node) skip           │
│ else emit Decoration.replace({            │
│         widget: new RenderBlockWidget,    │
│         block: true                       │
│       })                                  │
│ provide to EditorView.decorations facet   │
└───────────────────────────────────────────┘

┌─ ViewPlugin ─────────────────────────────┐
│ syntaxTree.iterate → find inline marks   │
│   (EmphasisMark, LinkMark, CodeMark)     │
│ if (cursor is inside enclosing node) show│
│ else emit Decoration.mark (hidden class) │
└──────────────────────────────────────────┘
```

These two extensions compose to deliver the Obsidian Live Preview experience. `richEdit.ts` + `renderBlock.ts` total ~200 lines.

---

## Interactions with line-wrapping

- `EditorView.lineWrapping` has no direct interaction with `Decoration.replace` — the replaced range is hidden, so its length is irrelevant to wrap computations.
- For regions NOT covered by replace decorations (inline prose, code blocks, non-table content), line wrapping still applies as usual.
- When the cursor enters a table and the replace decoration unmounts, the source text is then subject to `EditorView.lineWrapping` — so a 3000-char table row WILL soft-wrap to many visual lines at that point. The Obsidian pattern trades "wrapping pathology while rendered" (zero, because the widget hides it) for "full wrapping pathology while editing" (full 37-line wrap, user sees the raw markdown).

---

## Gaps / follow-ups

- The reference implementation does NOT set atomic ranges on the replaced blocks. Cursor still traverses character-by-character across the widget's start/end positions. Adding `EditorView.atomicRanges.from(f, ...)` would make the whole block jump in one arrow-key press when the cursor is outside.
- No handling of very wide rendered tables (CSS overflow) — the widget's DOM is whatever the HTML renderer produces; if that's a wide table, it will overflow the editor horizontally.
- No consideration of collaborative editing (y-codemirror.next) — widgets are view-layer, so this is fine, but the StateField recomputing on every transaction could be expensive with frequent remote updates.
