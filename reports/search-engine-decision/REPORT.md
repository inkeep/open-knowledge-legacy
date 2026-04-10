---
title: "Search Engine Decision: Orama vs SQLite FTS5+sqlite-vec vs PGlite+pgvector for a CRDT-Backed Branchable Knowledge Platform"
description: "Architecture-specific decision report evaluating three search engine candidates for a local-first, CRDT-backed, everything-branchable knowledge platform. Evaluates contentless CRDT integration, per-branch index lifecycle, incremental re-indexing pipeline, permission-scoped search, local-to-cloud migration path, multi-language support, operational risk, and abstraction layer design. Builds on three existing engine-level deep-dives to deliver the architecture-specific evaluation layer."
createdAt: 2026-04-04
updatedAt: 2026-04-04
subjects:
  - Orama
  - SQLite FTS5
  - sqlite-vec
  - better-sqlite3
  - PGlite
  - pgvector
  - pg_textsearch
  - Yjs
  - Hocuspocus
topics:
  - search engine selection
  - CRDT search integration
  - per-branch index caching
  - contentless search indexing
  - local-to-cloud migration
---

# Search Engine Decision: Orama vs SQLite FTS5+sqlite-vec vs PGlite+pgvector

**Purpose:** Determine which search engine best serves a CRDT-backed, everything-branchable, agent-native knowledge platform. This is an architecture-specific decision report -- it builds on existing engine-level research (referenced below) and evaluates each engine against the specific architectural constraints of our product.

---

## Executive Summary

**Recommendation: SQLite FTS5 + sqlite-vec + better-sqlite3**, with Orama as a viable alternative if native addon friction proves unacceptable.

SQLite wins on the three highest-weighted dimensions: contentless operation (native `content='', contentless_delete=1`), per-branch index lifecycle (file open/close in ~1-5ms vs Orama's ~50-100ms serialize/deserialize), and operational stability (30 years of battle-testing vs Orama's v3 regression history). These three dimensions are the most architecturally consequential because they intersect directly with the platform's core differentiators -- CRDT as source of truth, everything-branchable, and product reliability.

Orama is a strong second choice. It maps most naturally to the `SearchEngine` abstraction interface (single `search()` call, no SQL), has better multi-language support than SQLite, and its pure-TypeScript zero-dependency story eliminates native addon friction entirely. Where Orama falls short: contentless BM25 requires implementing a custom `documentsStore` component (~50-100 lines, feasible but not native), and serialize/deserialize for branch switching is 10-50x slower than SQLite's file open/close.

PGlite is not recommended for P0. Its alpha maturity (v0.4.2), heaviest per-branch lifecycle cost (~200-500ms instance restart), and highest memory baseline (~50-100MB) make it the wrong choice for a local-first product shipping now. The "same engine local + cloud" proposition, while appealing, is partially broken (pg_textsearch BM25 unavailable on Neon/Supabase) and premature -- cloud is a Later concern, and the abstraction layer equalizes migration cost regardless of local engine choice.

**The decision between SQLite and Orama reduces to one question: is native addon friction acceptable?** If `npx openknowledge init` must work with zero compilation and zero platform-specific binaries, choose Orama. If better-sqlite3's prebuild binaries (which work on all major platforms) are acceptable, choose SQLite. Both engines deliver sub-15ms hybrid search at 1K documents, both support contentless operation, and both integrate cleanly with the CRDT pipeline. The engineering cost difference between them is small -- ~50 lines of custom Orama documentsStore vs ~20 lines of SQL for SQLite's contentless mode.

**Key Findings:**

- **Contentless operation:** SQLite FTS5 has native contentless mode (one config flag). PGlite achieves it via tsvector-only tables (standard PostgreSQL). Orama requires a custom documentsStore component (feasible, ~50-100 lines).
- **Per-branch lifecycle:** SQLite's file-based architecture makes branch switching near-instant (~1-5ms). Orama requires serialize/deserialize (~50-100ms). PGlite requires full instance teardown/startup (~200-500ms).
- **Incremental re-indexing:** Embedding generation (~100-200ms per article) dominates latency by 100x regardless of engine. Engine choice is immaterial for incremental updates.
- **Permission-scoped search:** PGlite/PostgreSQL has the most natural model (RLS policies, cloud-portable). SQLite handles it via SQL JOINs. Orama's enum filter works for simple cases but cannot express Zanzibar-style transitive permissions inline.
- **Local-to-cloud migration:** The `SearchEngine` abstraction layer equalizes migration cost to ~1-3 days regardless of engine choice. PGlite's ~95% SQL portability is genuinely valuable but does not justify the P0 tradeoffs.
- **Operational risk:** SQLite is lowest risk (30 years stable, best debugging tools). Orama is medium risk (stable v3 but regression history). PGlite is highest risk (alpha, no production search users).

