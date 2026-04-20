---
title: "Mutation Testing with Stryker-js for a TypeScript unified/remark md ↔ ProseMirror Pipeline (+ fast-check PBT) — Landscape, 2026-04"
description: "Factual landscape of Stryker-js mutation testing for TypeScript parser/serializer code that uses fast-check property-based oracles. Covers TS-integration architecture, mutator signal on parser code, runtime cost controls, interaction with seeded PBT, and real-world adopters. Layout of options with tradeoffs — no recommendations."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - Stryker-js
  - fast-check
  - TypeScript
  - unified
  - remark
  - ProseMirror
  - Bun
  - Sentry
topics:
  - mutation testing
  - property-based testing
  - parser testing
  - CI cost control
  - round-trip oracles
---

# Mutation Testing with Stryker-js for a TS unified/remark md ↔ ProseMirror Pipeline (+ fast-check PBT) — Landscape, 2026-04

**Purpose:** Describe what a TypeScript markdown ↔ ProseMirror pipeline using fast-check PBT oracles can do **today** with Stryker-js: architecture, operator signal on parser-shaped code, cost controls, PBT interaction semantics, and real-world adopters. Layout of options with tradeoffs — not recommendations.

---

## Executive Summary

Stryker-js (current stable: **v9.6.1**, released 2026-04-10) is actively maintained, mature, and the dominant mutation-testing tool in the JS/TS ecosystem. For a TypeScript unified/remark-based markdown ↔ ProseMirror pipeline with fast-check property-based oracles, the landscape today has four sharp edges worth understanding before adoption:

