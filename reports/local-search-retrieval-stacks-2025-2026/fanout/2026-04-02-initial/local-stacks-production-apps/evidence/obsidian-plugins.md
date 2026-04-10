# Evidence: Obsidian AI Plugin Ecosystem

**Dimension:** D2 — Obsidian AI Plugin Ecosystem
**Date:** 2026-04-03
**Sources:** GitHub repos, Obsidian forums, DeepWiki analyses

---

## Key repos/pages referenced
- [brianpetro/obsidian-smart-connections](https://github.com/brianpetro/obsidian-smart-connections)
- [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot)
- [scambier/obsidian-omnisearch](https://github.com/scambier/obsidian-omnisearch)
- [pfrankov/obsidian-local-gpt](https://github.com/pfrankov/obsidian-local-gpt)
- [gabosgab/ObsidianPrivateAI](https://github.com/gabosgab/ObsidianPrivateAI)
- [muzhi1991/obsidian-private-ai](https://github.com/muzhi1991/obsidian-private-ai) — Orama vectorstore implementation

---

## Findings

### Finding: Smart Connections uses Transformers.js WASM in a hidden iframe for local embedding
**Confidence:** CONFIRMED
**Evidence:** [github.com/brianpetro/obsidian-smart-connections](https://github.com/brianpetro/obsidian-smart-connections), [issue #634](https://github.com/brianpetro/obsidian-smart-connections/issues/634)

Default model: `TaylorAI/bge-micro-v2` (384 dims, 512 token context) via `@xenova/transformers`. Runs inside a hidden iframe because ONNX Runtime WASM fails in Web Workers with `n(...).dirname is not a function`. No API key required; fully local by default.

**Implications:** Demonstrates that in-browser local embedding is viable but has Electron-specific constraints. The iframe workaround is clever but fragile — causes "stuck on loading" issues.

### Finding: Smart Connections stores embeddings in custom .ajson line-delimited format
**Confidence:** CONFIRMED
**Evidence:** [github.com/brianpetro/obsidian-smart-connections/discussions/432](https://github.com/brianpetro/obsidian-smart-connections/discussions/432)

Storage in `.smart-env/` directory at vault root. `.ajson` format: each line is a self-contained JSON object (append-style). Migrated from single `embeddings.json` (v1) which had severe write-pressure for large vaults. Search is vector cosine similarity only — no keyword/BM25 hybrid.

### Finding: Obsidian Copilot uses Orama v3 as its vector database with hybrid retrieval
**Confidence:** CONFIRMED
**Evidence:** [github.com/logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot)

Uses `@orama/orama` v3.0.0-rc-2. Three retriever implementations: HybridRetriever (Orama hybrid = vector + full-text), TieredLexicalRetriever (BM25+ via MiniSearch v7.2.0), MiyoSemanticRetriever (self-hosted). Default is HybridRetriever. Persists to chunked JSON files using djb2 hash partitioning. Previously used IndexedDB which caused re-indexing bugs.

**Implications:** Orama is used in a major Obsidian plugin for hybrid search. This is a notable real-world validation of Orama for local embedding + search.

### Finding: Omnisearch uses MiniSearch for BM25 with IndexedDB persistence via Dexie
**Confidence:** CONFIRMED
**Evidence:** [github.com/scambier/obsidian-omnisearch](https://github.com/scambier/obsidian-omnisearch), [DeepWiki: obsidian-omnisearch/2.2-search-system](https://deepwiki.com/scambier/obsidian-omnisearch/2.2-search-system)

MiniSearch provides BM25 scoring. Index persisted to IndexedDB via Dexie v4. Incremental reindexing based on mtime comparison. Peak memory observed at ~1,300MB for large vaults.

### Finding: Obsidian's built-in search is proprietary and closed-source
**Confidence:** CONFIRMED
**Evidence:** [forum.obsidian.md/t/add-the-search-from-the-core-plugin-to-the-obsidian-api/104011](https://forum.obsidian.md/t/add-the-search-from-the-core-plugin-to-the-obsidian-api/104011)

Plugin API only exposes `prepareFuzzySearch` (character-level subsequence) and `prepareSimpleSearch` (substring). Core search plugin not accessible. Indexes in-memory on startup. No known use of third-party JS search libraries.

### Finding: WASM-in-Web-Workers is broken in Obsidian/Electron
**Confidence:** CONFIRMED
**Evidence:** [forum.obsidian.md/t/can-plugins-use-web-worker/81040](https://forum.obsidian.md/t/can-plugins-use-web-worker/81040)

ONNX Runtime WASM backend fails in Workers. Smart Connections uses hidden iframe workaround. This is a structural constraint for any Electron app using WASM-based search or embedding.

### Finding: Cross-plugin pattern — cloud API default, local via Ollama sidecar
**Confidence:** CONFIRMED
**Evidence:** Multiple repos above

Most plugins default to cloud embedding APIs (OpenAI). Local operation available via Ollama/LM Studio sidecar. Only Smart Connections defaults to fully in-process local (WASM). IndexedDB rejected by some plugins in favor of flat files for sync compatibility.

---

## Index Format Summary Table

| Plugin | Vector Store | Format | Location |
|--------|-------------|--------|----------|
| Smart Connections | Custom | .ajson (line-delimited JSON) | `.smart-env/` vault root |
| Copilot | Orama v3 | Chunked JSON (djb2 partitioned) | `.copilot-index/` |
| Omnisearch | MiniSearch | IndexedDB (Dexie) | Browser storage |
| ObsidianPrivateAI | Orama | msgpack binary | Plugin dir |

---

## Gaps / follow-ups
- Orama v3's exact hybrid search pipeline (how it combines BM25 + vector) deserves deeper investigation
- Performance benchmarks for Smart Connections' WASM embedding on large vaults
