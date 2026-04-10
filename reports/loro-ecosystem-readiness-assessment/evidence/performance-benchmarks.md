# Evidence: Performance Benchmarks

**Dimension:** D8 — Benchmark claims vs reality, document size, memory
**Date:** 2026-04-07
**Sources:** loro.dev/docs/performance, dmonad/crdt-benchmarks, Yjs community, crdt-richtext repo

---

## Key files / pages referenced

- https://loro.dev/docs/performance — Official JS/WASM benchmarks (403 — not accessible)
- https://github.com/dmonad/crdt-benchmarks — Standard CRDT benchmark suite
- https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567 — Performance debate
- https://github.com/loro-dev/crdt-richtext — Richtext-specific benchmarks

---

## Findings

### Finding: Loro claims superior snapshot import performance — 2x faster in v1.6.0
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt (v1.6.0 changelog)

v1.6.0 improvements (snapshot import):
- Shallow snapshot import: 82.82us (v1.6.0) vs 150.67us (v1.0.0)
- Full snapshot import: 201.93us (v1.6.0) vs 466.43us (v1.0.0)

These are Rust-level benchmarks — JS/WASM performance will be slower due to serialization overhead.

### Finding: Loro's architecture preserves full history — different tradeoff than Yjs
**Confidence:** CONFIRMED
**Evidence:** Yjs community discussion, loro.dev docs

Loro preserves complete editing history by default. Yjs uses garbage collection to discard old operations. This creates different performance profiles:

- **Loro**: Larger document size (includes all history), faster time-travel, no GC overhead, O(log N) text operations via B-tree
- **Yjs**: Smaller document size (GC'd), no built-in time-travel, GC adds latency, O(1) amortized text operations

Kevin Jahns (Yjs): "Storing complete history in memory may prove problematic for large documents with extensive editing histories."

Loro's response: History can be moved to "cold storage" via shallow snapshots (snapshot without full history).

### Finding: crdt-richtext benchmarks show competitive raw performance
**Confidence:** CONFIRMED
**Evidence:** crdt-richtext repo benchmarks (M1 MacBook Pro, 2023)

For real-world editing dataset (N=6000 operations):
- Apply time: 176 +/- 10 ms
- Encoding time: 8 +/- 1 ms
- Document size: 127,639 bytes
- Parse time: 11 +/- 0 ms

Note: These are for the standalone crdt-richtext library, not the full loro-crdt. The full library adds overhead from the unified data model.

### Finding: Benchmark reproducibility was disputed
**Confidence:** CONFIRMED
**Evidence:** Yjs community discussion

Kevin Jahns raised concerns:
- "Original benchmarks lacked source code; published results differed significantly from independently reproduced results"
- Disabling Yjs's GC for "fair" comparison was misleading
- WASM-to-JS communication overhead (serialization) is a real cost not always reflected in benchmarks

The Loro team (zxch3n) responded with commit references and explanations for performance shifts, acknowledging that architectural changes prioritizing compatibility over speed affected some benchmarks.

### Finding: WASM boundary crossing adds real overhead
**Confidence:** CONFIRMED
**Evidence:** Yjs community discussion, general WASM knowledge

Every call between JS and WASM crosses a boundary that requires data serialization. For editing workloads with many small operations (individual keystrokes), this overhead can be significant. Yjs's pure-JS approach avoids this entirely.

For batch operations (loading documents, importing snapshots, merging branches), the overhead is amortized and Loro's Rust-level performance dominates.

### Finding: Text operations are O(log N) — good for large documents
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt

Loro uses an internal B-tree structure for text, giving O(log N) complexity for insert/delete operations. The docs state this "significantly outperforms native JavaScript strings on large documents (millions of characters)."

### Finding: MovableList has 80% overhead vs List
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt

"MovableList overhead: approximately 80% slower encode/decode and 50% more memory than List due to move operation support."

This is relevant because MovableList is used for ProseMirror document structure (ProseKit uses LoroMovableList).

---

## Gaps / follow-ups

- No head-to-head JS/WASM benchmark comparison with current Yjs (the benchmark page returned 403)
- Memory usage profiles not available
- Real-world editing workload benchmarks (sustained typing, large concurrent editor sessions) not found
- WASM initialization time not measured
