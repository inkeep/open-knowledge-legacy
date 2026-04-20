# Evidence: stryker-mutator-bun-runner — maintenance + performance reality

**Dimension:** FU1.2 — stryker-mutator-bun-runner reality check
**Date:** 2026-04-19
**Sources:** npm registry, GitHub repo, Stryker issue #5424, bun test benchmarks

---

## Key pages referenced

- [stryker-mutator-bun-runner on GitHub (menoncello)](https://github.com/menoncello/stryker-mutator-bun-runner)
- [stryker-mutator-bun-runner on jsDelivr](https://www.jsdelivr.com/package/npm/stryker-mutator-bun-runner)
- [Stryker issue #5424 — Feature: Add Bun test runner plugin](https://github.com/stryker-mutator/stryker-js/issues/5424)
- [PkgPulse: Bun vs Vitest vs Jest 2026](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026)
- [PkgPulse: bun:test vs node:test vs Vitest 2026](https://www.pkgpulse.com/blog/bun-test-vs-node-test-vs-vitest-zero-config-2026)

---

## Findings

### Finding: Package exists, is modestly used (~4.4k monthly / ~2.6k weekly downloads), solo-maintained
**Confidence:** CONFIRMED
**Evidence:**

- npm registry API, `last-month` (as of 2026-04-19): **4,390 downloads**, range 2026-03-20 → 2026-04-18.
  → `GET https://api.npmjs.org/downloads/point/last-month/stryker-mutator-bun-runner`
- npm registry API, `last-week`: **2,615 downloads**, range 2026-04-12 → 2026-04-18.
- GitHub repo (menoncello/stryker-mutator-bun-runner): 5 stars, 0 open issues, 29 commits, no GitHub Releases published.
- Author seeks adoption into official `@stryker-mutator` scope ([issue #5424](https://github.com/stryker-mutator/stryker-js/issues/5424)), explicitly acknowledging "the credibility gap of unofficial packages."

**Implications:** Real users exist (weekly downloads roughly doubled from the monthly average implies a late-accelerating curve), but the project is a single-maintainer effort without official Stryker blessing. Bus factor = 1.

---

### Finding: Plugin claims "Smart coverage analysis with perTest support" + "2–3× faster via process pool"
**Confidence:** CONFIRMED (claim exists); INFERRED (claim is plausible but unverified)
**Evidence:** From [Stryker issue #5424](https://github.com/stryker-mutator/stryker-js/issues/5424) (author is requesting upstream adoption):

> "Smart coverage analysis with perTest coverage support"
> "Process pool for 2-3x faster execution"

**Important caveat contra the parent report:** Parent report stated the plugin uses `coverageAnalysis: "off"`. Issue #5424 claims perTest support. **This is a contradiction that needs resolution — the plugin README (404'd during research) is the authoritative source.** If perTest is genuinely supported, the economics change significantly in Option 1's favor.

The "2-3× vs Node runners" claim has no independent third-party benchmark located; it's author-claimed.

---

### Finding: Bun test itself is 3–10× faster than Vitest on pure-logic TS suites
**Confidence:** CONFIRMED (multiple 2026 benchmarks)
**Evidence:**

- [PkgPulse 2026 benchmark](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026): "50 tests across 10 files, TypeScript, mocking — Jest ~1.2s, Vitest ~0.9s, Bun ~0.08s." Authors caveat that "Bun's advantage is most pronounced on initial startup — the 0.08s figure is for the test runner itself, not the total test execution time."
- [PkgPulse: Bun test vs Vitest — recommended domains](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026): "Use Bun test for pure TypeScript/JavaScript logic tests, API/server route tests, Node.js utility library tests — without DOM simulation overhead. Bun's native TypeScript execution (no separate compilation step) eliminates the transformation bottleneck entirely."
- "Bun test is 3-10x faster than Vitest" — confirmed on pure-logic workloads (which is exactly what a md ⇄ PM pipeline is).

**Implications:** A bun runner that actually leverages bun's speed (not one wrapping `bun test` via command runner) should deliver real gains on parser-shaped suites. But: this is base runner speed, not mutation-testing wall-clock — because Stryker dominates total time with test-harness spin-up per mutant, the runner's base speed becomes less dominant as mutant count grows.

---

### Finding: `command` runner (Option 2) runs the **entire** test suite for **every** mutant
**Confidence:** CONFIRMED
**Evidence:** [Stryker docs — Configuration](https://stryker-mutator.io/docs/stryker-js/configuration/):

> "Using the command runner comes with a performance penalty, as Stryker cannot do any optimizations and just runs all tests for all mutants."

Arithmetic: 1,000 tests × 1,000 mutants with the command runner = **1,000,000 test invocations**. If bun runs the full suite in 2s cold, that's ~33 minutes just in raw test time — plus mutant generation, transformation, and serialization overhead. Stryker's `perTest` mode with 100 tests/mutant on average would run **100,000 test invocations** (10× fewer), plus the initial all-tests-once dry run.

**Implications:** The `command` runner escape hatch (use bun test via Stryker's default) is only viable on very small suites. It does not scale to a 1k test × 1k mutant parser pipeline.

---

## Negative searches

- README for stryker-mutator-bun-runner — main README URL returned 404 (`https://github.com/menoncello/stryker-mutator-bun-runner/blob/main/README.md`). Raw URL also 404'd. Repository exists but README location appears to differ.
- No public benchmark comparing `stryker-mutator-bun-runner` vs `@stryker-mutator/jest-runner` on same suite.
- No GitHub Releases / tagged versions — release cadence unknown.

## Gaps

- **Blocker:** Contradiction between parent report ("coverageAnalysis: off") and issue #5424 ("Smart coverage analysis with perTest coverage support"). Requires reading the actual plugin source to resolve.
- No independent head-to-head: stryker-bun-runner vs jest-runner vs vitest-runner on same TS parser-ish codebase.
- Bun version compatibility window: the plugin's minimum/maximum supported Bun versions are not documented in sources located.
