# Evidence: D3 — code fenced blocks + inlineCode

**Dimension:** D3 — Source-view rendering of fenced code blocks and inline code
**Date:** 2026-04-14

---

## Key references

- `@lezer/markdown` grammar — node structure (T1)
- https://github.com/codemirror/lang-markdown — markdown language + `parseCode` / `codeLanguages` config (T1)
- `/tmp/cm-rich-markdoc/src/richEdit.ts` — reference `decorationCode` for FencedCode + InlineCode (T1)
- https://codemirror.net/examples/decoration/ (T1)

---

## @lezer/markdown nodes

**Finding D3-1:** Fenced code produces `FencedCode` containing `CodeMark` (fence delimiters ` ``` ` or `~~~`), `CodeInfo` (language identifier after opening fence), and `CodeText` (content lines). Inline code produces `InlineCode` (flat inline node).
**Confidence:** CONFIRMED (T1)
**Evidence:** @lezer/markdown README + local `node_modules/@lezer/markdown/dist/index.d.ts`

---

## Pathology

### Fenced code

**Inverted from tables.** Inside a code block, wrapping is usually UNDESIRED because it breaks the visual structure of code (indentation, alignment). Canonical answer: no-wrap inside code blocks, horizontal scroll for that region OR accept wrap with a visual continuation indicator.

### Inline code

**Mild.** Long inline code (e.g., a 200-char command or URL in backticks) can wrap awkwardly mid-token inside prose. Less severe than tables but still aesthetically poor.

---

## CM6 primitive fit

### Fenced code — three layers

1. **`Decoration.line` with `white-space: pre` on `FencedCode`-descendant lines** — per-line override of editor-wide `lineWrapping`'s `pre-wrap` behavior. Lines inside the fence don't wrap.

   ```css
   .cm-code-line { white-space: pre !important; }
   ```

2. **Syntax highlighting inside code** — via `@codemirror/lang-markdown`'s `markdown({ codeLanguages })` config, which uses `parseMixed` internally to invoke nested language parsers for the code block content.

   ```ts
   import { markdown } from '@codemirror/lang-markdown';
   import { languages } from '@codemirror/language-data';
   markdown({ codeLanguages: languages });
   ```

   `codeLanguages` can be an array of `LanguageDescription[]` or a function that looks up language by info string.

3. **Language label widget** — `Decoration.widget` placed at `CodeInfo` position rendering a small floating badge showing the language name. Optional polish.

### Inline code

Single `Decoration.mark` on `InlineCode` range with monospace + subtle background:

```css
.cm-inline-code {
  font-family: var(--font-mono);
  background: color-mix(in oklab, var(--muted) 30%, transparent);
  padding: 0 0.25em;
  border-radius: 3px;
}
```

For long inline code: options include `word-break: break-all` (break mid-token cleanly) or `white-space: pre` + `display: inline-block` + `overflow-x: auto; max-width: 100%` (internal horizontal scroll on the inline-block — rare in practice).

---

## Per-product findings

### VS Code + Markdown All in One

Markdown All in One does not specifically style fenced code regions differently. Global `editor.wordWrap` setting applies uniformly. No language label in source view.
**Confidence:** CONFIRMED (T1)
**Evidence:** https://markdown-all-in-one.github.io/docs/

VS Code's bundled markdown extension uses `parseMixed`-style nested language injection for syntax highlighting inside code fences — this is standard TextMate grammar behavior.

### Obsidian

**Source Mode:** Inline code gets gray background + monospace. Fenced code text wraps as normal prose unless user disables wrap.
**Confidence:** INFERRED (T2)

**Live Preview:** Renders code blocks as syntax-highlighted blocks (separate render layer with Prism/Shiki). Cursor entry reveals source of the code block (same cursor-reveal pattern as tables/blockquotes).
**Confidence:** INFERRED (T2 — community plugin behavior confirms)

### SilverBullet

Prior report (`codemirror-markdown-source-view-rendering/evidence/d5-silverbullet.md`) noted `client/codemirror/fenced_code.ts` using `IFrameWidget` for custom code-block renderers (e.g., mermaid diagrams). This is S3-level complexity — each code block can have its own embedded renderer.
**Confidence:** CONFIRMED (T1 via prior report)

### codemirror-rich-markdoc

`richEdit.ts` applies `decorationCode` class to BOTH `FencedCode` AND `InlineCode` ranges (same class). No separate wrap-override on fenced; relies on the enclosing container's CSS.
**Confidence:** CONFIRMED (T1 — source-verified)
**Evidence:** `/tmp/cm-rich-markdoc/src/richEdit.ts:11-52`

```ts
const tokenElement = [
  'InlineCode',
  'Emphasis',
  'StrongEmphasis',
  'FencedCode',
  'Link',
];
// ...
if (node.name === 'FencedCode')
  widgets.push(decorationCode.range(node.from, node.to));
```

This decorates code but does not replace it with a widget (that's handled in `renderBlock.ts` for other constructs; code is inline-marked rather than block-replaced).

### HedgeDoc / Typora / Marktext / MDXEditor / HackMD

Baseline behavior: syntax coloring for the fence markers via TextMate/Prism grammars; content text follows editor-wide wrap setting. No language-label widget, no no-wrap-in-code override.
**Confidence:** INFERRED (T2/T3)

---

## Syntax highlighting inside code blocks

**Finding D3-2:** `@codemirror/lang-markdown` supports nested language parsing via the `codeLanguages` option. When the info string after opening ``` matches a registered language, that language's parser parses the code content.
**Confidence:** CONFIRMED (T1)
**Evidence:** https://github.com/codemirror/lang-markdown README

**Gap:** Default `markdown()` (no options) does NOT highlight code content. The consumer must pass `codeLanguages: languages` (from `@codemirror/language-data`) or a custom resolver.

---

## Language badge / run button

No surveyed product ships a language-label badge or run button as default in source view. This is unclaimed territory.
**Confidence:** NOT FOUND (searched Obsidian community plugins, VS Code extensions, SilverBullet source)

---

## Inline code (long) wrap behavior

No surveyed product applies special wrap strategy distinct from prose for long inline code:
- codemirror-rich-markdoc: same `decorationCode` class as fenced; no special break-word CSS
- Obsidian: gray background + mono; wraps per editor setting
- VS Code: same

**Confidence:** NOT FOUND (nothing observed)

---

## Gaps / follow-ups

- **Nested-language syntax highlighting:** default `markdown()` is bare; consumers must opt in. Community expectation varies.
- **Language-label badge widget:** unclaimed territory — feasible but not shipped
- **Inline-code-wrap-inside-prose:** ecosystem accepts ugly mid-token wrap
- **SilverBullet's `IFrameWidget`** — the most ambitious pattern observed (sandbox per code block); its performance and maintenance cost are unquantified
