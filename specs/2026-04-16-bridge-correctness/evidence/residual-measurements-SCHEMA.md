# Residual Measurements — JSONL Schema

**File:** `residual-measurements.jsonl` (sibling of this document)
**Established:** 2026-04-19 per `specs/2026-04-19-ci-signal-quality/SPEC.md` FR-6
**Format:** JSON Lines — one self-describing record per line, append-only, committed to git.

The git history of `residual-measurements.jsonl` is the trend record for the architectural CRDT residual race rate. No automated regression detection exists (accepted cost per NG6 of the CI signal quality spec) — analysis is on-demand via `jq` queries.

---

## Producers

| Producer | How invoked | script field |
|----------|-------------|--------------|
| `packages/app/scripts/measure-fuzz.sh` | `bun run measure:fuzz --seeds N --context "..."` (add `--seed-replay SEED` for single-seed replay) | `"deep-fuzz"` |
| `packages/app/scripts/measure-stress.sh` | `bun run measure:stress [--seed N] --context "..."` (duration is hard-coded 30s internally — no `--duration` override) | `"deep-stress"` |

Both scripts append one record per invocation. They write through the same schema so records can be queried uniformly.

---

## Schema — every field, every record

Every record MUST contain these fields. Missing fields are a producer bug.

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `timestamp` | string (ISO 8601 UTC) | `"2026-04-19T14:23:15Z"` | When the run STARTED. Captures the commit hash at that moment and avoids false-positive drift from clock skew between start and end. |
| `commit` | string (short SHA) | `"abc1234"` | Output of `git rev-parse --short HEAD` at run start. Lets readers trace records back to the code state being measured. |
| `script` | string | `"deep-fuzz"` or `"deep-stress"` | Which measurement script produced the record. Fixed vocabulary; extending it requires updating this schema. |
| `seedCount` | number (integer ≥ 0) | `500` | Total runs attempted. For `deep-fuzz` with `--seeds N` this is `N`. For `deep-stress` it is always `1`. For seed-replay runs of the fuzz script (single seed) this is `1`. |
| `seedsFailed` | number (integer, 0 ≤ v ≤ seedCount) | `23` | Runs that produced oracle failures. `rate = seedsFailed / seedCount`. |
| `rate` | number (float, 0 ≤ r ≤ 1, 4-digit precision) | `0.0460` | Pre-computed failure rate. Stored to avoid recomputing on every query and to avoid floating-point divergence between consumers. |
| `invokedBy` | string | `"nick"` | `$USER` at invocation, or `ci-<runner>` if run from CI. Provenance for who drove the measurement. |
| `context` | string (free text, required non-empty) | `"pre-PR-218 baseline"` | Why this measurement was taken. The single most important field for future readers — enforced non-empty by both producers. Examples: `"pre-merge baseline for PR #218"`, `"investigating 2026-04 rate spike"`, `"reproducing CI flake seed=…"`. |
| `failingSeeds` | number array | `[1776559905522, 1776559905600]` | Seeds that produced failures. Replay with `STRESS_FUZZ_SEED=<seed>` (fuzz) or `STRESS_SEED=<seed>` (stress). Max 100 entries per record to bound growth. |
| `durationMs` | number (integer milliseconds) | `8912000` | Wall-clock duration of the invocation (not per-seed). |
| `host` | string | `"local-macos"` | `"local-macos"`, `"local-linux"`, `"ci-<runner-label>"`, or the lowercased kernel name for other platforms. Context for runner-speed interpretation. |
| `bunVersion` | string | `"1.3.11"` | Output of `bun --version`. Implementation drift in the runtime can shift the rate. |
| `extra` | object | `{ "stressSeed": 42, "outcome": "pass" }` | Script-specific fields. Both producers emit `outcome: "pass" \| "fail" \| "crash"` so `jq 'select(.extra.outcome == "fail")'` filters uniformly across them. `deep-fuzz` emits `{ outcome }` only (no extra per-run state beyond the top-level fields). `deep-stress` emits `{ stressSeed: number \| null, outcome }` — `stressSeed` is `null` on a crash-before-banner record where the seed is unknown, and `outcome: "crash"` is the triage filter for those records (distinct from `outcome: "fail"` which has a replayable seed). `outcome` semantics: `"pass"` = RESULT/summary line emitted + seedsFailed == 0; `"fail"` = RESULT line emitted + seedsFailed >= 1; `"crash"` = RESULT line NOT emitted (harness died mid-run). Extending `extra` in either producer does NOT require a schema version bump — readers ignore unknown keys. If a historical record from an early script iteration is ever encountered without `outcome` (the field was added during PR #213 review cycle), treat missing as implicit `"pass"` when `seedsFailed == 0`; the only such records in this repo's history were the in-PR smoke tests, which were backfilled before merge. |

Any field added to records in the future must also be added to this document in the same PR.

---

## Query patterns

### Current rate (last 30 days, fuzz only)

```bash
jq -s '
  map(select(.script == "deep-fuzz" and (.timestamp > ((now - 30*86400) | todate))))
  | if length == 0 then "no records" else (map(.rate) | add / length) end
' specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
```

### Recent rate spikes (>5% rate, most recent first)

```bash
jq -s '
  map(select(.rate > 0.05))
  | sort_by(.timestamp) | reverse
  | map({timestamp, script, seedCount, seedsFailed, rate, context, commit})
' specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
```

### Summary grouped by script

```bash
jq -s '
  group_by(.script)
  | map({
      script: .[0].script,
      runs: length,
      totalSeedCount: (map(.seedCount) | add),
      totalSeedsFailed: (map(.seedsFailed) | add),
      avgRate: (map(.rate) | add / length),
      maxRate: (map(.rate) | max),
      minRate: (map(.rate) | min)
    })
' specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
```

### All records for a given commit (regression investigation)

```bash
COMMIT=abc1234
jq -c "select(.commit == \"$COMMIT\")" \
  specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
```

### 7-day rolling window rate (per script)

```bash
jq -s '
  map(select(.timestamp > ((now - 7*86400) | todate)))
  | group_by(.script)
  | map({
      script: .[0].script,
      runs: length,
      totalSeedCount: (map(.seedCount) | add),
      totalSeedsFailed: (map(.seedsFailed) | add),
      rollingRate: ((map(.seedsFailed) | add) / (map(.seedCount) | add))
    })
' specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
```

Note the rolling-window calculation uses `total-failed / total-attempted` across all seeds in the window — this is mathematically correct for combining runs of different sizes, unlike `avg(rate)` which weights a 10-seed run the same as a 1000-seed run.

---

## When to produce a record

Convention (non-enforced; see NG6 of the spec):

| Trigger | Script | Seed budget |
|---------|--------|-------------|
| Before merging a PR that touches `packages/server/src/server-observers.ts`, `packages/core/src/bridge/**`, or Y.js / Hocuspocus deps in `bun.lock` | `measure:fuzz` | 1000 seeds minimum |
| Investigating a suspected rate shift reported by a team member | `measure:fuzz` | 500-1000 seeds; include prior-commit comparison |
| Reproducing a CI stress flake logged in a PR issue | `measure:stress --seed <N>` | N/A (replay, 1 run) |
| Periodic baseline (informal) | `measure:fuzz` + `measure:stress` | Any cadence |

**Commit discipline:** append the record from the script output, stage the file, and include it in the PR/commit alongside any bridge-related change. Do not let the log drift behind reality.

---

## Rotation policy

The file is append-only and expected to grow slowly (≲100 records per year). Rotation is only needed if growth becomes disruptive:

- **At 1,000 records or 1 MB** (whichever first): rename to `residual-measurements-YYYY.jsonl` matching the first record's year, start a fresh `residual-measurements.jsonl`.
- Update this schema doc to list the rotated files under a "Historical archives" section.
- Do not prune records — they are evidence.

---

## Non-goals

- **No automated threshold alerting.** Rate drift goes unnoticed until a human queries. Per NG6 of the CI signal quality spec, this is accepted.
- **No web dashboard.** The JSONL + `jq` shell ergonomics are the UI. If the dataset ever warrants richer visualization, add a read-only rendering in the docs site — do not replace the JSONL as the source of truth.
- **No CI writing to this file.** Only ad-hoc developer invocation appends. If CI-side measurement is ever re-introduced, route through a separate log to avoid conflating automated and human-observed samples.
