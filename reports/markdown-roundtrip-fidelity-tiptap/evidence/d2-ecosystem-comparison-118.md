---
type: synthesis
supersedes: d2-ecosystem-comparison.md
date: 2026-04-11
probe: d2-three-library-probe.ts
results: d2-three-library-results.tsv
---

# Evidence: D2 — 118-Case Ecosystem Comparison

**Dimension:** D2 — prosemirror-markdown vs @tiptap/markdown vs marked-only, full 118-construct comparison
**Date:** 2026-04-11
**Supersedes:** d2-ecosystem-comparison.md (27-case shallow comparison from 2026-04-07)
**Sources:** Programmatic round-trip of 118 constructs through three live pipelines

---

## TLDR

**No single library wins across the board.** Each library has a distinct failure profile:

| Library | BYTE_IDENTICAL | WHITESPACE_DIFF | Material bugs | Critical bugs fixed vs tiptap |
|---|---|---|---|---|
| **@tiptap/markdown** | 2 | 77 | 39 (10 entity, 4 backslash, 15 structure, 7 semantic, 3 cosmetic) | -- |
| **prosemirror-markdown** | 2 | 74 | 42 (0 entity, 0 backslash, 22 structure, 8 semantic, 3 cosmetic, 9 not-in-schema) | Entity bug: YES. Backslash bug: YES. |
| **marked-only** | 2 | 91 | 25 (0 entity, 0 backslash, 15 structure, 8 semantic, 2 cosmetic) | Entity bug: YES. Backslash bug: YES. |

**Key answers:**

1. **Does prosemirror-markdown fix the entity corruption bug?** YES. All 10 entity corruption cases (`&` in headings, paragraphs, link text, tables; `<`/`>` in text; named entities) round-trip correctly through prosemirror-markdown. `# H&M Store` survives byte-identical.

2. **Does prosemirror-markdown fix the backslash escape bug?** YES. All 4 backslash-escape cases (`\*`, `\_`, `\[`, `\#`) round-trip correctly. `Literal \*not italic\*.` survives.

3. **What does prosemirror-markdown break?** Its default schema lacks GFM extensions: strikethrough (`~~text~~`), task lists (`- [ ] todo`), and tables all either get escaped or lose structure. Wiki-links are completely unknown to it. It uses `*` bullets instead of `-`. It collapses soft breaks. It decodes named/numeric entities to their Unicode characters (lossy from a source-preservation perspective).

4. **Is marked-only (no editor) the best round-tripper?** For raw tokenization fidelity, yes. 91/118 whitespace-only diffs vs 77 for tiptap and 74 for PM. But "marked-only" is not a usable editor pipeline -- it proves that **marked's tokenizer preserves the data; the corruption happens in the serialize layer of the editor libraries.**

---

## Aggregate Classification Comparison

### @tiptap/markdown (marked v17 + TipTap JSON)

| Classification | Count |
|---|---|
| WHITESPACE_DIFF | 77 |
| STRUCTURE_CHANGE | 15 |
| ENTITY_CORRUPTION | 10 |
| SEMANTIC_LOSS | 7 |
| BACKSLASH_ESCAPE_CONSUMED | 4 |
| COSMETIC_NORMALIZATION | 3 |
| BYTE_IDENTICAL | 2 |

### prosemirror-markdown (markdown-it v14 + ProseMirror doc)

| Classification | Count |
|---|---|
| WHITESPACE_DIFF | 74 |
| STRUCTURE_CHANGE | 22 |
| NOT_IN_SCHEMA | 9 |
| SEMANTIC_LOSS | 8 |
| COSMETIC_NORMALIZATION | 3 |
| BYTE_IDENTICAL | 2 |

### marked-only (marked lexer + manual token reconstruction)

| Classification | Count |
|---|---|
| WHITESPACE_DIFF | 91 |
| STRUCTURE_CHANGE | 15 |
| SEMANTIC_LOSS | 8 |
| COSMETIC_NORMALIZATION | 2 |
| BYTE_IDENTICAL | 2 |