---

## Research Rubric

**Report Type:** Architecture-Specific Decision Report
**Primary Question:** Which search engine should our CRDT-backed, everything-branchable knowledge platform use?
**Audience:** Engineering team building the platform (same team that produced the engine-level reports)
**Stance:** Conclusions -- recommendation backed by evidence

| # | Dimension | Depth | Priority | Weight |
|---|-----------|-------|----------|--------|
| D1 | Contentless operation (index-only with content from CRDT) | Deep | P0 | HIGH |
| D2 | Per-branch index lifecycle | Deep | P0 | HIGH |
| D3 | Incremental re-indexing through CRDT pipeline | Deep | P0 | MEDIUM |
| D4 | Integration with just-bash exec pattern | Moderate | P0 | LOW |
| D5 | Permission-scoped search for cloud | Deep | P0 | MEDIUM |
| D6 | Local-to-cloud migration path | Deep | P0 | MEDIUM |
| D7 | Multi-language support | Moderate | P0 | LOW |
| D8 | Concurrent read/write for cloud | Moderate | P0 | LOW |
| D9 | Operational complexity and failure modes | Deep | P0 | HIGH |
| D10 | The search abstraction layer | Synthesis | P0 | MEDIUM |
| D11 | Decision matrix and recommendation | Synthesis | P0 | -- |

**Non-goals:** Re-evaluating engine internals already documented in existing reports. This report references existing research for engine-level findings and adds the architecture-specific evaluation layer.

**Existing research referenced (NOT duplicated):**
- [Local-First Search & Retrieval Stacks 2025-2026](/Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/REPORT.md) -- landscape comparison
- [Orama Deep Dive](/Users/edwingomezcuellar/reports/orama-deep-dive/REPORT.md) -- source-code-level assessment
- [PGlite Search Engine Evaluation](/Users/edwingomezcuellar/reports/pglite-search-engine-evaluation/REPORT.md) -- viability assessment
- [Orama vs ripgrep](/Users/edwingomezcuellar/reports/orama-vs-ripgrep-indexed-grep/REPORT.md) -- complementary role (Orama for search, regex for grep)

---

## Detailed Findings

### D1: Contentless Operation -- Index-Only with Content from CRDT

**Finding:** SQLite FTS5 has the cleanest contentless mode (native, one config flag). PGlite achieves it via standard PostgreSQL tsvector-only tables. Orama requires a custom `documentsStore` component -- feasible but not native.

**Evidence:** [evidence/d1-contentless-operation.md](evidence/d1-contentless-operation.md)

Our architecture mandates that the search engine is a **scoring index**, not a content store. Content lives in CRDT Y.Docs and is read from there when constructing search results. The engine should store only what it needs for ranking: inverted index (BM25 tokens), optionally vector embeddings, and document IDs.

**SQLite FTS5:** Native contentless mode since 2012, enhanced with `contentless_delete=1` since SQLite 3.43 (2023). One line:
```sql
CREATE VIRTUAL TABLE fts_articles USING fts5(content, content='', contentless_delete=1);
```
This stores only the inverted index. `snippet()` and `highlight()` do not work (they need original text), which is fine -- we build snippets from CRDT content. DELETE and UPDATE work naturally with the `contentless_delete` option. sqlite-vec is inherently contentless (stores only vectors). Combined storage at 1K docs: ~2-3MB.

**PGlite/PostgreSQL:** No formal "contentless" mode, but the standard pattern of storing only tsvector + vector columns achieves the same result:
```sql
CREATE TABLE search_index (
  doc_id TEXT PRIMARY KEY,
  fts tsvector NOT NULL,
  embedding vector(384)
);
```
The tsvector column stores lexemes with positions -- the original text is discarded after `to_tsvector()`. Slightly more setup (5-10 lines vs 1 line) but functionally equivalent.

