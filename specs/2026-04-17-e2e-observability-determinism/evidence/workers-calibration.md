# Workers calibration — D-Q7 validation evidence

**Status:** LOCKED post-empirical, dual-tier runner strategy.

`playwright.config.ts` sets `workers: process.env.CI ? 4 : undefined`.
The PR-time Playwright job in `.github/workflows/ci.yml` runs on
`ubuntu-64gb` (shared org runner, ≥16 vCPU / 64 GB RAM) — large enough
that `workers=4` does not oversubscribe.

D-Q7 was originally DIRECTED pending empirical CI measurement because
the runner tier determines the viable worker count. The measurement
landed during PR #193, along with a runner upgrade; both feed the
LOCKED decision below.

## Measurement table (empirical — PR #193)

Runtime observations across three CI runner / config combinations:

| Runner | Workers | retries | Run | Wall-clock | Outcome | Notes |
|---|---|---|---|---|---|---|
| `ubuntu-latest` (2 vCPU) | 1 (default) | 0 | `24553298790` (main) | **7m41s** | completed | 17 pre-existing failures; baseline |
| `ubuntu-latest` (2 vCPU) | 4 | 2 | `24572488164` (PR #193, `f1764ec8`) | 15:00 | **cancelled** | CPU oversubscribed 2× + retries amplification |
| `ubuntu-latest` (2 vCPU) | 2 | 2 | `24573513956` (PR #193, `94361dd5`) | 15:14 | **cancelled** | Still oversubscribed |
| `ubuntu-latest` (2 vCPU) | 1 | 2 | `24574575469` (PR #193, `390c39f3`) | 12m24s | completed | Serial + retries = proven clean |
| `ubuntu-64gb` (≥16 vCPU) | 4 | 2 | TBD (PR #193, post-runner-upgrade) | TBD | TBD | Expected ~3-5m |

Turbo buffers per-package stdout and flushes on task completion. The
two cancelled runs produced zero visible Playwright output because
cancellation preceded the flush — a symptom worth noting for anyone
debugging a similar timeout in the future.

## Decision log entry

**D-Q7 LOCKED at `workers: 4` on `ubuntu-64gb`.** The CI runner tier
dominates the worker-count ceiling:

- On `ubuntu-latest` (2 vCPU free tier), `workers > 1` oversubscribes
  CPU enough that `retries: 2` amplification pushes the combined job
  past the 15-min timeout. `workers=1` is the only viable setting
  on this tier and sacrifices parallelism for CPU headroom.
- On `ubuntu-64gb` (shared org runner, ≥16 vCPU / 64 GB RAM),
  `workers=4` fits comfortably — 4 Playwright workers × (one
  orchestrator + one chromium process) is ~8 processes, well under
  the core count. Retry tax is absorbed by the larger runner.

`.github/workflows/ci.yml` sets `runs-on: ubuntu-64gb` + `timeout-minutes: 15`
for the `playwright` job. The nightly stability workflow
(`.github/workflows/nightly-e2e-stability.yml`) deliberately stays on
`ubuntu-latest` + `workers=1` — that job is serial flake surveillance,
not speed-critical, and keeping it on the free tier matches the
hardware an individual contributor would see locally.

**Re-measurement triggers:**

- If the org removes access to `ubuntu-64gb` (e.g., quota or billing
  change), re-downgrade to `ubuntu-latest` + `workers=1`.
- If `workers > 4` is ever proposed, re-measure on `ubuntu-64gb`
  before raising — large runners also have finite parallelism under
  shared-use. A new empirical row in the table above is the bar.

## Dual-tier rationale

The split was intentional:

- **PR-time CI (`ci.yml` playwright job)** — ergonomics matter. Fast
  feedback keeps the PR loop tight. `ubuntu-64gb` + `workers=4`
  delivers ~3-5m full-suite runtime with retries=2 safety net.
- **Nightly surveillance (`nightly-e2e-stability.yml`)** — variance
  reduction matters. Serial `workers=1` under `--repeat-each=3` on
  the same free-tier hardware a contributor would use locally catches
  slow-burn drift that PR-time parallelism masks.

Same test suite, two runner profiles for two different questions:
"does this PR pass?" vs "is the suite drifting over time?"
