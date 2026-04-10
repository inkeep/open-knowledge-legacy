---
title: "Vec1 vs sqlite-vec: The SQLite Vector Search Ecosystem in 2026"
description: "Comparative analysis of SQLite's official Vec1 extension (IVFADC with OPQ, built by Dan Kennedy) and the community-standard sqlite-vec (by Alex Garcia, with DiskANN alpha). Covers algorithm design, API surfaces, performance characteristics, ecosystem integration, and adoption guidance for teams choosing SQLite-based vector search."
createdAt: 2026-04-05
updatedAt: 2026-04-05
subjects:
  - Vec1
  - sqlite-vec
  - SQLite
  - Alex Garcia
  - Dan Kennedy
topics:
  - vector search
  - approximate nearest neighbor
  - SQLite extensions
---

# Vec1 vs sqlite-vec: The SQLite Vector Search Ecosystem in 2026

**Purpose:** Map the technical landscape of SQLite vector search after the official Vec1 extension's announcement, understand how it relates to the community-standard sqlite-vec, and provide factual grounding for teams evaluating SQLite-based vector search solutions.

---

## Executive Summary

The SQLite vector search ecosystem entered a pivotal moment in early 2026 when Dan Kennedy — a core SQLite developer who built FTS3 and FTS5 — announced [Vec1](https://sqlite.org/vec1/doc/trunk/doc/vec1.md), an official SQLite extension for approximate nearest-neighbor (ANN) vector search using IVFADC with Optimized Product Quantization. This arrived while [sqlite-vec](https://github.com/asg017/sqlite-vec), Alex Garcia's community-standard extension, was the established solution with broad ecosystem integration but limited to brute-force search. Five weeks after Vec1's announcement, Garcia shipped sqlite-vec v0.1.10-alpha with DiskANN — its first ANN index.

The two extensions occupy different niches rather than directly competing. Vec1 is a pre-release, scale-oriented ANN solution with 1,000+ queries per second on million-vector datasets but no ecosystem integrations, no WASM support, and limited language bindings. sqlite-vec is a stable, broadly deployed brute-force solution with rich platform coverage (WASM, mobile, all desktop OS), extensive framework integrations (LangChain, Datasette, txtai), and a nascent DiskANN alpha. Neither can fully replace the other today.

**Key Findings:**

- **Vec1 is the first official SQLite vector extension,** built by the developer who created FTS3/FTS5. It uses IVFADC with OPQ, supports metadata filtering inside ANN search, and demonstrates 1,100-6,800 QPS on million-vector datasets in pre-release benchmarks. It is not yet released.
- **sqlite-vec remains the production-ready choice** with stable brute-force search, broad platform support, and extensive ecosystem integration. Its DiskANN alpha (shipped March 31, 2026) signals movement toward ANN but is untested at scale.
- **The extensions are complementary more than competing.** sqlite-vec serves the sub-250K-vector, cross-platform, exact-recall tier. Vec1 targets the 250K-to-millions tier where brute-force fails. Both use different virtual table modules (`vec0` vs `vec1`) and could theoretically coexist in the same database.
- **No direct benchmark comparison exists** between the two extensions. Vec1 publishes preliminary ANN benchmarks; sqlite-vec publishes brute-force benchmarks. Meaningful comparison requires sqlite-vec's DiskANN to mature and Vec1 to ship a release.
- **Alex Garcia has not publicly commented on Vec1.** The timing of sqlite-vec's DiskANN alpha (five weeks after Vec1's announcement) may be coincidental or responsive, but no public statement addresses the relationship.

---

## Research Rubric

**Report Type:** Comparative Analysis
**Primary Question:** How do Vec1 and sqlite-vec compete or complement each other, and what does this mean for the SQLite vector search ecosystem?
**Audience:** Engineers evaluating SQLite-based vector search
**Stance:** Factual-Academic

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Vec1 — overview, author, algorithm, API | Deep | P0 |
| D2 | sqlite-vec — status, ANN roadmap | Deep | P0 |
| D3 | Feature comparison | Deep (comparative) | P0 |
| D4 | Performance comparison | Moderate (quantitative) | P1 |
| D5 | Ecosystem dynamics | Deep | P0 |
| D6 | Adoption implications | Moderate | P1 |

---

