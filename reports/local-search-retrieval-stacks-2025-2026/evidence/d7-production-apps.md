# Evidence: Production Local-First Applications

**Dimension:** D3 — Production Local-First Applications
**Date:** 2026-04-03
**Sources:** GitHub repos, source code analysis, official documentation

---

## Key repos/pages referenced
- [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) — local-first collaborative editor
- [logseq/logseq](https://github.com/logseq/logseq) — knowledge graph / note-taking
- [logseq/sqlite-db](https://github.com/logseq/sqlite-db) — Logseq's SQLite WASM backend
- [anyproto/anytype-heart](https://github.com/anyproto/anytype-heart) — AnyType Go middleware
- [anyproto/tantivy-go](https://github.com/anyproto/tantivy-go) — Go bindings for Tantivy
- [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) — Notion alternative
- [outline/outline](https://github.com/outline/outline) — self-hostable wiki
- [docmost/docmost](https://github.com/docmost/docmost) — self-hostable wiki
- [foambubble/foam](https://github.com/foambubble/foam) — VS Code knowledge management
- [dendronhq/dendron](https://github.com/dendronhq/dendron) — VS Code note-taking (archived)

---

## Findings

### Finding: AFFiNE uses Manticore Search or Elasticsearch as a Docker sidecar for search
**Confidence:** CONFIRMED
**Evidence:** `packages/backend/server/src/plugins/indexer/`, [AFFiNE Issue #13559](https://github.com/toeverything/AFFiNE/issues/13559)

Server-side indexer with two pluggable providers: Manticore Search (default, port 9308) and Elasticsearch. Self-hosted requires `manticoresearch/manticore:10.1.0` Docker container. Client-side `DocsSearchService` is a thin RxJS wrapper over remote API. Async indexing via BullMQ background jobs.

**Implications:** AFFiNE is the most operationally complex — requires Docker sidecar for search. Not truly local-first for search; the client depends on a server.

### Finding: Logseq DB version uses SQLite FTS5 with trigram tokenizer in a Web Worker
**Confidence:** CONFIRMED
**Evidence:** `src/main/frontend/worker/search.cljs`, [logseq/sqlite-db](https://github.com/logseq/sqlite-db)

New DB version (v0.11+): SQLite FTS5 with trigram tokenizer enables substring matching. Dual strategy: FTS5 for primary search + Fuse.js for fuzzy page/tag matching (Fuse.js skipped for >2,500 pages). Worker thread via `:thread-api/search-blocks`. Storage via OPFS. SQLite WASM backend built on rusqlite + wa-sqlite.

**Implications:** Logseq demonstrates that SQLite FTS5 via WASM in a Web Worker is a viable, performant architecture for local-first search. The trigram tokenizer choice trades index size for substring flexibility.

### Finding: AnyType uses Tantivy via tantivy-go for full-text search
**Confidence:** CONFIRMED
**Evidence:** `pkg/lib/localstore/ftsearch/ftsearch.go`, [anyproto/tantivy-go](https://github.com/anyproto/tantivy-go)

Tantivy v1.0.6 via Go bindings. 11 indexed fields with English/Chinese tokenizer pairs. PhrasePrefixQuery for incremental search, highlighting support. AutoBatcher for writes, mutex-protected. Index at `fts_tantivy/16` (version-suffixed). Tantivy chosen over Bleve for significantly better performance.

**Implications:** Tantivy is the clear choice for native/compiled local-first apps. Full-text only — no semantic/vector search. The Go bindings via CGo demonstrate cross-language embedding.

### Finding: AppFlowy uses Tantivy v0.24.1 for local FTS + sqlite-vec for emerging vector search
**Confidence:** CONFIRMED
**Evidence:** `frontend/rust-lib/flowy-search/`, `frontend/rust-lib/flowy-sqlite-vec/`, workspace `Cargo.toml`

`DocumentLocalSearchHandler` holds a `Weak<RwLock<DocumentTantivyState>>`, searches with 0.4 similarity threshold, max 10 results. Async via `tokio::spawn` with in-flight cancellation. `flowy-sqlite-vec` crate uses sqlite-vec v0.1.6 for KNN vector search. Cloud search via separate `SearchCloudService` trait.

**Implications:** AppFlowy is the most forward-looking: Tantivy for FTS + sqlite-vec for vector search, both running in-process in Rust. Demonstrates the hybrid Tantivy + sqlite-vec pattern.

### Finding: Outline uses PostgreSQL FTS with weighted tsvector triggers
**Confidence:** CONFIRMED
**Evidence:** `server/migrations/20230204191035-update-tsvector-trigger.js`

Title weighted 'A', text content weighted 'B' (truncated to 1M chars), previous titles weighted 'C'. Trigger-based index maintenance. Sequelize ORM. Always requires PostgreSQL server — no offline/local mode.

### Finding: Docmost uses PostgreSQL FTS with pg-tsquery and Kysely
**Confidence:** CONFIRMED
**Evidence:** `apps/server/src/core/search/search.service.ts`

`ts_rank`, `to_tsquery`, `ts_headline` with accent-insensitive `f_unaccent()`. Results ranked by BM25-style relevance. NestJS architecture. Docker-based self-hosting only.

### Finding: Foam delegates entirely to VS Code's native search (ripgrep)
**Confidence:** CONFIRMED
**Evidence:** [foambubble/foam](https://github.com/foambubble/foam) package.json, source

No dedicated search library. Uses VS Code's `workspace.findFiles` and ripgrep-backed search panel. Implements its own graph/link resolution but not text search.

### Finding: Dendron used Fuse.js for fuzzy lookup + VS Code native for FTS
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-core/src/components/lookup/LookupProviderV3.ts`

Fuse.js for hierarchical note matching with custom scoring (itemScore, isStub, levenshteinDistance, updatedTime). Workspace FTS delegated to VS Code ripgrep. Published static sites used client-side Fuse.js index. Archived Feb 2023.

---

## Summary: Search Stack by App

| App | Engine | Type | Architecture | Platform |
|-----|--------|------|-------------|----------|
| AFFiNE | Manticore/ES (Docker) | FTS + semantic | Separate sidecar | Electron + web |
| Logseq | SQLite FTS5 (WASM) | FTS + fuzzy | Worker thread | Electron + web |
| AnyType | Tantivy (Go bindings) | FTS only | In-process | Electron + mobile |
| AppFlowy | Tantivy + sqlite-vec | FTS + vector | In-process (Rust) | Flutter |
| Outline | PostgreSQL FTS | FTS only | Server-side | Web (Node.js) |
| Docmost | PostgreSQL FTS | FTS only | Server-side | Web (NestJS) |
| Foam | VS Code ripgrep | Text search | In-process extension | VS Code |
| Dendron | Fuse.js + ripgrep | Fuzzy + text | In-process extension | VS Code |

---

## Gaps / follow-ups
- Logseq's FTS5 trigram performance on large graphs (>10k pages) not benchmarked
- AppFlowy's sqlite-vec integration maturity — how far along is the vector search?
- AFFiNE client-side search capabilities without the Docker sidecar
