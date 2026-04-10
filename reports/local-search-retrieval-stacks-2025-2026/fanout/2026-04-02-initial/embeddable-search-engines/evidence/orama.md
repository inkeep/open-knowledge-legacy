# Evidence: Orama

**Dimension:** D1 — Orama
**Date:** 2026-04-03
**Sources:** GitHub oramasearch/orama, npm @orama/orama, official docs, GitHub issues

---

## Key files / pages referenced

- [GitHub: oramasearch/orama](https://github.com/oramasearch/orama) — main repo, 10.3K stars, Apache 2.0
- [Hybrid Search docs](https://docs.orama.com/docs/orama-js/search/hybrid-search) — API reference
- [Vector Search docs](https://docs.orama.com/docs/orama-js/search/vector-search) — implementation details
- [Plugin Data Persistence](https://docs.orama.com/docs/orama-js/plugins/plugin-data-persistence) — JSON + SeqProto binary
- [Plugin Embeddings npm](https://www.npmjs.com/package/@orama/plugin-embeddings) — TF.js-based local embeddings
- [GitHub issue #573](https://github.com/oramasearch/orama/issues/573) — memory usage at 100K docs (~500MB)
- [GitHub issue #869](https://github.com/oramasearch/orama/issues/869) — v3.0.4 tokenization regression
- [Fumadocs Orama integration](https://www.fumadocs.dev/docs/headless/search/orama) — production user
- [Deno Orama integration](https://docs.deno.com/orama/README/) — production user (5,856 docs)
- [npmtrends @orama/orama](https://npmtrends.com/@orama/orama) — ~520K weekly downloads

---

## Findings

### Finding: Orama is a pure TypeScript in-memory search engine with zero dependencies
**Confidence:** CONFIRMED
**Evidence:** GitHub repo README, npm package inspection

Orama runs in Node.js, Bun, Deno, browser, and edge runtimes. Index is held entirely in JavaScript object graph (Float32Array for vectors, tries/maps for text). No native bindings required.

**Implications:** Zero installation friction for a TypeScript project. No build tools, no native compilation. True in-process embedding.

### Finding: Hybrid search uses weighted linear combination with per-modality min-max normalization
**Confidence:** CONFIRMED
**Evidence:** Source code `packages/orama/src/methods/search-hybrid.ts`, [Hybrid Search docs](https://docs.orama.com/docs/orama-js/search/hybrid-search)

Algorithm: (1) Run BM25 independently, (2) Run cosine vector search independently, (3) Normalize each set to [0,1] by dividing by max score, (4) Fuse: `(textScore * textWeight) + (vectorScore * vectorWeight)`. Default weights: 0.5/0.5, configurable via `hybridWeights`. Single `search()` call with `mode: "hybrid"`.

**Implications:** Simple API — no manual score fusion needed. Weighted combination is less robust than RRF for queries where one modality returns poor results, but adequate for documentation search.

### Finding: Vector search is brute-force linear scan, cosine-only
**Confidence:** CONFIRMED
**Evidence:** Source code `packages/orama/src/trees/vector.ts`

No HNSW or ANN index. Cosine similarity only. Magnitude cached at insert time. Schema declares dimensionality as `"vector[N]"`. No quantization. Vectors stored as Float32Array.

**Implications:** At 1,000 docs with 512-dim vectors, brute-force is sub-millisecond. This becomes a bottleneck only at 100K+ docs. No concern for the target use case.

### Finding: Memory usage at 100K docs is ~500MB; extrapolated ~5-50MB at 1K docs
**Confidence:** INFERRED (extrapolated from GitHub issue #573)
**Evidence:** [GitHub issue #573](https://github.com/oramasearch/orama/issues/573) — 100K docs with 5 fields consumed 502-549MB

Linear extrapolation: ~5MB per 1,000 docs for text. With 512-dim vectors: 512 * 4 bytes * 1,000 = ~2MB additional. Total estimated: 10-50MB depending on document length and field count.

**Implications:** Well within 2GB budget. No memory concern at this scale.

### Finding: Fumadocs and Deno docs are production users; ~520K weekly npm downloads
**Confidence:** CONFIRMED
**Evidence:** [Fumadocs docs](https://www.fumadocs.dev/docs/headless/search/orama), [Deno docs](https://docs.deno.com/orama/README/), [npmtrends](https://npmtrends.com/@orama/orama)

Fumadocs migrated from Flexsearch to Orama as default search. Deno uses a 5,856-document index built from source markdown via CI. Docusaurus has official plugin.

**Implications:** Proven in the exact use case (documentation search over markdown articles).

### Finding: v3.0 had a critical tokenization regression that took ~7 months to fix
**Confidence:** CONFIRMED
**Evidence:** [GitHub issue #869](https://github.com/oramasearch/orama/issues/869) — v3.0.4 caused wrong results, 200x result inflation, 2s+ latency on 390K-item dataset. Fixed in v3.1.11.

**Implications:** Yellow flag for production stability on v3.x series. Small core team affects remediation velocity. Pin versions carefully.

### Finding: Built-in embedding plugin uses TF.js, outputs 512-dim vectors
**Confidence:** CONFIRMED
**Evidence:** [Plugin Embeddings npm](https://www.npmjs.com/package/@orama/plugin-embeddings)

`@orama/plugin-embeddings` with `@tensorflow/tfjs-backend-cpu` runs CPU-only. 512-dimension output. Model identity not publicly documented. Converts insert/search from sync to async. Bring-your-own-vectors path is simpler and more flexible.

**Implications:** For best quality, use external embeddings (e.g., gte-small via local model). The plugin adds TF.js dependency weight and async overhead.

---

## Gaps / follow-ups

- No official benchmarks published for @orama/orama at any scale — all performance claims are inferred
- Quality of built-in embedding model vs. modern SBERT models is unknown
- OramaCore (Rust) is a separate product — ensure users don't confuse it with the TypeScript library
