# Evidence: Performance Comparison

**Dimension:** D8 — Performance comparison (Automerge vs Yjs)
**Date:** 2026-04-07
**Sources:** https://github.com/dmonad/crdt-benchmarks, https://automerge.org/blog/automerge-3/, https://biggo.com/news/202508071934_Automerge_3.0_Memory_Improvements

---

## Findings

### Finding: Automerge 3.0 (July 2025) dramatically improved memory — from 700MB to 1.3MB for Moby Dick
**Confidence:** CONFIRMED
**Evidence:** https://automerge.org/blog/automerge-3/

Automerge 3.0 rearchitected to use compressed representation at runtime. Prior versions decompressed the full operation history into memory. Key metrics:
- Moby Dick document: 700MB → 1.3MB (538x reduction)
- Load time for large documents: 17 hours → 9 seconds

### Finding: Yjs still has smaller bundle size — 69KB vs 1.7MB (Automerge WASM)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/dmonad/crdt-benchmarks README

| Metric | Yjs 13.6.11 | Automerge 2.1.10 |
|--------|-------------|------------------|
| Bundle size | 69 KB (20.1 KB gzip) | 1.7 MB (604 KB gzip) |
| Avg update size (B1.1) | 27 bytes | 121 bytes |
| Doc size (B1.1) | 6,031 bytes | 3,992 bytes |
| Parse time (B1.1) | 32 ms | 80 ms |

Note: These benchmarks are for Automerge 2.x, not 3.x. Automerge 3.0's improvements may change the memory and parse time numbers significantly.

### Finding: Automerge produces smaller encoded documents but larger update messages
**Confidence:** CONFIRMED
**Evidence:** crdt-benchmarks README

Automerge's encoded document size (3,992 bytes) is smaller than Yjs's (6,031 bytes) for the B1.1 benchmark. This is because Automerge's columnar encoding is more efficient for document snapshots. However, individual update messages are 4.5x larger (121 vs 27 bytes), which means more network traffic per keystroke.

### Finding: Automerge stores full operation history — documents grow linearly with edit count
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis

Automerge's design stores the complete DAG of editing history. This enables features like version history and branching but means document size grows linearly with the number of edits. Yjs can discard history (gc'd) to keep document size proportional to content size.

For a knowledge editor with long-lived documents edited frequently, this is a significant difference. A 10KB markdown document with 100,000 edits would be much larger in Automerge than in Yjs (with garbage collection).

### Finding: The 1.7MB WASM bundle is a practical concern for browser applications
**Confidence:** CONFIRMED
**Evidence:** Bundle size data

Automerge's core is implemented in Rust and compiled to WASM. The ~1.7MB uncompressed (604KB gzipped) bundle adds significant initial load time. This is 24x larger than Yjs's bundle. For a knowledge editor that needs fast initial load, this is a notable trade-off.

---

## Gaps / follow-ups

- Automerge 3.0 benchmarks against Yjs are not yet available in crdt-benchmarks
- Real-world performance with rich text (not just plain text benchmarks) is unknown
- Document compaction/garbage collection in Automerge needs investigation
