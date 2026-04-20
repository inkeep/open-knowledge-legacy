---
title: "Stryker with Bun vs Migrating to Vitest — Economic Analysis"
description: "Follow-up research on the wall-clock cost delta between keeping bun test + the community stryker-mutator-bun-runner vs migrating the TS md ⇄ PM parser pipeline to vitest to unlock @stryker-mutator/vitest-runner. Synthesizes real Stryker-on-TS-SDK benchmarks, perTest speedup numbers, bun↔vitest migration compatibility, and hybrid CI patterns. Non-recommending — numbers flat."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - Stryker
  - Bun
  - Vitest
  - stryker-mutator-bun-runner
  - fast-check
topics:
  - mutation testing
  - test runner economics
  - CI cadence
  - migration effort
---

# Stryker with Bun vs Migrating to Vitest — Economic Analysis

**Purpose:** The parent report left an open question: *is the wall-clock economics of keeping `bun test` + community bun-runner vs migrating to vitest + `@stryker-mutator/vitest-runner` actually load-bearing for a TS md ⇄ PM pipeline, or does it disappear in the noise of mutation testing overhead?* This follow-up replaces the parent's "perTest is the largest multiplier" framing with measured numbers, surfaces a contradiction about `coverageAnalysis` support in the bun runner, and lays out the three options flat. **No recommendation.**

---

## Executive Summary

The economic delta between the three available paths is real but **smaller and more nuanced than the parent report framed it**. Three numbers anchor the decision:

1. **`perTest` vs `all` coverage analysis is a ~1.7–2.5× speedup, not an order of magnitude.** Stryker's own documentation cites 40–60% improvement, and no independent benchmark on a parser-shaped TS suite was located. [Source: Stryker docs.](https://stryker-mutator.io/docs/stryker-js/configuration/)