**Orama:** Does not natively support contentless operation. When you `insert(db, doc)`, Orama stores the full document in its internal `documentsStore`. To achieve contentless BM25, you have two options:
1. **Schema-only approach:** Define only non-content fields in the schema (`title`, `topics`, `embedding`). Content is not indexed for BM25. This sacrifices full-text search on article body -- only title/frontmatter fields are BM25-searchable.
2. **Custom documentsStore:** Replace the default documentsStore with a no-op implementation that discards documents after tokenization. This preserves BM25 on content while not storing it. Estimated effort: ~50-100 lines of TypeScript.

Option 2 is the correct approach if BM25 on content is needed (it is). The custom documentsStore is Orama's documented component API, not a hack -- but it is custom code that SQLite and PGlite do not require.

**Snippet generation from CRDT:** After getting ranked IDs from any engine, constructing snippets requires reading from Y.Docs (~0.1-0.2ms per doc for text extraction) and finding matching terms (~0.1ms). For top-10 results: ~1-2ms total. This cost is identical for all three engines and negligible.

**Decision triggers:**
- If contentless operation is non-negotiable with zero custom code, SQLite FTS5 is the clear winner.
- If you accept ~50-100 lines of custom documentsStore code, Orama is equally viable.

---

### D2: Per-Branch Index Lifecycle

**Finding:** SQLite's file-based architecture delivers near-instant branch switching (~1-5ms). Orama requires serialize/deserialize (~50-100ms contentless). PGlite requires full instance restart (~200-500ms estimated).

**Evidence:** [evidence/d2-per-branch-index-lifecycle.md](evidence/d2-per-branch-index-lifecycle.md)

The platform's CC6 principle: per-branch cached derived data. On branch switch, the search index for the target branch must be available.

**SQLite: close file, open file (~1-5ms)**

The SQLite search index IS a file. One file per branch:
```
.openknowledge/cache/main/search.db
.openknowledge/cache/draft-restructure/search.db
```
Branch switch: `db.close()` (flushes WAL, <1ms) + `new Database(targetPath)` (<5ms cold, <1ms warm). The database is immediately queryable. No serialization, no deserialization, no data transformation.

**Orama: serialize to file, deserialize from file (~50-100ms contentless)**

Orama lives in memory. To persist across branch switches:
```
persist(db, 'binary') → write to .openknowledge/cache/main/search.bin
read .openknowledge/cache/draft-restructure/search.bin → restore('binary', data)
```
SeqProto binary format is fast (1.6x faster than JSON) but still requires traversing the entire in-memory index for serialization. At 1K contentless docs with 384-dim vectors (~2-4MB serialized): estimated ~50-100ms round-trip.

This is perceptible but acceptable. Branch switching is a deliberate user action (not per-keystroke), and 50-100ms is below the 200ms threshold for "feels instant."

**PGlite: instance teardown + WASM startup (~200-500ms estimated)**

PGlite requires a full PostgreSQL data directory per branch. Branch switch means:
1. `await currentPg.close()` -- PostgreSQL shutdown
2. `new PGlite({ dataDir: targetPath })` -- WASM engine initialization + PostgreSQL startup
3. Load extensions (pgvector, pg_textsearch)

Estimated: ~200-500ms. This is the highest-latency option and enters the zone where users may notice the delay. The alternative (one PGlite instance with schema-per-branch) avoids restart but loads all branches into memory (~50-100MB per branch).

**Cache miss (first visit to a branch):**

All engines must rebuild from content. BM25-only rebuild:
- SQLite: ~200-300ms (read files + parse + insert)
- Orama: ~250-400ms (same pipeline)
- PGlite: ~650-1000ms (WASM overhead + startup)

With embeddings: ~60-100 seconds regardless (embedding generation dominates by 100x).

