---
dimension: "D5 — Tab handling and indented code blocks"
date: 2026-04-19
sources:
  - spec.commonmark.org
  - talk.commonmark.org
  - github.com/micromark/micromark
  - github.com/markdown-it/markdown-it
  - github.com/commonmark/commonmark.js
  - github.com/commonmark/cmark
  - github.com/commonmark/commonmark-spec
  - github.com/remarkjs/remark
  - github.com/syntax-tree/mdast-util-to-markdown
---

# Evidence: D5 — Tab Handling and Indented Code Blocks

## Key files / pages referenced

- [CommonMark 0.31.2 §2.2 Tabs](https://spec.commonmark.org/0.31.2/#tabs)
- [CommonMark 0.31.2 §4.4 Indented code blocks](https://spec.commonmark.org/0.31.2/#indented-code-blocks)
- [talk.commonmark.org — Tab-related issues](https://talk.commonmark.org/t/tab-related-issues/1831)
- [talk.commonmark.org — Tab expansion with indented code](https://talk.commonmark.org/t/tab-expansion-with-indented-code/2442)
- [talk.commonmark.org — Preserve tabs in code blocks as they are semantic](https://talk.commonmark.org/t/preserve-tabs-in-code-blocks-as-they-are-semantic/1165)
- [talk.commonmark.org — Abandon indented code blocks](https://talk.commonmark.org/t/we-should-abandon-indented-code-blocks/182)
- [micromark README — Preprocess section](https://github.com/micromark/micromark)
- [micromark issue #7](https://github.com/micromark/micromark/issues/7)
- [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs)
- [mdast-util-to-markdown format-code-as-indented.js](https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/format-code-as-indented.js)
- [commonmark/commonmark-spec #777](https://github.com/commonmark/commonmark-spec/issues/777) (OPEN)
- [commonmark/commonmark-spec #678](https://github.com/commonmark/commonmark-spec/issues/678)
- [commonmark/commonmark.js #59](https://github.com/commonmark/commonmark.js/issues/59)

---

## Findings

### Finding: CommonMark §2.2 specifies virtual-column tab expansion, NOT byte substitution

**Confidence:** CONFIRMED

**Evidence:** [CommonMark 0.31.2 §2.2](https://spec.commonmark.org/0.31.2/#tabs):

> "Tabs in lines are not expanded to spaces. However, in contexts where spaces help to define block structure, tabs behave as if they were replaced by spaces with a tab stop of 4 characters."

The rule is dual-layered:
1. At the byte level, tabs remain tabs.
2. At the structure-detection level, tabs fill virtual columns up to the next multiple of 4.

**Section §4.4 "Indented code blocks"**: detection requires "four or more spaces of indentation" on non-blank lines. Combined with §2.2, a single leading tab qualifies (it fills columns 1-4).

**Worked examples from the spec** (`→` = U+0009):

| # | Input | Expected HTML |
|---|---|---|
| [1](https://spec.commonmark.org/0.31.2/#example-1) | `→foo→baz→→bim` | `<pre><code>foo→baz→→bim\n</code></pre>` |
| [2](https://spec.commonmark.org/0.31.2/#example-2) | `  →foo→baz→→bim` | same as Example 1 — `  →` fills columns 1-4 |
| [5](https://spec.commonmark.org/0.31.2/#example-5) | `- foo\n\n→→bar` | list item with code content `"  bar"` — first tab fills 1-4 (consumed by list), second tab fills 5-8 (remaining 2 cols become code content leading spaces) |
| [6](https://spec.commonmark.org/0.31.2/#example-6) | `>→→foo` | blockquote with code content `"  foo"` |
| [9](https://spec.commonmark.org/0.31.2/#example-9) | ` - foo\n   - bar\n→ - baz` | 3-level nested list — tab fills 4 columns |
| [10](https://spec.commonmark.org/0.31.2/#example-10) | `#→Foo` | `<h1>Foo</h1>` — §4.2 technically requires U+0020 here, dingus diverges |

Example 5 is load-bearing: it demonstrates the *residue* behavior — when structural consumption takes 4 cols of an 8-col double-tab, the remaining 4 cols (including any bytes past the consumption point) become content.

---

### Finding: Tab expansion algorithm (reconstructed from spec + parser source)

**Confidence:** CONFIRMED

```
advance_column(tab, current_col):
    next_tab_stop = (floor(current_col / 4) + 1) * 4
    consumed_columns = next_tab_stop - current_col   // 1..4

    # Note: tab is NOT replaced; it fills [current_col .. next_tab_stop).
    # If block structure consumes exactly the tab width, tab disappears.
    # If structure consumes partial columns, the residue re-enters content
    # as literal spaces (not the original tab byte).
```

[talk.commonmark.org — Tab expansion with indented code](https://talk.commonmark.org/t/tab-expansion-with-indented-code/2442) (2017-05-09) has jgm clarifying: "go forward to the nearest tab stop, not add 4 spaces." Users' confusion on that thread about `"  \t"` producing zero leading content spaces drove this exact clarification.

---

### Finding: micromark uses virtual-space sentinel tokens, not tab expansion

**Confidence:** CONFIRMED

**Evidence:** [micromark README "Preprocess"](https://github.com/micromark/micromark):

> "The actual character U+0009 CHARACTER TABULATION (HT) is replaced by one M-0002 HORIZONTAL TAB (HT) and between 0 and 3 M-0001 VIRTUAL SPACE (VS) characters, depending on the column at which the tab occurred… the input `\ta` is represented as `[-2, -1, -1, -1, 97]` and `a\tb` as `[97, -2, -1, -1, 98]`"

So `\ta` at column 1 becomes `[tab, vs, vs, vs, 'a']` (4 tokens — 1 tab + 3 virtual spaces — for the 4 columns the tab fills). Block tokenizers consume tokens column-by-column. Content tokenizers see the tab byte when appropriate.

Design rationale: [micromark issue #7](https://github.com/micromark/micromark/issues/7) (closed 2019-09-30). Key quote: "the first virtual space belongs to the block quote marker, while remaining virtual spaces contribute to code indentation calculations."

**Implication:** micromark preserves byte-level tab fidelity during parsing. But by the time an mdast `code` node exists, the column-offset context is discarded — only the resolved string content remains.

---

### Finding: markdown-it does NOT preprocess tabs; column arithmetic is done ad-hoc by each block rule

**Confidence:** CONFIRMED

**Evidence:** [`lib/rules_core/normalize.mjs`](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs) (full normalization pipeline):

```js
const NEWLINES_RE = /\r\n?|\n/g
const NULL_RE = /\0/g
export default function normalize (state) {
  let str = state.src.replace(NEWLINES_RE, '\n')
  str = str.replace(NULL_RE, '\uFFFD')
  state.src = str
}
```

Tabs are not mentioned; they remain literal U+0009 characters throughout. Each block rule that cares about indentation (code blocks, list items, blockquotes) does its own column arithmetic. This is a material architectural divergence from micromark.

---

### Finding: commonmark.js had tab-related regressions in 0.20 → 0.21 that revealed spec ambiguity

**Confidence:** CONFIRMED

**Evidence:** [commonmark.js issue #59 "tab-related regressions"](https://github.com/commonmark/commonmark.js/issues/59) (2015-07-16, closed): `-\t` stopped rendering as a list item; double-tabs inside list-item code blocks *dropped characters* (`bar` → `ar`, `code` → `de`). jgm's comment:

> "the 0.21 spec changes regarding tab handling seemed conceptually sound, but the devil is in the details."

The reference dingus itself has shipped with spec-divergent tab behavior: [commonmark-spec #678](https://github.com/commonmark/commonmark-spec/issues/678) (2021-04-18) documented that the dingus renders `#\ttest` as a valid H1 even though §4.2 requires U+0020 specifically.

---

### Finding: Unicode whitespace handling in paragraph trimming is an OPEN spec-level ambiguity

**Confidence:** CONFIRMED

**Evidence:** [commonmark/commonmark-spec #777 "Unicode whitespace in paragraph"](https://github.com/commonmark/commonmark-spec/issues/777) (2024-09-23, **OPEN**):

- cmark preserves NBSP (U+00A0) but strips vertical-tab (U+000B) / form-feed (U+000C)
- commonmark.js trims everything matching JavaScript's `trim()`
- micromark strips only U+0020 and U+0009

Three parsers, three behaviors, unresolved at the spec level. This is not a tab-specific issue but it directly affects any pipeline that uses obscure whitespace (tabs are defined here as U+0009; the question is how U+000B, U+000C, U+00A0, U+2028, U+2029 are treated relative to them).

---

### Finding: The SKIP_SECTIONS decision is architecturally forced by remark-stringify defaults

**Confidence:** CONFIRMED (source-level evidence)

This is the key finding for the parent report's question.

**Evidence #1 (primary cause):** `mdast-util-to-markdown` defaults `fences: true`. From [`lib/util/format-code-as-indented.js`](https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/format-code-as-indented.js):

```javascript
export function formatCodeAsIndented(node, state) {
  return Boolean(
    state.options.fences === false &&   // <-- must be EXPLICITLY disabled
    node.value &&
    !node.lang &&
    /[^ \r\n]/.test(node.value) &&
    !/^[\t ]*(?:[\r\n]|$)|(?:^|[\r\n])[\t ]*$/.test(node.value)
  )
}
```

When `fences` is left at default (true), an indented code block parsed from input round-trips as a **fenced** code block: ` ```\ncontent\n``` `. The mdast `code` node is the same — but the byte output differs irrecoverably. Every CommonMark spec example in the "Indented code blocks" section fails byte-level idempotence, independent of correctness.

**Evidence #2 (compounding cause — tabs):** micromark represents tabs as `[-2, -1, ...]` virtual-space token sequences during parsing. By the time an mdast `code` node exists, the column-offset context has been collapsed into `code.value` as a literal string. On re-serialization, the stringifier has no mechanism to reconstruct the original tab-vs-space layout. The default `code` handler emits `(blank ? '' : ' ') + line` (space-only indentation) regardless of original tab usage. So `parse(x) === parse(stringify(parse(x)))` holds at the AST level but `x === stringify(parse(x))` fails at the byte level for every spec "Tabs" example that mixes structural tabs with literal-content tabs.

**Evidence #3 (weaker — second-parse AST equality):** Because stringify normalizes to fenced+spaces, the *second* parse consumes clean, unambiguous input. So AST equality between `parse(x)` and `parse(stringify(parse(x)))` typically holds — the fixed point is reached on the second round-trip. The problem is byte-identity on the first round-trip, not AST divergence.

**Conclusion:** SKIP_SECTIONS exists because both sections force round-trip tests that compare byte strings to fail deterministically and unavoidably under default stringifier options. This is not a parser bug; it's an architectural trade-off where remark-stringify chose canonical fenced output over byte-preserving indented output.

---

### Finding: Documented bug reports (tabs + indented code)

| Source | Date | Status | Summary |
|---|---|---|---|
| [commonmark/commonmark-spec #777](https://github.com/commonmark/commonmark-spec/issues/777) | 2024-09-23 | **OPEN** | Unicode whitespace trimming — 3 parsers, 3 behaviors |
| [commonmark/cmark #144](https://github.com/commonmark/cmark/issues/144) | 2016-07-15 | closed | Tab/space inconsistency in list items |
| [commonmark/commonmark.js #59](https://github.com/commonmark/commonmark.js/issues/59) | 2015-07-16 | closed | Tab-related regressions; `-\t` broken, double-tabs drop bytes |
| [commonmark/commonmark-spec #678](https://github.com/commonmark/commonmark-spec/issues/678) | 2021-04-18 | closed | Dingus diverges from spec on `#\ttest` |
| [remarkjs/remark #198](https://github.com/remarkjs/remark/issues/198) | 2016-08-04 | closed | Sublists not parsed when indented with tabs |
| [remarkjs/remark #315](https://github.com/remarkjs/remark/issues/315) | 2017-12-13 | closed | Nested code blocks in list items mis-parsed |
| [remarkjs/remark #402](https://github.com/remarkjs/remark/issues/402) | 2019-05-07 | closed | Fenced code in list with >= 4 spaces seen as indented |
| [remarkjs/remark #353](https://github.com/remarkjs/remark/issues/353) | ongoing | — | Position offsets wrong for indented code |
| [remarkjs/remark #523](https://github.com/remarkjs/remark/issues/523) | ongoing | — | Nested list item becomes single paragraph when indenting ≥4 spaces |
| [syntax-tree/mdast-util-to-markdown #41](https://github.com/syntax-tree/mdast-util-to-markdown/issues/41) | 2021-08-22 | closed | Whitespace around line breaks in headings not round-trippable |
| [commonmark/commonmark-spec #363](https://github.com/commonmark/commonmark-spec/issues/363) | open | discussion | Indented code has no info string — language-aware tooling blocked |

---

## Negative searches

- Searched for a `preserveIndentedCodeBlocks` option in `mdast-util-to-markdown` → does not exist.
- Searched for a tab-vs-space preservation option in remark-stringify → does not exist.
- Searched [remark-lint](https://github.com/remarkjs/remark-lint) for tab-specific rules → `no-tabs` exists but is a content-level rule, not a round-trip preservation mechanism.

---

## Gaps / follow-ups

- **Exact fences:false behavior with tab-content code blocks:** setting `fences: false` causes indented code to round-trip as indented — but content starting/ending with blank lines forces fallback to fenced (regex check in `format-code-as-indented.js`). Full behavior map not collected.
- **Tab preservation in code content specifically:** even with `fences: false`, the `code` handler emits 4-space indentation. A code block whose content was `"\t\tfoo"` round-trips as `"    \t\tfoo"` with literal tabs inside — byte-different again.
- **markdown-it tab-column arithmetic bugs:** markdown-it's per-rule column logic likely has divergences with micromark that are not catalogued. Would benefit from targeted comparison on spec examples 1-11.
