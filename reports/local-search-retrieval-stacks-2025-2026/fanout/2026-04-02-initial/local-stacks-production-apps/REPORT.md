---
title: "Local AI Stacks and Production Local-First Apps: Search Infrastructure Survey"
description: "Survey of search infrastructure in common local AI stacks (ChromaDB, txtai, LlamaIndex, Haystack, PrivateGPT, AnythingLLM) and production local-first applications (AFFiNE, Logseq, AnyType, AppFlowy, Outline, Obsidian plugins). Identifies convergence patterns, architectural choices, and the hybrid search gap for Node.js/TypeScript embeddable search."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - ChromaDB
  - txtai
  - LlamaIndex
  - Haystack
  - PrivateGPT
  - AnythingLLM
  - LanceDB
  - Orama
  - MiniSearch
  - Tantivy
  - SQLite FTS5
  - sqlite-vec
  - AFFiNE
  - Logseq
  - AnyType
  - AppFlowy
  - Outline
  - Obsidian Smart Connections
  - Obsidian Copilot
topics:
  - local-first search
  - hybrid search
  - embedded search engines
  - local AI stacks
  - Electron search patterns
---

# Local AI Stacks and Production Local-First Apps: Search Infrastructure Survey

**Purpose:** Identify what search and retrieval infrastructure real local-first applications and local AI stacks actually use in production, to inform the selection of an embeddable hybrid search stack for a Node.js/TypeScript knowledge platform.

---

## Executive Summary

This report surveys the search infrastructure of 7 local AI stacks, 4 Obsidian AI plugins, and 8 production local-first applications to identify patterns, convergences, and gaps relevant to building a local-first hybrid search engine for a TypeScript knowledge platform.

The central finding is that **no production local-first application ships hybrid search (BM25 + vector) as of early 2026.** Every app studied uses either full-text search alone (most common) or vector similarity alone (AI stacks). The hybrid search pattern is emerging in tooling (sqlite-vec + FTS5, Orama v3, LanceDB) but has not yet been adopted by production apps.

Three architectural tiers emerged: server-first apps use PostgreSQL FTS or Elasticsearch; compiled-native apps converge on Tantivy; JS/Electron apps use in-memory JS libraries (MiniSearch, Orama) or SQLite FTS5 via WASM/native addons. SQLite is the dominant local storage substrate, used by 6 of 8 production apps studied.

For a Node.js/TypeScript app specifically, the most viable paths are: (1) **Orama** — pure JS, has both BM25 and vector support, used by Obsidian Copilot; (2) **SQLite FTS5 + sqlite-vec via better-sqlite3** — proven components requiring native addon + glue code; (3) **LanceDB via npm** — embedded vector store used by AnythingLLM, with emerging BM25 support. None of these are a complete drop-in solution; all require integration work.

**Key Findings:**
- **SQLite FTS5 is the dominant embedded FTS engine** for local-first apps — used by Logseq, Inkdrop, Notion, Bear, and others
- **Tantivy is the dominant embedded FTS engine** for compiled-native apps (AnyType, AppFlowy, TursoDB)
- **ChromaDB's JS client is network-only** — cannot embed in Node.js without a Python sidecar
- **AnythingLLM is the only major local AI app with a native Node.js search core** (via LanceDB npm)
- **Orama v3 is the only JS-native library offering both BM25 and vector search** — used by Obsidian Copilot
- **Reciprocal Rank Fusion (RRF)** is the standard method for combining BM25 + vector scores, with a documented SQLite implementation
- **The hybrid search gap is real** — a genuine underserved need exists for an embeddable Node.js hybrid search engine

---

## Research Rubric

| # | Dimension | Priority | Depth | Stance |
|---|---|---|---|---|
| D1 | Common Local AI Stacks | P0 | Deep | Factual |
| D2 | Obsidian AI Plugin Ecosystem | P0 | Moderate | Factual |
| D3 | Production Local-First Applications | P0 | Deep | Factual |
| D4 | Patterns and Convergences | P0 | Deep | Conclusions |
| D5 | Architecture Patterns for Local Search | P0 | Moderate | Factual |

