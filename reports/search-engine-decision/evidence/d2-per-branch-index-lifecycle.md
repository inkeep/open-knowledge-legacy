# Evidence: Per-Branch Index Lifecycle

**Dimension:** D2 -- Per-branch index lifecycle
**Date:** 2026-04-04
**Sources:** Orama persistence docs, SQLite file operations, PGlite initialization, SeqProto benchmarks, prior reports

---

## Key files / pages referenced

- [Orama plugin-data-persistence](https://docs.orama.com/open-source/plugins/plugin-data-persistence) -- serialization formats
- [SeqProto benchmarks](https://orama.com/blog/seqproto-fast-binary-serialization-in-javascript) -- serialization performance
- [SQLite backup API](https://www.sqlite.org/backup.html) -- online backup for file copy
- Prior report: /reports/orama-deep-dive/REPORT.md D6 (persistence)
- Prior report: /reports/pglite-search-engine-evaluation/REPORT.md D1, D4
- PROJECT.md CC6 (per-branch cached derived data)

---

## Findings

### Finding: Orama serialize/deserialize is the fastest branch-switch mechanism at 1K docs
**Confidence:** INFERRED (from SeqProto benchmarks + Orama scale analysis)
**Evidence:** SeqProto blog post, Orama deep-dive D5 (performance at scale)

Branch switch workflow:
1. `persist(currentDb, 'binary')` -- serialize current index (~50-100ms at 1K docs with content, less without)
2. Write to `.openknowledge/cache/<branch>/search.bin`
3. Read `.openknowledge/cache/<target-branch>/search.bin`
4. `restore('binary', data)` -- deserialize (~50-100ms at 1K docs)

Total branch-switch latency: **~100-200ms** (serialize + write + read + deserialize).

With contentless operation (D1), the serialized index is smaller (~2-3MB vs ~7-8MB), reducing I/O time. Estimated contentless branch-switch: **~50-100ms**.

SeqProto (Orama's custom binary format) is 1.6x faster than JSON.stringify and produces smaller output. For 1K docs with 384-dim vectors: estimated 2-4MB serialized (contentless).

**Cache storage pattern:**
```
.openknowledge/
  cache/
    main/
      search.bin          # Orama serialized index
      backlinks.json      # Backlink adjacency list
    draft-restructure/
      search.bin
      backlinks.json
```

### Finding: SQLite branch-switch is open/close file -- near-instant
**Confidence:** CONFIRMED
**Evidence:** SQLite file-based architecture, better-sqlite3 API

Branch switch workflow:
1. `db.close()` -- close current SQLite database (flushes WAL, <1ms)
2. `new Database('.openknowledge/cache/<target-branch>/search.db')` -- open target (<5ms cold, <1ms warm)

Total branch-switch latency: **~1-5ms**.

SQLite's file-based persistence means the index IS the cache file. No serialize/deserialize step. The database file is always in a consistent state (WAL or journal protects it).

**Cache storage pattern:**
```
.openknowledge/
  cache/
    main/
      search.db           # SQLite file (FTS5 + sqlite-vec data)
    draft-restructure/
      search.db
```

The SQLite file at 1K contentless docs: ~2-3MB (FTS5 inverted index + sqlite-vec vectors + metadata).

### Finding: PGlite branch-switch requires full instance teardown/startup -- heaviest option
**Confidence:** INFERRED (from PGlite architecture analysis)
**Evidence:** PGlite report D1 (architecture), PGlite benchmarks page

PGlite stores data in a PostgreSQL data directory (filesystem backend in Node.js). Branch switch has two possible patterns:

**Pattern A: One PGlite instance per branch**
1. `await currentPg.close()` -- teardown current PGlite instance
2. `new PGlite({ dataDir: '.openknowledge/cache/<branch>/' })` -- initialize new instance
3. `await pg.exec('CREATE EXTENSION IF NOT EXISTS vector')` -- load extensions

Estimated total: **~200-500ms** (WASM engine init + extension loading + PostgreSQL startup).

The initial PGlite startup includes WASM compilation (cached by V8 after first run), PostgreSQL initdb (first time only), and extension loading. Subsequent starts of an existing data directory skip initdb but still need WASM bootstrap.

**Pattern B: One PGlite instance with branch-namespaced schemas**
```sql
CREATE SCHEMA IF NOT EXISTS "branch_main";
CREATE SCHEMA IF NOT EXISTS "branch_draft_restructure";
SET search_path TO "branch_draft_restructure";
```
Eliminates PGlite teardown/startup but:
- All branches' data loaded in memory simultaneously
- Memory grows linearly with branch count (~50-100MB per branch)
- Search queries need schema-qualified table names

Estimated switch latency: **~1-5ms** (just SET search_path). But memory cost is prohibitive.

**Pattern A is more viable.** The 200-500ms latency is the weakest point of PGlite for the per-branch pattern.

### Finding: Cache miss (rebuild from scratch) -- Orama is fastest, SQLite close second
**Confidence:** INFERRED (from prior performance benchmarks)
**Evidence:** Prior reports performance data

When visiting a branch for the first time, the search index must be rebuilt from the branch's article content:

| Step | Time estimate |
|------|--------------|
| Read 1K articles from git working tree | ~50-100ms (fs.readFile) |
| Parse markdown + extract sections | ~100-200ms (remarkStructure) |
| Insert 1K docs into search engine (BM25 only, no vectors) | varies by engine |
| Generate 384-dim embeddings for 1K docs | ~60-100s (dominates everything) |

**BM25-only rebuild (without embeddings):**
- Orama: insertMultiple 1K docs ~100ms. Total: ~250-400ms
- SQLite FTS5: 1K INSERTs with contentless ~50-100ms. Total: ~200-300ms
- PGlite: 1K INSERTs ~250-500ms (WASM overhead) + instance startup ~200ms. Total: ~650-1000ms

**With embeddings:** 60-100 seconds regardless of engine. The engine choice is irrelevant -- embedding generation dominates by 100x.

**Pre-warming strategy:** Copy main's cache to the new branch directory, then incrementally update only changed articles:
1. `cp .openknowledge/cache/main/search.bin .openknowledge/cache/new-branch/search.bin`
2. Deserialize
3. Diff: which articles changed between main and new-branch? (`git diff main..new-branch --name-only`)
4. Remove old docs for changed articles, insert new docs
5. Re-embed only changed articles

This reduces rebuild to: copy (~1ms) + deserialize (~50-100ms) + incremental update (N changed articles * ~100ms each for BM25, + ~100ms each for embedding). For 10 changed articles out of 1K: ~1.5s total (mostly embedding).

SQLite equivalent: copy the .db file, open it, delete/insert changed articles. Same incremental logic, even faster copy (~1ms for 3MB file).

PGlite equivalent: copy the data directory (~20MB), start instance, delete/insert changed articles. Slower copy + startup.

---

## Gaps / follow-ups

- PGlite startup latency needs direct measurement -- the 200-500ms estimate is derived from architecture analysis, not benchmarks
- Orama seqproto serialization at exactly 1K docs with 384-dim vectors needs benchmarking
- Pre-warming with git diff + incremental update needs prototype validation
