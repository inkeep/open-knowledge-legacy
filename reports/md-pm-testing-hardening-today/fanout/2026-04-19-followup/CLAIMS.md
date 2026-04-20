# Claims Inventory — Followup Run 2026-04-19

**Scope:** Two sub-research passes enriching the parent REPORT.md (initial pass 2026-04-19-initial).

**Consolidation method:** Consolidation child died when session was resumed; recovery performed inline by parent agent reading both sub-reports + evidence files directly, then surgically enriching parent REPORT.md.

---

## Sub-reports consolidated

| Sub-report | Path | Size | Depth label |
|---|---|---|---|
| FU1 — Stryker-bun-runner vs vitest-migration economics | `fanout/2026-04-19-followup/stryker-bun-vs-vitest-economics/REPORT.md` | 17.7K | Moderate |
| FU2 — Coverage-guided fuzzing on micromark | `fanout/2026-04-19-followup/micromark-fuzzing-target/REPORT.md` | 46.8K | Deep |

---

## Claims added to parent REPORT.md

### New top-level structure
- **3 new Exec Summary findings** (numbered 12, 13, 14) appended AFTER existing #11; existing 1-11 unchanged
- **1 new Rubric row** (V — Followup: Economics + Fuzzing as PBT Complement)
- **1 new subsection I.6** (Economics: bun-runner vs vitest-migration vs command runner) after I.5, before Part II header
- **1 new subsection IV.8** (Coverage-guided fuzzing as a complement to PBT) after IV.7, before Cross-Cutting Synthesis
- **2 new Cross-Cutting Synthesis themes** (E, F) added to existing A-D
- **1 new Conflicts & Disagreements item** documenting the `perTest` support contradiction (Exec Summary #13)
- **2 new evidence files** in parent `evidence/`: `stryker-bun-vs-vitest-economics.md`, `micromark-fuzzing-target.md`

### Existing content preserved (NOT renumbered, NOT reorganized)
- Exec Summary #1 through #11 (unchanged)
- All of Parts I.1-I.5 (unchanged)
- All of Part II, Part III, Part IV subsections (unchanged)
- Cross-Cutting Synthesis themes A-D (unchanged)
- Conflicts & Disagreements three bullet-point tensions (preserved; expanded with one new coverage-guided-fuzzing tension)
- Appendix A and B (unchanged)
- References section (unchanged — new evidence files link from their originating sections)

---

## Primary claims per sub-report

### FU1 — Stryker-bun-runner vs vitest-migration economics

| # | Claim | Confidence | Source |
|---|---|---|---|
| 1 | Stryker's `perTest` vs `all` delta is 40-60% (1.7-2.5×), not order-of-magnitude | CONFIRMED | [Stryker docs](https://stryker-mutator.io/docs/stryker-js/configuration/), [2018 TS-runner blog](https://stryker-mutator.io/blog/announcing-faster-typescript-checking/) |
| 2 | Sentry's 2024 Jest→vitest-runner swap on TS SDK package: 60min → 25min (2.4×) on a single package | CONFIRMED | [Sentry engineering blog Aug 2024](https://sentry.engineering/blog/js-mutation-testing-our-sdks) |
| 3 | `stryker-mutator-bun-runner` has 4,390 monthly / 2,615 weekly npm downloads as of 2026-04-19; solo maintainer; 5 stars; 29 commits; no GitHub Releases | CONFIRMED | npm registry API, GitHub API |
| 4 | Contradiction: parent stated plugin uses `coverageAnalysis: "off"`; issue #5424 claims `perTest` support | UNRESOLVED | [stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) |
| 5 | Bun test is 3-10× faster than vitest on pure-logic TS benchmarks | CONFIRMED (single source) | [PkgPulse 2026](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026) |
| 6 | bun → vitest migration effort on ~4000 LOC parser test suite: 0.5-3 person-days | INFERRED | Vitest migration guide + Bun API compat reading |
| 7 | Option 3b (bun primary + vitest only inside Stryker) is standard practice, not escape hatch | CONFIRMED | Sentry + OneUpTime blog posts |
| 8 | No community precedent for maintaining parallel `.stryker.test.ts` test files | CONFIRMED (negative) | GitHub search |

### FU2 — Coverage-guided fuzzing on micromark

| # | Claim | Confidence | Source |
|---|---|---|---|
| 9 | Jazzer.js is the only actively-maintained CGF for pure-JS user packages; `@jazzer.js/core@4.0.0` shipped 2026-04-15 | CONFIRMED | npm registry, GitHub API |
| 10 | jsfuzz is archived (2021-04-30); js-fuzz is WIP and never npm-published; fuzzilli targets engine internals not npm packages | CONFIRMED | GitHub repos directly |
| 11 | OSS-Fuzz#11652 (2024-02) claims Jazzer.js "discontinued as open source" — contradicted by 2026 release cadence, no archive flag, no deprecation banner | CONFIRMED (both sides) | [OSS-Fuzz#11652](https://github.com/google/oss-fuzz/issues/11652) |
| 12 | micromark's `State = (code: Code) => State \| undefined` type + reassignable `state = state(code)` driver pattern exposes ~100-200 named state functions across 22 CommonMark constructs | CONFIRMED | [micromark-util-types](https://github.com/micromark/micromark/blob/main/packages/micromark-util-types/index.d.ts), per-construct files |
| 13 | No JS coverage tool (c8, nyc, V8 Inspector, Jazzer.js Babel) captures (from-state, to-state) edges; `state = state(code)` is indirect and not statically visible | CONFIRMED | [coverageVisitor.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts), V8 docs, c8/nyc |
| 14 | IJON (S&P 2020) transition-annotation pattern has no JS port | CONFIRMED (negative) | [IJON repo](https://github.com/RUB-SysSec/ijon) + search |
| 15 | Three feasibility pathways for JS state-transition instrumentation: runtime Proxy (cheapest), Babel plugin cloning functionHooks, V8 Inspector breakpoints | INFERRED | Maps to existing Jazzer.js + ES primitives |
| 16 | mdast-util-to-markdown explicitly documents "complete roundtripping is impossible" | CONFIRMED | [README](https://github.com/syntax-tree/mdast-util-to-markdown) |
| 17 | `mdast-util-arbitrary` is only published structured mdast generator in JS; ~40 weekly downloads; individual author | CONFIRMED | [npm](https://www.npmjs.com/package/mdast-util-arbitrary) |
| 18 | micromark's own `package.json` has fuzz testing DISABLED with comment "jazzer is unmaintained, with sec vulns" (reference to JVM Jazzer) | CONFIRMED | [micromark/package.json](https://raw.githubusercontent.com/micromark/micromark/main/package.json) |
| 19 | fast-check has no coverage-feedback API; dubzzz flagged test-case database "accepted feature" in 2022, still open | CONFIRMED | [Parameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/Parameters.ts), [#3399](https://github.com/dubzzz/fast-check/issues/3399) |
| 20 | `randomType: (seed) => RandomGenerator` + `examples` + `reporter` primitives could host a Jazzer.js integration as structured decoder | INFERRED | fast-check source; no implementation precedent |
| 21 | Zest (ISSTA 2019): CGF wins 1.03-2.81× on semantic coverage, loses 1.1-1.6× on syntactic/tokenizer coverage; AFL found 10 syntactic bugs Zest missed | CONFIRMED | [DOI 10.1145/3293882.3330576](https://doi.org/10.1145/3293882.3330576) |
| 22 | FuzzChick (OOPSLA 2019): orders-of-magnitude CGF gain on Coq IFC machine; 4-5× throughput cost | CONFIRMED | [DOI 10.1145/3360607](https://doi.org/10.1145/3360607) |
| 23 | Superion (ICSE 2019): grammar-awareness adds +16.7% line coverage, +8.8% function coverage over plain AFL | CONFIRMED | [DOI 10.1109/ICSE.2019.00081](https://doi.org/10.1109/ICSE.2019.00081) |
| 24 | IJON (S&P 2020): plain edge coverage FAILS on deep state spaces without annotations | CONFIRMED | [IEEE 9152719](https://ieeexplore.ieee.org/abstract/document/9152719) |
| 25 | Böhme et al. ICSE 2023: most branches covered in first 15 min of 23h campaigns; >50% of bugs found after saturation | CONFIRMED | [DOI 10.1109/ICSE48619.2023.00117](https://doi.org/10.1109/ICSE48619.2023.00117) |
| 26 | Only disclosed Jazzer.js parser find publicly: protobuf.js CVE-2023-36665 | CONFIRMED | [Code Intelligence blog](https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665) |
| 27 | JavaScript not in ClusterFuzzLite supported-language list | CONFIRMED (negative) | [ClusterFuzzLite docs](https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/) |
| 28 | Jazzer.js has no Bun support (undocumented); Vitest integration open since 2023-02-23 | CONFIRMED | [#343](https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343) |

---

## Contradictions resolved or flagged

### Flagged but unresolved
- **Claim #4 (FU1):** `stryker-mutator-bun-runner` `coverageAnalysis` support. Parent says "off," upstream issue says "perTest." Cannot resolve without reading plugin source. Flagged in Exec Summary #13 of parent REPORT.md AND in Conflicts & Disagreements section. Single highest-leverage open question for anyone choosing Option 1 in §I.6.

### Flagged, preserved dual-sided
- **Claim #11 (FU2):** Jazzer.js "discontinued" per OSS-Fuzz 2024 vs active 2026 release cadence. No statement from Code Intelligence resolves. Flagged in Exec Summary #14 and §IV.8; de-facto evidence (commits, releases, downloads) preferred but long-term trajectory unclear.

### None silently overwritten
- Parent #1 ("perTest is the largest multiplier") was *softened* in §I.6 with measured numbers (1.7-2.5×, not order-of-magnitude). Original framing preserved in Exec Summary #1 with a cross-reference; §I.6 provides the refined evidence. Reader can see both.

---

## Evidence provenance

- FU1's 4 evidence files (pertest-speedup-benchmarks.md, stryker-bun-runner-reality.md, bun-vitest-migration-compat.md, hybrid-ci-patterns.md) consolidated into parent `evidence/stryker-bun-vs-vitest-economics.md`
- FU2's 6 evidence files (FU2.1-js-cgf-ecosystem, FU2.2-micromark-state-machine-instrumentation, FU2.3-grammar-aware-mutation, FU2.4-fast-check-coverage-hybrid, FU2.5-payoff-vs-pbt, FU2.6-harness-architecture) consolidated into parent `evidence/micromark-fuzzing-target.md`

Sub-report directories preserved at `fanout/2026-04-19-followup/` for auditability.