1. **Bun test runner has no first-party Stryker plugin.** Two open feature requests (#4439 open since 2023-09, #5424 open since 2025-07) and one in-progress PR (#5931, 2026-03) remain unmerged. The core blocker is that Bun's test runner is CLI-only and exposes no programmatic API ([oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191), closed as duplicate). Available paths: (a) community [`stryker-mutator-bun-runner@0.4.0`](https://www.npmjs.com/package/stryker-mutator-bun-runner) (single maintainer, 5 stars, Apache-2.0) with `coverageAnalysis: "off"` — accepts a ~1 order-of-magnitude runtime hit; (b) default [`command`](https://stryker-mutator.io/docs/stryker-js/configuration/) runner invoking `bun test` — even slower because Stryker "cannot do any optimizations and just runs all tests for all mutants"; (c) migrate tests to the jest or vitest runner, which support per-test coverage filtering.

2. **Parser/serializer code is a high-signal target for Stryker, but with elevated equivalent-mutant rates.** The mutators most likely to surface real bugs in a round-trip pipeline are **EqualityOperator, ArithmeticOperator, ConditionalExpression, UpdateOperator, LogicalOperator, StringLiteral → "", MethodExpression, and BlockStatement**. The Regex mutator (21 sub-operators from `weapon-regex`) is also parser-relevant but has the highest false-positive rate in this domain — capture-group to non-capture-group, anchor removal under single-line inputs, and wider character classes commonly survive without signaling a real bug.

3. **Runtime cost tooling is partial.** Stryker supports `--incremental` (documented reuse ratio: 92.1% in one sample), `coverageAnalysis: "perTest"`, and `ignoreStatic: true` — each a significant multiplier. It does NOT have a native `--since` / git-diff flag (community pattern uses `git diff` to populate `--mutate`), and has no native sampling or percentage-based subset selection. A third-party [`stryker-git-checker`](https://github.com/lbtoma/stryker-git-checker) provides diff-based filtering but is explicitly "quite experimental." The canonical empirical reference ([Sentry's JS SDK, Aug 2024](https://sentry.engineering/blog/js-mutation-testing-our-sdks)) stratified into weekly full runs — "definitely too long to run this on every PR or push."

4. **fast-check and Stryker compose, but reproducibility is user-enforced.** fast-check is fully deterministic given an explicit `seed` (pure-rand / xorshift128plus; [pure-rand README](https://github.com/dubzzz/pure-rand/blob/main/README.md)). Stryker does NOT re-seed fast-check — it simply re-invokes the test runner after flipping `activeMutant`. If the test author pins seeds via `fc.assert({ seed })` or `fc.configureGlobal({ seed })`, mutant labels are stable; if tests rely on the default (`Date.now() ^ Math.random()`) seed, mutant status can flip between runs. Shrunk counterexamples are stable within a mutant, but can legitimately shift *between* mutants because the mutant changes the predicate. One known bug — `@fast-check/vitest` dual-Vitest-instance ([stryker-js#5714](https://github.com/stryker-mutator/stryker-js/issues/5714)) — was fixed 2026-01-30.

**Ecosystem adoption note (informational):** The unified/remark/markdown-it/Prettier/ProseMirror ecosystems do NOT use mutation testing in their public repositories. Baseline rigor standardizes on `c8 --100` line+branch coverage, `type-coverage --at-least 100`, fixture-based tests, and snapshot testing. Property-based testing and fuzz testing are also absent from these specific repos. The [Sentry JS SDK](https://sentry.engineering/blog/js-mutation-testing-our-sdks) (Aug 2024) is the canonical real-world empirical reference for Stryker-js on TS/JS at scale.

**Key Findings:**
- **Bun-runner gap is real and structural, not transient.** The blocker is an upstream Bun limitation, not a Stryker prioritization choice.
- **Mutator selection for parsers is well-defined but the equivalent-mutant rate is elevated** — especially for Regex operators and when the oracle tolerates style-variant renderings.
- **`--incremental` + `perTest` + `ignoreStatic` + narrowed `--mutate` is the composition pattern** every production-tuned config converges on; no first-party sampling exists.
- **fast-check determinism requires explicit seeding** — Stryker will not enforce it, and time-based default seeds produce flaky mutant labels.
- **Parser/serializer ecosystem adoption is essentially absent** from public OSS; adoption on this shape of code would be trailblazing rather than following a well-trodden path.

---

## Research Rubric

| ID | Dimension | Priority | Depth |
|----|-----------|----------|-------|
| D1.1 | Stryker-js + TypeScript integration (typescript-checker, mutation switching, bun compat, real configs) | P0 | Deep |
| D1.2 | Mutation operators on parser-shaped code (default mutator list, signal ranking, equivalent-mutant patterns) | P0 | Deep |
| D1.3 | Runtime cost strategies (`--incremental`, `--mutate`, sampling, parallelism, wall-clock data, CI tier placement) | P0 | Deep |
| D1.4 | Interaction with seeded property-based tests (lifecycle, seed propagation, shrinking stability, flakiness handling) | P0 | Deep |
| D1.5 | Concrete adopter examples (real repos, blog case studies, ecosystem adoption, maintenance signals) | P0 | Deep |

**Stance:** Factual / Landscape — layout of options with tradeoffs; no recommendations.
**Non-goals:** 1P codebase analysis; Rust-specific pre-work; broader PBT tooling alternatives beyond fast-check; recommendation rankings.

---

## Detailed Findings

### D1.1 — Stryker-js + TypeScript integration

**Finding:** Stryker-js integrates with TypeScript via `@stryker-mutator/typescript-checker`, a `checker` plugin that type-checks each mutant in-memory using the TS Compiler API. Mutants that don't type-check are tagged `CompileError` and **excluded from the mutation score denominator** (`score = detected / valid * 100`). The checker auto-overrides `allowUnreachableCode: true`, `noUnusedLocals: false`, and `noUnusedParameters: false` to avoid spurious errors from mutation-induced dead code. Project references (`tsc --build`) are auto-detected. In Stryker 6.4+, mutants are grouped by TS dependency graph for batched compilation — maintainers report "43% performance increase while still being 99.1% accurate."

Mutation switching (v4+) embeds all mutants into source behind a runtime `global.activeMutant` flag using Babel parser (handles JS/TS/Flow/JSX). The test runner flips the flag between mutant runs rather than rewriting source per mutant — the "20–70% speed gain with bundlers" cited in the announcement blog.

**Bun runner status (CONFIRMED, current):** Stryker-js has no first-party Bun plugin. Open requests: [#4439](https://github.com/stryker-mutator/stryker-js/issues/4439) (2023-09-27) and [#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) (2025-07-07); in-progress PR [#5931](https://github.com/stryker-mutator/stryker-js/pull/5931) (2026-03-31, merge status UNCERTAIN). The architectural blocker is Bun's lack of a programmatic test-runner API ([oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191), closed as duplicate 2026-01-17) — `@stryker-mutator/jest-runner` and `@stryker-mutator/vitest-runner` both consume programmatic APIs that Bun does not expose.

Community option: [`stryker-mutator-bun-runner@0.4.0`](https://www.npmjs.com/package/stryker-mutator-bun-runner), single-maintainer ([menoncello](https://github.com/menoncello/stryker-mutator-bun-runner)), Apache-2.0, targets `@stryker-mutator/core ^9.0.0`. Example config uses `"coverageAnalysis": "off"` — the plugin does not implement per-test coverage, so **every mutation runs the full test suite**. Author's PRD claims 2–3× perf vs. Node runners but no public third-party benchmark validates this.

Fallback option: default `command` runner can invoke `bun test`. Per [Stryker docs](https://stryker-mutator.io/docs/stryker-js/configuration/): "The command test runner can be made to work in any use case, but comes with a performance penalty, as Stryker cannot do any optimizations and just runs all tests for all mutants."

**Evidence:** [evidence/stryker-ts-integration.md](evidence/stryker-ts-integration.md)

**Implications:**
- Adoption on a bun-test TS codebase today means accepting one of: community plugin (no perTest filtering), command runner (full-suite-per-mutant), or migration to vitest/jest runner.
- Stricter tsconfig ejects more mutants before tests execute — improving numerator quality but shrinking the denominator. Reported mutation scores for strict-mode TS projects are not directly comparable to permissive JS projects.

**Decision triggers:**
- If minimizing adoption friction dominates: the command runner keeps `bun test` intact but accepts the wall-clock cost.
- If wall-clock cost dominates and migration is acceptable: vitest or jest runners with `coverageAnalysis: "perTest"` offer an order-of-magnitude speedup over full-suite-per-mutant.
- If both matter: waiting on PR #5931 or the community plugin maturing is the only "no-compromise" path, with the standard open-source timing risk.

**Remaining uncertainty:**
- PR #5931 merge timeline.
- Community `stryker-mutator-bun-runner` real-world perf vs. the official Jest/Vitest runners (no independent benchmark as of 2026-04-19).

---

### D1.2 — Mutation operators on parser-shaped code

**Finding:** Stryker-js ships 15 mutator categories plus 21 regex sub-operators (via [weapon-regex](https://github.com/stryker-mutator/weapon-regex)). For identity/round-trip parser oracles, the mutators most likely to surface real bugs are:

| Mutator | Parser code site | Why high signal |
|---|---|---|
| **EqualityOperator** | Index bounds, token equality checks | Off-by-one; identity oracle catches mis-slices on boundary inputs |
| **ArithmeticOperator** | Index math, position advance | `+` ↔ `−` in slice index almost always breaks round-trip |
| **ConditionalExpression** | Token dispatch | Forcing `true`/`false` admits or drops a whole token class |
| **UpdateOperator** | State machine advance | Parser can't advance or unwinds backward |
| **LogicalOperator** | Delimiter guard clauses | Admit/reject flip on escape / open / close handling |
| **StringLiteral → ""** | Serializer delimiters (`"**"`, `` "`" ``, `"\n"`) | Emitted empty marker breaks re-parse |
| **MethodExpression** | `startsWith`/`endsWith`, case-fold | Directly flips scanner delimiter detection |
| **BlockStatement** | Switch-case body for token class | Emptying a dispatch branch catastrophically breaks round-trip |
| **BooleanLiteral / not-removal** | Escape flags | Inverts escape-handling branch |
| **Regex (21 sub-operators)** | Lexer patterns | Anchor removal, quantifier change, char class negation — high signal but also highest equivalent-mutant rate in this domain |

Signal ranking is INFERRED from mutator semantics + parser code shape; no published per-domain benchmark exists for markdown/AST parsers in TS/JS. Stryker's own documentation explicitly declines to publish a numeric threshold: "The higher, the better!" ([mutant states and metrics docs](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)).

**Equivalent-mutant patterns elevated in parser code (INFERRED, 6 patterns):**
1. Regex substitutions with semantically identical alternatives — `(abc)` → `(?:abc)` when the capture isn't consumed; `[abc]` → `[\w\W]` in grammar-restricted positions; anchor removal on single-line inputs.
2. Short-circuited logical operators — `cache[key] && check(key)` → `||` survives when cache is always populated.
3. Pretty-print / style-variant serializer outputs — `"**"` vs. `"__"` passes through a normalizing round-trip.
4. Dead branches / defensive code — emptying an "impossible" error branch.
5. Off-by-one on boundaries shrinking generators don't reach — if fast-check always generates length ≥ 2, `length < 2` ↔ `length <= 2` survives.
6. Idempotent string operations — `toUpperCase` ↔ `toLowerCase` on pre-normalized ASCII input.

**Evidence:** [evidence/mutation-operators-parsers.md](evidence/mutation-operators-parsers.md)

**Implications:**
- The mutator set is well-matched to parser bugs, but the equivalent-mutant overhead is real. Every surviving mutant in a round-trip pipeline is a triage item, not a test-addition trigger — roughly a third to half may be legitimately equivalent given the oracle shape.
- Stricter tsconfig shifts mutant distribution: more mutants eliminated as `CompileError`, fewer as `survived` — but also a smaller denominator.

**Decision triggers:**
- If triage budget is the bottleneck, disabling the Regex mutator (configurable via `mutator.excludedMutations`) reduces the equivalent-mutant backlog at the cost of coverage of lexer pattern logic.
- If the fast-check generator is restricted to certain input shapes (e.g., length ≥ 2), expect boundary-condition mutants to survive — widening the generator is a complementary lever, not a mutator-config lever.

**Remaining uncertainty:**
- Empirical mutator-signal ranking specific to markdown parsers would require running Stryker against a sample parser corpus.
- Equivalent-mutant rate for parser code vs. business-logic code: no published ratio.

---

### D1.3 — Runtime cost strategies

**Finding:** Stryker-js provides five native cost-control levers plus one community plugin.

**Native levers (CONFIRMED):**

1. **`coverageAnalysis: "perTest"`** — runs only tests that covered each mutant. Largest single runtime multiplier when supported by the runner. Jest/Vitest/Mocha/Jasmine support it; command runner and community bun runner do not.
2. **`--incremental`** — diffs code + tests against the previous run's cache (default `reports/stryker-incremental.json`). [Announcement blog](https://stryker-mutator.io/blog/announcing-incremental-mode/) reports 92.1% mutant reuse (3,731/3,965) in one sample after a small code+test change. Documented blind spots: dependency upgrades, env var changes, `.snap` files, and — with the command runner — any test-change detection.
3. **`ignoreStatic: true`** — skips mutants in code executed on file load. Stryker otherwise spawns a fresh worker per static mutant.
4. **`--mutate` glob + line-range scoping** — glob (`!` negation supported) and `"src/app.js:1-11"` range syntax. Globs and ranges can't be combined in one expression.
5. **`concurrency`** — integer (`--concurrency 4`) or percentage (`--concurrency 50%`). Default formula: `n if n ≤ 4 else n - 1` where `n` = logical cores ([#2542](https://github.com/stryker-mutator/stryker-js/issues/2542)). Deprecated: `maxConcurrentTestRunners`.

**Native levers NOT present (CONFIRMED negative):**
- No `--since` / git-diff flag. Closest native feature: `--incremental`.
- No native sampling, random subset, or priority-based mutant selection. Plugin extension points are `test-runner`, `checker`, and `reporter` only.

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

**CI tier placement pattern convergence (INFERRED from Sentry + stryker-js self-workflow + oneuptime + dev.to):** all primary sources stratify into *nightly/weekly full* + *PR-incremental or diff-scoped*. No primary source documents running the full matrix on every PR for a production-sized TS codebase. Stryker's own [mutation-testing.yml](https://github.com/stryker-mutator/stryker-js/blob/master/.github/workflows/mutation-testing.yml) runs on `push` to master + manual dispatch, with no PR trigger.

**Evidence:** [evidence/runtime-cost-strategies.md](evidence/runtime-cost-strategies.md)

**Implications:**
- For a ~500-LOC core + ~4K-LOC test suite, the "PR-tier" composition (`--incremental` + `perTest` + `ignoreStatic` + `--mutate` from `git diff` + tuned concurrency) is the pattern every primary source converges on; the individual components are CONFIRMED but the composed effect is not isolated in a public benchmark.
- Test runner choice dominates: Sentry's Jest→Vitest switch produced a 2.4× speedup on identical code.

**Decision triggers:**
- If PR-time mutation testing is required, only narrowed-scope + incremental is documented to fit. Full runs are nightly/weekly territory.
- If bun test is retained (via community or command runner), `coverageAnalysis: "perTest"` is unavailable — the single largest lever is gone, pushing runtime closer to "weekly only" rather than "per-PR feasible."

**Remaining uncertainty:**
- [#4185](https://github.com/stryker-mutator/stryker-js/issues/4185) — high-concurrency thrash on >8-core Linux with Mocha parallel + `perTest`. Issue is stale; whether still live in current versions is UNCERTAIN.

---

### D1.4 — Interaction with seeded property-based tests

**Finding:** fast-check and Stryker compose without modification, but PBT-test reproducibility across mutants is user-enforced, not tool-enforced.

**Stryker test lifecycle per mutant (CONFIRMED, [Stryker v6 blog](https://stryker-mutator.io/blog/stryker-js-v6-expeditious-superior-mutations/)):** Stryker flips `global.activeMutant` and re-runs covering tests in the same worker process without re-importing source. Module state, singletons, closures, and in-process globals **persist** across mutants within one worker — state isolation is delegated entirely to the test runner. Static mutants are the exception (fresh worker per static mutant on Node-based runners). `coverageAnalysis: "perTest"` filters to only tests covering the mutant.

**fast-check determinism (CONFIRMED):** Uses `pure-rand` ([README](https://github.com/dubzzz/pure-rand/blob/main/README.md): "fully deterministic... given the original seed one can rebuild the whole sequence"), default `xorshift128plus`. Explicit `seed` is coerced to 32-bit signed integer; fast-check does NOT touch `Math.random` for generation. PRNG state is local to each `fc.assert` invocation, not global. Given fixed `seed` + fixed `numRuns`, fast-check produces the identical sequence regardless of call order or prior mutant runs.

**Default seed (when no explicit seed is given) is `safeDateNow() ^ (safeMathRandom() * 0x100000000)`** ([QualifiedParameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/QualifiedParameters.ts)). Consequence: un-pinned fast-check tests effectively sample a different seed per invocation. Across mutants, the same un-pinned test can kill or survive based purely on seed draw.

**Stryker does NOT re-seed fast-check.** It has no awareness of fast-check; it simply re-invokes the test runner. Seed propagation is 100% test-author responsibility via `fc.assert({ seed })`, `fc.configureGlobal({ seed })`, or a user-maintained env-var convention.

**Shrinking stability under mutation (CONFIRMED determinism + INFERRED consequence):** fast-check shrinking is deterministic given `(seed, path, predicate)` ([docs](https://fast-check.dev/docs/tutorials/quick-start/read-test-reports/)). But the **predicate includes the mutated source**. Consequence: within a single mutant, shrunk counterexamples are stable across re-runs with the same seed. Between different mutants, counterexamples can legitimately shift — each mutant is a different program. This is not a bug; it's a design consequence.

**Mutant states table ([Stryker docs](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)):**

| State | Counted as detected? |
|---|---|
| `killed` — ≥1 test failed | Yes |
| `survived` — all tests passed | No |
| `no-coverage` — no test covered | No |
| `timeout` — exceeded deadline | **Yes (effectively killed)** |
| `runtime-error` — runner crashed | No (excluded from valid) |
| `compile-error` — TS error | No (excluded from valid) |

**Flakiness handling (CONFIRMED negative):** Stryker-js has no retry configuration and no flaky-test tolerance setting. Only tunables are `timeoutMS`, `timeoutFactor`, and `disableBail`. [stryker-net#2144](https://github.com/stryker-mutator/stryker-net/issues/2144) documents the general class of issue: non-determinism in the test layer produces mutation scores varying 22% → 100% on unchanged code. Mechanism generalizes to JS side; no parallel JS issue was surfaced. Pinning seeds eliminates the fast-check contribution to this variance.

**Known compatibility bug — Vitest only:** [stryker-js#5714](https://github.com/stryker-mutator/stryker-js/issues/5714): dual-Vitest-instance caused `@fast-check/vitest` hooks to register on one instance but not the other, silently dropping PBT executions. **Fixed** in PR #5745 (2026-01-30). Does not apply to plain `fc.assert` inside vitest/jest/mocha `it` blocks.

**Evidence:** [evidence/stryker-fastcheck-interaction.md](evidence/stryker-fastcheck-interaction.md)

**Implications:**
- Pinning fast-check seeds (explicit `seed`, `fc.configureGlobal`, or env-var convention) is a precondition for stable Stryker runs. Un-pinned seeds guarantee mutant-label flakiness.
- Shrunk counterexample shifts between mutants are expected behavior, not a red flag. Using shrunk values as regression tests pinned to a specific mutant's oracle is a valid pattern only within that mutant context.
- Property-based tests run with `numRuns = 1000` per invocation multiply Stryker's per-mutant cost meaningfully; combined with hot-reload semantics, this is a runtime-control decision point.

**Decision triggers:**
- If seed pinning is already enforced project-wide: fast-check + Stryker compose cleanly.
- If seeds are un-pinned or the test suite uses `@fast-check/vitest` on an older Stryker version: verify the #5714 fix is present (≥ Stryker version shipped after 2026-01-30) or pin an explicit seed.
- If `numRuns` is set aggressively (e.g., 10000 under a stress env var): expect Stryker runtime to scale linearly with runs per property; budget accordingly or gate `STRESS_FIDELITY`-style modes out of the Stryker path.

**Remaining uncertainty:**
- No public empirical study quantifies how much flakiness seed pinning eliminates in Stryker runs specifically.

---

### D1.5 — Concrete adopter examples + ecosystem adoption

**Finding:** Public adopters of Stryker-js on pure parser/serializer/codec TypeScript code are essentially absent. The most relevant ecosystem repositories (unified, remark, rehype, markdown-it, Prettier, ProseMirror) **do not use mutation testing**. Baseline rigor standardizes on `c8 --100` line+branch coverage, `type-coverage --at-least 100`, fixture-driven tests, and snapshot tests.

**Ecosystem observations (CONFIRMED from `package.json` inspection):**

| Repo | Stars | Test stack | Mutation testing? | PBT? | Fuzz? |
|---|---|---|---|---|---|
| remarkjs/remark | ~7k | node:test + c8 `--100` + type-coverage `--at-least 100` | No | No | No |
| unifiedjs/unified | ~5k | node:test + `.test-d.ts` | No | No | No |
| markdown-it/markdown-it | 21.3k | Mocha + chai + c8 + CommonMark spec fixtures | No | No | No |
| prettier/prettier | ~50k | Jest 30 + snapshot serializers | No | Not surfaced | No |
| ProseMirror/prosemirror-markdown | — | prosemirror-test-builder + jest-prosemirror | No | No | No |

Adjacent academic work worth knowing: [MdPerfFuzz](https://github.com/cuhk-seclab/MdPerfFuzz) (ASE '21) uses syntax-tree-based *mutation fuzzing* (different category) for markdown compiler perf bugs. Not Stryker-style mutation testing.

**Canonical real-world empirical reference: [Sentry JS SDK, 2024-08-23](https://sentry.engineering/blog/js-mutation-testing-our-sdks).**

- 12-package monorepo; opt-in per package
- Core SDK mutation score: **0.62 (62%)**
- Config: `coverageAnalysis: "perTest"` + `ignoreStatic: true`; migrated Jest → Vitest for 2.4× speedup
- Cadence: weekly, not per-PR ("definitely too long to run this on every PR or push")
- Top reported limitation: **no Playwright runner** → E2E tests never kill mutants → higher-level packages scored worse than core despite E2E coverage
- Quote: *"Mutation testing is a great asset for checking the quality of tests."*

**Other public adopter worth noting:** [rudderlabs/rudder-workflow-engine](https://github.com/rudderlabs/rudder-workflow-engine) — YAML/JSONata workflow engine (parser-adjacent). Vanilla `stryker init` output; no CI workflow surfaced; 4 stars. Non-optimized config (`command` runner, `coverageAnalysis: "all"`).

**Stryker-js maintenance signals (2026-04-19):**

| Signal | Value |
|---|---|
| Latest release | **v9.6.1** (2026-04-10) |
| Recent releases | v9.6.0 (Feb 27 '26), v9.5.1 (Feb 2 '26), v9.4.0 (Nov 23 '25), v9.3.0 (Oct 28 '25) |
| GitHub stars | ~2.8k |
| Open issues | 43 |
| Forks | 262 |
| Weekly downloads (@stryker-mutator/core) | ~54k (per socket.dev / npmjs) |
| Recent ecosystem work | Vitest runner (2023-06), faster TS checker (2023-02), VS Code plugin (2025-11), MS Testing Platform for Stryker.NET (2026-03) |

**Interpretation (INFERRED):** Active maintenance — 4+ minor/patch releases in ~6 months, low open-issue count relative to commit volume, ongoing runner and tooling work. No evidence of stagnation. Star growth is modest (mutation testing remains a niche quadrant), and there is no sign of hyper-growth either.

**Recurring theme across case studies (INFERRED from convergence across Sentry, prodSens, OneUptime):** Mutation testing consistently surfaces *boundary-condition gaps* in code with high line coverage. prodSens reports `videoSplitter.ts` at 95% line coverage lifted 62% → 88% mutation score by adding boundary-value tests. Applied to parser/serializer code: off-by-one, wrong operator in predicate, flipped precedence — the exact bug class EqualityOperator / ArithmeticOperator / ConditionalExpression mutators target (D1.2).

**Evidence:** [evidence/adopter-examples.md](evidence/adopter-examples.md)

**Implications:**
- Adopting Stryker on a unified/remark-style pipeline is trailblazing relative to the ecosystem. There is no "best-practice sheet" from remark/unified maintainers, because none of them have done it publicly.
- The absence is a cost (no exemplar to copy) and a lever (no ecosystem expectation locked in; latitude to choose scope).
- Sentry's experience is the single most-cited real-world data point. Reading it once before adoption is high-signal preparation.

**Decision triggers:**
- If the project values ecosystem alignment (matching how unified/remark test themselves), Stryker adds a distinct rigor dimension rather than a substitution — the ecosystem's `c8 --100` + fixture tests remain the baseline.
- If pipeline correctness is the dominant requirement and boundary bugs are the top concern, mutation testing on EqualityOperator / ArithmeticOperator / ConditionalExpression mutators directly targets that bug class (per D1.2).

**Remaining uncertainty:**
- Private / enterprise adopters likely exist on parser-shaped TS code but are not publicly discoverable.
- Generalization "ecosystem doesn't use mutation testing" holds for the five repos checked; extrapolation to all unified plugins is INFERRED.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Community bun runner real-world perf vs. official jest/vitest runners:** no independent benchmark as of 2026-04-19.
- **PR #5931 merge status:** UNCERTAIN; issue search surfaced the PR but individual fetch not performed.
- **Composed effect of `perTest + incremental + narrowed --mutate + ignoreStatic + tuned concurrency`:** asserted by multiple tutorials; no isolated public benchmark on a ~500-LOC core / ~4K-LOC suite specifically.
- **Per-tsconfig-flag impact on mutant elimination:** only the three auto-overridden flags are documented. How `strict` vs. `strictNullChecks` individually shape mutant counts is NOT FOUND in docs.
- **Equivalent-mutant rate for parser code vs. business-logic code:** no published ratio; the 6 parser-specific patterns are INFERRED from mutator semantics + domain code shape.

### Out of Scope (per Rubric)
- 1P codebase analysis — external findings only.
- Rust-specific pre-work (cargo-mutants, markdown-rs NAPI bindings).
- Broader PBT tooling beyond fast-check.
- Recommendation rankings.

---

## References

### Evidence Files
- [evidence/stryker-ts-integration.md](evidence/stryker-ts-integration.md) — D1.1: Stryker-js + TS integration, bun compatibility, real adopter configs
- [evidence/mutation-operators-parsers.md](evidence/mutation-operators-parsers.md) — D1.2: mutator categories, parser-domain signal ranking, equivalent-mutant patterns
- [evidence/runtime-cost-strategies.md](evidence/runtime-cost-strategies.md) — D1.3: `--incremental`, `--mutate`, concurrency, Sentry wall-clock data, CI tier patterns
- [evidence/stryker-fastcheck-interaction.md](evidence/stryker-fastcheck-interaction.md) — D1.4: mutant lifecycle, seed determinism, shrinking under mutation, #5714 Vitest bug
- [evidence/adopter-examples.md](evidence/adopter-examples.md) — D1.5: ecosystem adoption (unified/remark/markdown-it/Prettier/ProseMirror), Sentry SDK case study, Stryker maintenance signals

### External Sources (selected)

**Stryker-js docs and blog:**
- [Stryker Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [Stryker TypeScript Checker](https://stryker-mutator.io/docs/stryker-js/typescript-checker/)
- [Stryker Incremental mode](https://stryker-mutator.io/docs/stryker-js/incremental/)
- [Stryker Supported Mutators](https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/)
- [Stryker Mutant States and Metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)
- [Stryker Plugins](https://stryker-mutator.io/docs/stryker-js/plugins/)
- [Announcing Stryker 4.0 — Mutation Switching](https://stryker-mutator.io/blog/announcing-stryker-4-mutation-switching/)
- [Announcing faster TypeScript checking](https://stryker-mutator.io/blog/announcing-faster-typescript-checking/)
- [Stryker JS v6 — Expeditious Superior Mutations](https://stryker-mutator.io/blog/stryker-js-v6-expeditious-superior-mutations/)
- [Announcing Stryker Incremental Mode](https://stryker-mutator.io/blog/announcing-incremental-mode/)

**GitHub repos, issues, PRs:**
- [stryker-mutator/stryker-js](https://github.com/stryker-mutator/stryker-js)
- [stryker-js#4439 — Support bun test runner](https://github.com/stryker-mutator/stryker-js/issues/4439)
- [stryker-js#5424 — Add Bun test runner plugin](https://github.com/stryker-mutator/stryker-js/issues/5424)
- [stryker-js#5931 — Add support for bun (PR)](https://github.com/stryker-mutator/stryker-js/pull/5931)
- [stryker-js#5714 — Dual Vitest Instance / @fast-check/vitest](https://github.com/stryker-mutator/stryker-js/issues/5714)
- [stryker-js#551 — Mutate only modified files](https://github.com/stryker-mutator/stryker-js/issues/551)
- [stryker-js#2542 — Concurrency default](https://github.com/stryker-mutator/stryker-js/issues/2542)
- [stryker-js#4185 — High-concurrency thrash on Ubuntu](https://github.com/stryker-mutator/stryker-js/issues/4185)
- [stryker-net#2144 — Flaky detection for some mutants](https://github.com/stryker-mutator/stryker-net/issues/2144)
- [oven-sh/bun#26191 — Programmatic Test Runner API](https://github.com/oven-sh/bun/issues/26191)
- [menoncello/stryker-mutator-bun-runner](https://github.com/menoncello/stryker-mutator-bun-runner)
- [lbtoma/stryker-git-checker](https://github.com/lbtoma/stryker-git-checker)
- [stryker-mutator/weapon-regex](https://github.com/stryker-mutator/weapon-regex)

**fast-check / pure-rand:**
- [fast-check Parameters API](https://fast-check.dev/api-reference/interfaces/Parameters.html)
- [fast-check — Read test reports](https://fast-check.dev/docs/tutorials/quick-start/read-test-reports/)
- [fast-check QualifiedParameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/QualifiedParameters.ts)
- [pure-rand README](https://github.com/dubzzz/pure-rand/blob/main/README.md)

**Real adopter configs:**
- [stryker-js self-config](https://github.com/stryker-mutator/stryker-js/blob/master/stryker.parent.conf.json)
- [stryker-js mutation-testing.yml](https://github.com/stryker-mutator/stryker-js/blob/master/.github/workflows/mutation-testing.yml)
- [mscharley/generic-type-guard](https://github.com/mscharley/generic-type-guard/blob/master/stryker.conf.json)
- [evanliomain/taninsam](https://github.com/evanliomain/taninsam/blob/master/stryker.config.mjs)
- [pedromsantos/ts-kata](https://github.com/pedromsantos/ts-kata/blob/master/stryker.conf.json)
- [rudderlabs/rudder-workflow-engine](https://github.com/rudderlabs/rudder-workflow-engine/blob/main/stryker.conf.json)

**Ecosystem package.json (negative evidence):**
- [remarkjs/remark](https://github.com/remarkjs/remark/blob/main/package.json)
- [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it/blob/master/package.json)
- [prettier/prettier](https://github.com/prettier/prettier/blob/main/package.json)
- [ProseMirror/prosemirror-markdown](https://github.com/ProseMirror/prosemirror-markdown)
- [ProseMirror/prosemirror-test-builder](https://github.com/ProseMirror/prosemirror-test-builder)

**Case studies and blog posts:**
- [Sentry — Mutation-testing our JS SDKs (2024-08-23)](https://sentry.engineering/blog/js-mutation-testing-our-sdks) — canonical real-world reference
- [OneUptime — Mutation Testing with Stryker (2026-01-25)](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
- [prodSens — Pitfalls of Test Coverage (2026-02-01)](https://prodsens.live/2026/02/01/the-pitfalls-of-test-coverage-introducing-mutation-testing-with-stryker-and-cosmic-ray/)
- [typescript.tv — Boost Your TypeScript Tests (2024-07)](https://typescript.tv/testing/boost-your-typescript-tests-with-mutation-testing/)
- [FOSDEM '24 — Who's testing the tests?](https://archive.fosdem.org/2024/events/attachments/fosdem-2024-1683-who-s-testing-the-tests-mutation-testing-with-strykerjs/slides/22485/whos-testing-the-tests_MBwHWqF.pdf)

**Academic:**
- [Arcaini et al. 2019 — Fault-based regex test generation (DOI 10.1002/stvr.1664)](https://onlinelibrary.wiley.com/doi/abs/10.1002/stvr.1664)
- [Groce et al. 2018 — Universal Mutator](https://mir.cs.illinois.edu/marinov/publications/GroceETAL18UniversalMutator.pdf)
- [Kaufmann et al. 2024 — Empirical evaluation of equivalent mutants (arxiv:2404.09241)](https://arxiv.org/html/2404.09241v1)
- [Chen et al. 2024 — Equivalent Mutants in the Wild (DOI 10.1145/3650212.3680310)](https://dl.acm.org/doi/10.1145/3650212.3680310)
- [cuhk-seclab/MdPerfFuzz (ASE '21)](https://github.com/cuhk-seclab/MdPerfFuzz) — adjacent (fuzz, not mutation testing)

---

## Recap (headless auto-written)

**What was investigated:** The landscape of mutation testing for a TypeScript unified/remark-based md ↔ ProseMirror pipeline with fast-check PBT oracles, in 2026-04. Five dimensions: TS integration + bun compatibility, mutator signal on parser code, runtime cost levers, PBT interaction semantics, and real-world adoption.

**Key findings:**
1. Stryker-js is actively maintained (v9.6.1, 2026-04-10) but has **no first-party bun runner**. The core blocker is structural (Bun's CLI-only test runner), not a Stryker prioritization. Three paths exist today: community plugin (no perTest), command runner (full-suite-per-mutant), or migrate to vitest/jest.
2. **Eight high-signal mutator categories for parsers** (EqualityOperator, ArithmeticOperator, ConditionalExpression, UpdateOperator, LogicalOperator, StringLiteral→"", MethodExpression, BlockStatement) plus Regex (21 sub-operators) with elevated equivalent-mutant overhead.
3. **No native sampling or `--since` flag.** The universal composition pattern is `perTest + incremental + narrowed --mutate + ignoreStatic + tuned concurrency`. Sentry (Aug 2024) is the canonical wall-clock dataset — Vitest 25 min / Jest 60 min per package; weekly cadence.
4. **fast-check ↔ Stryker composition works** but requires explicit seed pinning for label stability. Stryker does not re-seed; default seed is time-based. Shrunk counterexamples can legitimately shift between mutants because the predicate changes. One known Vitest-specific bug (#5714) fixed 2026-01-30.
5. **Ecosystem adoption is essentially absent** from unified/remark/markdown-it/Prettier/ProseMirror public repos. Baseline rigor: `c8 --100` + `type-coverage --at-least 100` + fixtures.

**Confidence gaps:** PR #5931 merge timeline; community bun-runner real-world perf; per-tsconfig-flag mutant-elimination effects; composed effect of all cost levers on a ~500-LOC core + ~4K-LOC suite specifically.
