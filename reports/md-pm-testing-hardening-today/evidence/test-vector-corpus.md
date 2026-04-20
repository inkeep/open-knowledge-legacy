---
dimension: "Consolidated test-vector corpus for D3 + D4 + D5"
date: 2026-04-19
sources:
  - spec.commonmark.org
  - github issues across unified/remark/micromark/markdown-it/cmark/commonmark.js ecosystems
purpose: >
  Snippet-level test cases suitable for lifting into fast-check arbitraries
  or fixture files. Each case cites the primary source (spec example or bug
  report) that motivates it. Format conforms to the parent's arbitraries.ts
  conventions.
---

# Test Vector Corpus: Whitespace Edge Cases

Every vector below is a concrete markdown string suitable for use in property-based tests or fixture files. Escape sequences are in JavaScript string literal form.

Columns:
- **input**: the literal markdown string
- **expected_behavior**: what a conformant parser (interpreted charitably for the unified/remark stack) should do
- **parsers_known_to_diverge**: where the observable outputs differ between major parsers
- **source**: URL of spec example or bug report motivating this case

---

## Part 1: BOM (D3) — 8 vectors

### 1. Leading UTF-8 BOM alone
```
input: "\uFEFF"
expected_behavior: micromark/remark-parse → empty document; markdown-it/marked/commonmark.js → emits single-paragraph containing U+FEFF
parsers_known_to_diverge: [remark-parse vs markdown-it/marked/commonmark.js]
source: https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js
```

### 2. Leading BOM before ATX heading
```
input: "\uFEFF# Heading"
expected_behavior: remark-parse → <h1>Heading</h1> (BOM stripped); markdown-it/marked → paragraph with U+FEFF prefix, "#" at column 2 so heading detection fails
parsers_known_to_diverge: [remark-parse vs markdown-it/marked]
source: https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js
```

### 3. Mid-text BOM preserved
```
input: "# hea\uFEFFding"
expected_behavior: remark-parse (string input) → heading with U+FEFF in text; remark-parse (stream input via TextDecoder) → heading WITHOUT U+FEFF (TextDecoder auto-strips internal BOMs)
parsers_known_to_diverge: [remark-parse string vs remark-parse stream — SAME parser, different input modes]
source: https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js
```

### 4. Leading BOM before YAML frontmatter fence
```
input: "\uFEFF---\ntitle: test\n---\n\nbody"
expected_behavior: remark-parse + remark-frontmatter → frontmatter detected (micromark strips leading BOM; fence lands at col 1)
parsers_known_to_diverge: [no known divergence within remark; other stacks may differ]
source: https://github.com/micromark/micromark (preprocess.js) + https://github.com/remarkjs/remark-frontmatter
```

### 5. BOM inside YAML frontmatter value
```
input: "---\ntitle: hello\uFEFFworld\n---\n"
expected_behavior: remark-frontmatter extracts "---\ntitle: hello\uFEFFworld\n---"; js-yaml parses value as literal "hello\uFEFFworld" with embedded BOM (js-yaml does NOT strip)
parsers_known_to_diverge: [depends on whether caller feeds value through yaml.load — if yes, BOM is preserved in the key's string]
source: https://github.com/nodeca/js-yaml/issues/179
```

### 6. BOM as the first character of frontmatter KEY (via concatenation)
```
input: "---\n\uFEFFkey: value\n---\n"
expected_behavior: js-yaml parses key as literal "\uFEFFkey" (not "key"); downstream code looking up frontmatter.key will fail silently
parsers_known_to_diverge: [this is a js-yaml quirk — all remark stacks inherit it]
source: https://github.com/nodeca/js-yaml/issues/179
```

### 7. Double BOM from file concatenation
```
input: "\uFEFF\uFEFF# title"
expected_behavior: micromark strips first BOM, second survives as mid-text. "#" is now at column 2, not column 1 → heading NOT detected → paragraph with "﻿# title"
parsers_known_to_diverge: [all parsers fail similarly; this is NOT a parser bug, it's a data-hygiene issue from cat a.md b.md]
source: https://github.com/micromark/micromark (preprocess.js uses one-shot start flag — no loop)
```

### 8. Indented code after leading BOM (jgm's 2015 example)
```
input: "\uFEFF    code line"
expected_behavior: remark-parse → indented code block with content "code line" (BOM stripped, 4 spaces trigger code); other parsers that preserve BOM → paragraph with "﻿    code line"
parsers_known_to_diverge: [remark-parse vs markdown-it/marked]
source: https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832
```

---

## Part 2: Line endings (D4) — 10 vectors

### 9. CRLF at EOF, no trailing newline
```
input: "# Heading\r\n"
expected_behavior: Parse as heading. Stringify emits "# Heading\n" (LF only). Round-trip is NOT byte-identical.
parsers_known_to_diverge: [no parse-time divergence; stringify divergence is the issue]
source: https://github.com/remarkjs/remark/issues/660
```

