# CI Signal Quality & Testing Tier Separation

**Status:** Scaffold — decisions locked, ready for review
**Baseline commit:** `18dccfde` (main @ 2026-04-19)
**Branch:** `spec/ci-signal-quality`
**Worktree:** `.claude/worktrees/ci-signal-quality`

**Related:**
- `specs/2026-04-16-bridge-correctness/` — D4-LOCKED (single-CRDT collapse deferred); architectural residual origin
- `specs/2026-04-17-e2e-observability-determinism/` — D-Q5 LOCKED target of revisit (FR-4)
- `specs/2026-04-15-server-authoritative-observer-bridge/` — mutation validation gates
- `specs/2026-04-14-bridge-convergence-under-concurrent-writes/` — original bridge-race spec
- PR #206 — 11% stress-race diagnostic JSON
- PR #212 — `STRESS_SEED` replay (prerequisite shipped)

**Out-of-spec (parallel investigation sessions):**
- Package A: Playwright WebSocket `EPIPE` / `ECONNRESET` RCA
- Package B: Seed-signature triage (deterministic-on-main classification)
- Package C: Harvest captured stress diagnostic JSON

---

## 1) Problem statement (SCR)

**Situation.** PR-tier CI currently passes ~22% on correct code. The bridge-convergence fuzz (75 PR-tier seeds × known ~2-3% per-seed architectural residual race rate) mathematically guarantees a PR-red probability of >80% per run — independent of whether the PR introduces any regression. Compounding factors: server-authoritative stress at ~11% CI-flake rate, Playwright retry-pass promoted to check-fail via `failOnFlakyTests: true` (D-Q5 LOCKED in 2026-04-17-e2e-observability-determinism), and WebSocket `EPIPE`/`ECONNRESET` infrastructure noise surfacing in Playwright logs.

**Complication.** The architectural residual race cannot be eliminated within the current dual-CRDT (Y.XmlFragment + Y.Text) topology. Khanna-Kunal-Pierce 2007 impossibility for state-based three-way merge is foundational. Single-CRDT collapse is `D4-LOCKED` in `specs/2026-04-16-bridge-correctness/` — deferred until H2 2026+ pending Yjs 14 + Automerge 2.2+ ecosystem maturation.

Current CI treats this architecturally-inevitable residual as equivalent to PR-caused regression. The resulting noise:

1. Erodes developer trust (every failure requires manual "real bug vs lottery loss" triage)
2. Produces ~4:1 retry overhead on correct PRs
3. Masks real regressions behind known-flake false positives
4. Conflates md ⇄ PM conversion correctness (designed lossless) with CRDT merge (architecturally residual-bound)

**Resolution sought.** A CI configuration where:

- **PR-tier CI** enforces only deterministic, regression-meaningful signals. Conversion correctness (md ⇄ PM) tested with zero flake tolerance. Green on correct code ≥95%.
- **Measurement scripts** (not CI) handle the architectural residual — human-invoked, results logged to JSONL for git-history-based trend review.
- **Infrastructure flakes** (Playwright retry-pass) absorbed by retry policy, not promoted to red.

---

## 2) Goals / Non-goals

### Goals

- **G1.** PR-tier CI green on correct code ≥95% of runs (from current ~22%)
- **G2.** md ⇄ PM conversion correctness tested deterministically at PR tier, zero flake tolerance
- **G3.** CRDT-merge architectural residual measurable on-demand via `measure:*` scripts; results captured in JSONL for git-history trend review
- **G4.** Infrastructure flakes absorbed by retry policy, not promoted to red
- **G5.** Clean architectural split between `test:*` (automated CI gate) and `measure:*` (ad-hoc observation)

### Non-goals

