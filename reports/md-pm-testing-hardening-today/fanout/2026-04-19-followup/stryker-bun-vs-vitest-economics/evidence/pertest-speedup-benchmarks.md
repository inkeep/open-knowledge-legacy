# Evidence: perTest speedup — real wall-clock numbers

**Dimension:** FU1.1 — Real wall-clock benchmarks on parser-shaped TS suites
**Date:** 2026-04-19
**Sources:** Stryker docs, Stryker blog (2018 + 2023), Sentry engineering blog (2024), Stryker 7.0 release notes

---

## Key pages referenced

- [Stryker Configuration — coverageAnalysis](https://stryker-mutator.io/docs/stryker-js/configuration/) — official description of `off` / `all` / `perTest`
- [TypeScript coverage analysis support (blog, 2018)](https://stryker-mutator.io/blog/typescript-coverage-analysis-support/) — original announcement, self-benchmarked
- [Announcing StrykerJS 7.0: Vitest and Tap test runner support](https://stryker-mutator.io/blog/announcing-stryker-js-7/) — vitest-runner launched with forced `perTest`
- [Vitest Runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) — `coverageAnalysis` is ignored; always `perTest`
- [Sentry: Mutation-testing our JavaScript SDKs (Aug 2024)](https://sentry.engineering/blog/js-mutation-testing-our-sdks) — 12-package monorepo, weekly run

---

## Findings

### Finding: Stryker's own benchmark puts `perTest` at 40–60% faster than `all`
**Confidence:** CONFIRMED (via Stryker's self-reported docs; no independent validation)
**Evidence:** Stryker Configuration docs + multiple mirrors:

> "Running with 'perTest' coverage yields a significant performance improvement, usually between 40% and 60%. In big projects with 100s of tests, this quickly adds up to minutes."

> On the Stryker-on-Stryker self-test: "shaving off about 6 minutes for single run, about a 50% performance increase."
> — [TypeScript coverage analysis support blog](https://stryker-mutator.io/blog/typescript-coverage-analysis-support/)

**Implications:** `perTest` is a **1.7–2.5× speedup**, not an order-of-magnitude win. The parent report's framing of `perTest` as "the largest runtime multiplier" overstates the delta.

⚠️ **Vendor source caveat:** This benchmark is from the Stryker team promoting their own feature. No independent benchmark on a parser/serializer TS suite was located.

---

### Finding: Sentry JS SDK — switching from Jest-runner to Vitest-runner on same SDK package cut mutation run from 60 min → 25 min
**Confidence:** CONFIRMED
**Evidence:** [Sentry engineering blog](https://sentry.engineering/blog/js-mutation-testing-our-sdks) (Aug 2024):

> "By switching from Jest to Vitest in the Core SDK package, the MT runtime was reduced from 60 minutes to 25 minutes."

> "To minimize the performance impact, we chose to selectively run tests based on the per-test coverage determined by Stryker."

> Full run across 12 packages: ~35-45 minutes; weekly cadence chosen because per-PR is infeasible.

**Implications:** On a real SDK-shaped TS codebase with mocks + snapshots, Jest-runner → Vitest-runner is a **~2.4× speedup**. This is the largest real-world datapoint found on a non-Stryker-authored codebase. Both were presumably with `perTest` — the Jest runner supports `perTest` too, so the delta here is runner overhead + transform speed + single-threaded vitest-runner efficiency, not `perTest` enablement.

---

### Finding: vitest-runner hardcodes `perTest` + `disableBail: false` + single-threaded
**Confidence:** CONFIRMED
**Evidence:** [Vitest Runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/):

> "Your `coverageAnalysis` property is ignored. The vitest runner plugin will always use 'perTest' coverage analysis (which yields the best performance anyway)."
>
> "Tests run in a single thread since StrykerJS manages parallel processing independently."
> "The runner bails on the first test failure (unless `disableBail` is disabled)."

**Implications:** vitest-runner is a tuned path — `perTest` is not opt-in, it is the only mode. Fail-fast is on by default. Parallelism is at the Stryker mutant level, not the vitest worker level.

---

## Negative searches

- Searched: "stryker perTest benchmark parser TypeScript minutes" — no parser-specific benchmarks found; only generic SDK/framework case studies (Sentry, Angular, Vue.js).
- Searched: "stryker coverageAnalysis all vs perTest" head-to-head — only Stryker's own 40-60% claim; no third-party reproduction.
- Searched: "mutation testing parser TypeScript wall-clock" — no published case studies on parser/serializer codebases.

## Gaps

- No independent benchmark of `perTest` vs `all` on a parser-shaped suite (500-5000 LOC prod + 1000-4000 LOC tests).
- Sentry did not publish per-mode deltas (all vs perTest), only framework deltas (Jest → Vitest).
- Stryker's own 40-60% figure is from a large project (hundreds of tests) — unclear how it scales on smaller parser suites.
