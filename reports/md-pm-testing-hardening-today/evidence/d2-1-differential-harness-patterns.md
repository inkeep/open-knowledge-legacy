---
dimension: D2.1 — Differential harness patterns in JS markdown ecosystem
date: 2026-04-19
sources:
  - babelmark.github.io
  - github.com/babelmark/babelmark-registry
  - github.com/markdown-it/markdown-it
  - github.com/micromark/micromark
  - github.com/markedjs/marked
  - github.com/syntax-tree/mdast
---

# Evidence: D2.1 — Differential harness patterns in JS markdown ecosystem

## Key sources referenced
- [babelmark.github.io/faq/](http://babelmark.github.io/faq/) — Babelmark3 FAQ and protocol
- [github.com/babelmark/babelmark-registry/blob/master/registry.json](https://github.com/babelmark/babelmark-registry/blob/master/registry.json) — registry of dingus servers
- [github.com/markdown-it/markdown-it/tree/master/test](https://github.com/markdown-it/markdown-it/tree/master/test) — markdown-it test layout
- [github.com/micromark/micromark](https://github.com/micromark/micromark) — micromark's own CommonMark test runner
- [github.com/syntax-tree/mdast](https://github.com/syntax-tree/mdast) — mdast specification
- [markdown-it issue #176](https://github.com/markdown-it/markdown-it/issues/176) — markdown-it uses flat token streams, not a tree AST

---

## Findings

### Finding: No community-maintained cross-parser equivalence harness exists as an npm package
**Confidence:** INFERRED (from negative searches across npm, GitHub, blog archives)
**Evidence:**
- GitHub search for `"markdown-it" "remark-parse"` in test files returns only compatibility/plugin repos, no equivalence harness
- No npm package advertised as "markdown parser differential tester"
- The only public cross-parser tool is [Babelmark3](http://babelmark.github.io/), which is a web-only manual visual comparator — not a programmatic assertion library

**Implications:** Any JS-vs-JS differential harness must be assembled in-project; there is no prior-art library to drop in.

### Finding: Babelmark3 is decentralized HTTP-based and HTML-output-only
**Confidence:** CONFIRMED
**Evidence:** From [babelmark.github.io/faq/](http://babelmark.github.io/faq/):

> "each implementer provides a small 'dingus server' that accepts textual input and returns HTML" ... "There is a 1000 character limit on input"

Dingus server protocol returns:
```json
{"name":"Pandoc","html":"<p>hi</p>","version":"1.9.4.2"}
```

The registry [babelmark-registry/registry.json](https://github.com/babelmark/babelmark-registry/blob/master/registry.json) is a simple queryable JSON file (~253 lines) with entries for `markdown-it`, `commonmark.js`, `marked`, plus non-JS implementations.

**Implications:**
- Scriptable in the sense that the registry is JSON and each dingus server accepts HTTP GET — a test harness could POST markdown to N registered dingus URLs and diff the HTML
- The 1000-char input limit makes it unsuitable for large-document corpora
- Comparison oracle is HTML string, not AST; all normalization must happen downstream of raw HTML
- Network dependency makes it fragile for CI

### Finding: JS parsers do not share an AST dialect
**Confidence:** CONFIRMED
**Evidence:**
- remark/micromark/unified use [mdast](https://github.com/syntax-tree/mdast), a unist-based tree (Root → Paragraph → Text, etc.)
- markdown-it emits a flat token stream, not a tree — [markdown-it issue #176](https://github.com/markdown-it/markdown-it/issues/176):
  > "The result of parsing is a list of tokens that will be passed to the renderer"
- marked produces its own token format (recursive block tokenizer, per the [CommonMark compliance discussion](https://github.com/markedjs/marked/discussions/1202))
- commonmark.js produces its own Node/Parser tree format (the reference JS impl of CommonMark)

**Implications:**
- "AST equivalence" between parsers requires a translation/normalization layer per parser pair
- Easiest pair for AST diff is `remark-parse` vs `micromark` — but they share micromark internally (not independent)
- `remark-parse` vs `markdown-it` requires converting token stream → tree, or comparing via intermediate HTML

### Finding: micromark underlies remark-parse — they are not independent
**Confidence:** CONFIRMED
**Evidence:** From the [micromark README](https://github.com/micromark/micromark):

> "Micromark was made to replace the internals of remark-parse" ... "remark-parse now defers its work to micromark and mdast-util-from-markdown"

Confirmed by [remarkjs/remark@6b42465](https://github.com/remarkjs/remark/commit/6b42465526bb15f70d98a0ea0daccea01ffb8004) (commit "Change to use `micromark`").

**Implications:**
- A differential harness between remark-parse and micromark tests only the mdast-util-from-markdown translation layer, not the tokenizer
- For genuinely independent coverage, the pairing must include at least one of: markdown-it, marked, commonmark.js
- Within the remark pipeline, differential testing against a different parser catches tokenizer/rule bugs that identity round-trips cannot

### Finding: Each major JS parser runs the CommonMark spec independently but against its own oracle
**Confidence:** CONFIRMED
**Evidence:**
- markdown-it: [test/commonmark.mjs](https://github.com/markdown-it/markdown-it/tree/master/test) with a copy of spec.txt in `test/fixtures/commonmark/`. Per its README, "100% CommonMark support."
- micromark: [test/commonmark.js](https://github.com/micromark/micromark/tree/main/test). README states: "tested with the ~650 CommonMark tests and more than 1.2k extra tests confirmed with CM reference parsers."
- marked: per [CommonMark compliance discussion #1202](https://github.com/markedjs/marked/discussions/1202), "failing 157 of 624 commonmark tests" historically, now ~88–96% per section.

**Implications:**
- Each parser already validates itself against the CommonMark corpus, but they don't cross-check each other
- A differential harness can piggyback on these existing corpora — the spec.txt file is the canonical shared fixture

---

## Gaps / follow-ups
- No public benchmark comparing the exact divergence set between remark-parse and markdown-it at HTML-output level
- No documented catalog of "always differ" cases between JS CommonMark-compliant parsers
