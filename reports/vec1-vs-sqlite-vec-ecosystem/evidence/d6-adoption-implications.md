# Evidence: D6 — Adoption Implications

**Dimension:** Which extension to use when? Guidance for product teams choosing SQLite for vector search
**Date:** 2026-04-05
**Sources:** Synthesized from D1-D5 evidence, community feedback, SQLite forum

---

## Key pages referenced

- All sources from D1-D5 evidence files
- https://sqlite.org/forum/info/fdfdecb5698acf2ccc8f8d2101323dc9d705f0d1b24510f42760e2e3961dc4e6 — Real-world usage feedback
- https://github.com/asg017/sqlite-vec/issues/94 — Positioning discussion
- https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite — Ecosystem analysis

---

## Findings

### Finding: Decision matrix based on use case characteristics
**Confidence:** INFERRED (synthesis of confirmed facts)

| Criterion | sqlite-vec favored | Vec1 favored |
|-----------|-------------------|--------------|
| Dataset size | <250K vectors | >250K vectors |
| Platform | WASM, mobile, embedded | Server, desktop (x86/ARM) |
| Recall requirement | Exact (recall = 1.0) | Approximate acceptable |
| Training data available | No / dynamic dataset | Yes / batch-oriented |
| Framework integration needed | Yes (LangChain, etc.) | Not critical |
| Language | Python, Node, Ruby, Rust, Go | Python (via APSW) or C |
| Maturity requirement | Stable (2+ years) | Can tolerate pre-release |
| Long-term maintenance | Community-maintained | Official SQLite team |
| License sensitivity | MIT/Apache-2.0 | Public domain |

---

### Finding: Real-world user "punkish" demonstrates the scale crossover point
**Confidence:** CONFIRMED
**Evidence:** SQLite Forum feedback thread

User manages ~3.4M vectors (768-dim, nomic-embed-text) in SQLite:
- sqlite-vec "failed beyond ~100K vectors" (likely via an older fork, not necessarily current version)
- usearch worked but searches took "several seconds" — inadequate
- Adopted hybrid approach: FTS5 narrows results, then cosine similarity on smaller set
- Actively wants Vec1 to provide native ANN for this scale

This demonstrates the real-world crossover: at 3.4M vectors with 768 dimensions, brute-force approaches fail, and Vec1's IVFADC (with ~1,000+ QPS on similar datasets) would be transformative.

---

### Finding: Both extensions can coexist in the same SQLite database
**Confidence:** INFERRED
**Evidence:** Both use different virtual table names (vec0 vs vec1), both are standard SQLite extensions

Since both extensions use SQLite's virtual table interface with different module names (`vec0` for sqlite-vec, `vec1` for Vec1), they can theoretically be loaded simultaneously in the same SQLite connection. A product could use:
- sqlite-vec for small, frequently-updated vector collections (no training overhead)
- Vec1 for large, relatively static collections (trained ANN index)

**Caveat:** This coexistence pattern has not been tested or documented by either project.

---

### Finding: The "wait for Vec1 or use sqlite-vec now" question has a clear answer
**Confidence:** INFERRED

**Use sqlite-vec now if:**
- You need a production-ready solution today
- Your dataset is <250K vectors
- You need WASM, mobile, or non-Python language bindings
- You need framework integrations (LangChain, Datasette)
- Exact recall matters

**Wait for Vec1 if:**
- Your primary bottleneck is scale (>1M vectors)
- You're in a Python/C environment
- You can tolerate pre-release software
- Official SQLite provenance matters (e.g., enterprise compliance)
- You need integrated ANN with metadata filtering

**Consider both if:**
- You expect dataset growth from small to large
- You want sqlite-vec for immediate needs with a migration path to Vec1

---

### Finding: sqlite-vec's DiskANN alpha may reduce Vec1's differentiation
**Confidence:** UNCERTAIN
**Evidence:** sqlite-vec release notes, DiskANN literature

If sqlite-vec's DiskANN matures:
- No training requirement (unlike Vec1's IVFADC)
- Incremental index updates (unlike Vec1's rebuild requirement)
- DiskANN is well-suited to SQLite's B-tree architecture
- Could offer good recall at scale without the training workflow

However:
- DiskANN is currently alpha (released days ago)
- No benchmarks available
- DELETE operations are "quite expensive"
- Vec1's IVFADC with OPQ may achieve better compression ratios

The competitive dynamic depends heavily on how fast sqlite-vec's DiskANN matures.

---

### Finding: sqlite-vector (SQLite.ai) is not a viable mainstream option due to license
**Confidence:** CONFIRMED
**Evidence:** https://github.com/sqliteai/sqlite-vector

sqlite-vector uses Elastic License 2.0, which prohibits:
- Providing the software as a managed service
- Competing with SQLite Cloud (the creator's product)
- Production use without commercial license (for non-OSI projects)

This eliminates sqlite-vector as an option for most production deployments, despite its technical strengths (broad vector types, fast quantized search). It is primarily a component of SQLite Cloud's commercial offering.

---

## Gaps / follow-ups

- No published guidance from either project on migration paths
- Coexistence pattern (loading both extensions) untested
- Long-term maintenance commitments for sqlite-vec unclear if Garcia moves on