## Detailed Findings

### D1: Vec1 — What It Is

**Finding:** Vec1 is an official SQLite extension for ANN vector search, built by Dan Kennedy (core SQLite developer since 2002, author of FTS3/FTS5), using IVFADC with Optimized Product Quantization.

**Evidence:** [evidence/d1-vec1-overview.md](evidence/d1-vec1-overview.md)

Vec1 was [announced on the SQLite Forum](https://sqlite.org/forum/info/ceba048877c35c8e5a27e507d900a8f8727c4e546ad7f4eb74b52cea42a36db7) on February 26, 2026 by Dan Kennedy. It is hosted at sqlite.org/vec1, making it an official SQLite project — not a community extension. Kennedy has contributed nearly as much code to SQLite as its creator Richard Hipp, and is responsible for FTS3, FTS5, window functions, and JSON support.

The core algorithm is **IVFADC (Inverted File with Asymmetric Distance Computation)** with optional **OPQ (Optimized Product Quantization)**:

- **IVF** partitions vectors into buckets via k-means centroids. At query time, only the nearest buckets are searched (controlled by the `nprobe` parameter — e.g., 5% of total buckets).
- **ADC** computes distances between the full (uncompressed) query vector and compressed database vectors, avoiding the information loss of compressing the query.
- **OPQ** rotates vectors before quantization, improving compression quality for neural network embeddings.

The API follows SQLite's virtual table pattern:

```sql
-- Create table with metadata columns
CREATE VIRTUAL TABLE products USING vec1(vector, price, category);

-- Train model from representative data
SELECT vec1_train(vector, '{codesize:16, nbucket:1024, distance:"cos", opq:true}')
FROM training_set;

-- Build index
INSERT INTO products(cmd, arg) VALUES('rebuild', :trained_model);

-- Query with ANN parameters
SELECT rowid FROM products(:query_vec, '{k:10, nprobe:0.05}');
```

Vec1 also supports an exact-search (NN) mode — with optional "flat" packing for ~2x speedup — making training optional for small datasets (<5,000 vectors per the documentation's guidance).

**Current status (as of April 2026):** Pre-release. All documented features are implemented. Remaining work before first release: ARM NEON SIMD parity with AVX2, testing (characterized by Kennedy as "woefully inadequate"), and optimization across all code paths. No release date has been announced.

**Decision triggers:**
- Vec1 becomes critical when datasets exceed the brute-force ceiling (~250K vectors) and IVFADC's recall-speed tradeoff is acceptable
- Vec1 is less relevant for WASM, mobile, or non-Python/C environments (no support for these platforms yet)

---

### D2: sqlite-vec — Current Status and ANN Roadmap

**Finding:** sqlite-vec is the established community standard for SQLite vector search (stable since August 2024), with broad platform and framework support. Its first ANN index (DiskANN) shipped as an alpha on March 31, 2026.

**Evidence:** [evidence/d2-sqlite-vec-status.md](evidence/d2-sqlite-vec-status.md)

sqlite-vec v0.1.0 launched in August 2024 as a successor to sqlite-vss, which suffered from Faiss dependency issues (platform restrictions, memory constraints, compilation difficulty). Garcia rewrote the extension in pure C with no dependencies under MIT/Apache-2.0 dual license.

**Stable capabilities (v0.1.9):**
- Vector types: float32, int8, bit
- Distance metrics: L2, cosine, Hamming
- Brute-force KNN with metadata filtering (boolean, integer, float, text columns)
- Partition keys for ~3x filtering speedup
- Binary quantization (`vec_quantize_binary()`) for 32x space reduction
- Language bindings: Python, Node.js, Ruby, Rust, Go, C/C++
- Platforms: Linux, macOS, Windows, WASM, iOS, Android
- Integrations: [LangChain](https://docs.langchain.com/oss/python/integrations/vectorstores/sqlitevec), Datasette, sqlite-utils, txtai, rqlite

**ANN alpha (v0.1.10-alpha, March 31, 2026):**
- DiskANN: First ANN index, leveraging SQLite's B-tree structure
- IVF: Experimental, disabled in current builds
- Rescore: Available
- Known issue: DELETE operations on DiskANN are expensive (noted as fixable in later releases)

Garcia's [original ANN roadmap](https://github.com/asg017/sqlite-vec/issues/25) (October 2024) planned IVF first, then DiskANN. The actual execution reversed this order and shipped roughly 15 months later than the original December 2024/January 2025 target.

**Decision triggers:**
- sqlite-vec is the clear choice when production stability, broad platform coverage, or framework integration matters today
- The DiskANN alpha is too new for production use — no benchmarks, no documentation, known issues with deletes

---

### D3: Feature Comparison

**Finding:** Vec1 and sqlite-vec make different technical tradeoffs. Vec1 is stronger on ANN search, multi-threading, and streaming. sqlite-vec is stronger on vector type breadth, platform coverage, quantization options, and ecosystem integration.

**Evidence:** [evidence/d3-feature-comparison.md](evidence/d3-feature-comparison.md)

| Feature | Vec1 | sqlite-vec (stable) | sqlite-vec (alpha) |
|---|---|---|---|
| Vector types | float32 | float32, int8, bit | float32, int8, bit |
| Distance: L2 | Yes | Yes | Yes |
| Distance: Cosine | Yes | Yes | Yes |
| Distance: Hamming | No | Yes (bit) | Yes (bit) |
| ANN: IVFADC | Yes (core) | No | No |
| ANN: DiskANN | Roadmap | No | Alpha |
| Product Quantization (OPQ) | Yes | No | No |
| Binary Quantization | Roadmap | Yes | Yes |
| Training required (ANN) | Yes | N/A | No (DiskANN) |
| Metadata filtering in ANN | Yes (integrated) | Post-hoc | Unknown |
| Streaming results | Yes | No | No |
| Multi-threading | Yes (configurable) | No | No |
| WASM | Planned | Yes | Yes |
| Mobile (iOS/Android) | Not documented | Yes | Yes |
| Language bindings | Python (APSW) | Python, Node, Ruby, Rust, Go, C | Same |
| License | Public domain | MIT / Apache-2.0 | MIT / Apache-2.0 |

**API design divergence:** The two extensions use fundamentally different query patterns. Vec1 uses table-valued function syntax (`SELECT FROM tbl(:vec, '{k:10}')`), while sqlite-vec uses WHERE clause matching (`WHERE embedding MATCH :vec AND k = 10`). This is not just a syntactic difference — it affects how the query planner interacts with the extension and how metadata filtering integrates.

**Metadata filtering architecture:** Vec1 evaluates metadata filters *inside* the ANN search (during bucket scanning with comparison operators), which is architecturally more efficient at scale. sqlite-vec's current metadata filtering visits every row — functional but potentially slow on large datasets, even with partition key acceleration.

**Remaining uncertainty:** sqlite-vec's alpha DiskANN behavior with metadata filtering is not yet documented. If DiskANN integrates filtering efficiently, this could narrow the gap with Vec1.

---

### D4: Performance

**Finding:** Vec1 demonstrates 1,100-6,800 QPS on million-vector datasets with tunable recall (0.46-0.998). sqlite-vec brute-force handles 100K vectors in 11-214ms with perfect recall. No direct comparison exists between the two.

**Evidence:** [evidence/d4-performance.md](evidence/d4-performance.md)

**Vec1 benchmarks** (pre-release, self-reported as "not-too-rigorous"):

| Dataset | Vectors | Dimensions | QPS | Recall@10 range |
|---------|---------|------------|-----|-----------------|
| sift1m | 1M | 128 | 1,123-6,806 | 0.554-0.997 |
| imagenet-clip-512 | 1.28M | 512 | 347-1,716 | varies |
| landmark-dino-768 | 761K | 768 | 294-1,356 | varies |
| agnews-mxbai-1024 | 769K | 1,024 | 290-1,329 | varies |

Training overhead: 2.3s (128-dim, 1M vectors) to 64s (1024-dim, 769K vectors). Build time: 1.3s to 13.2s.

**sqlite-vec benchmarks** (stable brute-force, 100K vectors):

| Dimensions | Query time (float32) | Query time (binary) |
|------------|---------------------|---------------------|
| 128 | ~11ms | ~1ms |
| 384 | ~50ms | ~3ms |
| 768 | ~94ms | ~10ms |
| 1536 | ~160ms | ~40ms |
| 3072 | ~214ms | ~124ms |

At 1M vectors with 3072 dimensions: 8.52 seconds per query. Community-reported practical ceiling: ~250K vectors for sub-100ms response.

**The comparison is fundamentally asymmetric:** sqlite-vec's brute-force guarantees perfect recall (1.0) but scales linearly with dataset size. Vec1's IVFADC trades recall for throughput via the nprobe parameter. At 100K vectors, sqlite-vec's brute-force may be faster (no training overhead, exact results). At 1M+ vectors, Vec1's ANN is orders of magnitude faster.

No published benchmark directly compares the two extensions. sqlite-vec's DiskANN alpha has no published performance data yet.

---

### D5: Ecosystem Dynamics

**Finding:** Vec1 and sqlite-vec are more complementary than competing. They serve different scale tiers, have different maturity profiles, and occupy different ecosystem positions. Garcia has not publicly commented on Vec1.

**Evidence:** [evidence/d5-ecosystem-dynamics.md](evidence/d5-ecosystem-dynamics.md)

**The FTS parallel is the most instructive lens.** Dan Kennedy built FTS3 and FTS5, which became standard compile-time options in SQLite. Vec1 follows the identical pattern: same developer, same virtual table interface, same hosting at sqlite.org. If Vec1 follows the FTS trajectory, it could eventually ship as a built-in SQLite component. No public statement from the SQLite team confirms this, but the structural parallel is strong.

**sqlite-vec's ecosystem moat is substantial.** Language bindings in six languages, framework integrations with LangChain, Datasette, txtai, and rqlite, plus WASM and mobile support create significant switching costs. Vec1 currently has Python distribution via APSW and source compilation — nothing comparable.

**A third player complicates the landscape.** [sqlite-vector](https://github.com/sqliteai/sqlite-vector) by Marco Bambini (SQLite.ai) offers broader vector type support (float16, bfloat16, int8, uint8, 1bit) and claims 17x faster queries than sqlite-vec with quantization. However, its Elastic License 2.0 restricts production and managed-service use, limiting it primarily to SQLite Cloud's commercial ecosystem.

**The timeline is suggestive but inconclusive.** Vec1 was announced February 26, 2026. sqlite-vec's DiskANN alpha shipped March 31, 2026 — five weeks later. Whether Garcia accelerated DiskANN development in response to Vec1 or this was coincidental is unknown; Garcia has made no public comment about Vec1 across any platform examined (blog, GitHub, forums, social media).

**Ecosystem position summary:**

| Extension | Scale tier | Maturity | Ecosystem | License |
|-----------|-----------|----------|-----------|---------|
| sqlite-vec | <250K vectors | Stable (2 years) | Rich | MIT/Apache |
| Vec1 | 250K-millions | Pre-release | Minimal | Public domain |
| sqlite-vector | <250K (optimized brute-force) | Active | Limited | Elastic 2.0 |

---

### D6: Adoption Implications

**Finding:** Teams should choose based on dataset scale, platform requirements, maturity tolerance, and framework needs. The extensions can coexist and serve complementary roles.

**Evidence:** [evidence/d6-adoption-implications.md](evidence/d6-adoption-implications.md)

**Use sqlite-vec today when:**
- Production stability is required (it has been stable for 2 years)
- Dataset is under ~250K vectors
- WASM, mobile, or non-Python language bindings are needed
- Framework integration matters (LangChain, Datasette, etc.)
- Exact recall (1.0) is required
- Quick prototyping — no training workflow needed

**Plan for Vec1 when:**
- Dataset exceeds 250K vectors and will continue growing
- Approximate recall is acceptable for the use case
- The deployment environment is server/desktop (x86 or ARM, not WASM/mobile)
- Official SQLite provenance matters (enterprise compliance, long-term maintenance)
- Metadata-filtered ANN at scale is a requirement

**Consider both when:**
- Dataset will grow from small (sqlite-vec suitable) to large (Vec1 needed)
- Different collections in the same database have different scale characteristics
- Both `vec0` and `vec1` virtual table modules can be loaded in the same SQLite connection since they use different module names

**Watch for:**
- sqlite-vec's DiskANN maturity — if it reaches production quality with good recall-throughput tradeoffs, it could serve the medium-scale tier (250K-1M vectors) that Vec1 currently targets, reducing the need for Vec1's training-heavy workflow
- Vec1's first release — ecosystem integration (language bindings, framework support) after release will determine adoption speed
- Potential Vec1 bundling with SQLite core — if this happens (following the FTS pattern), it would fundamentally change the calculus since every SQLite deployment would include vector search

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D4 (Performance):** No direct benchmark comparison exists. Vec1's benchmarks are self-reported and "not-too-rigorous." sqlite-vec's DiskANN has no published benchmarks. A meaningful comparison requires both extensions to reach production maturity.
- **D5 (Ecosystem Dynamics):** Alex Garcia has not publicly commented on Vec1. The relationship between the two projects' development teams remains opaque.

### Remaining Uncertainty

- Vec1's release timeline is unknown. "Getting closer" (March 2026) provides no concrete date.
- sqlite-vec's DiskANN recall and throughput characteristics at scale are entirely unknown.
- Whether Vec1 will follow the FTS path toward SQLite core bundling is speculative.
- The coexistence pattern (loading both `vec0` and `vec1` in one connection) is untested.

### Out of Scope

- Non-SQLite vector databases (Pinecone, Qdrant, Chroma, etc.)
- Embedding model selection and quality
- SQLite fork approaches (libSQL/Turso's built-in DiskANN)
- Detailed code-level analysis of either extension's implementation

---

## References

### Evidence Files
- [evidence/d1-vec1-overview.md](evidence/d1-vec1-overview.md) — Vec1 architecture, API, author, status
- [evidence/d2-sqlite-vec-status.md](evidence/d2-sqlite-vec-status.md) — sqlite-vec stable features, ANN roadmap
- [evidence/d3-feature-comparison.md](evidence/d3-feature-comparison.md) — Side-by-side feature matrix
- [evidence/d4-performance.md](evidence/d4-performance.md) — Benchmark data from both extensions
- [evidence/d5-ecosystem-dynamics.md](evidence/d5-ecosystem-dynamics.md) — Competitive dynamics, community reaction
- [evidence/d6-adoption-implications.md](evidence/d6-adoption-implications.md) — Decision framework

### External Sources
- [Vec1 Documentation](https://sqlite.org/vec1/doc/trunk/doc/vec1.md) — Official Vec1 overview
- [Vec1 API Reference](https://sqlite.org/vec1/doc/trunk/doc/vec1ref.md) — Full API specification
- [Vec1 Tutorial](https://sqlite.org/vec1/doc/trunk/doc/vec1intro.md) — Usage guide with examples
- [Vec1 Performance Tests](https://sqlite.org/vec1/doc/trunk/doc/vec1test.md) — Benchmark results on public datasets
- [Vec1 Forum Announcement](https://sqlite.org/forum/info/ceba048877c35c8e5a27e507d900a8f8727c4e546ad7f4eb74b52cea42a36db7) — Dan Kennedy's initial announcement (2026-02-26)
- [Vec1 Forum Update](https://sqlite.org/forum/info/4977084c38fec29bcc1ac9e80ad4aaffbdcd5a34daf31bc8fb2530729ed654fa) — Status update approaching release
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — Main repository
- [sqlite-vec Releases](https://github.com/asg017/sqlite-vec/releases) — Release history including DiskANN alpha
- [sqlite-vec ANN Tracking Issue](https://github.com/asg017/sqlite-vec/issues/25) — ANN roadmap and algorithm discussion
- [sqlite-vec v0.1.0 Announcement](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) — Garcia's stable release blog post
- [sqlite-vec Design Blog](https://alexgarcia.xyz/blog/2024/building-new-vector-search-sqlite/index.html) — Design philosophy and sqlite-vss successor rationale
- [sqlite-vec Metadata Filtering](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) — Metadata column implementation details
- [sqlite-vec API Reference](https://alexgarcia.xyz/sqlite-vec/api-reference.html) — Full API documentation
- [sqlite-vec Comparison Issue](https://github.com/asg017/sqlite-vec/issues/94) — Community discussion of alternatives
- [State of Vector Search in SQLite](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite) — Bambini's ecosystem analysis (vendor-sourced; author is sqlite-vector creator)
- [sqlite-vector GitHub](https://github.com/sqliteai/sqlite-vector) — Third extension by SQLite.ai
