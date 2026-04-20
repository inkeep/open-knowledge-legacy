---
dimension: D2.3 — AST-diff normalization strategies
date: 2026-04-19
sources:
  - github.com/syntax-tree/unist-util-remove-position
  - github.com/syntax-tree/mdast-util-compact
  - github.com/syntax-tree/mdast-util-assert
  - github.com/markedjs/html-differ
  - github.com/syntax-tree/mdast-util-to-markdown
  - github.com/syntax-tree/mdast
---

# Evidence: D2.3 — AST-diff normalization strategies

## Key sources referenced
- [unist-util-remove-position](https://github.com/syntax-tree/unist-util-remove-position) — strip `position` fields before comparison
- [mdast-util-compact](https://github.com/syntax-tree/mdast-util-compact) — merges adjacent text nodes and block quotes
- [mdast-util-assert](https://github.com/syntax-tree/mdast-util-assert) — validate tree shape (not compare)
- [markedjs/html-differ](https://github.com/markedjs/html-differ) — HTML comparison with whitespace/attribute normalization
- [mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown) — serialize mdast to markdown
- [mdast spec §normalize](https://github.com/syntax-tree/mdast) — normalization rules for identifiers

---

## Findings

### Finding: unist-util-remove-position is the canonical pre-comparison step for mdast
**Confidence:** CONFIRMED
**Evidence:** From the [unist-util-remove-position README](https://github.com/syntax-tree/unist-util-remove-position):

> "While positional info is often important for using ASTs, when comparing trees or inserting one tree into another, the positional info can be useless and at worst harmful."

API signature: `removePosition(node, { force?: boolean })`. Recursive by default. Mutates tree in place. When `force: false` (default), sets `position` fields to `undefined`; when `force: true`, uses `delete`.

**Implications:**
- Without this step, deep-equal comparison between two parse runs of the same input would fail because offsets differ in unrelated trees
- This only addresses the positional dimension of divergence — other fields (raw source, implementation-specific extras) must be normalized separately
- Only applies to unist-shaped trees; markdown-it tokens need their own position-stripping routine

### Finding: mdast-util-compact merges adjacent text and blockquote nodes
**Confidence:** CONFIRMED
**Evidence:** From the [mdast-util-compact](https://github.com/syntax-tree/mdast-util-compact) package description:

> "utility to make an mdast tree compact" — merges adjacent text nodes and block quotes

**Implications:**
- Compacting normalizes a representational choice: two parsers (or two invocations) may split text runs differently (e.g., one vs several Text nodes) even when the content is identical
- Applied pre-diff, this removes one known false-positive class
- Does not merge emphasis/strong or other inline containers

### Finding: No mdast-to-markdown-it-tokens (or vice-versa) converter exists in the public ecosystem
**Confidence:** INFERRED (from targeted searches)
**Evidence:**
- [syntax-tree/awesome-syntax-tree](https://github.com/syntax-tree/awesome-syntax-tree) catalogs unist utilities; no cross-parser token-to-AST utility listed
- [markdown-it issue #176](https://github.com/markdown-it/markdown-it/issues/176): "one developer considered writing a library to convert the markdown-it token stream to/from an AST but decided against it"
- Per the GoCardless blog [Having Fun with Markdown and Remark](https://gocardless.com/blog/fun-with-markdown-and-remark/): remark "has a very well-specified process for converting Markdown -> AST -> HTML" — markdown-it does not produce a tree at all

**Implications:**
- Direct AST-to-AST diff between remark and markdown-it is not viable without writing a bespoke converter
- Practical alternative: compare via intermediate HTML using `html-differ`, or via serialized normalized markdown

### Finding: markedjs/html-differ provides the JS equivalent of CommonMark's normalize_html
**Confidence:** CONFIRMED
**Evidence:** [markedjs/html-differ README](https://github.com/markedjs/html-differ):

> "html-differ ignores whitespaces (spaces, tabs, new lines etc.) inside start and end tags during comparison. Additionally, two respective lists of attributes are considered equivalent even if specified in different order."

**Implications:**
- Provides an HTML-level oracle that matches the CommonMark spec test expectation closely
- Usable directly in a Bun test: install, parse both outputs, assert via `isEqual`
- Handles the known "always differ at surface level" classes for HTML: whitespace collapsing, attribute ordering, self-closing vs explicit close

### Finding: mdast-util-to-markdown round-tripping is explicitly non-deterministic
**Confidence:** CONFIRMED
**Evidence:** [mdast-util-to-markdown README](https://github.com/syntax-tree/mdast-util-to-markdown):

> "Complete roundtripping is impossible given that any value could be injected into the tree."

**Implications:**
- `serialize(parse(md))` is the existing identity oracle in the parent pipeline — but this is the SAME parser on both sides, which limits its fault coverage
- Cross-parser round-trip (parse with A, serialize through A's serializer, re-parse with B) introduces extra normalization steps
- Serializer output is stable for the same input AST but may differ from the original source text in non-semantic ways (e.g., `*foo*` vs `_foo_`)

### Finding: mdast's identifier normalization is a known spec-level normalizer
**Confidence:** CONFIRMED
**Evidence:** From the [mdast specification](https://github.com/syntax-tree/mdast) on normalization:

> "To normalize a value, collapse markdown whitespace ([\t\n\r ]+) to a space, trim the optional initial and/or final space, and perform case-folding."

Used for: link reference identifiers, footnote identifiers, etc.

**Implications:**
- When comparing trees that reference definitions, identifiers must be normalized on both sides
- Already applied inside mdast; relevant when converting from non-unist parsers (markdown-it tokens) where raw labels may not be case-folded

### Finding: Known "always differ" categories across CommonMark-compliant JS parsers
**Confidence:** INFERRED (from multi-source comparison)
**Evidence:** No single canonical list exists, but the following categories surface repeatedly in:
- [markdown-it issue #176](https://github.com/markdown-it/markdown-it/issues/176) (discussing token vs tree divergence)
- [marked CommonMark discussion #1202](https://github.com/markedjs/marked/discussions/1202) (listing compliance gaps)
- mdast vs markdown-it structural differences

Categories consistently divergent between parsers:
1. **Positional/offset info** — every parser records differently; always strip
2. **Raw source text attributes** — micromark-based parsers preserve `value` fields; others don't
3. **Comment handling** — HTML comments in markdown are tokenized inconsistently
4. **Soft-break vs hard-break** — `\n` in a paragraph: remark emits a Break node; markdown-it emits a `softbreak` token
5. **Whitespace intrinsics** — indentation of nested lists, trailing whitespace on lines
6. **Empty lines handling** — especially around lists and blockquotes (per marked's ~68% images / 83% links compliance)
7. **Autolink vs raw URL** — `<https://...>` vs `https://...` tokenization
8. **Entity decoding timing** — `&amp;` as text vs decoded `&`

**Implications:**
- Any JS-vs-JS differential harness must either (a) exclude these categories by design, or (b) accept them as expected-divergence and record them in an allowlist
- The HTML oracle (via html-differ) resolves several of these implicitly (soft-break, autolink, entity decoding) by rendering to a common target
- The AST oracle requires explicit per-category normalization

---

## Gaps / follow-ups
- No formal tool catalogs the "always differ" set; it is folklore from parser issue trackers
- mdast-util-assert validates shape but does not diff — no public unist-util-diff package exists for detailed tree-level differences with user-configurable ignored paths
