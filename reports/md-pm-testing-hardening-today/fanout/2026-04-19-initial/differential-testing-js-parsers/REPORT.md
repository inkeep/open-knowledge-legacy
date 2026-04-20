---
title: "Differential Testing in the JS Markdown Parser Ecosystem"
description: "Landscape report: the state of differential testing across pure-JS markdown parsers (remark-parse, markdown-it, micromark, marked, commonmark.js), shared test corpora (CommonMark spec, GFM, MDX), AST-diff normalization strategies, concrete harness precedents, and fast-check integration patterns. Framed for a remark-based TS/Bun pipeline today, without Rust or WASM dependencies."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - remark
  - remark-parse
  - markdown-it
  - micromark
  - marked
  - commonmark.js
  - fast-check
  - Babelmark3
  - CommonMark
  - GFM
  - mdast
topics:
  - differential testing
  - property-based testing
  - AST diffing
  - parser equivalence
  - test fixtures
---

# Differential Testing in the JS Markdown Parser Ecosystem

**Purpose:** Map the state-of-play for running the same input through multiple pure-JS markdown parsers and comparing outputs, to inform testing-hardening decisions for a TypeScript/Bun pipeline that currently relies on single-parser identity round-trips. The question is explicitly what is available TODAY in the JS ecosystem — no Rust bindings, no WASM, no native code.

---

## Executive Summary

