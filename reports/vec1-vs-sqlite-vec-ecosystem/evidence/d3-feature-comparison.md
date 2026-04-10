# Evidence: D3 — Feature Comparison

**Dimension:** Vec1 vs sqlite-vec on vector types, distance metrics, ANN algorithms, quantization, metadata filtering, API design
**Date:** 2026-04-05
**Sources:** sqlite.org/vec1, alexgarcia.xyz/sqlite-vec, github.com/asg017/sqlite-vec

---

## Key pages referenced

- https://sqlite.org/vec1/doc/trunk/doc/vec1ref.md — Vec1 API reference
- https://sqlite.org/vec1/doc/trunk/doc/vec1intro.md — Vec1 tutorial
- https://alexgarcia.xyz/sqlite-vec/api-reference.html — sqlite-vec API reference
- https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html — sqlite-vec metadata filtering
- https://github.com/asg017/sqlite-vec/issues/25 — ANN tracking issue

---

## Findings

### Finding: Feature comparison matrix (as of April 2026)

**Confidence:** CONFIRMED (each cell sourced from primary docs)

| Feature | Vec1 | sqlite-vec (stable v0.1.9) | sqlite-vec (alpha v0.1.10) |
|---|---|---|---|
| **Vector types** | float32 only | float32, int8, bit | float32, int8, bit |
| **Distance: L2** | Yes | Yes | Yes |
| **Distance: Cosine** | Yes | Yes | Yes |
| **Distance: Hamming** | No | Yes (bit only) | Yes (bit only) |
| **Distance: Dot product** | Roadmap | No | No |
| **Brute-force search** | Yes (NN mode: "none" and "flat") | Yes (primary mode) | Yes |
| **ANN: IVFADC** | Yes (core algorithm) | No | Experimental (disabled) |
| **ANN: DiskANN** | Roadmap | No | Alpha |
| **ANN: HNSW** | Roadmap | No | No |
| **Product Quantization** | Yes (OPQ) | No | No |
| **Binary Quantization** | Roadmap (RaBitQ) | Yes | Yes |
| **Scalar (int8) Quantization** | Roadmap | Yes (native int8 type) | Yes |
| **Training required** | Yes (for ANN mode) | No | No (DiskANN), Yes (IVF) |
| **Metadata filtering** | Yes (inside ANN, comparison ops) | Yes (equality, comparison, IN) | Yes |
| **Partition keys** | Roadmap | Yes | Yes |
| **Metadata column types** | Unspecified (up to 255 cols) | boolean, integer, float, text | boolean, integer, float, text |
| **Streaming results** | Yes (`streaming: 1`) | No | No |
| **Multi-threading** | Yes (`nthread` config) | No | No |
| **Virtual table name** | `vec1` | `vec0` | `vec0` |
| **Reranking support** | Yes (documented pattern) | Manual (JOIN + ORDER BY) | Manual |
| **SIMD** | AVX2+FMA (x86), NEON (ARM) | Platform-specific optimizations | Platform-specific |
| **WASM** | Planned (not yet) | Yes | Yes |
| **Dependencies** | None (single vec1.c) | None (pure C) | None (pure C) |
| **License** | Public domain (SQLite) | MIT / Apache-2.0 | MIT / Apache-2.0 |
| **Language bindings** | Python (via APSW PyPI) | Python, Node.js, Ruby, Rust, Go, C/C++ | Same |
| **Mobile support** | Not documented | iOS, Android | iOS, Android |

**Implications:**
- Vec1 is stronger on ANN (mature IVFADC with PQ compression, multi-threading, streaming)
- sqlite-vec is stronger on vector type breadth (int8, bit), platform coverage (WASM, mobile), ecosystem integrations, and quantization at the storage level
- They are complementary more than directly competing at different scales

---

### Finding: API design philosophies differ significantly
**Confidence:** CONFIRMED
**Evidence:** Both API references

**Vec1 API pattern:**
```sql
-- Create table
CREATE VIRTUAL TABLE t USING vec1(vector, price, category);
-- Train model (aggregate function)
SELECT vec1_train(vector, '{codesize:16, nbucket:1024}') FROM training_data;
-- Build index
INSERT INTO t(cmd, arg) VALUES('rebuild', :model);
-- Query (table-valued function syntax)
SELECT rowid FROM t(:query_vec, '{k:10, nprobe:0.05}');
```

**sqlite-vec API pattern:**
```sql
-- Create table
CREATE VIRTUAL TABLE t USING vec0(embedding float[384], label text);
-- Insert (no training needed)
INSERT INTO t(rowid, embedding, label) VALUES(1, :vec, 'cat');
-- Query (WHERE clause with MATCH)
SELECT rowid, distance FROM t WHERE embedding MATCH :query AND k = 10;
```

Key differences:
1. Vec1 uses table-valued function syntax for queries `FROM tbl(:vec, params)`; sqlite-vec uses WHERE clause with MATCH
2. Vec1 requires explicit training and rebuild for ANN; sqlite-vec builds indexes incrementally
3. Vec1 specifies dimensions implicitly (from first insert); sqlite-vec specifies in schema `float[384]`
4. Vec1's query parameters are JSON; sqlite-vec uses SQL constraints

---

### Finding: Metadata filtering approaches differ
**Confidence:** CONFIRMED
**Evidence:** Vec1 intro doc, sqlite-vec metadata blog post

**Vec1:** Metadata columns declared at table creation. Comparison operators (< > = >= <= IS) evaluated *inside* the ANN search. Up to 255 metadata columns.

**sqlite-vec:** Metadata columns declared in vec0 schema. Supports = != > >= < <= and IN operators. Current implementation "visits every row in the table" — functional but slow on large datasets. Partition keys provide ~3x speedup by pre-filtering.

Vec1's metadata filtering is architecturally integrated into the ANN search (filters during bucket scanning), while sqlite-vec's is applied post-hoc in brute-force mode. This difference matters most at scale.

---

## Gaps / follow-ups

- sqlite-vec alpha DiskANN metadata filtering behavior not documented yet
- Vec1 metadata column types not fully specified in available docs
- No head-to-head benchmark on metadata-filtered queries
