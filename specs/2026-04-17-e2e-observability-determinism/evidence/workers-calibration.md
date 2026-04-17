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

## Measurement table (post-merge — fill in)

| Workers | Run 1 (s) | Run 2 (s) | Run 3 (s) | p50 (s) | p95 (s) | Flake count | Notes |
|---|---|---|---|---|---|---|---|
| 1 | TBD | TBD | TBD | TBD | TBD | TBD | sequential — ceiling |
| 2 | TBD | TBD | TBD | TBD | TBD | TBD | matches free-tier vCPU count |
| 4 | TBD | TBD | TBD | TBD | TBD | TBD | current setting |

## Decision log entry (post-measurement)

After filling the table, append one of:

- **D-Q7 LOCKED at workers=4.** Empirical evidence: `<p50_4>s` median vs
  `<p50_2>s` at workers=2; flake counts <`<flake_4>` vs `<flake_2>`. The
  4-worker config wins on both axes for our suite size + runner mix.
- **D-Q7 LOCKED at workers=2.** Empirical evidence: workers=4 showed
  `<problem>` (slower wall-clock OR higher flakes). Downgraded to 2 and
  updated `playwright.config.ts`.