### 10. Hard break with two spaces + CRLF
```
input: "foo  \r\nbaz\r\n"
expected_behavior: Single paragraph with hard break (<br />) between "foo" and "baz". Stringify emits canonical hard-break form with LF.
parsers_known_to_diverge: [remark-lint historically false-flagged this as 3 trailing spaces]
source: https://spec.commonmark.org/0.31.2/#example-633 + https://github.com/remarkjs/remark-lint/issues/55
```

### 11. Backslash hard break with CRLF
```
input: "foo\\\r\nbaz\r\n"
expected_behavior: Hard break between "foo" and "baz"; round-trip serialization emits LF-only output.
parsers_known_to_diverge: [none known]
source: https://spec.commonmark.org/0.31.2/#example-634
```

### 12. Mixed line endings within one document
```
input: "line1\nline2\r\nline3\rline4\n"
expected_behavior: Four-line paragraph with soft breaks. All parsers produce identical AST (mixed endings normalize to soft-break boundary). Stringify emits LF throughout.
parsers_known_to_diverge: [markdown-it and commonmark.js normalize before parse; micromark preserves distinct codes in tokenizer but mdast tree is indistinguishable]
source: https://spec.commonmark.org/0.31.2/#characters-and-lines
```

### 13. Fenced code block with CRLF content
```
input: "```\r\nx\r\ny\r\n```\r\n"
expected_behavior: Code node with value "x\ny" (normalized to LF per mdast). Stringify emits LF fences.
parsers_known_to_diverge: [commonmark-spec#640 is an OPEN ambiguity on whether CRLF in code block content should survive]
source: https://github.com/commonmark/cmark/issues/72 + https://github.com/commonmark/commonmark-spec/issues/640
```

### 14. Lone CR (old-Mac) separator
```
input: "para1\rpara2\r"
expected_behavior: Two paragraphs per spec §2.1 (CR alone is a valid line ending). Historical regression: remark #195 reported an infinite loop on this input in the old parser.
parsers_known_to_diverge: [remark-parse works today; markdown-it normalizes CR to LF before parse]
source: https://spec.commonmark.org/0.31.2/#line-ending + https://github.com/remarkjs/remark/issues/195
```

### 15. CRLF inside list markers (cmark #550 OPEN)
```
input: "- item1\r\n- item2\r\n"
expected_behavior: Two-item unordered list.
parsers_known_to_diverge: [cmark still has OPEN bug #550 where list-marker code compares literally to '\n' and misses CRLF; remark/micromark handles correctly]
source: https://github.com/commonmark/cmark/issues/550
```

### 16. No trailing newline at EOF
```
input: "# H"
expected_behavior: Single heading node. Stringify adds a trailing LF that the input lacked. Round-trip is NOT byte-identical.
parsers_known_to_diverge: [none; this is a stringify-side quirk]
source: https://spec.commonmark.org/0.31.2/#line
```

### 17. Empty document with just CRLF
```
input: "\r\n"
expected_behavior: Empty AST (zero-child root). Stringify emits empty string or "\n" depending on handling.
parsers_known_to_diverge: [edge case for ensureNonEmptyDoc logic in parent pipeline]
source: https://spec.commonmark.org/0.31.2/#characters-and-lines
```

### 18. Hard-break backslash immediately before CR (no LF)
```
input: "foo\\\rbaz"
expected_behavior: Same as LF case — hard break between foo and baz. This stresses that §6.7 applies to any line ending including bare CR.
parsers_known_to_diverge: [untested in most parser CI; bare CR is rare]
source: https://spec.commonmark.org/0.31.2/#hard-line-breaks + inferred from §2.1 abstract definition
```

---

## Part 3: Tabs (D5) — 10 vectors

### 19. Bare leading tab → indented code
```
input: "\tfoo\tbaz\t\tbim\n"
expected_behavior: Parses as indented code block with content "foo\tbaz\t\tbim". Round-trip via remark-stringify with fences: true (DEFAULT) emits as FENCED, not indented — idempotence fails.
parsers_known_to_diverge: [parser-level: agreement; stringify-level: fences default breaks round-trip]
source: https://spec.commonmark.org/0.31.2/#example-1
```

### 20. Partial tab — 2 spaces + tab fills column 4
```
input: "  \tfoo\tbaz\t\tbim\n"
expected_behavior: Same HTML as Example 1. The "  \t" sequence collapses to 4 columns of indentation because the tab fills columns 2→4.
parsers_known_to_diverge: [historical cmark/commonmark.js bugs on this exact example]
source: https://spec.commonmark.org/0.31.2/#example-2
```

