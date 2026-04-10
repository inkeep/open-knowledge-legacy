# Evidence: D4 — Performance Comparison

**Dimension:** Benchmarks, build time, query latency, recall at various scales
**Date:** 2026-04-05
**Sources:** sqlite.org/vec1/doc/trunk/doc/vec1test.md, alexgarcia.xyz, marcobambini.substack.com

---

## Key pages referenced

- https://sqlite.org/vec1/doc/trunk/doc/vec1test.md — Vec1 performance tests
- https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html — sqlite-vec v0.1.0 benchmarks
- https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite — sqlite-vector vs sqlite-vec benchmarks

---

## Findings

### Finding: Vec1 benchmarks show strong ANN performance on standard datasets (pre-release)
**Confidence:** CONFIRMED (self-reported, described as "not-too-rigorous")
**Evidence:** https://sqlite.org/vec1/doc/trunk/doc/vec1test.md

**Datasets tested:**

| Dataset | Vectors | Dimensions | Training Time | Build Time |
|---------|---------|------------|---------------|------------|
| sift1m | 1,000,000 | 128 | 2.34s | 1.27s |
| imagenet-clip-512 | 1,281,167 | 512 | 30.2s | 8.18s |
| landmark-dino-768 | 760,757 | 768 | 44.3s | 8.79s |
| agnews-mxbai-1024 | 769,382 | 1,024 | 63.8s | 13.2s |

**Query throughput (QPS):**

| Dataset | QPS range | Notes |
|---------|-----------|-------|
| sift1m (128-dim) | 1,123–6,806 | Varies with K=1–300, nprobe=16–64 |
| imagenet-clip-512 | 347–1,716 | |
| landmark-dino-768 | 294–1,356 | |
| agnews-mxbai-1024 | 290–1,329 | |

**Recall metrics:**

| Recall type | Range across all datasets |
|-------------|--------------------------|
| Recall@1 | 0.463–0.998 |
| Recall@10 | 0.554–0.997 |

Higher K and nprobe yield better recall but lower throughput. The recall-throughput tradeoff is tunable.

**Note:** Dan Kennedy characterized these as "not-too-rigorous" tests. No memory usage data provided. Hardware specs not visible in the fetched content.

---

### Finding: sqlite-vec brute-force benchmarks at 100K vectors show 11-214ms query latency
**Confidence:** CONFIRMED
**Evidence:** https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html

On 100,000 vectors:

| Dimensions | Query time (float32) | Query time (binary quantized) |
|------------|---------------------|-------------------------------|
| 128 | ~11ms | ~1ms |
| 384 | ~50ms | ~3ms |
| 768 | ~94ms | ~10ms |
| 1536 | ~160ms | ~40ms |
| 3072 | ~214ms | ~124ms |

At 1,000,000 vectors, 3072-dim: **8.52 seconds** (brute-force)

These are exact (recall = 1.0) results — brute-force guarantees perfect recall.

Community-reported practical ceiling: ~250K embeddings for sub-100ms queries on standard hardware (from issue #25 discussions).

---

### Finding: Third-party benchmark (Marco Bambini / sqlite-vector) shows sqlite-vec performance characteristics
**Confidence:** CONFIRMED (vendor-sourced — Bambini is creator of sqlite-vector, potential bias)
**Evidence:** https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite

On 100,000 FLOAT32 vectors, 384 dimensions, Apple M1 Pro:

| Metric | sqlite-vec | sqlite-vector |
|--------|-----------|---------------|
| Insert time | 1179.07 ms | 563.04 ms |
| Full-scan query | 67.84 ms | 56.65 ms |
| With quantization | N/A | 17.44 ms |
| Quantized + preloaded | N/A | 3.97 ms |

Bambini claims sqlite-vector is "~17x faster" with quantization + preloading at perfect recall.

**Bias flag:** Marco Bambini is the creator of sqlite-vector (SQLite.ai). The benchmarks compare his own product favorably. sqlite-vec's quantized query mode was not tested (marked N/A), which is an unfair comparison since sqlite-vec does support binary quantization that would significantly reduce query time.

---

### Finding: No direct Vec1 vs sqlite-vec benchmark exists
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched: "vec1 vs sqlite-vec benchmark", "vec1 sqlite-vec performance comparison", SQLite forum threads, GitHub issues

No published benchmark directly compares Vec1 and sqlite-vec performance. This is expected since Vec1 is pre-release and sqlite-vec's ANN is alpha.

However, we can make architectural inferences:
- At <250K vectors: sqlite-vec brute-force is likely faster (no training overhead, exact results, ~50ms for 384-dim)
- At 1M+ vectors: Vec1's IVFADC should dramatically outperform sqlite-vec's brute-force (1,000+ QPS vs seconds-per-query)
- sqlite-vec's DiskANN alpha is untested publicly — performance characteristics unknown

---

### Finding: Vec1 training is an additional upfront cost not present in sqlite-vec
**Confidence:** CONFIRMED
**Evidence:** Vec1 test results

Training times scale with dataset size and dimensions:
- 128-dim, 1M vectors: 2.34s training + 1.27s build = ~3.6s total
- 1024-dim, 769K vectors: 63.8s training + 13.2s build = ~77s total

sqlite-vec (brute-force) and sqlite-vec DiskANN have no upfront training requirement. DiskANN builds incrementally.

This training cost matters for dynamic datasets where vectors are frequently added — the index must be rebuilt or the new vectors won't be indexed.

---

## Gaps / follow-ups

- No sqlite-vec DiskANN benchmarks available (alpha too new)
- Vec1 memory usage not documented
- No benchmarks on metadata-filtered queries for either extension
- Hardware specifications for Vec1 benchmarks not captured
