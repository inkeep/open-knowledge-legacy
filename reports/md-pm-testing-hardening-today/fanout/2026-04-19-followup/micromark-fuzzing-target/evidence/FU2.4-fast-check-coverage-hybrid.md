# Evidence: FU2.4 — fast-check + Coverage Feedback

**Dimension:** fast-check + coverage hybrid
**Date:** 2026-04-19
**Sources:** fast-check source/issues, academic T-PBT papers, Hypothesis, HypoFuzz, rust-fuzz

---

## Key files / pages referenced

- https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/Parameters.ts — full Parameters interface
- https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/random/generator/RandomGenerator.ts — RandomGenerator contract
- https://github.com/dubzzz/fast-check/issues/6290 — "Provide a way to control bias" (open 2025-11-08, dubzzz)
- https://github.com/dubzzz/fast-check/issues/5964 — "automatically test zero values" (closed 2025-11-08)
- https://github.com/dubzzz/fast-check/issues/3399 — "Hypothesis-like test case database" (open 2022-11-10)
- https://github.com/dubzzz/fast-check/issues/6190 — "Tyche/OpenPBTStats support" (open 2025-09-23)
- https://github.com/HypothesisWorks/hypothesis/pull/2006 — Hypothesis `target()` scalar-feedback API
- https://github.com/Zac-HD/hypofuzz — Python CGF over Hypothesis
- https://doi.org/10.1145/3092703.3092711 — Löscher & Sagonas ISSTA 2017 (Targeted PBT)
- https://doi.org/10.1145/3360607 — Lampropoulos et al. OOPSLA 2019 (FuzzChick/Coverage-Guided PBT)

---

## Findings

### Finding: fast-check's `Parameters` interface contains no coverage or feedback option as of April 2026
**Confidence:** CONFIRMED
**Evidence:** `Parameters.ts` on `main` enumerates: `seed`, `randomType`, `numRuns`, `maxSkipsPerRun`, `timeout`, `skipAllAfterTimeLimit`, `interruptAfterTimeLimit`, `markInterruptAsFailure`, `skipEqualValues`, `ignoreEqualValues`, `path`, `logger`, `unbiased`, `verbose`, `examples`, `endOnFailure`, `reporter`, `asyncReporter`, `includeErrorInReport`.
**Implications:** No field observes coverage. No runner method ingests feedback. `unbiased` toggles the internal hard-coded bias, not user-tunable.

### Finding: The maintainer (dubzzz) is aware of Hypothesis-like test-case-database but flagged it "accepted feature" in 2022 with no implementation as of April 2026
**Confidence:** CONFIRMED
**Evidence:** Issue #3399 dubzzz comment 2022-12-18: "a version not based on a seed would be hardly feasible... I'm flagging it as 'accepted feature' as it may be worthy to think about it for future iterations, but I don't know how far we will be able to go."
**Implications:** Closest thing to coverage-memory in fast-check is a seed-based replay. Persistent corpus from fuzz-finds would need external implementation.

### Finding: Cross-language coverage-guided PBT has well-established prior art — but none in JS
**Confidence:** CONFIRMED
**Evidence:**
- **T-PBT (Löscher & Sagonas, ISSTA 2017)** — DOI 10.1145/3092703.3092711 — simulated annealing over a user scalar utility on PropEr (Erlang).
- **FuzzChick (Lampropoulos et al., OOPSLA 2019)** — DOI 10.1145/3360607 — CGF with type-aware mutators on QuickChick (Coq).
- **JQF/Zest (Padhye et al., ISSTA 2019)** — DOI 10.1145/3293882.3339002 — CGF over QuickCheck-style params on JVM (bytecode-instrumented).
- **HypoFuzz (Zac-HD, active)** — https://github.com/Zac-HD/hypofuzz — CGF over Hypothesis tests in Python, explicitly cites Löscher-Sagonas and AFL/AFLFast/FairFuzz.
- **propfuzz (archived)** and **fuzzcheck-rs** — Rust bridges; rust-fuzz/libfuzzer issue #58 captures community discussion.
**Implications:** The JS ecosystem lags by roughly 5+ years on this capability pattern. HypoFuzz is the closest conceptual analog for what a fast-check CGF extension would look like.

### Finding: `fast-check.randomType` accepts `(seed: number) => RandomGenerator`, making it possible in principle to drive fast-check generation from an external byte source (including Jazzer.js bytes)
**Confidence:** CONFIRMED
**Evidence:** `RandomGenerator.ts` defines contract `{ clone, next, jump?, getState }` returning 32-bit integers in `[-0x80000000, 0x7fffffff]`. `Parameters.ts` `randomType` accepts a builder.
**Implications:** A Jazzer.js harness can pack fuzz bytes into a `RandomGenerator`, invoke `fc.sample(arb, { randomType: jazzerRng })`, and produce structured mdast values driven deterministically by libFuzzer's mutator. This is the "fast-check as structured-input decoder" pattern — not true coverage-guided fast-check, but it makes structure-aware CGF tractable.

### Finding: Hypothesis's `hypothesis.target()` is scalar-feedback, NOT branch coverage; HypoFuzz adds true CGF as a separate tool
**Confidence:** CONFIRMED
**Evidence:** Hypothesis PR #2006 cites Löscher-Sagonas; `target(value, label)` takes a user-supplied real number to maximize. HypoFuzz (https://hypofuzz.com/docs/features.html): "HypoFuzz prioritizes tests which discover new coverage, which maximises the rate of discovery... minimizes the time taken to cover each branch in your code."
**Implications:** Even in Python, branch-coverage-guidance is a *separate* tool layered on top of PBT, not a builtin. The architectural template for JS would follow the same pattern.

### Finding: No 3rd-party bridge between fast-check and Jazzer.js exists as a published repo
**Confidence:** NOT FOUND
**Evidence:** Searched: `gh search repositories "fast-check jazzer fuzz"`, `gh search issues "fast-check" "jazzer"`. No integration project surfaced.
**Implications:** An integration would be first-of-kind. Primitives exist (`randomType`, `examples`, `seed`, `reporter`) but no glue code.

---

## Negative searches (for NOT FOUND)

- Searched: dubzzz/fast-check issues for "coverage-guided" → no issues requesting the feature directly.
- Searched: fast-check GitHub Discussions for "coverage" — search API doesn't consistently index Discussions; direct coverage-request discussion not reachable via primary source paths tried.
- Searched: "fast-check custom mutator" — no feature exists.
- Searched: "fast-check weight runtime adjust" — arbitrary weights are fixed at construction time.

---

## Gaps / follow-ups

- The feasibility of a full "fast-check-as-structured-decoder + Jazzer.js" bridge is confirmed at the primitive level; empirical data on whether libFuzzer's mutator produces useful variation after fast-check decoding is unknown.
- No primary-source evidence on Lampropoulos OOPSLA 2019 arxiv preprint — DOI + author PDF are the only verified paths.