- **NG1.** Eliminate the architectural CRDT residual (gated by D4-LOCKED, H2 2026+)
- **NG2.** Fix individual pre-existing bugs surfaced by fuzz/stress (separate targeted investigation: Packages A/B/C)
- **NG3.** Modify bridge observer implementation (that's `specs/2026-04-16-bridge-correctness/` territory)
- **NG4.** Change test-harness architecture (`createTestServer`, `ControllableWebSocket`, etc.)
- **NG5.** Address markdown fidelity regressions directly — fidelity tier is assumed correct; this spec's conversion-PBT expansion is additive coverage
- **NG6.** Automated regression detection for architectural CRDT residual. The dual-CRDT topology produces an irreducible residual rate. Detection of changes to that rate is handled by human discipline + git-history review of `residual-measurements.jsonl`, not by automated CI alerts. Accepted cost: dep/runner drift goes unnoticed until a bridge-touching PR triggers a measurement script run. This is a deliberate simplification over the alternative (nightly automation + baseline maintenance + threshold tuning).

---

## 3) Current state

### CI tier composition (before this spec)

| Workflow | Cadence | Jobs | PR-blocking |
|----------|---------|------|-------------|
| `ci.yml` | Every PR | lint, typecheck, test matrix (unit/integration/conversion/fidelity/stress), **fuzz (75 seeds)**, **playwright**, pr-review, size | All required |
| `nightly.yml` | Daily 06:17 UTC | deep-fuzz (10K seeds via `STRESS_FUZZ_NIGHTLY=1`), full-stress | None |
| `nightly-e2e-stability.yml` | Daily 09:00 UTC | Playwright `--repeat-each=3 --workers=1` w/ auto-issue | None |
| `weekly.yml` | Weekly | Elevated PBT, perf trend | None |

### Empirical signal (last 50 runs, measured 2026-04-19)

- PR-tier pass rate: **~22%**
- Main-branch pass rate: **~29%**
- Fuzz job pass rate: ~50% per run
- Stress flake rate: ~11% (per PR #206 commit message)
- Playwright: periodic "120s timeout → retry passes" pattern

### Test tier architecture

| Tier | Scope | Concurrency | CRDT? | Conversion? | Deterministic? |
|------|-------|-------------|-------|-------------|----------------|
| Unit | `packages/core/**/*.test.ts`, pure functions | None | No | Partial | ✅ Yes |
| Fidelity (`test:fidelity`) | I1–I11 PBT invariants, handler PBTs, CommonMark/GFM corpus | None | No | ✅ Full (21 P0, 19/19 CommonMark idempotent per PR #172) | ✅ Yes |
| Integration | C1–C10 bridge matrix, hand-crafted scenarios | Deterministic | Yes | Yes | ✅ Mostly |
| Fuzz | Multi-client bridge convergence, seeded PRNG | Concurrent | Yes | Yes (via ops) | ❌ No (architectural) |
| Stress | 5-client × 30s sustained load | Concurrent | Yes | Yes (via ops) | ❌ No (architectural) |

### Gap identified

Conversion paths invoked INSIDE bridge observers (`updateYFragment`, `applyFastDiff`, `applyExternalChange`) are **not** PBT-covered at fidelity tier. A conversion bug in those paths currently surfaces only as a fuzz/stress bridge-convergence failure — indistinguishable from architectural residual. Addressed by FR-1.

---

## 4) Requirements

### FR-1. Conversion-path PBT tier expansion (G2)

Extend fidelity tier with bridge-observer-conversion coverage in single-process deterministic sequence (no CRDT concurrency, no multi-client).

**Scope:**

- PBT inputs: random markdown (fast-check Arbitrary)
- Invocation chains:
  - `parseMd(md) → updateYFragment(existingFragment, parsed)` — verify content-preservation invariant
  - `serializeFragment(frag) → applyFastDiff(yText, serialized)` — verify Y.Text matches
  - `applyExternalChange(doc, md)` — verify paired-write content preservation
- Oracle assertions: I1–I11 invariants, content preservation, handler-specific (wikiLink / jsxComponent / rawMdxFallback)

**Location:** `packages/app/tests/fidelity/bridge-observer-conversion.test.ts` (new, per D-Q4)

**Runs under:** existing `bun run test:fidelity` turbo task — PR-blocking

**Acceptance criterion:** Conversion bugs in observer-invoked paths surface as fidelity failures (deterministic, PR-blocking), not fuzz failures (architectural-ambiguous).

### FR-2. Remove fuzz from CI entirely (G1, G3)

Delete `fuzz` job from `ci.yml`. Delete `deep-fuzz` job from `nightly.yml`. No scheduled automated fuzz runs at any tier.

Underlying test file (`packages/app/tests/stress/bridge-convergence.fuzz.test.ts`) remains — invocable via raw `bun test` or via `measure:fuzz` script (FR-6). Remove `test:fuzz:bridge` npm-script alias from `packages/app/package.json` to prevent accidental turbo pipeline inclusion.

**Trade-off acknowledged:** loses all automated regression detection for the architectural CRDT residual. Compensating controls:
- FR-1 (conversion PBT) catches conversion regressions at PR tier
- Mutation validation gates E/F/G from `specs/2026-04-15-server-authoritative-observer-bridge/` catch observer-code regressions
- FR-6 (`measure:fuzz`) for developer-invoked pre-PR / investigation runs
- JSONL log review for manual trend inspection
- Per NG6, this is an explicit non-goal for automation

### FR-3. Remove stress from CI entirely (G1, G3)

Delete `test:stress:server-authoritative` from `ci.yml` matrix. Delete `full-stress` job from `nightly.yml`. No scheduled automated stress runs.

Underlying test file (`packages/app/tests/stress/server-authoritative-stress.test.ts`) remains — invocable via raw `bun test` or via `measure:stress` script (FR-6). Remove `test:stress:server-authoritative` npm-script alias to prevent turbo pipeline re-inclusion.

### FR-4. Playwright `failOnFlakyTests: false` globally (G4)

Amend `specs/2026-04-17-e2e-observability-determinism/` D-Q5 LOCKED via follow-up spec amendment in that directory's evidence. Change `playwright.config.ts`:

```ts
failOnFlakyTests: false,  // was true per prior D-Q5 LOCKED
```

Flakes remain visible in Playwright HTML report + logged as "flaky" in Playwright's output. Detection of persistent flakes happens at `nightly-e2e-stability.yml` workflow (`--repeat-each=3 --workers=1`), which auto-opens GitHub issues with `e2e-flake` label on consistent failure.

### FR-5. Measurement script architecture (G3, G5)

Introduce the `measure:*` npm script family, distinct from `test:*`, for ad-hoc sampling of the architectural residual.

**Scripts:**

```jsonc
// packages/app/package.json
{
  "scripts": {
    "measure:fuzz":   "bash scripts/measure-fuzz.sh",
    "measure:stress": "bash scripts/measure-stress.sh"
  }
}
```

**`packages/app/scripts/measure-fuzz.sh`** — bash wrapper, ~40-60 lines:
1. Parses CLI args: `--seeds N` (default 500), `--seed-replay SEED` (single-seed mode), `--context "free-text"` (for log annotation)
2. Invokes `BRIDGE_FUZZ_SEEDS=$N bun test tests/stress/bridge-convergence.fuzz.test.ts` (or `STRESS_FUZZ_SEED=$SEED` for replay)
3. Parses output for `N pass / M fail` counts and failing seeds
4. Computes `rate = seedsFailed / seedCount`
5. Composes JSONL record (see schema below) via `jq`
6. Appends to `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl`
7. Prints summary + reproduction commands for failing seeds

**`packages/app/scripts/measure-stress.sh`** — analogous, wraps `STRESS_SEED=$SEED bun test tests/stress/server-authoritative-stress.test.ts`, CLI: `--seed N` (default random), `--duration MS` (default 30000), `--context "..."`.

**No turbo integration.** `measure:*` scripts do not appear in `turbo.json`. They are one-off developer actions, not build-pipeline steps. Caching would invalidate the measurement.

**Not part of `bun run check`.** Measurement is not gating.

### FR-6. JSONL schema + residual-measurements.jsonl log

Append-only file at `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl`. One record per line.

**Schema (each line):**

```jsonc
{
  "timestamp": "2026-04-19T14:23:15Z",      // ISO 8601 UTC, when run started
  "commit": "abc1234",                       // short git SHA at run time
  "script": "deep-fuzz",                     // "deep-fuzz" | "deep-stress"
  "seedCount": 1000,                         // total seeds/runs attempted
  "seedsFailed": 23,                         // seeds that failed
  "rate": 0.023,                             // seedsFailed / seedCount
  "invokedBy": "nick",                       // $USER or CI identifier
  "context": "pre-PR-218 baseline",          // free-text annotation
  "failingSeeds": [1776559905522],           // for replay
  "durationMs": 8900000,                     // wall-clock
  "host": "local-macos",                     // "local-macos" / "local-linux" / "ubuntu-64gb-ci" / etc.
  "bunVersion": "1.3.11",                    // runtime version
  "extra": { ... }                           // optional script-specific (e.g., stress-specific stressSeed + duration)
}
```

**Commit discipline:** developers append the record (via the script) and commit it as part of their bridge-touching PR, or as a standalone commit for investigations. The git history of this file becomes the rate-trend record.

**Query patterns** (documented in the script file headers):

```bash
# 7-day rolling rate
jq -s 'sort_by(.timestamp) | map(select(.timestamp > (now - 7*86400 | todate))) | [.[].rate] | add/length' \
  specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl

# Recent spikes (>5% rate)
jq 'select(.rate > 0.05)' specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl

# Rate by script
jq -s 'group_by(.script) | map({script: .[0].script, runs: length, avgRate: (map(.rate) | add/length)})' \
  specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
```

### FR-7. AGENTS.md documentation update

Existing §Test layers table updated:
- Remove the "Stress" row (`test:stress:server-authoritative` no longer a blessed npm script)
- Remove Layer D "Multi-client convergence fuzz" row (`test:fuzz:bridge` removed)
- Keep Unit, Integration, Fidelity, Layer A/B/C as-is

Add new section §Measurement scripts (ad-hoc, not CI):

```markdown
### Measurement scripts (ad-hoc, not CI)

Human-invoked scripts for sampling the architectural CRDT residual race
(see specs/2026-04-19-ci-signal-quality/SPEC.md). Not part of CI.

Results append to `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl`
— git history of that file is the trend record.

| Script | What it measures | Typical invocation |
|--------|------------------|--------------------|
| `bun run measure:fuzz`   | Bridge-convergence fuzz seed failure rate         | `bun run measure:fuzz --seeds 1000 --context "pre-PR-218"` |
| `bun run measure:stress` | Server-authoritative stress duplicate detection   | `bun run measure:stress --seed 42 --duration 120000` |

**When to run:** before merging bridge-touching PRs; when investigating a
suspected rate shift; during bridge-correctness spec work.

**Querying the log:** see `jq` examples in the script file headers.
```

---

## 5) Decisions (D-Q)

All decisions locked via spec review 2026-04-19.

### D-Q1: Fuzz tier placement — **LOCKED Option A (simplified)**

Fuzz removed from CI entirely (originally "move to nightly-only"; simplified per team discussion to "remove from CI entirely, rely on `measure:fuzz` ad-hoc").

- ✅ Pro: removes ~50pp of PR-red noise immediately. No scheduled compute cost.
- Con: loses all automated architectural-residual sampling (acknowledged per NG6)
- Mitigated by: FR-1 (conversion PBT at PR tier) + FR-5/FR-6 (`measure:fuzz` scripts with JSONL log)

**Not chosen:** Option B (smoke test at PR), Option C (status quo).

### D-Q2: Stress tier placement — **LOCKED Option B (simplified)**

Stress removed from CI entirely. Symmetric treatment with fuzz per same rationale.

- ✅ Pro: eliminates remaining ~11pp PR-red from stress flake. `STRESS_SEED` replay (PR #212 shipped) preserved for `measure:stress` + manual investigation.
- Con: loses automated per-PR sampling (same NG6 trade-off)

**Not chosen:** Option A (keep at PR), Option C (rate-threshold enforcement at PR).

### D-Q3: Playwright `failOnFlakyTests` — **LOCKED Option A**

Global `failOnFlakyTests: false`. Retry passes = check passes. Flake detection continues via `nightly-e2e-stability.yml` (`--repeat-each=3 --workers=1`).

- ✅ Pro: one-line config change, relies on existing nightly surveillance, eliminates retry-pass false reds (component-blocks-v2 agent evidence)
- Con: PR-tier loses fine-grained flake detection for 24h until nightly catches; accepted per existing nightly workflow design

**Not chosen:** Option B (signature allowlist — too much infrastructure for marginal benefit), Option C (status quo — not viable given operational evidence).

**Requires amendment:** `specs/2026-04-17-e2e-observability-determinism/` D-Q5 LOCKED. Follow-up spec evidence amendment needed.

### D-Q4: Conversion PBT expansion scope — **LOCKED Option A**

New file `packages/app/tests/fidelity/bridge-observer-conversion.test.ts`. Runs under existing `test:fidelity` turbo task.

- ✅ Pro: no new CI job, consistent with existing fidelity pattern, clear naming signals intent
- Not chosen: Option B (new test tier — unnecessary CI complexity), Option C (inline into I1-I11 — conflates pure-conversion invariants with bridge-observer-invoked variants)

### D-Q5: Nightly rate-threshold baseline — **REMOVED**

Obsolete given D-Q1 + D-Q2 + NG6 — no nightly automation = no threshold needed. Rate trend review is human-driven via `jq` queries against `residual-measurements.jsonl`.

---

## 6) Risks

### R1. Architectural-residual regression lands without automated detection

- **Likelihood:** Low-medium. Regressions in bridge code affect rate meaningfully; would be caught when any bridge PR's author runs `measure:fuzz` for the first time post-merge.
- **Severity:** Medium — latency depends on developer discipline around `measure:*` invocation.
- **Mitigation:** Team convention: `measure:fuzz --seeds 1000` before merging any PR that touches `packages/server/src/server-observers.ts` or `packages/core/src/bridge/**`. FR-1 catches conversion-class bugs deterministically at PR tier. Mutation gates E/F/G from existing specs catch observer-code regressions. Per NG6, this is an explicitly-accepted cost.

### R2. FR-1 conversion PBT has coverage gap vs fuzz op set

- **Likelihood:** Medium. PBT-generated markdown may not cover full op vocabulary (`chunked-source-paste`, `agent-patch` find/replace specifics).
- **Severity:** Medium.
- **Mitigation:** Review FR-1 coverage against the fuzz's 9 op kinds (in `bridge-convergence.fuzz.test.ts`). Iterate Arbitrary definitions until equivalent. Document coverage mapping in `bridge-observer-conversion.test.ts` header.

### R3. `measure:*` scripts diverge from test semantics over time

- **Likelihood:** Low.
- **Severity:** Medium.
- **Mitigation:** Scripts are thin bash wrappers around `bun test ...` — they do not replicate test logic, only invocation/result-capture. Test file changes are picked up automatically.

### R4. Dependency/runner drift goes unnoticed

- **Likelihood:** Medium (Yjs upgrades, Hocuspocus bumps, CI runner config changes).
- **Severity:** Medium.
- **Mitigation:** Convention: `measure:fuzz` run on any PR that touches `bun.lock` with bridge-related dep changes, or `.github/workflows/*`. Discipline-dependent; accepted per NG6.

### R5. JSONL log grows unwieldy over time

- **Likelihood:** Low (file grows ~1 line per measurement, expected <100 measurements/year).
- **Severity:** Low.
- **Mitigation:** If growth becomes an issue, rotate annually (`residual-measurements-2026.jsonl`, etc.). Not a near-term concern.

---

## 7) Implementation phases

### Phase 1 — PR-tier CI changes (hours, highest impact)

1. **PR:** remove `fuzz` job from `ci.yml`
2. **PR:** remove `test:stress:server-authoritative` from `ci.yml` matrix
3. **PR:** delete `deep-fuzz` and `full-stress` jobs from `nightly.yml`
4. **PR:** remove `test:fuzz:bridge` and `test:stress:server-authoritative` npm-script aliases from `packages/app/package.json`
5. **PR:** `playwright.config.ts` — `failOnFlakyTests: false`

Can ship as a single PR or split. Expected impact: PR-tier green rate 22% → ~85-90% immediately.

### Phase 2 — FR-1 conversion PBT (4-8h)

6. **PR:** add `packages/app/tests/fidelity/bridge-observer-conversion.test.ts` per FR-1 spec
7. Verify `bun run test:fidelity` picks it up; verify CI runs it in PR-tier `check`

Expected impact: conversion regressions become PR-tier deterministic.

### Phase 3 — FR-5 / FR-6 measurement scripts (3-5h)

8. **PR:** add `packages/app/scripts/measure-fuzz.sh` + `measure-stress.sh`
9. **PR:** add `measure:fuzz` + `measure:stress` npm scripts to `packages/app/package.json`
10. **PR:** initialize `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl` with schema header comment (if JSONL allows) or a README.md in the same dir describing the schema
11. Run `measure:fuzz` + `measure:stress` a few times across representative commits to seed the log with initial baselines

Expected impact: `measure:*` family established; initial baseline data captured.

### Phase 4 — FR-7 AGENTS.md doc updates (30min)

12. **PR:** update §Test layers table (remove fuzz + stress rows); add §Measurement scripts section

### Phase 5 — Amendment to 2026-04-17-e2e-observability-determinism

13. **Evidence amendment:** add `specs/2026-04-17-e2e-observability-determinism/evidence/d-q5-amendment-2026-04-19.md` documenting the `failOnFlakyTests: true` → `false` revisit with operational evidence (component-blocks-v2 agent analysis) and NEW LOCKED decision.

---

## 8) References

### Internal specs

- `specs/2026-04-16-bridge-correctness/`
- `specs/2026-04-17-e2e-observability-determinism/`
- `specs/2026-04-15-server-authoritative-observer-bridge/`
- `specs/2026-04-14-bridge-convergence-under-concurrent-writes/`

### Prior PRs

- PR #206 — Test health; diagnostic JSON for 11% stress race
- PR #212 — `STRESS_SEED` replay (stress triage prerequisite, shipped)

### Research reports

- `reports/three-way-merge-content-preservation/`
- `reports/yjs-14-ecosystem-adoption/`
- `reports/collab-editor-silent-loss-ux-patterns/`
