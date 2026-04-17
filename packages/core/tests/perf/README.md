# Perf framework — authoring guide

How to add, run, and calibrate perf regression gates for the markdown pipeline. This directory ships the R4 gate (benchmark harness + comparator + committed baseline) that fails PRs whose parse/serialize/round-trip p99 regresses beyond a calibrated threshold.

This document is the contract. The code is the implementation. Evidence for the calibration decisions below lives in `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r4-calibration.md` and `perf-baseline-measured.md`.

---

## Contents

1. [What's in this directory](#whats-in-this-directory)
2. [When to add a perf test](#when-to-add-a-perf-test)
3. [Measurement protocol](#measurement-protocol)
4. [Threshold formula](#threshold-formula)
5. [Baseline capture](#baseline-capture)
6. [Corpus strategy](#corpus-strategy)
7. [CI tier placement](#ci-tier-placement)
8. [How to add a new perf regression gate](#how-to-add-a-new-perf-regression-gate)
9. [Calibration history — why these numbers](#calibration-history--why-these-numbers)
10. [Troubleshooting](#troubleshooting)
11. [Cross-references](#cross-references)

---

## What's in this directory

| File | Role |
|---|---|
| `markdown-bench.test.ts` | R1 benchmark harness. Measures parse / serialize / round-trip at pinned block counts. Auto-skipped unless `RUN_BENCH=1`. Writes `results.<timestamp>.json`. |
| `regression-gate.ts` | R4 comparator library + CLI. Pure `evaluateRegression(baseline, fresh)` function plus a thin CLI entry for tier-2 orchestration. |
| `regression-gate.test.ts` | Synthetic-regression unit tests for the gate logic. Proves the gate fails on injected slowdown, passes on within-threshold drift, handles missing/extra block counts, and rejects corrupt baselines. |
| `run-regression-gate.ts` | Tier-2 orchestrator. Runs the bench harness, locates the freshest `results.*.json`, loads `baseline.json`, calls the comparator, exits 0/1. |
| `baseline.json` | The committed baseline. Per-op p99 + p99Stdev at 5 pinned block counts. Refreshed only on legitimate perf changes, never to mask a regression. |
| `results.*.json` | Bench output (gitignored). One per run. Orchestrator picks the freshest. |

Related (elsewhere):

- **Corpus:** `packages/core/src/markdown/fixtures/perf/` — 5 pinned synthetic `.md` files + seeded generator.
- **Fallback-perf gate:** `packages/core/src/markdown/parse-with-fallback.test.ts` — `parseWithFallback` ≤ 5× happy-path bound.
- **R23-guard perf gate:** `packages/core/src/markdown/autolink-void-html-guard.perf.test.ts` — guard ≤ some-multiple of no-guard bound.
- **Profile harness:** `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-profile-harness.ts` — per-stage timing breakdown, standalone-runnable.
- **Parse-health gate (sibling subsystem):** `packages/core/tests/health/README.md` — fallback-path counters + CI gate.

---

## When to add a perf test

The framework supports three shapes. Pick the one that matches your signal.

### Regression gate (what R4 is)

**Use when:** the op has measurable drift sensitivity, runs on a hot path, and silent slow regressions would be costly.

**Properties:**
- Captures steady-state `p99` (worst-of-10 with our sampling — see [Measurement protocol](#measurement-protocol)).
- Compares against a committed baseline with noise-aware threshold `max(2σ, 10% floor)`.
- Fails CI when a PR's fresh p99 exceeds `baseline + allowed_delta`.
- Tolerates session-to-session noise on both quiet and noisy runners via the 2σ term.

**Good fits:** whole-pipeline parse/serialize/round-trip (R4 itself); a new stage's end-to-end latency at representative block counts.

### Hard ceiling (a.k.a. frame-budget gate)

**Use when:** the op runs in a user-blocking loop (typing, rendering) and the contract is "this MUST complete inside N ms, period."

**Properties:**
- Fixed numeric threshold — no variance term, no baseline JSON.
- Typical ceilings: 16 ms (one frame @ 60 Hz), 50 ms (perceptible delay), 100 ms (user-notices pause).
- Asserts directly in a unit test: `expect(elapsed).toBeLessThan(16)`.

**Good fits:** NodeView render pass; single-keystroke Observer B cycle; React component mount latency.

Not a great fit for aggregates — a 50-keystroke aggregate drifts with variance; use a regression gate for that.

### Pathological-input bound

**Use when:** a specific input pattern historically caused quadratic/exponential blow-up and you want to assert the worst case stays bounded relative to a reference.

**Properties:**
- Ratio assertion — `worst ≤ K × reference`. No absolute threshold.
- K is calibrated empirically with margin (typically 5-10× for "much worse than normal but still O(n) or O(n·polylog)").
- Survives hardware changes because it's ratio-based.

**Good fits:** `parseWithFallback` on crash-class input ≤ 5× happy-path; R23 guard on adversarial bare-`<` soup.

### When NOT to add a perf test

- Op runs <1 ms/run steadily. Noise floor dominates signal; any threshold flakes.
- Op is dominated by I/O (disk, network, database). Test the I/O bound directly; don't let I/O variance poison a code-timing metric.
- Op exists but has no representative corpus. The corpus IS half the signal — without it, a gate measures whatever test setup happens to exercise, not real usage.
- You're tempted to gate on wall-clock of a whole test suite. That's flaky orthogonality; gate on specific ops, not aggregates.

---

## Measurement protocol

Pinned at `markdown-bench.test.ts:49-50`. Changes require a baseline re-measurement and a PR note linking the methodology change to the re-capture.

| Knob | Value | Why |
|---|---|---|
| `WARMUP_ITERS` | 10 | First ~5 Bun iterations vary ±30% of steady-state (JIT warm-up, cache priming). 10 empirically converges within 5% of asymptotic behavior. |
| `MEASURED_ITERS` | 10 | Enough samples to compute mean + worst-case; raising to ≥100 would make `p99` a genuine 99th percentile but invalidates `baseline.json` and lengthens bench to hours at 20K blocks. See [Calibration history](#calibration-history--why-these-numbers). |
| GC between runs | `Bun.gc(true)` | Strips allocator state bleed. Without it, run N's allocation profile carries over into run N+1's timing. |
| Timer | `performance.now()` | Monotonic, microsecond-resolution, no system-clock sync jumps. |
| Bun version | `package.json:packageManager` (currently `bun@1.3.11`) | Pinned per-run; bun minor/major upgrade → re-baseline. |
| Hardware tag | `BENCH_RUNNER_CLASS` env var → `runner.runnerClass` field in output | Different hardware classes don't share baselines. |

### The `p99` field is actually max-of-10

With `MEASURED_ITERS=10`, `Math.floor(0.99 × 10) = 9` → index 9 in a 0-indexed length-10 sorted array = the last sample = the **max**. So `p99` is a worst-of-10 observation, not a steady-state 99th percentile.

**Why we keep the name:** schema stability. Baseline field rename would cascade through the comparator, tests, baseline.json, and evidence files. The σ arm of the threshold formula (calibrated across multiple independent runs) provides the noise-aware term the name would suggest — see [Threshold formula](#threshold-formula).

**To get a true p99:** raise `MEASURED_ITERS` to ≥100 and re-baseline. Not free: 20K-block parse × 100 measured runs + warmups exceeds 2 minutes alone on fast hardware.

### Metadata the harness captures

Every `results.*.json` includes:

- `bunVersion` (from `process.versions.bun`)
- `gitSha` (read directly from `.git/HEAD`)
- `hostname`
- `cpuModel`, `cpuCores`
- `ramGB`
- `platform` (e.g., `darwin-arm64`)
- `runnerClass` (from `BENCH_RUNNER_CLASS` env var)

Keep this metadata stable. When diagnosing a noisy run, the first question is "same runner class?" — the metadata answers it.

---

## Threshold formula

Pinned at `regression-gate.ts:7-9` and consumed at line 150-152.

```
allowed_regression_ms = max(2 × p99_stdev_ms, 10% × baseline_p99_ms)
fresh_p99_ms - baseline_p99_ms > allowed_regression_ms ⇒ REGRESSION
```

### Two terms, one dominates

| Term | When it dominates | Shape |
|---|---|---|
| `2 × p99_stdev_ms` (variance term) | Noisy runners, fast ops | Grows with measurement noise. On shared CI hardware, σ can be 5-20× the M-series calibration σ; the gate absorbs this automatically. |
| `10% × baseline_p99_ms` (floor) | Quiet runners, slow ops | Grows with absolute op cost. Catches "fast op regresses to slower fast op" where σ alone would be <100 μs and a real 20% regression would slip through. |

`max()` takes the larger, so the gate is whichever term is more forgiving in that regime. The floor prevents variance from silently absorbing real regressions; the variance term prevents the floor from flaking on noise.

### Worked examples from the shipped baseline

All numbers from `packages/core/tests/perf/baseline.json` captured 2026-04-16 on `local-m-series-calibration`.

**Example 1 — low-variance op, floor dominates:**
```
serializeMs @ 100 blocks
  baseline.p99      = 2.29 ms
  baseline.p99Stdev = 0.15 ms
  variance term     = 2 × 0.15 = 0.30 ms
  floor term        = 0.10 × 2.29 = 0.229 ms
  allowed_delta     = max(0.30, 0.229) = 0.30 ms
  regression if fresh.p99 > 2.59 ms
```
Variance edges out floor here (0.30 > 0.229). That's fine; the point is "use whichever is larger." A 0.30 ms tolerance on a 2.29 ms baseline is ~13% — enough to absorb session-to-session noise without hiding real slowdowns.

**Example 2 — high-absolute op, floor dominates:**
```
parseMs @ 10,000 blocks
  baseline.p99      = 1275.24 ms
  baseline.p99Stdev = 16.05 ms
  variance term     = 2 × 16.05 = 32.10 ms
  floor term        = 0.10 × 1275.24 = 127.52 ms
  allowed_delta     = max(32.10, 127.52) = 127.52 ms
  regression if fresh.p99 > 1402.76 ms
```
Floor dominates. On a 1.3-second parse, 32 ms of noise is small relative to the 10% regression bar that's worth catching.

**Example 3 — high-variance runner, variance term dominates:**
Hypothetical noisy CI scenario. Same op as example 2 but captured on a CI runner with 10× variance:
```
parseMs @ 10,000 blocks on noisy CI
  baseline.p99      = 1275.24 ms
  baseline.p99Stdev = 160.5 ms  (10× M-series)
  variance term     = 2 × 160.5 = 321 ms
  floor term        = 127.52 ms (unchanged)
  allowed_delta     = max(321, 127.52) = 321 ms
```
Variance dominates; the gate tolerates more drift on the noisy runner because that's the signal band the hardware can reliably produce. Floor still anchors against variance going to infinity.

### Why we write σ (not σ²) as "variance"

SPEC §6 R4 says "variance" in the common-parlance sense — standard deviation — not statistical variance (σ²). σ keeps units in milliseconds across the whole formula. `regression-gate.ts:14-17` notes this explicitly.

### Corrupt-baseline guard

`regression-gate.ts:207-236` rejects non-finite baseline / fresh values up-front. Without this, a corrupted `NaN` p99 passes the gate silently because `x > NaN` is always false. The `loadBaseline`/`loadFreshResults` functions throw with a pointer at the offending field.

---

## Baseline capture

### Schema

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-04-16T08:28:01.616Z",
  "runnerClass": "local-m-series-calibration",
  "calibrationRuns": 4,
  "threshold": {
    "floorPct": 0.1,
    "varianceMultiplier": 2
  },
  "results": [
    {
      "blockCount": 100,
      "docSizeChars": 20293,
      "parseMs": { "p99": 9.69, "p99StdevMs": 0.89 },
      "serializeMs": { "p99": 2.29, "p99StdevMs": 0.15 },
      "roundTripMs": { "p99": 11, "p99StdevMs": 0.77 }
    }
    // … 1000, 5000, 10000, 20000 entries
  ]
}
```

Field notes:

- `schemaVersion: 1` — `loadBaseline` throws on mismatch; don't bump silently.
- `calibrationRuns` — how many independent bench runs were aggregated to compute `p99StdevMs`. More runs = tighter σ estimate. 4 is our current choice; `evidence/r4-calibration.md` documents why.
- `threshold.floorPct: 0.1` / `varianceMultiplier: 2` — the formula knobs. Checked into the baseline so a change requires a JSON edit adjacent to the data it affects.
- `results[].blockCount` — must match a `PERF_BLOCK_COUNTS` entry in `packages/core/src/markdown/fixtures/index.ts`.

### Calibration protocol

```bash
# 1. Run the bench N times (typically 4-5), each producing results.<ts>.json
for i in 1 2 3 4; do
  BENCH_RUNNER_CLASS=my-calibration-runner \
    RUN_BENCH=1 bun test packages/core/tests/perf/markdown-bench.test.ts
done

# 2. Aggregate the N runs into per-op {p99, p99StdevMs}.
# (No committed aggregator script yet — spreadsheet or a one-off bun script.)

# 3. Write the aggregated numbers into baseline.json.
# Replace `results[]` entries; update capturedAt + runnerClass + calibrationRuns.

# 4. Verify the gate passes on a fresh bench run.
bun run packages/core/tests/perf/run-regression-gate.ts

# 5. Commit baseline.json. PR must document:
#    - runner class & hardware
#    - bun version
#    - reason for re-baseline (regression fix, methodology change, new runner, …)
```

### When to refresh

| Situation | Action |
|---|---|
| Legitimate perf improvement (baseline tightens down) | Re-baseline. Commit with "perf: tighten baseline after <change>" |
| Bun minor/major bump | Re-baseline. Note bun version delta in PR. |
| Methodology change (WARMUP_ITERS, MEASURED_ITERS, GC policy) | Re-baseline. Required; existing baseline numbers reflect prior methodology. |
| New runner class (e.g., switching CI provider) | Capture a new baseline for that class. Don't reuse cross-class. |
| Corpus change (new `<count>.md`, generator seed change, block-type mix) | Re-baseline. Corpus is half the signal. |
| Regression in PR | **Don't** refresh to mask it. Investigate + fix. |

The baseline ratchets monotonically tighter. Loosening requires justification. The PR reviewer's question is always "what external factor is responsible for this regression that the code change isn't responsible for?"

### Runner-class mismatch is a warning, not an error

`run-regression-gate.ts:62-70` warns (does not fail) when the fresh run's runner class differs from the baseline's. Rationale: p99 deltas across classes may reflect hardware more than code. Operators get the signal; CI doesn't block on it until a class-specific baseline is captured.

---

## Corpus strategy

All gated ops consume corpus through `loadPerfFixture(blockCount)` at `packages/core/src/markdown/fixtures/index.ts`. **No ad-hoc generation in measurement code** — otherwise runs are not comparable.

### Pinned block counts

```typescript
export const PERF_BLOCK_COUNTS = [100, 1000, 5000, 10000, 20000] as const;
```

Log-spaced. 100 = smallest sample in the near-linear regime; 1,000 = typical working-size doc; 5,000 = super-linearity onset (micromark's `remarkParse` is documented super-linear in this range); 10,000 = primary gate target; 20,000 = stress ceiling.

### Block-type mix

`fixtures/perf/README.md` pins the mix (also baked into `generate.ts`):

| Kind | Weight |
|---|---:|
| paragraph | 40% |
| heading | 25% |
| list | 15% |
| code | 10% |
| table | 5% |
| MDX (block-form `<Note>…</Note>`) | 5% |

Mirrors what a real doc looks like; don't skew toward pathological kinds unless that's the op you're measuring.

### Regeneration

```bash
bun run packages/core/src/markdown/fixtures/perf/generate.ts
```

Seeded Mulberry32 PRNG; same seed ⇒ byte-identical output. **Regeneration invalidates the committed baseline** (corpus + baseline are a unit). Re-run the harness and recommit baseline after any seed or mix change.

### Adding a corpus

- Picking a new block count (e.g., 50K): add to `PERF_BLOCK_COUNTS`; generate; re-baseline; decide whether to gate it (tier-2 inputs).
- Adding a real-world fixture (e.g., a specific file type you want to profile): commit a static `.md`; write a loader helper; **do not gate** unless you're ready to maintain that fixture. Use for targeted profiling, not trend detection.
- Intermediate counts (500, 2500 are committed but not gated): measured one-off via the harness; useful for exploring the super-linearity curve but skipped in `PERF_BLOCK_COUNTS` to keep CI time bounded.

---

## CI tier placement

| Tier | Turbo task | What it runs | Budget |
|---|---|---|---|
| Tier 1 (every PR) | `test:perf:regression:unit` | Synthetic unit tests of the comparator (`regression-gate.test.ts`) + finite-value loader validation. No bench run. | ~1 s |
| Tier 1 (every PR) | `test:perf:fallback` | `parseWithFallback` ≤ 5× happy-path bound. Fast because the corpus is small. | seconds |
| Tier 1 (every PR) | `test:perf:r15-guard` | R23-guard perf regression test. Also small corpus. | seconds |
| Tier 2 (nightly) | `test:perf:bench` | Full bench harness. Writes `results.*.json`. | minutes |
| Tier 2 (nightly) | `test:perf:regression` | Bench + gate vs baseline (via `run-regression-gate.ts`). | minutes |

Turbo task definitions at `turbo.json`:

```json
"test:perf:bench": {
  "dependsOn": [],
  "cache": false,
  "inputs": [
    "src/markdown/**/*.ts",
    "src/markdown/fixtures/perf/*.md",
    "tests/perf/markdown-bench.test.ts"
  ],
  "env": ["RUN_BENCH", "BENCH_RUNNER_CLASS"]
},
"test:perf:regression": {
  "dependsOn": [],
  "cache": false,
  "inputs": [
    "src/markdown/**/*.ts",
    "src/markdown/fixtures/perf/*.md",
    "tests/perf/markdown-bench.test.ts",
    "tests/perf/regression-gate.ts",
    "tests/perf/run-regression-gate.ts",
    "tests/perf/baseline.json"
  ],
  "env": ["RUN_BENCH", "BENCH_RUNNER_CLASS"]
},
"test:perf:regression:unit": {
  "dependsOn": [],
  "cache": true,
  "inputs": ["tests/perf/regression-gate.ts", "tests/perf/regression-gate.test.ts"]
}
```

Cache key design: the unit-test tier caches on gate code alone; the bench and regression tiers set `cache: false` because the measurement result depends on runner variability, not just code.

The `RUN_BENCH` env var is the kill-switch — `markdown-bench.test.ts` auto-skips without it, so a tier-1 `bun test` that happens to enumerate this file doesn't accidentally trigger a multi-minute run.

---

## How to add a new perf regression gate

Numbered; check off as you go.

1. **Decide the shape.** Regression gate, hard ceiling, or pathological-input bound? See [When to add a perf test](#when-to-add-a-perf-test). Below assumes regression gate — the others are simpler unit tests.

2. **Pick the op and corpus.**
   - Op: the single operation you're timing. Narrow is better (parse alone, not parse+validate).
   - Corpus: prefer `loadPerfFixture(blockCount)` to reuse the pinned corpus. If a new corpus is needed, add it under `packages/core/src/markdown/fixtures/perf/` with a committed fixture file + loader helper.

3. **Write the bench loop.** Model after `benchmarkBlockCount` in `markdown-bench.test.ts:156-183`:
   - Warm up 10 iters, discard.
   - Measured loop via `measure(op, MEASURED_ITERS)` — this wrapper does the `Bun.gc(true)` + `performance.now()` delta.
   - Reduce samples to `stats()`.

4. **Capture the baseline.**
   - Run the bench 4 times with the new op (independent invocations).
   - Aggregate per-op `{p99, p99StdevMs}`.
   - Add entries to `baseline.json` under `results[]`. Match existing schema exactly.
   - Update `capturedAt`, `runnerClass`, `calibrationRuns` if this becomes the primary calibration.

5. **Extend the comparator (if needed).**
   - Current comparator at `regression-gate.ts:118-172` iterates `OP_NAMES = ['parseMs', 'serializeMs', 'roundTripMs']`. If your op name isn't one of those, extend `OpName` + `OpStats` shape + `BaselineBlockEntry` + `evaluateRegression`.
   - Keep `max(2σ, 10%)` formula unchanged; add a test in `regression-gate.test.ts` exercising the new op.

6. **Wire into CI.**
   - If gated at tier-2 only (typical): confirm your op is exercised by `test:perf:regression` and that `turbo.json` inputs cover its source files.
   - If gated at tier-1 (unusual, justify): add a new turbo task. Expect < 5 s budget.

7. **Synthetic-regression unit test.** Add to `regression-gate.test.ts`:
   - Identity fresh ⇒ PASS.
   - Within 10% floor ⇒ PASS (floor dominates example).
   - Beyond threshold ⇒ FAIL with the correct `(blockCount, op)` tuple named.
   - Variance dominance on noisy baseline (if your op has relevant stdev behavior).

8. **Run locally end-to-end:**
   ```bash
   RUN_BENCH=1 bun test packages/core/tests/perf/markdown-bench.test.ts
   bun run packages/core/tests/perf/run-regression-gate.ts
   ```
   First command captures fresh results; second compares + exits 0. Fail-path verification: revert a perf-relevant code change locally, rerun, gate should fail cleanly with a readable row.

9. **Document your calibration decision** in a PR note or a new evidence file:
   - Why this op + corpus.
   - How many calibration runs and their spread.
   - Runner class.
   - Link baseline entry to the calibration session (gitSha in results metadata).

10. **Update this document** if the shape of the framework changed (new op name schema, new tier, new env var).

---

## Calibration history — why these numbers

Recorded so a future author can challenge the choices with evidence.

### Why 10 warm-ups, not 5 or 20

We measured convergence during R4 calibration. First 5 runs varied ±30% of steady-state (JIT + cache effects). By run 10, variance was within 5% of asymptotic. Doubling to 20 produced <2% additional convergence at ~2× the cost. 10 is the knee.

### Why 10 measured iterations, not 20 or 100

MEASURED_ITERS=10 produces `p99` as worst-of-10 (see [Measurement protocol](#measurement-protocol)). Raising to 100 would give a genuine 99th-percentile but multiplies bench time by 10×. At 20K blocks the parse bench alone is ~35 s per run; 100 measured iterations would push the full harness past 5 minutes, which breaks tier-2 budget. The σ term in the gate formula provides the noise-aware signal the true p99 would have.

### Why p99 (vs p95 or p999)

- `p95` misses tail regressions. Real user pain lives at the tail.
- `p999` too noisy at MEASURED_ITERS=10 — would fluctuate wildly.
- `p99` (worst-of-10 in our sampling) is empirically stable across calibration runs and correlates with user-visible pauses.

### Why 2σ (variance multiplier)

- `1σ` covers 68% of noise → CI flakes frequently.
- `3σ` covers 99.7% → stale baselines creep upward because any regression less than 3σ is absorbed.
- `2σ` covers 95% → catches most real regressions while absorbing typical session noise.

Empirically validated: during calibration we injected 15-30% slowdowns and confirmed 2σ fires while within-σ noise does not.

### Why 10% floor (not 5% or 20%)

- `5%` flakes at low-variance ops where ambient noise is ~5-10%.
- `20%` misses real regressions in the 10-20% band — exactly the "fast-becomes-slower-fast" case the floor is meant to catch.
- `10%` is the knee: tight enough to catch sub-σ regressions on slow ops, loose enough to absorb JIT warm-up variance.

### Why 5 block counts (100, 1K, 5K, 10K, 20K)

Log-spaced covers four regimes:
- **Near-linear** (100-1K): most production docs. Regression here hits everyone.
- **Super-linearity onset** (1K-5K): micromark's known super-linear range.
- **Stress target** (10K): primary gate point. Large doc, feasible wall-clock.
- **Stress ceiling** (20K): pathological doc. Slow, but catches catastrophic blow-ups.

We measured intermediate counts (500, 2500) one-off for curve-fitting but excluded them from gated baseline to keep CI time bounded.

### Why `Bun.gc(true)` between every measured run

Without forced GC, run N's allocation profile carries into run N+1. Measured specifically: a 100-block parse with bleed-through GC showed 15-25% variance across 10 runs; with forced GC, variance dropped to ~5%. The 10% floor formula is calibrated against the forced-GC variance; removing the GC call would require re-baseline.

### Calibration record

`specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r4-calibration.md` holds the full measurement data (4 runs, per-op medians, per-op stdevs). `perf-baseline-measured.md` documents the methodology pinning.

---

## Troubleshooting

### Gate fails with a regression I don't understand

1. Check runner-class mismatch. `run-regression-gate.ts` warns on this; the warning appears in the gate output. If your fresh run's `runnerClass` differs from baseline's, p99 delta may be hardware, not code.
2. Look at `deltaMs` vs `allowedDeltaMs` in the failing row. A `delta` slightly above `allowed` is often noise on a borderline run; rerun the bench (`RUN_BENCH=1 bun test …`) and see if it reproduces. Real regressions reproduce; flakes don't.
3. Pull the freshest `results.*.json` and diff its `runner` metadata against the baseline's — bun version, git sha, platform.

### `loadBaseline` throws "is not finite"

Corrupt baseline — a manual edit left a `NaN` or `Infinity`. The error message points at the offending `(blockCount, op, field)`. Fix the JSON and rerun. The guard at `regression-gate.ts:207-236` exists specifically to prevent silent pass-through on bad data.

### Bench harness runs but no `results.*.json` written

Check `RUN_BENCH` — if unset or not `1`/`true`, `markdown-bench.test.ts` auto-skips via `describe.skip`. You'll see a skip marker in the test output. Set `RUN_BENCH=1`.

### "No results.*.json found in <dir>; did the bench run fail?"

From `run-regression-gate.ts:33`. The orchestrator looks for `results.*.json` in its own directory and found none. Causes:

1. The bench test inside `run()` failed before writing; scroll up for the test stderr.
2. The bench ran in a different working directory (nested worktree issue); check `__dirname` vs bench output path.
3. Results were cleaned up between bench and gate; don't wipe the dir mid-orchestration.

### Gate passes locally, fails in CI

Likely runner-class mismatch (see warning). CI runners are typically 2× slower than local M-series and 5-20× noisier. Options:

1. Capture a CI-class baseline under `BENCH_RUNNER_CLASS=ci-<provider>` and commit a separate baseline file (requires orchestrator extension).
2. Increase the variance multiplier specifically for CI (not recommended — dilutes the gate contract).
3. Move the gate to nightly only if per-PR CI noise consistently fails even clean runs.

### How do I profile what's slow?

Run the **profile harness** at `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-profile-harness.ts`. It breaks down per-stage timing (remarkParse / remarkMdxAgnostic / wikilink / post-parse walker / remark-prosemirror / stringify) and emits a `perf-profile.<timestamp>.json` artifact. Use when the gate tells you "parse regressed at 10K" and you want to know which stage owns it.

### The bench takes forever

Expected at 20K blocks. The per-test timeout is 10 minutes (`markdown-bench.test.ts:233`). If you're locally iterating, drop `PERF_BLOCK_COUNTS` to `[100, 1000]` temporarily in a throwaway branch — don't commit that change.

---

## Cross-references

- **Bench harness:** `packages/core/tests/perf/markdown-bench.test.ts`
- **Comparator library:** `packages/core/tests/perf/regression-gate.ts`
- **Comparator tests:** `packages/core/tests/perf/regression-gate.test.ts`
- **Tier-2 orchestrator:** `packages/core/tests/perf/run-regression-gate.ts`
- **Committed baseline:** `packages/core/tests/perf/baseline.json`
- **Corpus:** `packages/core/src/markdown/fixtures/perf/`
- **Corpus README:** `packages/core/src/markdown/fixtures/perf/README.md`
- **Profile harness (standalone, for diagnosing slow stages):** `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-profile-harness.ts`
- **Calibration record:** `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r4-calibration.md`
- **Methodology pinning:** `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-baseline-measured.md`
- **Sibling subsystem — parse-health:** `packages/core/tests/health/README.md`
- **Spec §R4:** `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md` — gate requirement + acceptance criteria
- **CI tier structure:** AGENTS.md §CI tier structure
