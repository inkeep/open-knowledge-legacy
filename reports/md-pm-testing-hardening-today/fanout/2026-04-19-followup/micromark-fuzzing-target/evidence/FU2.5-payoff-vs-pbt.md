# Evidence: FU2.5 — CGF vs PBT Empirical Payoff on State-Machine Parsers

**Dimension:** Payoff of coverage-guided fuzzing vs fast-check PBT alone
**Date:** 2026-04-19
**Sources:** Zest (ISSTA '19), FuzzChick (OOPSLA '19), T-PBT (ISSTA '17), Superion (ICSE '19), IJON (S&P '20), Böhme reachable coverage (ICSE '23)

---

## Key files / pages referenced

- https://dl.acm.org/doi/10.1145/3293882.3330576 — Zest (ISSTA 2019), DOI 10.1145/3293882.3330576
- https://arxiv.org/abs/1812.00078 — Zest arxiv preprint
- https://rohan.padhye.org/files/jqf-issta19.pdf — JQF tool paper
- https://dl.acm.org/doi/10.1145/3360607 — FuzzChick (OOPSLA 2019), DOI 10.1145/3360607
- https://lemonidas.github.io/pdf/FuzzChick.pdf — FuzzChick PDF
- https://doi.org/10.1145/3092703.3092711 — Targeted PBT (ISSTA 2017)
- https://dl.acm.org/doi/10.1109/ICSE.2019.00081 — Superion (ICSE 2019), DOI 10.1109/ICSE.2019.00081
- https://arxiv.org/abs/1812.01197 — Superion arxiv
- https://chenbihuan.github.io/paper/icse19-wang-superion.pdf — Superion PDF
- https://github.com/RUB-SysSec/ijon — IJON repo
- https://ieeexplore.ieee.org/abstract/document/9152719 — IJON paper
- https://ieeexplore.ieee.org/document/10172496/ — Reachable Coverage (Liyanage, Böhme et al., ICSE 2023)
- https://mboehme.github.io/paper/ICSE23.Effectiveness.pdf — Reachable Coverage PDF
- https://arxiv.org/html/2510.16433 — Large-scale OSS-Fuzz empirical study

---

## Findings

