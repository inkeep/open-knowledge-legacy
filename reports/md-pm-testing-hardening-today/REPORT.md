---
title: "Hardening a TypeScript unified/remark md ↔ ProseMirror Pipeline Today — Testing Techniques and Edge-Case Corpora, 2026-04"
description: "Factual landscape of four testing-hardening techniques available to a TypeScript markdown ↔ ProseMirror pipeline in April 2026: mutation testing via Stryker-js + fast-check, differential testing within the JS markdown parser ecosystem, whitespace/BOM/line-ending/tab edge-case coverage, and pathological-input + cross-parser divergence corpora. Includes a 28-vector whitespace test corpus and a 59-snippet cross-parser divergence corpus suitable for lift-and-shift into fixture files."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - Stryker-js
  - fast-check
  - TypeScript
  - unified
  - remark
  - micromark
  - markdown-it
  - marked
  - commonmark.js
  - CommonMark
  - GFM
  - Babelmark3
  - mdast
topics:
  - mutation testing
  - property-based testing
  - differential testing
  - markdown parser security
  - whitespace edge cases
  - round-trip idempotence
  - cross-parser divergence
  - test fixture corpus
  - CI cost control
---

# Hardening a TypeScript unified/remark md ↔ ProseMirror Pipeline Today

**Purpose:** Describe what a TypeScript markdown ↔ ProseMirror pipeline using unified/remark/micromark and fast-check property-based oracles can do **today** to surface latent correctness and security bugs — without waiting for the future Rust migration. Four dimensions are in scope: mutation testing, differential testing inside the pure-JS parser ecosystem, whitespace/BOM/line-ending/tab edge-case coverage, and pathological-input + cross-parser divergence corpora. The report is a factual landscape — layout of options with tradeoffs, not recommendations.

---

## Executive Summary

Four testing-hardening techniques are available to a TypeScript markdown ↔ ProseMirror pipeline in 2026-04. Their combined signal surfaces latent bugs — correctness, security, and round-trip fidelity — that the current identity-oracle test stack cannot reach.

