# Performance baseline update protocol

`packages/app/tests/stress/perf-baseline.json` holds frame-time baselines
consumed by Playwright perf assertions (currently QA-022 only). Baselines
are append-only history with a git blame trail — every update is a single
PR with the rationale in the commit body and user approval in the PR
discussion.

## When to update

1. **Demonstrated perf improvement** — the median p50 across 5 consecutive
   post-merge CI runs drops by ≥20% from the current baseline. Lower the
   baseline to lock in the gain (the assertion floor stays at 32ms, so
   the only effect is tightening the regression ceiling).
2. **Large editor refactor** — after a CRDT bridge change, observer
   restructure, or chunked-insert.ts modification that legitimately shifts
   the perf profile. Re-capture and update.

Do NOT update because:
- The assertion failed once on a slow runner. The 2x ceiling already
  absorbs 100% variance; if it tripped, that's a real regression signal
  worth investigating.
- A single local run measured a different number. Local hardware varies;
  CI is the canonical measurement environment.

## How to capture the new baseline

1. Land the underlying change on `main` first.
2. Run the full Playwright suite **5 consecutive times** on CI via
   `workflow_dispatch` (use the existing CI workflow; do not invoke
   locally — runner type matters).
3. Extract the `FR-21 frame metrics: {…}` log line from each run's
   playwright stdout (artifact-uploaded per US-003). Record the `p50`
   field from each.
4. Compute the **median of the 5 p50 values**. That is the new
   `p50Ms`.
5. Open a PR updating `perf-baseline.json`:
   - Set `p50Ms` to the median.
   - Set `capturedAt` to today's ISO date.
   - Set `capturedFrom` to `"CI medians of 5 runs (workflow IDs: <id1>, <id2>, …)"`.
   - Update `notes` if the rationale shifted.
6. The PR description must list the 5 individual p50 measurements and the
   median calculation. Reviewer (you) confirms the math.
7. After merge, watch the next 3 CI runs land green. If they don't,
   the baseline was wrong; revert and re-capture.

## Approval gate

Every baseline update requires explicit user approval in the PR. The
baseline is a contract: tightening it locks in perf claims; loosening it
forfeits regression coverage. Both directions need to be a deliberate,
documented choice.

## Schema

```json
{
  "schemaVersion": 1,
  "qa022": {
    "p50Ms": <number>,
    "capturedAt": "<YYYY-MM-DD>",
    "capturedFrom": "<source description>",
    "notes": "<assertion shape + rationale>"
  }
}
```

Future perf tests add their own top-level keys (`qaXXX`) following the
same shape. The schema is intentionally minimal — anything more (p95,
percentile sweeps, env metadata) is YAGNI until a second perf test
demands it.

### Key naming: `qa022` vs `QA-022`

The JSON key is lowercase with no dash (`qa022`); the spec
acceptance-criterion ID, the test name, and the reviewer-facing
documentation use dashed-uppercase (`QA-022`). The split is
deliberate — lowercase-no-dash keys play nicely with shell quoting and
with `jq '.qa022'` patterns, and the test-side TypeScript narrowing
(`PERF_BASELINE.qa022.p50Ms`) reads cleanly. When adding a new perf
test, follow the same mapping: `QA-NNN` in SPEC / docs / test names,
`qaNNN` as the JSON key.

Matches the existing schema at `packages/core/tests/perf/baseline.json`
(`schemaVersion: 1` + domain-scoped result entries) so cross-file
tooling can share baseline validators.