### Finding: Zest (CGF-PBT hybrid) beat AFL and QuickCheck on semantic-stage coverage of Java parsers by 1.03×–2.81×, but AFL BEAT Zest on tokenizer/syntax-stage coverage by 1.1×–1.6×
**Confidence:** CONFIRMED
**Evidence:** Zest paper (ISSTA '19), 3-hour campaigns × 20 repetitions on 5 Java parsers (Maven, Ant, BCEL, Closure, Rhino). Quantitative results:
- Semantic-stage branch coverage advantage of Zest: **Maven 2.81×** (high), **Rhino 1.03×** (low).
- Syntax-stage coverage: **AFL 1.1×–1.6× higher than Zest** (i.e., CGF-without-PBT-structure dominated on tokenizer stage).
- Bug counts: Zest 10 new semantic bugs; AFL found 5 of those 10 within 3h; QuickCheck found 8 of 10 with low reliability (5–10% of runs).
- AFL found 10 *additional* syntactic bugs (3 Maven, 6 BCEL, 1 Rhino) that Zest missed.
- Mean-time-to-find Bug B (Ant): Zest 99.45s / 100%; AFL 6369.5s / 10%. Bug C (Closure): Zest 8.8s / 100%; AFL 5496.25s / 20%.
**Implications:** The payoff surface for CGF-over-PBT is **semantic-stage paths gated by valid structure** — not tokenizers. For micromark specifically (a tokenizer), the Zest evidence suggests AFL-style plain CGF would *outperform* structure-aware CGF on the surface area of interest. PBT that already generates structured markdown (mdast-util-arbitrary / the parent report's fast-check arbitraries) approaches the syntactic ceiling from a different direction.

### Finding: FuzzChick (Coq/QuickChick + CGF) found injected IFC bugs in seconds–minutes where vanilla QuickChick "almost always fails to find any bugs after a long period of time"
**Confidence:** CONFIRMED
**Evidence:** FuzzChick paper: "orders of magnitude" speedup on injected IFC bugs. Throughput penalty: 16,500 tests/sec with instrumentation vs ~82,000 tests/sec for naive random (~4–5× slowdown).
**Implications:** On *deep* logic (IFC machine), CGF signal dominates random generation. Target is a state machine not dissimilar from a parser. BUT: target is also not a tokenizer — instrumented state-aware CGF over a deep logical machine is a different workload than markdown tokenization.

### Finding: Superion (grammar-aware CGF) improved line coverage 16.7%, function coverage 8.8% over AFL, and found 34 bugs where AFL found only 6 in 3 months
**Confidence:** CONFIRMED
**Evidence:** Superion ICSE 2019. Targets included XML parser (libplist) and three JavaScript engines.
**Implications:** Structure-awareness adds ~17% coverage on top of CGF. BUT: this is CGF+grammar vs CGF alone, not CGF vs PBT. Translation: if a JS CGF tool existed with markdown-grammar awareness, it could plausibly outperform plain byte-mutation CGF by a similar margin on micromark.

### Finding: IJON showed plain AFL edge-coverage fails on deep state-space programs, solved by user state annotations (>20× speedup on mazes/Super Mario benchmarks)
**Confidence:** CONFIRMED
**Evidence:** IJON paper (IEEE S&P 2020). 10 of 22 CGC challenges crashed via AFL+IJON.
**Implications:** For state-machine-deep targets, the feedback *signal type* matters more than whether it is CGF or PBT. A micromark fuzzer whose signal is only "bytes executed" may saturate early — suggesting that bolting plain Jazzer.js onto micromark could produce limited marginal gain over PBT on state-space exploration.

### Finding: Coverage saturates quickly; most bugs surface AFTER coverage plateaus
**Confidence:** CONFIRMED
**Evidence:** Liyanage, Böhme et al. ICSE 2023 "Reachable Coverage": most branches are covered in the first 15 min of a multi-hour campaign; >50% of bugs are found in the last two-thirds when coverage has only moved from ~90% to ~94%.
**Implications:** Fuzz campaigns of 10–30 min will report most achievable coverage but miss the majority of findable bugs — which argues against short CI fuzz budgets if bug-finding (not coverage reporting) is the goal.

### Finding: Roughly 36% of OSS-Fuzz projects find a bug in their first session; detection rate stabilizes around 2.19% after ~26 sessions
**Confidence:** CONFIRMED
**Evidence:** arxiv 2510.16433, 1M+ OSS-Fuzz session analysis.
**Implications:** First-contact finds are common; long-tail is thin. On a target with zero known CVEs in the parse hot path (micromark), the first-session expected-bug probability is of order ~36%, with rapidly-diminishing returns per subsequent campaign.

### Finding: NO JS-specific empirical study compares CGF (Jazzer.js) vs PBT (fast-check) on a tokenizer/parser target
**Confidence:** NOT FOUND
**Evidence:** Searched: "Jazzer.js parser empirical", "fast-check vs Jazzer benchmark", "JavaScript fuzzer property-based comparison", "Jazzer.js vs libFuzzer JavaScript benchmark".
**Implications:** All inference about CGF-over-PBT payoff for micromark must extrapolate from C/JVM/Python parser studies. The Babel-AST coverage signal Jazzer.js produces is distinct from native edge coverage, with no published evaluation of its fidelity relative to libFuzzer on a native parser.

---

## Negative searches (for NOT FOUND)

- Searched: "state-pair coverage random vs feedback parser" — IJON addresses annotated CGF vs plain CGF, not CGF vs PBT.
- Searched: "fast-check vs libFuzzer empirical" — no comparative study.
- Searched: "markdown parser fuzzing empirical study" — MdPerfFuzz exists (C-native, different methodology).

---

## Gaps / follow-ups

- Translation-to-JS hazards: (1) Jazzer.js Babel-AST instrumentation may have coarser granularity than native; (2) ESM modules loaded via pure ES paths are NOT instrumented — only CJS `require()`-loaded code is hooked; (3) async throughput is lower than sync per Jazzer.js's own docs.
- The Zest paper's syntax-vs-semantic distinction suggests that for micromark specifically (a tokenizer — almost pure "syntax-stage"), plain CGF's advantage over structure-aware hybrids may be the opposite of what Zest shows on compound parsers. No published data to confirm.