**1. Mutation testing via Stryker-js composes with fast-check but has an ecosystem gap around bun.** Stryker-js (v9.6.1, 2026-04-10) is actively maintained, mature, and the dominant JS/TS mutation-testing tool. No first-party bun test runner exists: three open GitHub items ([#4439](https://github.com/stryker-mutator/stryker-js/issues/4439), [#5424](https://github.com/stryker-mutator/stryker-js/issues/5424), [PR #5931](https://github.com/stryker-mutator/stryker-js/pull/5931)) track the gap, blocked on Bun's lack of a programmatic test-runner API ([oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191), closed as duplicate 2026-01-21). Available paths: community [`stryker-mutator-bun-runner@0.4.0`](https://www.npmjs.com/package/stryker-mutator-bun-runner) (single maintainer, implements `coverageAnalysis: "perTest"` via a generated `__stryker__` preload hook that wraps `test`/`it` globals + a `TestFilter` that passes covering-test regex patterns to Bun; see Finding #13 for source-read details), default command runner (full-suite-per-mutant), or migration to vitest/jest runners.

**2. fast-check determinism requires explicit seed pinning under Stryker.** Stryker does not re-seed fast-check between mutants; pure-rand is deterministic given an explicit seed but defaults to `Date.now() ^ Math.random()`. Un-pinned seeds produce mutant-label flakiness — a mutant can flip between `survived` and `killed` across runs. One Vitest-specific bug ([stryker-js#5714](https://github.com/stryker-mutator/stryker-js/issues/5714)) was fixed 2026-01-30.

**3. Differential testing across pure-JS markdown parsers is an empty space in the ecosystem.** No public GitHub repository runs ≥2 JS markdown parsers against shared inputs for equivalence assertion, based on multi-query searches. Each parser ([remark-parse](https://github.com/remarkjs/remark), [markdown-it](https://github.com/markdown-it/markdown-it), [micromark](https://github.com/micromark/micromark), [marked](https://github.com/markedjs/marked), [commonmark.js](https://github.com/commonmark/commonmark.js)) independently validates against the CommonMark spec corpus, but none cross-check each other. Building blocks are all production-quality and npm-installable — the missing piece is the ~200-line coupling layer.

**4. Parsers do not share an AST dialect.** remark and micromark use mdast (unist-based tree); markdown-it emits a flat token stream; marked and commonmark.js have their own formats. AST-to-AST comparison is only viable within the remark/micromark/commonmark.js cluster without writing translation shims. Normalized HTML (via [`markedjs/html-differ`](https://github.com/markedjs/html-differ)) is the canonical oracle even inside the CommonMark reference parsers themselves.

**5. CommonMark is silent on BOM (U+FEFF).** `micromark` strips a single leading BOM when the input is a string; mid-text BOMs survive in string mode but are stripped automatically when input is a stream routed through `TextDecoder` — same parser, same input, mode-dependent output. `js-yaml` preserves BOM in keys and values and has refused to strip since [issue #179](https://github.com/nodeca/js-yaml/issues/179) closed `wontfix` in 2015. A double-BOM from file concatenation pushes frontmatter fences off column 1 and silently breaks detection. markdown-it, marked, and commonmark.js preserve BOM in all positions.

**6. Byte-level CRLF round-trip is architecturally impossible under the default unified/remark stack.** CommonMark §2.1 treats LF, CR, and CRLF as equivalent. micromark preserves distinct tokenizer codes, but the `mdast` tree exposes no distinction, and `remark-stringify` emits LF only. The load-bearing evidence is `mdast-util-to-markdown`'s absence of a `lineEnding` / `eol` configuration option; [remark#660](https://github.com/remarkjs/remark/issues/660) ("Remark replaces CRLF with LF on Windows") was closed with the `🙅 no/wontfix` label, corroborating the architectural constraint without by itself documenting a maintainer intent statement.

**7. SKIP_SECTIONS on Tabs and Indented code blocks has a concrete architectural cause.** `mdast-util-to-markdown` defaults `fences: true` — every indented code block round-trips as fenced output. Compounding: micromark discards the column-offset context needed to reconstruct original tab/space layouts before the AST is emitted. AST-equivalence tests (parse-stringify-parse ≡ parse) pass for these sections; byte-identity tests cannot.

**8. ReDoS dominates published JS markdown CVEs (9 of 20, 2020+).** `marked` and `markdown-it` carry concrete published reproducer payloads (e.g., `marked.parse(\`[x]:${' '.repeat(1500)}x ${' '.repeat(1500)} x\`)` for [CVE-2022-21680](https://github.com/markedjs/marked/security/advisories/GHSA-rrrm-qjm4-v8hf)). `micromark` and `remark` parser cores have zero direct CVEs because state-machine tokenization does not use backtracking regexes in the parse hot path. Risk concentrates in the plugin layer: `remark-html` shipped with [CVSS 10.0 unsafe defaults](https://github.com/advisories/GHSA-9q5w-79cv-947m) through late 2021; `mdast-util-to-hast` had a [class-attribute injection CVE](https://github.com/advisories/GHSA-4fh9-h7wg-q85m) as recently as Dec 2025; DOMPurify accumulated [four 2024–2026 advisories](https://github.com/cure53/DOMPurify/security/advisories).

**9. Deep-nesting crashes happen at single-digit-KB inputs for every major parser, but only markdown-it ships a `maxNesting` knob.** `marked(">".repeat(5000))` crashes Node at ~5 KB ([marked#1462](https://github.com/markedjs/marked/issues/1462)). `parseMarkdown("[](".repeat(35000))` crashes via `unravelLinkedTokens` post-processor recursion ([micromark#20](https://github.com/micromark/micromark/issues/20)). micromark's README explicitly recommends capping input at 500 KB and running in a worker thread.

**10. Ecosystem adoption of mutation testing is essentially absent.** remark, unified, markdown-it, Prettier, and ProseMirror public repos do **not** use Stryker or any mutation-testing tool. Baseline rigor standardizes on `c8 --100` line+branch coverage, `type-coverage --at-least 100`, fixture-driven tests, and snapshot tests. The [Sentry JS SDK](https://sentry.engineering/blog/js-mutation-testing-our-sdks) (Aug 2024) is the canonical real-world empirical reference — weekly cadence, 25-60 min per package on a 12-package monorepo, `coverageAnalysis: "perTest"` + `ignoreStatic: true`, mutation score 0.62 on core. No published adopter on parser/serializer-shaped TS code.

**11. Two lift-and-shift fixture libraries are produced by this research** (Appendix A + Appendix B): a **28-vector whitespace corpus** spanning BOM, CRLF, and Tabs edge cases with per-parser divergence annotations; and a **59-snippet cross-parser divergence corpus** spanning 13 test families (emphasis 7 · links 6 · html-blocks 4 · setext-vs-hr 2 · autolinks 11 · lists 5 · fenced-code 4 · code-spans 1 · hard-breaks 3 · gfm-strikethrough 3 · gfm-tables 7 · gfm-tasks 3 · disallowed-html 3). Each entry has an exact input, documented divergence, spec/forum reference, and a `test_family` tag.

**12. Stryker's `perTest` speedup is 1.7–2.5×, not an order of magnitude.** Stryker's own docs cite "40–60% improvement" over `coverageAnalysis: "all"` ([Stryker configuration docs](https://stryker-mutator.io/docs/stryker-js/configuration/)); no third-party benchmark on parser-shaped TS exists. The cleanest real-world runner-swap datapoint is [Sentry's 2024 migration](https://sentry.engineering/blog/js-mutation-testing-our-sdks) from `jest-runner` to `vitest-runner` on a TS SDK package: 60 min → 25 min (2.4×) on a single package. The parent finding #1 is refined rather than replaced — the multiplier comes from the full runner-swap envelope (forced `perTest` + single-thread + runner transform speed), not `perTest` alone.

**13. Resolved: `stryker-mutator-bun-runner@0.4.0` does implement `perTest` coverage analysis.** The earlier contradiction between Finding #1 (previously stated "coverageAnalysis: off") and [stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) (advertises "Smart coverage analysis with perTest coverage support") is resolved by source-read of the `npm pack stryker-mutator-bun-runner@0.4.0` tarball performed 2026-04-19 (see [evidence/stryker-bun-runner-source-read.md](evidence/stryker-bun-runner-source-read.md)):

- The published 0.4.0 package ships a `src/coverage/` module with four files totalling ~479 lines (`CoverageHookGenerator.ts` 116, `CoverageTypes.ts` 75, `MutantCoverageCollector.ts` 184, `TestFilter.ts` 101, `index.ts` 3)
- The preload hook sets up the standard Stryker `globalThis.__stryker__.mutantCoverage = { static, perTest }` structure and installs a `test()` / `it()` wrapper that sets `globalThis.__stryker__.currentTestId` before each test body runs; Stryker's core instrumentation of mutant-counters then records per-test coverage directly against this ID
- The runner's `BunTestRunner.mutantRun()` calls `TestFilter.getTestsForMutant(options.activeMutant, this.mutantCoverage)` and passes the returned test-name list to Bun's `--test-name-pattern` flag, filtering each mutant's test run to only the tests that can kill it
- Finding #1 has been corrected to cite `coverageAnalysis: "perTest"` as the plugin's supported mode
- **Remaining caveat:** The repo's `main` branch is a v1.0.0 in-progress rewrite whose `MutationActivator` is a `// TODO` stub; a future npm publish that ships the rewrite before it is complete would regress the plugin. As of 2026-04-19 the stable path is via the published 0.4.0 tarball, not GitHub main

Plugin usage as of 2026-04-19: 4,390 monthly / 2,615 weekly npm downloads, 5 stars, solo maintainer, no GitHub Releases published.

**14. Coverage-guided fuzzing targeting micromark is a single-vendor bet with no state-transition instrumentation available off the shelf.** [Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js) `@jazzer.js/core@4.0.0` (2026-04-15) is the only actively-maintained coverage-guided fuzzer for pure-JS user packages; jsfuzz is archived, js-fuzz is unpublished, and fuzzilli targets engine internals not user packages. Standard JS coverage tools (c8, nyc, V8 Inspector, Jazzer.js Babel instrumentation) capture block/branch/function coverage — none capture the `(from-state, to-state)` edge that characterizes a state-machine walk like micromark's `State = (code: Code) => State | undefined`. The established solution from native fuzzing ([IJON](https://github.com/RUB-SysSec/ijon), IEEE S&P 2020 — one-line `IJON_STATE` annotations deliver >20× AFL speedup on the maze benchmark plus qualitative ability to play Super Mario, and crash 10 of 22 CGC challenges) has no JS port. Published empirical evidence (Zest, ISSTA 2019) shows plain byte-mutation CGF beats smart generators by 1.1–1.6× on tokenizer-stage coverage but loses by 1.03–2.81× on semantic paths behind a valid-input gate — directly pertinent because micromark is overwhelmingly a tokenizer. Upstream micromark had fuzz testing wired to JVM-Jazzer, now disabled (`"jazzer is unmaintained, with sec vulns"` comment in [micromark/package.json](https://raw.githubusercontent.com/micromark/micromark/main/package.json)) — the project does not currently fuzz itself.

---

## Research Rubric

| Part | Cluster | Dimensions | Depth |
|---|---|---|---|
| I | Mutation Testing for TS Parser/Serializer Code | D1.1 Stryker-js + TS integration · D1.2 Mutation operators on parser code · D1.3 Runtime cost strategies · D1.4 Interaction with seeded PBT · D1.5 Adopter examples + ecosystem adoption | All P0 Deep |
| II | Differential Testing within the JS Markdown Ecosystem | D2.1 Harness patterns · D2.2 CommonMark spec fixture · D2.3 AST-diff normalization · D2.4 Concrete harness examples · D2.5 Applicability to fast-check arbitraries | All P0 Deep |
| III | Whitespace Edge Cases | D3 BOM (U+FEFF) · D4 Line endings (CRLF/LF/CR/mixed) · D5 Tabs and indented code blocks · TV 28-vector test corpus | All P0 Deep |
| IV | Pathological Inputs + Divergence Corpus | D6.1 CVEs/GHSAs · D6.2 Stack-overflow bugs · D6.3 ReDoS + quadratic · D6.4 Giant-document scaling · D7.1/D7.2 Babelmark + forum divergences · D7.3 GFM divergences · D7.4 Curated snippet corpus | D6 P1 Moderate; D7 P0 Deep |
| V | Followup — Economics + Fuzzing as PBT Complement | FU1 Stryker-bun-runner vs vitest-migration economics · FU2 Coverage-guided fuzzing on micromark (Jazzer.js ecosystem, state-machine instrumentation, grammar-aware mutation, fast-check coverage hybrids, empirical payoff vs PBT, harness architecture) | FU1 Moderate; FU2 Deep |

**Stance:** Factual / Landscape — layout of options with tradeoffs; no recommendations.

**Non-goals:** First-party codebase analysis beyond Applicability callouts; Rust-specific pre-work (cargo-mutants, markdown-rs NAPI/WASM bindings, JS↔Rust divergence research); broader PBT tooling alternatives beyond fast-check; recommendation rankings on which option to adopt or which fixtures to prioritize.

---

## Part I: Mutation Testing for TS Parser/Serializer Code

### I.1 — Stryker-js + TypeScript integration

**Finding:** Stryker-js integrates with TypeScript via [`@stryker-mutator/typescript-checker`](https://stryker-mutator.io/docs/stryker-js/typescript-checker/), a `checker` plugin that type-checks each mutant in-memory using the TS Compiler API. Mutants that don't type-check are tagged `CompileError` and **excluded from the mutation score denominator** (`score = detected / valid * 100`). The checker auto-overrides `allowUnreachableCode: true`, `noUnusedLocals: false`, and `noUnusedParameters: false` to avoid spurious errors from mutation-induced dead code. Project references (`tsc --build`) are auto-detected. In Stryker 6.4+, mutants are grouped by TS dependency graph for batched compilation — maintainers report "43% performance increase while still being 99.1% accurate" ([announcing faster TS checking](https://stryker-mutator.io/blog/announcing-faster-typescript-checking/)).

Mutation switching (v4+) embeds all mutants into source behind a runtime `global.activeMutant` flag using Babel parser (handles JS/TS/Flow/JSX). The test runner flips the flag between mutant runs rather than rewriting source per mutant ([announcing Stryker 4.0](https://stryker-mutator.io/blog/announcing-stryker-4-mutation-switching/)).

**Bun runner status (as of 2026-04-19):** Stryker-js has no first-party Bun plugin. Open requests: [#4439](https://github.com/stryker-mutator/stryker-js/issues/4439) (2023-09-27) and [#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) (2025-07-07); in-progress PR [#5931](https://github.com/stryker-mutator/stryker-js/pull/5931) (2026-03-31, merge status uncertain). The architectural blocker is Bun's lack of a programmatic test-runner API ([oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191), closed as duplicate 2026-01-21) — `@stryker-mutator/jest-runner` and `@stryker-mutator/vitest-runner` both consume programmatic APIs that Bun does not expose.

Community option: [`stryker-mutator-bun-runner@0.4.0`](https://www.npmjs.com/package/stryker-mutator-bun-runner), single-maintainer, Apache-2.0, targets `@stryker-mutator/core ^9.0.0`. A direct source-read of the npm-published 0.4.0 tarball (see [evidence/stryker-bun-runner-source-read.md](evidence/stryker-bun-runner-source-read.md)) confirms the plugin implements `coverageAnalysis: "perTest"`:

- `src/coverage/CoverageHookGenerator.ts` generates a preload hook that installs `globalThis.__stryker__` with `mutantCoverage.perTest` + `mutantCoverage.static` structures and wraps `test`/`it` to set `currentTestId` before each test runs
- `src/coverage/TestFilter.ts` implements `getTestsForMutant(mutant, mutantCoverage)` that reads `mutantCoverage.perTest` and returns only the test IDs that cover each mutant; `createTestNamePattern` converts the list into a regex Bun accepts via its test-name filter
- `src/BunTestRunner.ts` sets `result.mutantCoverage` on the dry-run result when `options.coverageAnalysis !== 'off'` (line 109 / 201–205) and calls `TestFilter.getTestsForMutant` per mutant to filter execution (line 244)

The README's documented quick-start config uses `"coverageAnalysis": "perTest"` (not `"off"` — an earlier incorrect reading of the parent initial pass). The plugin's README additionally advertises a process pool for "2–3× faster execution" and "90% Less Test Runs with perTest coverage analysis." The 2–3× claim is maintainer-self-report; no independent third-party benchmark validates it.

**Caveat on GitHub main:** The repo's `main` branch ([menoncello/stryker-mutator-bun-runner](https://github.com/menoncello/stryker-mutator-bun-runner)) is a v1.0.0 in-progress rewrite with different architecture (`bun-test-runner.ts` + `mutation-activator.ts` + unreached `./coverage/index.js` import). As of 2026-04-19 the rewrite's `MutationActivator.activateMutation` is a `// TODO` stub, and no `coverage/` directory exists. Installing via `npm install stryker-mutator-bun-runner` (the 0.4.0 tarball) gives the working implementation; installing from GitHub main would not. Any durable adoption depends on which branch the plugin publishes next.

Fallback option: default [`command`](https://stryker-mutator.io/docs/stryker-js/configuration/) runner can invoke `bun test`. Per Stryker docs: "The command test runner can be made to work in any use case, but comes with a performance penalty, as Stryker cannot do any optimizations and just runs all tests for all mutants."

**Tradeoffs:** Minimizing adoption friction (command runner, keeps `bun test` intact) trades off against wall-clock cost. Migrating to vitest or jest runners with `coverageAnalysis: "perTest"` offers an order-of-magnitude speedup over full-suite-per-mutant (the command-runner baseline), at the cost of changing the test runner. Note: the multiplier shrinks to 1.7–2.5× (40-60%) when compared against `coverageAnalysis: "all"` rather than full-suite-per-mutant — see §I.6 for the measured runner-swap envelope. Waiting on PR #5931 or the community plugin maturing is the only "no-compromise" path, with standard open-source timing risk.

**Evidence:** [evidence/stryker-ts-integration.md](evidence/stryker-ts-integration.md)

> **Applicability to a remark-based TS/Bun pipeline today:** A pipeline using `bun test` as its test runner accepts the bun-gap tradeoffs as a precondition of adoption. The published 0.4.0 community plugin does implement `coverageAnalysis: "perTest"` (confirmed via source-read 2026-04-19, see Exec Summary #13 and [evidence/stryker-bun-runner-source-read.md](evidence/stryker-bun-runner-source-read.md)) — so the "largest runtime multiplier among native config levers" (§I.3) IS available via the community plugin on the 0.4.0 tarball. The command-runner fallback (`bun test` via Stryker's generic `command` runner) does not support perTest and runs the full suite per mutant. The residual risk on the bun-runner path is maintenance: the plugin's main-branch v1.0.0 rewrite is incomplete (see §I.6), so adoption pins to the 0.4.0 release for now.

### I.2 — Mutation operators on parser-shaped code

**Finding:** Stryker-js ships 15 mutator categories plus 21 regex sub-operators (via [weapon-regex](https://github.com/stryker-mutator/weapon-regex)). For identity/round-trip parser oracles, the mutators most likely to surface real bugs are:

| Mutator | Parser code site | Why high signal |
|---|---|---|
| **EqualityOperator** | Index bounds, token equality checks | Off-by-one; identity oracle catches mis-slices on boundary inputs |
| **ArithmeticOperator** | Index math, position advance | `+` ↔ `−` in slice index almost always breaks round-trip |
| **ConditionalExpression** | Token dispatch | Forcing `true`/`false` admits or drops a whole token class |
| **UpdateOperator** | State machine advance | Parser can't advance or unwinds backward |
| **LogicalOperator** | Delimiter guard clauses | Admit/reject flip on escape / open / close handling |
| **StringLiteral → ""** | Serializer delimiters (`"**"`, `` "`" ``, `"\n"`) | Emitted empty marker breaks re-parse |
| **MethodExpression** | `startsWith` / `endsWith`, case-fold | Directly flips scanner delimiter detection |
| **BlockStatement** | Switch-case body for token class | Emptying a dispatch branch catastrophically breaks round-trip |
| **BooleanLiteral / not-removal** | Escape flags | Inverts escape-handling branch |
| **Regex (21 sub-operators)** | Lexer patterns | Anchor removal, quantifier change, char class negation — high signal but also highest equivalent-mutant rate in this domain |

Signal ranking is inferred from mutator semantics + parser code shape; no published per-domain benchmark exists for markdown/AST parsers in TS/JS. Stryker's own documentation explicitly declines to publish a numeric threshold: "The higher, the better!" ([mutant states and metrics docs](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)).

**Equivalent-mutant patterns elevated in parser code (six patterns, inferred from mutator semantics + domain code shape):**

1. Regex substitutions with semantically identical alternatives — `(abc)` → `(?:abc)` when the capture isn't consumed; `[abc]` → `[\w\W]` in grammar-restricted positions; anchor removal on single-line inputs.
2. Short-circuited logical operators — `cache[key] && check(key)` → `||` survives when cache is always populated.
3. Pretty-print / style-variant serializer outputs — `"**"` vs. `"__"` passes through a normalizing round-trip.
4. Dead branches / defensive code — emptying an "impossible" error branch.
5. Off-by-one on boundaries shrinking generators don't reach — if fast-check always generates length ≥ 2, `length < 2` ↔ `length <= 2` survives.
6. Idempotent string operations — `toUpperCase` ↔ `toLowerCase` on pre-normalized ASCII input.

**Tradeoffs:** The mutator set is well-matched to parser bugs, but the equivalent-mutant overhead is real. Every surviving mutant in a round-trip pipeline is a triage item, not a test-addition trigger — roughly a third to half may be legitimately equivalent given the oracle shape. Disabling the Regex mutator (via `mutator.excludedMutations`) reduces the equivalent-mutant backlog at the cost of coverage of lexer pattern logic. Widening the fast-check generator is a complementary lever — if the generator is restricted to certain input shapes, boundary-condition mutants will survive.

**Evidence:** [evidence/mutation-operators-parsers.md](evidence/mutation-operators-parsers.md)

### I.3 — Runtime cost strategies

**Finding:** Stryker-js provides five native cost-control levers plus one community plugin.

**Native levers:**

1. **`coverageAnalysis: "perTest"`** — runs only tests that covered each mutant. Largest single runtime multiplier among native config levers when supported by the runner; measured at 40-60% (1.7-2.5×) over `"all"` baseline per Stryker's own docs, not order-of-magnitude (see §I.6 for the runner-swap envelope where the larger 2.4× Sentry datapoint applies). Jest/Vitest/Mocha/Jasmine support it; command runner does not; community bun runner 0.4.0 also supports it (confirmed via source-read, see Exec #13).
2. **`--incremental`** — diffs code + tests against the previous run's cache (default `reports/stryker-incremental.json`). The [announcement blog](https://stryker-mutator.io/blog/announcing-incremental-mode/) reports 92.1% mutant reuse (3,731/3,965) in one sample after a small code+test change. Documented blind spots: dependency upgrades, env var changes, `.snap` files, and — with the command runner — any test-change detection.
3. **`ignoreStatic: true`** — skips mutants in code executed on file load. Stryker otherwise spawns a fresh worker per static mutant.
4. **`--mutate` glob + line-range scoping** — glob (`!` negation supported) and `"src/app.js:1-11"` range syntax. Globs and ranges can't be combined in one expression.
5. **`concurrency`** — integer (`--concurrency 4`) or percentage (`--concurrency 50%`). Default formula: `n if n ≤ 4 else n - 1` where `n` = logical cores ([#2542](https://github.com/stryker-mutator/stryker-js/issues/2542)).

**Native levers NOT present:**
- No `--since` / git-diff flag. Closest native feature: `--incremental`.
- No native sampling, random subset, or priority-based mutant selection.

**Community plugin:** [`stryker-git-checker`](https://github.com/lbtoma/stryker-git-checker) — `checker`-type plugin providing diff-based filtering. Self-described as "quite experimental."

**Community pattern** (from [oneuptime.com](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)): populate `--mutate` from `git diff`:

```bash
CHANGED_FILES=$(git diff --name-only origin/main...HEAD -- 'src/**/*.ts' | paste -sd, -)
npx stryker run --mutate "$CHANGED_FILES"
```

**Wall-clock data (primary source: [Sentry JS SDK, Aug 2024](https://sentry.engineering/blog/js-mutation-testing-our-sdks)):**

| Config | Runtime |
|---|---|
| `@sentry/core` with Jest | ~60 min |
| `@sentry/core` with Vitest | ~25 min |
| Per-package in CI | 20–25 min each |
| 12-package monorepo parallelized per package | 35–45 min total |
| Cadence | **Weekly** (explicitly not per-PR) |

**CI tier placement pattern convergence:** all primary sources stratify into *nightly/weekly full* + *PR-incremental or diff-scoped*. No primary source documents running the full matrix on every PR for a production-sized TS codebase. Stryker's own [mutation-testing.yml](https://github.com/stryker-mutator/stryker-js/blob/master/.github/workflows/mutation-testing.yml) runs on `push` to master + manual dispatch, with no PR trigger.

**Tradeoffs:** For a ~500-LOC core + ~4K-LOC test suite, the "PR-tier" composition (`--incremental` + `perTest` + `ignoreStatic` + `--mutate` from `git diff` + tuned concurrency) is the pattern every primary source converges on; the individual components are confirmed but the composed effect is not isolated in a public benchmark. Test runner choice dominates: Sentry's Jest→Vitest switch produced a 2.4× speedup on a single TS SDK package (Core SDK; see §I.6 for the full Option-3-envelope breakdown). If `bun test` is retained via the published 0.4.0 community plugin, `perTest` IS available (confirmed via source-read, §Exec #13). If retained via Stryker's generic command runner, perTest is unavailable — the single largest lever is gone, pushing runtime closer to "weekly only" rather than "per-PR feasible."

**Evidence:** [evidence/runtime-cost-strategies.md](evidence/runtime-cost-strategies.md)

### I.4 — Interaction with seeded property-based tests

**Finding:** fast-check and Stryker compose without modification, but PBT-test reproducibility across mutants is user-enforced, not tool-enforced.

**Stryker test lifecycle per mutant** ([Stryker v6 blog](https://stryker-mutator.io/blog/stryker-js-v6-expeditious-superior-mutations/)): Stryker flips `global.activeMutant` and re-runs covering tests in the same worker process without re-importing source. Module state, singletons, closures, and in-process globals **persist** across mutants within one worker — state isolation is delegated entirely to the test runner. Static mutants are the exception (fresh worker per static mutant on Node-based runners). `coverageAnalysis: "perTest"` filters to only tests covering the mutant.

**fast-check determinism:** Uses `pure-rand` ([README](https://github.com/dubzzz/pure-rand/blob/main/README.md): "fully deterministic... given the original seed one can rebuild the whole sequence"), default `xorshift128plus`. Explicit `seed` is coerced to 32-bit signed integer; fast-check does NOT touch `Math.random` for generation. PRNG state is local to each `fc.assert` invocation, not global. Given fixed `seed` + fixed `numRuns`, fast-check produces the identical sequence regardless of call order or prior mutant runs.

**Default seed (when no explicit seed is given)** is `safeDateNow() ^ (safeMathRandom() * 0x100000000)` ([QualifiedParameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/QualifiedParameters.ts)). Consequence: un-pinned fast-check tests effectively sample a different seed per invocation. Across mutants, the same un-pinned test can kill or survive based purely on seed draw.

**Stryker does NOT re-seed fast-check.** It has no awareness of fast-check; it simply re-invokes the test runner. Seed propagation is 100% test-author responsibility via `fc.assert({ seed })`, `fc.configureGlobal({ seed })`, or a user-maintained env-var convention.

**Shrinking stability under mutation:** fast-check shrinking is deterministic given `(seed, path, predicate)`. But the **predicate includes the mutated source**. Consequence: within a single mutant, shrunk counterexamples are stable across re-runs with the same seed. Between different mutants, counterexamples can legitimately shift — each mutant is a different program. This is not a bug; it's a design consequence.

**Mutant states table** ([Stryker docs](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)):

| State | Counted as detected? |
|---|---|
| `killed` — ≥1 test failed | Yes |
| `survived` — all tests passed | No |
| `no-coverage` — no test covered | No |
| `timeout` — exceeded deadline | **Yes (effectively killed)** |
| `runtime-error` — runner crashed | No (excluded from valid) |
| `compile-error` — TS error | No (excluded from valid) |

**Flakiness handling:** Stryker-js has no retry configuration and no flaky-test tolerance setting. Only tunables are `timeoutMS`, `timeoutFactor`, and `disableBail`. [stryker-net#2144](https://github.com/stryker-mutator/stryker-net/issues/2144) documents the general class of issue: non-determinism in the test layer produces mutation scores varying 22% → 100% on unchanged code. Pinning seeds eliminates the fast-check contribution to this variance.

**Known compatibility bug — Vitest only:** [stryker-js#5714](https://github.com/stryker-mutator/stryker-js/issues/5714): dual-Vitest-instance caused `@fast-check/vitest` hooks to register on one instance but not the other, silently dropping PBT executions. Fixed in PR #5745 (2026-01-30). Does not apply to plain `fc.assert` inside vitest/jest/mocha `it` blocks.

**Tradeoffs:** Pinning fast-check seeds (explicit `seed`, `fc.configureGlobal`, or env-var convention) is a precondition for stable Stryker runs. Un-pinned seeds guarantee mutant-label flakiness. Property-based tests run with `numRuns = 1000` per invocation multiply Stryker's per-mutant cost meaningfully; combined with hot-reload semantics, this is a runtime-control decision point. If `numRuns` is set aggressively (e.g., 10000 under a stress env var), expect Stryker runtime to scale linearly with runs per property.

**Evidence:** [evidence/stryker-fastcheck-interaction.md](evidence/stryker-fastcheck-interaction.md)

> **Applicability to a remark-based TS/Bun pipeline today:** A pipeline that rotates PBT seeds via `PBT_SEEDS = [42, 137, 2718]` and scales `NUM_RUNS` 1000→10000 via a `STRESS_FIDELITY` env var already has the scaffolding for stable Stryker runs — but the helper code has to thread explicit seeds into every `fc.assert` call. Aggressive `STRESS_FIDELITY` mode multiplies Stryker wall-clock linearly; gating the stress path out of the Stryker pipeline is an available tradeoff.

### I.5 — Concrete adopter examples + ecosystem adoption

**Finding:** Public adopters of Stryker-js on pure parser/serializer/codec TypeScript code are essentially absent. The most relevant ecosystem repositories (unified, remark, rehype, markdown-it, Prettier, ProseMirror) **do not use mutation testing**.

**Ecosystem observations** (confirmed from `package.json` inspection; star counts as of 2026-04-19):

| Repo | Stars | Test stack | Mutation testing? | PBT? | Fuzz? |
|---|---|---|---|---|---|
| remarkjs/remark | ~7k | `node:test` + `c8 --100` + `type-coverage --at-least 100` | No | No | No |
| unifiedjs/unified | ~5k | `node:test` + `.test-d.ts` | No | No | No |
| markdown-it/markdown-it | 21.3k | Mocha + chai + c8 + CommonMark spec fixtures | No | No | No |
| prettier/prettier | ~50k | Jest 30 + snapshot serializers | No | Not surfaced | No |
| ProseMirror/prosemirror-markdown | — | prosemirror-test-builder + jest-prosemirror | No | No | No |

Adjacent academic work: [MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz) (ASE '21) uses syntax-tree-based *mutation fuzzing* (different category from Stryker-style mutation testing) for markdown compiler perf bugs.

**Canonical real-world empirical reference: [Sentry JS SDK, 2024-08-23](https://sentry.engineering/blog/js-mutation-testing-our-sdks).**

- 12-package monorepo; opt-in per package
- Core SDK mutation score: **0.62 (62%)**
- Config: `coverageAnalysis: "perTest"` + `ignoreStatic: true`; migrated Jest → Vitest for 2.4× speedup (Core SDK package only; see §I.6)
- Cadence: weekly, not per-PR
- Top reported limitation: no Playwright runner → E2E tests never kill mutants → higher-level packages scored worse than core despite E2E coverage

**Other public adopter:** [rudderlabs/rudder-workflow-engine](https://github.com/rudderlabs/rudder-workflow-engine) — YAML/JSONata workflow engine (parser-adjacent). Vanilla `stryker init` output; no CI workflow surfaced; 4 stars. Non-optimized config (`command` runner, `coverageAnalysis: "all"`).

**Stryker-js maintenance signals (2026-04-19):**

| Signal | Value |
|---|---|
| Latest release | **v9.6.1** (2026-04-10) |
| Recent releases | v9.6.0 (Feb 27 '26), v9.5.1 (Feb 2 '26), v9.4.0 (Nov 23 '25), v9.3.0 (Oct 28 '25) |
| GitHub stars | ~2.8k |
| Open issues | 43 |
| Weekly downloads (@stryker-mutator/core) | ~54k |

**Interpretation:** Active maintenance — 4+ minor/patch releases in ~6 months, low open-issue count relative to commit volume, ongoing runner and tooling work. No evidence of stagnation. Star growth is modest (mutation testing remains a niche quadrant), and there is no sign of hyper-growth either.

**Recurring theme across Sentry, prodSens, OneUptime case studies:** Mutation testing consistently surfaces *boundary-condition gaps* in code with high line coverage. prodSens reports `videoSplitter.ts` at 95% line coverage lifted 62% → 88% mutation score by adding boundary-value tests. Applied to parser/serializer code, this is the exact bug class that EqualityOperator / ArithmeticOperator / ConditionalExpression mutators target.

**Tradeoffs:** Adopting Stryker on a unified/remark-style pipeline is trailblazing relative to the ecosystem. There is no "best-practice sheet" from remark/unified maintainers, because none of them have done it publicly. The absence is a cost (no exemplar to copy) and a lever (no ecosystem expectation locked in; latitude to choose scope).

**Evidence:** [evidence/adopter-examples.md](evidence/adopter-examples.md)

### I.6 — Economics: bun-runner vs vitest-migration vs command runner

**Finding:** The wall-clock delta between the three Stryker runner options on a parser-shaped TS suite is real but smaller than I.3 framed. The decisive factor is the `command` runner's full-suite-per-mutant penalty, not the `perTest` bonus. Three options + a hybrid exist; the perTest-support question that divided Options 1 and 3 has been resolved via source-read (§Exec #13) — both 0.4.0 community plugin and vitest-runner support perTest. The remaining choice is maintenance risk (solo plugin + in-progress v1.0.0 rewrite vs. official plugin).

**`perTest` speedup — the measured range.** Stryker's own docs put `coverageAnalysis: "perTest"` at 40–60% faster than `"all"` (1.7–2.5×), not the "order of magnitude" framing that a casual read of I.3 might imply. The 2018 announcement blog reports "about 50% performance increase" on Stryker-on-Stryker ([announcing Stryker-TS-runner speed-up](https://stryker-mutator.io/blog/announcing-faster-typescript-checking/)). No independent benchmark on a parser-shaped TS suite was located. The amplifier is not `perTest` per se — it is switching to `@stryker-mutator/vitest-runner`, which forces `perTest`, runs single-threaded, and enables fail-fast ([Stryker vitest-runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)).

**Sentry real-world datapoint.** [Sentry's 2024 migration](https://sentry.engineering/blog/js-mutation-testing-our-sdks) from `@stryker-mutator/jest-runner` to `@stryker-mutator/vitest-runner` on a TypeScript SDK package cut one package's run from 60 min → 25 min (2.4×). This folds in runner transform speed, single-thread vs worker-pool discipline, and `perTest` — it's the full Option 3 envelope. No other published real-world runner-swap numbers on TS SDKs surfaced.

**`stryker-mutator-bun-runner` reality check** (as of 2026-04-19):
- npm: 4,390 monthly / 2,615 weekly downloads (accelerating — weekly pace projects ~11k monthly if held). [npm registry](https://www.npmjs.com/package/stryker-mutator-bun-runner).
- GitHub: 5 stars, 0 open issues, 29 commits, no GitHub Releases published. Bus factor = 1.
- Author is actively seeking adoption into `@stryker-mutator` official scope ([stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424)).
- Plugin implements `coverageAnalysis: "perTest"` in the published 0.4.0 tarball — resolved via direct source-read 2026-04-19 (see [evidence/stryker-bun-runner-source-read.md](evidence/stryker-bun-runner-source-read.md)). `src/coverage/` module (479 LOC across 4 files) ships the `__stryker__` preload hook + `TestFilter.getTestsForMutant` + `createTestNamePattern` → Bun's `--test-name-pattern`. Upstream claim in [stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) matches shipping functionality; parent initial pass incorrectly characterized the plugin as `coverageAnalysis: "off"`.
- Bun test itself is 3–10× faster than vitest on pure-logic TS ([PkgPulse 2026](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026) — 50 tests × 10 files: Jest 1.2s / Vitest 0.9s / Bun 0.08s, though the bun figure is mostly startup advantage). A parser pipeline is the pure-logic workload where bun shines.

**bun → vitest migration compatibility** (concentrated friction, not dispersed):

| Concern | Status |
|---|---|
| `describe/it/expect` API | Identical (both Jest-flavored) |
| `.toMatchSnapshot()` (.snap files) | Identical format, migrate verbatim |
| `.toMatchInlineSnapshot()` | Bun does not support it — not a migration concern |
| `fast-check` (any version) | Runner-agnostic; `@fast-check/vitest` exists as optional upgrade |
| `Bun.env` / `Bun.file` / `Bun.spawn` | Must be replaced with Node equivalents in test code |
| TypeScript execution | Vitest transforms via esbuild/swc; Bun runs TS natively |
| jsdom / testing-library | N/A for a parser pipeline |

Migration effort estimate for ~4000 LOC of fidelity tests with fast-check + snapshots: **0.5–3 person-days**, concentrated on `Bun.*` API audit + vitest config setup. Vitest's own migration guide self-describes as "hours, not days" for analogous Jest→Vitest swings.

**Option 3b — hybrid path.** Running Stryker with a different test runner than the primary CI runner is standard practice, not an escape hatch. Sentry and OneUpTime both document this pattern: mutation testing runs as a separate nightly/weekly workflow. The shape:

1. Primary CI + dev loop: `bun test` unchanged
2. Separate `.github/workflows/mutation-test.yml` on cron: Stryker + `@stryker-mutator/vitest-runner` with a `vitest.config.ts` pointing at the same `*.test.ts` files

Requirements: test files remain runner-agnostic (use `import { test, expect } from "bun:test"` swapped at build for vitest, or enable vitest `globals: true` and use ambient globals). No community precedent was found for maintaining parallel `.stryker.test.ts` files — that pattern would be novel and double-maintenance without documented benefit.

**Tradeoff matrix (layout, not ranking):**

| Dimension | Option 1: bun runner | Option 2: command runner | Option 3: vitest migration | Option 3b: hybrid |
|---|---|---|---|---|
| Per-mutant wall clock | Claimed 2-3× vs Node runners (unverified); `perTest` confirmed via 0.4.0 source-read | Full suite per mutant (1M+ invocations on 1k×1k) — unviable per Stryker's own warning | ~2.4× vs jest-runner baseline (Sentry) with forced `perTest` | Same runtime profile as Option 3 |
| Maintenance risk | Solo maintainer, no official support | Default Stryker path, no plugin | Official Stryker plugin, active | Official for mutation; bun official for primary |
| One-time migration cost | ~0 person-days | ~0 person-days | 0.5–3 person-days | 0.5–3 person-days |
| Ongoing friction | Risk of plugin drift vs Stryker core | Slow on anything non-trivial | Dual runner configs | Dual runner configs + runner-compatible test-file imports |
| fast-check + snapshots | Works (bun native) | Works | Works (`@fast-check/vitest` optional) | Works |
| Parser-shape suitability | Best raw runner speed | N/A (runner-independent) | Strong on Stryker overhead model | Same as Option 3 |
| Published case studies on TS parser suites | None found | None found | None found on parsers; Sentry on SDK | None found |

**Break-even sketch.** If vitest-runner delivers 2.4× over baseline and migration costs 2 person-days: a 40-min baseline → 17-min vitest run saves 23 min/run. A weekly cadence over a quarter = 13 runs × 23 min ≈ 5 saved hours against 16 migration hours — break-even at ~9 months of weekly runs. This ignores human cost of waiting during iterative mutation campaigns, where 20-minute turnarounds compound worse than linear.

`perTest` is confirmed in the published 0.4.0 source. Whether Option 1 converges with Option 3 on wall-clock reduces to whether the bun-runner's "2–3× vs Node" process-pool claim holds empirically on parser-shaped suites — still a maintainer-self-report, no independent benchmark on record. The deciding factor between Option 1 and Option 3 is therefore maintenance risk (solo maintainer + no releases + 1.0.0 rewrite in progress vs. official Stryker plugin with full release history). The Option 1-to-Option 2 catastrophe regression would only trigger if a future npm publish ships the incomplete v1.0.0 rewrite (currently a `// TODO` stub in `MutationActivator`) before its coverage module is restored.

**Evidence:** [evidence/stryker-bun-vs-vitest-economics.md](evidence/stryker-bun-vs-vitest-economics.md)


---

## Part II: Differential Testing within the JS Markdown Ecosystem

### II.1 — Harness patterns in the ecosystem

**Finding:** Each major JS parser maintains its own CommonMark spec-test harness, and there is no community-maintained cross-parser fixture set or assertion library. The only existing cross-parser markdown comparator is [Babelmark3](http://babelmark.github.io/), a web-based visual comparator — not a scriptable test library. Its [registry](https://github.com/babelmark/babelmark-registry/blob/master/registry.json) is JSON and dingus servers accept HTTP GET, but the 1000-character input limit and network dependencies make it unsuitable as a CI test harness.

**Parser AST dialect divergence:**

| Parser | AST format | Notes |
|---|---|---|
| remark-parse | mdast (tree, unist-based) | Delegates internally to micromark |
| micromark | Token events (internal) + mdast via `mdast-util-from-markdown` | Low-level tokenizer |
| commonmark.js | Custom Node tree | Reference JavaScript implementation |
| markdown-it | Flat token stream (`Token` objects with `nesting`) | Not a tree AST ([issue #176](https://github.com/markdown-it/markdown-it/issues/176)) |
| marked | Internal token format | Different from markdown-it |

A single "AST oracle" across all parsers is impractical without translation shims. **micromark is not independent of remark-parse** — remark-parse defers internally to micromark ([commit 6b42465](https://github.com/remarkjs/remark/commit/6b42465526bb15f70d98a0ea0daccea01ffb8004)). A harness that compares remark-parse and micromark only tests the `mdast-util-from-markdown` translation layer. Independent coverage requires including at least one of markdown-it, marked, or commonmark.js in the pairing.

**Evidence:** [evidence/d2-1-differential-harness-patterns.md](evidence/d2-1-differential-harness-patterns.md)

### II.2 — CommonMark spec test suite as differential fixture

**Finding:** The CommonMark spec is packaged as ~627 JSON objects in two maintained npm packages, directly consumable from TypeScript/Bun without Python tooling. The canonical comparison oracle — even in the reference implementations — is normalized HTML, not AST.

**npm packages:**
- [`commonmark-spec`](https://www.npmjs.com/package/commonmark-spec) — official npm publication
- [`commonmark.json`](https://www.npmjs.com/package/commonmark.json) — wooorm's JSON mirror

Each entry has the shape `{markdown, html, section, number}`. Section labels (`"Setext headings"`, `"Emphasis and strong emphasis"`, etc.) allow targeted slicing.

**GFM extensions** are encoded in the same `example`-block format as CommonMark in [cmark-gfm/test/spec.txt](https://github.com/github/cmark-gfm/blob/master/test/spec.txt), extractable with the same tooling.

**MDX and wiki-link have no analogous corpus.** MDX has no formal fixture corpus (its spec repo is archived); wiki-link has no multi-implementation standard. Differential testing these requires hand-written fixtures or generator-driven inputs.

**Tradeoffs:** The corpus is small (~650 tests, <1 MB) and iterates in well under a second per parser on modern hardware. The "HTML-is-the-oracle" pattern is not a design compromise; it is the canonical approach. Normalized HTML sidesteps the AST-dialect problem and resolves known divergences (soft breaks, entity decoding, autolink forms) at the rendering layer. For parser extensions (wiki-link, MDX), the spec corpus does not cover them — differential testing there needs a different generator strategy.

**Evidence:** [evidence/d2-2-commonmark-spec-fixture.md](evidence/d2-2-commonmark-spec-fixture.md)

### II.3 — AST-diff normalization strategies

**Finding:** The unified ecosystem provides mature utilities for pre-comparison mdast normalization. For HTML-level diffing, [`markedjs/html-differ`](https://github.com/markedjs/html-differ) is the JS equivalent of CommonMark's `normalize_html()`. No public utility converts between mdast and markdown-it tokens, so direct AST-to-AST diff between those two parsers is impractical without a custom shim.

**Normalization utilities (installable from npm today):**

- [`unist-util-remove-position`](https://github.com/syntax-tree/unist-util-remove-position) — strip `position` fields before comparison (canonical, one-line)
- [`mdast-util-compact`](https://github.com/syntax-tree/mdast-util-compact) — merge adjacent text nodes; resolves a known false-positive class where two parsers legitimately split text runs differently
- [`mdast-util-assert`](https://github.com/syntax-tree/mdast-util-assert) — validate tree structure (not compare)
- [`markedjs/html-differ`](https://github.com/markedjs/html-differ) — HTML diff with whitespace inside tags + attribute-ordering normalization

**Known "always differ" categories** between JS CommonMark parsers (folklore from issue trackers):

- Positional/offset info (always strip)
- Raw source text attributes (`value` fields on some node types)
- HTML comment handling
- Soft-break vs hard-break representation
- Whitespace intrinsics around lists/blockquotes (marked's main failing area)
- Autolink vs raw URL tokenization
- Entity decoding timing (`&amp;` as text vs `&`)

**Cross-parser round-trip** (parse-with-A, serialize-through-B) is not viable without a translation shim because B's serializer doesn't accept A's AST shape. `mdast-util-to-markdown` explicitly does not guarantee round-trip fidelity ("Complete roundtripping is impossible given that any value could be injected into the tree"), so even single-parser serialize-then-reparse is an approximation.

**Tradeoffs:** If AST-level oracle is chosen, the diff function must accept an ignored-paths allowlist; without it, the "always differ" categories will produce continuous noise. If HTML oracle is chosen, `html-differ` handles most of the class automatically but cannot surface AST-level bugs (e.g., wrong node-type attribution on an identical HTML rendering).

**Evidence:** [evidence/d2-3-ast-diff-normalization.md](evidence/d2-3-ast-diff-normalization.md)

### II.4 — Concrete harness examples in real repos

**Finding (negative):** No public JS repository runs ≥2 JS markdown parsers against shared inputs for equivalence assertion, based on multi-query searches across GitHub, npm, and conference talk archives. The closest architectural precedent is [Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz), which differential-fuzzes Rust source parsers using cargo-fuzz and a unified AST representation. Academic work on markdown differential fuzzing exists ([MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz), ASE '21), focused on performance bugs.

**Negative search methodology:**
- GitHub code search: `"markdown-it" "remark-parse"` in test files
- npm package search: `markdown-differential`, `parser-diff`
- CommonMark discussion archives
- Conference talk archives

[`markdown-it-testgen`](https://github.com/markdown-it/markdown-it-testgen) is a single-parser fixture runner, not a differential harness — despite parsing "fixtures in commonmark spec format," it takes one markdown-it instance.

**Tradeoffs:** Adopting this pattern is novel work relative to the JS ecosystem. The architectural blueprint from Skepfyr/rust-parser-fuzz is directly portable — ingredients are (a) unified canonical representation, (b) per-parser adapter, (c) per-parser known-bug filter — only the language and fuzz driver change (fast-check replaces cargo-fuzz). The JSON parser domain (JFuzz et al.) has demonstrated that differential testing is the standard approach for parser-consistency bug discovery; the technique is validated in adjacent ecosystems.

**Evidence:** [evidence/d2-4-concrete-harness-examples.md](evidence/d2-4-concrete-harness-examples.md)

### II.5 — Applicability to fast-check arbitraries

**Finding:** fast-check explicitly supports differential testing as a first-class "equivalence" pattern ([dubzzz/fast-check-examples](https://github.com/dubzzz/fast-check-examples)), and `fc.letrec` with `depthSize`/`maxDepth` is the combinator for generating recursive mdast-shaped structures. The shrinking machinery works cleanly on built-in arbitraries and on `fc.record` trees; `.map()` requires an `unmapper` to shrink through the map step. **No pre-built markdown arbitrary exists in the fast-check ecosystem.**

**Two generation strategies are viable:**

1. **AST-up**: build an mdast arbitrary via `fc.letrec` → serialize with `mdast-util-to-markdown` → feed to both parsers → diff. Produces markdown that the remark serializer guarantees is structurally valid, but may still hit inline edge cases where other parsers diverge.
2. **String-down**: generate markdown strings directly via `fc.string` combinators → feed to both parsers → diff. More exploratory but hits more real ambiguities; requires a denser expected-divergence filter.

**Shrinking effectiveness depends on generator design.** Generating the structured AST and serializing inside the property (rather than `.map()`-ing into a string arbitrary) keeps the shrinker effective without needing an unmapper.

**An expected-divergence filter is essential** to avoid drowning the signal in known "always differ" categories (§II.3). The filter itself becomes documentation of the agreed/disagreed surface between the two parsers.

**Cross-domain precedent is strong:** JSON ([JFuzz](https://arxiv.org/html/2410.21806v1)), Rust source parsers ([Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz)), regex engines, and XML all have documented PBT + differential testing applications. The pattern transfers naturally to markdown.

**fast-check integrates with Bun's test runner** without special bindings. `fc.assert(fc.property(...))` is framework-agnostic; `numRuns`, `seed`, and `endOnFailure` options control CI budget and determinism.

**Tradeoffs:** If the pipeline includes custom extensions (remark-wiki-link, remark-mdx-agnostic) not covered by the CommonMark spec, fast-check generation is the only way to exercise differential testing on them — fixture-based differential testing doesn't apply. If the risk surface is pathological inputs (DoS, catastrophic backtracking — see §IV.3), string-down generation with high `numRuns` is more effective than AST-up.

**Evidence:** [evidence/d2-5-fast-check-pbt.md](evidence/d2-5-fast-check-pbt.md)

### II.6 — Oracle choice is the highest-leverage decision

Three options with different fault-coverage profiles:

| Oracle | Pairings viable | Catches AST-shape bugs | Catches HTML-output bugs | Normalization cost | Expected-divergence noise |
|---|---|---|---|---|---|
| Normalized HTML (via `html-differ`) | Any two parsers | No | Yes | Low (library handles it) | Low |
| mdast-to-mdast (positions stripped, compact) | remark-parse ↔ commonmark.js ↔ micromark+from-markdown | Yes, within unist-shaped cluster | No | Medium (per-category filter needed) | Medium |
| Bespoke unified AST adapter | Any two, per Rust precedent | Yes, if adapter is thorough | Indirectly | High (writing adapters) | Controlled by adapter design |

**Independence of parsers matters for coverage.** A differential harness where both sides share tokenizer internals (remark-parse + micromark) tests only the translation layer. Including markdown-it, marked, or commonmark.js in the pairing gives genuinely independent coverage of tokenization.

**Fixtures and generators are complementary**, not alternatives:
- **CommonMark/GFM spec fixtures** give coverage of the standardized surface with high signal-to-noise (every divergence on a passing CommonMark example is a real bug in at least one parser).
- **fast-check generators** cover the extension surface (wiki-link, MDX, custom plugins) where no external fixture exists, and surface edge cases the spec examples don't reach.

> **Applicability to a remark-based TS/Bun pipeline today:** The building blocks — `commonmark-spec` package, `unist-util-remove-position`, `mdast-util-compact`, `html-differ`, fast-check with `fc.letrec` — are all npm-installable today and compatible with bun test. The coupling work is a ~200-line test file wiring them together. Pairing remark-parse with markdown-it or commonmark.js produces the independent coverage that remark-parse ↔ micromark does not.

---

## Part III: Whitespace, BOM, Line Endings, and Tabs

### III.1 — BOM (U+FEFF) handling

**Finding:** CommonMark 0.31.2 is silent on BOM. Only `micromark` (remark-parse's engine) strips a single leading BOM; every other parser in the ecosystem preserves it. `js-yaml` preserves BOM as key-name content and has refused to strip since [issue #179](https://github.com/nodeca/js-yaml/issues/179) closed `wontfix` in 2015.

**Per-parser behavior:**

| Parser | Leading BOM | Mid-text BOM (string input) | Mid-text BOM (stream/TextDecoder) |
|---|---|---|---|
| micromark / remark-parse | Stripped | Preserved | Stripped by TextDecoder |
| markdown-it | Preserved | Preserved | — |
| marked | Preserved | Preserved | — |
| commonmark.js | Preserved (inferred) | Preserved (confirmed) | — |

Sources: [micromark bom.js tests](https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js), [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs), [marked issue #1133](https://github.com/markedjs/marked/issues/1133), [commonmark.js regression.txt](https://github.com/commonmark/commonmark.js/blob/master/test/regression.txt).

**micromark's strip is one-shot at file start.** The strip is gated on `start` — a one-shot flag — so only the first character is considered. Double BOMs, BOM-after-whitespace, or mid-text BOMs survive. Double-BOM inputs produced by `cat a.md b.md > combined.md` on Windows, or PowerShell 5.1's default UTF-16LE+BOM redirection, strip only the first. The second survives mid-text and breaks both ATX-heading and frontmatter-fence detection by pushing the sigil off column 1.

**STRING vs STREAM input paths diverge on internal BOMs** in micromark. `'# hea\uFEFFding'` (string input) → `'<h1>hea\uFEFFding</h1>'` — BOM preserved mid-text. `'# hea\uFEFFding'` (stream via `TextDecoder`) → `'<h1>heading</h1>'` — TextDecoder strips the internal BOM. **Same input, same parser, two different outputs depending on input mode.**

**BOM + YAML frontmatter interactions:**

- A **BOM inside YAML values** (`title: hello\uFEFFworld`) propagates through `js-yaml` to the runtime object unchanged. Downstream code comparing `frontmatter.title === "helloworld"` fails in a way no type checker catches.
- A **BOM inside a YAML key** (from malformed concatenation) produces a key named `"\uFEFFkey"` rather than `"key"`. Lookups silently miss.

**Tradeoffs:** Leading-BOM tolerance comes "for free" from micromark. Every other BOM case is a silent hazard. [talk.commonmark.org 1832](https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832) closed without resolution in 2015, explicitly leaving this implementation-defined.

**Evidence:** [evidence/d3-bom-handling.md](evidence/d3-bom-handling.md)

### III.2 — Line endings (CRLF / LF / CR / mixed)

**Finding:** CommonMark §2.1 treats LF, CR, and CRLF as three equivalent single line endings. The unified/remark stack preserves this distinction at the tokenizer layer (micromark's `carriageReturn`, `lineFeed`, `carriageReturnLineFeed` codes) but discards it at the AST layer. `remark-stringify` emits only LF.

**Per-parser behavior:**

| Parser | CRLF handling | CR alone | Mixed endings |
|---|---|---|---|
| micromark / remark-parse | Distinct tokenizer code; mdast AST indistinguishable | Distinct tokenizer code | All three preserved at tokenizer, collapsed at AST |
| markdown-it | Normalized to LF by core rule | Normalized to LF | All collapsed to LF before parse |
| commonmark.js | Split on `/\r\n\|\n\|\r/` regex | Same | Same |

Sources: [micromark codes.js](https://github.com/micromark/micromark/blob/main/packages/micromark-util-symbol/lib/codes.js), [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs), [commonmark.js blocks.js](https://github.com/commonmark/commonmark.js/blob/master/lib/blocks.js).

**Hard-break rules:** The spec (§6.7) uses the abstract "line ending" from §2.1, so `"foo  \r\n"` (two-space + CRLF) should produce a hard break identically to `"foo  \n"`. Empirically validated by the fix for [remark-lint #55](https://github.com/remarkjs/remark-lint/issues/55), which previously treated `\r` as a third trailing space and false-flagged CRLF hard breaks.

**Round-trip impossibility:** `mdast-util-to-markdown` has no `lineEnding` / `eol` option ([docs](https://github.com/syntax-tree/mdast-util-to-markdown)) — this is the architectural lock. [remark#660](https://github.com/remarkjs/remark/issues/660) ("Remark replaces CRLF with LF on Windows") carries the `🙅 no/wontfix` label, corroborating that CRLF preservation is not on the roadmap without itself stating an explicit maintainer rationale. Byte-level idempotence of CRLF input is therefore architecturally impossible under the default pipeline.

**Two OPEN upstream issues (2026-04-19):**

- [commonmark/cmark #550](https://github.com/commonmark/cmark/issues/550) (2024-06, open 22 months): `parse_list_marker` compares directly against `'\n'` and misses CRLF. Affects the C reference implementation, not remark — if the pipeline compares outputs against cmark for validation, this is a known-divergence point. remark/micromark is spec-conformant here.
- [commonmark/commonmark-spec #640](https://github.com/commonmark/commonmark-spec/issues/640) (2020-03, open 6+ years): spec ambiguity on whether CRLF inside fenced code content must survive or may be normalized. commonmark.js strips `\r`; the spec isn't definitive. A pipeline test fixture using CRLF-in-code-fence has no single correct answer.

**Git `autocrlf` matters.** Per [git-scm.com/docs/gitattributes](https://git-scm.com/docs/gitattributes):

```
core.autocrlf=true:    commit: CRLF → LF;  checkout: LF → CRLF
core.autocrlf=input:   commit: CRLF → LF;  checkout: preserve
core.autocrlf=false:   no conversion either direction
```

A markdown file committed on macOS (LF) appears on a Windows developer's disk as CRLF if `autocrlf=true`. Filesystem-based test fixtures therefore test different bytes depending on checkout config — test arbitraries must generate line-ending variants **in memory** to get deterministic coverage.

**Tradeoffs:** Byte-identity round-trip is unavailable for CRLF inputs; AST-equivalence (parse → stringify → parse ≡ parse) still holds. Filesystem fixtures are non-deterministic across checkout configs; in-memory arbitraries give deterministic coverage.

**Evidence:** [evidence/d4-line-endings.md](evidence/d4-line-endings.md)

### III.3 — Tabs and indented code blocks

**Finding:** The architectural cause of `SKIP_SECTIONS = ["Tabs", "Indented code blocks"]` in a remark-based test corpus is two compounding properties: `mdast-util-to-markdown` defaults `fences: true` (indented code round-trips as fenced output), and micromark discards the column-offset context needed to reconstruct original tab/space layouts before the AST is emitted.

**CommonMark §2.2 rule** ([spec source](https://spec.commonmark.org/0.31.2/#tabs)):
> "Tabs in lines are not expanded to spaces. However, in contexts where spaces help to define block structure, tabs behave as if they were replaced by spaces with a tab stop of 4 characters."

The rule is dual-layered: tabs remain tab bytes, but their "width" for structure detection is column-based. A tab at column 3 fills columns 3→4 (width 2), not 3→7 (width 4). This is the conceptual source of every downstream divergence.

**Per-parser tab handling:**

| Parser | Strategy |
|---|---|
| micromark / remark-parse | Virtual-space tokens (`tab = -2, vs = -1`). `\ta` → `[tab, vs, vs, vs, 'a']`. Structure tokenizers consume column-by-column. |
| markdown-it | No preprocessing; each block rule does ad-hoc column arithmetic. |
| commonmark.js | Historical tab regressions in 0.20→0.21 ([issue #59](https://github.com/commonmark/commonmark.js/issues/59)); spec-divergent dingus behavior on `#\ttest` ([commonmark-spec #678](https://github.com/commonmark/commonmark-spec/issues/678)). |

**Primary cause of SKIP_SECTIONS — `fences: true` default.** [`format-code-as-indented.js`](https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/format-code-as-indented.js) emits indented code **only if** `fences === false` is explicitly set AND the content has no leading/trailing whitespace-only lines. Every indented code block in the CommonMark test corpus therefore round-trips as a fenced block under default settings — the `mdast` tree is preserved but the bytes diverge.

**Compounding cause — tab-column context loss.** micromark's tokenizer preserves tab vs. virtual-space distinctions, but by the time `mdast-util-from-markdown` builds a `code` node, the token stream has collapsed into a string value. The serializer has no way to distinguish "this code block's indent came from `\t`" from "this code block's indent came from four spaces." The default `code` handler emits 4-space indentation unconditionally.

**Secondary consideration — AST-level idempotence usually holds.** Because `stringify(parse(x))` normalizes to fenced output with space indentation, the *second* parse consumes clean, unambiguous input. `parse(parse_output) === parse(x)` typically succeeds. The failure is byte-identity on the first round-trip, not AST divergence on subsequent ones.

**Two OPEN upstream issues (2026-04-19):**

- [commonmark-spec #777](https://github.com/commonmark/commonmark-spec/issues/777) (2024-09, open): Unicode whitespace trimming in paragraphs. cmark preserves NBSP (U+00A0) but strips U+000B / U+000C; commonmark.js trims everything matching `String.prototype.trim()`; micromark strips only U+0020 and U+0009. Three parsers, three behaviors, no spec guidance.
- [commonmark-spec #363](https://github.com/commonmark/commonmark-spec/issues/363) (open): indented code blocks have no info-string mechanism — language-aware downstream tooling is structurally blocked.

**Tradeoffs:** Removing SKIP_SECTIONS from a byte-equality test corpus fails deterministically. Changing the round-trip assertion from byte-equality to AST-equivalence makes most of the skipped section testable. Setting `fences: false` on the stringify step AND adding additional handling for content-starts-with-blank-line cases introduces its own ambiguities — the regex in `format-code-as-indented.js` has three disjoint branches forcing fenced output for several edge cases even when `fences: false` is set.

**Evidence:** [evidence/d5-tabs-indented-code.md](evidence/d5-tabs-indented-code.md)

> **Applicability to a remark-based TS/Bun pipeline today:** A fidelity test suite that currently hardcodes `\n` in arbitrary generators and skips Tab / Indented-code-block sections has three extension levers: (1) add `lineEndingChoice` / `bomPrefix` / `whitespaceIndent` arbitraries (Appendix A, §"For fast-check arbitrary extension"); (2) switch the round-trip assertion to AST-equivalence for the currently-skipped sections; (3) set `fences: false` and accept a narrower set of byte-preservable cases. Each is independent; they compose.

### III.4 — Test vector corpus (28 vectors)

The full 28-vector corpus spanning D3/D4/D5 is preserved in **Appendix A** (below). Each vector includes `input`, `expected_behavior`, `parsers_known_to_diverge`, and a primary-source URL. Breakdown: 8 BOM vectors, 10 line-ending vectors, 10 tab vectors.

The corpus also proposes three extensions for fast-check arbitraries:

1. `lineEndingChoice` (`fc.constantFrom('\n', '\r\n', '\r')`) — per-line selection to generate mixed-ending documents.
2. `bomPrefix` (`fc.constantFrom('', '\uFEFF', '\uFEFF\uFEFF')`) — whole-document prefix.
3. `whitespaceIndent` (`fc.stringOf(fc.constantFrom(' ', '\t'), 0, 8)`) — for indented line starts.

A `midTextBom` generator (5% U+FEFF sprinkle per word) is also proposed for D3 coverage.

**Evidence:** [evidence/test-vector-corpus.md](evidence/test-vector-corpus.md)

---

## Part IV: Pathological Inputs and Cross-Parser Divergence

### IV.1 — Published CVEs and GHSAs (2020+)

**Finding:** 20 advisories captured across the npm markdown parsing/rendering surface in the 2020+ window. ReDoS is the dominant class (~9), followed by XSS (~6), prototype pollution / mXSS (~4 in DOMPurify), and one infinite-loop control-flow bug.

**Most consequential for a remark-based server pipeline today:**

- **[CVE-2021-39199 / GHSA-9q5w-79cv-947m](https://github.com/advisories/GHSA-9q5w-79cv-947m)** — `remark-html` shipped with documentation claiming safe defaults but actually allowed raw HTML pass-through. **CVSS 10.0.** Patched in 13.0.2 / 14.0.1. Any `remark-html` predating these versions is a critical XSS gateway, regardless of input.
- **[CVE-2025-66400 / GHSA-4fh9-h7wg-q85m](https://github.com/advisories/GHSA-4fh9-h7wg-q85m)** — `mdast-util-to-hast` < 13.2.1: triple-backtick code fence with character-reference injection (e.g., `` ```js&#x20;xss ``) leaks extra unprefixed classnames into rendered code blocks. Anything that converts mdast → hast → HTML through this util is exposed.
- **DOMPurify chain CVEs** — Four 2024–2026 advisories:
  - [CVE-2024-48910](https://github.com/advisories/GHSA-p3vf-v8qc-cwcr) (prototype pollution, CVSS v3 9.1 / CVSS v4 9.3)
  - [CVE-2024-45801](https://github.com/advisories/GHSA-mmhx-hmjr-r674) (depth-check bypass + pollution)
  - [CVE-2025-26791](https://github.com/advisories/GHSA-vhxf-7vqr-mrjg) (SAFE_FOR_TEMPLATES regex)
  - [GHSA-h8r8-wccr-v5f2](https://github.com/advisories/GHSA-h8r8-wccr-v5f2) (re-contextualization mXSS via `<xmp>` and friends)
- **`marked` CVEs with public PoC payloads:**
  - [CVE-2022-21680 / GHSA-rrrm-qjm4-v8hf](https://github.com/markedjs/marked/security/advisories/GHSA-rrrm-qjm4-v8hf) — cubic backtracking in `block.def`. PoC: `marked.parse(\`[x]:${' '.repeat(1500)}x ${' '.repeat(1500)} x\`)`.
  - [CVE-2022-21681 / GHSA-5v2h-r2cx-5xgj](https://github.com/markedjs/marked/security/advisories/GHSA-5v2h-r2cx-5xgj) — exponential backtracking in `inline.reflinkSearch`.
  - [CVE-2021-21306 / GHSA-4r62-v4vq-hr96](https://github.com/markedjs/marked/security/advisories/GHSA-4r62-v4vq-hr96) — underscore ReDoS, patched 2.0.0, CVSS 5.3.

**No CVEs against `commonmark.js`, `micromark`, `unified` core, `rehype-raw`, `rehype-stringify`** — confirmed via direct GitHub Advisory Database queries. The architectural choice of state-machine tokenization correlates with this absence.

**Abandoned-plugin risk:** `markdown-it-decorate`, npm `markdown`, and `markdown-pdf` all have advisories with **no available patch**, fixed only by migrating away.

**Evidence:** [evidence/d6.1-cves-ghsas.md](evidence/d6.1-cves-ghsas.md)

### IV.2 — Deep-nesting and stack-overflow bugs

**Finding:** Documented `RangeError: Maximum call stack size exceeded` failures exist for every major JS parser at modest input sizes (a few KB). JS-engine call-stack ceilings are in the single-digit thousands of frames for V8-based runtimes (Node.js, Chrome) and in the tens of thousands for SpiderMonkey (Firefox); exact ceilings vary by engine version and stack-frame size — see [evidence/d6.2-stack-overflow-bugs.md](evidence/d6.2-stack-overflow-bugs.md) for the specific measurements and their sources.

**Concrete reproducers from the public record:**

```js
// marked#1462: blockquote bomb (~5KB input → Node crash)
marked(">".repeat(5000));

// marked#1471: indented list bomb
let s = ''; for (let i = 0, sp = 0; i < 300; i++, sp += 2) s += ' '.repeat(sp) + '- a\n';
marked(s);

// micromark#20: unclosed link bomb
parseMarkdown("[](".repeat(35000));
```

**Mitigation knob inventory:**

| Parser | Depth-limit option | Default |
|---|---|---|
| markdown-it (default) | `maxNesting` | **100** |
| markdown-it (commonmark preset) | `maxNesting` | **20** |
| marked | none | n/a |
| micromark | none | n/a (README recommends 500 KB input cap, worker thread) |
| mdast-util-from-markdown | none | n/a (uses JS-array stack, not call stack) |
| MDX | none | n/a |

**Tradeoffs:** A remark/micromark pipeline has no built-in depth defense. The micromark README's explicit recommendation — cap input at ~500 KB and process in a worker — is a hard constraint, not a soft guideline. No public issue exists for deeply-nested MDX `<A><B><C>...` (~thousands of levels); this is a plausible undisclosed reproducer. The post-processing `unravelLinkedTokens` recursion in micromark ([issue #20](https://github.com/micromark/micromark/issues/20)) is the canonical example that "tokenizer-based ≠ recursion-free."

**Evidence:** [evidence/d6.2-stack-overflow-bugs.md](evidence/d6.2-stack-overflow-bugs.md)

### IV.3 — ReDoS and quadratic-time pathologies

**Finding:** ReDoS is the dominant published vulnerability class. `marked` and `markdown-it` both have multiple confirmed ReDoS CVEs with public PoC payloads. `micromark` has zero direct ReDoS CVEs because its character-by-character state-machine architecture does not use backtracking regexes in the parse hot path.

**Concrete pathological input patterns from the public record:**

| # | Pattern | Targets | Complexity | Source |
|---|---|---|---|---|
| P1 | `'[x]:' + ' '.repeat(1500) + 'x ' + ' '.repeat(1500) + ' x'` | marked `block.def` | Cubic | [CVE-2022-21680](https://github.com/markedjs/marked/security/advisories/GHSA-rrrm-qjm4-v8hf) |
| P2 | `'[x]: x\n' + '[]('.repeat(N)` | marked `inline.reflinkSearch` | Exponential | [CVE-2022-21681](https://github.com/markedjs/marked/security/advisories/GHSA-5v2h-r2cx-5xgj) |
| P3 | `' '.repeat(150_000) + '\n'` | markdown-it `/\s+$/` | Quadratic | [CVE-2022-21670](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-6vfc-qv3f-vr6c) |
| P4 | `'*'.repeat(N) + 'x'` | markdown-it linkify (< 14.1.1; affects 13.x and 14.x pre-14.1.1) | Quadratic+ | [CVE-2026-2327](https://github.com/advisories/GHSA-38c4-r59v-3vqw) |
| P5 | `'!['.repeat(100_000)` (MarkdownTime) | cmark-gfm autolink ext | Polynomial | [GHSA-c2pc-g5qf-rfrf](https://www.legitsecurity.com/blog/dos-via-software-supply-chain-innumerable-projects-exposed-to-a-markdown-library-vulnerability) |
| P6 | `'***' + 'a'.repeat(10_000) + '***...'` | markdown-it emphasis (pre-12.3.0) | Quadratic | [markdown-it CHANGELOG 12.3.0](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md) |

**Quadratic-time non-regex bugs (separate class):**

- CommonMark emphasis delimiter run — markdown-it logged "quadratic complexity in pathological `***...***a***...***`" (12.3.0).
- Reference-link lookup without dedup/hashing — markdown-it 14.1.0 fix.
- Table output explosion — markdown-it 14.1.0.
- MarkdownTime — affects every cmark-gfm-derived renderer.

**Mitigations available:**

- `marked` — no built-in timeout. Official guidance: run on a worker, terminate on slowness.
- `markdown-it` — no built-in timeout. Refactors hot algorithmic paths as bugs surface.
- `micromark` — architectural: no backtracking regex in parse hot path.
- Static analysis: [`recheck`](https://makenowjust-labs.github.io/recheck/) (the same tool that filed CVE-2022-21670/21680/21681).

**Tradeoffs:** ReDoS class is mitigated by architecture for the parser core itself. Quadratic-time non-regex bugs are still a risk — emphasis with many opener/closer interleavings, reference-link lookup at scale. Plugins are the soft underbelly: any `remark-*` or `rehype-*` plugin that uses regex (e.g., for highlight, custom syntax) can re-introduce the class.

**Evidence:** [evidence/d6.3-redos-quadratic.md](evidence/d6.3-redos-quadratic.md)

### IV.4 — Giant-document scaling and memory pressure

**Finding:** All popular JS markdown parsers buffer the whole document. Even micromark's "streaming" interface internally buffers because reference-style links require lookaround. **No published 1 MB / 10 MB / 100 MB head-to-head benchmark exists.** Maintainers explicitly recommend sub-megabyte input caps. The MDX pipeline is the real-world OOM hotspot.

**Throughput data from talk.commonmark.org/16 (CommonMark spec corpus):**

| Parser | ops/sec |
|---|---|
| markdown-it | 986 |
| marked | 729 |
| commonmark.js | 709 |
| showdown.js | 248 |
| micromark (community bench) | 229 — maintainer notes this is ~50% slower than remark-parse used to be |

**Super-linear regime data:**

- Pro Git × 1: ~47 ops/sec
- Pro Git × 20: ~1–2 ops/sec → **20× input → ~25–47× slower**

**Real-world OOM cluster:**

- [Docusaurus #4785 / #8329 / #7410 / #1782](https://github.com/facebook/docusaurus/issues/4785) — webpack + MDX OOM at 1.95 GB heap
- [Astro #4894](https://github.com/withastro/astro/issues/4894) — server hangs to OOM
- [gatsby-mdx #411](https://github.com/ChristopherBiscardi/gatsby-mdx/issues/411) — crash threshold at >1590 MDX lines + PrismJS, Babel emits "code generator deoptimised the styling of undefined as it exceeds the max of 500KB"
- [react-markdown #289](https://github.com/remarkjs/react-markdown/issues/289) — large markdown pegs CPU 100%, blocks event loop
- [remarkjs discussion #1027](https://github.com/orgs/remarkjs/discussions/1027) — virtualization debunked at parse layer (lookahead/lookbehind prevent splitting)

**Tradeoffs:** Default Node 2 GB heap is the de facto ceiling for MDX-heavy workloads. No ecosystem source provides 1 MB / 10 MB / 100 MB benchmarks — any pipeline needing this data has to measure it locally. Server-side parsing for large inputs is the maintainer-recommended posture (vs. client-side react-markdown).

**Evidence:** [evidence/d6.4-giant-document-scaling.md](evidence/d6.4-giant-document-scaling.md)

### IV.5 — Cross-parser divergence concentration

**Finding:** Cross-parser divergence is concentrated in 7 categories: emphasis precedence, reference link resolution, HTML block boundaries, setext-vs-thematic-break ambiguity, autolinks, list tightness, and fenced-code closing rules. The CommonMark spec acknowledges multiple silent or under-specified areas.

**Spec-silent edge cases worth fixture coverage:**

1. **Emphasis "openers_bottom" mod-3 over-application** (`*****Hello*world****`) — [forum #3866](https://talk.commonmark.org/t/i-dont-understand-how-emphasis-is-parsed/3866)
2. **`[foo][ ]` whitespace-only label** — JS family (no link) vs Rust/Go (link) — [forum #4581](https://talk.commonmark.org/t/reference-links-followed-by-space-only-pair-of-brackets/4581)
3. **Code span vs link title precedence** — undocumented but consistent — [forum #8982](https://talk.commonmark.org/t/precedence-of-link-title-over-code-span/8982)
4. **HTML block end-conditions inside other HTML blocks** (`<pre>` inside `<table>`) — [forum #2388](https://talk.commonmark.org/t/end-conditions-within-end-conditions/2388)
5. **List tightness propagation across nesting** — [forum #4622](https://talk.commonmark.org/t/tightness-and-looseness-of-nested-lists/4622)
6. **`<textarea>` HTML block type** — fixed in spec 0.31, but older parsers diverge — [forum #3550](https://talk.commonmark.org/t/textarea-as-multi-line-html-block/3550)
7. **Hard break:** `\\` (kramdown) vs `\` (CommonMark) — both forms in the wild

**Tradeoffs:** A pipeline running `remark-parse` produces specific, predictable outputs for these snippets. Asserting on those outputs as regression tests catches drift if the upstream parser changes behavior to follow a non-JS-family interpretation (e.g., the `[foo][ ]` case).

**Evidence:** [evidence/d7.1-d7.2-babelmark-commonmark-divergences.md](evidence/d7.1-d7.2-babelmark-commonmark-divergences.md)

### IV.6 — GFM-specific divergences

**Finding:** GFM compatibility is three subtly different targets — written spec, cmark-gfm behavior (includes bugs), GitHub.com behavior (adds sanitization layers cmark-gfm doesn't have). Strikethrough single-tilde, table list-vs-table precedence, and pipe-in-code-span-in-table are the most common divergence sources.

**The 5 GFM extension areas with their documented divergences:**

1. **Tables** — list-vs-table precedence undefined ([cmark-gfm #333](https://github.com/github/cmark-gfm/issues/333)); escaped backslash bug ([cmark-gfm #277](https://github.com/github/cmark-gfm/issues/277)); pipe-inside-code-span-in-cell contradicts CommonMark code-span literal-backslash rule ([cmark-gfm #24](https://github.com/github/cmark-gfm/issues/24)); trailing whitespace creates extra empty `<td>` in remark-gfm only ([remark-gfm #11](https://github.com/remarkjs/remark-gfm/issues/11)); blockquote lazy continuation diverges ([remark-gfm #3](https://github.com/remarkjs/remark-gfm/issues/3)).

2. **Strikethrough** — Spec requires `~~text~~`. cmark-gfm/GitHub also accept `~text~` ([cmark-gfm #71](https://github.com/github/cmark-gfm/issues/71)). markdown-it default rejects single tilde. remark-gfm defaults to `singleTilde: true`.

3. **Autolinks** — Trim set excludes quotes per spec; pre-PR-#2673 marked incorrectly trimmed; `www.` autolinks default to `http://` not `https://` per spec ([example 622](https://github.github.com/gfm/#example-622)); position constraints differ across parsers.

4. **Task lists** — All major aligned on `[X]`/`[x]`/`[ ]`. NBSP-in-marker not recognized ([cmark-gfm #192](https://github.com/github/cmark-gfm/issues/192)). Task lists inside table cells: GitHub renders interactively, remark-gfm doesn't ([remark-gfm #27](https://github.com/remarkjs/remark-gfm/issues/27)).

5. **Disallowed raw HTML (tagfilter)** — Nine tags. Application is opt-in for some wrappers. Older marked was case-sensitive (regression). pulldown-cmark (Rust) skipped the extension entirely.

**Tradeoffs:** A pipeline targeting "GFM compatibility" must pick its compatibility target and document it. The list-vs-table precedence case is silently exploitable for content-smuggling tests where intent is ambiguous. DOMPurify is downstream of GFM tagfilter; the two together form the security perimeter.

**Evidence:** [evidence/d7.3-gfm-divergences.md](evidence/d7.3-gfm-divergences.md)

### IV.7 — Curated snippet corpus

**Finding:** A consolidated, lift-and-shift-ready library of 59 cross-parser divergence snippets is organized into 13 test families. Each entry has a short label, exact input, documented divergence behavior, spec/forum reference, and a `test_family` tag for grouping fixtures.

**Test family taxonomy:**

- `emphasis` (7 entries) — `***foo***`, `*b**a***`, `_a_b_c_`, etc.
- `links` (6 entries) — case fold, Unicode fold, `[foo][ ]`, parens-in-destination, etc.
- `html-blocks` (4 entries) — script-inside-list, pre-inside-table, textarea, inline `<del>`
- `setext-vs-hr` (2 entries)
- `autolinks` (11 entries) — bare URL, www, backslash, parens, trailing punctuation
- `lists` (5 entries) — paragraph interruption, nested numeric, blank lines, tight/loose
- `fenced-code` (4 entries) — mismatched lengths, unclosed, indented closing
- `code-spans` (1 entry) — leading/trailing space
- `hard-breaks` (3 entries) — backslash vs spaces vs end-of-paragraph
- `gfm-strikethrough` (3 entries) — single, double, triple tilde
- `gfm-tables` (7 entries) — list precedence, mismatch, code spans, blockquote
- `gfm-tasks` (3 entries) — case, NBSP, in-table
- `disallowed-html` (3 entries) — script, uppercase, plaintext

**Three usage patterns** when integrating as fixtures:

1. Where all major JS parsers agree, the documented behavior is the regression baseline.
2. Where divergence is documented, lift to a "known-divergence" suite — assert that the pipeline produces ONE of the documented behaviors and flag drift.
3. Where a CVE/forum thread documents a *bug* in the pipeline's chosen parser, treat as "currently-broken, do-not-regress-toward-fix" cases.

The full corpus is preserved in **Appendix B** (below) and in [evidence/divergence-corpus.md](evidence/divergence-corpus.md).

### IV.8 — Coverage-guided fuzzing as a complement to PBT

**Finding:** JavaScript's coverage-guided fuzzing (CGF) ecosystem in April 2026 is narrow and single-vendored. Jazzer.js is the only actively-maintained CGF tool for pure-JS user packages. Standard JS coverage tooling does not express the state-transition coverage that characterizes micromark's state-machine tokenizer, and grammar-aware structured mutation has almost no JS implementation. fast-check has no coverage-feedback API, but its primitives could host one as a structured-input decoder inside a Jazzer.js target. Empirical evidence shows CGF payoff concentrates on semantic-stage paths behind a valid-input gate — NOT tokenizers, which is micromark's exact workload.

**CGF ecosystem inventory.**

| Tool | Status (2026-04-19) | Target layer | Relevance to micromark |
|---|---|---|---|
| [Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js) | Active — `@jazzer.js/core@4.0.0` shipped 2026-04-15 | pure-JS user packages (npm) | Only viable option |
| [fuzzitdev/jsfuzz](https://github.com/fuzzitdev/jsfuzz) | Archived 2021-04-30 | — | Dormant |
| [connor4312/js-fuzz](https://github.com/connor4312/js-fuzz) | WIP, never published to npm | — | Not usable |
| [fuzzilli](https://github.com/googleprojectzero/fuzzilli) | Active | JS engine internals (V8, JSC, SpiderMonkey) | Cannot target a user package |

Jazzer.js's Babel instrumentation injects edge counters at function entries, `IfStatement`, `SwitchCase`, loops, `TryStatement`, `LogicalExpression`, `ConditionalExpression` ([coverageVisitor.ts](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/packages/instrumentor/plugins/coverageVisitor.ts)). Weekly downloads of `@jazzer.js/core` in the week of 2026-04-12: 1,486 — modest but non-trivial. A support-continuity flag: [OSS-Fuzz issue #11652](https://github.com/google/oss-fuzz/issues/11652) from 2024-02 described Jazzer.js as "discontinued as open source" — contradicted by the 2026 release cadence but unresolved by any statement from Code Intelligence.

**The state-transition coverage gap.** micromark's state machine is uniquely clean for instrumentation — each "state" is a named JS function with signature `(code: Code) => State | undefined` ([micromark-util-types](https://github.com/micromark/micromark/blob/main/packages/micromark-util-types/index.d.ts)). The 22 CommonMark constructs under `micromark-core-commonmark/dev/lib/` expose ~100–200 distinct state functions (thematic-break has 4 states; code-fenced ~13; attention 2 plus a resolve post-pass). But no JS coverage tool captures `(from-state, to-state)` edges:

- **c8 / nyc / V8 `Profiler.takePreciseCoverage`:** per-function source ranges + execution counts. Records entry, not caller.
- **Jazzer.js Babel instrumentation:** intra-function AST edges only. `state = state(code)` is an indirect call; its target is not a statically-visible branch, so `start → inside → inside` and `start → inside` produce identical edge bitmaps.

The established solution in native fuzzing is [IJON](https://github.com/RUB-SysSec/ijon) (Aschermann et al., IEEE S&P 2020): user-placed C macros (`IJON_STATE`, `IJON_SET`, `IJON_INC`) XOR state values into AFL's coverage bitmap, delivering >20× speedup over plain AFL on the maze benchmark plus qualitative ability to play Super Mario Bros (no ratio reported), and crashing 10 of 22 CGC challenges. **No JS port exists.** Three feasibility pathways, from cheapest to most invasive:

1. **Runtime Proxy wrap** — because `State` returns `State | undefined`, wrap each returned function with `new Proxy(nextFn, handlers)` that records the transition. No source modification, no build tooling. Cheapest PoC.
2. **Babel plugin cloning Jazzer's `functionHooks` pattern** — match state-shaped functions in `micromark-core-commonmark/dev/lib/*.js` and emit `__recordTransition(hash(prev), hash(curr))`. Higher fidelity, higher engineering cost.
3. **V8 Inspector `Debugger.setBreakpoint`** conditional breakpoints on state function first statements. Highest overhead.

**Grammar-aware / structured mutation tooling.** Mutation at three granularities with wildly different tooling maturity:

| Level | What mutates | JS tooling |
|---|---|---|
| **String/bytes** | Raw UTF-8 via bitflips, havoc | Jazzer.js `FuzzedDataProvider`; fast-check `fc.string()` — well-supported |
| **micromark token stream** | `Event[]` / `Token[]` between parse and compile | **NOT FOUND** — no published library; would require custom code against internal `postprocess` events |
| **mdast AST** | parse → mutate → serialize | `mdast-util-from-markdown` + `mdast-util-to-markdown`; [`mdast-util-arbitrary`](https://github.com/ChristianMurphy/mdast-util-arbitrary) for generation |

The mdast pathway has a structural hazard: [`mdast-util-to-markdown`](https://github.com/syntax-tree/mdast-util-to-markdown) explicitly states "complete roundtripping is impossible." An AST-level fuzzer doing `parse → mutate → serialize → re-parse → compare` will encounter false-positive divergences unrelated to real bugs. `mdast-util-arbitrary` is a fast-check *generator* (not a mutator), authored by an individual contributor outside the syntax-tree org. Downloads indicate low community investment: the [unifiedjs.com package listing](https://www.unifiedjs.com/explore/package/mdast-util-arbitrary/) shows ~40 weekly downloads; the [npm registry API](https://api.npmjs.org/downloads/point/last-week/mdast-util-arbitrary) returned 8 for the week of 2026-04-12 (queried 2026-04-19) — likely the unifiedjs figure is a longer-term average vs the npm registry's exact-week count. Native-world grammar-aware fuzzers ([Grammarinator](https://github.com/renatahodovan/grammarinator), [Nautilus](https://github.com/nautilus-fuzz/nautilus), [Domato](https://github.com/googleprojectzero/domato), [Dharma](https://github.com/MozillaSecurity/dharma)) have no JS implementations targeting markdown. Jazzer.js itself has no `LLVMFuzzerCustomMutator` equivalent exposed to JS — custom mutation must live above Jazzer.js, not inside its loop.

A surprising upstream datapoint: [micromark's `package.json` on main](https://raw.githubusercontent.com/micromark/micromark/main/package.json) contains a commented-out fuzz script: `"#": "fuzzer turned off for now as jazzer is unmaintained, with sec vulns"`. The reference is to JVM Jazzer (not Jazzer.js), indicating an older harness that has been disabled. The upstream project is not currently fuzzing itself — which contextualizes finding #8's "zero direct CVEs in micromark parse hot path."

**fast-check + coverage-feedback hybrid.** fast-check's [`Parameters`](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/Parameters.ts) interface exposes `seed`, `randomType`, `numRuns`, `examples`, `path`, `reporter`, `unbiased` — **no field observes coverage, no method ingests feedback.** Maintainer dubzzz flagged a Hypothesis-style test-case database as "accepted feature" in late 2022 ([fast-check#3399](https://github.com/dubzzz/fast-check/issues/3399), open 2026-04). The single fast-check artifact with "fuzz" in the title ([PR #4012 "Fuzzed string"](https://github.com/dubzzz/fast-check/pull/4012), 2023-06) is a new arbitrary, not CGF integration.

Cross-language prior art provides an architectural template:

| Tool | Language | Type | Relevance |
|---|---|---|---|
| [HypoFuzz](https://github.com/Zac-HD/hypofuzz) | Python | Coverage-guided layer over Hypothesis | Closest analog for what a fast-check equivalent would look like |
| [FuzzChick](https://doi.org/10.1145/3360607) (Lampropoulos et al., OOPSLA 2019) | Coq/QuickChick | CGF-PBT hybrid | Orders-of-magnitude speedup on IFC-machine bugs; 4–5× throughput cost |
| [Targeted PBT](https://doi.org/10.1145/3092703.3092711) (Löscher & Sagonas, ISSTA 2017) | Erlang/PropEr | Simulated annealing over user scalar | Scalar-feedback precursor |
| [Hypothesis `target()`](https://github.com/HypothesisWorks/hypothesis/pull/2006) | Python | Scalar hill-climbing | Explicit Löscher-Sagonas citation; NOT branch coverage |

Primitives fast-check *does* expose that could host an integration:
- `randomType: (seed) => RandomGenerator` — a `{ clone, next, jump?, getState }` contract returning 32-bit ints. A Jazzer.js `Buffer` can be packed into this interface so the external fuzzer drives generation deterministically.
- `examples: T[]` — natural insertion point for a corpus of fuzz-derived seeds.
- `seed` + `path` — full replay determinism.
- `reporter` — post-run hook that could compute a coverage delta and persist seeds.

Primitives fast-check does NOT expose: no mutation hook on generated values; no scalar-feedback analog; no runtime-adjustable weights in `fc.oneof`; no test-case database. A "fast-check as structured decoder inside a Jazzer.js target" harness is architecturally coherent today without library changes, but coverage-guided *weight steering* of fast-check arbitraries would require monkey-patching internals.

**Empirical payoff — and why it may not transfer cleanly to a tokenizer.**

| Paper | Venue | Finding relevant to micromark |
|---|---|---|
| [Zest](https://doi.org/10.1145/3293882.3330576) (Padhye et al., ISSTA 2019) | Java parsers | Zest won 1.03–2.81× on *semantic* coverage; **AFL beat Zest 1.1–1.6× on *syntactic* (tokenizer) coverage**; AFL found 10 extra syntactic bugs Zest missed |
| [FuzzChick](https://doi.org/10.1145/3360607) (Lampropoulos et al., OOPSLA 2019) | Coq IFC machine | Vanilla QuickChick "almost always fails to find any bugs," FuzzChick finds them within minutes; ~4–5× throughput cost |
| [Superion](https://doi.org/10.1109/ICSE.2019.00081) (Wang et al., ICSE 2019) | XML + JS engines | +16.7% line coverage, +8.8% function coverage over plain AFL via grammar-awareness |
| [IJON](https://ieeexplore.ieee.org/abstract/document/9152719) (Aschermann et al., IEEE S&P 2020) | Deep state spaces | Plain edge coverage *fails*; one-line `IJON_STATE` annotations → >20× AFL speedup |
| [Böhme et al., ICSE 2023](https://doi.org/10.1109/ICSE48619.2023.00117) | Saturation dynamics | Most branches covered in first 15 min of 23h campaigns; most bugs found AFTER saturation (94% coverage territory) |

The Zest finding is the most directly applicable: CGF-over-PBT gains concentrate on semantic paths behind a valid-input gate. On tokenizer coverage, plain byte-mutation CGF has *beaten* smart generators. micromark is overwhelmingly a tokenizer rather than a compound parser — so the expected CGF gain over fast-check's existing 60+ construct arbitraries × 1000 runs × 3 seeds may be modest and concentrated in state-pair interactions that neither plain CGF nor vanilla PBT explores (requiring the transition-coverage instrumentation above to even observe).

**Translation-to-JS hazards** (informing why native-language evidence may not transfer):
1. Jazzer.js uses Babel-AST source rewrites, not native edge instrumentation — no published study on signal fidelity
2. ESM modules loaded via pure ES paths are NOT instrumented; only CommonJS `require()` is hooked. **micromark publishes as ESM.**
3. Async throughput is lower than sync per [Jazzer.js fuzz-settings docs](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/fuzz-settings.md); no quantified overhead published
4. Only disclosed Jazzer.js parser find in the public record: [protobuf.js CVE-2023-36665](https://www.code-intelligence.com/blog/cve-protobufjs-prototype-pollution-cve-2023-36665) — single datapoint
5. No published JS-specific empirical study of CGF vs PBT on a tokenizer — NOT FOUND

**Practical harness architecture.** Target code is ~10 lines:

```js
const { FuzzedDataProvider } = require("@jazzer.js/core");
const { micromark } = require("micromark");
module.exports.fuzz = function (fuzzerInputData /* Buffer */) {
    micromark(fuzzerInputData.toString("utf-8"));
};
```

CLI: `npx jazzer fuzz-target ./corpus -- -max_len=512000 -max_total_time=1800` — the 500KB cap from micromark's README maps directly to libFuzzer's `-max_len`. Crash files land in `./[testFileName]/[describeBlock]/[testName]/` and can be committed to the repo + replayed as individual Jest test cases ([Jazzer.js jest-integration](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md)).

CI gating patterns: [OSS-Fuzz CIFuzz](https://google.github.io/oss-fuzz/getting-started/continuous-integration/) is PR-only at 600s budget; [ClusterFuzzLite](https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/) adds batch/prune/coverage cron modes — but **JavaScript is NOT in ClusterFuzzLite's supported-language list**, so any Jazzer.js CI workflow is hand-rolled. Worker-thread isolation via Node's `worker_threads.resourceLimits` (`maxOldGenerationSizeMb`, `stackSizeMb`, `worker.terminate()`) composes with Jazzer.js but is undocumented as a unified pattern. [Piscina](https://github.com/piscinajs/piscina) supports `resourceLimits` + `AbortController`-based cancellation but does not mention fuzzing in its docs.

**Integration points Jazzer.js does NOT support:** Bun (undocumented), Vitest ([issue #343](https://github.com/CodeIntelligenceTesting/jazzer.js/issues/343), open since 2023-02-23; only Jest has first-class `@jazzer.js/jest-runner`).

**Tradeoffs (layout, not ranking):**
- Plain Jazzer.js on micromark: low-cost harness, likely early coverage saturation (per Zest tokenizer-stage evidence), signal concentrated on bytes-in-bytes-out bugs that fast-check already catches with 60+ arbitraries.
- Jazzer.js + runtime Proxy state-transition wrapper: first-of-kind instrumentation, observes state-pair coverage, addresses the IJON critique — but no published precedent and no empirical baseline.
- fast-check as structured decoder inside Jazzer.js target: architecturally coherent with current primitives, deterministic replay, but no precedent either; depends on libFuzzer's byte mutator producing useful variation after fast-check decoding (unevaluated).
- Deferring: fast-check at 1000 runs × 3 seeds with 60+ arbitraries already provides strong baseline signal on tokenizer stage; the incremental fuzz bugs are speculative until an empirical run on a real tokenizer target (Zac-HD's HypoFuzz + Hypothesis comparisons on Python parsers would be the closest external anchor, but doesn't translate directly).

**Evidence:** [evidence/micromark-fuzzing-target.md](evidence/micromark-fuzzing-target.md)

---

## Cross-Cutting Synthesis

Six themes emerge from the convergence of findings across Parts I–V.

### Theme A: Architectural choice beats per-bug patching in the JS parser landscape

Multiple independent findings point to the same pattern: once a parser commits to an architecture, the safety properties (or hazards) follow structurally. micromark's character-by-character state-machine tokenization has zero direct ReDoS CVEs (§IV.3) because the class is eliminated by construction — no retrofit of `marked` or `markdown-it` can achieve this without rewriting the tokenizer core. `remark-stringify`'s LF-only emission (§III.2) is architectural: no configuration option restores byte-level CRLF round-trip because the AST discards the distinction. `mdast-util-to-markdown`'s `fences: true` default (§III.3) is architectural in the same sense: the `code` node preserves content but not indentation shape, so the serializer has no information to reconstruct from.

The implication: testing strategies that assume "bugs in parsers are fixable in userland" (e.g., shim layers, pre-processors, config flags) have limited leverage on architectural properties. Strategies that align the test assertion with the architecture available (AST-equivalence rather than byte-equality for round-trip; HTML-oracle rather than AST-oracle for cross-parser diff) extract more signal from the tests the pipeline can realistically run.

### Theme B: "Building blocks exist but no harness exists" across every dimension

Four clusters, four versions of the same observation. **Mutation testing:** Stryker-js is mature, fast-check is mature, ecosystem integration patterns are documented — but no public parser/serializer adopter has wired them together (§I.5). **Differential testing:** CommonMark corpus is npm-packaged, AST normalizers are npm-packaged, `html-differ` is npm-packaged, fast-check equivalence is a documented pattern — but no GitHub repo runs ≥2 parsers against shared inputs (§II.4). **Whitespace edge cases:** every parser's source code documents its behavior on BOM/CRLF/Tabs — but no consolidated test-vector library existed before this research (§III.4, Appendix A). **Cross-parser divergence:** Babelmark3 reproduces snippets live, talk.commonmark.org threads document reconciled behavior — but no curated, lift-and-shift fixture library existed until this report (§IV.7, Appendix B).

The gap between "all building blocks exist" and "a harness exists" is assembly, not research. Every tool referenced in this report is production-quality, actively maintained, and installable from npm today. The missing piece is the coupling layer — the ~200-line test files that wire the primitives together for a specific pipeline's needs.

### Theme C: Round-trip byte-identity is architecturally impossible for specific cases; AST-equivalence is the available oracle

Three independent findings converge on the same operational implication. **CRLF inputs cannot byte-round-trip** (§III.2) because `remark-stringify` emits LF only — a closed-wontfix by maintainer choice. **Indented code blocks cannot byte-round-trip** under default settings (§III.3) because `fences: true` normalizes them. **mdast-util-to-markdown explicitly disclaims roundtrip fidelity** for arbitrary AST content (§II.3) — the serializer's normalization is intentional, not accidental. Meanwhile, **mutation-testing signal on serializer delimiters** (§I.2, `StringLiteral → ""`) surfaces cases where round-trip tolerance was too permissive — a complementary view of the same boundary.

The available oracle, given these architectural facts, is AST-equivalence: `parse(stringify(parse(x))) ≡ parse(x)`. This is a strictly weaker claim than byte-identity, but it is strictly available. Any test-suite design that enforces byte-identity on CRLF/tab/indented-code inputs will produce deterministic false failures. Any suite that enforces AST-equivalence in those cases extracts the testable signal.

### Theme D: CommonMark spec silence is where cross-parser divergence concentrates

Across Parts II–IV, the divergent categories are also the spec-silent ones. **BOM (U+FEFF)** is implementation-defined (§III.1) — parsers diverge. **`[foo][ ]` whitespace-only label** is spec-silent (§IV.5) — JS family says "not a link," Rust/Go say "link." **Emphasis `openers_bottom` mod-3 rule** produces counterintuitive output that major parsers agree on but which the spec doesn't positively document (§IV.5, corpus entry `em-strong-asymmetry`). **Tab handling §2.2** is spec-defined but the `mdast-util-to-markdown` serialization is not (§III.3). **GFM compatibility** has three interpretations (written spec, cmark-gfm, GitHub.com) (§IV.6) — precisely because the spec was written to formalize pre-existing behavior.

The operational implication: spec silence is a reliable predictor of cross-parser divergence. A pipeline that locks expected behavior to its current parser's interpretation of spec-silent cases produces predictable output, at the cost of being ecosystem-divergent if the parser changes to follow a different interpretation upstream. The test-family tagging in Appendix B (`test_family: emphasis`, `test_family: gfm-tables`, etc.) is structured to make these categories visible — so that upstream parser drift on spec-silent cases surfaces as a specific fixture failure rather than a mysterious regression.

### Theme E: Test-runner choice propagates through every mutation-testing economic decision

The bun-runner vs vitest-migration question (§I.6) isn't a local tooling choice — it compounds with every downstream parameter of a mutation-testing campaign. Runner choice constrains `coverageAnalysis` mode (via the runner's supported features); `coverageAnalysis` mode governs the per-mutant wall-clock; wall-clock governs campaign cadence; cadence governs the time-to-bug-discovery curve (per Böhme et al. 2023 saturation dynamics — branch coverage saturates within ~15 min of a 23h campaign, but >50% of bugs are found in the last two-thirds of the campaign as coverage moves from ~90% to ~94%, §IV.8 — so bug discovery decouples from coverage growth). With the published 0.4.0 source-read confirming `perTest` support (§Exec #13, [evidence/stryker-bun-runner-source-read.md](evidence/stryker-bun-runner-source-read.md)), a bun-primary codebase can place itself on this curve once the 2-3× process-pool claim is empirically verified on a parser-shaped suite. The remaining residual risk is future-direction — the v1.0.0 rewrite on main branch is presently incomplete, so a durable choice involves pinning to 0.4.0 or accepting a watch on the plugin's publish pipeline. The broader pattern: *adoption-path decisions in mutation testing propagate multiplicatively*, which is why the Sentry Core SDK 60-min → 25-min datapoint (§I.6) dominates the literature rather than "perTest is 40-60% faster" in isolation.

### Theme F: Coverage-guidance helps on semantic paths; tokenizers saturate early regardless

The empirical evidence from Zest (ISSTA 2019), FuzzChick (OOPSLA 2019), and IJON (S&P 2020) synthesizes into a consistent pattern relevant to micromark: coverage-guided feedback materially beats random/PBT generation on *semantic* paths behind a valid-input gate, but on *syntactic/tokenizer* paths plain byte-mutation can actually outperform smart generators (§IV.8). micromark is a tokenizer — not a compound parser with deep semantic stages — which makes the expected CGF-over-PBT gain modest and concentrated on state-pair interactions. That state-pair space is invisible to standard JS coverage tools (c8, nyc, V8 Inspector, Jazzer.js Babel) — observing it requires IJON-style annotation, which has no JS port. The practical ceiling in JS, absent first-of-kind instrumentation, is the intersection of "tokenizer stage" (where CGF advantage shrinks) and "no transition observability" (where CGF can't target the one category where it would help). The result: empirical transfer of native-language CGF results to a pure-JS micromark target is speculative until someone runs the comparison.

---

## Conflicts & Disagreements

**One factual contradiction surfaced during the followup pass** (Exec Summary #13, now resolved): the parent's initial Part I framing stated `stryker-mutator-bun-runner` runs with `coverageAnalysis: "off"`; the plugin author's upstream-adoption issue ([stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424)) advertises "Smart coverage analysis with perTest coverage support." A direct source-read of the published 0.4.0 tarball performed 2026-04-19 (documented in [evidence/stryker-bun-runner-source-read.md](evidence/stryker-bun-runner-source-read.md)) confirms the plugin does implement `perTest` — the `src/coverage/` module ships 479 LOC implementing Stryker's `__stryker__` preload protocol + `TestFilter` test-selection logic. Parent Finding #1's characterization was incorrect; the upstream-issue claim matched shipping functionality. Finding #1 and §I.6 have been updated; the GitHub main-branch v1.0.0 rewrite is noted as a future-direction risk (currently a `// TODO` stub in `MutationActivator`).

No other factual conflicts surfaced across Parts I–V. The clusters investigate distinct subject areas (mutation-testing tooling, differential-testing ecosystem, whitespace edge cases, pathological inputs, runner economics, fuzzing) with minimal overlap; where overlap exists (fast-check usage, micromark architecture, `mdast-util-to-markdown` behavior), the findings are complementary.

**Conclusion-level tensions** worth noting (both positions valid under different framings):

- **Per-test coverage as runtime lever (§I.3) vs. bun retention (§I.1, §I.6):** `coverageAnalysis: "perTest"` delivers a measured 1.7–2.5× speedup (corrected in §I.6, down from the parent's initial "largest multiplier" framing). The bun community plugin's `perTest` support is confirmed in the published 0.4.0 via direct source-read (Exec Summary #13, [evidence/stryker-bun-runner-source-read.md](evidence/stryker-bun-runner-source-read.md)). The remaining tension is durability risk: the plugin's GitHub main branch is an incomplete v1.0.0 rewrite, so a bun-primary adoption pins to the 0.4.0 tarball while watching the plugin's publish pipeline. Option 3b hybrid (§I.6) is available as a fallback that treats the plugin as replaceable — keeping bun for dev + primary CI while running Stryker with vitest-runner in a separate nightly workflow — the tension becomes resource-allocation rather than forced-choice.
- **Byte-identity vs. AST-equivalence round-trip (§II.3, §III.2, §III.3):** Byte-identity detects more regressions but produces deterministic failures on CRLF/tab/indented-code inputs; AST-equivalence is weaker but uniformly available. Both are defensible test-assertion designs; neither is "correct."
- **HTML oracle vs. AST oracle for differential testing (§II.6):** HTML oracle catches rendering-output bugs but not AST-shape bugs; AST oracle catches AST-shape bugs but requires compatible dialect. The optimal choice depends on which bug class the pipeline values; both have been used in the academic and Rust-ecosystem literature.
- **Coverage-guided fuzzing as additive vs. redundant for tokenizers (§IV.8):** Zest (ISSTA 2019) empirics show plain byte-mutation CGF *beat* smart generators on syntactic/tokenizer coverage, suggesting plain Jazzer.js may add little on top of fast-check's 60+ arbitraries × 1000 runs × 3 seeds. IJON (S&P 2020) shows plain edge coverage fails on deep state spaces without transition-pair instrumentation — which has no JS port. Both positions are empirically supported; the operational implication is that fuzz-vs-PBT on micromark specifically remains an open empirical question.

---

## Limitations & Open Questions

### Dimensions searched but returning negative results or uncertainty

**Part I:**
- **Community bun runner real-world perf vs. official jest/vitest runners:** no independent benchmark as of 2026-04-19.
- **PR #5931 merge timeline:** UNCERTAIN.
- **Composed effect of `perTest + incremental + narrowed --mutate + ignoreStatic + tuned concurrency`:** asserted by multiple tutorials; no isolated public benchmark on a ~500-LOC core / ~4K-LOC suite.
- **Per-tsconfig-flag impact on mutant elimination:** only three auto-overridden flags documented. How `strict` vs. `strictNullChecks` individually shape mutant counts is NOT FOUND.
- **Equivalent-mutant rate for parser code vs. business-logic code:** no published ratio.

**Part II:**
- **D2.4 concrete JS harness example:** no public repo found. Searches: GitHub code search `"markdown-it" "remark-parse"` in test files; npm search `markdown-differential`, `parser-diff`; CommonMark discussion archives; conference talks.
- **No public `fc-markdown-arbitrary` package** — every project building this pattern rolls its own generator.
- **Exact count of GFM-only extension tests** (separate from inherited CommonMark tests) not published in cmark-gfm's repo.
- **Shrinker effectiveness on markdown inputs:** empirically untested in public work.

**Part III:**
- **remark-frontmatter + double-BOM interaction:** no direct bug report exists. The failure mode is inferred from source reading.
- **Microsoft Word's "Save as .md" BOM emission behavior:** NOT FOUND.
- **remark-mdx-agnostic / remark-wiki-link line-ending sensitivity:** not tested.
- **Full `fences: false` behavior matrix** for `format-code-as-indented.js` edge cases: 3 disjoint branches; full matrix not collected.

**Part IV:**
- **Exact per-parser HTML for every divergence snippet:** documented from spec/forum references, not from current parser execution. Running the corpus through a live harness would convert these to assertion-grade fixtures.
- **MDX deep-nesting reproducer** (`<A><B><C>...` × thousands): no public issue; plausibly undisclosed.
- **GitHub.com renderer's full behavior:** closed source, observable only. GitHub adds sanitization, URL scrubbing, mention/emoji autolinking on top of cmark-gfm. The exact diff is not catalogued in any public source surveyed.
- **No published benchmark comparing memory growth O(n) vs O(n²)** across parsers on adversarial inputs.

### Out of scope (per rubric)

- First-party codebase analysis beyond Applicability callouts (external findings only)
- Rust-specific pre-work: cargo-mutants, markdown-rs NAPI/WASM bindings, JS↔Rust parser divergence research (explicitly dropped from the rubric)
- Broader PBT tooling alternatives beyond fast-check
- Recommendation rankings on which option to adopt or which fixtures to prioritize

---

## References

### Evidence Files

**Part I — Mutation testing:**
- [evidence/stryker-ts-integration.md](evidence/stryker-ts-integration.md) — Stryker-js + TS integration, bun compatibility, real adopter configs
- [evidence/mutation-operators-parsers.md](evidence/mutation-operators-parsers.md) — Mutator categories, parser-domain signal ranking, equivalent-mutant patterns
- [evidence/runtime-cost-strategies.md](evidence/runtime-cost-strategies.md) — Incremental mode, glob scoping, concurrency, Sentry wall-clock data, CI tier patterns
- [evidence/stryker-fastcheck-interaction.md](evidence/stryker-fastcheck-interaction.md) — Mutant lifecycle, seed determinism, shrinking under mutation, Vitest #5714 bug
- [evidence/adopter-examples.md](evidence/adopter-examples.md) — Ecosystem adoption (remark/markdown-it/Prettier/ProseMirror), Sentry SDK case study, Stryker maintenance signals

**Part II — Differential testing:**
- [evidence/d2-1-differential-harness-patterns.md](evidence/d2-1-differential-harness-patterns.md) — Babelmark3 architecture, AST dialect divergences, micromark-remark-parse relationship
- [evidence/d2-2-commonmark-spec-fixture.md](evidence/d2-2-commonmark-spec-fixture.md) — spec.txt format, JSON packages, GFM/MDX/wiki-link coverage
- [evidence/d2-3-ast-diff-normalization.md](evidence/d2-3-ast-diff-normalization.md) — unist-util-remove-position, mdast-util-compact, html-differ, always-differ categories
- [evidence/d2-4-concrete-harness-examples.md](evidence/d2-4-concrete-harness-examples.md) — Negative finding, Skepfyr/rust-parser-fuzz precedent, MdPerfFuzz, JFuzz
- [evidence/d2-5-fast-check-pbt.md](evidence/d2-5-fast-check-pbt.md) — fc.letrec, equivalence pattern, shrinker limitations, generation strategies

**Part III — Whitespace edge cases:**
- [evidence/d3-bom-handling.md](evidence/d3-bom-handling.md) — BOM edge cases, parser behavior matrix, js-yaml interaction
- [evidence/d4-line-endings.md](evidence/d4-line-endings.md) — CRLF/LF/CR handling, stringify limitations, git/editor implications
- [evidence/d5-tabs-indented-code.md](evidence/d5-tabs-indented-code.md) — SKIP_SECTIONS root cause, tab expansion algorithm, spec examples
- [evidence/test-vector-corpus.md](evidence/test-vector-corpus.md) — 28 concrete test vectors spanning BOM / line endings / tabs

**Part IV — Pathological inputs + divergence:**
- [evidence/d6.1-cves-ghsas.md](evidence/d6.1-cves-ghsas.md) — 20 CVEs/GHSAs with PoC payloads, CWE classes, and patch versions
- [evidence/d6.2-stack-overflow-bugs.md](evidence/d6.2-stack-overflow-bugs.md) — Issue-tracker reports and architectural notes per parser
- [evidence/d6.3-redos-quadratic.md](evidence/d6.3-redos-quadratic.md) — ReDoS catalog + 11 pathological input patterns
- [evidence/d6.4-giant-document-scaling.md](evidence/d6.4-giant-document-scaling.md) — Benchmarks, OOM incident reports, MDX scaling notes
- [evidence/d7.1-d7.2-babelmark-commonmark-divergences.md](evidence/d7.1-d7.2-babelmark-commonmark-divergences.md) — Spec ambiguity inventory and forum-reconciled threads
- [evidence/d7.3-gfm-divergences.md](evidence/d7.3-gfm-divergences.md) — GFM extension-by-extension divergence notes
- [evidence/divergence-corpus.md](evidence/divergence-corpus.md) — 59-entry curated snippet corpus

**Part V — Followup: Economics + Fuzzing as PBT Complement:**
- [evidence/stryker-bun-vs-vitest-economics.md](evidence/stryker-bun-vs-vitest-economics.md) — perTest real-world speedup (1.7-2.5×), Sentry 60→25 min Core-SDK datapoint, stryker-mutator-bun-runner npm/GitHub reality, bun→vitest migration compatibility matrix, Option 3b hybrid pattern, break-even sketch
- [evidence/micromark-fuzzing-target.md](evidence/micromark-fuzzing-target.md) — JS CGF ecosystem (Jazzer.js solo-active, competitors inventory), micromark `State` type + construct state-count inventory, state-transition instrumentation pathways, grammar-aware JS-only gap, `mdast-util-arbitrary` reality, fast-check coverage-feedback primitives + HypoFuzz analog, Zest/FuzzChick/Superion/IJON/Böhme empirical evidence, translation-to-JS hazards

### External Primary Sources (selected)

**Stryker-js:**
- [Stryker Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [Stryker TypeScript Checker](https://stryker-mutator.io/docs/stryker-js/typescript-checker/)
- [Stryker Incremental mode](https://stryker-mutator.io/docs/stryker-js/incremental/)
- [Stryker Supported Mutators](https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/)
- [Announcing Stryker 4.0 — Mutation Switching](https://stryker-mutator.io/blog/announcing-stryker-4-mutation-switching/)
- [Stryker JS v6 — Expeditious Superior Mutations](https://stryker-mutator.io/blog/stryker-js-v6-expeditious-superior-mutations/)
- [stryker-js#4439 bun runner](https://github.com/stryker-mutator/stryker-js/issues/4439)
- [stryker-js#5714 Vitest/fast-check](https://github.com/stryker-mutator/stryker-js/issues/5714)
- [oven-sh/bun#26191 test runner API](https://github.com/oven-sh/bun/issues/26191)
- [stryker-mutator-bun-runner@0.4.0](https://www.npmjs.com/package/stryker-mutator-bun-runner)

**fast-check / pure-rand:**
- [fast-check.dev](https://fast-check.dev/)
- [fast-check Parameters API](https://fast-check.dev/api-reference/interfaces/Parameters.html)
- [fast-check recursive structures](https://fast-check.dev/docs/core-blocks/arbitraries/combiners/recursive-structure/)
- [dubzzz/fast-check-examples](https://github.com/dubzzz/fast-check-examples)
- [pure-rand README](https://github.com/dubzzz/pure-rand/blob/main/README.md)

**Parsers and AST:**
- [remarkjs/remark](https://github.com/remarkjs/remark)
- [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it)
- [micromark/micromark](https://github.com/micromark/micromark)
- [markedjs/marked](https://github.com/markedjs/marked)
- [commonmark/commonmark.js](https://github.com/commonmark/commonmark.js)
- [syntax-tree/mdast](https://github.com/syntax-tree/mdast)

**Test fixtures / normalizers:**
- [commonmark/commonmark-spec](https://github.com/commonmark/commonmark-spec)
- [wooorm/commonmark.json](https://github.com/wooorm/commonmark.json)
- [github/cmark-gfm](https://github.com/github/cmark-gfm)
- [GFM Spec](https://github.github.com/gfm/)
- [syntax-tree/unist-util-remove-position](https://github.com/syntax-tree/unist-util-remove-position)
- [syntax-tree/mdast-util-compact](https://github.com/syntax-tree/mdast-util-compact)
- [syntax-tree/mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown)
- [markedjs/html-differ](https://github.com/markedjs/html-differ)

**CommonMark spec and discussion:**
- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)
- [CommonMark §2.1 Characters and lines](https://spec.commonmark.org/0.31.2/#characters-and-lines)
- [CommonMark §2.2 Tabs](https://spec.commonmark.org/0.31.2/#tabs)
- [talk.commonmark.org](https://talk.commonmark.org/)
- [Babelmark3](https://babelmark.github.io/)

**OPEN upstream bugs (2026-04-19):**
- [commonmark/cmark #550 list marker CRLF](https://github.com/commonmark/cmark/issues/550)
- [commonmark/commonmark-spec #640 CRLF in code block](https://github.com/commonmark/commonmark-spec/issues/640)
- [commonmark/commonmark-spec #777 Unicode whitespace](https://github.com/commonmark/commonmark-spec/issues/777)

**Closed / historical bugs:**
- [remarkjs/remark #660 LF-only output](https://github.com/remarkjs/remark/issues/660)
- [remarkjs/remark #195 CR infinite loop](https://github.com/remarkjs/remark/issues/195)
- [nodeca/js-yaml #179 BOM handling](https://github.com/nodeca/js-yaml/issues/179)
- [talk.commonmark.org 1832 BOM treatment](https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832)

**CVE / advisory databases:**
- [GitHub Advisory Database](https://github.com/advisories)
- [NVD](https://nvd.nist.gov/vuln/search)
- [Snyk](https://security.snyk.io)

**Case studies:**
- [Sentry — Mutation-testing our JS SDKs](https://sentry.engineering/blog/js-mutation-testing-our-sdks) — canonical real-world reference
- [OneUptime — Mutation Testing with Stryker](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
- [prodSens — Pitfalls of Test Coverage](https://prodsens.live/2026/02/01/the-pitfalls-of-test-coverage-introducing-mutation-testing-with-stryker-and-cosmic-ray/)

**Adjacent research:**
- [Skepfyr/rust-parser-fuzz](https://github.com/Skepfyr/rust-parser-fuzz) — differential fuzzing architectural blueprint
- [cuhk-seclab/MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz) — ASE '21 markdown differential fuzzing
- [LLM-based JSON Parser Fuzzing (JFuzz)](https://arxiv.org/html/2410.21806v1)

---

## Appendix A — Whitespace Test Vector Corpus (28 vectors)

Every vector is a concrete markdown string suitable for use in property-based tests or fixture files. Escape sequences are in JavaScript string literal form. Columns:

- **input**: the literal markdown string
- **expected_behavior**: what a conformant parser (interpreted charitably for the unified/remark stack) should do
- **parsers_known_to_diverge**: where observable outputs differ between major parsers
- **source**: URL of spec example or bug report motivating this case

### A.1 — BOM (8 vectors)

**1. Leading UTF-8 BOM alone**
```
input: "\uFEFF"
expected_behavior: micromark/remark-parse → empty document; markdown-it/marked/commonmark.js → emits single-paragraph containing U+FEFF
parsers_known_to_diverge: [remark-parse vs markdown-it/marked/commonmark.js]
source: https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js
```

**2. Leading BOM before ATX heading**
```
input: "\uFEFF# Heading"
expected_behavior: remark-parse → <h1>Heading</h1> (BOM stripped); markdown-it/marked → paragraph with U+FEFF prefix, "#" at column 2 so heading detection fails
parsers_known_to_diverge: [remark-parse vs markdown-it/marked]
source: https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js
```

**3. Mid-text BOM preserved**
```
input: "# hea\uFEFFding"
expected_behavior: remark-parse (string input) → heading with U+FEFF in text; remark-parse (stream input via TextDecoder) → heading WITHOUT U+FEFF (TextDecoder auto-strips internal BOMs)
parsers_known_to_diverge: [remark-parse string vs remark-parse stream — SAME parser, different input modes]
source: https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js
```

**4. Leading BOM before YAML frontmatter fence**
```
input: "\uFEFF---\ntitle: test\n---\n\nbody"
expected_behavior: remark-parse + remark-frontmatter → frontmatter detected (micromark strips leading BOM; fence lands at col 1)
parsers_known_to_diverge: [no known divergence within remark; other stacks may differ]
source: https://github.com/micromark/micromark (preprocess.js) + https://github.com/remarkjs/remark-frontmatter
```

**5. BOM inside YAML frontmatter value**
```
input: "---\ntitle: hello\uFEFFworld\n---\n"
expected_behavior: remark-frontmatter extracts "---\ntitle: hello\uFEFFworld\n---"; js-yaml parses value as literal "hello\uFEFFworld" with embedded BOM (js-yaml does NOT strip)
parsers_known_to_diverge: [depends on whether caller feeds value through yaml.load — if yes, BOM is preserved in the key's string]
source: https://github.com/nodeca/js-yaml/issues/179
```

**6. BOM as the first character of a frontmatter KEY (via concatenation)**
```
input: "---\n\uFEFFkey: value\n---\n"
expected_behavior: js-yaml parses key as literal "\uFEFFkey" (not "key"); downstream code looking up frontmatter.key will fail silently
parsers_known_to_diverge: [this is a js-yaml quirk — all remark stacks inherit it]
source: https://github.com/nodeca/js-yaml/issues/179
```

**7. Double BOM from file concatenation**
```
input: "\uFEFF\uFEFF# title"
expected_behavior: micromark strips first BOM, second survives as mid-text. "#" is now at column 2, not column 1 → heading NOT detected → paragraph with "\uFEFF# title"
parsers_known_to_diverge: [all parsers fail similarly; this is NOT a parser bug, it's a data-hygiene issue from cat a.md b.md]
source: https://github.com/micromark/micromark (preprocess.js uses one-shot start flag — no loop)
```

**8. Indented code after leading BOM**
```
input: "\uFEFF    code line"
expected_behavior: remark-parse → indented code block with content "code line" (BOM stripped, 4 spaces trigger code); other parsers that preserve BOM → paragraph with "\uFEFF    code line"
parsers_known_to_diverge: [remark-parse vs markdown-it/marked]
source: https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832
```

### A.2 — Line endings (10 vectors)

**9. CRLF at EOF, no trailing newline**
```
input: "# Heading\r\n"
expected_behavior: Parse as heading. Stringify emits "# Heading\n" (LF only). Round-trip is NOT byte-identical.
parsers_known_to_diverge: [no parse-time divergence; stringify divergence is the issue]
source: https://github.com/remarkjs/remark/issues/660
```

**10. Hard break with two spaces + CRLF**
```
input: "foo  \r\nbaz\r\n"
expected_behavior: Single paragraph with hard break (<br />) between "foo" and "baz". Stringify emits canonical hard-break form with LF.
parsers_known_to_diverge: [remark-lint historically false-flagged this as 3 trailing spaces]
source: https://spec.commonmark.org/0.31.2/#example-633 + https://github.com/remarkjs/remark-lint/issues/55
```

**11. Backslash hard break with CRLF**
```
input: "foo\\\r\nbaz\r\n"
expected_behavior: Hard break between "foo" and "baz"; round-trip serialization emits LF-only output.
parsers_known_to_diverge: [none known]
source: https://spec.commonmark.org/0.31.2/#example-634
```

**12. Mixed line endings within one document**
```
input: "line1\nline2\r\nline3\rline4\n"
expected_behavior: Four-line paragraph with soft breaks. All parsers produce identical AST (mixed endings normalize to soft-break boundary). Stringify emits LF throughout.
parsers_known_to_diverge: [markdown-it and commonmark.js normalize before parse; micromark preserves distinct codes in tokenizer but mdast tree is indistinguishable]
source: https://spec.commonmark.org/0.31.2/#characters-and-lines
```

**13. Fenced code block with CRLF content**
```
input: "```\r\nx\r\ny\r\n```\r\n"
expected_behavior: Code node with value "x\ny" (normalized to LF per mdast). Stringify emits LF fences.
parsers_known_to_diverge: [commonmark-spec#640 is an OPEN ambiguity on whether CRLF in code block content should survive]
source: https://github.com/commonmark/cmark/issues/72 + https://github.com/commonmark/commonmark-spec/issues/640
```

**14. Lone CR (old-Mac) separator**
```
input: "para1\rpara2\r"
expected_behavior: Two paragraphs per spec §2.1 (CR alone is a valid line ending). Historical regression: remark #195 reported an infinite loop on this input in the old parser.
parsers_known_to_diverge: [remark-parse works today; markdown-it normalizes CR to LF before parse]
source: https://spec.commonmark.org/0.31.2/#line-ending + https://github.com/remarkjs/remark/issues/195
```

**15. CRLF inside list markers (cmark #550 OPEN)**
```
input: "- item1\r\n- item2\r\n"
expected_behavior: Two-item unordered list.
parsers_known_to_diverge: [cmark still has OPEN bug #550 where list-marker code compares literally to '\n' and misses CRLF; remark/micromark handles correctly]
source: https://github.com/commonmark/cmark/issues/550
```

**16. No trailing newline at EOF**
```
input: "# H"
expected_behavior: Single heading node. Stringify adds a trailing LF that the input lacked. Round-trip is NOT byte-identical.
parsers_known_to_diverge: [none; this is a stringify-side quirk]
source: https://spec.commonmark.org/0.31.2/#line
```

**17. Empty document with just CRLF**
```
input: "\r\n"
expected_behavior: Empty AST (zero-child root). Stringify emits empty string or "\n" depending on handling.
parsers_known_to_diverge: [edge case for ensureNonEmptyDoc-style logic]
source: https://spec.commonmark.org/0.31.2/#characters-and-lines
```

**18. Hard-break backslash immediately before CR (no LF)**
```
input: "foo\\\rbaz"
expected_behavior: Same as LF case — hard break between foo and baz. Stresses that §6.7 applies to any line ending including bare CR.
parsers_known_to_diverge: [untested in most parser CI; bare CR is rare]
source: https://spec.commonmark.org/0.31.2/#hard-line-breaks + inferred from §2.1 abstract definition
```

### A.3 — Tabs (10 vectors)

**19. Bare leading tab → indented code**
```
input: "\tfoo\tbaz\t\tbim\n"
expected_behavior: Parses as indented code block with content "foo\tbaz\t\tbim". Round-trip via remark-stringify with fences: true (DEFAULT) emits as FENCED, not indented — idempotence fails.
parsers_known_to_diverge: [parser-level: agreement; stringify-level: fences default breaks round-trip]
source: https://spec.commonmark.org/0.31.2/#example-1
```

**20. Partial tab — 2 spaces + tab fills column 4**
```
input: "  \tfoo\tbaz\t\tbim\n"
expected_behavior: Same HTML as Example 1. The "  \t" sequence collapses to 4 columns of indentation because the tab fills columns 2→4.
parsers_known_to_diverge: [historical cmark/commonmark.js bugs on this exact example]
source: https://spec.commonmark.org/0.31.2/#example-2
```

**21. Two tabs in list continuation — residue becomes content**
```
input: "- foo\n\n\t\tbar\n"
expected_behavior: Code block inside list with content "  bar" (two LITERAL leading spaces — the 4-column residue after list marker and first tab consume 4 cols).
parsers_known_to_diverge: [pre-micromark remark bugs — tested in #198, #315]
source: https://spec.commonmark.org/0.31.2/#example-5
```

**22. Tabs after blockquote marker**
```
input: ">\t\tfoo\n"
expected_behavior: Blockquote containing indented code with content "  foo".
parsers_known_to_diverge: [historical commonmark.js bug #59 dropped bytes here]
source: https://spec.commonmark.org/0.31.2/#example-6
```

**23. Tabs inside three-level list indent**
```
input: " - foo\n   - bar\n\t - baz\n"
expected_behavior: Three-level nested unordered list. Leading tab must be treated as 4 columns for third level to indent correctly.
parsers_known_to_diverge: [pre-micromark remark failed this — #198]
source: https://spec.commonmark.org/0.31.2/#example-9 + https://github.com/remarkjs/remark/issues/198
```

**24. Tab between ATX hash and text**
```
input: "#\tFoo\n"
expected_behavior: <h1>Foo</h1>. §4.2 technically requires U+0020 but parsers generally accept tab.
parsers_known_to_diverge: [dingus historically accepted this; spec-conformant behavior unclear — commonmark-spec#678]
source: https://spec.commonmark.org/0.31.2/#example-10 + https://github.com/commonmark/commonmark-spec/issues/678
```

**25. Round-trip probe — indented code idempotence failure**
```
input: "    const x = 1;\n    const y = 2;\n"
expected_behavior: Parses to mdast code (no lang). remark-stringify defaults emit "```\nconst x = 1;\nconst y = 2;\n```\n" — byte-different. Setting fences: false restores indented output but introduces content-starts-blank edge cases.
parsers_known_to_diverge: [this IS the SKIP_SECTIONS cause]
source: https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/format-code-as-indented.js
```

**26. Tab-indented fenced code inside list item (regression probe)**
```
input: "- item\n\n\t```js\n\tcode\n\t```\n"
expected_behavior: Per spec, valid fenced JS code block inside list continuation. Pre-micromark remark treated the backticks as CONTENT of an indented code block.
parsers_known_to_diverge: [#402 regression test]
source: https://github.com/remarkjs/remark/issues/402
```

**27. Mixed tabs and spaces at line start**
```
input: " \t \t code\n"
expected_behavior: Parses as indented code (1 space + tab fills to col 4, then 1 space + tab fills to col 8 — more than 4 spaces of indent). Content is " code" (residue).
parsers_known_to_diverge: [subtle tab-expansion math; not always handled consistently]
source: https://spec.commonmark.org/0.31.2/#tabs (rule: tabs fill to next tab stop)
```

**28. Tab in place of space in list item marker**
```
input: "-\titem\n"
expected_behavior: List with content "item". Per spec §5.2, list marker is followed by at least one space — tab is accepted via §2.2 column equivalence.
parsers_known_to_diverge: [commonmark.js #59 historical regression]
source: https://github.com/commonmark/commonmark.js/issues/59
```

### Proposed fast-check arbitrary extensions

1. `lineEndingChoice`: `fc.constantFrom('\n', '\r\n', '\r')` — per-line selection to generate mixed-ending documents.
2. `bomPrefix`: `fc.constantFrom('', '\uFEFF', '\uFEFF\uFEFF')` — whole-document prefix.
3. `whitespaceIndent`: `fc.stringOf(fc.constantFrom(' ', '\t'), 0, 8)` — for indented line starts.
4. `midTextBom` (suggested): 5% U+FEFF sprinkle per word for D3 coverage.

---

## Appendix B — Cross-Parser Divergence Snippet Corpus (59 entries)

The full corpus is preserved in [evidence/divergence-corpus.md](evidence/divergence-corpus.md) in YAML format. It organizes 59 divergence snippets into 13 test families. Representative entries from each family follow; the complete library is in the evidence file.

### B.1 — Emphasis (7 entries)

```yaml
- name: triple-star-classic
  input: "***foo***"
  expected_commonmark: "<p><em><strong>foo</strong></em></p>"
  divergence: |
    cmark/commonmark.js/markdown-it/marked/remark agree on <em><strong>.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-132
  test_family: emphasis

- name: em-strong-asymmetry
  input: "*b**a***"
  expected_commonmark: "<p><em>b</em><em>a</em>**</p>"
  intuitive_expected: "<p><em>b<strong>a</strong></em></p>"
  divergence: |
    All major JS parsers produce the counterintuitive form (leftover **).
    Reverse case (***a**b*) parses cleanly. Asymmetry is openers_bottom + rule 9.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-446
  forum_ref: https://talk.commonmark.org/t/emphasis-strong-emphasis-corner-cases/2123
  test_family: emphasis

- name: five-stars-and-emphasis
  input: "*****Hello*world****"
  expected_commonmark: "<p>*****Hello<em>world</em>***</p>"
  divergence: |
    cmark, MD4C, commonmark.js all agree. Older marked versions unstable.
    Documented openers_bottom over-application bug.
  forum_ref: https://talk.commonmark.org/t/i-dont-understand-how-emphasis-is-parsed/3866
  test_family: emphasis
```

Full family (including `nested-strong-inside-em`, `a-asterisk-b-asterisk-c`, `underscore-intraword`, `escaped-asterisk-strong`) is in [evidence/divergence-corpus.md §A](evidence/divergence-corpus.md).

### B.2 — Links (6 entries)

```yaml
- name: shortcut-ref-followed-by-empty-brackets
  input: |
    [foo][ ]

    [foo]: /url
  divergence: |
    JS family (commonmark.js, markdown-it, marked, remark): NOT a link.
    Rust (pulldown-cmark) and Go (goldmark): IS a link.
    Spec is silent. Major cross-language divergence.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-570
  forum_ref: https://talk.commonmark.org/t/reference-links-followed-by-space-only-pair-of-brackets/4581
  test_family: links

- name: backtick-inside-link-title
  input: '[foo](/ "bar`baz")`'
  expected_commonmark: '<p><a href="/" title="bar`baz">foo</a>`</p>'
  divergence: |
    Spec says code spans > emphasis but is silent vs link titles.
    Behavior is undocumented but consistent: link title wins; trailing backtick literal.
  forum_ref: https://talk.commonmark.org/t/precedence-of-link-title-over-code-span/8982
  test_family: links
```

Full family (including `case-fold-ref-label`, `unicode-case-fold-label`, `link-text-binds-tighter-than-em`, `parens-in-ref-link-destination`) is in [evidence/divergence-corpus.md §B](evidence/divergence-corpus.md).

### B.3 — HTML blocks (4 entries)

```yaml
- name: script-inside-list
  input: |
    - <script>
    - some text
    some other text
    </script>
  divergence: |
    cmark-current/commonmark.js/markdown-it 9.x+/marked/remark: </script> stays inside list item.
    Older cmark and historical markdown-it: closing escaped outside the list.
  forum_ref: https://talk.commonmark.org/t/list-block-and-html-block-interaction-help/3777
  test_family: html-blocks

- name: pre-inside-table-html-block
  input: |
    <table><tr><td>
    <pre>
    line one

    line three
    </pre>
    </td></tr></table>
  divergence: |
    All major parsers BUG: blank line inside <pre> incorrectly terminates the
    entire HTML block (type 6 ends at blank line). Spec issue unresolved.
  forum_ref: https://talk.commonmark.org/t/end-conditions-within-end-conditions/2388
  test_family: html-blocks
```

### B.4 — Setext-vs-thematic-break (2 entries), Autolinks (10 entries), Lists (5 entries), Fenced-code (4 entries), Code-spans (1 entry), Hard-breaks (3 entries)

Full entries for all remaining families are in [evidence/divergence-corpus.md §D–§I](evidence/divergence-corpus.md). Key examples:

```yaml
- name: setext-vs-hr
  input: |
    Foo
    ---
    bar
  expected_commonmark: "<h2>Foo</h2><p>bar</p>"
  divergence: |
    All major JS parsers aligned (setext wins per spec example 59).
    Classic perl-markdown: <p>Foo</p><hr/><p>bar</p> (hr precedence).
  spec_ref: https://spec.commonmark.org/0.31.2/#example-59
  test_family: setext-vs-hr

- name: www-bare-link-gfm
  input: "Visit www.example.com today"
  divergence: |
    commonmark (no ext): literal.
    markdown-it+linkify, marked (gfm), remark+gfm, cmark-gfm: linkified to http://www.example.com (note http).
  spec_ref: https://github.github.com/gfm/#autolinks-extension-
  test_family: autolinks

- name: autolink-trailing-quote
  input: '"https://example.com"'
  divergence: |
    cmark-gfm/remark-gfm: link includes closing quote (quotes NOT in trim set).
    markdown-it+linkify-it: trims trailing quote.
    marked pre-PR-#2673 also trimmed; post-fix matches spec.
  spec_ref: https://github.com/markedjs/marked/pull/2673
  test_family: autolinks
```

### B.5 — GFM strikethrough (3 entries)

```yaml
- name: gfm-strikethrough-single-tilde
  input: "~struck~"
  divergence: |
    cmark-gfm/github actual: <del>struck</del> (deliberate non-spec).
    GFM written spec/markdown-it (default)/marked (gfm): rejects single tilde — literal text.
    remark-gfm: defaults to singleTilde:true (matches cmark-gfm/GitHub).
  spec_ref: https://github.com/github/cmark-gfm/issues/71
  test_family: gfm-strikethrough
```

### B.6 — GFM tables (7 entries)

```yaml
- name: list-vs-table-precedence
  input: |
    a | b
    - | -
    1 | 2
  divergence: |
    cmark-gfm/remark-gfm/markdown-it (with gfm-table): parses as a table.
    github actual: parses as a LIST — first line is paragraph "a | b",
    second/third lines form a list. SPEC IS SILENT.
  spec_ref: https://github.com/github/cmark-gfm/issues/333
  test_family: gfm-tables

- name: escaped-backslash-then-pipe
  input: |
    | a \\| b |
    | --- | --- |
    | x | y |
  divergence: |
    cmark-gfm/remark-gfm/github: BUG — treat `\\|` as escaped pipe; 2-cell header.
    markdown-it (gfm-table): treats `\\` as literal backslash, `|` as delimiter — 3 cells.
  spec_ref: https://github.com/github/cmark-gfm/issues/277
  test_family: gfm-tables
```

Full gfm-tables family (including `header-separator-mismatch`, `row-with-extra-cells`, `row-with-fewer-cells-and-trailing-space`, `pipe-inside-code-span-in-cell`, `lazy-blockquote-table-continuation`) is in [evidence/divergence-corpus.md §K](evidence/divergence-corpus.md).

### B.7 — GFM tasks (3 entries) + Disallowed-HTML (3 entries)

```yaml
- name: task-list-with-nbsp-in-marker
  input: "- [\\u00A0] item"
  divergence: |
    cmark-gfm/remark-gfm/markdown-it-task-lists/github: NOT recognized as task list item — literal "[ ]" text.
  spec_ref: https://github.com/github/cmark-gfm/issues/192
  test_family: gfm-tasks

- name: disallowed-html-uppercase-tag
  input: "<SCRIPT>alert(1)</SCRIPT>"
  divergence: |
    cmark-gfm/remark-gfm/github: case-insensitive — escaped.
    Older marked: case-sensitive — not escaped (regression).
  spec_ref: https://github.github.com/gfm/#disallowed-raw-html-extension-
  test_family: disallowed-html
```

### Notes on use

1. **Lift directly into a fixture file.** Each entry is structured YAML-style for easy parsing.
2. **Three `expected_commonmark` patterns:**
   - Where all major JS parsers agree, treat the value as the regression baseline.
   - Where divergence is documented, lift the snippet to a "known-divergence" suite — assert that the pipeline produces ONE of the documented behaviors and flag drift.
   - Where a CVE/forum thread documents a *bug* in a parser the pipeline uses, treat as "currently-broken, do-not-regress-toward-fix" cases.
3. **Security-relevant divergence** concentrates in `disallowed-html`, `gfm-tables` (list-vs-table precedence silent-smuggling), and `html-blocks` (pre-in-table containment failure).
4. **Babelmark3** ([https://babelmark.github.io/](https://babelmark.github.io/)) reproduces every snippet across ~25 parsers live.
