---
dimension: D2.4 — Concrete harness examples in real repos
date: 2026-04-19
sources:
  - github.com/Skepfyr/rust-parser-fuzz
  - github.com/cuhk-seclab/MdPerfFuzz
  - github.com/markdown-it/markdown-it-testgen
  - github.com/cscheffler/mddiff
  - babelmark.github.io
---

# Evidence: D2.4 — Concrete harness examples in real repos

## Key sources referenced
- [Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz) — Rust differential parser fuzzer (closest architectural analog)
- [cuhk-seclab/MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz) — academic research tool for markdown compiler performance bugs (ASE '21 paper)
- [markdown-it/markdown-it-testgen](https://github.com/markdown-it/markdown-it-testgen) — fixture runner, single-parser only
- [cscheffler/mddiff](https://github.com/cscheffler/mddiff) — Python markdown normalizer and diff library
- [babelmark.github.io](http://babelmark.github.io/) — web-based visual comparator

---

## Findings

### Finding (NEGATIVE): No public JS test repo runs ≥2 JS markdown parsers for equivalence assertions
**Confidence:** CONFIRMED (by multi-query negative search)
**Evidence:** Searches executed and their results:
- `"markdown-it" "remark-parse"` in test files on GitHub → plugin/compatibility repos only, no cross-parser assertions
- `"compareAst" OR "deepEqual" mdast cross-parser` → no hits
- `"fast-check" "remark" markdown test property` → only fast-check's own @fast-check/jest package, no markdown testing
- `site:github.com "markdown-it" "remark" test comparing oracle` → package.json listings and plugin repos, not equivalence tests

Closest matches (not cross-parser):
- [markdown-it-testgen](https://github.com/markdown-it/markdown-it-testgen) parses CommonMark-spec-format fixtures but "the API requires passing a markdown-it instance to parse and compare samples" — explicitly single-parser
- Each major parser (markdown-it, micromark, marked) has its own spec-test harness that compares its own HTML output to expected, not to another parser's output

**Implications:**
- There is no community convention to adopt — a JS-vs-JS harness must be designed from first principles
- Similar absence for blog posts or conference talks: no record of a JavaScript-ecosystem talk describing a cross-parser equivalence harness
- Adopting this pattern would be novel work within the JS markdown ecosystem (though routine in other parser ecosystems)

### Finding: Skepfyr/rust-parser-fuzz is the closest architectural precedent (Rust, not JS)
**Confidence:** CONFIRMED
**Evidence:** [Skepfyr/rust-parser-fuzz README](https://github.com/Skepfyr/rust-parser-fuzz):

> "attempts to parse them with every parser, then converts the resulting ASTs into a common representation and compares them, reports a bug if any of the parsers disagree on whether the code is valid or not, or if they produce different ASTs for valid code"

Architecture per repo layout:
- `src/ast.rs` — unified abstract representation
- `src/<parser>/mod.rs` — parser-specific integration, per-parser known-bug filters
- `src/<parser>/convert.rs` — translates parser-native output to the unified form

**Implications:**
- Demonstrates the architectural shape: (1) unified canonical AST, (2) per-parser adapter, (3) per-parser bug-filter allowlist
- Uses `cargo-fuzz` for generation; the JS analog would be `fast-check` arbitraries (fuzzing + shrinking combined)
- The pattern is language-agnostic and directly portable to TS/Bun; only the parsers and fuzz driver change

### Finding: MdPerfFuzz is an academic precedent for markdown parser differential testing
**Confidence:** CONFIRMED
**Evidence:** [MdPerfFuzz repo](https://github.com/cuhk-seclab/MdPerfFuzz) associated with the ASE '21 paper "Understanding and Detecting Performance Bugs in Markdown Compilers."

**Implications:**
- Academic research has applied differential fuzzing to markdown parsers specifically, focused on performance bugs (not correctness)
- Demonstrates that markdown parsers are known to be fertile ground for differential techniques
- Targets the catastrophic-backtracking class of bugs (the same class as markdown-it's pre-1.3.2 "special patterns with length greater than 50 thousand characters" vulnerability)

### Finding: JFuzz demonstrates the LLM + differential testing pattern for JSON
**Confidence:** CONFIRMED
**Evidence:** From [Large Language Models Based JSON Parser Fuzzing](https://arxiv.org/html/2410.21806v1):

> "JFuzz employs differential testing, utilizing LLM-generated seed JSON files as inputs across multiple parsers and evaluating parser output to ensure compliance with JSON standard format and assess consistency among outputs"

**Implications:**
- Establishes a broader precedent: differential testing is the standard approach for parser-consistency bug discovery
- JSON is structurally simpler than markdown, but the pattern transfers
- LLM-generated seed inputs could supplement fast-check's random generators in a markdown context (though the parent prompt does not request this)

### Finding: The Babelmark pattern is the only existing cross-parser markdown comparator, but is web-only and HTML-level
**Confidence:** CONFIRMED
**Evidence:** Per [babelmark.github.io/faq/](http://babelmark.github.io/faq/), Babelmark3's architecture:
- Decentralized dingus servers (one per implementation) at URLs listed in [babelmark-registry/registry.json](https://github.com/babelmark/babelmark-registry/blob/master/registry.json)
- Each server accepts text via GET, returns `{name, version, html}` JSON
- Front-end [babelmark.github.io](http://babelmark.github.io/) queries all servers async and combines results for manual inspection
- 1000-character input limit

**Implications:**
- In principle scriptable: a test harness could fetch the registry.json, POST fixtures to each listed dingus server, and normalize+diff the returned HTML
- Practical caveats:
  - Per-server latency and availability — not CI-reliable
  - 1000-char cap excludes realistic documents
  - No AST access — comparison can only happen at the HTML level
- Better to run the parsers in-process (as npm dependencies) than query remote dingus servers

### Finding: markdown-it-testgen and mddiff are fixture-runners, not differential harnesses
**Confidence:** CONFIRMED
**Evidence:**
- [markdown-it-testgen](https://github.com/markdown-it/markdown-it-testgen): "parses fixtures in commonmark spec format and generates tests for markdown-it parser and plugins" — takes a markdown-it instance, not multiple parsers
- [mddiff](https://github.com/cscheffler/mddiff): Python library that "canonicalizes Markdown before diffing so stylistic variations do not mask real changes" — normalizer for human diff, not automated equivalence

**Implications:**
- Can be studied for normalization ideas (mddiff has a well-developed `NormalizationMetadata.transformations` pipeline) but not adopted as-is in a JS/Bun environment
- Confirms that the JS ecosystem has runners for single-parser spec testing, but not for cross-parser assertion

---

## Negative searches
- `"markdown-it" "remark-parse"` test-file queries → no equivalence harnesses found
- `"compareAst" "mdast"` → no mdast-specific diff tool found
- `"fast-check" "remark"` → only @fast-check/jest, no markdown application
- Conference talks (CommonMark talk site, talks.commonmark.org) → no talks on JS cross-parser equivalence harnesses
- npm package search for `markdown-differential` / `markdown-parser-diff` → no matches

## Gaps / follow-ups
- Closed-source tooling inside large markdown-centric vendors (e.g., GitHub, Notion, Obsidian) may exist but is unverifiable externally
- No public, archived benchmark of exactly which fixtures diverge between JS parsers
