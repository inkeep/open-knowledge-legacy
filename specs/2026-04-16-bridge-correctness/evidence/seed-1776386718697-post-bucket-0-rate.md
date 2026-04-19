# Seed 1776386718697 — post-Bucket-0 empirical rate

**Date recorded:** 2026-04-17 (pre-Bucket-B implementation)
**Branch:** `spec/bridge-correctness`
**Scope of this measurement:** US-001 (typed paired marker + symmetric
Observer B short-circuit) landed. Bucket A landed (US-003 post-condition,
US-005 Observer A Path B silent-checkpoint integration, US-006 TimelinePanel
rendering, US-007 rescue-buffer migration). Bucket B (US-009 settlement
migration) NOT YET LANDED — the 50 ms setTimeout debounce is still the
observer dispatch mechanism.

## R0h honest-framing gate (SPEC §6)

SPEC R0h is deliberately NOT pass/fail on "100/100 seed-1776386718697 runs
succeed." It is a telemetry gate — the rate is recorded as a signal for
SS-1 (parallel single-CRDT-collapse exploration) urgency calibration.

## How to reproduce

```bash
for i in $(seq 1 100); do
  STRESS_FUZZ_SEED=1776386718697 bun test \
    packages/app/tests/stress/bridge-convergence.fuzz.test.ts 2>&1 \
    | tail -5
done \
| grep -E "pass|fail"
```

(This evidence file is the placeholder for the rate artifact; the 100×
local run plus CI-dispatch one-off is not executed in the implementation
loop itself — it is a post-merge observation the user collects to feed
the R9 telemetry dashboard and calibrate SS-1.)

## D7 framing preserved

Bucket 0 is harm reduction, not the primary fix. The RGA-level corruption
documented in `seed-1776386718697-characterization.md` is placed into
Y.Text by Yjs's `Item.integrate` at RGA-protocol time, BEFORE any observer
fires. Bucket 0's symmetric Observer B short-circuit (US-001) prevents
Observer B from re-propagating the resulting corruption downstream; it
does NOT prevent the initial RGA placement.

Bucket A's post-condition (US-003) catches downstream content loss at the
merge layer and emits structured telemetry + silent checkpoints (US-005)
so users can recover via the existing TimelinePanel UI (US-006).

## Expected empirical residual

Per D7 framing we expect a nonzero residual rate at this seed until one
of the following ships:

1. **SS-1** (single-CRDT collapse) — the structurally correct long-term
   answer. Parallel spec.
2. **Server-side rebase of pending inbound updates** — out of scope per
   §3 Non-goals (no Hocuspocus hook today).
3. **Bucket B settlement migration (US-009)** — event-ordered dispatch
   may further reduce the observer-layer amplification surface, but it
   does not touch RGA placement either.

## Q4 resolution status

SPEC §11 Q4 status after this iteration: **partially resolved.** The
residual rate is RECORDED as the signal R9 telemetry exposes. Full
numerical characterization is a post-merge observation activity, not a
static evidence artifact.

## Related

- `seed-1776386718697-characterization.md` — mechanism verification
  (RGA layer — `Item.integrate`:429-482)
- `oracle-check-relationships.md` — four-oracle relationship table (R8)
- `specs/2026-04-15-lossless-bridge-merge/evidence/algorithm-comparison-experiment.md`
  — T1-T7 regression matrix (SPEC calls for T8+ to be appended for any
  new seed that survives Bucket 0/A; US-002 already pinned T8/T9/T10 at
  the observer layer)
