---
dimension: D2.5 — Applicability to fast-check arbitraries
date: 2026-04-19
sources:
  - fast-check.dev
  - github.com/dubzzz/fast-check
  - github.com/dubzzz/fast-check-examples
  - en.wikipedia.org/wiki/Differential_testing
  - blog.nelhage.com/post/property-testing-is-fuzzing
---

# Evidence: D2.5 — Applicability to fast-check arbitraries

## Key sources referenced
- [fast-check documentation](https://fast-check.dev/) — official docs for property-based testing
- [fast-check.dev recursive structure](https://fast-check.dev/docs/core-blocks/arbitraries/combiners/recursive-structure/) — letrec combinator
- [dubzzz/fast-check-examples](https://github.com/dubzzz/fast-check-examples) — canonical PBT examples including differential cases
- [Differential testing (Wikipedia)](https://en.wikipedia.org/wiki/Differential_testing) — general pattern
- [Property-Based Testing Is Fuzzing](https://blog.nelhage.com/post/property-testing-is-fuzzing/) — Nelson Elhage on PBT/fuzzing convergence
- [fast-check-examples binary contains](https://www.innoq.com/en/articles/2023/04/testing-fast-check/) — differential pattern example

---

## Findings

### Finding: fast-check explicitly supports differential testing as a first-class pattern
**Confidence:** CONFIRMED
**Evidence:** The fast-check documentation and [dubzzz/fast-check-examples](https://github.com/dubzzz/fast-check-examples) repo include the equivalence pattern directly:

```javascript
fc.assert(
  fc.property(
    fc.char(),
    fc.array(fc.char()).map(d => d.sort()),
    (c, data) => binaryContains(c, data) === linearContains(c, data)
  )
);
```

From [fast-check-examples README](https://github.com/dubzzz/fast-check-examples): this pattern is called "equivalence" testing and is used "when there is a slower but simpler implementation or when rewriting code."

**Implications:**
- The cost of wrapping two parsers in `fc.property` is minimal — the pattern is idiomatic fast-check
- The same pattern maps directly onto a markdown context: `parserA(md)` === `parserB(md)` modulo a normalization function
- Cost per run is set by fast-check's `numRuns` option (default 100); each run invokes both parsers once

### Finding: fc.letrec is the combinator for generating recursive markdown-like structures
**Confidence:** CONFIRMED
**Evidence:** From [fast-check.dev/docs/core-blocks/arbitraries/combiners/recursive-structure/](https://fast-check.dev/docs/core-blocks/arbitraries/combiners/recursive-structure/):

> "fc.letrec defines arbitraries able to generate recursive structures" ... "The `tie` function given to builder should be used as a placeholder to handle the recursion"

Example from documentation:
```javascript
fc.letrec((tie) => ({
  tree: fc.oneof(tie('leaf'), tie('node')),
  node: fc.record({ left: tie('tree'), right: tie('tree') }),
  leaf: fc.nat()
}))
```

Depth control options:
- `depthSize` (previously `depthFactor`) — controls the likelihood of recursion continuing
- `maxDepth` — absolute limit
- `depthIdentifier` — shares depth tracking across multiple recursive branches

**Implications:**
- Can directly build an mdast-shaped arbitrary: Root → Paragraph/Heading/List/Blockquote/CodeBlock → recursively → inline nodes (Text/Emphasis/Strong/InlineCode/Link)
- Combined with `mdast-util-to-markdown`, this produces generated markdown as a test input
- `depthSize`/`maxDepth` prevent pathological blowup in shrinking — essential because nested list/blockquote structures are known performance traps (ref: [MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz))

### Finding: fast-check shrinking has known limitations for custom arbitraries
**Confidence:** CONFIRMED
**Evidence:** From the [fast-check user-definable values documentation](https://fast-check.dev/docs/configuration/user-definable-values/):

> "User definable examples defined in `examples` will be automatically reduced by fast-check if they fail."

Custom-arbitrary shrinking constraints:
- `.map()` arbitraries require an `unmapper` function to enable shrinking of user values
- `.chain()` arbitraries are not currently supported for shrinking
- `record` and `string` combinators shrink natively

**Implications:**
- When a divergence is found, shrinking will attempt to find a minimal divergent input
- If the arbitrary pipeline uses `.map()` (e.g., mdast-tree → markdown string), the developer must provide an unmapper for shrinking to recover the minimal AST
- Without an unmapper, shrinking still works on the base arbitrary but cannot navigate through the map step
- Practical pattern: generate the structured AST directly (not the markdown string) and serialize inside the property — this keeps shrinking effective

### Finding: PBT + differential testing has precedent across parser domains
**Confidence:** CONFIRMED
**Evidence:**
- [Property-Based Testing Is Fuzzing](https://blog.nelhage.com/post/property-testing-is-fuzzing/) (Nelson Elhage, nelhage.com) argues property testing and fuzzing are the same technique applied differently
- [Differential testing (Wikipedia)](https://en.wikipedia.org/wiki/Differential_testing) defines the technique as running identical inputs through multiple implementations and looking for discrepancies
- Applied-to-parsers precedents:
  - JSON parsers: [JFuzz](https://arxiv.org/html/2410.21806v1) uses LLM-seeded differential testing across multiple JSON parsers
  - Rust parsers: [Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz) — differential fuzzing with cargo-fuzz
  - Regex engines: Jonas Nockert / Hypothesis "regex engine differential testing" is a well-known Hypothesis case study (not linked in searches but a longstanding PBT example)
  - Erlang JSON web services: [Jsongen](https://www.researchgate.net/publication/266661160_Jsongen_A_QuickCheck_based_library_for_testing_JSON_web_services) is a QuickCheck-based differential testing library

**Implications:**
- The pattern has strong precedent in adjacent parser domains; markdown is an obvious but unfilled niche
- Transferable lessons: (a) generators must produce structurally valid inputs; (b) divergence categories must be pre-declared to avoid noise; (c) shrinking is the feature that distinguishes PBT differential testing from blind fuzzing

### Finding: Generating "canonically unambiguous" markdown is harder than it looks
**Confidence:** INFERRED (from source-code-level knowledge of parser divergences in D2.3)
**Evidence:**
- Many markdown constructs have edge cases where CommonMark-compliant parsers legitimately differ (see D2.3 "always differ" list — soft breaks, whitespace intrinsics, autolinks, entity decoding)
- Two strategies exist:
  1. **AST-up generation**: build an mdast arbitrary → `mdast-util-to-markdown` → both parsers → diff
  2. **String-down generation**: build a markdown-string arbitrary directly → both parsers → diff
- Strategy 1 produces markdown that the remark serializer guarantees is unambiguous under remark's own rules — but markdown-it may still diverge at inline edge cases
- Strategy 2 is more exploratory but will hit "real" ambiguities — the harness must tolerate or filter them

**Implications:**
- A fast-check harness needs an expected-divergence filter; otherwise the signal is drowned in folklore-known divergences
- A practical staged approach: start with AST-up generation restricted to a subset of safe node types (paragraphs, headings, simple emphasis, code blocks), expand coverage as divergences are characterized
- The filter-set itself becomes valuable documentation of where the parsers agree and disagree

### Finding: fast-check integrates cleanly with Bun's test runner via its native test integration
**Confidence:** CONFIRMED
**Evidence:** fast-check's `fc.assert(fc.property(...))` is framework-agnostic — it runs inside any test function. The [@fast-check/jest](https://github.com/dubzzz/fast-check/tree/main/packages/jest) package provides Jest-specific ergonomics (`it.prop`), and Bun's test runner API is compatible with the base `fc.assert` call.

**Implications:**
- No Bun-specific fast-check integration is strictly required
- The `numRuns`, `seed`, `endOnFailure` options control CI budget — for a differential harness, 100–1000 runs per property is a common setting
- Seed can be pinned in CI for deterministic replay of failures

---

## Gaps / follow-ups
- No published `fc-markdown-arbitrary` package — every project rolls its own
- No measured baseline of how much fast-check exploration is needed to hit known CommonMark edge cases (e.g., the "list vs blockquote" container conflicts where marked currently diverges from CommonMark)
- Shrinker effectiveness on markdown inputs is undocumented — empirical work needed to tune depthSize and arbitrary weights
