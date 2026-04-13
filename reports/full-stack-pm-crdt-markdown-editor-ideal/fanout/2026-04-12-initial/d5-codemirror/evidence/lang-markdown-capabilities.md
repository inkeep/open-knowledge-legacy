# @codemirror/lang-markdown v6.5.0 + @lezer/markdown v1.6.3 — Capabilities

## Source: `node_modules/@codemirror/lang-markdown/`, `node_modules/@lezer/markdown/`

### Parser Architecture

**Not an LR parser.** Hand-written, incremental, two-phase parser producing Lezer-compatible syntax trees.

- Phase 1 (Block): line-by-line, maintains CompositeBlock stack (Document, Blockquote, BulletList, etc.)
- Phase 2 (Inline): character-by-character on leaf content, delimiter-matching for emphasis/strikethrough
- Incremental: accepts TreeFragment[] for partial reparse on edits

### GFM Support

Built-in as named extensions in `@lezer/markdown`:
- **Table** — block parser for pipe-delimited tables
- **Strikethrough** — inline parser for `~~text~~`
- **TaskList** — leaf block parser for `[ ]`/`[x]`
- **Autolink** — inline parser for URLs/emails
- **GFM** — convenience bundle of all four

Plus: `Subscript` (`~text~`), `Superscript` (`^text^`), `Emoji` (`:name:`)

**`markdownLanguage`** (exported from `@codemirror/lang-markdown`) includes GFM + Sub/Super/Emoji.
**`commonmarkLanguage`** (the default) does NOT include GFM.

### Current Project State

`SourceEditor.tsx` line 61 calls `markdown()` with no config → uses `commonmarkLanguage`.
**GFM features (tables, strikethrough, task lists) are NOT highlighted in source mode.**

### MDX/JSX Support

**Not supported.** No built-in MDX or JSX awareness in @lezer/markdown.

Possible approaches:
1. Custom `parseInline` with `before: "HTMLTag"` — conflicts with built-in HTML parser
2. Custom `parseBlock` with `before: "HTMLBlock"` — similar conflicts
3. `parseCode` + nested parser via `wrap` — only for fenced code blocks and HTML blocks

Community status (discuss.codemirror.net, Dec 2024): Question asked, no official solution.

### Frontmatter Support

**Not supported.** `---` at document start parsed as HorizontalRule or SetextHeading.

Approach: custom `parseBlock` extension with `before: "HorizontalRule"`, combine with
`parseMixed` to delegate inner content to `@codemirror/lang-yaml`.

### Extension Model (MarkdownConfig)

Five extension points:
1. `defineNodes` — define new node types with optional styling
2. `parseInline` — custom inline parsers (trigger on char code, scan forward)
3. `parseBlock` — custom block parsers (eager, leaf, composite)
4. `remove` — disable built-in parsers by name
5. `wrap` — parse wrappers for nested languages (via parseMixed)

### Wiki-Link Extension Example

```typescript
const WikiLink: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: t.link },
    { name: "WikiLinkMark", style: t.processingInstruction }
  ],
  parseInline: [{
    name: "WikiLink",
    parse(cx, next, pos) {
      if (next !== 91 || cx.char(pos + 1) !== 91) return -1;
      for (let i = pos + 2; i < cx.end - 1; i++) {
        if (cx.char(i) === 93 && cx.char(i + 1) === 93) {
          return cx.addElement(cx.elt("WikiLink", pos, i + 2, [
            cx.elt("WikiLinkMark", pos, pos + 2),
            cx.elt("WikiLinkMark", i, i + 2)
          ]));
        }
      }
      return -1;
    },
    before: "Link"
  }]
};
```

### codeLanguages Integration

`markdown({ codeLanguages })` accepts a resolver function:
```typescript
codeLanguages: (info: string) => LanguageDescription | null
```
Used to delegate fenced code block content to language-specific parsers (e.g., `@codemirror/lang-javascript` for ```js blocks).
