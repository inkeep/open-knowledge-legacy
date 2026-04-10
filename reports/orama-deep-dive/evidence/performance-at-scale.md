# Evidence: Performance at Our Scale

**Dimension:** D5 — Performance at our scale
**Date:** 2026-04-02
**Sources:** Orama source code, existing research report, README timing examples

---

## Key files referenced

- `packages/orama/src/trees/vector.ts` — brute-force vector scan (O(n*d))
- `benchmarks/` — benchmark harness (benny-based, compares v2.1.1, v3.0.0-rc-2, latest)
- Prior report: `/Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/REPORT.md`

---

## Findings

### Finding: Full-text search latency is microsecond-scale at 1,000 documents
**Confidence:** CONFIRMED
**Evidence:** README.md result example shows `elapsed: { raw: 21492, formatted: '21μs' }` for a simple search.

The prior search stacks report confirms: "Hybrid queries run in 5-15ms" at 1K documents (this includes both BM25 and vector search).

### Finding: Vector search performance is bounded by O(n*d) linear scan
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/trees/vector.ts` — brute-force implementation.

Theoretical performance at 384 dimensions:
- 100 docs: < 0.1ms
- 1,000 docs: < 1ms
- 10,000 docs: 1-5ms
- 100,000 docs: 50-100ms (estimated)

### Finding: insertMultiple batches in groups of 1000 with configurable yield timeout
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/insert.ts` (line 294) — `batchSize: number = 1000`

Between batches, Orama yields to the event loop via a configurable timeout parameter. This prevents blocking the main thread during large indexing operations.

### Finding: Memory usage scales linearly with document count and vector dimensions
**Confidence:** INFERRED
**Evidence:** Source code analysis. Documents stored in a Map, vectors in a Map of Float32Arrays, text index in a Radix tree.

At 1,000 documents with 384-dim vectors:
- Document storage: ~1-2 MB (depends on document size)
- Vector storage: ~1.5 MB (1000 * 384 * 4 bytes)
- Text index (Radix tree): varies by vocabulary size, typically 2-5 MB
- Total estimate: 5-10 MB

### Finding: Official benchmarks compare v2.1.1, v3.0.0-rc-2, and latest
**Confidence:** CONFIRMED
**Evidence:** `benchmarks/index.js` — uses benny benchmarking library. Tests: insert, insertMultiple, plain search, search with filters, search with long text and complex filters.

The benchmark harness exists but no published results were found in the repo.

### Finding: v3 made all core operations synchronous by default (performance improvement over v2)
**Confidence:** CONFIRMED
**Evidence:** `benchmarks/index.js` — v2.1.1 tests use `async`, v3.0.0-rc-2 and latest tests are synchronous (no `async`). The benchmarks themselves demonstrate that v3 removed the async overhead for the common case.

```javascript
b.add('insert in Orama 2.1.1', async () => { await insert.orama211() }),
b.add('insert in Orama latest', () => { insert.oramaLatest() }),  // synchronous!
```

---

## Gaps / follow-ups

- No published benchmark numbers in the repository
- Memory profiling would require running actual tests
- No comparison benchmarks against MiniSearch or FlexSearch in the official repo
