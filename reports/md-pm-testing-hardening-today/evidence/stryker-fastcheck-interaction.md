---
dimension: D1.4 — Interaction with seeded property-based tests
date: 2026-04-19
sources: stryker-mutator.io/docs, fast-check.dev, github.com/stryker-mutator/stryker-js, github.com/dubzzz/fast-check, github.com/dubzzz/pure-rand
---

# Evidence: D1.4 — Stryker × fast-check Interaction

## Key files / pages referenced

- [Stryker JS Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [Stryker JS Troubleshooting](https://stryker-mutator.io/docs/stryker-js/troubleshooting/)
- [Stryker Mutant States and Metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)
- [Stryker JS v6 — Expeditious Superior Mutations (blog)](https://stryker-mutator.io/blog/stryker-js-v6-expeditious-superior-mutations/)
- [Stryker JS Incremental](https://stryker-mutator.io/docs/stryker-js/incremental/)
- [fast-check Parameters API reference](https://fast-check.dev/api-reference/interfaces/Parameters.html)
- [fast-check docs — Read test reports](https://fast-check.dev/docs/tutorials/quick-start/read-test-reports/)
- [fast-check README](https://github.com/dubzzz/fast-check)
- [fast-check QualifiedParameters.ts source](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/QualifiedParameters.ts)
- [pure-rand README](https://github.com/dubzzz/pure-rand/blob/main/README.md)
- [stryker-js#5714 Dual Vitest instance / @fast-check/vitest](https://github.com/stryker-mutator/stryker-js/issues/5714)
- [stryker-net#2144 Flaky detection for some mutants](https://github.com/stryker-mutator/stryker-net/issues/2144)

---

## Findings

### Finding: Stryker hot-reloads mutants via a runtime flag; does NOT re-import files per mutant
**Confidence:** CONFIRMED
**Evidence:** [Stryker JS v6 blog](https://stryker-mutator.io/blog/stryker-js-v6-expeditious-superior-mutations/)

For each mutant, Stryker flips `global.activeMutant` / `__STRYKER_ACTIVE_MUTANT__` and re-runs the covering tests **in the same worker process**, without re-importing source files. Static mutants (code run at file load) are the exception — Stryker spawns a fresh worker per static mutant on Node-based runners.

`maxTestRunnerReuse: 0` (default, infinite reuse). Configurable to recycle workers after N runs for memory-leak mitigation — docs flag this as "not recommended unless you are experiencing memory leaks."

### Finding: State isolation between mutants is delegated to the test runner, not enforced by Stryker
**Confidence:** INFERRED (strong — follows directly from "hot reload without re-import" + docs silence on mutant-level process isolation)
**Evidence:** Stryker JS Configuration docs + v6 blog

Module state, singletons, closures, and in-process globals (including any RNG state) persist across mutant runs within one worker. Isolation depends on Jest/Vitest/Mocha/Jasmine's per-test teardown behavior.

### Finding: Per-test filtering with `coverageAnalysis: "perTest"` runs only tests that covered each mutant
**Confidence:** CONFIRMED
**Evidence:** [Stryker JS Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)

This is the primary mechanism for per-mutant test reduction. Settings: `off`, `all`, `perTest`.

### Finding: fast-check is fully deterministic given an explicit `seed`
**Confidence:** CONFIRMED
**Evidence:** [fast-check docs — Read test reports](https://fast-check.dev/docs/tutorials/quick-start/read-test-reports/), [fast-check README](https://github.com/dubzzz/fast-check), [QualifiedParameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/QualifiedParameters.ts), [pure-rand README](https://github.com/dubzzz/pure-rand/blob/main/README.md)

- PRNG: `pure-rand`, default `xorshift128plus`. pure-rand README: "fully deterministic... given the original seed one can rebuild the whole sequence."
- Explicit `seed` is coerced to a 32-bit signed integer before seeding.
- fast-check does NOT touch `Math.random` for generation — only for default seed selection when no seed is provided.
- PRNG state is local to each `fc.assert` invocation, not global.
- Therefore: given fixed `seed` + fixed `numRuns`, fast-check produces the identical sequence of generated values, regardless of call order, co-running tests, or prior mutant runs — within the same fast-check + pure-rand version.

### Finding: Default (no-seed) fast-check invocations vary by `Date.now() ^ (Math.random() * 0x100000000)` per call
**Confidence:** CONFIRMED
**Evidence:** [QualifiedParameters.ts](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/src/check/runner/configuration/QualifiedParameters.ts)

Default seed computation: `safeDateNow() ^ (safeMathRandom() * 0x100000000)`. Implication: if tests do not pin a seed, **each mutant invocation effectively samples a different seed**, and Stryker will see inconsistent killed/survived labels across runs on the same mutant.

### Finding: Stryker does NOT re-seed fast-check; seed propagation is user-enforced via `fc.assert({ seed })`, `fc.configureGlobal({ seed })`, or test-side env var patterns
**Confidence:** INFERRED (Stryker's documented architecture does not touch test-level configuration)
**Evidence:** Stryker JS Configuration docs (no fast-check awareness) + fast-check seeding API

Stryker simply re-invokes the test runner. If the test author does not pin a seed explicitly, there is no reproducibility across mutants.

### Finding: fast-check shrinking is deterministic given `(seed, path, predicate)` — but the predicate IS the mutated source
**Confidence:** CONFIRMED (determinism) + INFERRED (predicate-shift consequence)
**Evidence:** [fast-check Read test reports](https://fast-check.dev/docs/tutorials/quick-start/read-test-reports/)

> "Shrinking is deterministic. Given the same seed, path, and predicate, fast-check will consistently reproduce the same reduced counterexample."

Applied to mutation testing:
- Within a single mutant, across Stryker's re-runs with the same seed, the shrunk counterexample is stable.
- **Between different mutants, counterexamples can legitimately shift** because shrinking walks toward smaller failing inputs, and what fails depends on the mutated predicate. Each mutant is a different program.

### Finding: Stryker has no retry / flaky-tolerance configuration; only timeout tunables
**Confidence:** CONFIRMED (negative search)
**Evidence:** [Stryker JS Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/), [Troubleshooting](https://stryker-mutator.io/docs/stryker-js/troubleshooting/)

Search for retry / rerun-on-failure returned nothing. Related knobs: `timeoutMS`, `timeoutFactor` (for slow tests, not flaky ones), `disableBail` (reports all failures rather than short-circuiting).

Timeout formula: `timeoutForTestRunMs = netTimeMs * timeoutFactor + timeoutMS + overheadMs`.

### Finding: Mutant states table
**Confidence:** CONFIRMED
**Evidence:** [Stryker Mutant States and Metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)

| State | Definition | Counted as detected? |
|---|---|---|
| `killed` | ≥1 test failed while mutant active | Yes |
| `survived` | All tests passed while mutant active | No |
| `no-coverage` | Mutant not covered by any test | No |
| `timeout` | Execution exceeded `timeoutForTestRunMs` | **Yes (effectively killed)** |
| `runtime-error` | Test runner crashed | No (excluded from valid) |
| `compile-error` | Mutated code fails type check | No (excluded from valid) |
| `ignored` | Excluded by config | No |
| `pending` | Not yet executed | N/A |

### Finding: stryker-net#2144 documents flakiness-induced score variance (non-determinism hypothesis)
**Confidence:** CONFIRMED (.NET sibling; mechanism generalizes)
**Evidence:** [stryker-net#2144](https://github.com/stryker-mutator/stryker-net/issues/2144)

Report: mutation scores varied 22% → 100% across runs on unchanged code. Maintainer hypothesis: non-determinism in the test layer. Labeled "On hold." No parallel JS-side tracking issue was found.

Implication for fast-check PBT with default (time-based) seed: Stryker will label inconsistently across retries. Pinning seeds eliminates this class of variance.

### Finding: Known Stryker bug with `@fast-check/vitest` — dual Vitest instance (fixed Jan 2026)
**Confidence:** CONFIRMED
**Evidence:** [stryker-js#5714](https://github.com/stryker-mutator/stryker-js/issues/5714)

Root cause: Stryker's bundled Vitest ≠ project's Vitest, so `@fast-check/vitest` hooks registered on one instance were not visible to the other. fast-check property executions were not intercepted → mutants survived silently or failed without killing. Fixed in PR #5745 (closed 2026-01-30). **Applies only to the Vitest runner**, not Jest/Mocha/Jasmine.

For projects not using `@fast-check/vitest` (e.g., using plain `fc.assert` inside vitest/jest/mocha `it` blocks), this bug does not apply.

---

## Negative searches

- dubzzz/fast-check issue search for "stryker" → empty
- stryker-js issues for "fast-check" → only #5714 (above)
- Blog posts / discussions combining stryker-js + fast-check → NOT FOUND

---

## Gaps / follow-ups

- No public empirical study documents how much flakiness pinning seeds actually eliminates in Stryker runs. This would need to be measured per-project.
- Behavior of `@fast-check/vitest` with Stryker post-PR-#5745 merge (Jan 2026) not independently validated in a blog post yet.