---

## Head-to-Head: The 21 Constructs Where prosemirror-markdown Beats @tiptap/markdown

These are the cases where PM produces strictly less corruption than tiptap:

| Construct | tiptap class | PM class | What PM does right |
|---|---|---|---|
| `link-with-ampersand-in-text` | ENTITY_CORRUPTION | WHITESPACE_DIFF | Preserves `&` in `[A & B](url)` |
| `html-block-div` | ENTITY_CORRUPTION | WHITESPACE_DIFF | Preserves `<div>` as raw HTML |
| `html-inline-span` | ENTITY_CORRUPTION | WHITESPACE_DIFF | Preserves `<span>` inline |
| `html-br` | ENTITY_CORRUPTION | WHITESPACE_DIFF | Preserves `<br>` tag |
| `gfm-table-with-ampersand` | ENTITY_CORRUPTION | WHITESPACE_DIFF | Preserves `&` in table cell |
| `ampersand-literal-in-heading` | ENTITY_CORRUPTION | WHITESPACE_DIFF | `# H&M Store` preserved |
| `ampersand-literal-in-paragraph` | ENTITY_CORRUPTION | WHITESPACE_DIFF | `Foo & Bar` preserved |
| `lt-gt-in-paragraph` | ENTITY_CORRUPTION | WHITESPACE_DIFF | `a < b` preserved |
| `named-entity-copy` | ENTITY_CORRUPTION | SEMANTIC_LOSS | Decodes to `(c)` -- lossy but not corrupted |
| `named-entity-mdash` | ENTITY_CORRUPTION | SEMANTIC_LOSS | Decodes to `--` -- lossy but not corrupted |
| `backslash-escape-asterisk` | BACKSLASH_CONSUMED | WHITESPACE_DIFF | `\*text\*` preserved |
| `backslash-escape-underscore` | BACKSLASH_CONSUMED | WHITESPACE_DIFF | `\_text\_` preserved |
| `backslash-escape-bracket` | BACKSLASH_CONSUMED | WHITESPACE_DIFF | `\[text\]` preserved |
| `backslash-escape-hash` | BACKSLASH_CONSUMED | WHITESPACE_DIFF | `\# text` preserved |
| `paragraph-with-hard-break-backslash` | COSMETIC | WHITESPACE_DIFF | Preserves `\` line-break syntax |
| `list-bullet-asterisk` | STRUCTURE_CHANGE | WHITESPACE_DIFF | Uses `*` natively (input was `*`) |
| `inline-code-with-backticks` | STRUCTURE_CHANGE | WHITESPACE_DIFF | Double-backtick wrapping preserved |
| `link-autolink` | SEMANTIC_LOSS | WHITESPACE_DIFF | `<https://url>` preserved as autolink |
| `gfm-table-aligned` | STRUCTURE_CHANGE | WHITESPACE_DIFF | Table alignment preserved |
| `gfm-autolink-bare-url` | SEMANTIC_LOSS | WHITESPACE_DIFF | Bare URL preserved as-is |
| `trailing-newlines` | SEMANTIC_LOSS | WHITESPACE_DIFF | No `&nbsp;` injection |

## Head-to-Head: The 25 Constructs Where @tiptap/markdown Beats prosemirror-markdown

These are cases where tiptap produces strictly less corruption than PM:

