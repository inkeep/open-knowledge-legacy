# Evidence: marked + @tiptap/markdown MarkdownManager Architecture

**Dimension:** D1 — marked + MarkdownManager end-to-end architecture
**Date:** 2026-04-12
**Sources:** Installed `@tiptap/markdown@3.22.3` source; marked v17 source; TipTap official docs.

---

## Key files / pages referenced

- `node_modules/@tiptap/markdown/src/MarkdownManager.ts` — the core parse/serialize engine (1,307 lines in v3.22.3)
- `node_modules/@tiptap/core/src/utilities/htmlEntities.ts` — the `encodeHtmlEntities` function
- `node_modules/marked/src/Lexer.ts` — marked tokenizer
- [Tiptap docs: Custom tokenizer](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-tokenizer) — confirms MarkedJS is the lexer
- [markedjs/marked discussion #1202](https://github.com/markedjs/marked/discussions/1202) — CommonMark compliance

---

## Findings

### Finding: @tiptap/markdown wraps marked with a per-extension dispatch framework
**Confidence:** CONFIRMED
**Evidence:** `node_modules/@tiptap/markdown/src/MarkdownManager.ts:116-127, 268-325, 601-634, 945-964`

The MarkdownManager exposes two public methods:
- `parse(markdown: string) → JSONContent` — runs marked's Lexer, then walks the token tree dispatching each token to a registered extension's `parseMarkdown(token, helpers)` method based on `markdownTokenName`
- `serialize(docOrContent: JSONContent) → string` — walks the ProseMirror node tree dispatching each node/mark to a registered extension's `renderMarkdown(node, helpers, context)` method based on node/mark name

Extension registration fields read:
- `markdownTokenName` (line 116) — which marked token type dispatches to this extension
- `parseMarkdown` (line 117) — parse handler
- `renderMarkdown` (line 118) — render handler
- `markdownTokenizer` (line 121) — optional custom marked extension for new syntax
- `markdownOptions` (line 127) — `{ indentsContent?, htmlReopen? }` config
- `code` (line 108) — flag that disables HTML entity encoding for this node's text

Parse helpers object (lines 601-634): `parseInline`, `parseChildren`, `parseBlockChildren`, `createNode`, `createTextNode`, `applyMark`.
Render helpers object (lines 945-964): `renderChildren`, `renderChild`, `indent`, `wrapInBlock`.

### Finding: marked CommonMark compliance improved substantially from v0.5.0 to v4.2.3; current weakest categories are Images (68%) and Links (83%)
**Confidence:** CONFIRMED
**Evidence:** [markedjs/marked discussion #1202](https://github.com/markedjs/marked/discussions/1202)

Original 2018 data (v0.5.0): **467/624 tests passing (~74.8%)** with this architectural explanation:

> "Marked uses a recursive block tokenizing strategy, but CommonMark was designed with a line-by-line token strategy in mind, which causes many failed test cases in container block sections like blockquotes, list items, and lists."

Current data (v4.2.3, November 2022) per same discussion thread:
- Most sections at 100% (Tabs, Backslash escapes, ATX headings, Emphasis/Strong)
- Entity and numeric character references: 15/17 (88%)
- Setext headings: 26/27 (96%)
- Block quotes: 23/25 (92%)
- **Links: 75/90 (83%)** ← weak
- **Images: 15/22 (68%)** ← weakest

Overall aggregate has improved to ~90%+. The **remaining gaps are concentrated in Images and Links** — precisely where @tiptap/markdown has shipped round-trip bugs (entity corruption in link URLs, image alt text preservation). The "architectural cap" framing was accurate for v0.5.0 but has been steadily chipped down by incremental work. However, the specific gaps that remain align with our fidelity pain points.

### Finding: Two content-destroying bugs existed in @tiptap/markdown as of late 2025
**Confidence:** CONFIRMED
**Evidence:** [Issue #7258 (OPEN)](https://github.com/ueberdosis/tiptap/issues/7258), [Issue #7539 (FIXED)](https://github.com/ueberdosis/tiptap/issues/7539)

**Issue #7258 — Escape character mishandling** (opened Nov 21, 2025, **still open** as of April 2026):
- Input `\*text\*` is rendered italicized instead of as literal asterisks
- Root cause: `parseInlineTokens` in MarkdownManager.ts has no case for marked's `escape` token type
- Marked emits `{ type: 'escape', raw: '\\*', text: '*' }` for `\*`, but without a handler the token falls through and the backslash is dropped

**Issue #7539 — Entity double-encoding** (opened Feb 24, 2026, closed Feb/Mar 2026):
- Reporter: *"I get either no escaping of `<` and `>` or, essentially a double-escaping of `&`."*
- Root cause: `encodeTextForMarkdown` in MarkdownManager.ts:910 called `encodeHtmlEntities` unconditionally, converting `&` → `&amp;` on every save
- Fixed upstream via PR #7565 merged into 3.20.x line

### Finding: Our repo patches both bugs via bun patch
**Confidence:** CONFIRMED
**Evidence:** `patches/@tiptap%2Fmarkdown@3.22.3.patch`

Two surgical modifications to MarkdownManager.ts:
1. Escape token handler added to `parseInlineTokens` — preserves `token.raw` when token.type === 'escape'
2. `encodeTextForMarkdown` simplified to `return text` — bypasses entity encoding

The patch auto-applies on `bun install` via `patchedDependencies` in package.json. ~15 lines of our code maintained against upstream.

### Finding: Our 12 fidelity extensions depend on marked's token.raw field
**Confidence:** CONFIRMED
**Evidence:** All files in `packages/core/src/extensions/*-fidelity.ts`

Every fidelity extension reads `token.raw` (the original source string that produced the token) to extract the user's authoring choice:

- HeadingFidelity: `token.raw` to detect setext vs ATX
- ItalicFidelity/BoldFidelity: `token.raw.startsWith('_')` vs `*` to detect delimiter
- CodeBlockFidelity: `token.raw` fence char and length
- BulletListFidelity: `token.items[0].raw` first char for marker
- OrderedListFidelity: `token.raw` for `.` vs `)` delimiter
- HorizontalRuleFidelity: `token.raw` for `---`/`***`/`___`
- HardBreakFidelity: `token.raw` for backslash vs two-space form
- LinkFidelity: `token.raw` for reference-link style detection
- HtmlBlockFidelity: `token.raw` for verbatim block content
- LinkRefDefFidelity: reads `token.tag` (label), `token.href`, `token.title`
- ListItemFidelity: reads parent attrs for marker rendering

All of these require the tokenizer to expose source-form per-token. Marked does; mdast by default does NOT (mdast drops delimiter info — see D3).

### Finding: Custom marked tokenizers extend via `markdownTokenizer` field
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/extensions/jsx-tokenizer.ts` + `packages/core/src/extensions/wiki-link.ts` + `MarkdownManager.ts:156-158, 179-231`

Extensions declaring a `markdownTokenizer` object with `{name, level, start, tokenize, childTokens}` get converted via `this.markedInstance.use({ extensions: [...] })`. This is how our wiki-link (`[[Page]]`) and JSX component (`<Callout>...</Callout>`) tokenizers integrate.

The JSX tokenizer (`jsx-tokenizer.ts`) is ~370 LOC we maintain — regex-based, with two versions (regex + tag-counting + brace-depth) because the regex approach fails on nested same-name tags. This is entirely custom code we own because marked has zero first-class MDX/JSX support.

---

## Gaps / follow-ups

- **Not probed:** marked v18 (April 2026) — does it fix any CommonMark gaps? Unlikely given architectural root cause but worth checking if we stay on this stack.
- **Not measured:** latency of MarkdownManager.parse/serialize on our typical document sizes.
