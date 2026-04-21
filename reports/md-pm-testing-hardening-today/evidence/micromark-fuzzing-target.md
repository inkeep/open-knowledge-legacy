---
name: Coverage-guided fuzzing targeting micromark's state machine
description: Landscape of JS coverage-guided fuzz (CGF) for pure-JS user packages in 2025-2026, with micromark as the concrete target. Covers Jazzer.js ecosystem, state-transition instrumentation pathways, grammar-aware structured mutation, fast-check coverage-feedback hybrids, empirical evidence on CGF vs PBT, and practical harness architecture.
date: 2026-04-19
sources: Jazzer.js GitHub + docs, micromark source, fast-check source + issues, academic papers (Zest, FuzzChick, Superion, IJON, Böhme saturation, MdPerfFuzz), OSS-Fuzz / CIFuzz / ClusterFuzzLite docs, Node worker_threads docs, npm registry
---

# Evidence: Coverage-guided fuzzing targeting micromark

## Key sources referenced

### Tools & primary repos
- [Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js) — only active JS CGF tool; `@jazzer.js/core@4.0.0` shipped 2026-04-15
- [Jazzer.js fuzz-targets docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-targets.md)
- [Jazzer.js fuzz-settings docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md)
- [Jazzer.js jest-integration docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md)
- [Jazzer.js coverageVisitor.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts)
- [Jazzer.js functionHooks.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/functionHooks.ts)
- [Jazzer.js#343 — Vitest support](https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343) — open since 2023-02-23
- [OSS-Fuzz#11652 — Jazzer.js "discontinued"?](https://github.com/google/oss-fuzz/issues/11652) — 2024-02 claim contradicted by 2026 release cadence
- [jsfuzz (archived)](https://github.com/fuzzitdev/jsfuzz), [js-fuzz WIP](https://github.com/connor4312/js-fuzz), [fuzzilli](https://github.com/googleprojectzero/fuzzilli) — competitors inventory
- [micromark](https://github.com/micromark/micromark)
- [micromark-util-types `State` type](https://github.com/micromark/micromark/blob/main/packages/micromark-util-types/index.d.ts)
- [micromark create-tokenizer.js](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/create-tokenizer.js)
- [micromark thematic-break.js](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/thematic-break.js), [code-fenced.js](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/code-fenced.js), [attention.js](https://github.com/micromark/micromark/blob/main/packages/micromark-core-commonmark/dev/lib/attention.js)
- [micromark package.json (test-fuzz disabled)](https://raw.githubusercontent.com/micromark/micromark/main/package.json)
- [mdast-util-arbitrary](https://github.com/ChristianMurphy/mdast-util-arbitrary) / [npm](https://www.npmjs.com/package/mdast-util-arbitrary)
- [mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown) — docs warn "complete roundtripping is impossible"
- [fast-check Parameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/Parameters.ts)
- [fast-check RandomGenerator.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/random/generator/RandomGenerator.ts)
- [fast-check#3399 — "accepted feature" test-case database](https://github.com/dubzzz/fast-check/issues/3399), [#6190 Tyche/OpenPBTStats](https://github.com/dubzzz/fast-check/issues/6190), [#6290 bias control](https://github.com/dubzzz/fast-check/issues/6290)
- [HypoFuzz](https://github.com/Zac-HD/hypofuzz) — architectural analog in Python
- [IJON repo](https://github.com/RUB-SysSec/ijon) — state-annotation pattern
- [MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz) — ASE '21, C/C++/Python only

### Academic papers (with DOI / arxiv)
- [Zest (Padhye et al., ISSTA 2019)](https://doi.org/10.1145/3293882.3330576) / [arxiv 1812.00078](https://arxiv.org/abs/1812.00078)
- [FuzzChick (Lampropoulos et al., OOPSLA 2019)](https://doi.org/10.1145/3360607)
- [Targeted PBT (Löscher & Sagonas, ISSTA 2017)](https://doi.org/10.1145/3092703.3092711)
- [Superion (Wang et al., ICSE 2019)](https://doi.org/10.1109/ICSE.2019.00081) / [arxiv 1812.01197](https://arxiv.org/abs/1812.01197)
- [IJON (Aschermann et al., IEEE S&P 2020)](https://ieeexplore.ieee.org/abstract/document/9152719)
- [Reachable Coverage (Liyanage, Böhme et al., ICSE 2023)](https://doi.org/10.1109/ICSE48619.2023.00117)
- [MdPerfFuzz (Chen et al., ASE 2021)](https://dl.acm.org/doi/abs/10.1109/ASE51524.2021.9678611)
- [OSS-Fuzz large-scale study](https://arxiv.org/html/2510.16433)

### Infrastructure
- [LLVM libFuzzer docs](https://llvm.org/docs/LibFuzzer.html) — `-max_len`, `-max_total_time`, `-merge`
- [Node worker_threads](https://nodejs.org/api/worker_threads.html) — `resourceLimits`, `maxOldGenerationSizeMb`, `stackSizeMb`, `worker.terminate()`
- [Piscina](https://github.com/piscinajs/piscina) — worker pool with resource limits + AbortController
- [OSS-Fuzz CIFuzz](https://google.github.io/oss-fuzz/getting-started/continuous-integration/) — PR-only, 600s default, 21600s max
- [ClusterFuzzLite](https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/) — JavaScript NOT in supported-language list
- [protobuf.js CVE-2023-36665](https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665) — only public Jazzer.js parser find

## Findings

### Finding: Jazzer.js is the only actively-maintained CGF for pure-JS user packages
**Confidence:** CONFIRMED
**Evidence:** npm registry `time["4.0.0"]` confirms 2026-04-15 ship date for `@jazzer.js/core@4.0.0`. GitHub repo `archived: false`; `pushed_at: 2026-04-16T23:32:31Z`. Weekly downloads week of 2026-04-12: 1,486.

Competitors inventory:
```
fuzzitdev/jsfuzz     — archived 2021-04-30; last npm release 2021-01-09
connor4312/js-fuzz   — 133 stars; no npm publication; README: "still WIP... not suitable for real use"
googleprojectzero/fuzzilli — active but targets V8/JSC/SpiderMonkey/Duktape engines, not npm user packages
```

**Implications:** Any CGF adoption is a single-vendor bet on Code Intelligence's continued OSS investment.

### Finding: OSS-Fuzz discontinuation claim vs 2026 release cadence — unresolved support signal
**Confidence:** CONFIRMED (both sides)
**Evidence:** [OSS-Fuzz issue #11652](https://github.com/google/oss-fuzz/issues/11652), opened 2024-02, claims "jazzer.js has been discontinued as open source." Contradicted by:
- v4.0.0 npm publication 2026-04-15
- Repo not archived; active commits through 2026-04-16
- OSS-Fuzz's own [JS onboarding docs](https://google.github.io/oss-fuzz/getting-started/new-project-guide/javascript-lang/) continue to direct users to Jazzer.js
- No archive flag or deprecation banner on repo

**Remaining uncertainty:** No statement from Code Intelligence resolves the ambiguity. De-facto evidence (commits, releases, downloads) overrides the 2024 claim but long-term maintenance trajectory is unclear.

### Finding: micromark's `State = (code: Code) => State | undefined` is uniquely instrumentable
**Confidence:** CONFIRMED
**Evidence:** From `micromark-util-types/index.d.ts` commit `774a70c`:
```typescript
export type State = (code: Code) => State | undefined
export type Code = number | null
```

The driver in `create-tokenizer.js` reassigns `state = state(code)` in a loop. Core CommonMark constructs under `micromark-core-commonmark/dev/lib/` expose 2–13 named state functions each:
- `thematic-break.js`: 4 states (start, before, atBreak, sequence)
- `code-fenced.js`: ~13 states
- `attention.js`: 2 states + `resolveAll` post-pass

Total across 22 constructs: ~100–200 state functions.

### Finding: Standard JS coverage tools cannot express state-transition coverage
**Confidence:** CONFIRMED
**Evidence:**
- [V8 `Profiler.takePreciseCoverage`](https://v8.dev/blog/javascript-code-coverage): per-function source ranges + execution counts — records entry, not caller
- c8 wraps `NODE_V8_COVERAGE`; nyc uses Istanbul AST instrumentation — statements/branches/functions/lines at same granularity
- Jazzer.js Babel instrumentation ([coverageVisitor.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts)) inserts counters at intra-function AST edges: `IfStatement`, `SwitchCase`, loops, `TryStatement`, `LogicalExpression`, `ConditionalExpression`. `state = state(code)` is an indirect call whose target is not a statically-visible branch.

**Implication:** `start → inside → inside` and `start → inside` produce identical edge-coverage bitmaps.

### Finding: IJON-style state annotation has no JS port
**Confidence:** CONFIRMED (negative)
**Evidence:** [IJON](https://github.com/RUB-SysSec/ijon) (Aschermann et al., IEEE S&P 2020) introduced C/C++ primitives `IJON_STATE`, `IJON_SET`, `IJON_INC` that XOR state values into AFL's coverage bitmap. Reports >20× speedup on the maze benchmark specifically ("all but 3 levels solved in minutes"). Super Mario is qualitative only ("AFL becomes quite capable to play Super Mario Bros when exposing a single variable"). Crashes on 10 of 22 CGC challenges.

Searched: "IJON JavaScript", "state transition coverage JavaScript", "Jazzer.js state annotation" → no results. Confirmed negative.

### Finding: Three feasibility pathways for JS state-transition instrumentation
**Confidence:** INFERRED (mapping existing primitives; not implemented)

| Pathway | Primitive | Cost | Source for precedent |
|---|---|---|---|
| Runtime Proxy wrap | `new Proxy(nextFn, handlers)` around `State` return | Lowest — no source mod, no build toolchain | Native ES spec; Jazzer.js has no custom-mutator hook but Proxy works on state-return path |
| Babel plugin cloning functionHooks | Match state-shaped functions, emit `__recordTransition()` | Medium — plugin + config | [functionHooks.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/functionHooks.ts) demonstrates pattern |
| V8 Inspector `Debugger.setBreakpoint` | CDP events on state function entry | Highest — CDP overhead | [v8.dev code coverage](https://v8.dev/blog/javascript-code-coverage) |

### Finding: Grammar-aware structured mutation has no JS implementation for markdown
**Confidence:** CONFIRMED (negative)
**Evidence:** Native frameworks surveyed, all language-incompatible with JS markdown target:

| Framework | Language | Grammar | Markdown target? |
|---|---|---|---|
| [Grammarinator](https://github.com/renatahodovan/grammarinator) | Python+C++ | ANTLR v4 | No |
| [Nautilus](https://github.com/nautilus-fuzz/nautilus) | Rust+Python | Python CFG | Fuzzes JS engines, not markdown |
| [FormatFuzzer](https://github.com/uds-se/FormatFuzzer) | C++ | 010 Editor `.bt` | Binary only |
| [Dharma](https://github.com/MozillaSecurity/dharma) | Python | Custom `.dg` | Generator-only, language-agnostic |
| [Domato](https://github.com/googleprojectzero/domato) | Python | Custom CFG | DOM/JS/HTML, not markdown |

Three mutation granularities with wildly different JS tooling:

| Level | JS tooling |
|---|---|
| String/bytes | Jazzer.js `FuzzedDataProvider` + fast-check `fc.string()` — well-supported |
| micromark token stream | **NOT FOUND** — no published library |
| mdast AST | `mdast-util-from-markdown` + `mdast-util-to-markdown` + [`mdast-util-arbitrary`](https://github.com/ChristianMurphy/mdast-util-arbitrary) — but oracle-fragile due to non-lossless roundtrip |

### Finding: mdast roundtrip is non-lossless by documented design
**Confidence:** CONFIRMED
**Evidence:** [`mdast-util-to-markdown`](https://github.com/syntax-tree/mdast-util-to-markdown) README: *"there are several cases where that is impossible... complete roundtripping is impossible given that any value could be injected into the tree."*

**Implication:** An AST-level fuzzer running `parse → mutate → serialize → re-parse → compare` will produce false-positive divergences unrelated to real bugs.

### Finding: `mdast-util-arbitrary` is the only structured markdown generator in JS — ~40 weekly downloads
**Confidence:** CONFIRMED
**Evidence:** [npm page](https://www.npmjs.com/package/mdast-util-arbitrary) reports ~40 weekly downloads (unifiedjs.com listing). Authored by ChristianMurphy as individual contributor, not the syntax-tree org. It is a fast-check *generator* (`commonmark().Root`), not a mutator — no coverage-feedback path.

### Finding: micromark's own project currently has fuzz testing DISABLED
**Confidence:** CONFIRMED
**Evidence:** [micromark/package.json on main](https://raw.githubusercontent.com/micromark/micromark/main/package.json):
```json
"#": "fuzzer turned off for now as jazzer is unmaintained, with sec vulns",
"#test-fuzz": "..."
```
Reference is to JVM Jazzer (historically), not Jazzer.js. Regardless, the upstream project is not currently fuzzing itself.

### Finding: fast-check has no coverage-feedback API; maintainer flagged it "accepted feature" in 2022
**Confidence:** CONFIRMED
**Evidence:** [Parameters.ts on main](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/Parameters.ts) enumerates all runner options. No field observes coverage; no method ingests feedback.

[Issue #3399 "Hypothesis-like test case database"](https://github.com/dubzzz/fast-check/issues/3399), opened 2022-11-10. dubzzz comment 2022-12-18: *"a version not based on a seed would be hardly feasible as fast-check can generate a wide range of items... I'm flagging it as 'accepted feature' as it may be worthy to think about it for future iterations."* **Still open 2026-04.**

[Issue #6190 "Tyche/OpenPBTStats support"](https://github.com/dubzzz/fast-check/issues/6190), 2025-09-23. Proposed schema includes literal `"coverage": "no_coverage_info"` field — observability scaffolding only, not feedback.

[PR #4012 "Fuzzed string"](https://github.com/dubzzz/fast-check/pull/4012) — a new arbitrary, not CGF integration.

### Finding: Primitives fast-check exposes that could host a CGF integration
**Confidence:** INFERRED (mapping primitives; not implemented)
**Evidence:**

| Primitive | Contract | CGF use |
|---|---|---|
| `randomType: (seed) => RandomGenerator` | `{ clone, next, jump?, getState }` returning 32-bit ints | Pack Jazzer.js `Buffer` as PRNG source for deterministic structured decoding |
| `examples: T[]` | Insert known values at run start | Corpus insertion point for fuzz-derived seeds |
| `seed` + `path` | Replay deterministically | Crash reproduction |
| `reporter` / `asyncReporter` | Post-run hook | External coverage-delta computation |

Missing: mutation hook on generated values; scalar-feedback analog of `hypothesis.target()`; runtime-adjustable weights in `fc.oneof`; test-case database (#3399 still open).

### Finding: Zest (ISSTA 2019) — CGF gains concentrate on semantic, not syntactic stages
**Confidence:** CONFIRMED
**Evidence:** [Zest paper](https://doi.org/10.1145/3293882.3330576) ran 3-hour campaigns × 20 repetitions across five Java parsers/compilers (Maven, Ant, BCEL, Closure, Rhino). Results:

| Comparison | Zest vs baseline |
|---|---|
| Semantic-stage branch coverage | **Zest wins 1.03× (Rhino) to 2.81× (Maven)** |
| Syntactic-stage coverage | **AFL wins 1.1× to 1.6×** |
| Semantic bugs found | Zest: 10; AFL: 5 of those 10; QuickCheck: 8 of 10 with 5-10% reliability |
| Additional syntactic bugs | AFL found 10 Zest missed (3 Maven, 6 BCEL, 1 Rhino) |
| MTTF Bug B (Ant) | Zest 99.45s / 100% reliable; AFL 6369.5s / 10% reliable |
| MTTF Bug C (Closure) | Zest 8.8s; AFL 5496.25s |

**Implication for micromark:** micromark is overwhelmingly a tokenizer (syntactic stage). Expected CGF-over-PBT gain is modest; plain AFL-style byte mutation may beat structure-aware generation on this workload.

### Finding: FuzzChick (OOPSLA 2019) — orders-of-magnitude gain on deep-logic state machines
**Confidence:** CONFIRMED
**Evidence:** [FuzzChick paper](https://doi.org/10.1145/3360607): *"vanilla QuickChick almost always fails to find any bugs after a long period of time, while FuzzChick often finds them within seconds to minutes"* on a Coq IFC machine (>10k LoC). Throughput cost: ~4-5× (16,500 tests/sec instrumented vs ~82,000 vanilla).

**Implication:** Gain pattern does not transfer directly to micromark — IFC machine is a deep-logic state machine, not a tokenizer.

### Finding: Superion (ICSE 2019) — grammar-awareness adds ~17% coverage over plain AFL
**Confidence:** CONFIRMED
**Evidence:** [Superion paper](https://doi.org/10.1109/ICSE.2019.00081) on XML (libplist) and three JS engines: +16.7% line coverage, +8.8% function coverage over AFL; 34 bugs found vs AFL's 6 in 3 months.

**Implication:** If a grammar-aware JS CGF tool existed for markdown, it could plausibly add ~17% coverage over plain Jazzer.js. No such tool exists (per finding above).

### Finding: IJON (S&P 2020) — plain edge coverage FAILS on deep state spaces
**Confidence:** CONFIRMED
**Evidence:** [IJON repo](https://github.com/RUB-SysSec/ijon) demonstrates that plain edge-coverage CGF cannot solve mazes, Super Mario, or many CGC challenges. With one-line `IJON_STATE` annotations: >20× AFL speedup, crashes 10 of 22 CGC challenges.

**Implication:** Without transition-coverage instrumentation (see feasibility pathways above), plain Jazzer.js edge feedback may saturate early on micromark state-entry coverage without exploring the state-pair space. Echoes the "tokenizer-stage ceiling" in Zest.

### Finding: Böhme et al. (ICSE 2023) — coverage saturates fast; bugs found after saturation
**Confidence:** CONFIRMED
**Evidence:** [Reachable Coverage paper](https://doi.org/10.1109/ICSE48619.2023.00117): branch coverage saturates such that "increasing the number of generated test inputs by one order of magnitude does not change coverage anymore." 100% reachable coverage typically reached before 10^6 inputs. **Most branches covered in 23 hours are covered in the first 15 minutes.** However, **>50% of bugs are found in the last two-thirds of the campaign** when coverage has moved from ~90% to ~94%.

**Implication:** Campaign-length decisions depend on whether the goal is coverage (minutes) or bug discovery (hours). Bug discovery decouples from coverage after saturation.

### Finding: OSS-Fuzz large-scale — first-contact bugs dominate; long-tail is thin
**Confidence:** CONFIRMED
**Evidence:** [OSS-Fuzz study](https://arxiv.org/html/2510.16433): ~36% of projects find a bug in the first session; detection rate drops below 5% by session 26, stabilizing near 2.19%.

### Finding: Translation-to-JS hazards
**Confidence:** CONFIRMED
**Evidence:**
1. Jazzer.js uses Babel-AST source rewrites, not native edge instrumentation — no published signal-fidelity study
2. Jazzer.js maintenance status ambiguous (OSS-Fuzz#11652)
3. ESM modules loaded via pure ES paths are NOT instrumented; only CommonJS `require()`-loaded code is hooked. **micromark publishes as ESM.**
4. Async throughput is lower than sync per [Jazzer.js fuzz-settings](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md); no quantified overhead published
5. Only public Jazzer.js parser find: [protobuf.js CVE-2023-36665](https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665). **NOT FOUND:** any published JS-specific empirical CGF vs PBT study on a tokenizer.

### Finding: Minimum-viable harness is ~10 lines; CI glue is the real cost
**Confidence:** CONFIRMED
**Evidence:** From [Jazzer.js fuzz-targets docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-targets.md):

```js
const { FuzzedDataProvider } = require("@jazzer.js/core");
const { micromark } = require("micromark");

module.exports.fuzz = function (fuzzerInputData /* Buffer */) {
    micromark(fuzzerInputData.toString("utf-8"));
};
```

CLI per [fuzz-settings.md](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md):
```bash
npx jazzer fuzz-target ./corpus -- -max_len=512000 -max_total_time=1800
```

500KB cap traces to [micromark README Safety section](https://github.com/micromark/micromark#safety): *"cap the accepted size of input (500kb can hold a big book) and to process content in a different thread or worker."*

Crash directories per [jest-integration.md](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md): `./[testFileName]/[describeBlock]/[testName]/`. Corpus: `./.cifuzz-corpus/[testFileName]/[describeBlock]/[testName]/`. `JAZZER_FUZZ=1` enables fuzz mode; default is regression replay.

### Finding: JavaScript not in ClusterFuzzLite supported-language list
**Confidence:** CONFIRMED (negative)
**Evidence:** [ClusterFuzzLite GitHub Actions docs](https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/) lists supported languages: C, C++, Java, Go, Swift, Python, Rust. **JavaScript is absent.** Any Jazzer.js CI workflow must be hand-rolled. NOT FOUND: a published GitHub Action wrapping Jazzer.js.

### Finding: Jazzer.js integration points — Jest first-class; Bun and Vitest not supported
**Confidence:** CONFIRMED
**Evidence:**
- [`@jazzer.js/jest-runner`](https://github.com/CodeIntelligenceTesting/jazzer.js/tree/main/packages/jest-runner) ships with official support
- [Jazzer.js#343 "Vitest support"](https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343) — open since 2023-02-23
- Bun support: not documented; libFuzzer native addon compatibility with Bun runtime NOT FOUND in primary sources

### Finding: Worker-thread isolation is composable from Node primitives
**Confidence:** CONFIRMED
**Evidence:** [Node worker_threads docs](https://nodejs.org/api/worker_threads.html) expose `resourceLimits`:
- `maxOldGenerationSizeMb` — main heap cap; reaching it terminates the worker
- `maxYoungGenerationSizeMb` — semi-space cap
- `stackSizeMb` — default 4 MB
- `worker.terminate()` — forceful stop, returns promise

```js
const worker = new Worker('./script.js', {
  resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 128, stackSizeMb: 4 }
});
const timeout = setTimeout(() => worker.terminate(), 5000);
worker.on('exit', () => clearTimeout(timeout));
```

[Piscina](https://github.com/piscinajs/piscina) supports the same `resourceLimits` plus `AbortController`-based cancellation. **Piscina docs do not mention fuzzing** — no combined Jazzer.js + worker-thread pattern documented.

## Negative searches

- Searched "IJON JavaScript" / "state transition coverage JavaScript" / "Jazzer.js state annotation" — no results
- Searched "fast-check Jazzer.js" bridge — no results; no published harness
- Searched published JS-specific empirical CGF vs PBT study on a tokenizer — no results
- Searched micromark-it / marked / remark in OSS-Fuzz or CGF track record — not onboarded to OSS-Fuzz
- Searched for Bun compatibility of `@jazzer.js/core` libFuzzer native addon — not documented

## Gaps / follow-ups

- Signal fidelity of Babel-instrumented coverage vs native libFuzzer — unknown without empirical comparison
- Actual count of reachable transition pairs on CommonMark 0.31 spec test suite — unpublished
- Whether libFuzzer's byte mutator produces useful variation after fast-check structured decoding — unevaluated
- OSS-Fuzz#11652 "discontinued" vs 2026 release cadence — no statement from Code Intelligence resolves
- MdPerfFuzz (ASE '21) full parser test list — primary PDF returned ECONNREFUSED; conference pages confirm 216 bugs found but don't enumerate targets
