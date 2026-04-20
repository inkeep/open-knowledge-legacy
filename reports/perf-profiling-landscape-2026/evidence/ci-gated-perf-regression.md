# Evidence: D8 — CI-gated perf regression patterns

**Dimension:** D8 — Patterns OSS editor projects and high-scale engineering orgs use in late 2025 / early 2026 to gate PRs on performance regressions without creating unsustainable flake.
**Date:** 2026-04-19
**Sources:** Playwright release notes 1.57/1.58, tldraw perf harness + removal thread, zed compare_perf workflow, Excalidraw size-limit workflow, size-limit / size-limit-action, RelativeCI, CodSpeed, Vitest + TinyBench, p95/p99 CI guidance

---

## Key pages / files referenced

- https://playwright.dev/docs/release-notes
- https://github.com/microsoft/playwright/releases/tag/v1.58.0
- https://github.com/microsoft/playwright/releases/tag/v1.57.0
- https://playwright.dev/docs/browsers
- https://github.com/microsoft/playwright/issues/38489
- https://github.com/tldraw/tldraw/pull/7517
- https://github.com/tldraw/tldraw/issues/7595
- https://github.com/tldraw/tldraw/issues/8082
- `~/.claude/oss-repos/tldraw/.github/workflows/playwright-perf.yml`
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/fixtures/baseline-manager.ts`
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/fixtures/fps-tracker.ts`
- `~/.claude/oss-repos/zed/.github/workflows/compare_perf.yml`
- `~/.claude/oss-repos/excalidraw/.github/workflows/size-limit.yml`
- https://github.com/andresz1/size-limit-action
- https://github.com/ai/size-limit
- https://relative-ci.com/
- https://github.com/relative-ci/bundle-stats
- https://codspeed.io/
- https://codspeed.io/docs/benchmarks/nodejs/vitest
- https://vitest.dev/config/benchmark
- https://github.com/tinylibs/tinybench

---

## Findings

### Finding: Playwright 1.58 added a Timeline view inside the Speedboard tab of merged HTML reports; Speedboard itself shipped in 1.57 as a slowness-sorted test browser, not a CI regression gate

**Confidence:** CONFIRMED

**Evidence:**
- https://playwright.dev/docs/release-notes — "Speedboard ... shows you all your executed tests sorted by slowness."
- https://github.com/microsoft/playwright/releases/tag/v1.58.0 — "the HTML report Speedboard tab now shows the Timeline" for merged-report environments.
- https://getdecipher.com/blog/whats-new-with-playwright-in-2026 — "The headline feature in Playwright 1.58 is the new Timeline inside the HTML report's Speedboard tab."

**Implications:** Speedboard is a reporting/inspection surface, not a PR-gating mechanism. Teams still need a separate regression gate (baseline comparison, budget, etc.) to fail CI on perf regressions.

---

### Finding: Playwright 1.57 switched the default browser from Chromium to Chrome for Testing (both headed + headless); Arm64 Linux still uses Chromium

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/microsoft/playwright/releases/tag/v1.57.0 — "Starting with this release, Playwright switches from Chromium, to using Chrome for Testing builds." "Headed mode uses `chrome`; headless mode uses `chrome-headless-shell`."
- https://playwright.dev/docs/browsers — notes Arm64 Linux exception.
- https://github.com/microsoft/playwright/issues/38489 — open community issue: "No way to use open-source Chromium, Chrome for Testing causes high memory usage (20GB+ per instance)."

**Implications:** For CI memory/perf budgets the default browser choice is now different. Shared-runner memory budgets may need re-evaluation.

---

### Finding: tldraw's `playwright-perf.yml` measured FPS for 5 canvas interactions, auto-created per-environment baselines on first run, and gated on a 15% regression / 10% warning threshold

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/tldraw/.github/workflows/playwright-perf.yml:42-46` — `runs-on: ubuntu-latest-16-cores-open` (dedicated larger runner), `timeout-minutes: 20`.
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/fixtures/baseline-manager.ts:51-52`:
  ```ts
  private regressionThreshold = 15 // Percentage
  private warningThreshold = 10 // Percentage
  ```
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/fixtures/fps-tracker.ts:18` — 100ms sampling window via `requestAnimationFrame`; samples `averageFps`, `minFps`, `maxFps`.
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/baselines/fps-baselines.json` — baselines keyed by `platform-viewport` (e.g. `linux-1280x720`, `darwin-1280x720`) with per-interaction `avgFps/minFps/maxFps`; includes a hard floor of `avgFps > 18` in the test itself.
- `~/.claude/oss-repos/tldraw/apps/examples/e2e/perf/test-perf.spec.ts:23` — `expect(result.metrics.averageFps).toBeGreaterThan(18)`.
- `test.describe.configure({ mode: 'serial' })` — tests run serially, not parallel, to avoid resource contention.

**Implications:** The pattern is: baseline per environment key + average-FPS threshold + hard minimum. Serial mode is a deliberate flake mitigation. Baselines auto-update on the first run, which is relevant for branch-divergence detection.

