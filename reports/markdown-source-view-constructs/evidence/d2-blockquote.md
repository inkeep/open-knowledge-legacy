# Evidence: D2 — blockquote

**Dimension:** D2 — Source-view rendering of `blockquote` across CM6 and OSS editors
**Date:** 2026-04-14

---

## Key references

- https://github.com/lezer-parser/markdown — parser (T1)
- https://codemirror.net/examples/decoration/ — decoration primitives (T1)
- https://docs.obsidian.md/Reference/CSS+variables/Editor/Blockquote — official CSS vars (T1)
- https://forum.obsidian.md/t/nested-quotation-blocks-are-incorrectly-rendered-in-editor-live-preview/95349 — nested blockquote bugs (T2)
- https://forum.obsidian.md/t/live-preview-support-lists-in-quote-blocks/30849 — lists-in-quote rendering gap (T2)
- `/tmp/cm-rich-markdoc/src/renderBlock.ts` (cloned earlier) — reference implementation (T1)
- `/tmp/cm-rich-markdoc/src/richEdit.ts` — inline companion (T1)

---

## @lezer/markdown node structure

**Finding D2-1:** `Blockquote` is a block-level composite node. Inner content is standard block nodes (`Paragraph`, nested `Blockquote`, `FencedCode`, `List`, etc.). The `>` characters appear as `QuoteMark` tokens at the start of each line inside the blockquote.
**Confidence:** CONFIRMED (T1)
**Evidence:** https://github.com/lezer-parser/markdown — block grammar

Implication: line-level detection via `syntaxTree().iterate()` matching either `Blockquote` as the enclosing node (and iterating its lines) OR matching `QuoteMark` to tag lines one-by-one.

---

## Pathology

Long blockquote line `> long content that wraps across visual lines`. The `>` prefix exists only at the logical-line start. Wrapped continuation lines revert to column 0 visually, so the reader loses the "this is still a quoted passage" cue.

---

## CM6 primitive fit

### Primary pattern: `Decoration.line` with left-border + padding

```css
.cm-blockquote-line {
  border-left: 3px solid color-mix(in oklab, var(--muted-foreground) 50%, transparent);
  padding-left: 12px;
  background: color-mix(in oklab, var(--muted) 20%, transparent);
}
```

CSS lives on each line of the blockquote. Wrapped continuation inherits the same class → the border bar stays continuous across wrapped visual lines.

### Nesting depth

Two approaches observed:

1. **Per-depth class** (via counting parent `Blockquote` ancestors in syntax tree): `cm-blockquote-depth-1`, `cm-blockquote-depth-2`, etc., each with a different border color or padding.
2. **Nested CSS selectors** (doesn't work for editor lines since they're flat in DOM): fails under CM6's line-wrapper model.

Depth-class approach is the viable one.

### Hanging indent

If `>` markers are kept visible (S1), continuation inherits `padding-left` from the line decoration — no extra hanging-indent needed. If `>` markers are hidden (S3), hanging indent becomes relevant to align continuation with visible content.

---

## Per-product findings

### Obsidian

**Source Mode:** Plain text with `>` markers visible. Applies `.cm-quote` class to blockquote tokens (source-level visual styling). No explicit `border-left` bar on wrapped lines reported — the community forums frequently discuss adding one via user CSS snippets.
**Confidence:** INFERRED (T2 — behavior from community plugins/snippets suggests baseline is minimal)
**Evidence:** Obsidian developer docs + forum snippets

**Live Preview:** First-line offset + rendered blockquote appearance. Known bugs in nested blockquotes and lists-in-blockquotes per forum threads #95349 and #30849.
**Confidence:** CONFIRMED (T2)

### SilverBullet

CM6-based with live-preview-hybrid mode. Line-decoration for blockquotes is likely (matches the pattern used for other constructs per D5 of the prior `codemirror-markdown-source-view-rendering` report), but the specific CSS class and handling was not confirmed in public sources at this pass.
**Confidence:** UNRESOLVED (T2 product docs insufficient; would need direct source inspection)

### HedgeDoc

CodeMirror 5-based edit pane. Plain text with syntax coloring for `>` — no special line-level decoration beyond basic syntax highlight.
**Confidence:** INFERRED (T2)

### Typora

WYSIWYG-first. "Source Code Mode" shows raw markdown; in the default WYSIWYG view, blockquotes render as styled block elements (standard blockquote CSS). Source Mode behavior is minimal.
**Confidence:** INFERRED (T2)

### codemirror-rich-markdoc (reference implementation)

`renderBlock.ts` matches `['Table', 'Blockquote', 'MarkdocTag']` and replaces them with a `Decoration.replace({ widget, block: true })` when cursor is outside the block. The widget renders HTML via `markdoc.renderers.html(transformed)`. Inside the blockquote, the `contenteditable="false"` div contains the rendered `<blockquote>` HTML element.
**Confidence:** CONFIRMED (T1 — source-verified)
**Evidence:** `/tmp/cm-rich-markdoc/src/renderBlock.ts:51-97`

When cursor enters the blockquote region (via `cursor.from >= node.from && cursor.to <= node.to`), the widget is skipped and raw markdown appears — the canonical cursor-reveal pattern.

### VS Code + Markdown All in One

Syntax coloring for `>` marker; no line-level decoration, no nested-depth cue. Extension provides a toggle command to add/remove `>` prefix to selection.
**Confidence:** CONFIRMED (T1)
**Evidence:** https://markdown-all-in-one.github.io/docs/guide/

### MDXEditor

Lexical-based (not CM6). Renders blockquote via plugin in rich-text view; source toggle available but not primary.
**Confidence:** CONFIRMED (T1)

### Milkdown / MarkText

ProseMirror-based (not CM6). Blockquotes render in WYSIWYG; source view if present is secondary.
**Confidence:** CONFIRMED (T1)

---

## Known edge cases

### Nested blockquotes (`> > > deep`)

- Visual hierarchy achievable via depth-counting + varying border color/width per depth
- Obsidian has documented rendering bugs in nested blockquotes (forum #95349)
- No surveyed product ships a depth-aware visual pattern as default

### Blockquote containing other constructs

- `> - list item` inside blockquote: Obsidian Live Preview reportedly fails to render correctly (forum #30849)
- `> ```\ncode\n```` inside blockquote: similar rendering concerns
- `> | cell |` (table in blockquote): codemirror-rich-markdoc replaces the outer `Blockquote` but the inner `Table` stays as source inside the widget's rendered HTML (which is rendered once at widget construction — changes require widget re-render)

### Lazy continuation

CommonMark allows paragraph continuation without `>` prefix after a blockquote line. Most surveyed editors handle parsing correctly but may not visually indicate "still-in-blockquote" for the lazy continuation line.

---

## Gaps / follow-ups

- No surveyed product implements depth-aware visual hierarchy for nested blockquotes as default
- Interaction of blockquote decoration with other constructs (list items, code blocks) within the blockquote — untested in public issues beyond Obsidian's reported bugs
- SilverBullet's specific CSS/decoration details unresolved; would need source inspection