**Pre-warming** (copy main's index, incrementally update changed files) works for all three engines and reduces rebuild to: copy time + incremental update of N changed articles. SQLite's file copy is fastest (~1ms for 3MB file). Orama's binary copy is similar. PGlite's data directory copy is larger (~20MB).

---

### D3: Incremental Re-Indexing Through CRDT Pipeline

**Finding:** Embedding generation (~100-200ms per article) dominates incremental re-indexing latency by 100x. The engine choice is immaterial for incremental updates. All three engines support per-document insert/update/remove with sub-millisecond BM25 latency.

**Evidence:** [evidence/d3-d4-incremental-reindex-integration.md](evidence/d3-d4-incremental-reindex-integration.md)

The pipeline: Y.Doc change -> Hocuspocus hook -> markdown string -> remarkStructure extraction -> BM25 token generation -> embedding generation (async) -> upsert into engine.

| Engine | remove + insert (BM25) | vector upsert | Sync/Async |
|--------|----------------------|---------------|-----------|
| Orama | <1ms (sync) | <1ms (sync) | Sync (v3 default) |
| SQLite | <1ms (sync, prepared stmt + transaction) | <1ms (sync) | Sync (better-sqlite3) |
| PGlite | ~1-3ms (async, WASM crossing) | ~1ms (async) | Async |

The BM25 update can happen synchronously (instant), with the embedding update queued asynchronously. Between the BM25 update and embedding arrival, the article is searchable via keywords but has stale vectors. This is acceptable -- BM25 freshness matters more than vector freshness for incremental updates.

All three engines support the pattern: update BM25 index immediately, update vector index when embedding is ready. The engine choice does not affect the user experience of incremental re-indexing.

---

### D4: Integration with Just-Bash Exec Pattern

**Finding:** All three engines wrap identically behind the `search` command. The search engine is an implementation detail invisible to the MCP consumer.

**Evidence:** [evidence/d3-d4-incremental-reindex-integration.md](evidence/d3-d4-incremental-reindex-integration.md)

The `search` command (whether via `mcp__openkb__exec("search 'authentication' --topic deployment --limit 5")` or a semantic `search` tool) calls the engine internally and returns formatted text output. The wrapper is ~20-30 lines regardless of engine. No friction difference.

---

### D5: Permission-Scoped Search for Cloud

**Finding:** PGlite/PostgreSQL has the most natural permission model (Row-Level Security, cloud-portable). SQLite handles it via SQL JOINs. Orama's enum filter works for simple cases but requires pre-computed permission resolution for Zanzibar-style models.

**Evidence:** [evidence/d5-d6-permission-scoped-migration.md](evidence/d5-d6-permission-scoped-migration.md)

For the cloud product (10K-100K articles, Zanzibar-style permissions):

**PGlite/PostgreSQL:** Row-Level Security (RLS) policies are transparent to search queries. Write the policy once, all queries automatically filtered. The SAME RLS policy works on local PGlite and cloud PostgreSQL. No other engine has this capability.

**SQLite:** SQL JOINs with a permissions table. `WHERE rowid IN (SELECT article_id FROM permissions WHERE user_id = ?)`. Clean, efficient, well-understood. Not as elegant as RLS but functionally equivalent.

**Orama:** The `where` clause supports `enum[]` filtering with `containsAny`/`containsAll`. For simple group-based permissions (`access_groups: { containsAny: ['engineering'] }`), this works. For complex Zanzibar permission chains (user -> group -> role -> folder -> article), the Orama filter cannot express the transitive graph. Pre-compute accessible article IDs, then filter results.

For P0 (single-user, local): permission-scoped search is irrelevant. All three engines are equally adequate.

For cloud: PGlite/PostgreSQL has the strongest story, but the cloud product will almost certainly use managed PostgreSQL (Neon, Supabase, RDS) directly -- not PGlite. The local engine choice does not constrain the cloud permission model.

---

### D6: Local-to-Cloud Migration Path

**Finding:** The `SearchEngine` abstraction layer equalizes migration cost to ~1-3 days regardless of local engine choice. PGlite's ~95% SQL portability is a genuine advantage but does not justify the P0 tradeoffs when the abstraction layer provides the same outcome.

**Evidence:** [evidence/d5-d6-permission-scoped-migration.md](evidence/d5-d6-permission-scoped-migration.md)

| Local Engine | Cloud Target | Effort (without abstraction) | Effort (with abstraction) |
|-------------|-------------|------------------------------|--------------------------|
| Orama | Orama Cloud | ~1-3 days (API change, reindex) | ~1 day (new backend) |
| Orama | PostgreSQL | ~1-2 weeks (complete rewrite) | ~1-3 days (new backend) |
| SQLite | PostgreSQL | ~3-5 days (SQL translation) | ~1-3 days (new backend) |
| PGlite | PostgreSQL | ~1-2 days (~95% portable) | ~0.5-1 day (connection change) |

PGlite has the lowest raw migration cost to cloud PostgreSQL. But with the abstraction layer, the cost difference between engines narrows to ~1-2 days. The question becomes: is ~1-2 days of future migration savings worth PGlite's P0 penalties (alpha maturity, higher memory, slower branch switching)?

The answer is no. The abstraction layer is cheap to build (~200-400 lines per backend) and provides engine portability regardless of the P0 choice. Optimizing for migration cost at the expense of P0 product quality is premature optimization.

**Vendor risk note:** Orama Cloud is a single-company managed service. If OramaSearch Inc. pivots or shuts down, there is no alternative Orama Cloud provider. PostgreSQL cloud providers (Neon, Supabase, RDS, Aurora, Cloud SQL) are interchangeable. This favors a PostgreSQL cloud target regardless of local engine choice.

---

### D7: Multi-Language Support

**Finding:** SQLite FTS5 has only English stemming. Orama and PostgreSQL both support 30+ languages. For P0 (English developer audience), all three are equivalent. For cloud (global teams), SQLite is a significant limitation.

**Evidence:** [evidence/d7-d8-d9-multilang-concurrent-operational.md](evidence/d7-d8-d9-multilang-concurrent-operational.md)

| Engine | Languages | CJK Support |
|--------|-----------|-------------|
| Orama | 30+ (via @orama/stemmers) | Yes (Japanese, Chinese tokenizers) |
| SQLite FTS5 | 1 (English porter) | No |
| PostgreSQL/PGlite | 30+ (Snowball built-in) | Requires extensions |

SQLite FTS5's English-only stemmer is the most significant limitation in this dimension. For P0 (developer documentation in English), it does not matter. For later (global teams writing in French, German, Japanese), it becomes a blocker.

If the cloud product uses managed PostgreSQL for search, the SQLite limitation is moot -- it only affects the local product. But if local search quality matters for non-English users, SQLite's stemmer limitation persists.

---

### D8: Concurrent Read/Write for Cloud

**Finding:** Irrelevant for P0 (single-user local). Cloud will use a different engine (managed PostgreSQL with full MVCC). The local engine choice does not constrain the cloud concurrency model.

**Evidence:** [evidence/d7-d8-d9-multilang-concurrent-operational.md](evidence/d7-d8-d9-multilang-concurrent-operational.md)

For completeness: SQLite WAL mode allows concurrent reads during writes (single writer). Orama and PGlite are single-threaded. Server PostgreSQL (cloud) has full concurrent MVCC. None of this matters for P0 single-user local operation.

---

### D9: Operational Complexity and Failure Modes

**Finding:** SQLite has the lowest operational risk (30 years stable, best debugging tools, most production search users). Orama is medium risk (v3 stable but regression history, adequate debugging). PGlite is highest risk (alpha, no production search users, limited debugging).

**Evidence:** [evidence/d7-d8-d9-multilang-concurrent-operational.md](evidence/d7-d8-d9-multilang-concurrent-operational.md)

**Risk summary:**

| Risk Factor | Orama | SQLite FTS5+vec | PGlite |
|------------|-------|-----------------|--------|
| Engine maturity | Stable (v3.1.18) | Stable (SQLite 30+ years) | Alpha (v0.4.2) |
| Vector component maturity | N/A (brute-force in core) | Pre-v1 (sqlite-vec v0.1.9) | Stable (pgvector) |
| Known regressions | v3.0 tokenization (7mo fix) | None significant | Unknown (no users) |
| Data loss risk | In-memory (crash = loss) | Disk (WAL protects) | Disk (PG data dir) |
| Data loss mitigation | CRDT is source of truth | CRDT is source of truth | CRDT is source of truth |
| Native addon risk | None (pure JS) | better-sqlite3 prebuilds | None (pure WASM) |
| Debugging tools | JSON dump | sqlite3 CLI + DB Browser | JS API only |
| Production search users | Fumadocs, Deno docs | Logseq, Inkdrop, many | None identified |

**Critical mitigating factor:** The search index is derived data, rebuildable from CRDT content. A corrupted or lost search index is an inconvenience (~1 second BM25 rebuild, ~100 seconds with embeddings), not data loss. This significantly reduces the risk of Orama's in-memory model and PGlite's alpha status.

**Native addon friction (CC5):** `npx openknowledge init` must work without complex setup. better-sqlite3 ships prebuild binaries for all major platforms (macOS ARM64/x64, Linux x64/ARM64, Windows x64). Users never compile from source. However, prebuilds occasionally lag behind new Node.js versions (days, not weeks). Orama and PGlite have zero native addon risk.

---

### D10: The Search Abstraction Layer

**Finding:** Orama maps most cleanly to the `SearchEngine` interface (1:1 API correspondence). SQLite requires SQL translation (moderate). PGlite has the most friction (async boundary + SQL + serialize complexity).

**Evidence:** [evidence/d10-d11-abstraction-layer-decision-matrix.md](evidence/d10-d11-abstraction-layer-decision-matrix.md)

The proposed interface:
```typescript
interface SearchEngine {
  index(doc: { id: string, content?: string, frontmatter: Record<string, unknown>, embedding?: number[] }): void
  remove(id: string): void
  search(query: string, options?: { topic?: string, limit?: number, vector?: number[] }): Promise<SearchResult[]>
  serialize(): Promise<Buffer>
  deserialize(data: Buffer): Promise<void>
}
```

Each backend is ~100-200 lines of TypeScript. The async-first interface accommodates all three engines (sync engines trivially wrapped in `Promise.resolve()`).

**What leaks through the abstraction:**
- Orama: almost nothing. `search()` maps 1:1. Score fusion method (weighted-sum vs RRF) is an internal detail.
- SQLite: FTS5 MATCH syntax, sqlite-vec MATCH syntax, and the RRF CTE query are SQL-specific. serialize/deserialize maps to file copy (different semantics from in-memory serialization).
- PGlite: `to_tsvector()`, `<=>` operator, and the RRF SQL function are PostgreSQL-specific. Instance lifecycle management (startup/shutdown) leaks through serialize/deserialize.

**Swap cost with the abstraction layer:** ~1-3 days per engine. Write the new backend, rebuild the index (automated from source content). Consumer code (MCP tools, commands) does not change.

Recommendation: build the abstraction layer regardless of engine choice. The cost is low (~200 lines for the interface + first backend), and it provides optionality for the future.

---

### D11: Decision Matrix

| Dimension | Weight | Orama | SQLite FTS5+vec | PGlite+pgvector |
|-----------|--------|-------|-----------------|-----------------|
| D1: Contentless CRDT integration | HIGH | 3/5 | **5/5** | 4/5 |
| D2: Per-branch lifecycle | HIGH | 4/5 | **5/5** | 2/5 |
| D3: Incremental re-index | MEDIUM | 5/5 | 5/5 | 4/5 |
| D4: Just-bash integration | LOW | 5/5 | 5/5 | 5/5 |
| D5: Permission-scoped search | MEDIUM | 3/5 | 4/5 | **5/5** |
| D6: Migration path | MEDIUM | 3/5 | 3/5 | **4/5** |
| D7: Multi-language | LOW | **5/5** | 1/5 | **5/5** |
| D8: Concurrent read/write | LOW | 3/5 | 4/5 | 3/5 |
| D9: Operational risk | HIGH | 4/5 | **5/5** | 2/5 |
| D10: Abstraction layer fit | MEDIUM | **5/5** | 4/5 | 3/5 |

**Weighted scores** (HIGH=3x, MEDIUM=2x, LOW=1x):

| Engine | Weighted Score | Rank |
|--------|---------------|------|
| **SQLite FTS5+sqlite-vec** | **85/100** | **1st** |
| **Orama** | **76/100** | **2nd** |
| PGlite+pgvector | 64/100 | 3rd |

**Where each engine wins:**
- SQLite: contentless mode (native), branch switching (file-based, fastest), operational stability (30 years), debugging tools
- Orama: abstraction layer fit (1:1 API), multi-language (30+ stemmers), zero native deps, API simplicity
- PGlite: permission model (RLS), cloud migration (95% SQL portable), multi-language (30+ stemmers), vector index (HNSW)

**Where each engine loses:**
- SQLite: multi-language (English-only stemmer), native addon friction (better-sqlite3 prebuilds)
- Orama: contentless mode (requires custom code), branch switching (slower than SQLite), v3 regression history
- PGlite: operational risk (alpha), branch switching (slowest), memory baseline (highest), no production search users

---

## Recommendation

**Primary recommendation: SQLite FTS5 + sqlite-vec + better-sqlite3**

SQLite wins because the platform's two most architecturally distinctive features -- CRDT as source of truth (requiring contentless indexing) and everything-branchable (requiring fast index lifecycle) -- both strongly favor SQLite's file-based, natively contentless architecture. Combined with 30 years of operational stability, this makes SQLite the highest-confidence choice for a product that needs to ship reliably.

**Fallback: Orama** if and only if native addon friction (better-sqlite3 prebuilds) proves to be a real onboarding problem for the P0 audience. This is an empirical question -- better-sqlite3's prebuilds work on all major platforms, but edge cases exist (new Node.js versions, unusual Linux distros, Bun's native SQLite extension loading).

