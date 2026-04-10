# Evidence: Search Abstraction Layer + Decision Matrix

**Dimensions:** D10 (The search abstraction layer), D11 (Decision matrix and recommendation)
**Date:** 2026-04-04
**Sources:** All prior evidence files, architectural analysis, prior reports

---

## Key files / pages referenced

- All evidence files in this report
- Prior report: /reports/orama-deep-dive/REPORT.md
- Prior report: /reports/pglite-search-engine-evaluation/REPORT.md
- Prior report: /reports/local-search-retrieval-stacks-2025-2026/REPORT.md
- PROJECT.md (architecture decisions)

---

## Findings

### Finding: The SearchEngine interface maps cleanly to Orama, requires SQL translation for SQLite/PGlite
**Confidence:** CONFIRMED
**Evidence:** API surface comparison

```typescript
interface SearchEngine {
  index(doc: { id: string, content?: string, frontmatter: Record<string, unknown>, embedding?: number[] }): void
  remove(id: string): void
  search(query: string, options?: { topic?: string, limit?: number, vector?: number[] }): SearchResult[]
  serialize(): Buffer
  deserialize(data: Buffer): void
}
```

**Orama fit:**

```typescript
class OramaSearchEngine implements SearchEngine {
  index(doc) {
    insert(this.db, {
      id: doc.id,
      title: doc.frontmatter.title,
      topics: doc.frontmatter.topics || [],
      embedding: doc.embedding
    });
  }
  remove(id) { remove(this.db, id); }
  search(query, opts) {
    return search(this.db, {
      term: query,
      mode: opts?.vector ? 'hybrid' : 'fulltext',
      vector: opts?.vector ? { value: opts.vector, property: 'embedding' } : undefined,
      where: opts?.topic ? { topics: { eq: opts.topic } } : undefined,
      limit: opts?.limit || 10
    });
  }
  serialize() { return persist(this.db, 'binary'); }
  deserialize(data) { this.db = restore('binary', data); }
}
```

**Leaks through abstraction:** Almost nothing. Orama's API maps 1:1 to the interface. The only Orama-specific detail is the `hybridWeights` configuration and the `threshold` parameter (AND/OR behavior).

**SQLite fit:**

```typescript
class SQLiteSearchEngine implements SearchEngine {
  index(doc) {
    this.insertStmt.run(doc.id, doc.frontmatter.title, doc.frontmatter.topics?.join(','));
    this.insertFtsStmt.run(this.db.lastInsertRowid, doc.content || doc.frontmatter.title);
    if (doc.embedding) this.insertVecStmt.run(doc.id, new Float32Array(doc.embedding));
  }
  remove(id) { this.deleteStmt.run(id); }
  search(query, opts) {
    if (opts?.vector) return this.hybridSearchStmt.all(query, new Float32Array(opts.vector), opts?.limit || 10);
    return this.ftsSearchStmt.all(query, opts?.limit || 10);
  }
  serialize() { /* copy .db file to buffer */ }
  deserialize(data) { /* write buffer to .db file, reopen */ }
}
```

**Leaks through abstraction:** SQL query construction (FTS5 MATCH syntax, sqlite-vec MATCH syntax, RRF CTE). The serialize/deserialize maps to file copy, not a pure in-memory operation. The `where` clause for topics requires SQL string construction.

**PGlite fit:**

```typescript
class PGliteSearchEngine implements SearchEngine {
  async index(doc) {
    await this.pg.query(
      `INSERT INTO search_index (doc_id, fts, embedding, topic)
       VALUES ($1, to_tsvector('english', $2), $3, $4)
       ON CONFLICT (doc_id) DO UPDATE SET ...`,
      [doc.id, doc.content || doc.frontmatter.title, doc.embedding, doc.frontmatter.topics?.[0]]
    );
  }
  async search(query, opts) {
    return await this.pg.query(`SELECT * FROM hybrid_search($1, $2, $3)`, [...]);
  }
  serialize() { /* PGlite doesn't have a clean serialize -- would need to copy data dir */ }
  deserialize(data) { /* write data dir, reinitialize PGlite */ }
}
```

**Leaks through abstraction:** Async everywhere (PGlite is inherently async due to WASM). serialize/deserialize maps to data directory copy, which is heavier than Orama's clean binary or SQLite's file copy. The SQL is PostgreSQL-specific (to_tsvector, <=> operator).

### Finding: The sync/async boundary is the most significant abstraction leak
**Confidence:** CONFIRMED

Orama and SQLite (via better-sqlite3) are synchronous. PGlite is async. The interface must accommodate both:

```typescript
interface SearchEngine {
  search(query: string, options?: SearchOptions): SearchResult[] | Promise<SearchResult[]>
}
```

This forces consumers to always `await` or handle the union type. In practice, wrapping sync engines in `Promise.resolve()` eliminates the issue, but it's an ergonomic cost.

If the interface is designed as async-first (`Promise<SearchResult[]>`), both Orama and SQLite work fine (trivial async wrapping). PGlite works natively. This is the pragmatic choice.

### Finding: Swap cost between engines with the abstraction layer is ~1-3 days per engine
**Confidence:** INFERRED

Each engine backend is ~100-200 lines of TypeScript:
- Schema/table creation
- insert/remove/search implementations
- serialize/deserialize
- Topic/permission filtering

Swapping means writing the new backend and rebuilding the index. The consumer code (MCP tools, commands) does not change.

The index rebuild is the variable: if embeddings are cached (stored alongside the index), rebuild is fast (~1s for BM25 at 1K docs). If embeddings must be regenerated, rebuild is slow (~100s for 1K docs). Caching embeddings separately from the search index is recommended.

---

## Decision Matrix

### Scoring methodology

Each dimension scored 1-5 (1 = poor fit, 5 = excellent fit) per engine. Weights from the user's architecture priorities.

| Dimension | Weight | Orama | SQLite FTS5+vec | PGlite+pgvector | Rationale |
|-----------|--------|-------|-----------------|-----------------|-----------|
| D1: Contentless CRDT | HIGH (3x) | 3 | 5 | 4 | SQLite has native contentless mode. PGlite has tsvector-only. Orama requires custom documentsStore. |
| D2: Per-branch lifecycle | HIGH (3x) | 4 | 5 | 2 | SQLite: file open/close (~1-5ms). Orama: serialize/deserialize (~50-100ms). PGlite: full instance restart (~200-500ms). |
| D3: Incremental re-index | MEDIUM (2x) | 5 | 5 | 4 | All <1ms for BM25 update. Embedding dominates. PGlite loses 1 for async overhead. |
| D4: Just-bash integration | LOW (1x) | 5 | 5 | 5 | Any engine wraps identically. |
| D5: Permission-scoped search | MEDIUM (2x) | 3 | 4 | 5 | PGlite: RLS policies, cloud-portable. SQLite: SQL JOINs. Orama: enum filter (limited for complex permissions). |
| D6: Migration path | MEDIUM (2x) | 3 | 3 | 4 | PGlite: ~95% SQL portable to cloud PG. SQLite/Orama: different engine entirely. But abstraction layer equalizes. |
| D7: Multi-language | LOW (1x) | 5 | 1 | 5 | SQLite FTS5: English only. Fatal for cloud/international. |
| D8: Concurrent read/write | LOW (1x) | 3 | 4 | 3 | Irrelevant for P0. Cloud uses different engine. SQLite WAL slightly better for local. |
| D9: Operational risk | HIGH (3x) | 4 | 5 | 2 | SQLite: 30 years stable. Orama: stable but v3 regression history. PGlite: alpha. |
| D10: Abstraction layer fit | MEDIUM (2x) | 5 | 4 | 3 | Orama: maps 1:1. SQLite: SQL translation. PGlite: async + SQL + serialize friction. |

### Weighted scores

| Engine | Raw Score | Weighted Score |
|--------|-----------|---------------|
| Orama | 40 | 76 |
| SQLite FTS5+vec | 41 | 85 |
| PGlite+pgvector | 37 | 64 |

### Score breakdown by weight tier

**HIGH-weight dimensions (D1, D2, D9):**
- SQLite: 15/15 (5+5+5)
- Orama: 11/15 (3+4+4)
- PGlite: 8/15 (4+2+2)

**MEDIUM-weight dimensions (D3, D5, D6, D10):**
- SQLite: 17/20 (5+4+3+4)
- Orama: 16/20 (5+3+3+5)
- PGlite: 16/20 (4+5+4+3)

**LOW-weight dimensions (D4, D7, D8):**
- SQLite: 10/15 (5+1+4)
- Orama: 13/15 (5+5+3)
- PGlite: 13/15 (5+5+3)

---

## Gaps / follow-ups

- Real-world benchmark: prototype all three backends behind the abstraction layer and measure actual latencies
- sqlite-vec Bun compatibility: Bun's native SQLite may not support extensions (system SQLite on macOS)
- Orama custom documentsStore: prototype to verify contentless operation works end-to-end