| Construct | tiptap class | PM class | What tiptap does right |
|---|---|---|---|
| `gfm-task-list-unchecked` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Task lists in schema |
| `gfm-task-list-checked` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Task lists in schema |
| `gfm-strikethrough` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Strikethrough in schema |
| `wikilink-bare` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Wiki-link extension |
| `wikilink-with-alias` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Wiki-link extension |
| `wikilink-with-section` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Wiki-link extension |
| `wikilink-with-section-and-alias` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Wiki-link extension |
| `wikilink-inside-list` | WHITESPACE_DIFF | NOT_IN_SCHEMA | Wiki-link extension |
| `list-bullet-dash` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Uses `-` bullet (input was `-`) |
| `list-bullet-single-item` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Uses `-` bullet |
| `list-tight` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Tight list preserved (bullet marker aside) |
| `list-loose` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Loose list handled (both collapse to tight) |
| `list-nested-2-levels` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Nesting preserved with `-` |
| `list-nested-3-levels` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Nesting preserved with `-` |
| `list-nested-mixed` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Mixed list nesting preserved |
| `paragraph-with-hard-break-spaces` | WHITESPACE_DIFF | COSMETIC | Trailing-space hard break preserved |
| `blockquote-multiline` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Multi-line blockquote preserved |
| `already-encoded-amp` | WHITESPACE_DIFF | COSMETIC | `&amp;` preserved literally |
| `already-encoded-lt-gt` | WHITESPACE_DIFF | STRUCTURE_CHANGE | `&lt;tag&gt;` preserved literally |
| `numeric-entity-decimal` | COSMETIC | SEMANTIC_LOSS | Entity preserved (double-encoded, but present) |
| `numeric-entity-hex` | COSMETIC | SEMANTIC_LOSS | Entity preserved (double-encoded, but present) |
| `math-operators` | WHITESPACE_DIFF | COSMETIC | `*` in formula not escaped |
| `frontmatter-yaml` | STRUCTURE_CHANGE | NOT_IN_SCHEMA | Less mangled (both bad) |
| `list-containing-code` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Code in list preserved compactly |
| `list-containing-heading` | WHITESPACE_DIFF | STRUCTURE_CHANGE | Heading in list preserved compactly |

---

## Construct-Level Bug Answer Sheet

### Does prosemirror-markdown fix the entity corruption bug?

**YES -- completely.** All 10 entity corruption cases that affect @tiptap/markdown produce clean output through prosemirror-markdown:

| Construct | @tiptap/markdown output | prosemirror-markdown output |
|---|---|---|
| `# H&M Store` | `# H&amp;M Store` | `# H&M Store` |
| `Foo & Bar & Baz.` | `Foo &amp; Bar &amp; Baz.` | `Foo & Bar & Baz.` |
| `If a < b and b > c` | `If a &lt; b and b &gt; c` | `If a < b and b > c` |
| `[A & B](url)` | `[A &amp; B](url)` | `[A & B](url)` |
| `\| A & B \| test \|` | `\| A &amp; B \|` | `\| A & B \|` (as text) |
| `<div>block</div>` | `&lt;div&gt;...&lt;/div&gt;` | `<div>block</div>` |
| `<span>inline</span>` | `&lt;span&gt;...&lt;/span&gt;` | `<span>inline</span>` |
| `<br>` | `&lt;br&gt;` | `<br>` |
| `&copy; 2026` | `&amp;copy; 2026` | `(c) 2026` (decoded) |
| `&mdash;` | `&amp;mdash;` | `--` (decoded) |

**Root cause:** prosemirror-markdown's serializer (`MarkdownSerializerState.text()`) intelligently escapes only characters that would create markdown syntax conflicts. It does NOT unconditionally HTML-entity-encode. This is the architectural difference -- `@tiptap/core`'s `encodeHtmlEntities` function is the sole source of the bug.

**Caveat for named/numeric entities:** prosemirror-markdown DECODES `&copy;` to `(c)` and `&#169;` to the literal copyright symbol. This is semantically correct but source-level lossy -- the author's choice to use the entity form is not preserved. Only marked-only preserves these byte-identically.

### Does prosemirror-markdown fix the backslash escape bug?

**YES -- completely.** All 4 backslash-escape cases survive:

| Construct | @tiptap/markdown output | prosemirror-markdown output |
|---|---|---|
| `\*not italic\*` | `not italic` (DROPPED) | `\*not italic\*` |
| `\_not italic\_` | `not italic` (DROPPED) | `\_not italic\_` |
| `\[not link\]` | `not link` (DROPPED) | `\[not link\]` |
| `\# Not a heading` | ` Not a heading` (DROPPED) | `\# Not a heading` |

