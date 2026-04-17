# Workers calibration — D-Q7 validation evidence

**Status:** PRE-MERGE STUB. Real numbers land via a follow-up commit
post-merge once we have CI runs to measure.

`playwright.config.ts` sets `workers: process.env.CI ? 4 : undefined`
per D-Q7 DIRECTED. D-Q7 is DIRECTED (not LOCKED) because it depends on
empirical CI runner capacity — `ubuntu-latest` is documented as
2 vCPU for the private-repo free tier. We need to validate `workers: 4`
actually performs better than `workers: 2` on that hardware before
locking the value.

## Methodology

Once this spec merges:

1. Trigger 3 manual `workflow_dispatch` runs of the existing CI
   workflow (`.github/workflows/ci.yml`) on `main` at each of:
   - `workers: 1`
   - `workers: 2`
   - `workers: 4` (current default)
2. For each run, record from the playwright job log:
   - **p50 wall-clock** (median of the 3 runs at that worker count)
   - **p95 wall-clock** (worst of the 3)
   - **flake count** (number of tests that passed only on retry, surfaced
     by `failOnFlakyTests` annotations even when the build passes — note:
     with `failOnFlakyTests: true` flakes fail the build, so this is
     "build outcome under flakes" rather than "silent flake count")
3. Fill in the table below.

Modify `workers` for the test runs by exporting an env var
(`PLAYWRIGHT_WORKERS=N`) and reading it in `playwright.config.ts`. Don't
commit the env-var read — it's measurement-time scaffolding.

## Decision criterion

Keep `workers: 4` if AND only if:

- p50 at workers=4 is **NOT slower** than p50 at workers=2 (within
  measurement noise, ±10%), AND
- flake count at workers=4 is **NOT higher** than flake count at
  workers=2 (zero is the target).

If either condition fails, downgrade `playwright.config.ts` to
`workers: process.env.CI ? 2 : undefined` and update D-Q7 from DIRECTED
to LOCKED with the empirical justification.

If `workers: 4` wins on both axes, lock at 4.

## Pre-merge expectation

Before this spec lands, only local data is available:

| Workers | Suite size | Local wall-clock | Notes |
|---|---|---|---|
| 4 | 13 files / 134 tests | ~17s | M3 Max, default Playwright workers via `--workers=4`. Per-test docName isolation (PR #185) makes parallel safe. |

Local hardware (M3 Max, 12 perf cores) is a generous upper bound; CI
runners are bounded by 2 vCPU and roughly 2-3× slower. Expect the
absolute numbers below to be in the 30s-90s range, not 17s.

## Measurement table (pre-merge empirical data — PR #193)

Pre-merge measurement was unintentional but produced evidence: PR #193's
first two CI runs cancelled at the 15-min `timeout-minutes` backstop at
workers=4 and workers=2, producing zero visible stdout (turbo buffers
per-package output and flushes on task completion — cancellation before
completion prevents flush). Main's baseline (retries=0, workers=default=1,
fullyParallel=false) completed cleanly in 7m41s.

| Workers | retries | Run | Wall-clock | Outcome | Notes |
|---|---|---|---|---|---|
| 1 (default) | 0 | `24553298790` (main) | **7m41s** | completed | 17 failures pre-#188-cherrypick; baseline for E2E suite |
| 4 | 2 | `24572488164` (PR #193, f1764ec8) | 15:00 | cancelled | GHA 2-vCPU oversubscribed 2× |
| 2 | 2 | `24573513956` (PR #193, 94361dd5) | 15:14 | cancelled | GHA 2-vCPU oversubscribed, still over budget |
| 1 | 2 | TBD (PR #193, next push) | TBD | TBD | Expected ~9-10m (main 7m41s + retries=2 tax) |

## Decision log entry (from pre-merge empirical data)

**D-Q7 empirically settled at workers=1 on GHA ubuntu-latest (2 vCPU, free
tier).** Evidence: workers=4 and workers=2 both cancelled at the 15-min
timeout. workers>1 on a 2-vCPU runner oversubscribes CPU enough that the
parallelism benefit is net-negative when combined with retries=2.
`playwright.config.ts:workers` set to `isCI ? 1 : undefined`;
`.github/workflows/ci.yml:timeout-minutes: 20` gives retries=2 safety
margin over main's 7m41s baseline.

This settles the spec's D-Q7 DIRECTED state to a LOCKED value for the
current runner tier. If GHA runner tier changes (e.g., `ubuntu-latest-4-cores`),
this decision should be re-measured.
