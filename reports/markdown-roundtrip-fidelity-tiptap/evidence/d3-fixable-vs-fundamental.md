# Evidence: D3 — Fixable vs Fundamental Losses

**Dimension:** D3 — What's fixable vs fundamental
**Date:** 2026-04-07
**Sources:** ProseMirror document model analysis, @tiptap/markdown v3 source code, prosemirror-markdown source code

---

## Key files referenced

- `prosemirror-markdown/src/schema.ts` — `code_block` has `params` attr (info string), lists have `tight` attr
- `@tiptap/markdown/src/MarkdownManager.ts` lines 161-231 — custom tokenizer registration via `marked.use()`
- `@tiptap/markdown/src/Extension.ts` lines 68-87 — extension options including `marked` instance injection
- `tiptap-markdown/src/extensions/nodes/code-block.js` — code block serializer writes `node.attrs.language`

---

## Findings

### Classification of each lossy pattern

#### 1. Reference-style links → inline links
**Category: FUNDAMENTAL**
**Confidence:** CONFIRMED

ProseMirror's `link` mark stores `{href, title}`. There is no attribute for "reference label" or "reference definition". The distinction between `[text][ref]` and `[text](url)` is a markdown-level formatting choice that PM's document model cannot represent.

**Why it can't be fixed:** Adding a `referenceLabel` attribute to the link mark would require:
- Custom link mark schema
- Custom serializer to reconstruct `[text][ref]` + footnote block
- The footnote definitions would need to be stored somewhere (a separate node at doc root?)
- When editing in WYSIWYG, users don't see reference labels — so the label becomes orphaned metadata

**Impact:** Low for most use cases. Reference-style links are uncommon in modern markdown. The inline form preserves all semantic content (URL, title, text).

#### 2. Indented code blocks → fenced code blocks
**Category: COSMETIC / FIXABLE (unnecessary)**
**Confidence:** CONFIRMED