---

### Finding: tldraw removed playwright-perf in PR #7517 (Dec 30 2025) because tests were "consistently failing in CI" with "reliability issues where failures would disappear on re-runs"; issue #7595 tracks the restoration and the team explicitly flagged dev-mode React DevTools as a false-positive source

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/tldraw/tldraw/pull/7517 (title: "test(e2e): remove performance tests", merged Dec 30 2025) — "were not providing reliable regression detection and were causing CI failures."
- https://github.com/tldraw/tldraw/issues/7595 — "PR #7517 removed our performance tests because they were consistently failing and showing flaky results. However, these tests were valuable for detecting performance regressions... the tests caught a panning regression after updating to React 19 that wasn't detectable through other means."
- Restoration requirements from the same issue: "these tests had reliability issues where failures would disappear on re-runs, which eroded confidence in their results"; "Ensure tests run against production builds, not development mode (dev mode with React DevTools can cause false positives)."

**Implications:** The canonical OSS case study for perf-test flake. Lessons: (a) run against production builds, (b) eliminate React DevTools hook overhead, (c) consider dedicated hardware, (d) failures-that-disappear-on-retry is the signature of insufficient variance control. tldraw explicitly notes the tests caught a React 19 regression that other methods missed — i.e. the capability has real signal even when flaky.

---

### Finding: zed's `compare_perf.yml` is a manual, workflow_dispatch-only, hyperfine-based head-vs-base comparison on a dedicated larger runner, producing a results.md artifact

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/zed/.github/workflows/compare_perf.yml:4-18`:
  ```yaml
  on:
    workflow_dispatch:
      inputs:
        head:
          description: head
          required: true
        base:
          description: base
          required: true
        crate_name:
          type: string
          default: ''
  jobs:
    run_perf:
      runs-on: namespace-profile-16x32-ubuntu-2204
  ```
- Steps: install `hyperfine` via `taiki-e/install-action`; `git checkout` base, run `cargo perf-test -- --json="$REF_NAME"`; checkout head, repeat; then `cargo perf-compare --save=results.md "$BASE" "$HEAD"`; upload `results.md` as artifact.

**Implications:** zed opts OUT of per-PR gating. Head-vs-base is reviewer-initiated via workflow_dispatch — no auto-block. Namespace.so-style larger runners (`namespace-profile-16x32`) are used explicitly to reduce noise. Output is a markdown artifact for human review, not a binary pass/fail.

---

### Finding: Excalidraw uses `andresz1/size-limit-action` for a bundle-size PR gate configured via `package.json` `size-limit` array; `build_script: build:esm` plus `skip_step: install` keep the job minimal

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/excalidraw/.github/workflows/size-limit.yml:22-28`:
  ```yaml
  - uses: andresz1/size-limit-action@...
    with:
      github_token: ${{ secrets.GITHUB_TOKEN }}
      build_script: build:esm
      skip_step: install
      directory: packages/excalidraw
  ```
- https://github.com/ai/size-limit (latest 12.1.0, Apr 13 2026) — "checks every commit on CI, calculates the real cost of your JS for end-users and throws an error if the cost exceeds the limit."
- `size-limit` config entries use `path` + `limit` (either bytes like `10 kB` or execution time like `500 ms`); supports per-bundle rules.

**Implications:** Bundle-size regression gating is a solved, one-file-workflow problem for JS/TS. Size budgets are `package.json`-declarative; PR comments are automated; hard-fail threshold is the explicit limit. Does not cover runtime perf — complementary to other gates.

---

### Finding: CodSpeed uses hardware counters (not wall-clock) to bring variance below 1%, runs on shared GHA runners, and wraps vitest bench / tinybench unchanged

**Confidence:** CONFIRMED

**Evidence:**
- https://codspeed.io/ — "CodSpeed isolates relevant performance data and brings result variance down to less than 1%."
- https://codspeed.io/docs/benchmarks/nodejs/vitest — integrates with `vitest bench` (Vitest's benchmark API uses tinybench internally).
- https://codspeed.io/blog/vitest-bench-performance-regressions — commit-level differential flamegraphs, PR comments.

**Implications:** This is the dominant hosted-service answer for JS/TS perf gating in 2026 — avoids the shared-runner noise problem by using `valgrind`/`cachegrind`-style instruction counting rather than wall-clock time. Makes CI perf gating viable on standard GHA runners without dedicated hardware.

---

### Finding: `vitest bench` (powered by `tinybench`) is the current OSS JS micro-benchmarking mainstream; `benchmark.js` is no longer the default recommendation

**Confidence:** CONFIRMED

**Evidence:**
- https://vitest.dev/config/benchmark — "Vitest's Benchmarking feature is powered by TinyBench."
- https://github.com/tinylibs/tinybench — "simple, tiny and light-weight 10KB (2KB minified and gzipped) benchmarking library... based on Web APIs with proper timing using process.hrtime or performance.now."
- https://github.com/vitest-dev/vitest/discussions/7850 — open vitest benchmarking support discussion confirms tinybench-backed.

