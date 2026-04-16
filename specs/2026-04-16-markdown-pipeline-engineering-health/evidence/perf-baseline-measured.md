# Evidence: Measured Perf Baseline

**Dimension:** Current-state TS parse + serialize latency
**Date:** 2026-04-16
**Source:** R1 benchmark harness (`packages/core/tests/perf/markdown-bench.test.ts`) + matching intermediate-count run
**Corpus:** `packages/core/src/markdown/fixtures/perf/<count>.md` — seeded synthetic
corpus (R18) at the canonical block-type mix
(40% paragraph / 25% heading / 15% list / 10% code / 5% table / 5% MDX)
**Branch:** `spec/markdown-pipeline-engineering-health`
**HEAD:** current worktree HEAD (see accompanying `results.<timestamp>.json`)

---

## Methodology (pinned)

- Warm-up: 10 iterations per (op, blockCount), discarded.
- Measured runs: 10 per op, each preceded by `Bun.gc(true)`.
- Timer: `performance.now()` deltas.
- Runner: local Apple-silicon (darwin-arm64), `bun@1.3.11` (matches `package.json` `packageManager`).
- Harness: `RUN_BENCH=1 bun test packages/core/tests/perf/markdown-bench.test.ts`
- Intermediate counts (500, 2500) measured under the same methodology via a
  one-off invocation — see block-count notes below. Primary counts (100/1K/5K/10K/20K)
  are those the committed harness and R4 regression gate consume.

The canonical harness emits a machine-readable `results.<timestamp>.json`
with per-count `{p50, p95, p99, mean, min, max}` samples and runner
metadata (CPU, RAM, git sha, bun version). Committed markdown here is
the human summary; the JSON is the definitive record.

---

## Baseline results (7 block counts)

| Blocks | Doc size (chars) | Parse p50 | Parse p99 | Serialize p50 | Serialize p99 |
|-------:|-----------------:|----------:|----------:|--------------:|--------------:|
| 100    | 20,293    | 8.7 ms    | 9.1 ms    | 1.8 ms        | 2.2 ms        |
| 500    | 97,718    | 48.0 ms   | 54.1 ms   | 7.6 ms        | 8.4 ms        |
| 1,000  | 194,243   | 98.6 ms   | 104.0 ms  | 17.1 ms       | 17.7 ms       |
| 2,500  | 479,545   | 239.8 ms  | 251.1 ms  | 42.5 ms       | 49.9 ms       |
| 5,000  | 952,068   | 523.4 ms  | 555.1 ms  | 96.8 ms       | 105.7 ms      |
| 10,000 | 1,902,300 | 1,233.2 ms | 1,286.2 ms | 234.0 ms   | 249.0 ms      |
| 20,000 | 3,837,177 | 3,465.7 ms | 3,557.6 ms | 655.4 ms   | 677.5 ms      |

### Scaling analysis — parse

| Transition | Block ratio | Time ratio (p50) | Linear | Verdict |
|------------|-------------|------------------|--------|---------|
| 100 → 1K   | 10×         | 98.6 / 8.7  ≈ 11.3× | 10× | near-linear |
| 1K → 5K    | 5×          | 523.4 / 98.6 ≈ 5.3× | 5×  | near-linear |
| 1K → 10K   | 10×         | 1233.2 / 98.6 ≈ 12.5× | 10× | mildly super-linear |
| 10K → 20K  | 2×          | 3465.7 / 1233.2 ≈ 2.81× | 2× | **super-linearity intensifies** |

Serialize scales roughly linearly through 10K and starts to slip at 20K
(655 / 234 = 2.8× for a 2× block ratio).

**Implication.** The knee of the curve is in the 5K-10K range for parse.
At 20K, both parse and serialize exhibit clear super-linear behavior.
R3a's per-stage profile will identify which stage dominates; early
inspection suggests `remarkParse` (micromark core, upstream) is the
largest share, with plugin-layer costs linear or near-linear.

---

## Contradiction with Rust spec's motivational numbers

| Claim location | Claimed number | Measured here (p50) |
|----------------|----------------|---------------------|
| markdown-engine-rust-bridge SPEC.md:85 (Persona P1) | 460 ms at 10K blocks | **1,233 ms** (2.68× higher) |
| markdown-engine-rust-bridge SPEC.md:41 (Complication) | 165 ms on ~2,350 blocks (3hr transcript) | ~240 ms at 2.5K blocks (1.45× higher) |
| markdown-engine-rust-bridge SPEC.md:151 (Success metric M1) | 460 ms → ~5 ms | Actual current pain is ≈1,233 ms |

The Rust spec's numbers come from `evidence/document-distribution.md`
which explicitly notes "linear extrapolation from project benchmarks."
The linear assumption does not hold — actual scaling is super-linear
past 5K blocks. This baseline is the ground truth the sister spec
should cite once it re-enters active iteration (see §Non-functional
"sister-spec coordination").

---

## Likely culprits (pending R3a profile)

`reports/crdt-observer-bridge-latency-analysis/REPORT.md` identifies
`diffLines` / jsdiff as having catastrophic worst-case behavior. That
report concerns the bridge, not the parse pipeline — but the same
super-linear signature shows up here.

Concrete in-tree suspects to be profiled by R3a:

- `remarkParse` (micromark core — upstream)
- `remark-gfm` (tables reported super-linear upstream — remarkjs#978)
- R23 guard `protectFromMdx`'s per-tag `rest.includes(closeTag)` scan
  (O(n·m); R15 target)
- `position-slice` walker scaling characteristics

`updateYFragment` and bridge-side concerns are out of scope for this
spec.

---

## Reproduction

```bash
# Regenerate the corpus (deterministic; idempotent):
bun run packages/core/src/markdown/fixtures/perf/generate.ts

# Primary counts (R1 harness — committed):
RUN_BENCH=1 bun test packages/core/tests/perf/markdown-bench.test.ts

# Intermediate counts (500, 2500) for curve-shape readability — one-off:
#   (ad-hoc invocation of the same methodology; see git history for the
#    inline snippet used for this baseline.)
```

Any baseline re-run writes a `results.<timestamp>.json` next to the
harness; the JSON is git-ignored (per-run artifact). Promote numbers
into this markdown only when deliberately recalibrating.

---

## Prior ad-hoc numbers (superseded — retained for reference)

The pre-R1 ad-hoc baseline (3-run averages, no warm-up discipline, no
forced GC) is superseded by the table above. Representative earlier
numbers for the curious:

| Blocks | Prior (ad-hoc, avg of 3) | Now (p50, warm + GC-gated) |
|-------:|--------------------------|----------------------------|
| 100    | 9.5 ms  | 8.7 ms  |
| 1,000  | 73.6 ms | 98.6 ms |
| 10,000 | 1,265 ms | 1,233 ms |
| 20,000 | 3,594 ms | 3,466 ms |

The movement at 1K blocks is within expected runner variance — the
pinned-methodology p50 becomes the comparison point for R4 going
forward.
