---
dimension: "D4 — CRLF / LF / mixed line endings"
date: 2026-04-19
sources:
  - spec.commonmark.org
  - github.com/micromark/micromark
  - github.com/markdown-it/markdown-it
  - github.com/commonmark/commonmark.js
  - github.com/commonmark/cmark
  - github.com/commonmark/commonmark-spec
  - github.com/remarkjs/remark
  - github.com/remarkjs/remark-lint
  - github.com/syntax-tree/mdast-util-to-markdown
  - git-scm.com
---

# Evidence: D4 — Line Ending Handling (CRLF / LF / CR / mixed)

## Key files / pages referenced

- [CommonMark 0.31.2 §2.1 Characters and lines](https://spec.commonmark.org/0.31.2/#characters-and-lines)
- [CommonMark 0.31.2 §6.7 Hard line breaks](https://spec.commonmark.org/0.31.2/#hard-line-breaks)
- [micromark preprocess.js](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/preprocess.js)
- [micromark-util-symbol codes.js](https://github.com/micromark/micromark/blob/main/packages/micromark-util-symbol/lib/codes.js)
- [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs)
- [commonmark.js blocks.js](https://github.com/commonmark/commonmark.js/blob/master/lib/blocks.js)
- [remarkjs/remark #660](https://github.com/remarkjs/remark/issues/660)
- [commonmark/cmark #550](https://github.com/commonmark/cmark/issues/550) (OPEN)
- [commonmark/commonmark-spec #640](https://github.com/commonmark/commonmark-spec/issues/640) (OPEN)

---

## Findings

### Finding: CommonMark §2.1 defines LF, CR, and CRLF all as valid line endings

**Confidence:** CONFIRMED

**Evidence:** [CommonMark 0.31.2 §2.1](https://spec.commonmark.org/0.31.2/#characters-and-lines):

> "A line is a sequence of zero or more characters other than line feed (U+000A) or carriage return (U+000D), followed by a line ending or by the end of file."
>
> "A line ending is a line feed (U+000A), a carriage return (U+000D) not followed by a line feed, or a carriage return and a following line feed."

So three sequences all count as a *single* line ending: `\n`, bare `\r`, and `\r\n`. CRLF is explicitly one line ending, not two.

**Section §6.7 "Hard line breaks"** ([spec.commonmark.org/0.31.2/#hard-line-breaks](https://spec.commonmark.org/0.31.2/#hard-line-breaks)): "A line ending (not in a code span or HTML tag) that is preceded by two or more spaces and does not occur at the end of a block is parsed as a hard line break…" The rule uses the abstract §2.1 definition, so CRLF should produce hard breaks identically to LF.

**Implication:** Conformant behavior is to treat all three line-ending sequences as semantically equivalent — but reference spec examples are rendered only with LF, leaving implementations to infer CRLF behavior from the abstract definition.

---

### Finding: micromark/remark-parse preserves LF, CR, and CRLF as distinct codes in the tokenizer

**Confidence:** CONFIRMED (source)

**Evidence:** [`packages/micromark-util-symbol/lib/codes.js`](https://github.com/micromark/micromark/blob/main/packages/micromark-util-symbol/lib/codes.js) defines negative-integer "codes":

```
carriageReturn: -5
lineFeed: -4
carriageReturnLineFeed: -3
virtualSpace: -1
```

The preprocess loop ([`preprocess.js`](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/preprocess.js)) uses an `atCarriageReturn` flag so CR+LF becomes the single `carriageReturnLineFeed` code, lone CR becomes `carriageReturn`, and lone LF becomes `lineFeed`. The distinction survives tokenization.

**However**, the emitted mdast tree (`mdast-util-from-markdown`) records only `position.start.line`, `position.end.line`, `column`, `offset` — no field preserves the actual line-ending variant used. So the parser is line-ending-aware internally, but the AST is line-ending-agnostic.

---

### Finding: markdown-it normalizes all line endings to LF before parsing

**Confidence:** CONFIRMED

**Evidence:** [`lib/rules_core/normalize.mjs`](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs):

```js
const NEWLINES_RE = /\r\n?|\n/g
const NULL_RE = /\0/g
export default function normalize (state) {
  let str = state.src.replace(NEWLINES_RE, '\n')
  str = str.replace(NULL_RE, '\uFFFD')
  state.src = str
}
```

The regex `/\r\n?|\n/g` collapses CRLF, lone CR, and LF all to `\n`. The AST and source-map positions operate on the normalized string.

---

### Finding: commonmark.js splits on a regex covering all three line terminators

**Confidence:** CONFIRMED

**Evidence:** [`lib/blocks.js`](https://github.com/commonmark/commonmark.js/blob/master/lib/blocks.js):

```js
var reLineEnding = /\r\n|\n|\r/;
// ...
var lines = input.split(reLineEnding);
```

Split discards the terminator bytes entirely — parsing operates on line-content-only.

---

### Finding: remark-stringify only emits LF — byte-level round-trip of CRLF input is impossible

**Confidence:** CONFIRMED

**Evidence:** 

1. [`mdast-util-to-markdown`](https://github.com/syntax-tree/mdast-util-to-markdown) options list — no `lineEnding`, `eol`, or equivalent option documented.
2. [`remark-stringify`](https://github.com/remarkjs/remark/tree/main/packages/remark-stringify) options (bullet, emphasis, fence, rule, setext, etc.) contain no line-ending knob.
3. [remarkjs/remark #660 "Remark replaces CRLF with LF on Windows"](https://github.com/remarkjs/remark/issues/660) (2021-03-15) was closed `no/wontfix` — maintainers treat LF-only output as intentional.

**Consequence:** if a source file has CRLF endings, a `remark-parse → remark-stringify` round-trip produces LF-only output. **Byte-level idempotence is impossible for CRLF input under the default pipeline.** The workaround is either to normalize to LF before parsing or to post-process the stringified output to re-apply CRLF.

A related lint rule exists at a different layer: [remark-lint-consistent-linebreaks (issue #292)](https://github.com/remarkjs/remark-lint/issues/292) — but this is a linter, not a stringifier option.

---

### Finding: Hard-break behavior with CRLF is spec-implied but only informally tested

**Confidence:** INFERRED (spec definition) + CONFIRMED (empirical via remark-lint #55)

**Evidence:**

Spec §6.7 defines hard breaks relative to "a line ending" (the abstract §2.1 definition), so `"foo  \r\n"` should produce a hard break identically to `"foo  \n"`. However, the spec's rendered examples use only LF — the CRLF equivalence is inferred, not explicitly tested in the reference test corpus.

Empirical validation: [remark-lint #55 "hard-break-spaces is tripped on CRLF"](https://github.com/remarkjs/remark-lint/issues/55) (2016-04-16, closed) documented that the lint rule historically treated `\r` as a third space, false-flagging valid CRLF hard breaks. The fix explicitly acknowledged CRLF must be treated equivalently to LF for hard-break detection.

---

### Finding: Known OPEN bugs exist in CRLF handling across the ecosystem

**Confidence:** CONFIRMED

**OPEN issues at time of research (2026-04-19):**

- [commonmark/cmark #550 "parse_list_marker Does Not Correctly Check for CRLF"](https://github.com/commonmark/cmark/issues/550) (2024-06-24, **OPEN**): list-marker detection code compares directly against `'\n'` and misses CRLF. Causes divergent list parsing between pure-LF and CRLF inputs in the C reference implementation. 22 months open.

- [commonmark/commonmark-spec #640 "Clarification of line endings in code blocks"](https://github.com/commonmark/commonmark-spec/issues/640) (2020-03-28, **OPEN**): spec says code blocks preserve trailing line endings, but commonmark.js strips `\r`. A spec-level ambiguity unresolved for 6+ years.

**Closed historical issues:**

- [remarkjs/remark #195 "Bug: Carriage return causes infinite loop"](https://github.com/remarkjs/remark/issues/195) (2016-07-06, closed): lone CR produced an infinite loop in the old parser. Fixed, but a historical hazard — any new lone-CR test arbitrary should include a simple fuzz-safety check.
- [remark-lint #179 "\r\n problem in maximum-line-length.js"](https://github.com/remarkjs/remark-lint/issues/179) (2018-05-03, closed): max-line-length miscounted CRLF.
- [commonmark/cmark #14 "CRLF support"](https://github.com/commonmark/cmark/issues/14) (2015-03-15, closed): baseline CRLF support.
- [commonmark/cmark #71 "CRLF regression with fenced code"](https://github.com/commonmark/cmark/issues/71) (2015-08-08, closed): fenced code blocks broke on CRLF.
- [commonmark/cmark #72 "With CRLF line endings in input, we get mixed line endings in output"](https://github.com/commonmark/cmark/issues/72) (2015-08-08, closed): code-block content kept CRLF while surrounding HTML emitted LF.
- [commonmark/cmark #73 "More line ending issues"](https://github.com/commonmark/cmark/issues/73) (2015-08-08, closed): follow-up regressions.
- [commonmark/cmark #113 "EOL character weirdness"](https://github.com/commonmark/cmark/issues/113) (2016-03-26, closed): mixed-ending edge cases.
- [markdown-it/markdown-it #560 "CRLF files tables are not compiled"](https://github.com/markdown-it/markdown-it/issues/560) (2019-05-21, closed): tables historically broken with CRLF input.
- [markdown-it/markdown-it #719 "Running test suite under Windows fails because of line breaks"](https://github.com/markdown-it/markdown-it/issues/719) (2020-10-12, closed): ESLint `linebreak-style` tripped by Git autocrlf on Windows; fix was `.gitattributes * text eol=lf`.

---

### Finding: Git's autocrlf settings materially affect what bytes reach the parser

**Confidence:** CONFIRMED

**Evidence:** [git-scm.com/docs/gitattributes](https://git-scm.com/docs/gitattributes) and [core.autocrlf docs](https://git-scm.com/docs/git-config):

| Setting | Commit direction | Checkout direction |
|---|---|---|
| `core.autocrlf=true` (Windows default) | CRLF → LF | LF → CRLF |
| `core.autocrlf=input` (macOS/Linux common) | CRLF → LF | LF → LF (preserve) |
| `core.autocrlf=false` | no conversion | no conversion |

With `.gitattributes` `* text=auto eol=lf` (or `*.md text eol=lf`), LF is forced in the working tree regardless of OS.

**Implication for pipeline testing:** a file committed on macOS (LF) may appear in a Windows checkout as CRLF via autocrlf=true. If the pipeline's test fixtures are stored in git, the bytes a Windows tester sees may differ from the bytes the CI system sees. Pipeline correctness cannot be tested via filesystem round-trips; test arbitraries must generate line-ending variants in memory.

**VS Code `files.eol`** ([microsoft/vscode #25209](https://github.com/Microsoft/vscode/issues/25209)): default `"auto"` (CRLF on Windows, LF on Unix). Allowed values: `"\n"`, `"\r\n"`, `"auto"`. Only affects *new* files.

---

## Negative searches

- Searched `site:github.com repo:unifiedjs/unified CRLF` → no unified-level issues; problems are in remark-parse/remark-stringify.
- Searched `site:github.com repo:remarkjs/remark-stringify line ending` → no additional issues beyond remark #660.
- Looked for a `lineEnding` option in `mdast-util-to-markdown` — does not exist.

---

## Gaps / follow-ups

- **CRLF inside fenced code content round-trip:** if a code block's content contains CRLF (e.g., a Windows shell script in a code fence), does micromark preserve it as `carriageReturnLineFeed` tokens all the way to the `code.value` string? Commonmark-spec #640 (OPEN) suggests spec-level ambiguity. Would benefit from a targeted test fixture.
- **CR-alone (old Mac) handling in modern tooling:** remark #195 (2016) showed an infinite-loop hazard. Modern micromark looks safe, but explicit lone-CR fuzz testing is warranted.
- **remark-stringify + a post-processor for CRLF emission:** pipeline users sometimes wrap remark-stringify with a final `.replace(/\n/g, '\r\n')` step, but this breaks CRLF literals inside code blocks. No canonical solution.
