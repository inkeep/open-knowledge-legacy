# Evidence: D2 — sqlite-vec Current Status & ANN Roadmap

**Dimension:** sqlite-vec — current status, ANN roadmap (DiskANN/IVF alpha), Alex Garcia's stated plans
**Date:** 2026-04-05
**Sources:** github.com/asg017/sqlite-vec, alexgarcia.xyz, PyPI

---

## Key pages referenced

- https://github.com/asg017/sqlite-vec — Main repository
- https://github.com/asg017/sqlite-vec/releases — Release history
- https://github.com/asg017/sqlite-vec/issues/25 — ANN tracking issue
- https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html — v0.1.0 announcement
- https://alexgarcia.xyz/blog/2024/building-new-vector-search-sqlite/index.html — Design philosophy
- https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html — Metadata filtering release
- https://alexgarcia.xyz/sqlite-vec/api-reference.html — API reference

---

## Findings

### Finding: sqlite-vec is a community-standard vector search extension by Alex Garcia, stable since August 2024
**Confidence:** CONFIRMED
**Evidence:** https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html

sqlite-vec v0.1.0 was released in August 2024 as a successor to sqlite-vss (released Feb 2023). It is written in pure C with no dependencies, MIT/Apache-2.0 dual licensed, and runs "anywhere SQLite runs" including Linux, macOS, Windows, WASM, mobile devices, and Raspberry Pi.

sqlite-vss was abandoned due to:
- Platform restrictions (Linux + macOS only)
- Memory constraints (stored vectors in-memory)
- Transaction bugs
- Compilation difficulty (Faiss dependency)

sqlite-vec addressed all of these by being dependency-free pure C.

**Implications:** sqlite-vec has been the de facto community standard for ~2 years, with broad ecosystem integration (LangChain, Datasette, txtai, rqlite).

---

### Finding: sqlite-vec stable (v0.1.9) provides brute-force KNN search with metadata filtering
**Confidence:** CONFIRMED
**Evidence:** https://alexgarcia.xyz/sqlite-vec/api-reference.html, release notes

Stable features:
- **Vector types:** float32, int8, bit
- **Distance metrics:** L2 (Euclidean), cosine, Hamming (bit only)
- **Virtual table interface (vec0):** KNN queries via `WHERE` clause matching
- **Metadata columns:** boolean, integer, float, text — filterable in KNN queries
- **Partition keys:** For accelerating metadata filtering (~3x improvement)
- **Binary quantization:** `vec_quantize_binary()` for 32x space reduction
- **Vector arithmetic:** add, subtract, normalize, slice (Matryoshka support)
- **Broad language bindings:** Python, Node.js, Ruby, Rust, Go, C/C++

Limitations of stable brute-force:
- At 1M 3072-dim vectors: 8.52 seconds per query
- At 1M 128-dim vectors: much faster but still O(n)
- Practical ceiling ~250K embeddings for sub-100ms queries on standard hardware (per community reports in issue #25)

---

### Finding: sqlite-vec v0.1.10-alpha.1 (March 31, 2026) introduced DiskANN as first ANN index
**Confidence:** CONFIRMED
**Evidence:** https://github.com/asg017/sqlite-vec/releases

Release timeline:
- **v0.1.10-alpha.1** (2026-03-31): Initial alpha with new ANN indexes: rescore, ivf (experimental, not enabled), and DiskANN
- **v0.1.10-alpha.2** (2026-04-01): Bug fixes for flat/ANN indexes, new insert command structure, fixed data leaking in DiskANN compressed neighbor vectors, ALTER TABLE RENAME support
- **v0.1.10-alpha.3** (2026-04-01): Proper INSERT OR REPLACE INTO support

DiskANN was chosen because of its simplicity and SQLite compatibility — it can leverage SQLite's B-tree structure and doesn't require k-means training (unlike IVF).

IVF is listed as "experimental, not enabled" — present in the codebase but not ready for use.

Known issue: DELETE operations on DiskANN are "quite expensive" but noted as fixable in later releases.

**Implications:** sqlite-vec's ANN support is very new (days old as of this writing). DiskANN alpha, IVF experimental. No published benchmarks yet for ANN mode.

---

### Finding: Garcia's ANN roadmap planned IVF first, DiskANN second — execution reversed this
**Confidence:** CONFIRMED
**Evidence:** https://github.com/asg017/sqlite-vec/issues/25

Garcia's October 2024 plan:
- Phase 1: "IVF+kmeans index...should help scale sqlite-vec to at least ~1 million vectors"
- Phase 2: "Add a proper DiskANN index, which won't require kmeans training"

Target timeline: Mid-November 2024 for metadata filtering, November-December for ANN work, full ANN by December 2024 or January 2025.

Actual execution: DiskANN shipped first (March 2026), IVF is experimental/disabled. The timeline slipped significantly from the original plan.

Three algorithms under consideration:
1. **IVF** — Faiss-style, pre-computed centroids
2. **HNSW** — Better scaling but complex implementation, extensive tuning
3. **DiskANN (LM-DiskANN)** — Preferred for simplicity and SQLite compatibility

---

### Finding: sqlite-vec has extensive ecosystem integrations
**Confidence:** CONFIRMED
**Evidence:** Multiple sources (LangChain docs, GitHub README, community discussions)

Integrations include:
- LangChain (official VectorStore)
- Datasette (plugin)
- sqlite-utils (plugin)
- txtai (ANN provider)
- rqlite
- Community fork by vlasky (distance constraints, pagination)
- Language bindings: Python, Node.js, Ruby, Rust, Go (CGO + WASM), C/C++

Available via: PyPI, npm, RubyGems, crates.io

---

## Gaps / follow-ups

- No published DiskANN benchmarks from sqlite-vec yet (alpha only days old)
- Garcia has not publicly commented on Vec1 in any source found
- Full ANN documentation not yet available ("comprehensive documentation and examples remain forthcoming")