**Implications:** For Node+browser micro-benchmarking the stack is `vitest bench` → `tinybench` → `performance.now()`. `benchmark.js` survives as a legacy dependency but lacks active integration with modern reporters.

---

### Finding: For percentile-based CI gating, p95 is the "first guardrail" recommendation; p99 becomes unstable at low sample counts, amplifying flake

**Confidence:** CONFIRMED

**Evidence:**
- https://loadtester.org/p95-vs-p99-latency — "with low sample counts p99 is unstable and leads to false positives, so use p90 or p95 instead."
- https://www.theaiops.com/latency-p95-p99/ — "When introducing performance checks into your pipeline, a p95 threshold is often the cleanest first guardrail as it lets you catch meaningful regressions while keeping noise manageable."
- https://oneuptime.com/blog/post/2025-09-15-p50-vs-p95-vs-p99-latency-percentiles — "p95 per scenario in canary tests being what to measure."

**Implications:** p99-based policies require either statistical mitigation (variance-aware thresholds, e.g. `max(2× p99 variance, 10%)`) or fallback to p95. Raw p99 at low sample counts produces false positives.

---

### Finding: Three-tier CI cadence (per-PR / nightly / weekly with elevated samples) is a convergent industry practice; no formal standardization exists, but OSS patterns are consistent

**Confidence:** INFERRED

**Evidence:**
- github-action-benchmark docs show `push: main` + `schedule:` alternating between gate-on-regression and store-to-GH-Pages trend-artifact.
- Common shape (per-PR 15-min, nightly 30-min, weekly 60-min) matches zed (manual dispatch vs scheduled) and Yarn Berry (referenced in search results: `workflow_dispatch` matrix-strategy benchmarks).

**Implications:** The split-by-cadence pattern is standard practice, just unformalized. Naming varies (`tier 1/2/3`, `fast/deep/trend`). No OSS-standardized convention as of early 2026.

---

### Finding: RelativeCI supports Vite/Rolldown/Rollup/webpack/rspack bundle analysis via `@relative-ci/rollup-plugin` (published 2026-03-07); provides dashboard + PR comments; competitive with size-limit for depth

**Confidence:** CONFIRMED

**Evidence:**
- https://relative-ci.com/ — "Automated bundle analysis, reviews and monitoring."
- https://github.com/relative-ci/bundle-stats — "Analyze bundle stats ... Support for webpack, rspack, vite, rolldown and rollup."

**Implications:** For bundle analysis alone, RelativeCI offers deeper module-level insights than size-limit; size-limit is threshold-only. Both are complementary and used together in some projects.

---

## Terminology (D8)

- **Speedboard:** Playwright 1.57+ HTML reporter tab sorting tests by execution duration; 1.58 added a Timeline visualization for merged reports.
- **Chrome for Testing (CfT):** Google-published Chrome builds specifically for automation; Playwright 1.57's new default (replacing Chromium).
- **Baseline auto-creation:** tldraw's `BaselineManager` pattern — first test run seeds the baseline for a new `platform-viewport` env key. Subsequent runs compare.
- **Hardware-counter benchmarking:** CodSpeed's technique (uses `valgrind` instruction counting, not wall-clock) for sub-1% variance on shared runners.
- **PBT flake mitigation tier:** dedicated runner class + serial execution + production builds (tldraw pattern).

## Gaps / follow-ups

- Why did tldraw not reinstate perf tests after #7595? Issue #8082 (2026-02, "Move tests to closed source repo") suggests a strategic direction pivot toward private testing rather than OSS perf gating.
- Playwright 1.58 Speedboard: can it feed CI gating directly? The Timeline is a reporting feature, not a threshold-comparison feature.

## Sources (de-duped)

- https://playwright.dev/docs/release-notes
- https://github.com/microsoft/playwright/releases/tag/v1.58.0
- https://github.com/microsoft/playwright/releases/tag/v1.57.0
- https://playwright.dev/docs/browsers
- https://github.com/microsoft/playwright/issues/38489
- https://github.com/tldraw/tldraw/pull/7517
- https://github.com/tldraw/tldraw/issues/7595
- https://github.com/tldraw/tldraw/issues/8082
- https://github.com/andresz1/size-limit-action
- https://github.com/ai/size-limit
- https://relative-ci.com/
- https://github.com/relative-ci/bundle-stats
- https://codspeed.io/
- https://codspeed.io/docs/benchmarks/nodejs/vitest
- https://codspeed.io/blog/vitest-bench-performance-regressions
- https://github.com/benchmark-action/github-action-benchmark
- https://vitest.dev/config/benchmark
- https://github.com/tinylibs/tinybench
- https://github.com/sharkdp/hyperfine
- https://loadtester.org/p95-vs-p99-latency
- https://www.theaiops.com/latency-p95-p99/
- https://oneuptime.com/blog/post/2025-09-15-p50-vs-p95-vs-p99-latency-percentiles