**Not recommended for P0: PGlite.** Revisit when (a) PGlite reaches v1.0, (b) pg_textsearch becomes available on major cloud providers, or (c) we need PostgreSQL-specific features beyond search.

**Regardless of engine choice: build the `SearchEngine` abstraction layer.** The cost is ~200 lines and it provides the optionality to swap engines later. Embed the engine choice as a configuration, not a commitment.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D1 (Contentless):** Orama's custom documentsStore for contentless BM25 has not been prototyped. The API documentation is sparse on exact method signatures. A time-boxed spike (~2-4 hours) would confirm feasibility.
- **D2 (Branch lifecycle):** All PGlite latency estimates are inferred from architecture analysis, not benchmarks. Orama's seqproto serialization at exactly 1K contentless docs needs measurement.
- **D4 (Performance):** No head-to-head benchmark at our exact target scale (1K articles, 384-dim embeddings, contentless mode) exists for any engine. A prototype benchmark would strengthen the decision.

### Out of Scope (per Rubric)

- Engine internal implementation details (covered in existing deep-dive reports)
- Cloud search engine selection (different product phase, different constraints)
- Embedding model selection (covered in local-search-retrieval-stacks report)

---

## References

### Evidence Files
- [evidence/d1-contentless-operation.md](evidence/d1-contentless-operation.md) -- Contentless patterns for all three engines
- [evidence/d2-per-branch-index-lifecycle.md](evidence/d2-per-branch-index-lifecycle.md) -- Branch switch latency, cache patterns, pre-warming
- [evidence/d3-d4-incremental-reindex-integration.md](evidence/d3-d4-incremental-reindex-integration.md) -- CRDT pipeline latency, just-bash integration
- [evidence/d5-d6-permission-scoped-migration.md](evidence/d5-d6-permission-scoped-migration.md) -- Permission filtering, migration effort analysis
- [evidence/d7-d8-d9-multilang-concurrent-operational.md](evidence/d7-d8-d9-multilang-concurrent-operational.md) -- Language support, concurrency, risk matrix
- [evidence/d10-d11-abstraction-layer-decision-matrix.md](evidence/d10-d11-abstraction-layer-decision-matrix.md) -- Interface design, scoring, decision matrix