2. **Jest-runner → Vitest-runner on the same TypeScript SDK package cut Sentry's mutation run from 60 min to 25 min (2.4×).** This is the cleanest real-world datapoint on a codebase of the user's rough shape (SDK-style TS with mocks and snapshots). [Source: Sentry engineering blog, Aug 2024.](https://sentry.engineering/blog/js-mutation-testing-our-sdks)

3. **`stryker-mutator-bun-runner` has ~4,400 monthly / ~2,600 weekly npm downloads as of April 2026** — modest but accelerating adoption, solo-maintained, no official Stryker blessing. A **contradiction exists** between the parent report (which stated the plugin uses `coverageAnalysis: "off"`) and the author's upstream-adoption issue ([#5424](https://github.com/stryker-mutator/stryker-js/issues/5424)) which explicitly advertises "Smart coverage analysis with perTest coverage support." Resolving this contradiction by reading the plugin source is **the single highest-leverage investigation** before committing to any path.

**Key Findings:**

- **The headline multiplier is the runner choice + perTest, combined.** vitest-runner forces `perTest` and runs single-threaded (Stryker parallelizes at the mutant level). This tuned path is what Sentry's 2.4× represents.
- **Bun's standalone speed advantage (3-10× vs vitest on pure-logic TS) does not translate directly to Stryker wall-clock.** Stryker overhead — mutant generation, instrumentation, inter-process coordination — dominates as test-invocation count grows. Raw runner speed matters less.
- **The `command` runner path (Option 2) does not scale.** Running the full test suite for every mutant with 1k tests × 1k mutants is ~1M test invocations per run. Stryker docs explicitly warn against this pattern.
- **Migration effort bun → vitest on a parser codebase is low.** fast-check is runner-agnostic; snapshots migrate via .snap file format identity; describe/it/expect are Jest-flavored in both. Friction is concentrated in `Bun.*` API usage and optional config. Rough estimate: **0.5–3 person-days** for ~4000 LOC of fidelity tests depending on `Bun.*` footprint.
- **The hybrid path exists and is standard practice.** Sentry, OneUpTime, and others explicitly decouple a slow mutation workflow (nightly/weekly) from fast primary CI. Keeping `bun test` for dev + primary CI while using vitest-runner in a separate nightly Stryker workflow is architecturally clean — no published evidence of anyone forking tests into `.stryker.test.ts` parallel files.

---

## Research Rubric (auto-derived)

| Dim | Question | Priority |
|---|---|---|
| FU1.1 | Real wall-clock perTest speedup on parser-shaped TS | P0 |
| FU1.2 | stryker-mutator-bun-runner maintenance + bun test perf | P0 |
| FU1.3 | bun test → vitest migration compatibility matrix | P0 |
| FU1.4 | Hybrid / escape-hatch patterns | P1 |
| FU1.5 | Decision economics synthesis | P0 |

**Stance:** Factual/Landscape. **Non-goals:** No 1P codebase analysis, no Rust pre-work, no recommendation ranking.

---

## Detailed Findings

### FU1.1 — `perTest` real-world speedup: 1.7–2.5×, not order-of-magnitude

**Finding:** The parent report's framing of `coverageAnalysis: "perTest"` as "the largest runtime multiplier" overstates the measured delta. Stryker's official docs and self-benchmark put it at **40–60% faster than `all` mode**, which is 1.7–2.5×. The 2018 announcement blog reports "about 6 minutes shaved off a single run, about a 50% performance increase" on Stryker-on-Stryker — vendor self-test, no third-party reproduction on a parser suite.

The real amplifier is **not** switching on `perTest` per se — it is switching to a runner that forces `perTest` and is tuned for Stryker's parallelism model. `@stryker-mutator/vitest-runner` does exactly this: it hardcodes `perTest`, runs tests single-threaded, and enables fail-fast. [Stryker vitest-runner docs.](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)

**Evidence:** [evidence/pertest-speedup-benchmarks.md](evidence/pertest-speedup-benchmarks.md)

**Implications:**
- Expecting 10× from turning perTest on alone is unsupported.
- The cleanest real-world mutation-testing runner swap data is Sentry's: Jest-runner → vitest-runner on a TypeScript SDK package cut one package's run from 60 min to 25 min (2.4×). [Source.](https://sentry.engineering/blog/js-mutation-testing-our-sdks) This folds in runner transform speed, single-thread vs worker-pool discipline, and perTest — it's the full Option 3 envelope.
- For a parser pipeline running ~1000 mutants against ~1000 tests (rough target shape), the absolute delta between "best case perTest on a tuned runner" and "command runner running all tests per mutant" is **1–2 orders of magnitude** — but that's the `command` penalty, not the `perTest` bonus.

---

### FU1.2 — stryker-mutator-bun-runner: modest usage, solo-maintained, disputed perTest claim

**Finding:** The community [stryker-mutator-bun-runner](https://github.com/menoncello/stryker-mutator-bun-runner) is live and used:
- npm downloads (queried via registry API 2026-04-19): **4,390 last month; 2,615 last week** (curve is accelerating — weekly pace puts monthly at ~11k if extrapolated).
- GitHub: 5 stars, 0 open issues, 29 commits, no GitHub Releases published. Bus factor = 1.
- Author is actively seeking adoption into `@stryker-mutator` official scope ([#5424](https://github.com/stryker-mutator/stryker-js/issues/5424)).

**Contradiction to resolve:** The parent report stated the plugin runs with `coverageAnalysis: "off"`. Issue #5424 advertises "Smart coverage analysis with perTest coverage support" as a plugin feature. These cannot both be true. The plugin's README could not be fetched during research (404 on the standard paths). **Reading the plugin source (src/BunTestRunner.ts or equivalent) is the cheapest way to resolve this.** If perTest is genuinely supported, Option 1's economics improve materially and the Option 1 vs Option 3 tradeoff narrows significantly.

Bun test itself is **3–10× faster than vitest on pure-logic TS** (benchmarks: 50 tests across 10 files, Jest 1.2s / Vitest 0.9s / Bun 0.08s — though the Bun figure is mostly startup advantage). [PkgPulse 2026.](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026) A parser pipeline is exactly the pure-logic workload where Bun shines. The author's "2-3× process-pool execution" claim is plausible but **not independently benchmarked against @stryker-mutator/jest-runner or vitest-runner**.

**Evidence:** [evidence/stryker-bun-runner-reality.md](evidence/stryker-bun-runner-reality.md)

**Implications:**
- Option 1 has real operational risk (single maintainer, no official support) that has nothing to do with runtime performance.
- If the plugin truly supports perTest, the raw-runner advantage (bun's 3-10× on pure-logic TS) combined with perTest could plausibly match or beat vitest-runner. If it uses `coverageAnalysis: "off"`, economics collapse catastrophically on any suite with >500 tests.
- The `command` runner fallback (Option 2) is unviable for a 1k × 1k mutation matrix per Stryker's own performance warning.

---

### FU1.3 — bun test → vitest migration: low friction on a parser-shaped suite

**Finding:** The migration surface is smaller than it first appears, because the things a parser pipeline uses most (describe/it/expect + fast-check + file-based snapshots) are all cleanly portable:

| Concern | Status |
|---|---|
| `describe/it/expect` API | Identical (both are Jest-flavored) |
| `.toMatchSnapshot()` (.snap files) | Identical format, migrate verbatim |
| `.toMatchInlineSnapshot()` | Bun doesn't support it — not a migration concern from Bun |
| fast-check | Runner-agnostic (use inside `it(...)`); `@fast-check/vitest` exists as optional upgrade |
| `Bun.env`, `Bun.file`, `Bun.spawn` | Must be replaced with node equivalents in test code |
| `jsdom` / testing-library | Parser has no DOM — not applicable |
| TypeScript execution | vitest transforms via esbuild/swc; bun runs TS natively — compile speed differs but both work |

The Vitest migration guide self-describes migrations as "hours, not days." For ~4000 LOC of fidelity tests with fast-check + snapshots, the realistic effort range is **0.5–3 person-days**, concentrated on `Bun.*` audit and config setup.

**Evidence:** [evidence/bun-vitest-migration-compat.md](evidence/bun-vitest-migration-compat.md)

**Implications:**
- Migration is not the load-bearing cost; it's a one-time expense amortized over all future mutation runs.
- The migration does not force abandoning `bun test` for primary CI — see FU1.4.
- fast-check compatibility, which would have been the biggest risk, is confirmed clean by the library's own runner-agnostic design.

---

### FU1.4 — Hybrid path: bun test for dev/CI + vitest-runner only inside Stryker

**Finding:** Running Stryker with a different test runner than the primary CI test runner is **standard practice, not an escape hatch**. Sentry and OneUpTime both document the pattern: mutation testing runs as a separate nightly/weekly workflow because per-PR wall-clock is infeasible on any real codebase.

The pragmatic shape:
1. Primary CI + dev loop: `bun test` (fast feedback, native TS, existing workflows untouched)
2. Separate `.github/workflows/mutation-test.yml` on cron: Stryker + `@stryker-mutator/vitest-runner` with a `vitest.config.ts` resolving the same `*.test.ts` files

Requirements: test files remain runner-agnostic (use `import { test, expect } from "bun:test"` swapped at build for vitest, OR enable vitest `globals: true` and use ambient globals). No community precedent was found for maintaining parallel `.stryker.test.ts` files — this would be novel and carry double-maintenance cost without documented benefit.

**Evidence:** [evidence/hybrid-ci-patterns.md](evidence/hybrid-ci-patterns.md)

**Implications:**
- The Option 1 vs Option 3 decision is less binary than framed. A hybrid — bun-test-native primary path + vitest-runner nightly mutation workflow — is feasible and requires a partial migration (test-file import shape) rather than a wholesale runner switch.
- This extends Option 3 into a fourth implicit option: **Option 3b — keep bun test as primary runner, add vitest configuration as a second runner consumed only by Stryker.** Migration cost is the same as full Option 3 for the test files themselves, but zero for `package.json` scripts and developer workflow.

---

### FU1.5 — Decision economics synthesis (tradeoff matrix, no ranking)

| Dimension | Option 1: bun runner | Option 2: command runner | Option 3: vitest migration | Option 3b: hybrid (bun primary + vitest for Stryker only) |
|---|---|---|---|---|
| Per-mutant wall clock | Claimed 2-3× vs Node runners (unverified); perTest status disputed | Full suite per mutant (1M+ invocations on 1k×1k) — unviable | ~2.4× faster than Jest-runner baseline (Sentry) with forced perTest | Same runtime profile as Option 3 |
| Maintenance risk | Single maintainer, no official support, 5 stars | Default Stryker path, no runner plugin needed | Official Stryker plugin, active | Official for mutation; bun official for primary |
| One-time migration cost | ~0 person-days | ~0 person-days | 0.5-3 person-days | 0.5-3 person-days (same files, only test-import shape changes) |
| Ongoing friction | Risk of drift between plugin and Stryker core | Slow on anything non-trivial | Dual runner configs | Dual runner configs + keep test-file imports runner-compatible |
| fast-check + snapshots | Works (bun native) | Works | Works (`@fast-check/vitest` optional) | Works |
| Parser-shape suitability (pure-logic TS) | Best raw runner speed (3-10× vs vitest) | N/A (runner-independent) | Strong on Stryker overhead model | Same as Option 3 |
| Published case studies on TS parser suites | None found | None found | None found on parsers; Sentry on SDK | None found |

**Break-even sketch:** If vitest-runner delivers a 2.4× mutation-run speedup over baseline and migration costs 2 person-days, break-even depends on mutation-run frequency and baseline duration. Example: a 40-min baseline run → 17-min vitest run saves 23 min/run. A weekly cadence over a quarter = 13 runs × 23 min = ~5 saved hours vs 16 migration hours. Break-even arrives at ~**9 months of weekly runs** — but this ignores human cost of waiting during an iteratively-tuned mutation campaign, where 20-minute turnarounds compound badly.

If the bun runner's "2-3× vs Node" claim holds AND perTest is supported, Option 1 and Option 3 converge to roughly the same wall-clock; the deciding factor becomes maintenance risk (solo vs official) rather than economics. If perTest is *not* supported in the bun runner, Option 1 runs the full test suite per mutant and collapses to the Option 2 catastrophe curve.

---

## Limitations & Open Questions

### Highest-leverage open question
- **Does `stryker-mutator-bun-runner@0.4.0` actually support `coverageAnalysis: "perTest"`?** Parent report says no; the plugin's upstream-adoption issue says yes. Reading the plugin source resolves the entire Option 1 economics question.

### Dimensions not fully covered
- **No independent benchmark of perTest vs all on a parser-shaped TS suite.** The 40-60% figure is Stryker's self-report on their own codebase; a parser suite with 1k tests may diverge.
- **No head-to-head benchmark of stryker-bun-runner vs vitest-runner on the same test suite.** Author's "2-3× vs Node" claim cannot be corroborated.
- **Per-package breakdown of Sentry's 60 → 25 min figure unknown** — only the headline single-package number is published; full monorepo delta may be different.

### Out of scope (per rubric non-goals)
- No first-party codebase analysis.
- No Rust pre-work.
- No recommendation between Options 1/2/3/3b.

---

## References

### Evidence Files
- [evidence/pertest-speedup-benchmarks.md](evidence/pertest-speedup-benchmarks.md) — Stryker docs numbers, Sentry SDK swap data, vitest-runner forced-perTest
- [evidence/stryker-bun-runner-reality.md](evidence/stryker-bun-runner-reality.md) — npm download stats, maintenance signals, Bun test speed benchmarks, command runner arithmetic
- [evidence/bun-vitest-migration-compat.md](evidence/bun-vitest-migration-compat.md) — API compatibility matrix, fast-check, snapshots, Bun.* friction points
- [evidence/hybrid-ci-patterns.md](evidence/hybrid-ci-patterns.md) — nightly/weekly cadence precedent, decoupled workflow shape

### External Sources
- [Stryker configuration docs](https://stryker-mutator.io/docs/stryker-js/configuration/) — perTest semantics
- [Stryker vitest-runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) — forced perTest + single-thread
- [Announcing StrykerJS 7.0: Vitest runner](https://stryker-mutator.io/blog/announcing-stryker-js-7/)
- [Sentry: Mutation-testing our JavaScript SDKs (2024)](https://sentry.engineering/blog/js-mutation-testing-our-sdks) — 60 → 25 min datapoint
- [stryker-mutator-bun-runner GitHub](https://github.com/menoncello/stryker-mutator-bun-runner)
- [Stryker issue #5424](https://github.com/stryker-mutator/stryker-js/issues/5424) — upstream-adoption request with perTest claim
- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [Bun bun:test vi API reference](https://bun.com/reference/bun/test/vi)
- [@fast-check/vitest on npm](https://www.npmjs.com/package/@fast-check/vitest)
- [PkgPulse Bun vs Vitest vs Jest 2026](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026)
- [OneUpTime: Mutation testing with Stryker (2026)](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)

### Related Research
- Parent report: `reports/md-pm-testing-hardening-today/REPORT.md` — covers broader mutation testing landscape (Stryker setup, operators, divergence corpus). This follow-up replaces Part I's framing of `perTest` as "the largest multiplier" with measured numbers.