### 21. Two tabs in list continuation — residue becomes content
```
input: "- foo\n\n\t\tbar\n"
expected_behavior: Code block inside list with content "  bar" (two LITERAL leading spaces — the 4-column residue after list marker and first tab consume 4 cols).
parsers_known_to_diverge: [pre-micromark remark bugs — tested in #198, #315]
source: https://spec.commonmark.org/0.31.2/#example-5
```

### 22. Tabs after blockquote marker
```
input: ">\t\tfoo\n"
expected_behavior: Blockquote containing indented code with content "  foo".
parsers_known_to_diverge: [historical commonmark.js bug #59 dropped bytes here]
source: https://spec.commonmark.org/0.31.2/#example-6
```

### 23. Tabs inside three-level list indent
```
input: " - foo\n   - bar\n\t - baz\n"
expected_behavior: Three-level nested unordered list. Leading tab must be treated as 4 columns for third level to indent correctly.
parsers_known_to_diverge: [pre-micromark remark failed this — #198]
source: https://spec.commonmark.org/0.31.2/#example-9 + https://github.com/remarkjs/remark/issues/198
```

### 24. Tab between ATX hash and text
```
input: "#\tFoo\n"
expected_behavior: <h1>Foo</h1>. §4.2 technically requires U+0020 but parsers generally accept tab.
parsers_known_to_diverge: [dingus historically accepted this; spec-conformant behavior unclear — commonmark-spec#678]
source: https://spec.commonmark.org/0.31.2/#example-10 + https://github.com/commonmark/commonmark-spec/issues/678
```

### 25. Round-trip probe — indented code idempotence failure
```
input: "    const x = 1;\n    const y = 2;\n"
expected_behavior: Parses to mdast code (no lang). remark-stringify defaults emit "```\nconst x = 1;\nconst y = 2;\n```\n" — byte-different. Setting fences: false restores indented output but introduces content-starts-blank edge cases.
parsers_known_to_diverge: [this IS the SKIP_SECTIONS cause]
source: https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/format-code-as-indented.js
```

### 26. Tab-indented fenced code inside list item (regression probe)
```
input: "- item\n\n\t```js\n\tcode\n\t```\n"
expected_behavior: Per spec, valid fenced JS code block inside list continuation. Pre-micromark remark treated the backticks as CONTENT of an indented code block.
parsers_known_to_diverge: [#402 regression test]
source: https://github.com/remarkjs/remark/issues/402
```

### 27. Mixed tabs and spaces at line start
```
input: " \t \t code\n"
expected_behavior: Parses as indented code (1 space + tab fills to col 4, then 1 space + tab fills to col 8 — more than 4 spaces of indent). Content is " code" (residue).
parsers_known_to_diverge: [subtle tab-expansion math; not always handled consistently]
source: https://spec.commonmark.org/0.31.2/#tabs (rule: tabs fill to next tab stop)
```

### 28. Tab in place of space in list item marker
```
input: "-\titem\n"
expected_behavior: List with content "item". Per spec §5.2, list marker is followed by at least one space — tab is accepted via §2.2 column equivalence.
parsers_known_to_diverge: [commonmark.js #59 historical regression]
source: https://github.com/commonmark/commonmark.js/issues/59
```

---

## Cross-cutting considerations

### For fast-check arbitrary extension

The parent's `arbitraries.ts` currently hardcodes `\n` line endings and generates no BOM or tab inputs. To exercise this corpus via property-based testing, extend the generator with:

1. A `lineEndingChoice` arbitrary: `fc.constantFrom('\n', '\r\n', '\r')` — selected per-line, per-document (mixed endings inside one doc).
2. A `bomPrefix` arbitrary: `fc.constantFrom('', '\uFEFF', '\uFEFF\uFEFF')` — prepended to whole document.
3. A `whitespaceIndent` arbitrary: `fc.stringOf(fc.constantFrom(' ', '\t'), 0, 8)` — for indented line starts.
4. A `midTextBom` arbitrary: sprinkle `\uFEFF` randomly within text nodes (5% per word).

### For corpus-commonmark.test.ts

Remove `SKIP_SECTIONS = ["Tabs", "Indented code blocks"]` **only** if the pipeline's round-trip assertion is changed from byte-equality to AST-equivalence (parse-stringify-parse === parse). Otherwise the skip is architecturally correct given `remark-stringify`'s default `fences: true`.

Alternative: set `fences: false` on the stringify step AND add additional handling for content-starts-with-blank-line cases — but this introduces its own ambiguities and may not be worth the complexity.

### For Rust-migration preparation

The `markdown-rs` TODO comment in micromark's preprocess.js — "`markdown-rs` actually parses BOMs (byte order mark)" — indicates the Rust sibling has divergent (more aggressive) BOM handling. Any migration must document BOM semantics as a breaking change or install a normalization shim.