**Primary question:** What search infrastructure do real local-first apps and local AI stacks actually use, and what patterns emerge?
**Non-goals:** Cloud services, GPU solutions, enterprise-scale, pricing/licensing, 1P codebase analysis.

---

## Detailed Findings

### D1: Common Local AI Stacks

**Finding:** The local AI stack ecosystem is overwhelmingly Python-centric. Of 7 major tools surveyed, only AnythingLLM has a native Node.js search core.

**Evidence:** [evidence/local-ai-stacks.md](evidence/local-ai-stacks.md)

#### Stack-by-Stack Assessment

| Tool | Search Type | Node.js Embeddable | Key Constraint |
|------|------------|-------------------|----------------|
| **ChromaDB** | Hybrid (vector + BM25 via RRF) | No — JS client is HTTP-only | Requires Python server sidecar |
| **txtai** | Hybrid (Faiss + custom BM25) | No — Python-only core | JS/Go/Rust are HTTP clients |
| **LlamaIndex** | Vector + BM25 plugin + hybrid | Partial — LlamaIndex.TS has SimpleVectorStore | BM25 less mature in TS |
| **Haystack** | Hybrid (InMemory BM25 + embedding + DocumentJoiner) | No — Python-only | First-class BM25 but no JS path |
| **PrivateGPT** | Vector-only (LlamaIndex + Qdrant) | No — Python FastAPI service | No BM25/hybrid |
| **LocalGPT** | Updated: hybrid (semantic + BM25 + Late Chunking) | No — Python backend | JS is UI only |
| **AnythingLLM** | Vector similarity (LanceDB default) | Yes — LanceDB embedded via `vectordb` npm | LanceDB has hybrid capability but AnythingLLM exposes only vector |