Differential testing is a mature technique in adjacent parser ecosystems (JSON, CSS, Rust source parsers) but has **no public, drop-in harness in the JS markdown ecosystem as of April 2026**. Each major JS parser — [remark-parse](https://github.com/remarkjs/remark), [markdown-it](https://github.com/markdown-it/markdown-it), [micromark](https://github.com/micromark/micromark), [marked](https://github.com/markedjs/marked), [commonmark.js](https://github.com/commonmark/commonmark.js) — independently validates itself against the CommonMark spec corpus, but none cross-check each other, and no community package, conference talk, or well-known repository documents a pattern for doing so in a pure-JS test suite.

Despite this negative finding, the **building blocks are all present** and individually mature: the CommonMark corpus is packaged as versioned npm JSON, GFM extension tests live in cmark-gfm's spec.txt, HTML-level diff normalization is available via `markedjs/html-differ`, unist utilities (`unist-util-remove-position`, `mdast-util-compact`) handle mdast normalization, fast-check's `fc.letrec` supports recursive arbitraries with shrinking, and the `fast-check` documentation explicitly treats differential testing as a first-class "equivalence" pattern. The work to combine these into a harness for a remark-based TS pipeline is assembly, not invention.

The most important architectural constraint surfacing from this research: **JS markdown parsers do not share an AST dialect**. remark uses mdast (tree); markdown-it emits a flat token stream; marked has its own tokenizer format; commonmark.js has a distinct Node tree. This forces a choice between three comparison oracles — (a) HTML-output diff with normalization, (b) mdast-to-mdast diff only across the remark/micromark/commonmark.js cluster, or (c) a bespoke parser-specific AST translation layer modeled on the Rust-ecosystem precedent in [Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz). Each oracle has different fault-coverage tradeoffs.

**Key Findings:**

- **No existing public JS harness**: no npm package, GitHub repo, or technical talk documents a cross-parser equivalence tester for JS markdown parsers today. This is a genuinely empty space, not a discovery gap.
- **Parsers do not share an AST**: remark/micromark use mdast (tree); markdown-it uses token streams; marked and commonmark.js have their own formats. AST-to-AST diff is only viable within the remark/micromark/commonmark.js cluster without writing translation shims.
- **micromark is not independent of remark-parse**: remark-parse defers internally to micromark. Differential testing between them exercises only the mdast-util-from-markdown layer. Meaningful independent pairings require markdown-it, marked, or commonmark.js.
- **CommonMark spec fixtures are npm-ready**: the [`commonmark-spec`](https://www.npmjs.com/package/commonmark-spec) and [`commonmark.json`](https://www.npmjs.com/package/commonmark.json) packages expose ~627 test cases as JSON objects with `{markdown, html, section, number}`. The canonical oracle is normalized HTML, not AST, even inside CommonMark's reference parsers.
- **Babelmark3 is scriptable in principle but not CI-appropriate**: its [registry](https://github.com/babelmark/babelmark-registry/blob/master/registry.json) is JSON and dingus servers accept HTTP GET, but the 1000-character input limit and network dependencies make it unsuitable as a test harness.
- **GFM has a formal spec.txt; MDX and wiki-link do not**: [cmark-gfm's test/spec.txt](https://github.com/github/cmark-gfm/blob/master/test/spec.txt) extends CommonMark's format for tables, strikethrough, and task lists. MDX has no formal fixture corpus (its spec repo is archived); wiki-link has no multi-implementation standard.
- **fast-check has the full machinery for PBT + differential testing**: `fc.letrec` with `depthSize`/`maxDepth` can generate mdast-shaped recursive structures; `fc.assert(fc.property(...))` with two parsers is idiomatic per [dubzzz/fast-check-examples](https://github.com/dubzzz/fast-check-examples); shrinking requires care when using `.map()` (needs an `unmapper`).

---

## Research Rubric

As specified by the parent fanout:

| ID | Dimension | Depth |
|---|---|---|
| D2.1 | Differential harness patterns in the JS markdown ecosystem | P0 Deep |
| D2.2 | CommonMark spec test suite as differential fixture | P0 Deep |
| D2.3 | AST-diff normalization strategies | P0 Deep |
| D2.4 | Concrete harness examples in real repos | P0 Deep |
| D2.5 | Applicability to fast-check arbitraries | P0 Deep |

**Non-goals respected:** no analysis of the user's codebase; no Rust or WASM bindings work (markdown-rs bindings out of scope); no recommendation rankings; findings framed as a landscape, not conclusions.

---

## Detailed Findings

### D2.1 — Differential harness patterns in the JS markdown ecosystem

**Finding:** Each major JS parser maintains its own CommonMark spec-test harness, and there is no community-maintained cross-parser fixture set or assertion library. The only existing cross-parser markdown comparator is [Babelmark3](http://babelmark.github.io/), a web-based visual comparator — not a scriptable test library.

**Evidence:** [evidence/d2-1-differential-harness-patterns.md](evidence/d2-1-differential-harness-patterns.md)

**Implications:**
- Adopting a differential harness in the JS markdown ecosystem is novel work. There is no "how everyone does it" template to copy.
- The dingus-server protocol is simple enough to mimic in-process: import each parser as an npm dependency, wrap with a `{html, name, version}` interface, then diff outputs. This replicates Babelmark's semantics without the 1000-char limit or network dependency.
- The parsers' AST dialects diverge: mdast (tree) vs markdown-it tokens (flat list) vs marked tokens vs commonmark.js Node — a single "AST oracle" across all of them is impractical.
- **micromark underlies remark-parse.** A harness that compares remark-parse and micromark only tests the `mdast-util-from-markdown` translation layer. Independent coverage requires including at least one of markdown-it, marked, or commonmark.js in the pairing.

**Decision triggers (when this matters):**
- If the goal is to catch tokenizer-level bugs in the remark/micromark cluster, the oracle must be an external parser (not another unified plugin).
- If the goal is to harden plugin-specific transforms (e.g., remark-wiki-link, remark-mdx-agnostic), there is no external parser with comparable semantics — identity round-trips remain the only available oracle for those specific extensions.

**Remaining uncertainty:** None for the public landscape. Closed-source harnesses inside large markdown-consuming vendors (GitHub, Notion, Obsidian) are unverifiable externally.

---

### D2.2 — CommonMark spec test suite as differential fixture

**Finding:** The CommonMark spec is packaged as ~627 JSON objects in two maintained npm packages, directly consumable from TypeScript/Bun without Python tooling. The canonical comparison oracle — even in the reference implementations — is normalized HTML, not AST. GFM extends the same embedded-example format in [cmark-gfm/test/spec.txt](https://github.com/github/cmark-gfm/blob/master/test/spec.txt). MDX and wiki-link have no analogous corpus.

**Evidence:** [evidence/d2-2-commonmark-spec-fixture.md](evidence/d2-2-commonmark-spec-fixture.md)

**Implications:**
- The corpus is small (~650 tests, <1 MB) and iterates in well under a second per parser on modern hardware. Running three parsers through the full corpus in a Bun test is cheap.
- Section labels (`"Setext headings"`, `"Emphasis and strong emphasis"`, etc.) allow targeted slicing — useful for isolating divergences by feature area.
- The "HTML-is-the-oracle" pattern is not a design compromise; it is the canonical approach. Normalized HTML sidesteps the AST-dialect problem (D2.1) and resolves known divergences (soft breaks, entity decoding, autolink forms) at the rendering layer.
- GFM extensions are encoded in the same `example`-block format as CommonMark, extractable with the same tooling (`spec_tests.py --dump-tests` or equivalent JS parser of spec.txt).
- For MDX and wiki-link, no external fixture exists. Differential testing these requires hand-written fixtures or generator-driven inputs (D2.5).

**Decision triggers (when this matters):**
- If the test budget is tight (sub-second), piping the full CommonMark + GFM corpus through two or three parsers is feasible in a single `test.each()` block.
- If parser extensions (wiki-link, MDX) are the primary risk surface, the spec corpus does not cover them — differential testing there needs a different generator strategy (likely fast-check PBT from D2.5).

**Remaining uncertainty:** Exact count of GFM-specific extension tests (separate from inherited CommonMark tests) not confirmed in primary sources.

---

### D2.3 — AST-diff normalization strategies

**Finding:** The unified ecosystem provides mature utilities for pre-comparison mdast normalization ([`unist-util-remove-position`](https://github.com/syntax-tree/unist-util-remove-position), [`mdast-util-compact`](https://github.com/syntax-tree/mdast-util-compact)). For HTML-level diffing, [`markedjs/html-differ`](https://github.com/markedjs/html-differ) is the JS equivalent of CommonMark's `normalize_html()`. No public utility converts between mdast and markdown-it tokens, so direct AST-to-AST diff between those two parsers is impractical without a custom shim.

**Evidence:** [evidence/d2-3-ast-diff-normalization.md](evidence/d2-3-ast-diff-normalization.md)

**Implications:**
- **Positional info must always be stripped** before comparison — `unist-util-remove-position` is the canonical, one-line solution.
- **Adjacent text node merging** (`mdast-util-compact`) resolves a known false-positive class where two parsers legitimately split text runs differently.
- **HTML-differ's normalization** (whitespace inside tags, attribute ordering) matches CommonMark's own normalization closely, making HTML-level oracle results comparable to spec expectations.
- **Known "always differ" categories** between JS CommonMark parsers, per issue trackers and marked's compliance discussion:
  - Positional/offset info (always strip)
  - Raw source text attributes (`value` fields on some node types)
  - HTML comment handling
  - Soft-break vs hard-break representation
  - Whitespace intrinsics around lists/blockquotes (marked's main failing area)
  - Autolink vs raw URL tokenization
  - Entity decoding timing (`&amp;` as text vs `&`)
- **Cross-parser round-trip** (parse-with-A, serialize-through-B) is not viable without a translation shim because B's serializer doesn't accept A's AST shape. This is different from the identity round-trip (same parser both sides) currently in use, and it has not been demonstrated in any public JS project found in this research.
- `mdast-util-to-markdown` explicitly does not guarantee round-trip fidelity ("Complete roundtripping is impossible given that any value could be injected into the tree"), so even single-parser serialize-then-reparse is an approximation.

**Decision triggers (when this matters):**
- If AST-level oracle is chosen, the diff function must accept an ignored-paths allowlist; without it, the "always differ" categories will produce continuous noise.
- If HTML oracle is chosen, `html-differ` handles most of the class automatically but cannot surface AST-level bugs (e.g., wrong node-type attribution on an identical HTML rendering).

**Remaining uncertainty:** No formal tool catalogs the "always differ" set — it is folklore from parser issue trackers. No public `unist-util-diff` package provides configurable ignored-paths diffing out of the box.

---

### D2.4 — Concrete harness examples in real repos

**Finding (NEGATIVE):** No public JS repository runs ≥2 JS markdown parsers against shared inputs for equivalence assertion, based on multi-query searches across GitHub, npm, and conference talk archives. The closest architectural precedent is [Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz), which differential-fuzzes Rust source parsers using cargo-fuzz and a unified AST representation. Academic work on markdown differential fuzzing exists ([MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz), ASE '21), focused on performance bugs.

**Evidence:** [evidence/d2-4-concrete-harness-examples.md](evidence/d2-4-concrete-harness-examples.md)

**Implications:**
- This is a genuinely empty space in the public JS ecosystem. A harness adopted now would be novel.
- The architectural blueprint from Skepfyr/rust-parser-fuzz is directly portable — the ingredients are (a) unified canonical representation, (b) per-parser adapter, (c) per-parser known-bug filter — only the language and fuzz driver change (fast-check replaces cargo-fuzz).
- The JSON parser domain (JFuzz et al.) has demonstrated that differential testing is the standard approach for parser-consistency bug discovery — the technique is well-validated in spirit, even without a JS markdown-specific precedent to copy.
- Babelmark3 could theoretically be scripted (registry.json is queryable; dingus servers accept HTTP GET), but the 1000-char input limit and network dependencies make it unsuitable for CI.
- [`markdown-it-testgen`](https://github.com/markdown-it/markdown-it-testgen) is a single-parser fixture runner, not a differential harness — despite parsing "fixtures in commonmark spec format," it takes one markdown-it instance.

**Decision triggers (when this matters):**
- If prior art is a hard prerequisite for adoption (conservative posture), this dimension returns a negative result.
- If the goal is to build something novel and valuable, the lack of precedent signals an open niche, not a contraindication.

**Remaining uncertainty:** Closed-source tooling inside large markdown-consuming vendors may exist but cannot be verified externally.

---

### D2.5 — Applicability to fast-check arbitraries

**Finding:** fast-check explicitly supports differential testing as a first-class "equivalence" pattern, and `fc.letrec` with `depthSize`/`maxDepth` is the combinator for generating recursive mdast-shaped structures. The shrinking machinery works cleanly on built-in arbitraries and on `fc.record` trees; `.map()` requires an `unmapper` to shrink through the map step. No pre-built markdown arbitrary exists in the fast-check ecosystem.

**Evidence:** [evidence/d2-5-fast-check-pbt.md](evidence/d2-5-fast-check-pbt.md)

**Implications:**
- **Two generation strategies** are viable:
  1. **AST-up**: build an mdast arbitrary via `fc.letrec` → serialize with `mdast-util-to-markdown` → feed to both parsers → diff. Produces markdown that the remark serializer guarantees is structurally valid, but may still hit inline edge cases where other parsers diverge.
  2. **String-down**: generate markdown strings directly via `fc.string` combinators → feed to both parsers → diff. More exploratory but hits more real ambiguities; requires a denser expected-divergence filter.
- **Shrinking effectiveness depends on generator design**. Generating the structured AST and serializing inside the property (rather than `.map()`-ing into a string arbitrary) keeps the shrinker effective without needing an unmapper.
- **An expected-divergence filter is essential** to avoid drowning the signal in known "always differ" categories (D2.3). The filter itself becomes documentation of the agreed/disagreed surface between the two parsers — a valuable artifact in its own right.
- **Cross-domain precedent is strong**: JSON ([JFuzz](https://arxiv.org/html/2410.21806v1)), Rust source parsers ([Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz)), regex engines, and XML all have documented PBT + differential testing applications. The pattern transfers naturally to markdown.
- **fast-check integrates with Bun's test runner** without special bindings. `fc.assert(fc.property(...))` is framework-agnostic; `numRuns`, `seed`, and `endOnFailure` options control CI budget and determinism.
- **No public `fc-markdown-arbitrary` package exists** — every project building this pattern rolls its own generator.

**Decision triggers (when this matters):**
- If the parent pipeline includes custom extensions (remark-wiki-link, remark-mdx-agnostic) not covered by the CommonMark spec, fast-check generation is the only way to exercise differential testing on them — fixture-based differential testing doesn't apply.
- If the risk surface is pathological inputs (DoS, catastrophic backtracking — the class of bug addressed by [MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz)), string-down generation with high `numRuns` is more effective than AST-up.

**Remaining uncertainty:** Shrinker effectiveness on markdown inputs is empirically untested in public work. Tuning `depthSize` and arbitrary weights to hit known CommonMark edge cases (e.g., marked's 68% images / 83% links compliance area) would require local experimentation.

---

## Cross-Cutting Observations

**Oracle choice is the highest-leverage decision.** Three options with different fault-coverage profiles:

| Oracle | Pairings viable | Catches AST-shape bugs | Catches HTML-output bugs | Normalization cost | Expected-divergence noise |
|---|---|---|---|---|---|
| Normalized HTML (via `html-differ`) | Any two parsers | No | Yes | Low (library handles it) | Low |
| mdast-to-mdast (positions stripped, compact) | remark-parse ↔ commonmark.js ↔ micromark + from-markdown | Yes, within unist-shaped cluster | No | Medium (per-category filter needed) | Medium |
| Bespoke unified AST adapter | Any two, per Rust precedent | Yes, if adapter is thorough | Indirectly | High (writing adapters) | Controlled by adapter design |

**Independence of parsers matters for coverage.** A differential harness where both sides share tokenizer internals (remark-parse + micromark) tests only the translation layer. Including markdown-it, marked, or commonmark.js in the pairing gives genuinely independent coverage of tokenization.

**Fixtures and generators are complementary**, not alternatives:
- **CommonMark/GFM spec fixtures** give coverage of the standardized surface with high signal-to-noise (every divergence on a passing CommonMark example is a real bug in at least one parser).
- **fast-check generators** cover the extension surface (wiki-link, MDX, custom plugins) where no external fixture exists, and surface edge cases the spec examples don't reach. Shrinking reduces a divergent input to a minimal reproducer.

**The gap between "all building blocks exist" and "a harness exists" is assembly, not research.** Every tool referenced in this report is production-quality, actively maintained, and installable from npm today. The missing piece is the coupling layer — the ~200-line test file that imports two parsers, normalizes their outputs via one of the three oracles, and wraps `fc.assert` around the predicate.

---

## Limitations & Open Questions

### Dimensions searched but returning negative results
- **D2.4**: No public JS repo runs multiple markdown parsers against equivalence assertions. Searches: GitHub code search (`"markdown-it" "remark-parse"` in test files), npm package search (`markdown-differential`, `parser-diff`), CommonMark discussion archives, conference talks.
- **D2.5 precedent**: No public `fc-markdown-arbitrary` package. Searched `site:github.com "fast-check" "remark" markdown test`.

### Out of scope per rubric
- Rust/WASM bindings for markdown-rs (excluded; the user's stance is "JS today, Rust later")
- Analysis of the user's own codebase (external findings only)
- Recommendation rankings (stance is factual/landscape)

### Quantitative gaps not closed
- Exact count of GFM-only extension tests (separate from inherited CommonMark tests) not published in cmark-gfm's repo
- No measured baseline of how many fast-check runs are needed to hit specific CommonMark edge cases
- No public benchmark of exactly which fixtures diverge between remark-parse and markdown-it on the full CommonMark corpus

---

## References

### Evidence Files
- [evidence/d2-1-differential-harness-patterns.md](evidence/d2-1-differential-harness-patterns.md) — Babelmark3 architecture, AST dialect divergences, micromark–remark-parse relationship
- [evidence/d2-2-commonmark-spec-fixture.md](evidence/d2-2-commonmark-spec-fixture.md) — spec.txt format, JSON packages, GFM/MDX/wiki-link coverage
- [evidence/d2-3-ast-diff-normalization.md](evidence/d2-3-ast-diff-normalization.md) — unist-util-remove-position, mdast-util-compact, html-differ, always-differ categories
- [evidence/d2-4-concrete-harness-examples.md](evidence/d2-4-concrete-harness-examples.md) — negative finding on JS, Skepfyr/rust-parser-fuzz precedent, MdPerfFuzz, JFuzz
- [evidence/d2-5-fast-check-pbt.md](evidence/d2-5-fast-check-pbt.md) — fc.letrec, equivalence pattern, shrinker limitations, generation strategies

### External Sources (Primary)

**Parsers and AST specifications:**
- [remarkjs/remark](https://github.com/remarkjs/remark) — markdown processor powered by plugins
- [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it) — CommonMark-compliant JS parser with token-stream output
- [micromark/micromark](https://github.com/micromark/micromark) — low-level JS tokenizer underlying remark-parse
- [markedjs/marked](https://github.com/markedjs/marked) — battle-tested JS markdown parser with ~88–96% CommonMark compliance per section
- [commonmark/commonmark.js](https://github.com/commonmark/commonmark.js) — reference JavaScript implementation
- [syntax-tree/mdast](https://github.com/syntax-tree/mdast) — Markdown Abstract Syntax Tree specification (unist-based)

**Test fixtures:**
- [commonmark/commonmark-spec](https://github.com/commonmark/commonmark-spec) — source of truth for spec.txt and spec_tests.py
- [wooorm/commonmark.json](https://github.com/wooorm/commonmark.json) — JSON mirror of spec examples
- [npmjs.com/package/commonmark-spec](https://www.npmjs.com/package/commonmark-spec) — official npm publication
- [github/cmark-gfm](https://github.com/github/cmark-gfm) — GFM reference parser; extension tests in `test/spec.txt`
- [GitHub Flavored Markdown Spec](https://github.github.com/gfm/) — formal rendered spec

**Normalization and diff utilities:**
- [syntax-tree/unist-util-remove-position](https://github.com/syntax-tree/unist-util-remove-position) — strip position fields before comparison
- [syntax-tree/mdast-util-compact](https://github.com/syntax-tree/mdast-util-compact) — merge adjacent text nodes
- [syntax-tree/mdast-util-assert](https://github.com/syntax-tree/mdast-util-assert) — validate tree structure (not compare)
- [syntax-tree/mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown) — serialize mdast to markdown (no roundtrip guarantee)
- [markedjs/html-differ](https://github.com/markedjs/html-differ) — HTML diff with whitespace/attribute normalization
- [cscheffler/mddiff](https://github.com/cscheffler/mddiff) — Python markdown normalizer (reference for normalization design)

**Cross-parser tooling and precedents:**
- [babelmark.github.io](http://babelmark.github.io/) — web-based multi-parser comparator
- [babelmark/babelmark-registry](https://github.com/babelmark/babelmark-registry) — dingus server registry (queryable JSON)
- [Babelmark FAQ](http://babelmark.github.io/faq/) — dingus protocol and limits
- [Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz) — differential fuzzer for Rust parsers (architectural blueprint)
- [cuhk-seclab/MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz) — ASE '21 academic precedent for markdown differential fuzzing
- [LLM-based JSON Parser Fuzzing](https://arxiv.org/html/2410.21806v1) — JFuzz, differential testing across JSON parsers
- [markdown-it/markdown-it-testgen](https://github.com/markdown-it/markdown-it-testgen) — single-parser fixture runner

**Property-based testing:**
- [fast-check.dev](https://fast-check.dev/) — official documentation
- [fast-check recursive structures](https://fast-check.dev/docs/core-blocks/arbitraries/combiners/recursive-structure/) — `fc.letrec` docs
- [dubzzz/fast-check-examples](https://github.com/dubzzz/fast-check-examples) — includes equivalence/differential-testing patterns
- [Differential testing (Wikipedia)](https://en.wikipedia.org/wiki/Differential_testing) — technique overview
- [Property-Based Testing Is Fuzzing](https://blog.nelhage.com/post/property-testing-is-fuzzing/) — Nelson Elhage on the overlap
- [Property-based Testing with fast-check](https://www.innoq.com/en/articles/2023/04/testing-fast-check/) — INNOQ tutorial with equivalence example

**Discussion threads and compliance references:**
- [marked CommonMark compliance discussion #1202](https://github.com/markedjs/marked/discussions/1202) — recursive vs line-by-line tokenization disagreement
- [markdown-it issue #176](https://github.com/markdown-it/markdown-it/issues/176) — why markdown-it uses token streams, not a tree AST
- [remarkjs/remark commit 6b42465](https://github.com/remarkjs/remark/commit/6b42465526bb15f70d98a0ea0daccea01ffb8004) — change to use micromark internally
- [GoCardless: Having Fun with Markdown and Remark](https://gocardless.com/blog/fun-with-markdown-and-remark/) — remark's AST-centric pipeline
- [A formal spec for GitHub Flavored Markdown (GitHub Blog)](https://github.blog/engineering/user-experience/a-formal-spec-for-github-markdown/) — GFM announcement
