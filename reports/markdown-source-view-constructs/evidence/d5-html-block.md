# Evidence: D5 — HTML block

**Dimension:** D5 — Source-view rendering of `html` blocks (raw HTML embedded in markdown)
**Date:** 2026-04-14

---

## Key references

- `@lezer/markdown` grammar — `HTMLBlock` node (T1)
- https://spec.commonmark.org/0.31.2/#html-blocks — CommonMark HTML block rules (T1)
- https://github.com/codemirror/lang-markdown — `parseCode({ htmlParser })` (T1)

---

## @lezer/markdown node

**Finding D5-1:** `HTMLBlock` is a block-level node containing raw text (no inline parsing inside by default). `@codemirror/lang-markdown` can optionally inject a nested HTML parser via `parseCode({ htmlParser })`.
**Confidence:** CONFIRMED (T1)

---

## Pathology

Long HTML attribute lines like:

```html
<div class="container mx-auto px-4 py-8" id="main-section" data-section-id="hero" data-config='{"delay": 500}'>
```

produce a single logical line that wraps on visual line boundaries. The attributes and their values scatter across wrap positions — same pathology family as tables, but with `attr="value"` pairs playing the role of cells.

Additional concern: HTML blocks can contain markdown-adjacent content (inside `<details>`, inside `<div markdown="1">`), with parser divergence across products.

---

## CM6 primitive fit

### Option 1: Line-level container styling (S2, safe)

```css
.cm-html-block {
  background: color-mix(in oklab, var(--accent) 3%, transparent);
  border-left: 2px solid color-mix(in oklab, var(--accent) 40%, transparent);
  padding-left: 8px;
  font-family: var(--font-mono);
}
```

No widget, no sanitization concern. Source stays visible.

### Option 2: Attribute colorization (S2 extended — Rainbow-CSV for HTML)

Use `MatchDecorator` to find `\w+="[^"]*"` and `\w+='[^']*'` patterns within `HTMLBlock` regions. Apply alternating mark classes so attribute key-value pairs are visually distinguishable.

```ts
new MatchDecorator({
  regexp: /(\w+)=(["'])([^"']*)\2/g,
  decoration: (match, view, from) => Decoration.mark({
    class: `cm-html-attr-${(matchIndex++) % 2}`
  }),
});
```

Not observed in surveyed products; direct technique-transfer from Rainbow CSV to HTML attributes.

### Option 3: Nested HTML syntax highlighting (S2, semantic)

```ts
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
markdown({ htmlParser: html().language.parser });
```

Nested parsing produces proper `TagName`, `AttributeName`, `AttributeValue` nodes inside HTML regions; standard `highlightSpecifiers` and theme extensions color them.

### Option 4: Widget replace with sanitized HTML (S3, unsafe-by-default)

`Decoration.replace` with a `<div>` widget rendering sanitized HTML. **Security requires DOMPurify or equivalent** before assigning to `innerHTML`. Per Open Knowledge's storage/render layer contract, storage never sanitizes — render-time DOES. A source-view widget IS a render layer in this sense. Not recommended without explicit sanitization policy.

---

## Per-product findings

### Obsidian

**Source Mode:** HTML blocks rendered as plain monospace-styled text (same as surrounding prose but with HTML syntax coloring from TextMate grammar). No special decoration, no attribute coloring, no nested HTML parse tree.
**Confidence:** INFERRED (T2)

**Live Preview / Reading View:** HTML is rendered. Obsidian has a setting "disable HTML rendering" (strict mode); when enabled, HTML shows as text. Default renders safely via internal DOMPurify-style sanitization.
**Confidence:** CONFIRMED (T2)

### SilverBullet

No specific HTML-block treatment documented in accessible public source at this pass.
**Confidence:** UNRESOLVED

### VS Code + Markdown extensions

HTML inside markdown: TextMate grammar injects the `text.html.derivative` scope for proper syntax coloring of tags and attributes. No special line-level wrapping behavior for HTML blocks.
**Confidence:** CONFIRMED (T1)

### codemirror-rich-markdoc

`HTMLBlock` is NOT in the block-replace list (`['Table', 'Blockquote', 'MarkdocTag']`) nor in the inline tokenElement list. Treated as plain text with no decoration.
**Confidence:** CONFIRMED (T1 — source-verified)

### HedgeDoc / Typora / Marktext / MDXEditor

MDX-aware editors (MDXEditor) treat block HTML via MDX AST; rich-text rendering is JSX-backed. Plain markdown editors (HedgeDoc, Marktext) pass-through to rendered HTML in preview. Source view baseline = plain text with syntax coloring.
**Confidence:** INFERRED (T2/T3)

---

## Sanitization concerns

Per Open Knowledge's architectural precedent (CLAUDE.md: "Storage never sanitizes; render-time layers do"), a source-view widget that renders HTML is a render layer and must sanitize. Without sanitization, an attacker-controlled `<script>` or `<iframe>` in a markdown document could execute at widget render time.

**Implication:** Option 4 (widget-replace with rendered HTML) requires DOMPurify integration. Options 1-3 do not render HTML; they style the source text. No security concern.

---

## Attribute coloring: unclaimed territory

The "Rainbow HTML" technique (Option 2 above — Rainbow-CSV-style alternating-color attribute pairs) was not observed in any surveyed editor. Potential direct transfer from the CSV domain:

- Rainbow CSV (for CSV columns) is proven UX at scale (~2M+ installs)
- HTML attributes have an analogous "key=value delimited pair" structure
- No technical barrier; `MatchDecorator` + theme CSS is all that's required
- Why not shipped: likely combination of (a) lower content-density of HTML blocks than CSV files, (b) TextMate/Prism grammars already apply name/value distinction via syntax coloring

---

## Gaps / follow-ups

- **Nested HTML syntax via parseCode:** whether `@codemirror/lang-html` integrates smoothly with markdown's `HTMLBlock` ranges in practice (performance, edge cases of incomplete HTML inside markdown)
- **DOMPurify in source-view widgets:** security model for any product considering rendered HTML in source view
- **`<details>` + markdown inside:** some editors parse markdown within `<details><summary>` tags; behavior varies across products
- **Self-closing void tags (`<br/>`, `<hr/>`):** interaction with void-HTML guard (Open Knowledge uses U+E000 sentinels per CLAUDE.md NG9); whether external editors have similar defensive handling