ChromaDB's post-0.5 hybrid search (dense + sparse vectors via RRF with `Bm25EmbeddingFunction`) is technically impressive, but the JS/TS `chromadb` npm package is a thin network client with no in-process engine — confirmed by [Chroma's own client documentation](https://cookbook.chromadb.dev/core/clients/). This is a critical constraint: any Node.js app using ChromaDB must run a Python server process.

The most notable finding for Node.js is **LanceDB's `vectordb` npm package**, used by AnythingLLM in production. LanceDB runs embedded in the Node.js process, provides file-based columnar storage, and natively supports BM25 + vector hybrid search — though AnythingLLM's current implementation only exposes vector similarity through its `performSimilaritySearch()` interface.

**Implications:** The Python ecosystem has mature hybrid search (txtai, Haystack, ChromaDB). The Node.js ecosystem does not. LanceDB via npm is the closest to a production-proven embedded option, but hybrid search through the JS binding needs verification.

---

### D2: Obsidian AI Plugin Ecosystem

**Finding:** Obsidian plugins reveal the practical constraints of running search and embedding in an Electron environment — and show that Orama is emerging as a viable JS-native hybrid search engine.

**Evidence:** [evidence/obsidian-plugins.md](evidence/obsidian-plugins.md)

#### Plugin Search Architectures

**[Obsidian Smart Connections](https://github.com/brianpetro/obsidian-smart-connections)** — the most popular AI plugin — runs fully local by default using Transformers.js (`@xenova/transformers`) with `TaylorAI/bge-micro-v2` (384-dim embeddings). The WASM model runs inside a **hidden iframe** because ONNX Runtime WASM fails in Web Workers in Electron (`n(...).dirname is not a function`). Search is vector cosine similarity only — no keyword/BM25 component. Embeddings stored in custom `.ajson` line-delimited format at `.smart-env/` in the vault root.

**[Obsidian Copilot](https://github.com/logancyang/obsidian-copilot)** uses **[Orama](https://github.com/oramasearch/orama) v3.0.0-rc-2** as its search database, with three retriever implementations: `HybridRetriever` (Orama's combined vector + full-text), `TieredLexicalRetriever` (BM25+ via MiniSearch v7.2.0), and `MiyoSemanticRetriever`. The default is hybrid. Persistence is via chunked JSON files using djb2 hash partitioning — a migration from IndexedDB which caused re-indexing bugs.

**[Omnisearch](https://github.com/scambier/obsidian-omnisearch)** uses **MiniSearch** for BM25 scoring with IndexedDB persistence via Dexie. Pure full-text, no vector search. Peak memory observed at ~1,300MB for large vaults.

**Obsidian's built-in search** is proprietary and closed-source. The plugin API exposes only `prepareFuzzySearch` (character-level subsequence) and `prepareSimpleSearch` (substring). The core search index is not accessible to plugins.

#### Cross-Plugin Patterns

| Pattern | Observation |
|---------|-------------|
| Default embedding source | Most plugins default to cloud APIs (OpenAI). Only Smart Connections defaults to fully in-process local (WASM) |
| Local operation | Available via Ollama/LM Studio sidecar in all major plugins |
| Vector store choices | Custom .ajson (Smart Connections), Orama (Copilot), MiniSearch (Omnisearch) — no convergence |
| Electron constraint | WASM in Web Workers broken; Smart Connections uses hidden iframe workaround |
| Index persistence | Flat files preferred over IndexedDB for sync-compatibility |

**Implications:** Orama is a real-world-validated JS-native search engine supporting both BM25 and vector search, used by a major Obsidian plugin (Copilot). The Electron WASM-in-Worker constraint is a significant architectural factor for any Electron-based app.

---

### D3: Production Local-First Applications

**Finding:** Production local-first apps converge on two search engines: SQLite FTS5 (for JS/WASM environments) and Tantivy (for compiled-native apps). None ship production hybrid search.

**Evidence:** [evidence/production-local-first-apps.md](evidence/production-local-first-apps.md)

#### App-by-App Assessment

| App | Engine | Search Type | Architecture | Platform |
|-----|--------|------------|-------------|----------|
| **AFFiNE** | Manticore Search / Elasticsearch | FTS + semantic (server-side) | Docker sidecar | Electron + web |
| **Logseq** | SQLite FTS5 (trigram tokenizer) | FTS + Fuse.js fuzzy | Worker thread (WASM) | Electron + web |
| **AnyType** | [Tantivy via tantivy-go](https://github.com/anyproto/tantivy-go) | FTS only (multi-lang) | In-process Go middleware | Electron + mobile |
| **AppFlowy** | Tantivy v0.24.1 + sqlite-vec | FTS + vector (emerging) | In-process Rust, Tokio async | Flutter |
| **Outline** | PostgreSQL FTS (weighted tsvector) | FTS only | Server-side DB query | Web (Node.js) |
| **Docmost** | PostgreSQL FTS (ts_rank, pg-tsquery) | FTS only | Server-side DB query | Web (NestJS) |
| **Foam** | VS Code native (ripgrep) | Text search | In-process VS Code extension | VS Code |
| **Dendron** | Fuse.js + VS Code ripgrep | Fuzzy + text | In-process VS Code extension | VS Code (archived) |

**AFFiNE** is the most operationally complex — its self-hosted deployment requires a Docker container running Manticore Search (port 9308) alongside PostgreSQL, Redis, and the NestJS backend. The client-side `DocsSearchService` is a thin RxJS wrapper over the remote search API. This is the furthest from "truly local-first" search.

**Logseq's DB version** (v0.11+) is the most relevant architecture for a JS/TypeScript app. It runs SQLite FTS5 with a **trigram tokenizer** (enabling substring matching) in a Web Worker, with the [SQLite WASM backend](https://github.com/logseq/sqlite-db) built on rusqlite + wa-sqlite. Persistence via OPFS. Fuse.js handles fuzzy page/tag matching alongside FTS5, but is skipped for graphs exceeding 2,500 pages for performance.

**AnyType** and **AppFlowy** both chose Tantivy — AnyType via Go bindings (`tantivy-go`), AppFlowy directly in Rust. AnyType explicitly chose Tantivy over Bleve (the main Go-native alternative) for "significantly better performance." AppFlowy is the most forward-looking, pairing Tantivy FTS with [sqlite-vec](https://github.com/asg017/sqlite-vec) v0.1.6 for vector search — though the vector feature is still emerging.

**Server-first apps** (Outline, Docmost) use PostgreSQL FTS — straightforward but always requires a running server. Not applicable to the local-first constraint.

**VS Code-based tools** (Foam, Dendron) delegate text search to VS Code's ripgrep integration. Architecturally pragmatic but not a reusable pattern outside the editor.

**Implications:** The most relevant precedent for a Node.js/TypeScript local-first app is Logseq's architecture: SQLite FTS5 via WASM in a Worker thread. For compiled-native approaches, Tantivy is the clear winner. No app has shipped the combination of FTS + vector search locally.

---

### D4: Patterns and Convergences

**Finding:** Three architectural tiers emerge by platform. SQLite is the universal substrate. Hybrid search is a real, underserved gap.

**Evidence:** [evidence/patterns-convergences.md](evidence/patterns-convergences.md)

#### The Three Tiers

```
Tier 1: Server-First                    Tier 2: Compiled-Native           Tier 3: JS/Electron
+----------------------------------+    +---------------------------+     +---------------------------+
| PostgreSQL FTS / Elasticsearch / |    | Tantivy (Rust) in-process |     | In-memory JS library OR   |
| Manticore Search                 |    | via native FFI bindings   |     | SQLite FTS5 via WASM or   |
|                                  |    |                           |     | native addon              |
| Outline, Docmost, AFFiNE        |    | AnyType, AppFlowy, TursoDB|     | Logseq, Omnisearch,       |
|                                  |    |                           |     | Copilot, Inkdrop          |
+----------------------------------+    +---------------------------+     +---------------------------+
                                              |  N-API bridge  |
                                              +-------+--------+
                                                      |
                                                      v
                                               Node.js / TS app
                                               (your target)
```

A Node.js/TypeScript app sits in Tier 3, with the option of accessing Tier 2 via N-API native addons. The choice is between:
- **Pure JS** (Orama, MiniSearch) — simplest integration, no build complexity
- **Native addon** (better-sqlite3 + FTS5 + sqlite-vec) — proven components, build/packaging complexity
- **Native addon** (tantivy-node or equivalent) — best performance, least mature for Node.js

#### SQLite as the Common Denominator

SQLite usage across the studied apps:

| App | SQLite Role |
|-----|------------|
| Logseq | FTS5 via WASM (primary search) |
| AppFlowy | Diesel ORM + sqlite-vec (data + vector search) |
| Inkdrop | PouchDB over SQLite + FTS5 |
| Notion | WASM SQLite via OPFS (offline data) |
| Bear | Core Data → SQLite (all notes) |
| AnythingLLM | SQLite (metadata) + LanceDB (vectors) |

SQLite's ubiquity makes it the natural foundation. FTS5 provides built-in BM25 ranking, and [sqlite-vec](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) (stable since October 2024) adds vector search. Together, they enable a pure-SQLite hybrid search stack with documented [RRF combination](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html).

#### The Hybrid Search Gap

No production local-first application ships hybrid search (BM25 + vector combined) as of early 2026:
- Full-text-only apps: Logseq, AnyType, Outline, Docmost, Omnisearch, Inkdrop
- Vector-only tools: PrivateGPT, Smart Connections, most local AI stacks
- Emerging hybrid: AppFlowy (Tantivy + sqlite-vec, not yet integrated), Copilot (Orama hybrid)

The gap is real. The tooling exists (sqlite-vec + FTS5, Orama v3, LanceDB hybrid) but hasn't been adopted by production apps yet. Building a local hybrid search engine for a knowledge platform would be genuinely novel — not because the components don't exist, but because no one has assembled them into a shipping product.

#### Custom vs Off-the-Shelf

Every production app studied builds a custom search integration. No app uses a single off-the-shelf "search as a service" library. The pattern is: choose an engine (Tantivy, FTS5, MiniSearch), then build custom integration for indexing, scoring, result presentation, and change tracking. This suggests any search stack will require meaningful integration work regardless of component choice.

**Decision triggers:**
- If build simplicity is paramount → Orama (pure JS, single library for BM25 + vector)
- If proven-at-scale FTS matters → SQLite FTS5 via better-sqlite3 (native addon)
- If performance ceiling matters → Tantivy via N-API (highest performance, least mature for Node.js)
- If single-file distribution matters → SQLite FTS5 + sqlite-vec (everything in one .db file)

---

### D5: Architecture Patterns for Local Search

**Finding:** In-process search via native addons or WASM provides the best latency. RRF is the standard hybrid score combination method. Electron's constraints push toward careful native addon management or pure-JS solutions.

**Evidence:** [evidence/architecture-patterns.md](evidence/architecture-patterns.md)

#### Deployment Pattern Comparison

| Pattern | Query Latency | Memory Isolation | Electron Compatibility |
|---------|--------------|------------------|----------------------|
| In-process JS (MiniSearch, Orama) | ~0-1ms | None (crashes = app crash) | Excellent — no build issues |
| In-process native addon (better-sqlite3) | ~1-5ms | None | Good — requires electron-rebuild |
| Sidecar binary (ripgrep, Ollama) | ~5-50ms (IPC) | Full isolation | Excellent — no Electron coupling |
| WASM module (sql.js, wa-sqlite) | ~5-10ms | Partial (WASM sandbox) | Good — some Worker constraints |

For a non-Electron Node.js app (the stated target), the Electron constraints are less relevant. better-sqlite3 as a native addon is the most battle-tested path. For Electron targets, `utilityProcess` is the idiomatic 2024 pattern for CPU-intensive search operations.

#### Hybrid Search Pipeline: RRF

[Reciprocal Rank Fusion](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) is the production-standard method for combining BM25 and vector search results:

```
score = (1/(k + fts_rank)) * w_fts + (1/(k + vec_rank)) * w_vec   (k=60)
```

Alex Garcia's documented implementation combines SQLite FTS5 + sqlite-vec results using a SQL FULL OUTER JOIN on CTEs. This avoids score-magnitude normalization problems entirely. The same approach is used by ChromaDB, OpenSearch, and other production search systems.

Alternative approaches (keyword-first with semantic re-rank; linear score combination) exist but are less robust. Linear combination requires continuous calibration across different queries and corpora.

#### Real-Time Indexing Patterns

Two dominant approaches:
1. **File-watching + debounce:** chokidar with 300-500ms quiet window, batch processing ~500 docs per tick. Used by file-based apps (acreom, Omnisearch).
2. **Database change feed:** PouchDB changes events → FTS upsert (attempt UPDATE, if rowsAffected=0 then INSERT). Used by [Inkdrop](https://dev.to/craftzdog/making-a-full-text-search-module-that-works-on-both-desktop-and-mobile-pt-1-1n9i).

For a Node.js app indexing ~1000 markdown articles, file-watching with debounce is the natural fit. Incremental indexing (mtime comparison) avoids full reindexing on startup.

#### The SQLite + sqlite-vec Hybrid Architecture

[TursoDB's approach](https://turso.tech/blog/beyond-fts5) of storing Tantivy index segments as 512KB BLOBs inside SQLite B-tree tables demonstrates that full-text index + vector index + application data can coexist in a single SQLite file. While TursoDB's specific approach is not directly usable from Node.js, the principle applies: SQLite FTS5 + sqlite-vec provides a simpler version of the same idea — full-text and vector search in one database file.

[Notion's WASM SQLite implementation](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite) via OPFS SyncAccessHandle Pool VFS demonstrates that SQLite via WASM is production-viable (~10% slower than native, 0.5s cold start). However, for a Node.js server-side app, native SQLite via better-sqlite3 is faster and simpler than WASM.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Orama v3 performance at scale:** Obsidian Copilot validates it works for a vault of notes, but benchmarks at 1000+ documents with both BM25 and vector search were not found
- **LanceDB BM25 capabilities in Node.js specifically:** LanceDB supports hybrid search in Python, but the Node.js `vectordb` package's BM25 support needs verification
- **tantivy-node maturity:** The N-API binding for Tantivy in Node.js exists but its production-readiness, API surface, and maintenance status were not deeply assessed
- **sqlite-lembed (local GGUF embedding in SQLite) production readiness:** This companion to sqlite-vec could enable fully in-SQLite embedding, but is likely early-stage

### Out of Scope (per Rubric)
- Cloud-hosted search services
- GPU-required solutions
- Enterprise-scale systems
- Pricing/licensing comparisons
- First-party codebase analysis

---

## References

### Evidence Files
- [evidence/local-ai-stacks.md](evidence/local-ai-stacks.md) — D1: ChromaDB, txtai, LlamaIndex, Haystack, PrivateGPT, LocalGPT, AnythingLLM
- [evidence/obsidian-plugins.md](evidence/obsidian-plugins.md) — D2: Smart Connections, Copilot, Omnisearch, built-in search, cross-plugin patterns
- [evidence/production-local-first-apps.md](evidence/production-local-first-apps.md) — D3: AFFiNE, Logseq, AnyType, AppFlowy, Outline, Docmost, Foam, Dendron
- [evidence/architecture-patterns.md](evidence/architecture-patterns.md) — D5: Deployment patterns, index storage, hybrid pipelines, real-time indexing, Electron
- [evidence/patterns-convergences.md](evidence/patterns-convergences.md) — D4: SQLite convergence, Tantivy dominance, hybrid search gap, architectural tiers

### External Sources
- [ChromaDB Docs](https://docs.trychroma.com) — Official documentation
- [ChromaDB Cookbook](https://cookbook.chromadb.dev) — Resource requirements, client documentation
- [txtai GitHub](https://github.com/neuml/txtai) — All-in-one embeddings database
- [LlamaIndex Docs](https://docs.llamaindex.ai) — Vector stores, BM25 retriever
- [Haystack Hybrid Retrieval Tutorial](https://haystack.deepset.ai/tutorials/33_hybrid_retrieval)
- [PrivateGPT Vector Stores](https://docs.privategpt.dev/manual/storage/vector-stores)
- [AnythingLLM Docs](https://docs.anythingllm.com) — Vector database configuration
- [Obsidian Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) — WASM embedding, .ajson format
- [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) — Orama v3 integration
- [Obsidian Omnisearch](https://github.com/scambier/obsidian-omnisearch) — MiniSearch + IndexedDB
- [AFFiNE Indexer](https://github.com/toeverything/AFFiNE/tree/canary/packages/backend/server/src/plugins/indexer) — Manticore/ES integration
- [Logseq SQLite DB](https://github.com/logseq/sqlite-db) — WASM SQLite backend
- [AnyType tantivy-go](https://github.com/anyproto/tantivy-go) — Go bindings for Tantivy
- [AppFlowy flowy-search](https://github.com/AppFlowy-IO/AppFlowy/tree/main/frontend/rust-lib/flowy-search) — Tantivy + sqlite-vec
- [sqlite-vec Stable Release](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- [sqlite-vec + FTS5 Hybrid Search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — RRF implementation
- [Notion WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)
- [TursoDB: Beyond FTS5](https://turso.tech/blog/beyond-fts5) — Tantivy segments in SQLite
- [Inkdrop FTS Module](https://dev.to/craftzdog/making-a-full-text-search-module-that-works-on-both-desktop-and-mobile-pt-1-1n9i)
- [acreom: The Quest for a Great Search](https://acreom.com/blog/the-quest-for-a-great-search)
- [Zed: Project Search](https://zed.dev/blog/nerd-sniped-project-search)
- [Electron V8 Memory Cage](https://www.electronjs.org/blog/v8-memory-cage)
- [Electron utilityProcess API](https://www.electronjs.org/docs/latest/api/utility-process)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [Tantivy](https://github.com/quickwit-oss/tantivy)
- [Orama](https://github.com/oramasearch/orama)
