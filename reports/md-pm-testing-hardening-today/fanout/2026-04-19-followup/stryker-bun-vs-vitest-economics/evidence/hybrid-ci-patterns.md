# Evidence: Hybrid CI patterns — Stryker with one runner, primary CI with another

**Dimension:** FU1.4 — Hybrid / escape-hatch patterns
**Date:** 2026-04-19
**Sources:** Stryker docs, Sentry engineering blog, various Stryker-in-CI guides

---

## Key pages referenced

- [Stryker docs — Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
- [Sentry engineering — Mutation testing our JS SDKs](https://sentry.engineering/blog/js-mutation-testing-our-sdks)
- [OneUpTime 2026 — Mutation testing with Stryker](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
- [alexop.dev — Mutation testing with AI Agents when Stryker doesn't work (vitest browser mode)](https://alexop.dev/posts/mutation-testing-ai-agents-vitest-browser-mode/)

---

## Findings

### Finding: The "weekly-cadence-on-separate-workflow" pattern is explicitly documented and used by Sentry
**Confidence:** CONFIRMED
**Evidence:**

- [Sentry engineering blog](https://sentry.engineering/blog/js-mutation-testing-our-sdks): "A complete CI run takes around 35–45 minutes, which is definitely too long to run this on every PR or push. We decided to run our mutation testing setup once every week to track the score over time."
- [OneUpTime 2026](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view): "Full runs on large projects may take 30–60 minutes, which is why teams typically run those on a nightly or weekly schedule." Example YAML: `.github/workflows/mutation-test.yml` with its own `on: schedule: cron:` trigger, separate from the main test workflow.

**Implications:** The hybrid pattern is standard practice — primary CI (fast, per-PR) and mutation CI (slow, nightly/weekly) are routinely decoupled workflows. This is not an exotic escape-hatch — it's the default shape for teams running Stryker at realistic scale.

---

### Finding: There is no technical barrier to running Stryker with a different runner than primary CI's runner, provided both runners can consume the same test files
**Confidence:** INFERRED (from how Stryker's runner abstraction works — no counter-evidence found)
**Evidence:**

- Stryker runner plugins (`@stryker-mutator/vitest-runner`, `@stryker-mutator/jest-runner`, `stryker-mutator-bun-runner`) are each configured via `testRunner` in `stryker.conf.json`. This is independent of how the repo runs tests via `npm test` / `bun test`.
- Test files themselves (`*.test.ts`) are just TypeScript — what executes them is determined by the invoking tool.
- As noted in the bun-vitest-migration-compat evidence: describe/it/expect are common across runners; fast-check is runner-agnostic. A file written for `bun test` runs unchanged under vitest if imports are adjusted.

**Implications:** A viable hybrid is:
1. **Dev + primary CI:** `bun test` (fast feedback, native TS, existing workflows untouched)
2. **Nightly/weekly mutation workflow:** Stryker + `@stryker-mutator/vitest-runner` on a `vitest.config.ts` that resolves the same `*.test.ts` files (adjusting only imports/globals via `globals: true`)

The cost is maintaining a second runner config and ensuring test files stay compatible with both (low-effort if files are already runner-agnostic, per FU1.3).

---

### Finding: No published evidence of the `.stryker.test.ts` parallel-suite pattern
**Confidence:** NOT FOUND
**Evidence:** Searched for "stryker test file parallel suite duplicate" and related phrasings. No results.

**Implications:** Maintaining two parallel test files per source file (`*.test.ts` for bun, `*.stryker.test.ts` for vitest) is theoretically possible but has no community precedent — it doubles maintenance burden without any documented benefit. The hybrid pattern in the previous finding (same files, different runners) is the pragmatic shape.

---

### Finding: Stryker-vitest runner's forced `perTest` + single-threaded + fail-fast is already the "tuned" shape
**Confidence:** CONFIRMED
**Evidence:** [Vitest Runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/):

> "Tests run in a single thread since StrykerJS manages parallel processing independently." "The runner bails on the first test failure." "coverageAnalysis is always perTest."

**Implications:** The Sentry 60→25 min delta (Jest → Vitest, documented elsewhere in evidence) captures the full runner-level economics. No additional tuning on top of vitest-runner is expected to yield more than marginal gains. This means Option 3's wall-clock ceiling is roughly Sentry's numbers — scaled to the user's test + mutant count.

---

## Negative searches

- "stryker nightly mutation CI vitest" — confirms the pattern is common, but no benchmark on a parser-shaped TS suite located.
- "stryker bun runner nightly" — no case studies found (the plugin is too new + too niche).
- "stryker parallel test file suite duplicate" — no precedent for `.stryker.test.ts` convention.

## Gaps

- No case study of a team running bun test as primary + Stryker+vitest nightly on the same suite, with documented migration effort.
- Unknown whether Stryker's vitest-runner has any issues with fast-check's shrinking behavior during mutant-killing test runs (unlikely but unverified).
