---
title: "Coverage-Guided Fuzzing Targeting micromark in JavaScript (2025–2026)"
description: "Factual landscape of JS coverage-guided fuzzing options for micromark's state-machine tokenizer, what structural mutation is available today, whether fast-check can consume coverage feedback, and what empirical evidence exists for CGF paying off over PBT on tokenizers. Enriches parent report Part IV (Pathological Inputs) as a fanout follow-up."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - micromark
  - Jazzer.js
  - fast-check
  - libFuzzer
  - Zest
  - FuzzChick
  - Hypothesis
  - HypoFuzz
  - mdast-util-arbitrary
  - IJON
  - Superion
topics:
  - coverage-guided fuzzing
  - property-based testing
  - state machine parsers
  - markdown tokenizer
  - JavaScript testing
  - structure-aware fuzzing
  - CI fuzz gating
---

# Coverage-Guided Fuzzing Targeting micromark in JavaScript (2025–2026)

**Purpose:** The parent report (`md-pm-testing-hardening-today/REPORT.md`) established that micromark is a state-machine tokenizer with ZERO direct CVEs in its parse hot path, that its README explicitly recommends a 500KB input cap plus worker-thread isolation, and that fast-check is the baseline property-based testing (PBT) harness. This follow-up answers a concrete question: **given that set-up, what does a coverage-guided fuzz (CGF) harness targeting micromark — bypassing remark's post-processing — actually look like in JavaScript today, and what does it buy over fast-check PBT?** Stance is factual/landscape — no recommendations. Enriches parent Part IV (Pathological Inputs) with fuzz-adjacent detail.

---

## Executive Summary

The JavaScript coverage-guided fuzzing landscape for micromark in April 2026 is narrow, single-vendored, and conceptually lagged behind the C/JVM/Python ecosystems by roughly five years. Five findings frame the landscape:

1. **One active CGF tool for JS: Jazzer.js.** `@jazzer.js/core@4.0.0` shipped to npm on 2026-04-15 with active commits through 2026-04-16. Its only direct competitors (`jsfuzz`, `connor4312/js-fuzz`) are archived or unpublished. `fuzzilli` is engine-level and cannot target a user package like micromark. (FU2.1)

2. **Standard JS coverage tooling does not express state-transition coverage.** micromark's `State` type is literally `(code: Code) => State | undefined` — each state is a named JS function. c8, nyc, V8's Inspector coverage, and Jazzer.js's Babel instrumentation all capture block/branch/function granularity, but none record the `(from-state, to-state)` edge that characterizes a state-machine walk. IJON-style state annotation (IEEE S&P 2020) is the established solution in C/C++; no JS port exists. (FU2.2)

3. **Structured markdown mutation tooling in JS is a single thin package plus a non-lossless roundtrip.** `mdast-util-arbitrary` (fast-check-based mdast generator, ~40 weekly downloads, single author) is the only published structured generator. `mdast-util-to-markdown` explicitly documents "complete roundtripping is impossible." micromark's own `package.json` has its `test-fuzz` script commented out with the note `"fuzzer turned off for now as jazzer is unmaintained, with sec vulns"` — the upstream project does not currently fuzz itself. (FU2.3)

