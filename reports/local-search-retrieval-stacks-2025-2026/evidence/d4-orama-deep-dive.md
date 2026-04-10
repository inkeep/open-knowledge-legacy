# Evidence: Orama Deep Dive

**Dimension:** D1 — Orama Architecture, Hybrid Search, Vector Search, Performance, Persistence
**Date:** 2026-04-03
**Sources:** GitHub source code, npm registry, official docs, GitHub issues

---

## Key files / pages referenced

- [orama/trees.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/trees.ts) — multi-tree index architecture
- [orama/trees/radix.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/trees/radix.ts) — Radix tree for full-text
- [orama/trees/vector.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/trees/vector.ts) — brute-force vector search
- [orama/methods/search-hybrid.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/methods/search-hybrid.ts) — hybrid fusion logic
- [orama/methods/search-fulltext.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/methods/search-fulltext.ts) — BM25 implementation
- [package.json](https://github.com/oramasearch/orama/blob/main/packages/orama/package.json) — zero runtime dependencies
- [GitHub Issue #573](https://github.com/oramasearch/orama/issues/573) — memory at 100K docs
- [GitHub Issue #851](https://github.com/oramasearch/orama/issues/851) — 512MB serialization ceiling
- [GitHub Issue #869](https://github.com/oramasearch/orama/issues/869) — v3 tokenization regression
- [Fumadocs Orama docs](https://www.fumadocs.dev/docs/headless/search/orama) — Fumadocs integration
- [npm @orama/orama](https://www.npmjs.com/package/@orama/orama) — package metadata
- [Orama Vector Search docs](https://docs.orama.com/docs/orama-js/search/vector-search) — vector API
- [Orama Persistence docs](https://docs.orama.com/open-source/plugins/plugin-data-persistence) — save/load

---

## Findings

### Finding: Orama uses a multi-tree index architecture with 7 specialized data structures
**Confidence:** CONFIRMED
**Evidence:** [trees.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/trees.ts)

Trees: Radix (text/fuzzy), AVL (numbers/dates), BKD (geo), Flat, Boolean, ZIP, Vector. Each optimized for its data type. NOT a single inverted index.

**Implications:** Purpose-built architecture suggests thoughtful design, but also means search behavior varies by field type.

### Finding: Orama is genuinely pure TypeScript with zero runtime dependencies
**Confidence:** CONFIRMED
**Evidence:** [package.json](https://github.com/oramasearch/orama/blob/main/packages/orama/package.json)

`dependencies` field is empty. All listed packages are `devDependencies` only.

**Implications:** Maximum portability — runs anywhere JavaScript runs. No native compilation, no platform binaries.

### Finding: Hybrid search uses weighted sum with min-max normalization, NOT Reciprocal Rank Fusion
**Confidence:** CONFIRMED
**Evidence:** [search-hybrid.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/methods/search-hybrid.ts)

Implementation: (1) BM25 scores normalized by dividing by max score, (2) cosine similarities normalized same way, (3) combined = (text × weight) + (vector × weight). Default weights: 0.5/0.5. Code comment: "In the next versions of Orama, we will ship a plugin containing a ML model to adjust the weights."

**Implications:** Weighted sum is simpler than RRF but more sensitive to score distribution. Works well when both search modes return comparable result sets.

### Finding: Vector search is brute-force linear scan, NOT HNSW or any ANN algorithm
**Confidence:** CONFIRMED
**Evidence:** [vector.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/trees/vector.ts)

Iterates all candidate vectors, computes cosine similarity, returns above threshold. Stored as `Map<DocID, [Magnitude, Float32Array]>`. Magnitudes pre-computed at insert time. @todo comment acknowledges the limitation.

**Implications:** O(n) scaling with document count. Fine for 1K docs. At 100K+ docs, vector search becomes the bottleneck.

### Finding: BM25 implementation uses standard parameters (k=1.2, b=0.75, d=0.5)
**Confidence:** CONFIRMED
**Evidence:** [search-fulltext.ts](https://github.com/oramasearch/orama/blob/main/packages/orama/src/methods/search-fulltext.ts)

### Finding: ~520K weekly npm downloads, 10.3K GitHub stars
**Confidence:** CONFIRMED
**Evidence:** [npm API](https://api.npmjs.org/downloads/point/last-week/@orama/orama), [GitHub](https://github.com/oramasearch/orama)

Latest: v3.1.18 (Dec 2024). Apache 2.0. Originally "Lyra" at NearForm, renamed Orama.

### Finding: 100K documents consume ~500-550MB heap memory
**Confidence:** CONFIRMED
**Evidence:** [Issue #573](https://github.com/oramasearch/orama/issues/573)

Initial heap ~44.6MB, after 100K doc index: ~502-547MB. Linear extrapolation to 1K docs: ~5MB (likely sublinear due to fixed overhead).

### Finding: Persistence supports JSON, dpack, and seqproto formats via plugin
**Confidence:** CONFIRMED
**Evidence:** [Persistence docs](https://docs.orama.com/open-source/plugins/plugin-data-persistence), [seqproto repo](https://github.com/oramasearch/seqproto)

Core also exports `save()`/`load()` for basic serialization. Plugin adds format options and file I/O. 512MB serialization ceiling due to JS string length limit (Issue #851).

### Finding: Embedding plugin uses TensorFlow.js, NOT transformers.js
**Confidence:** CONFIRMED
**Evidence:** [npm @orama/plugin-embeddings](https://www.npmjs.com/package/@orama/plugin-embeddings)

For transformers.js, users must generate embeddings externally and pass vectors to Orama's BYO-embeddings API. No official Orama + transformers.js plugin.

### Finding: Fumadocs uses Orama as its default search engine
**Confidence:** CONFIRMED
**Evidence:** [Fumadocs search docs](https://www.fumadocs.dev/docs/headless/search/orama)

Two setup modes: `createFromSource` (simple) and `createSearchAPI` (advanced). Supports i18n with locale-to-stemmer mapping. Client modes: fetch (API at runtime) or static (pre-built index download).

### Finding: v3.0.x had significant tokenization regressions; stable from v3.1.11+
**Confidence:** CONFIRMED
**Evidence:** [Issue #869](https://github.com/oramasearch/orama/issues/869)

User with 390K movie dataset saw results go from 2 to 3,215 for same query after upgrading v2→v3. Fixed in v3.1.11.

---

## Gaps / follow-ups

* No formal benchmark suite exists — all performance claims are anecdotal or from small demos
* The "less than 2kb" marketing claim needs verification (likely tree-shaken core only)
* No published data on hybrid search latency (BM25 + vector combined)
