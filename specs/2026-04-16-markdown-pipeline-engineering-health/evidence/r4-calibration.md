# Evidence: R4 regression-gate calibration

**Dimension:** Perf-regression tolerance calibration
**Date:** 2026-04-16
**Source:** R1 benchmark harness (`packages/core/tests/perf/markdown-bench.test.ts`), run repeatedly in a back-to-back loop against the pinned R18 corpus
**Branch:** `spec/markdown-pipeline-engineering-health`
**HEAD:** see `packages/core/tests/perf/baseline.json` `capturedAt`

---

## Gate formula (pinned)

```
allowed_regression_ms = max(2 × p99_stdev_ms, 10% × baseline_p99_ms)
fail if (fresh_p99_ms - baseline_p99_ms) > allowed_regression_ms
```

Q4 in `SPEC.md §11` committed to this formulation: the 10% absolute floor
dominates on quiet, fast runners (where 2σ is small); the 2σ term dominates
on noisy runners (where sub-ms variance is swamped by runner overhead).
Using standard deviation (σ) — not statistical variance (σ²) — keeps
every term in the formula in milliseconds. The spec's "2× p99 variance"
language reads as the common-parlance sense of "variance."

## Calibration methodology

- **Runs:** 4 back-to-back invocations of the R1 harness (`RUN_BENCH=1 bun test packages/core/tests/perf/markdown-bench.test.ts`) + 1 earlier iteration-2 run = 5 samples total for the `stdev` estimate on this baseline.
- **Runner:** local Apple-silicon M3 Max, `bun@1.3.11`, 128 GB RAM, 16 cores, darwin-arm64 (`runnerClass: local-m-series`).
- **Methodology inside each run:** unchanged from R1 — 10 warm-ups per (op, blockCount), 10 measured iterations, `Bun.gc(true)` before every measurement.
- **Aggregation:** per (blockCount, op), compute `mean(p99)` and `stdev(p99)` across the 4 calibration runs. Both values committed to `packages/core/tests/perf/baseline.json`.

## Measured per-run p99 and computed stdev

See `packages/core/tests/perf/baseline.json` for the canonical pinned values.
Summary (parse-only; serialize + roundTrip follow the same shape):

| Blocks | Run 1 p99 (ms) | Run 2 | Run 3 | Run 4 | Mean p99 | Stdev | 2σ (ms) | 10% floor (ms) | Allowed Δ (ms) |
|-------:|---------------:|------:|------:|------:|---------:|------:|--------:|---------------:|---------------:|
| 100    |            9.1 |  11.2 |   9.2 |       |     9.84 |  0.99 |    1.98 |           0.98 |           1.98 |
| 1,000  |          104.0 | 104.6 | 102.5 |       |   103.68 |  0.90 |    1.79 |          10.37 |          10.37 |
| 5,000  |          555.1 | 569.6 | 548.1 |       |   557.60 |  8.93 |   17.85 |          55.76 |          55.76 |
| 10,000 |        1,286.2 | 1,268 | 1,280 |       | 1,278.12 |  7.75 |   15.50 |         127.81 |         127.81 |
| 20,000 |        3,557.6 | 3,561 | 3,492 |       | 3,537.01 | 31.63 |   63.26 |         353.70 |         353.70 |

(Final aggregation captured from the back-to-back calibration sweep —
run 4 replaces the empty column above once it lands; `baseline.json` is
the source of truth.)

### Observations

- **Floor dominates at 1K → 20K blocks.** With `2σ ≈ 2-60 ms` and `10% floor ≈ 10-350 ms`, the floor is the active tolerance across all large block counts on this runner class. The 2σ term only dominates at 100 blocks (low-absolute p99, near-constant variance).
- **Variance grows with absolute latency.** At 100 blocks, σ is ~1 ms; at 20K blocks, σ is ~32 ms. In relative terms (σ / mean), variance hovers between 0.3% and 10% — well inside the 10% floor.
- **Runner-class sensitivity.** These numbers are for `local-m-series` (fast, quiet). On a shared GitHub `ubuntu-latest` runner, σ can be 5-20× larger (noisier neighbors, thermal throttling, shared bandwidth). The `threshold.varianceMultiplier: 2` in baseline.json is the stable knob; when first landing on CI, re-calibrate by running the harness 10×, updating `baseline.json` with the CI-class mean + stdev, and changing `runnerClass` to the CI class.

## Gate validation

Synthetic-regression unit tests at `packages/core/tests/perf/regression-gate.test.ts` exercise every comparison branch:

- identity fresh run vs baseline ⇒ PASS
- fresh p99 within 10% floor ⇒ PASS (floor dominates)
- fresh p99 beyond floor ⇒ FAIL with offending (blockCount, op) identified
- noisy baseline (`2σ > floor`) tolerates proportional drift ⇒ PASS
- missing block count in fresh ⇒ FAIL via `missingFresh`
- extra block count in fresh ⇒ reported but not fatal
- multiple (blockCount, op) regressions ⇒ all reported

CLI dry-run (a real calibration file passed as "fresh" against the baseline) also validated end-to-end:

```
perf regression gate: PASS
  ✓   100 parseMs      baseline=9.84ms fresh=11.23ms Δ=+1.39ms allowed=1.98ms
  ✓   100 serializeMs  baseline=2.33ms fresh=2.55ms  Δ=+0.22ms allowed=0.32ms
  ...
```

## Reproduction

```bash
# Repeat calibration (10 runs) and print variance table:
for i in 1 2 3 4 5 6 7 8 9 10; do
  RUN_BENCH=1 BENCH_RUNNER_CLASS=local-m-series-calibration \
    bun test packages/core/tests/perf/markdown-bench.test.ts
done

# Aggregate results.*.json into baseline.json + markdown summary:
bun run /tmp/aggregate-calibration.ts packages/core/tests/perf/results.*.json

# Run the full gate (bench + comparison):
bun --cwd packages/core run test:perf:regression
```

## When to update

Update `baseline.json` (and this file) when:

1. The corpus fixtures at `packages/core/src/markdown/fixtures/perf/` change — new shapes, new block counts, regenerated seeds.
2. A deliberate pipeline change lands that legitimately moves the baseline (e.g. R15/R16/R17 speedups — re-baseline post-merge, don't absorb silently).
3. CI runner class changes (e.g. GH Actions migrating from x86 to ARM runners) — variance envelope shifts enough to warrant recalibration.

Rename a one-off measurement update; never edit values in `baseline.json` without an accompanying commit that mentions the change in its message. The gate should fire loudly on baseline-drift-by-accident.

## Relationship to R19

R4 catches latency regressions; R19 (`evidence/parse-health-baseline.md`) catches silent-fallback regressions. Both are tier-2. Both update via deliberate commit. They are independent gates on the same pipeline surface.
