---
name: Stryker-bun-runner vs vitest-migration economics
description: Wall-clock economics of three Stryker runner options for a TS md⇄PM pipeline — keep `bun test` + community plugin, run via Stryker's `command` runner, or migrate to vitest + official `@stryker-mutator/vitest-runner`. Plus hybrid Option 3b.
date: 2026-04-19
sources: Stryker docs, Sentry engineering blog, npm registry API, PkgPulse benchmarks, OneUpTime blog, Vitest migration guide, GitHub (stryker-js, stryker-mutator-bun-runner, dubzzz/fast-check)
---

# Evidence: Stryker-bun-runner vs vitest-migration economics

## Key sources referenced

- [Stryker configuration docs](https://stryker-mutator.io/docs/stryker-js/configuration/) — `coverageAnalysis` semantics (`off` / `all` / `perTest`)
- [Stryker vitest-runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) — forced `perTest`, single-threaded, fail-fast
- [Announcing StrykerJS 7.0: Vitest runner](https://stryker-mutator.io/blog/announcing-stryker-js-7/) — integration rationale
- [Sentry: Mutation-testing our JavaScript SDKs](https://sentry.engineering/blog/js-mutation-testing-our-sdks) — 60 min → 25 min data on TS SDK package
- [stryker-mutator-bun-runner](https://github.com/menoncello/stryker-mutator-bun-runner) — community plugin, Apache-2.0
- [stryker-mutator-bun-runner on npm](https://www.npmjs.com/package/stryker-mutator-bun-runner) — download stats
- [stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) — upstream-adoption issue from plugin author claiming perTest support
- [stryker-js#4439](https://github.com/stryker-mutator/stryker-js/issues/4439) — original bun-runner request
- [stryker-js PR #5931](https://github.com/stryker-mutator/stryker-js/pull/5931) — in-progress official bun runner (merge status uncertain)
- [oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191) — Bun programmatic test-runner API blocker (closed 2026-01-21)
- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [PkgPulse Bun vs Vitest vs Jest 2026](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026)
- [@fast-check/vitest on npm](https://www.npmjs.com/package/@fast-check/vitest)
- [OneUpTime: Mutation testing with Stryker](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
- [Bun bun:test vi API reference](https://bun.com/reference/bun/test/vi)

## Findings

### Finding: `perTest` over `all` is 1.7–2.5×, not order-of-magnitude
**Confidence:** CONFIRMED
**Evidence:** Stryker docs characterize the delta as "40–60% improvement" over `all` mode. The official [2018 Stryker-TS announcement](https://stryker-mutator.io/blog/announcing-faster-typescript-checking/) reports "about 6 minutes shaved off a single run, about a 50% performance increase" — vendor self-test on Stryker's own codebase; no third-party parser benchmark located.
**Implications:** The parent report's "largest multiplier" framing was colloquial, not measured. The real multiplier comes from the full runner-swap envelope (forced `perTest` + single-thread + runner transform speed); raw `perTest` alone is moderate.

### Finding: Sentry real-world datapoint: 60 min → 25 min = 2.4× on TS SDK package
**Confidence:** CONFIRMED
**Evidence:** [Sentry engineering blog, Aug 2024](https://sentry.engineering/blog/js-mutation-testing-our-sdks) — explicit "went from 60 minutes to 25 minutes for a single package" migrating `@stryker-mutator/jest-runner` → `@stryker-mutator/vitest-runner` on a TypeScript SDK package in a 12-package monorepo.

```
Config details reported:
  coverageAnalysis: "perTest"
  ignoreStatic: true
  mutationScore (on "core"): 0.62
```

**Implications:** This is the cleanest public runner-swap datapoint for a codebase of roughly the target shape (SDK-style TS with mocks and snapshots). Per-package results vary — only the headline "single package 60→25" is published; full monorepo delta may differ.

### Finding: `stryker-mutator-bun-runner@0.4.0` — modest/accelerating adoption, solo maintainer, disputed perTest
**Confidence:** CONFIRMED (download stats, maintenance signals); UNCERTAIN (perTest claim)
**Evidence:**
- npm registry queried 2026-04-19: 4,390 monthly downloads, 2,615 weekly downloads — accelerating pace (weekly × 52 projects ~135k/year if sustained)
- GitHub repo: 5 stars, 0 open issues, 29 commits, no GitHub Releases published — bus factor 1
- Package ships Apache-2.0, targets `@stryker-mutator/core ^9.0.0`

**Contradiction:** Parent report (based on initial research) stated the plugin uses `coverageAnalysis: "off"` (every mutation runs the full suite). Issue #5424 (author's upstream-adoption request to @stryker-mutator) advertises "Smart coverage analysis with perTest coverage support." Cannot both be true. Reading the plugin source at [src/BunTestRunner.ts](https://github.com/menoncello/stryker-mutator-bun-runner) (or equivalent) resolves this in minutes and collapses the Option 1 economics question.

Author's "2-3× perf vs Node runners" claim is plausible given Bun's general test-runner benchmarks but is **not independently validated** against `@stryker-mutator/jest-runner` or `@stryker-mutator/vitest-runner` on the same test suite.

### Finding: Bun test vs vitest raw speed on pure-logic TS: 3–10×
**Confidence:** CONFIRMED (single source)
**Evidence:** [PkgPulse 2026 benchmark](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026) — 50 tests × 10 files:
```
Jest:   1.2s
Vitest: 0.9s
Bun:    0.08s
```
Note: the Bun figure is mostly startup advantage; scaling to ~4000-LOC suites likely narrows the gap.

**Implications:** A parser pipeline is exactly the pure-logic workload where Bun's test-runner design shines — if the bun-runner supports `perTest`, Option 1 could plausibly match or beat Option 3 wall-clock. If `coverageAnalysis: "off"`, Option 1 collapses to command-runner territory on any suite with >500 tests.

### Finding: bun → vitest migration effort: 0.5–3 person-days on ~4000 LOC parser test suite
**Confidence:** INFERRED (aggregated from Vitest migration guide + Bun API compatibility docs)
**Evidence:** Compatibility matrix:

| Concern | Status | Source |
|---|---|---|
| `describe/it/expect` API | Identical (Jest-flavored in both) | [Vitest API](https://vitest.dev/api/) + [bun:test](https://bun.com/reference/bun/test/vi) |
| `.toMatchSnapshot()` (.snap files) | Identical format — migrate verbatim | Snapshot tests use Jest-compatible `.snap` format in both |
| `.toMatchInlineSnapshot()` | Bun doesn't support; N/A migration | [Vitest migration](https://vitest.dev/guide/migration.html) |
| fast-check | Runner-agnostic by design | [@fast-check/vitest](https://www.npmjs.com/package/@fast-check/vitest) is optional upgrade |
| `Bun.env`, `Bun.file`, `Bun.spawn` | Must be replaced with Node equivalents | Code-level change in test files |
| `jsdom` / testing-library | N/A for parser pipeline | Not applicable |
| TypeScript execution | Both work; different transformers | esbuild/swc (vitest) vs native TS (bun) |

Vitest's own migration guide characterizes migrations as "hours, not days." Concentrated friction: `Bun.*` API audit + vitest config. For a pipeline without Bun-specific APIs, the lower bound (0.5 day) is realistic; upper bound (3 days) accounts for CI config + debug.

### Finding: Option 3b hybrid (bun primary + vitest inside Stryker) is established practice
**Confidence:** CONFIRMED
**Evidence:**
- [Sentry engineering blog](https://sentry.engineering/blog/js-mutation-testing-our-sdks): mutation testing runs as a separate workflow (not primary CI)
- [OneUpTime blog](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view): documents the same decoupling pattern

The pragmatic shape:
1. Primary CI + dev loop: `bun test` (fast feedback, native TS)
2. Separate `.github/workflows/mutation-test.yml` on cron: Stryker + `@stryker-mutator/vitest-runner` with `vitest.config.ts` resolving the same `*.test.ts` files
3. Test files remain runner-agnostic — use `import { test, expect } from "bun:test"` swapped at build for vitest, OR enable vitest `globals: true` and use ambient globals

**Implications:** Option 3b sidesteps the binary forced-choice between "keep bun" and "migrate to vitest." It requires a partial migration (test-file import shape) without changing developer workflow. No precedent was found for maintaining parallel `.stryker.test.ts` files — that would be novel and incur double-maintenance.

### Finding: Break-even sketch — ~9 months weekly cadence for 2-day migration at 2.4× speedup
**Confidence:** INFERRED (arithmetic from published numbers)
**Evidence:** If vitest-runner delivers 2.4× over baseline and migration costs 2 person-days:
- 40-min baseline → 17-min vitest run
- Per-run savings: 23 min
- Weekly cadence over a quarter: 13 runs × 23 min = ~5 saved hours vs 16 migration hours
- Break-even: ~9 months of weekly runs

**Caveat:** Arithmetic ignores the human cost of waiting during iteratively-tuned mutation campaigns, where 20-min turnarounds compound worse than linear. Nightly or daily cadence would shift break-even closer.

## Negative searches

- Searched: TS parser/serializer repos using Stryker (github code search `"@stryker-mutator/typescript-checker" parser`) — no public adopter on pure parser code. Confirmed.
- Searched: independent third-party benchmark of `stryker-mutator-bun-runner` vs `@stryker-mutator/jest-runner` on the same suite — NOT FOUND. Only author's self-claim.
- Searched: published patterns for maintaining parallel `.stryker.test.ts` test files — NOT FOUND. Option 3b treats test files as runner-agnostic source, not duplicated.

## Gaps / follow-ups

- **Unresolved:** plugin source read to confirm or refute `coverageAnalysis: "perTest"` support in `stryker-mutator-bun-runner`. Single highest-leverage investigation.
- PR #5931 (in-progress official bun runner) merge timeline unknown.
- Per-package breakdown of Sentry's 60→25 min figure unknown — only one package's number is published.