### Does prosemirror-markdown handle link reference definitions?

**NO.** Both libraries inline reference-style links: `[text][ref] + [ref]: url` becomes `[text](url)`. This is a **shared fundamental limitation** of ProseMirror-based editors -- the document model has no concept of "link definition in document footer."

### What does prosemirror-markdown's default schema NOT support?

9 constructs fall into `NOT_IN_SCHEMA` because prosemirror-markdown's default schema is minimal CommonMark:

| Construct | PM behavior |
|---|---|
| Task lists (`- [ ]`) | Brackets escaped: `\[ \]` |
| Strikethrough (`~~text~~`) | Tildes escaped: `\~\~text\~\~` |
| Wiki-links (`[[Page]]`) | Brackets escaped: `\[\[Page\]\]` |
| Frontmatter (`---\n...\n---`) | Parsed as HR + headings |

These are GFM and custom extensions -- PM doesn't know about them without custom schema + parse/serialize rules.

---

## Where Does Each Library Win?

### marked-only wins on: Raw fidelity

91/118 whitespace-only (vs 77 tiptap, 74 PM). The tokenizer preserves everything; corruption is introduced by editor serializers.

**Notable unique wins:** Named/numeric entities preserved literally (`&copy;`, `&#169;`) -- both tiptap (double-encodes) and PM (decodes to Unicode) lose the entity form.

### prosemirror-markdown wins on: Correctness of special characters

0 entity corruption, 0 backslash escape loss. If your content has `&`, `<`, `>`, or backslash-escaped markdown syntax, PM is strictly safer.

**Also wins on:** Autolinks preserved as `<url>`, inline code backtick wrapping preserved, HTML blocks/inline preserved, trailing-newline handling (no `&nbsp;` injection).

### @tiptap/markdown wins on: GFM + custom extension breadth

Task lists, strikethrough, wiki-links, tables (formatted) all work natively because the TipTap extension system declares parse/serialize handlers per extension.

**Also wins on:** Already-encoded entities preserved literally (PM decodes them), list nesting, blockquote formatting, `-` bullet marker (matches modern convention).

---

## Implications for Prior Report Conclusions

The prior D2 conclusion (2026-04-07) stated: "@tiptap/markdown v3 is the right choice for TipTap-based projects despite marginally lower fidelity." The 118-case data **reinforces this conclusion but with sharper nuance:**

1. **The "marginally lower fidelity" was understated.** The entity corruption (10 cases) and backslash escape consumption (4 cases) are not marginal -- they're content-destroying bugs. The prior 27-case test set did not include enough special-character cases to reveal this.

2. **The right answer is still @tiptap/markdown** because the GFM and custom extension support is essential for our use case (task lists, strikethrough, wiki-links, tables). Switching to prosemirror-markdown would fix 14 bugs but introduce 9 NOT_IN_SCHEMA failures that are harder to fix (require custom ProseMirror schema + serializer rules for each extension).

3. **The fix strategy is confirmed:** patch `@tiptap/markdown`'s entity encoding at our serialize call sites (Option A from D3: post-process wrapper). This is ~30 LOC and fixes 10 cases. The backslash escape bug requires a separate fix at the parse level (marked consumes escapes into raw text; the parse handler doesn't re-escape on serialization).

4. **Migration to prosemirror-markdown is NOT recommended.** The cost is high (custom schema + handlers for every GFM/custom extension), the benefit is concentrated in entity/backslash handling (which we can fix in @tiptap/markdown), and the fidelity gains in other areas are marginal.

---

## Full Comparison Table

See companion file: [d2-three-library-results.tsv](d2-three-library-results.tsv) (118 rows x 8 columns: name, category, tiptapClass, pmClass, markedClass, tiptapOutput, pmOutput, markedOutput).
