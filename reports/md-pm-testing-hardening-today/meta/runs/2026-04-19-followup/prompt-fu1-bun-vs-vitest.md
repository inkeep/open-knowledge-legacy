You are conducting deep technical research as a follow-up sub-instance. A parent report on this topic already exists and will be enriched with your findings.

## PARENT REPORT CONTEXT

**Purpose:** What testing techniques should an iron-clad md ⇄ PM TS pipeline carry today to surface latent bugs? (Parent report already shipped: mutation testing, differential testing, whitespace edge cases, pathological inputs + divergence corpus.)

**Primary question (this follow-up):** Is the economics of using Stryker with `stryker-mutator-bun-runner@0.4.0` vs migrating off `bun test` to `vitest` (to unlock `@stryker-mutator/vitest-runner` with `coverageAnalysis: "perTest"`) load-bearing enough to be a decision factor? Measure actual wall-clock cost delta on comparable TS parser test suites, not Stryker docs' general claims.

**Stance:** Factual/Landscape — layout of options with tradeoffs. NOT recommendations. If numbers point one way, state the numbers flatly.

**Non-goals:**
- No first-party codebase analysis
- No Rust-specific pre-work
- No recommendation ranking between the two options

## EXISTING FINDINGS ON THIS TOPIC (from parent REPORT.md)

- Stryker-js v9.6.1 (2026-04-10) is active and mature. No first-party bun runner exists.
- Three open GitHub items track the bun gap: [#4439](https://github.com/stryker-mutator/stryker-js/issues/4439), [#5424](https://github.com/stryker-mutator/stryker-js/issues/5424), [PR #5931](https://github.com/stryker-mutator/stryker-js/pull/5931).
- Blocked on [oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191) (closed 2026-01-21 as duplicate) — Bun lacks programmatic test-runner API.
- Available paths parent identified:
  1. Community `stryker-mutator-bun-runner@0.4.0` (single maintainer, Apache-2.0, `coverageAnalysis: "off"`; author claims 2-3× perf vs Node runners — no independent validation)
  2. Stryker's default `command` runner invoking `bun test` (docs warn: "comes with a performance penalty, as Stryker cannot do any optimizations and just runs all tests for all mutants")
  3. Migrate to `@stryker-mutator/vitest-runner` or `@stryker-mutator/jest-runner` (enables `coverageAnalysis: "perTest"` — parent notes this is the largest runtime multiplier)
- Sentry JS SDK empirical reference (Aug 2024): `coverageAnalysis: "perTest"` + `ignoreStatic: true`, weekly cadence, 25-60 min per package on 12-package monorepo, mutation score 0.62 on core. [Source](https://sentry.engineering/blog/js-mutation-testing-our-sdks).

## YOUR RESEARCH TASK

Produce a focused economic analysis of the Option 1 / Option 2 / Option 3 tradeoff with CONCRETE wall-clock numbers where available. Answer:

1. **Does `coverageAnalysis: "perTest"` actually provide an order-of-magnitude speedup on parser-shaped suites, or is the real-world delta smaller?** Parent asserts it based on Stryker docs + general claims; the target is to find real benchmarks on TS parser/serializer codebases.

2. **Community `stryker-mutator-bun-runner` claims 2-3× vs Node — is this plausible given bun's general 2-4× speedup for test-runner workloads? What do the actual Bun benchmarks vs Node suggest for the kind of test our pipeline runs?**

3. **How much friction does a `bun test` → vitest migration impose on a TS codebase that already uses fast-check, snapshot tests, and ~4000 LOC of fidelity tests?** What breaks? What's the compat surface?

4. **Is there a hybrid path? E.g., keep `bun test` as the primary runner, but run Stryker with vitest as a second CI tier on the same test files.** vitest can run bun-authored tests in many cases — at what cost?

## DIMENSIONS TO INVESTIGATE

### FU1.1 — Real wall-clock benchmarks on parser-shaped TS suites (P0)
- Mutation-testing benchmarks (not general test-runner benchmarks) on TS suites with 500-5000 LOC production code + 1000-4000 LOC test code
- `coverageAnalysis: "perTest"` vs `"all"` vs `"off"` — actual ratio on real projects
- Sentry JS SDK blog + any follow-up posts + other published case studies
- Find repos using Stryker with public CI logs showing timings

### FU1.2 — `stryker-mutator-bun-runner` reality check (P0)
- Its npm downloads trend, GitHub issue count, last-commit recency — maintenance signal
- Bun vs Node test-runner general benchmarks (2026, not older)
- Does the plugin's `coverageAnalysis: "off"` mean every mutation runs the full suite? What's the multiplier on ~1000 tests × ~1000 mutants = 1M test invocations?
- Any independent user reports on the npm or GitHub sharing their experience

### FU1.3 — Bun → vitest migration compatibility matrix (P0)
- What parts of `bun test` don't translate: globals (`Bun.env`, `Bun.file`), `.toMatchSnapshot` format differences, `expect` extensions, test helpers
- fast-check compatibility with vitest (should be clean — fast-check is runner-agnostic)
- Are there any known vitest gotchas with large-ish test suites? (vitest 1.x vs 2.x)
- Migration effort estimate: person-days on a ~4000 LOC test suite

### FU1.4 — Hybrid / escape-hatch patterns (P1)
- Running Stryker as a separate CI workflow on top of a different test runner from the primary one
- Does anyone run Stryker in nightly with one runner while primary CI uses another?
- Is there a pattern of test-file-level duplication (`.stryker.test.ts` vs `.test.ts`)?

### FU1.5 — Decision economics synthesis (P0)
- Consolidate: if `perTest` gives X× speedup and migration costs Y days, at what mutant-count does option 3 pay off vs option 1?
- Layout these as a tradeoff matrix, NOT a recommendation

## CONSTRAINTS

- All citations external primary sources (GitHub, npm, Stryker docs, vitest docs, Bun docs, blog posts with dates)
- Frame findings as additive to the parent report's existing Part I — you are enriching, not replacing
- Training-data claims flagged "unverified" if no source
- **Output location:** `/Users/edwingomezcuellar/reports/md-pm-testing-hardening-today/fanout/2026-04-19-followup/stryker-bun-vs-vitest-economics/`
- **Filename:** `REPORT.md` (uppercase)
- **Evidence files:** in `evidence/` with frontmatter
- Target: 1200-2500 words. Moderate depth — focused on one economic question.

Depth: moderate — user explicitly labeled this direction as Moderate.