### External Sources
- [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html) -- Contentless mode, contentless_delete documentation
- [Orama Components docs](https://docs.orama.com/open-source/internals/components) -- Custom documentsStore API
- [Orama Filters docs](https://docs.orama.com/open-source/usage/search/filters) -- Where clause for permission filtering
- [SeqProto benchmarks](https://orama.com/blog/seqproto-fast-binary-serialization-in-javascript) -- Serialization performance
- [PostgreSQL tsvector docs](https://www.postgresql.org/docs/current/datatype-textsearch.html) -- Contentless FTS pattern
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search) -- RRF pattern in PostgreSQL
- [PGlite Benchmarks](https://pglite.dev/benchmarks) -- CRUD performance data

### Related Research
- [Local-First Search & Retrieval Stacks 2025-2026](/Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/) -- Comprehensive engine comparison at the technology level
- [Orama Deep Dive](/Users/edwingomezcuellar/reports/orama-deep-dive/) -- Source-code-level Orama assessment (11 dimensions)
- [PGlite Search Engine Evaluation](/Users/edwingomezcuellar/reports/pglite-search-engine-evaluation/) -- PGlite viability assessment (10 dimensions)
- [Orama vs ripgrep](/Users/edwingomezcuellar/reports/orama-vs-ripgrep-indexed-grep/) -- Complementary finding: Orama for search, regex for grep
- [Fumadocs Orama Integration](/Users/edwingomezcuellar/reports/fumadocs-karpathy-workflow-deep-dive/evidence/fumadocs-orama-integration.md) -- Reference architecture for Orama integration pipeline
