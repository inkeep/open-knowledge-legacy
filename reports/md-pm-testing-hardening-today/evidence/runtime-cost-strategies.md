---
dimension: D1.3 — Runtime cost strategies
date: 2026-04-19
sources: stryker-mutator.io/docs, stryker-mutator.io/blog, github.com/stryker-mutator/stryker-js, sentry.engineering, third-party tutorials
---

# Evidence: D1.3 — Runtime Cost Strategies

## Key files / pages referenced

- [Stryker Incremental mode docs](https://stryker-mutator.io/docs/stryker-js/incremental/)
- [Announcing Stryker Incremental Mode (blog)](https://stryker-mutator.io/blog/announcing-incremental-mode/)
- [Stryker Configuration docs (full CLI flags)](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [Stryker Plugins docs](https://stryker-mutator.io/docs/stryker-js/plugins/)
- [stryker-js#551 Mutate only modified files](https://github.com/stryker-mutator/stryker-js/issues/551)
- [stryker-js#2542 Concurrency default formula](https://github.com/stryker-mutator/stryker-js/issues/2542)
- [stryker-js#4185 High-concurrency thrash on Ubuntu](https://github.com/stryker-mutator/stryker-js/issues/4185)
- [stryker-js mutation-testing.yml workflow](https://github.com/stryker-mutator/stryker-js/blob/master/.github/workflows/mutation-testing.yml)
- [Sentry — Mutation testing our JS SDKs (Aug 2024)](https://sentry.engineering/blog/js-mutation-testing-our-sdks) — primary wall-clock dataset
- [oneuptime.com — Mutation testing with Stryker (Jan 2026)](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
- [dev.to — Mutation testing with Stryker (Angular example)](https://dev.to/lucaspereiradesouzat/mutation-testing-with-stryker-1p4a)
- [lbtoma/stryker-git-checker](https://github.com/lbtoma/stryker-git-checker)

---

## Findings

### Finding: `--incremental` reuses prior mutant results via a git-like code+test diff
**Confidence:** CONFIRMED
**Evidence:** [Stryker Incremental docs](https://stryker-mutator.io/docs/stryker-js/incremental/)

- CLI: `--incremental`; config: `"incremental": true`
- Default cache: `reports/stryker-incremental.json` (override with `--incrementalFile`)
- Reuse rules: killed mutant reused if its killing test is unchanged; survived reused if no new tests cover it and existing covering tests are unchanged
- `--force` re-runs all mutants while still writing the incremental file
- **Documented blind spots:** changes outside mutation/test files (dependency upgrades, env vars, `.snap` files) are NOT detected; test-change detection quality varies by runner plugin (Jest: full; Command runner: none)

From the [incremental announcement blog](https://stryker-mutator.io/blog/announcing-incremental-mode/): sample run reused 3,731 of 3,965 mutants (92.1%) after a 4-line mutant-side change plus a 43-line test change.

### Finding: No native `--since` / git-diff flag; community pattern uses `git diff` to populate `--mutate`
**Confidence:** CONFIRMED
**Evidence:** [Stryker Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/) (no `--since` listed), [stryker-js#551](https://github.com/stryker-mutator/stryker-js/issues/551) (closed without adding native flag)

Community pattern (from [oneuptime.com](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)):

```bash
CHANGED_FILES=$(git diff --name-only origin/main...HEAD -- 'src/**/*.ts' | paste -sd, -)
npx stryker run --mutate "$CHANGED_FILES"
```

The closest native feature is `--incremental`.

### Finding: Third-party `stryker-git-checker` plugin provides diff-based filtering as a `checker`
**Confidence:** CONFIRMED (experimental)
**Evidence:** [lbtoma/stryker-git-checker](https://github.com/lbtoma/stryker-git-checker)

```js
checkers: ["git-checker"],
plugins: ["@stryker-mutator/jest-runner", "stryker-git-checker"]
```

Self-described as "quite experimental" with incomplete Windows and complex-TS/React support. Not maintained by stryker-mutator.

### Finding: `--mutate` supports globs + line ranges but cannot combine them in one expression
**Confidence:** CONFIRMED
**Evidence:** [Stryker Configuration docs](https://stryker-mutator.io/docs/stryker-js/configuration/)

- Default: `['{src,lib}/**/!(*.+(s|S)pec|*.+(t|T)est).+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)', ...negations]`
- Negation via `!`
- Range: `"src/app.js:1-11"`, `"src/app.js:5:4-6:4"`
- CLI: `npx stryker run -m "src/**/*.ts,!src/**/*.spec.ts"`

### Finding: No native sampling / random-subset / priority-based mutant selection
**Confidence:** CONFIRMED (negative)
**Evidence:** [Stryker Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/), [Plugins docs](https://stryker-mutator.io/docs/stryker-js/plugins/)

Plugin extension points are `test-runner`, `checker`, and `reporter`. Checker plugins can REJECT mutants (typescript-checker, stryker-git-checker) but there is no first-class "sample 10%" flag. State of practice: narrow `--mutate` scope + `--incremental` + `ignoreStatic: true`.

### Finding: Default concurrency is `n if n ≤ 4 else n - 1`; accepts integer or percentage string
**Confidence:** CONFIRMED
**Evidence:** [stryker-js#2542](https://github.com/stryker-mutator/stryker-js/issues/2542), PR #2546

Rationale per maintainer @nicojs: reserve one core for orchestrator on >4-core boxes; on 2-core CI runners, reserving is counterproductive. Min = 1.

CLI forms: `--concurrency 4` or `--concurrency 50%`.

`maxConcurrentTestRunners` deprecated. `maxTestRunnerReuse: 0` = infinite (default); set >0 only to work around memory leaks.

### Finding: Known concurrency-thrash issue (Ubuntu, Mocha parallel + perTest coverage) on mutant timeout
**Confidence:** UNCERTAIN (issue marked stale; resolution undocumented)
**Evidence:** [stryker-js#4185](https://github.com/stryker-mutator/stryker-js/issues/4185)

Report: Stryker 6.4.2 on i9-9900K / Ubuntu 22.10, `concurrency: 6` reportedly ignored, CPU saturated to the point of crashing the OS on mutant timeouts. Thread is stale.

### Finding: Wall-clock benchmark — Sentry JS SDK monorepo
**Confidence:** CONFIRMED
**Evidence:** [Sentry Engineering blog, 2024-08-23](https://sentry.engineering/blog/js-mutation-testing-our-sdks)

| Config | Runtime |
|---|---|
| `@sentry/core` with Jest runner | **~60 min** |
| `@sentry/core` with Vitest runner | **~25 min** (−58%) |
| Individual large packages (core, node) in CI | 20–25 min each |
| Full 12-package matrix parallelized per package | **35–45 min total** |

Cadence: **weekly**, not per-PR. Team explicitly states: "definitely too long to run this on every PR or push." CI matrix parallelizes across packages.

### Finding: stryker-js self-workflow runs on push-to-master and workflow_dispatch (no schedule, no PR trigger)
**Confidence:** CONFIRMED
**Evidence:** [stryker-js .github/workflows/mutation-testing.yml](https://github.com/stryker-mutator/stryker-js/blob/master/.github/workflows/mutation-testing.yml)

- Triggers: `workflow_dispatch` + `push` to `master`
- Three parallel jobs (core / plugin cluster / typescript-checker) on `ubuntu-latest`
- Inner Stryker concurrency: `--concurrency 3` (core + plugins), `--concurrency 2` (typescript-checker)
- No `--incremental`, no `--mutate` scoping at action level
- Publishes to Stryker dashboard via `STRYKER_DASHBOARD_API_KEY`

### Finding: Tutorial CI pattern combining perTest + incremental + glob-scoped mutate
**Confidence:** CONFIRMED as author-published example; UNCERTAIN on production deployment
**Evidence:** [oneuptime.com](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)

```yaml
on: [push, pull_request]
jobs:
  mutation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx stryker run --incremental
      - uses: actions/upload-artifact@v4
        with:
          path: reports/mutation/
```

```javascript
// stryker.conf.js
module.exports = {
  testRunner: "jest",
  coverageAnalysis: "perTest",
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",
  concurrency: "50%",
  mutate: ["src/**/*.ts", "!src/**/*.spec.ts", "!src/**/*.test.ts"],
  timeoutMS: 60000,
  timeoutFactor: 1.5,
  reporters: ["html", "clear-text", "progress", "dashboard"],
  jest: { enableFindRelatedTests: true }
};
```

### Finding: CI-tier placement pattern convergence
**Confidence:** INFERRED (every primary source independently arrives at this split)
**Evidence:** Sentry blog, stryker-js own workflow, oneuptime, dev.to

All documented placements stratify into **nightly/weekly full** + **PR-incremental or diff-scoped**. No primary source documents running the full matrix on every PR for a >500-LOC production codebase.

---

## Negative searches

- "stryker sampling" / "stryker random mutants" / "stryker subset" across docs, issues, plugins → NOT FOUND as native feature
- First-party Stryker-js GitHub Action for CI → NOT FOUND (the only stryker-mutator action targets .NET)
- Public benchmark for Stryker on ~500-LOC core + ~4K-LOC fast-check suite specifically → NOT FOUND

---

## Gaps / follow-ups

- Composition effect (perTest + incremental + narrowed mutate + ignoreStatic + tuned concurrency) is asserted by tutorials but no isolated public benchmark quantifies it.
- #4185 thrash issue — whether still live in current Stryker versions is UNCERTAIN.