4. **fast-check has no coverage-feedback API, but its primitives could host one.** The `Parameters` interface exposes `seed`, `randomType`, `examples`, `path`, `reporter` — none accept or observe coverage. `randomType` accepts a `(seed: number) => RandomGenerator` builder, which can in principle be driven from a libFuzzer byte buffer, making fast-check viable as a structured-input decoder inside a Jazzer.js target. Maintainer dubzzz tagged a Hypothesis-style test-case database as "accepted feature" in December 2022 (issue #3399, still open 2026-04). HypoFuzz is the Python analog of the architecture this would imitate. (FU2.4)

5. **Empirical payoff is most reliable on semantic-stage paths behind a valid-input gate — not on tokenizers.** Zest (ISSTA 2019) beat AFL and QuickCheck on Java parser *semantic* coverage by 1.03×–2.81×, but **AFL beat Zest by 1.1×–1.6× on syntactic (tokenizer) coverage** and found 10 extra syntactic bugs Zest missed. Superion (ICSE 2019) showed grammar-aware CGF adds ~17% line coverage over plain CGF on structured parsers. IJON (S&P 2020) showed plain edge coverage *fails* on deep state spaces without annotations. The most pertinent datapoint — a JS-specific empirical comparison of Jazzer.js vs fast-check on a tokenizer — does not exist. (FU2.5)

**Key Findings:**

- **Single-vendor CGF supply:** Jazzer.js is the only live option; OSS-Fuzz listed it as "discontinued" in 2024 (issue #11652), a claim contradicted by the 2026 release cadence — unresolved support-continuity signal.
- **No native state-transition coverage for JS:** transition-pair feedback is feasible via Babel plugin or runtime Proxy wrap of the `State` function return values, but unpublished as a library.
- **Worker-thread isolation + 500KB cap is composable from Node primitives** but not documented as a combined Jazzer.js pattern.
- **CI pattern:** ClusterFuzzLite's batch/prune/coverage cron modes are templates, but JavaScript is not in its supported language list — any Jazzer.js CI workflow is hand-rolled.
- **Payoff vs PBT depends on stage:** tokenizer fuzzing (syntactic) favors plain byte-mutation CGF; deeper state-space exploration needs annotation-guided or structure-aware feedback neither of which exists in JS today.

---

## Research Rubric

| Dim | P | Depth | Question |
|-----|---|-------|----------|
| FU2.1 | P0 | Deep | What are the actively-maintained JS CGF tools in 2025-2026? |
| FU2.2 | P0 | Deep | How would transition-coverage instrumentation over micromark's state machine work, and what does c8/nyc/V8 leave uncovered? |
| FU2.3 | P0 | Deep | What grammar-aware / tree-structural mutation exists in JS, across three granularities (string / token / mdast)? |
| FU2.4 | P0 | Deep | Can fast-check consume coverage feedback, and what prior art exists for coverage-guided PBT? |
| FU2.5 | P0 | Deep | What empirical evidence shows CGF finds bugs PBT misses on state-machine parsers? |
| FU2.6 | P1 | Moderate | What does a practical harness architecture (worker-thread isolation + 500KB cap + CI gating + corpus) look like? |

Stance: Factual/Landscape. Non-goals: Rust tooling, full-pipeline fuzz, first-party codebase. Parent report context: CommonMark 0.31 compliance, unified/remark/micromark on TS/Bun, fast-check as established PBT, micromark#20 (deep-nesting crash at 35000×`[](`).

---

## Detailed Findings

### FU2.1 — Coverage-Guided Fuzzing in JS Ecosystem Today

**Finding:** Jazzer.js is effectively the only actively-maintained coverage-guided fuzzing tool for pure-JS user packages as of April 2026. Every other entrant is archived, unpublished, or operating at a different layer (JS engine internals, not JS packages).

**Evidence:** [evidence/FU2.1-js-cgf-ecosystem.md](evidence/FU2.1-js-cgf-ecosystem.md)

The [Jazzer.js repo](https://github.com/CodeIntelligenceTesting/jazzer.js) shipped `@jazzer.js/core@4.0.0` to npm on 2026-04-15 (npm registry `time["4.0.0"]`). The repo is not archived (`archived: false`), with commits through 2026-04-16 (`pushed_at: 2026-04-16T23:32:31Z`). Weekly downloads for the core package in the week of 2026-04-12 were 1,486 — a modest but non-trivial signal. Instrumentation works through Babel plugins injected via `istanbul-lib-hook` (for CommonJS) or the `module.register` ESM loader (requires Node ≥ 20.6). Under the hood, Jazzer.js ships a native C++ addon (6.2% of the repo) that drives libFuzzer from Node; the Babel plugins emit libFuzzer-compatible edge counters at function entries, `IfStatement`, `SwitchCase`, loops, `TryStatement`, `LogicalExpression`, and `ConditionalExpression` ([coverageVisitor.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts)).

Competitors are dormant. [`fuzzitdev/jsfuzz`](https://github.com/fuzzitdev/jsfuzz) was archived 2021-04-30 and its last npm release (1.0.15) is from 2021-01-09. [`connor4312/js-fuzz`](https://github.com/connor4312/js-fuzz) has 133 stars but no npm publication and the README self-describes as "still very much a work in progress and is probably not suitable for 'real' use yet." [`fuzzilli`](https://github.com/googleprojectzero/fuzzilli) (Samuel Groß, Google Project Zero) is actively developed but targets JS *engine internals* — V8, JSC, SpiderMonkey, Duktape, JerryScript, Hermes — via a custom intermediate language (FuzzIL) and engine-level coverage patches. It cannot be pointed at a user-land npm package like `micromark`.

One support-continuity caveat: OSS-Fuzz [issue #11652](https://github.com/google/oss-fuzz/issues/11652) from 2024-02 states Jazzer.js was "discontinued as open source" — a claim directly contradicted by v4.0.0 shipping two years later, the absence of any archive flag or deprecation banner in the README, and OSS-Fuzz's own [JavaScript onboarding docs](https://google.github.io/oss-fuzz/getting-started/new-project-guide/javascript-lang/) continuing to direct users to it. The de-facto evidence (commits, releases, downloads) overrides the 2024 claim, but the ambiguity is worth flagging.

**Implications:**
- Any JS CGF choice today is effectively a single-vendor bet on Code Intelligence's continued open-source investment.
- Integration points: Jest runner via `@jazzer.js/jest-runner` is first-class. Vitest integration ([issue #343](https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343)) has been open since 2023-02-23. Bun and Deno support are undocumented — flagged NOT FOUND.
- Empirical parser-fuzzing track record: one datapoint — protobuf.js prototype pollution ([CVE-2023-36665](https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665)). NO documented Jazzer.js finds against markdown-it, marked, micromark, or remark as of April 2026. None of these parsers are onboarded to OSS-Fuzz.

**Remaining uncertainty:** Jazzer.js's "discontinued / still shipping" ambiguity leaves long-term maintenance trajectory unclear from primary sources.

---

### FU2.2 — Instrumenting micromark's State Machine

**Finding:** micromark's state machine is uniquely clean for instrumentation — each "state" is a named JS function whose signature is `(code: Code) => State | undefined`. Standard JS coverage tools (c8, nyc, V8 Inspector) and Jazzer.js's Babel instrumentation capture block/function/branch granularity, but *none* capture the `(from-state, to-state)` transition edge that characterizes a state-machine walk. Getting transition coverage would be novel in the JS ecosystem.

**Evidence:** [evidence/FU2.2-micromark-state-machine-instrumentation.md](evidence/FU2.2-micromark-state-machine-instrumentation.md)

From [`micromark-util-types/index.d.ts`](https://github.com/micromark/micromark/blob/774a70c6bae6dd94486d3385dbd9a0f14550b709/packages/micromark-util-types/index.d.ts) (commit `774a70c`):

```typescript
export type State = (code: Code) => State | undefined
export type Code = number | null
```

The driver in [`packages/micromark/dev/lib/create-tokenizer.js`](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/create-tokenizer.js) holds `state` as a reassignable function variable; `go(code)` does `state = state(code)`. Core CommonMark constructs expose 2–13 named states each: [`thematic-break.js`](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/thematic-break.js) has 4 (`start`, `before`, `atBreak`, `sequence`); [`code-fenced.js`](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/code-fenced.js) has ~13; [`attention.js`](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/attention.js) has 2 plus a `resolveAll` post-pass. The 22 CommonMark constructs under `micromark-core-commonmark/dev/lib/` together expose on the order of ~100–200 distinct state functions.

The coverage gap is concrete. A [V8 `Profiler.takePreciseCoverage`](https://v8.dev/blog/javascript-code-coverage) call returns per-function source ranges and execution counts — it records that a state function was entered, not which state function called it. c8 (which wraps `NODE_V8_COVERAGE`) and nyc (Istanbul AST instrumentation) report statements/branches/functions/lines at the same granularity. Jazzer.js inserts `Fuzzer.coverageTracker.incrementCounter(edgeId)` at *intra*-function AST edges ([coverageVisitor.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts)) — branches inside `go()` that statically distinguish destinations would provide signal, but `state = state(code)` is an indirect call whose target is not reflected in any statically-visible branch. The upshot: `start → inside → inside` and `start → inside` produce identical edge-coverage bitmaps.

The established solution in the native fuzzing world is IJON (Aschermann et al., IEEE S&P 2020, [repo](https://github.com/RUB-SysSec/ijon)): C/C++ primitives `IJON_STATE`, `IJON_SET`, `IJON_INC` let a user XOR a state value into AFL's coverage bitmap. IJON reports >20× speedup over plain AFL on maze/Super Mario benchmarks and produces crashes on 10 of 22 CGC challenges. No JS port exists — searched "IJON JavaScript", "state transition coverage JavaScript", "Jazzer.js state annotation" — NOT FOUND.

Three feasibility pathways for a JS state-transition wrapper, each grounded in a primary source:

1. **Babel plugin cloning Jazzer's `functionHooks` pattern.** [`functionHooks.ts`](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/functionHooks.ts) already demonstrates matching functions by "fully-qualified name and file path" and wrapping them with `HookManager.callHook()`. A derivative plugin could match state-shaped functions in `micromark-core-commonmark/dev/lib/*.js` and emit `__recordTransition(hash(prev), hash(curr))`.
2. **Runtime Proxy wrap.** Because `State` returns `State | undefined`, a consumer can wrap the returned function with `new Proxy(nextFn, handlers)` that logs transitions before forwarding. No micromark source modification; no build toolchain.
3. **V8 Inspector `Debugger.setBreakpoint`.** Conditional breakpoints on the first statement of each state function produce a CDP event stream — feasible but higher overhead.

**Implications:**
- Transition-coverage instrumentation is *technically feasible* with today's primitives but requires first-of-kind glue code. No off-the-shelf library.
- For the lighter-weight first version, approach (2) needs no build toolchain and is the cheapest proof-of-concept.
- Without transition coverage, a fuzzer's feedback signal is likely to saturate early on micromark — all reachable state functions get entered fast, but interesting state-*pair* explorations remain invisible to the guidance loop.

**Remaining uncertainty:** The actual count of reachable transition pairs on the CommonMark 0.31 spec test suite is unpublished.

---

### FU2.3 — Grammar-Aware / Tree-Structural Mutation

**Finding:** Structured markdown mutation in JavaScript is supported by a single thin npm package (`mdast-util-arbitrary`) plus a documented non-lossless roundtrip between `mdast-util-from-markdown` and `mdast-util-to-markdown`. Token-stream-level mutation has zero tooling. Jazzer.js has no in-loop custom mutator hook. micromark's own project currently has fuzz testing disabled.

**Evidence:** [evidence/FU2.3-grammar-aware-mutation.md](evidence/FU2.3-grammar-aware-mutation.md)

A surprising upstream datapoint: [micromark's `package.json` on main](https://raw.githubusercontent.com/micromark/micromark/main/package.json) contains a commented-out fuzz script:

```
"#": "fuzzer turned off for now as jazzer is unmaintained, with sec vulns",
"#test-fuzz": "..."
```

The "jazzer" reference here is the JVM Jazzer, not jazzer.js, indicating micromark had previously wired a JVM-based harness that has since been disabled. Regardless of historical context, the upstream project is not currently fuzzing itself — which contextualizes the parent report's "zero CVEs" finding.

Grammar-based fuzzing frameworks from the native world do not have JavaScript implementations:

| Framework | Language | Grammar format | JS target |
|---|---|---|---|
| [Grammarinator](https://github.com/renatahodovan/grammarinator) | Python + C++ | ANTLR v4 | No |
| [Nautilus](https://github.com/nautilus-fuzz/nautilus) | Rust + Python | Python CFG | Fuzzes JS *engines* (ChakraCore) |
| [FormatFuzzer](https://github.com/uds-se/FormatFuzzer) | C++ | 010 Editor `.bt` | Binary only |
| [Dharma](https://github.com/MozillaSecurity/dharma) | Python | Custom `.dg` | Generator-only, language-agnostic |
| [Domato](https://github.com/googleprojectzero/domato) | Python | Custom CFG files | DOM/JS/HTML, not markdown |

Dharma and Domato could in theory generate markdown corpora offline from a CommonMark grammar specification and feed them into a JS harness, but neither integrates with a JS-hosted CGF feedback loop.

Three granularities of mutation have dramatically different tooling available:

| Level | What mutates | JS tooling |
|---|---|---|
| **String/bytes** | Raw UTF-8 via bitflips, havoc | Jazzer.js `FuzzedDataProvider`, fast-check `fc.string()` — well-supported |
| **micromark token stream** | `Event[]`/`Token[]` between parse and compile | **NOT FOUND** — no published library; would require custom code against internal `postprocess` events |
| **mdast AST** | Parsed tree → mutate → serialize | `mdast-util-from-markdown` + `mdast-util-to-markdown`; [`mdast-util-arbitrary`](https://github.com/ChristianMurphy/mdast-util-arbitrary) for generation |

The mdast pathway has a structural hazard: [`mdast-util-to-markdown`](https://github.com/syntax-tree/mdast-util-to-markdown)'s README explicitly states "there are several cases where that is impossible... complete roundtripping is impossible given that any value could be injected into the tree." An AST-level fuzzer doing `parse → mutate → serialize → re-parse → compare` will encounter false-positive divergences unrelated to real bugs.

[`mdast-util-arbitrary`](https://www.npmjs.com/package/mdast-util-arbitrary) is the single published JS library offering structured markdown generation via fast-check (`commonmark().Root`). It is authored by ChristianMurphy as an individual contributor (not the syntax-tree organization). The unifiedjs.com listing reports ~40 weekly downloads — low community investment. Crucially, it is a *generator* (fast-check arbitrary), not a mutator — there is no coverage feedback path.

Jazzer.js itself has no `LLVMFuzzerCustomMutator` equivalent exposed to JS. The `--customHooks` flag is for instrumentation/tracing, not input mutation. libFuzzer's [structure-aware fuzzing doc](https://github.com/google/fuzzing/blob/master/docs/structure-aware-fuzzing.md) describes the custom-mutator pattern in C but has no JS guidance. Structure-aware mutation today must live *above* Jazzer.js — either as pre-generated corpora or as a harness that treats mutated strings as target inputs.

Academic precedent for markdown-parser fuzzing exists but is native-language. [MdPerfFuzz (ASE 2021)](https://dl.acm.org/doi/abs/10.1109/ASE51524.2021.9678611), DOI `10.1109/ASE51524.2021.9678611`, found 216 new performance bugs across markdown compilers — but the [repo](https://github.com/cuhk-seclab/MdPerfFuzz) is 52.6% C / 40.6% C++ / 2.5% Python, built on AFL + Superion + PerfFuzz, with syntax-tree mutation tied to native-fuzzer internals. Direct JS translation would require re-implementing the mutation stage against mdast/micromark tokens.

**Implications:**
- mdast-level fuzzing is possible but oracle-fragile due to non-lossless roundtrip.
- Token-level fuzzing is tooling-less and would need custom implementation against micromark internals.
- String-level fuzzing is the only well-tooled path — and it forfeits structural awareness, reducing to plain byte-mutation of markdown text.
- Any "grammar-aware JS markdown fuzzer" would be first-of-kind.

**Remaining uncertainty:** Whether the non-lossless mdast roundtrip would actually produce many false positives in practice is unpublished — primary sources flag the theoretical hazard without quantifying it.

---

### FU2.4 — fast-check + Coverage Feedback Hybrid

**Finding:** fast-check has no coverage-feedback API in its `Parameters` interface as of April 2026. A Hypothesis-style test-case database was flagged "accepted feature" in late 2022 (issue #3399) and remains unimplemented. However, fast-check's primitives — particularly `randomType` accepting a `(seed: number) => RandomGenerator` builder — could host an integration where fast-check serves as a structured-input decoder inside a Jazzer.js target. Cross-language prior art (HypoFuzz for Hypothesis, JQF/Zest for QuickCheck-Java, FuzzChick for QuickChick/Coq) shows the architectural template.

**Evidence:** [evidence/FU2.4-fast-check-coverage-hybrid.md](evidence/FU2.4-fast-check-coverage-hybrid.md)

fast-check's [`Parameters.ts`](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/Parameters.ts) on `main` enumerates every runner option. Relevant fields: `seed` (replayable PRNG state), `randomType` (swap PRNG or supply builder), `numRuns`, `path` (replay shrink-tree path for failures), `examples` (user-supplied values injected at run start), `unbiased` (toggles internal hard-coded bias), `reporter` / `asyncReporter` (post-run hooks). **No field observes coverage. No runner method ingests feedback.** `fc.statistics` reports distribution post-hoc but does not feed it back into subsequent generation.

Key maintainer context from dubzzz:
- [Issue #3399 "Hypothesis-like test case database"](https://github.com/dubzzz/fast-check/issues/3399), opened 2022-11-10. dubzzz comment 2022-12-18: *"a version not based on a seed would be hardly feasible as fast-check can generate a wide range of items going from simple integers to complete functions... I'm flagging it as 'accepted feature' as it may be worthy to think about it for future iterations, but I don't know how far we will be able to go."* Still open 2026-04.
- [Issue #6290 "Provide a way to control bias"](https://github.com/dubzzz/fast-check/issues/6290), opened 2025-11-08. Motivation: expose the internal-bias toggle to users. Closes as parent of [#5964](https://github.com/dubzzz/fast-check/issues/5964).
- [Issue #6190 "Tyche/OpenPBTStats support"](https://github.com/dubzzz/fast-check/issues/6190), 2025-09-23. Proposes structured logging; schema includes literal `"coverage": "no_coverage_info"` field — observability scaffolding only.
- [PR #4012 "✨ Fuzzed string"](https://github.com/dubzzz/fast-check/pull/4012), 2023-06-27, still WIP, empty body — the single fast-check artifact with "fuzz" in the title is a new *arbitrary*, not CGF integration.

Search for GitHub repos bridging fast-check and Jazzer.js returns no primary-source results — NOT FOUND.

Cross-language prior art is substantial:
- **[Targeted PBT (Löscher & Sagonas, ISSTA 2017)](https://doi.org/10.1145/3092703.3092711)** — simulated annealing over a user scalar utility on PropEr (Erlang).
- **[FuzzChick / Coverage-Guided PBT (Lampropoulos, Hicks, Pierce, OOPSLA 2019)](https://doi.org/10.1145/3360607)** — "vanilla QuickChick almost always fails to find any bugs after a long period of time, while FuzzChick often finds them within seconds to minutes"; orders-of-magnitude speedup on injected IFC bugs; ~4–5× throughput cost from instrumentation.
- **[JQF/Zest (Padhye et al., ISSTA 2019)](https://doi.org/10.1145/3293882.3339002)** — JVM CGF-PBT hybrid; explicit pluggable algorithms (Zest is the semantic variant).
- **[Hypothesis](https://github.com/HypothesisWorks/hypothesis) `target()`** (PR [#2006](https://github.com/HypothesisWorks/hypothesis/pull/2006), merged 2019-10-01) — scalar hill-climbing feedback, explicitly cites Löscher-Sagonas. Note: this is NOT branch coverage — it's user-supplied scalar.
- **[HypoFuzz](https://github.com/Zac-HD/hypofuzz)** — true branch-coverage-guided layer over Hypothesis tests: *"HypoFuzz prioritizes tests which discover new coverage... minimizes the time taken to cover each branch in your code."* This is the closest architectural analog for what a fast-check CGF extension would look like.

Primitives fast-check *does* expose that support integration:
- `randomType: (seed) => RandomGenerator` ([RandomGenerator contract](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/random/generator/RandomGenerator.ts)): `{ clone, next, jump?, getState }` returning 32-bit ints. A Jazzer.js `Buffer` can be packed into this interface so the external fuzzer drives generation deterministically, bit-for-bit.
- `examples: T[]` — insert known "interesting" values at the start of a run. Natural insertion point for a corpus of fuzz-derived seeds.
- `seed` + `path` — full replay determinism for any previously-interesting case.
- `reporter` — post-run hook that could compute a coverage delta (via external tool) and persist seeds.

Primitives fast-check does *not* expose:
- No hook to mutate a generated value based on external feedback.
- No scalar-feedback analog of `hypothesis.target()`.
- No runtime-adjustable weights in `fc.oneof` / weighted arbitraries.
- No corpus / test-case database (issue #3399 still open).

**Implications:**
- Building a "fast-check as decoder inside Jazzer.js target" is architecturally coherent today. The harness reads `fuzzerInputData` as the seed stream of a custom `RandomGenerator`, drives `fc.sample(mdastArbitrary, { randomType })`, produces a structured markdown string, feeds it to `micromark()`. Jazzer.js sees per-iteration bytes and correlates coverage with them. This is conceptually similar to libFuzzer's "structure-aware fuzzing" pattern on the C side.
- Branch-coverage-guided *weight steering* of fast-check arbitraries (lowering weights for saturated regions) has no primitive support. Would require monkey-patching fast-check internals.
- The closest off-the-shelf pattern is HypoFuzz — architectural diagram for what a fast-check equivalent could look like, but nothing ports it.

**Remaining uncertainty:** Whether libFuzzer's byte-mutator produces useful variation after fast-check decoding is unevaluated.

---

### FU2.5 — Empirical Payoff vs PBT Alone

**Finding:** Academic evidence on CGF-over-PBT payoff is well-established for *semantic-stage* paths of compound parsers (JVM compilers, Coq IFC machines) but less clear for pure tokenizer stages — where plain CGF has actually *outperformed* structure-aware hybrids in the published literature. No JS-specific comparison exists. IJON evidence suggests plain edge-coverage fails on deep state spaces without annotations, a caveat that applies directly to micromark.

**Evidence:** [evidence/FU2.5-payoff-vs-pbt.md](evidence/FU2.5-payoff-vs-pbt.md)

The [Zest paper](https://doi.org/10.1145/3293882.3330576) (Padhye, Lemieux, Sen, ISSTA 2019) ran 3-hour campaigns × 20 repetitions across five Java parsers/compilers (Maven, Ant, BCEL, Closure, Rhino). Headline numbers:

- **Zest vs baselines, semantic-stage branch coverage: 1.03× (Rhino) to 2.81× (Maven).**
- **AFL vs Zest on syntax-stage coverage: 1.1× to 1.6× in AFL's favor.**
- Zest found 10 new semantic bugs. AFL found 5 of those 10 within 3h. QuickCheck found 8 of 10 but with 5–10% reliability.
- AFL found 10 *additional syntactic bugs* Zest missed (3 Maven, 6 BCEL, 1 Rhino).
- Mean-time-to-find Bug B (Ant): Zest 99.45 s / 100% reliability; AFL 6369.5 s / 10% reliability. Bug C (Closure): Zest 8.8 s; AFL 5496.25 s.

This evidence is load-bearing for understanding where to expect CGF's marginal value. CGF-over-PBT gains concentrate on *semantic* paths behind a valid-input gate (where PBT's random generation rarely lands on valid-then-interesting deep paths). On *tokenizer* coverage specifically — micromark's exact workload — AFL-style plain byte-mutation CGF dominated Zest's smart generation. The implication for micromark, which is overwhelmingly a tokenizer rather than a compound parser, is that plain byte-mutation fuzzing may approach the syntactic ceiling from a different angle than PBT, rather than adding a strict layer on top of it.

[FuzzChick (Lampropoulos et al., OOPSLA 2019)](https://doi.org/10.1145/3360607) provides a stronger gain on a very different workload: a formally-verified Information-Flow-Control machine in Coq (>10k LoC). Vanilla QuickChick *"almost always fails to find any bugs after a long period of time, while FuzzChick often finds them within seconds to minutes"* — orders-of-magnitude speedup. Throughput cost: ~4–5× (16,500 tests/sec instrumented vs ~82,000 vanilla). Relevance to micromark: micromark is a tokenizer rather than a deep-logic state machine, so the FuzzChick gain pattern does not transfer directly — but the throughput-cost model is informative for planning CI budgets.

[Superion (Wang et al., ICSE 2019)](https://doi.org/10.1109/ICSE.2019.00081) adds grammar-awareness to CGF. On XML (libplist) and three JS engines: line coverage +16.7%, function coverage +8.8% over AFL; 34 bugs found vs AFL's 6 in 3 months. Relevance: implies that if any grammar-aware JS CGF tool existed for markdown, it could plausibly add ~17% coverage over plain Jazzer.js — but no such tool exists (per FU2.3).

[IJON (Aschermann et al., IEEE S&P 2020)](https://github.com/RUB-SysSec/ijon) demonstrated that plain edge-coverage CGF *fails* on deep state spaces; with one-line `IJON_STATE` annotations, AFL solves mazes and Super Mario levels with >20× speedup and crashes 10 of 22 CGC challenges. The implication for micromark is that without transition-coverage instrumentation (FU2.2), plain Jazzer.js edge feedback may saturate early on entered-state coverage without exploring the state-pair space — echoing the "tokenizer-stage" ceiling seen in Zest.

Saturation data from [Liyanage, Böhme et al., ICSE 2023](https://doi.org/10.1109/ICSE48619.2023.00117): branch coverage saturates such that "increasing the number of generated test inputs by one order of magnitude does not change coverage anymore"; 100% reachable coverage is typically reached before 10^6 inputs; **most branches covered in 23 hours are covered in the first 15 minutes**. However, **>50% of bugs are found in the last two-thirds of the campaign** when coverage has moved from ~90% to ~94%. Bug discovery decouples from coverage after saturation.

Large-scale OSS-Fuzz study ([arxiv 2510.16433](https://arxiv.org/html/2510.16433)): ~36% of projects find a bug in the first session; detection rate drops below 5% by session 26, stabilizing near 2.19%. First-contact finds are common; long-tail is thin.

**Translation-to-JS hazards** (informing why the C/JVM/Coq evidence may not transfer cleanly):

1. Jazzer.js instrumentation is Babel-AST source rewrites, not native edge instrumentation. No primary-source empirical study compares its coverage signal fidelity to a native C/Java baseline — NOT FOUND.
2. Jazzer.js's status under Code Intelligence's maintenance commitment is ambiguous ([OSS-Fuzz issue #11652](https://github.com/google/oss-fuzz/issues/11652)).
3. ESM modules loaded via pure ES paths are NOT instrumented — only CommonJS `require()`-loaded code is hooked. Pure-ESM codebases get no signal. (micromark publishes as ESM.)
4. Async throughput is lower than sync per [Jazzer.js fuzz-settings docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md) — no quantified overhead published.
5. The only disclosed Jazzer.js parser find in the public record is [protobuf.js CVE-2023-36665](https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665) — a single datapoint, not a study. NOT FOUND: any published JS-specific empirical study of CGF vs PBT on a tokenizer.

**Conditions under which CGF gains matter (from the evidence):**
- *Semantic stages behind a valid-input gate:* 1.03×–2.81× over PBT on Java parsers.
- *Tokenizer stages:* plain CGF has beaten structure-aware CGF 1.1×–1.6×; PBT-with-grammar closes the gap differently.
- *Deep state machines (not just deep trees):* neither plain CGF nor vanilla PBT explores state pairs reliably; IJON-style annotations needed.
- *Time budget:* Most coverage is found in the first 15 min; most bugs after saturation — campaigns <1h materially under-report bugs.

**Decision triggers (when CGF would be most likely to find bugs PBT misses on micromark):**
- Targets deep inside attention resolution, HTML inline, or multi-line constructs where PBT rarely produces the exact code-point sequence.
- Pathological combinations that expose the post-processor (`unravelLinkedTokens` recursion per [micromark#20](https://github.com/micromark/micromark/issues/20)) — already known in parent report.
- State-pair coverage interactions missed by random arbitraries — requires the FU2.2 instrumentation to even observe.

**Remaining uncertainty:** No direct measurement of what bugs CGF would actually find in micromark beyond what fast-check with 60+ construct arbitraries × 1000 runs × 3 seeds already catches.

---

### FU2.6 — Practical Harness Architecture (P1)

**Finding:** A minimum-viable Jazzer.js harness for micromark is ~10 lines of target code plus CLI invocation; the 500KB cap maps cleanly to `-max_len=512000`. The complexity lives in CI scheduling and worker-thread isolation — both composable from Node primitives but not documented as a unified pattern. ClusterFuzzLite does not support JavaScript, so any CI workflow is hand-rolled.

**Evidence:** [evidence/FU2.6-harness-architecture.md](evidence/FU2.6-harness-architecture.md)

Harness skeleton from [Jazzer.js fuzz-targets.md](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-targets.md):

```js
const { FuzzedDataProvider } = require("@jazzer.js/core");
const { micromark } = require("micromark");

module.exports.fuzz = function (fuzzerInputData /* Buffer */) {
    micromark(fuzzerInputData.toString("utf-8"));
};
```

CLI invocation per [fuzz-settings.md](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md):

```bash
npx jazzer fuzz-target ./corpus -- -max_len=512000 -max_total_time=1800
```

Corpus and crash directories (from [jest-integration.md](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md)): crash inputs land at `./[testFileName]/[describeBlock]/[testName]/`; corpus at `./.cifuzz-corpus/[testFileName]/[describeBlock]/[testName]/`. Regression mode is default; `JAZZER_FUZZ=1` enables fuzz mode. Crash files are committed to the repo and replayed as individual Jest test cases.

libFuzzer operational flags ([LLVM libFuzzer docs](https://llvm.org/docs/LibFuzzer.html)):
- `-max_len=N` — bytes cap (default 4096 when no corpus).
- `-max_total_time=N` — seconds (default 0 = indefinite).
- `-merge=1` — corpus minimization.

The 500KB cap traces to [micromark README Safety section](https://github.com/micromark/micromark#safety): *"It is wise to cap the accepted size of input (500kb can hold a big book) and to process content in a different thread or worker so that it can be stopped when needed."* UTF-8 semantics: `-max_len` is pre-decode bytes; multi-byte sequences compress to fewer characters post-decode, but this is exactly how micromark consumes input anyway.

CI gating patterns:
- [OSS-Fuzz CIFuzz](https://google.github.io/oss-fuzz/getting-started/continuous-integration/) is PR-only: `on: [pull_request]`, `fuzz-seconds: 600` default, max 21600 s (6h) per GH Actions run.
- [ClusterFuzzLite](https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/) adds batch/prune/coverage cron modes:
  - `code-change` (PR) — `fuzz-seconds: 600`, on `pull_request`.
  - `batch` (continuous) — `cron: '0 0/6 * * *'`, `fuzz-seconds: 3600`, `mode: 'batch'`.
  - `prune` (daily) — `cron: '0 0 * * *'`, `mode: 'prune'`.
  - `coverage` — `sanitizer: 'coverage'`, `mode: 'coverage'`.
- **JavaScript is NOT in ClusterFuzzLite's supported-language list** (C, C++, Java, Go, Swift, Python, Rust). Any Jazzer.js CI workflow is hand-rolled. NOT FOUND: a published GitHub Action wrapping Jazzer.js.

Worker-thread isolation via [Node `worker_threads`](https://nodejs.org/api/worker_threads.html) `resourceLimits` (primary-source docs):
- `maxOldGenerationSizeMb` — main heap cap; reaching it terminates the worker.
- `maxYoungGenerationSizeMb` — semi-space cap.
- `stackSizeMb` — default 4 MB.
- `worker.terminate()` — forceful stop, returns promise for exit code.

```js
const worker = new Worker('./script.js', {
  resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 128, stackSizeMb: 4 }
});
const timeout = setTimeout(() => worker.terminate(), 5000);
worker.on('exit', () => clearTimeout(timeout));
```

[Piscina](https://github.com/piscinajs/piscina) supports the same `resourceLimits` plus `AbortController`-based cancellation. *Piscina docs do not mention fuzzing* — searched, no match.

NOT FOUND: a primary-source pattern combining Jazzer.js + Node worker-thread isolation. Jazzer.js itself runs as a Node process; wrapping each micromark invocation inside a worker (heap + time budget) inside the Jazzer.js target is composable from Node primitives but not documented as a published pattern.

**Implications:**
- Target harness is trivial; CI/worker-pool glue is the actual engineering.
- A worker-per-iteration pattern has throughput cost (worker spawn is ~1ms+ in Node, dominating any 512KB micromark parse). Amortization via Piscina-style pool is plausible but unstudied with Jazzer.js.
- Corpus discipline follows libFuzzer conventions cleanly: commit `.cifuzz-corpus/` and crash directories to the repo, `-merge=1` periodically, replay regressions in CI via `JAZZER_FUZZ` unset (default regression mode).

**Remaining uncertainty:** No primary benchmark of Jazzer.js per-iteration overhead on a small parser target. Impacts CI time budgeting.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **MdPerfFuzz parser test set:** the ASE '21 paper's full list of parsers tested could not be verified from primary sources (the CUHK-hosted PDF returned ECONNREFUSED). Conference pages confirm 216 bugs across markdown compilers but don't enumerate the targets. Whether markdown-it/marked were included is unclear.
- **Jazzer.js instrumentation fidelity vs native libFuzzer:** no published empirical study compares signal quality. Impacts inference of how much C/JVM CGF evidence transfers to JS.
- **Bun runtime support for Jazzer.js:** undocumented. The parent report's pipeline is TS/Bun; Bun compatibility of Jazzer.js's libFuzzer native addon has no primary-source confirmation.
- **Vitest integration:** [issue #343](https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343) open since 2023-02-23. Only Jest is supported today via `@jazzer.js/jest-runner`.

### Out of Scope (per Rubric)
- Rust-specific tooling (cargo-fuzz, honggfuzz on markdown-rs) — post-migration work.
- Full-pipeline fuzzing (remark + plugins + custom handlers).
- First-party codebase investigation.
- Actual implementation of any harness.

---

## References

### Evidence Files
- [evidence/FU2.1-js-cgf-ecosystem.md](evidence/FU2.1-js-cgf-ecosystem.md) — Jazzer.js vs jsfuzz/js-fuzz/fuzzilli, npm/GitHub activity, bug-finding track record.
- [evidence/FU2.2-micromark-state-machine-instrumentation.md](evidence/FU2.2-micromark-state-machine-instrumentation.md) — `State` type signature, construct inventory, coverage-tool matrix, three instrumentation pathways, IJON prior art.
- [evidence/FU2.3-grammar-aware-mutation.md](evidence/FU2.3-grammar-aware-mutation.md) — Grammarinator/Nautilus/Domato inventory, three-granularity mutation table, mdast roundtrip hazard, `mdast-util-arbitrary`, MdPerfFuzz, upstream micromark `test-fuzz` disabled.
- [evidence/FU2.4-fast-check-coverage-hybrid.md](evidence/FU2.4-fast-check-coverage-hybrid.md) — `Parameters` interface, dubzzz issues #3399/#5964/#6190/#6290, Targeted PBT/FuzzChick/JQF/Hypothesis/HypoFuzz prior art.
- [evidence/FU2.5-payoff-vs-pbt.md](evidence/FU2.5-payoff-vs-pbt.md) — Zest numbers, FuzzChick, Superion, IJON, Böhme saturation, JS-translation hazards.
- [evidence/FU2.6-harness-architecture.md](evidence/FU2.6-harness-architecture.md) — Harness skeleton, `-max_len`, CIFuzz/ClusterFuzzLite modes, worker_threads resourceLimits.

### External Sources (Primary)

**Tools & Repos**
- [Jazzer.js repository](https://github.com/CodeIntelligenceTesting/jazzer.js)
- [Jazzer.js fuzz-targets docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-targets.md)
- [Jazzer.js fuzz-settings docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md)
- [Jazzer.js jest-integration docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md)
- [Jazzer.js instrumentor](https://github.com/CodeIntelligenceTesting/jazzer.js/tree/main/packages/instrumentor)
- [Jazzer.js coverageVisitor](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts)
- [Jazzer.js functionHooks](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/functionHooks.ts)
- [Jazzer.js issue #343 — Vitest support](https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343)
- [OSS-Fuzz issue #11652](https://github.com/google/oss-fuzz/issues/11652)
- [protobuf.js CVE-2023-36665](https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665)
- [fuzzitdev/jsfuzz](https://github.com/fuzzitdev/jsfuzz) (archived)
- [connor4312/js-fuzz](https://github.com/connor4312/js-fuzz) (WIP)
- [googleprojectzero/fuzzilli](https://github.com/googleprojectzero/fuzzilli)
- [micromark](https://github.com/micromark/micromark)
- [micromark Safety section](https://github.com/micromark/micromark#safety)
- [micromark-util-types/index.d.ts @ 774a70c](https://github.com/micromark/micromark/blob/774a70c6bae6dd94486d3385dbd9a0f14550b709/packages/micromark-util-types/index.d.ts)
- [micromark create-tokenizer.js](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/create-tokenizer.js)
- [micromark thematic-break.js](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/thematic-break.js)
- [micromark code-fenced.js](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/code-fenced.js)
- [micromark attention.js](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/attention.js)
- [micromark package.json (test-fuzz disabled)](https://raw.githubusercontent.com/micromark/micromark/main/package.json)
- [mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown)
- [mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown)
- [mdast-util-arbitrary](https://github.com/ChristianMurphy/mdast-util-arbitrary) ([npm](https://www.npmjs.com/package/mdast-util-arbitrary))
- [fast-check Parameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/Parameters.ts)
- [fast-check RandomGenerator.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/random/generator/RandomGenerator.ts)
- [fast-check issue #3399](https://github.com/dubzzz/fast-check/issues/3399)
- [fast-check issue #6190](https://github.com/dubzzz/fast-check/issues/6190)
- [fast-check issue #6290](https://github.com/dubzzz/fast-check/issues/6290)
- [HypoFuzz](https://github.com/Zac-HD/hypofuzz)
- [IJON repository](https://github.com/RUB-SysSec/ijon)
- [Grammarinator](https://github.com/renatahodovan/grammarinator)
- [Nautilus](https://github.com/nautilus-fuzz/nautilus)
- [Domato](https://github.com/googleprojectzero/domato)
- [Dharma](https://github.com/MozillaSecurity/dharma)
- [MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz)
- [micromark issue #20](https://github.com/micromark/micromark/issues/20)

**Official Documentation**
- [LLVM libFuzzer](https://llvm.org/docs/LibFuzzer.html)
- [V8 code coverage blog](https://v8.dev/blog/javascript-code-coverage)
- [Node.js worker_threads](https://nodejs.org/api/worker_threads.html)
- [Piscina](https://github.com/piscinajs/piscina)
- [OSS-Fuzz CIFuzz](https://google.github.io/oss-fuzz/getting-started/continuous-integration/)
- [ClusterFuzzLite GitHub Actions](https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/)
- [libFuzzer structure-aware-fuzzing doc](https://github.com/google/fuzzing/blob/master/docs/structure-aware-fuzzing.md)

**Academic Papers (with DOI)**
- [Zest: Semantic Fuzzing (Padhye et al., ISSTA 2019)](https://doi.org/10.1145/3293882.3330576) — arxiv [1812.00078](https://arxiv.org/abs/1812.00078)
- [JQF tool paper](https://rohan.padhye.org/files/jqf-issta19.pdf)
- [Coverage-Guided PBT / FuzzChick (Lampropoulos et al., OOPSLA 2019)](https://doi.org/10.1145/3360607)
- [Targeted PBT (Löscher & Sagonas, ISSTA 2017)](https://doi.org/10.1145/3092703.3092711)
- [Superion (Wang et al., ICSE 2019)](https://doi.org/10.1109/ICSE.2019.00081) — arxiv [1812.01197](https://arxiv.org/abs/1812.01197)
- [IJON (Aschermann et al., IEEE S&P 2020)](https://ieeexplore.ieee.org/abstract/document/9152719)
- [Reachable Coverage (Liyanage, Böhme et al., ICSE 2023)](https://doi.org/10.1109/ICSE48619.2023.00117)
- [Nautilus (NDSS 2019)](https://www.ndss-symposium.org/ndss-paper/nautilus-fishing-for-deep-bugs-with-grammars/)
- [MdPerfFuzz (ASE 2021)](https://dl.acm.org/doi/abs/10.1109/ASE51524.2021.9678611) — DOI `10.1109/ASE51524.2021.9678611`
- [OSS-Fuzz large-scale study](https://arxiv.org/html/2510.16433)

### Related Research
- [../../../REPORT.md](../../../REPORT.md) — parent report. Part IV (Pathological Inputs) is the target section this fanout enriches. Key parent findings extended here: ZERO CVEs in micromark parse hot path, micromark#20 deep-nesting crash, 500KB + worker-thread recommendation, fast-check as established PBT baseline.
- Sibling fanout: [../stryker-bun-vs-vitest-economics/](../stryker-bun-vs-vitest-economics/) — parallel follow-up on mutation-testing economics (separate direction).