Both `marked` and `markdown-it` parse indented code blocks into the same code block token. ProseMirror stores code blocks with a `params`/`language` attribute. The serializer always emits fenced (`` ``` ``) syntax.

**Why it's acceptable:** Fenced code blocks are strictly more expressive (support language annotation). Converting indented → fenced is a lossless upgrade. No semantic information is lost.

#### 3. Tight vs loose lists
**Category: FIXABLE in prosemirror-markdown, BROKEN in @tiptap/markdown v3**
**Confidence:** CONFIRMED

**prosemirror-markdown:** The default schema defines `tight: {default: false}` on both `bullet_list` and `ordered_list`. The parser calls `listIsTight(tokens, i)` to detect tight lists from markdown-it tokens. The serializer respects this attribute via `renderList()`. **This works correctly.**

**@tiptap/markdown v3:** The official package loses tight/loose distinction. Test confirmed: `"- One\n\n- Two\n\n- Three"` (loose) → `"- One\n- Two\n- Three"` (tight). The @tiptap/markdown v3 serializer does not check a `tight` attribute on list nodes.

**community tiptap-markdown:** Includes `MarkdownTightLists` extension that adds a `tight` attribute class.

**Fix:** For @tiptap/markdown v3, a custom `renderMarkdown` handler on the `BulletList`/`OrderedList` extension could check `node.attrs.tight` and emit blank lines between items for loose lists. However, the parser must also SET this attribute, which requires a custom `parseMarkdown` handler that inspects the `loose` property on marked's list token.

#### 4. Trailing whitespace hard breaks
**Category: FIXABLE (serializer-level)**
**Confidence:** CONFIRMED

ProseMirror represents hard breaks as `hardBreak` nodes. The information "this is a hard break" is preserved perfectly. The only question is HOW to serialize it: trailing spaces (`  \n`) or backslash (`\\\n`).

**@tiptap/markdown v3:** Serializes as trailing spaces. Input `\\\n` → output `  \n`. Round-trip stable after first cycle.
**prosemirror-markdown:** Serializes as backslash. Input `  \n` → output `\\\n`. Round-trip stable after first cycle.

**Fix:** Custom `renderMarkdown` for `hardBreak` can choose either syntax. Both converge after 1 cycle.

#### 5. HTML blocks
**Category: PARTIALLY FIXABLE**
**Confidence:** CONFIRMED

**@tiptap/markdown v3:** HTML is entity-escaped on round-trip. `<div>` → `&lt;div&gt;`. This is because the parser stores HTML as text content, and the serializer encodes HTML entities.

**prosemirror-markdown:** HTML blocks are flattened to single-line HTML. Multi-line HTML blocks like `<div>\n  <p>text</p>\n</div>` become `<div> <p>This is HTML</p> </div>`. Line breaks within the block are lost.

**Why partially fixable:** ProseMirror can represent HTML blocks if you add an `htmlBlock` node type to the schema that stores raw HTML as an attribute. Both tiptap-markdown (community) and @tiptap/markdown v3 have HTML node handling (see `extensions/nodes/html.js`). However, arbitrary HTML inside markdown is an edge case that most knowledge platforms intentionally exclude.

#### 6. Blank line count between blocks
**Category: FUNDAMENTAL (and intentional)**
**Confidence:** CONFIRMED

Per CommonMark spec, multiple blank lines between blocks are semantically equivalent. ProseMirror normalizes to a single paragraph boundary. The @tiptap/markdown v3 team explicitly confirmed this is intentional behavior aligned with CommonMark (GitHub issue #7147).

**@tiptap/markdown v3 partial handling:** The MarkdownManager has `createImplicitEmptyParagraphsFromSpace()` which counts `\n\n` sequences in space tokens and creates empty paragraph nodes. This partially preserves extra blank lines as empty paragraphs. In testing: 4 blank lines → 3 blank lines (partially preserved but not exact).

#### 7. Blockquote line continuation
**Category: COSMETIC (converges)**
**Confidence:** CONFIRMED

Both parsers join continuation lines within the same blockquote paragraph. `> line1\n> line2` → `> line1 line2` (prosemirror-markdown) or preserved (@ tiptap/markdown v3 handles this correctly). Nested blockquotes format differently: `>>` → `> >` with blank lines. This is cosmetic and converges after 1 cycle.

#### 8. Bullet list marker character
**Category: COSMETIC / CONFIGURABLE**
**Confidence:** CONFIRMED

prosemirror-markdown uses `*`, @tiptap/markdown v3 uses `-`. Both are configurable. The community `tiptap-markdown` exposes `bulletListMarker` option.

#### 9. Frontmatter (YAML)
**Category: FUNDAMENTAL (no built-in support in any package)**
**Confidence:** CONFIRMED

`---` delimiters are parsed as horizontal rules by all three markdown parsers (marked, markdown-it, CommonMark). The YAML content between is parsed as regular markdown text (paragraphs, lists). Frontmatter is completely destroyed.

**Fix approach:** Strip frontmatter before parsing, store separately, re-prepend on serialize. See D6 evidence.

#### 10. Task list checkboxes
**Category: FIXABLE (extension needed)**
**Confidence:** CONFIRMED

@tiptap/markdown v3 test showed checkboxes stripped: `- [x] Done` → `- Done`. This is because the base StarterKit doesn't include a TaskList/TaskItem extension with parseMarkdown/renderMarkdown handlers.

**Fix:** Adding `@tiptap/extension-task-list` and `@tiptap/extension-task-item` with proper markdown handlers resolves this.

#### 11. Escaped characters
**Category: PARTIALLY FUNDAMENTAL**
**Confidence:** CONFIRMED

`\*asterisks\*` → `*asterisks*` (backslash escapes consumed during parsing). ProseMirror stores the literal text `*asterisks*` without knowledge that it was escaped. On serialize, since `*` doesn't need escaping in this context (not at a word boundary that would trigger emphasis), the backslashes are not re-added.

In contexts where the character WOULD trigger markdown syntax, the serializer does add escaping. But the original escaping choice is not preserved.

#### 12. GFM Table formatting
**Category: COSMETIC (converges)**
**Confidence:** CONFIRMED

Table cell padding, dash counts in separator rows, and alignment markers are reformatted. `| --- |` → `| -------- |`. Content is preserved perfectly. The formatting converges after 1 cycle.

---

## Summary Classification

| Pattern | Category | Semantic Loss? | Fixable? |
|---------|----------|---------------|----------|
| Reference links → inline | Fundamental | No (URL/title preserved) | Theoretically yes, practically no |
| Indented → fenced code | Cosmetic | No | Not needed |
| Tight/loose lists | Fixable | Yes (spacing intent lost) | Yes, via custom extension |
| Hard break syntax | Cosmetic | No | Yes (serializer config) |
| HTML blocks | Partially fixable | Possible | Yes, via htmlBlock node |
| Blank line count | Fundamental | No (cosmetic) | Partially (empty paragraphs) |
| Blockquote formatting | Cosmetic | No | Converges |
| Bullet marker char | Cosmetic | No | Config option |
| Frontmatter | Fundamental (no support) | Yes (destroyed) | Yes, via strip/prepend |
| Task list checkboxes | Fixable | Yes (state lost) | Yes, via TaskList extension |
| Escaped characters | Partially fundamental | No (text preserved) | Partial |
| Table formatting | Cosmetic | No | Converges |
