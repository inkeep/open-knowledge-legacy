# Evidence: Architecture Patterns for Local Search

**Dimension:** D5 — Architecture Patterns for Local Search
**Date:** 2026-04-03
**Sources:** Blog posts, engineering articles, GitHub repos, official docs

---

## Key pages/repos referenced
- [acreom.com/blog/the-quest-for-a-great-search](https://acreom.com/blog/the-quest-for-a-great-search) — acreom search architecture
- [dev.to/craftzdog: Making a full-text search module (Pt. 1-2)](https://dev.to/craftzdog/making-a-full-text-search-module-that-works-on-both-desktop-and-mobile-pt-1-1n9i) — Inkdrop FTS5
- [alexgarcia.xyz: Hybrid full-text and vector search with SQLite](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — sqlite-vec + FTS5 RRF
- [notion.com/blog: WASM SQLite in browser](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite) — Notion's approach
- [turso.tech/blog: Beyond FTS5 — Tantivy in TursoDB](https://turso.tech/blog/beyond-fts5) — Tantivy segments in SQLite
- [zed.dev/blog: Project Search](https://zed.dev/blog/nerd-sniped-project-search) — Zed's search optimization
- [electronjs.org: V8 Memory Cage](https://www.electronjs.org/blog/v8-memory-cage) — Electron 21+ constraint
- [electronjs.org: utilityProcess API](https://www.electronjs.org/docs/latest/api/utility-process)
- [sqlite.org/fts5.html](https://www.sqlite.org/fts5.html) — SQLite FTS5 docs
- [asg017/sqlite-vec](https://github.com/asg017/sqlite-vec) — Vector search for SQLite

---

## Findings

### Finding: Three deployment patterns dominate — in-process, sidecar binary, native addon
**Confidence:** CONFIRMED
**Evidence:** Multiple sources above

| Pattern | Latency | Memory Isolation | Examples |
|---------|---------|------------------|----------|
| In-process (JS library) | ~0-1ms | None | acreom (MiniSearch in Worker), Omnisearch |
| Sidecar binary | ~5-50ms (IPC) | Full | VS Code + ripgrep, Ollama |
| Native addon (N-API) | ~1-5ms | None | Tantivy-node, better-sqlite3 |

**Implications:** For a Node.js app, in-process JS gives lowest latency but is RAM-bounded. Native addon (Rust via N-API) gives native speed with some build complexity.

### Finding: SQLite FTS5 is the dominant embedded full-text search engine
**Confidence:** CONFIRMED
**Evidence:** Inkdrop, Logseq, Notion, Bear, Capacitor apps — all use SQLite FTS5

FTS5 provides built-in BM25 ranking (`ORDER BY rank`), prefix matching, boolean operators, phrase queries. Uses LSM-tree internally. Trigram tokenizer enables substring matching. WAL mode: 70k reads/s vs 5.6k reads/s.

Key limitation: JOINs between FTS5 virtual tables and regular tables are very slow — must fetch FTS5 rowids first, then JOIN separately.

### Finding: Reciprocal Rank Fusion (RRF) is the standard hybrid search combination method
**Confidence:** CONFIRMED
**Evidence:** [alexgarcia.xyz: sqlite-vec hybrid search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html)

```
score = (1/(k + fts_rank)) * w_fts + (1/(k + vec_rank)) * w_vec
```
Where k defaults to 60. Implemented as SQL with FULL OUTER JOIN on CTEs for FTS5 + sqlite-vec results. Avoids score-magnitude normalization problems. Widely adopted: also used by ChromaDB, OpenSearch.

**Implications:** RRF is the clear choice for combining BM25 + vector scores. Well-documented implementation exists for SQLite FTS5 + sqlite-vec specifically.

### Finding: sqlite-vec provides vector search in SQLite — brute-force KNN, <75ms for 1024-dim vectors
**Confidence:** CONFIRMED
**Evidence:** [alexgarcia.xyz: sqlite-vec stable release](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)

Stable since October 2024. Brute-force KNN (no HNSW). Runs anywhere SQLite runs including WASM. Companion `sqlite-lembed` for local GGUF model embedding. Predecessor `sqlite-vss` (Faiss-backed) is superseded.

**Implications:** sqlite-vec + FTS5 together provide a pure-SQLite hybrid search stack. The <75ms latency is adequate for ~1000 articles.

### Finding: Electron's V8 Memory Cage (v21+) breaks native addons that wrap external memory
**Confidence:** CONFIRMED
**Evidence:** [electronjs.org/blog/v8-memory-cage](https://www.electronjs.org/blog/v8-memory-cage), [VS Code issue #177338](https://github.com/microsoft/vscode/issues/177338)

`ArrayBuffer` instances can no longer point to non-V8 memory. Native addons must copy data into V8-managed Buffer before returning. Affects search libraries managing their own memory pools.

### Finding: Electron's utilityProcess is the idiomatic 2024 pattern for CPU-intensive search
**Confidence:** CONFIRMED
**Evidence:** [electronjs.org/docs/latest/api/utility-process](https://www.electronjs.org/docs/latest/api/utility-process)

Uses Chromium Services API, supports MessagePort communication with renderers. Explicitly recommended for "CPU intensive tasks or crash prone components." Replaces `child_process.fork` pattern. Native modules safe (unlike Web Workers).

### Finding: Real-time indexing uses debounced file watching (chokidar) or database change feeds
**Confidence:** CONFIRMED
**Evidence:** acreom blog, Inkdrop blog posts

Two patterns: (1) chokidar file watching with 300-500ms debounce, batch processing 500 docs per tick; (2) Database change feeds (PouchDB changes → FTS upsert: attempt UPDATE, if rowsAffected=0 then INSERT). acreom runs search indexing in a dedicated Web Worker.

### Finding: TursoDB stores Tantivy segments as chunked BLOBs inside SQLite B-tree tables
**Confidence:** CONFIRMED
**Evidence:** [turso.tech/blog/beyond-fts5](https://turso.tech/blog/beyond-fts5)

512KB fixed chunks. Provides transactionality (index updates in same WAL transaction), crash safety, single-file distribution. Trade-off: Tantivy's auto segment merges disabled (`NoMergePolicy`), manual `OPTIMIZE INDEX` required.

**Implications:** Demonstrates that Tantivy can be embedded inside SQLite for single-file distribution. Novel architecture worth tracking.

### Finding: WASM SQLite via OPFS is the browser/Electron convergence pattern
**Confidence:** CONFIRMED
**Evidence:** [notion.com/blog: WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)

Notion uses OPFS SyncAccessHandle Pool VFS (no SharedArrayBuffer headers needed). SharedWorker for multi-tab write coordination. ~10% slower than native SQLite; 0.5s cold start for WASM binary.

---

## Gaps / follow-ups
- Tantivy-node (N-API bindings for Node.js) maturity and maintenance status
- Performance comparison: sqlite-vec brute-force vs HNSW-based vector stores at 1000-document scale
- Whether sqlite-lembed (local GGUF embedding in SQLite) is production-ready
