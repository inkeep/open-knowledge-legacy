# Evidence: D1 — Vec1 Overview

**Dimension:** Vec1 — what is it, who built it, algorithm, API, SQLite versions
**Date:** 2026-04-05
**Sources:** sqlite.org/vec1, SQLite Forum threads, echoglobal.tech

---

## Key pages referenced

- https://sqlite.org/vec1/doc/trunk/doc/vec1.md — Main Vec1 documentation
- https://sqlite.org/vec1/doc/trunk/doc/vec1ref.md — API reference
- https://sqlite.org/vec1/doc/trunk/doc/vec1intro.md — Tutorial / introduction
- https://sqlite.org/vec1/doc/trunk/doc/vec1test.md — Performance tests
- https://sqlite.org/forum/info/ceba048877c35c8e5a27e507d900a8f8727c4e546ad7f4eb74b52cea42a36db7 — Initial Vec1 forum announcement
- https://sqlite.org/forum/info/4977084c38fec29bcc1ac9e80ad4aaffbdcd5a34daf31bc8fb2530729ed654fa — Vec1 update forum post

---

## Findings

### Finding: Vec1 is an official SQLite extension for ANN vector search built by Dan Kennedy
**Confidence:** CONFIRMED
**Evidence:** SQLite Forum post by Dan Kennedy (dan), 2026-02-26

Vec1 was announced on the SQLite User Forum on February 26, 2026 by Dan Kennedy, who is a core SQLite developer and co-author since the early 2000s. Kennedy has implemented critical SQLite features including window functions, JSON support, and the full-text search extensions (FTS3/FTS5).

Vec1 is hosted at sqlite.org/vec1, confirming it is an official SQLite project — not a third-party extension.

**Implications:** Vec1 carries the full weight of the official SQLite team. The developer behind it (Kennedy) wrote FTS3/FTS5, making this a direct parallel: just as FTS became the standard way to do full-text search in SQLite, Vec1 is positioned to become the standard for vector search.

---

### Finding: Vec1 uses IVFADC with OPQ (Inverted File with Asymmetric Distance Computation + Optimized Product Quantization)
**Confidence:** CONFIRMED
**Evidence:** https://sqlite.org/vec1/doc/trunk/doc/vec1.md

> "IVFADC (Inverted File with Asymmetric Distance Computation) with OPQ (Optimized Product Quantization)"

The algorithm works as follows:
- **IVF:** Vectors are assigned to buckets based on nearest centroid (trained via k-means). At query time, only the closest buckets are searched (controlled by `nprobe` parameter).
- **ADC (Asymmetric Distance Computation):** Distances are computed between the full query vector and compressed (product-quantized) database vectors — "asymmetric" because the query is not compressed.
- **OPQ (Optimized Product Quantization):** An optional rotation step that improves compression quality for neural network embeddings by rotating vectors before quantization.

Training parameters:
- `nbucket`: Number of IVF buckets (recommended: sqrt of dataset size, e.g., 1024 for 1M vectors)
- `codesize`: Bytes for PQ codes (8-256, typically 1/8 to 1/16 of dimensions)
- `opq`: Boolean for Optimized Product Quantization rotation
- `distance`: "l2" or "cos"

---

### Finding: Vec1 API uses SQLite virtual tables with training + rebuild workflow
**Confidence:** CONFIRMED
**Evidence:** https://sqlite.org/vec1/doc/trunk/doc/vec1ref.md, vec1intro.md

**Table creation:**
```sql
CREATE VIRTUAL TABLE tbl USING vec1(vector_column, metadata_col1, metadata_col2...);
```
- One vector column required
- 0-255 optional metadata columns
- All rows have unique `rowid` and hidden `distance` column

**Training (for ANN mode):**
```sql
SELECT vec1_train(vector, '{codesize: 16, nbucket: 1024, distance: "cos"}')
FROM training_set;
```
The `vec1_train()` is an aggregate function that generates a trained model from representative vectors.

**Building/Rebuilding the index:**
```sql
INSERT INTO tbl(cmd, arg) VALUES('rebuild', :model);
```

**Querying:**
```sql
SELECT rowid FROM tbl(:v, '{k: 10, nprobe: 0.08}');
```

**Two modes:**
1. **NN (Nearest Neighbor)** — exhaustive search, no training required. Two sub-modes: "none" (individual row storage) and "flat" (packed BLOBs, ~2x faster).
2. **ANN (Approximate Nearest Neighbor)** — requires training, uses IVFADC.

**Scalar functions:**
- `vec1_l2_distance(v1, v2)` — squared Euclidean distance
- `vec1_cos_distance(v1, v2)` — cosine distance
- `vec1_to_json(v)` / `vec1_from_json(j)` — conversion
- `vec1_info()` — version info
- `vec1_config(param, value)` — configuration (nthread, nprobe)

---

### Finding: Vec1 currently supports only float32 vectors with L2 and cosine distance
**Confidence:** CONFIRMED
**Evidence:** https://sqlite.org/vec1/doc/trunk/doc/vec1ref.md

Current: 32-bit IEEE float vectors only. Euclidean (L2) and cosine distance.

Roadmap items listed:
- 8-bit and 32-bit integer support
- 16-bit float support
- Bit-encoding (RaBitQ)
- Dot-product distance
- HNSW or DiskANN alternative algorithms
- WebAssembly SIMD support
- Cross-platform byte-order compatibility
- Partition key support

---

### Finding: Vec1 is pre-release (as of April 2026)
**Confidence:** CONFIRMED
**Evidence:** SQLite Forum, Vec1 documentation

Dan Kennedy stated the extension is "not ready for real use yet" (Feb 2026 announcement). The March 2026 update noted: "There is still no vec1 release, but we are getting closer."

Remaining issues before first release:
1. NEON (ARM) builds lack some SIMD optimizations present in AVX2 (x86) builds
2. Testing is "woefully inadequate"
3. "Almost all code paths need optimization"

No additional features are required before first release — the API and algorithm are feature-complete for v1.

---

### Finding: Vec1 is a single C file with no dependencies
**Confidence:** CONFIRMED
**Evidence:** https://sqlite.org/vec1/doc/trunk/doc/vec1.md

Build:
```
cc -g -O3 -DNDEBUG -mavx2 -mfma vec1.c -shared -fPIC -o vec1.so
```

Uses AVX2+FMA on x86-64, NEON on ARM. Single `vec1.c` file.

---

### Finding: Vec1 supports metadata filtering inside ANN search
**Confidence:** CONFIRMED
**Evidence:** https://sqlite.org/vec1/doc/trunk/doc/vec1intro.md

Metadata columns declared at table creation time:
```sql
CREATE VIRTUAL TABLE vec1products USING vec1(vector, in_stock, price);
```

Metadata filters using comparison operators (< > = >= <= IS) are evaluated *inside* the ANN search, improving efficiency significantly. This is a notable differentiator.

Streaming queries + metadata filtering:
```sql
SELECT vp.rowid, vp.vector
FROM vec1products(:v, '{K:200, streaming:1, nprobe:32}') vp
JOIN products p ON (vp.rowid=p.id)
WHERE p.in_stock AND p.price < 20000
LIMIT 100
```

---

## Gaps / follow-ups

- Exact SQLite version requirements not documented in available sources
- No public benchmarks comparing Vec1 to sqlite-vec directly
- Specific release timeline not announced
