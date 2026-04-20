You are conducting deep technical research as a follow-up sub-instance. A parent report on this topic already exists and will be enriched with your findings.

## PARENT REPORT CONTEXT

**Purpose:** What testing techniques should an iron-clad md ⇄ PM TS pipeline carry today to surface latent bugs? The target pipeline uses unified/remark/micromark in TS/Bun. The Rust migration is motivation but NOT the research subject — focus on what's applicable today.

**Primary question (this follow-up):** Given that micromark is a state-machine tokenizer (not recursive descent), and given that (a) the parent report found micromark has ZERO direct CVEs in the parse hot path and (b) micromark's own README recommends 500KB input caps + worker-thread isolation, what does a coverage-guided fuzz harness targeting micromark look like in JavaScript today — bypassing remark's post-processing — and what does it buy over fast-check PBT?

**Stance:** Factual/Landscape — layout of fuzzing options with tradeoffs. NOT recommendations.

**Non-goals:**
- No Rust-specific fuzzing (cargo-fuzz, honggfuzz, AFL on markdown-rs) — that's post-migration work
- No full-pipeline fuzzing (remark + plugins + custom handlers) — this is specifically about targeting micromark at the tokenizer layer
- No first-party codebase analysis

## EXISTING FINDINGS ON THIS TOPIC (from parent REPORT.md)

- micromark's state-machine design is why its parse core has zero direct CVEs (per parent Exec Summary #8 + IV.1): state-machine tokenization uses no backtracking regexes in hot paths.
- Deep-nesting crashes at single-digit-KB inputs: `parseMarkdown("[](".repeat(35000))` crashes via `unravelLinkedTokens` post-processor recursion ([micromark#20](https://github.com/micromark/micromark/issues/20)).
- micromark README explicitly recommends: input ≤ 500KB, run in worker thread.
- Giant-document scaling section of parent (IV.4) noted: no public 1MB/10MB/100MB benchmark exists; MDX is the real-world OOM hotspot; default Node 2GB heap is the de facto ceiling.
- The markdown-rs fuzz harness (cargo-fuzz + honggfuzz) is Rust-only and outside scope.
- fast-check is the parent's established PBT tool; question is how fuzz-style coverage-guidance COMPLEMENTS or EXTENDS PBT for this specific target.

## YOUR RESEARCH TASK

Research coverage-guided fuzzing (in the AFL/libfuzzer/honggfuzz sense) applied to pure-JS state-machine parsers today, with micromark as the concrete target. Specifically:

1. **Is there a JS ecosystem equivalent to AFL/libfuzzer?** What are the actively-maintained options (2025-2026), and what's their state-of-the-art?

2. **Can fast-check itself be extended to support coverage-guided feedback** (instrumenting the micromark state machine to report coverage, then using that to guide fast-check's arbitrary generation)? What patterns exist for this in any JS PBT library?

3. **What coverage tooling would give useful signal on micromark specifically?** c8 / nyc / istanbul cover lines and branches — but a state machine's "coverage" is really about transitions/states visited. Is there any prior art?

4. **What's the payoff vs PBT alone?** If fast-check already has 1000 runs × 3 seeds × structured arbitraries generating 60+ construct types, where is a coverage-guided fuzzer likely to find bugs that PBT misses? State-machine transition coverage is the concrete hypothesis — is there evidence for that?

5. **How would this layer cleanly with worker-thread isolation + 500KB cap** from micromark's README?

## DIMENSIONS TO INVESTIGATE

### FU2.1 — Coverage-guided fuzz in JS ecosystem today (P0)
- Jazzer.js (Code Intelligence, 2021+) — active, libfuzzer-based, has markdown-relevant tests?
- js-fuzz, jsfuzz — maintenance status
- fuzzilli (Samuel Groß / Google Project Zero) — engine-level, not really at package level but relevant
- node-jsfuzz, @jazzer.js/core — what's installable on npm today and actually works with Bun or vitest runtimes
- fast-check's own explicit-fuzz modes or experimental features for coverage feedback
- Benchmarks: any public data on fuzz-found bugs in JS parsers in the last 3 years?

### FU2.2 — Instrumenting micromark's state machine (P0)
- micromark's architecture: how states and transitions are structured (read source in mm.s internal state machine)
- Existing coverage tooling (c8, nyc, v8-coverage): what they capture vs what a state-machine would want
- Transition-graph coverage: is there any precedent for this level of granularity in JS parser testing?
- Could a custom instrumentation wrapper compile transition coverage from micromark's internal functions?

### FU2.3 — Grammar-aware / tree-structural mutation (P0)
- Grammar-based fuzzing theory (Grammarinator, Nautilus, FormatFuzzer) — adaptations in JS?
- Mutating at mdast-tree level vs markdown-string level vs micromark-token-stream level — three granularities
- "Structured mutation" patterns: take a valid input, mutate structurally, feed back — any JS tooling?
- MdPerfFuzz (ASE '21, mentioned in parent as adjacent academic work) — did it open-source anything?

### FU2.4 — Fast-check + coverage hybrid (P0)
- fast-check ≥3.x has `examples` and `seed` options — can it consume coverage hints?
- Bias arbitraries toward low-coverage regions — any prior art?
- Open fast-check issues around coverage-guided generation
- The GitHub discussions between dubzzz (fast-check maintainer) and the community on fuzz integration

### FU2.5 — Payoff vs PBT alone (P0)
- Empirical evidence that coverage-guided fuzzing finds bugs PBT misses on state-machine parsers (in any language)
- Academic comparisons of AFL++ vs proptest vs QuickCheck-style on lexers/tokenizers
- Translation to JS parser domain — do the results transfer?

### FU2.6 — Practical harness architecture (P1)
- Minimum-viable harness: worker thread + micromark + mutator loop + coverage wrap
- How to gate CI on fuzz (typically nightly-only, timeout-budgeted)
- Corpus management: how to maintain a regression corpus of fuzz-found seeds
- Relationship to a 500KB cap + worker-thread isolation

## CONSTRAINTS

- All citations external primary sources (GitHub repos, npm, blogs, academic papers)
- Frame findings as enrichment to parent Part IV (Pathological Inputs section has a fuzz-adjacent thread); may touch Part I if coverage-guidance crosses over
- NOT Rust (explicitly excluded)
- Training-data claims flagged "unverified" if no source — academic paper claims must have arxiv/DOI URLs
- **Output location:** `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-followup/micromark-fuzzing-target/`
- **Filename:** `REPORT.md` (uppercase)
- **Evidence files:** in `evidence/` with frontmatter — one per FU2.1/FU2.2/FU2.3/FU2.4/FU2.5 recommended
- Target: 2500-5000 words. Deep dive.

Depth: deep — user explicitly labeled this direction as Deep.
