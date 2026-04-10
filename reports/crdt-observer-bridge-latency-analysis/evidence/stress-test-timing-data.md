# Evidence: Stress Test Timing Data

**Dimension:** Empirical Latency Measurement
**Date:** 2026-04-09
**Sources:** packages/app/tests/stress/observers.stress.test.ts output, Layer B stress-api.ts output

---

## Key timing data

### Layer A (observer unit stress) — total 427s for 34 tests

| Scenario | Tier | Elapsed (ms) | Notes |
|----------|------|-------------|-------|
| S1 | small-realistic (500L) | 506 | Single agent write propagation |
| S1 | medium-realistic (2000L) | 504 | |
| S1 | large-realistic (10KL) | 7,449 | **14x slower than medium** |
| S8 | small-realistic (500L) | 502 | Unicode variant |
| S8 | medium-realistic (2000L) | 504 | |
| S8 | large-realistic (10KL) | 7,265 | |
| S9 | medium-realistic (2000L) | 1,017 | Restored doc (2 observer setups) |
| S5b | small-realistic (100 writes at ~1ms) | 1,131 | High-throughput burst |
| S5-ASCII | large-realistic (10KL) | 37,386 | **5 writes × 10KL — dominates suite** |
| S5-Unicode | large-realistic (10KL) | 36,783 | |

### Layer B (HTTP + server-side CRDT) — total ~620s for 12 tests

| Scenario | Tier | Elapsed (ms) | Notes |
|----------|------|-------------|-------|
| S1 | small-realistic | 2,574 | Includes WebSocket connect overhead |
| S1 | medium-realistic | 2,779 | |
| S1 | large-realistic | 8,311 | |
| S3 (undo N=5) | large-realistic | 172,225 | **5 writes + 5 undos at 10KL = 172s** |
| S5 (rapid) | large-realistic | 362,953 | **5 rapid writes at 10KL = 363s** |
| S8 (unicode) | small-realistic | 2,528 | |

### Breakdown analysis

**Wait time budget per test (Layer A):**
- Each test uses `await wait(500)` after operations
- With ~2 waits per test: 34 tests × 2 × 500ms = 34s pure waiting
- Remaining ~393s is computation + observer processing

**Large-realistic (10KL) scaling factor:**
- S1 small→medium: 506→504ms (flat — ~0.5s baseline regardless of content size up to 2KL)
- S1 medium→large: 504→7,449ms (**14.8x** — non-linear scaling from 2KL to 10KL)
- This suggests O(N²) behavior in the pipeline, NOT O(N)

**Computation vs wait at large-realistic:**
- S1 at 10KL: 7,449ms total, ~500ms wait → ~6,949ms computation
- Primary bottleneck candidates: mdManager.serialize (tree→markdown), mdManager.parse (markdown→tree), updateYFragment (tree diff), diffLines (text diff)

---

## Findings

### Finding: Large-realistic tier shows non-linear scaling
**Confidence:** CONFIRMED
**Evidence:** S1 small (506ms) → medium (504ms) → large (7449ms) — 14.8x jump from 2KL to 10KL

### Finding: Rapid sequential writes at large scale are extremely expensive
**Confidence:** CONFIRMED  
**Evidence:** S5-ASCII large-realistic = 37,386ms for 5 writes. Each write triggers full parse + serialize + tree rebuild cycle.

### Finding: Server-side (Layer B) adds ~2s overhead per scenario
**Confidence:** CONFIRMED
**Evidence:** S1 Layer A small = 506ms vs S1 Layer B small = 2,574ms. Difference = ~2s for WebSocket connect + HTTP round-trip + sync.

### Finding: The 300ms TYPING_DEFER_MS is not the dominant cost at scale
**Confidence:** INFERRED
**Evidence:** At 10KL, computation takes 6.9s — the 300ms defer is <5% of the total. At small scale (500L), the 500ms wait dominates and defer is significant (~60% of budget).

---

## Gaps / follow-ups

* Need per-function profiling (mdManager.serialize vs mdManager.parse vs updateYFragment vs diffLines) to identify the actual bottleneck function
* The 14.8x scaling factor suggests O(N²) in one of the pipeline stages — likely diffLines or updateYFragment
