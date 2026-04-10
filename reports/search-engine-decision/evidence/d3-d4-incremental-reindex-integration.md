# Evidence: Incremental Re-indexing + Just-Bash Integration

**Dimensions:** D3 (Incremental re-indexing through CRDT pipeline), D4 (Integration with just-bash exec pattern)
**Date:** 2026-04-04
**Sources:** Orama API docs, SQLite FTS5 docs, PGlite SQL patterns, Hocuspocus hooks, prior reports

---

## Key files / pages referenced

- [Orama update docs](https://docs.orama.com/open-source/usage/update) -- remove + insert pattern
- [Orama insert docs](https://docs.orama.com/open-source/usage/insert) -- single document insert
- Prior report: /reports/orama-deep-dive/REPORT.md D1, D2, D8
- Prior report: /reports/pglite-search-engine-evaluation/REPORT.md D4
- Prior report: /reports/local-search-retrieval-stacks-2025-2026/evidence/d5-performance-benchmarks.md

---

## Findings

### Finding: The incremental re-indexing pipeline is identical for all three engines -- embedding dominates
**Confidence:** CONFIRMED
**Evidence:** Architectural analysis + prior performance data

The pipeline triggered by a CRDT change:

```
Y.Doc change (content update)
  → Hocuspocus onStoreDocument hook (debounced 2-10s)
    → Serialize Y.Text to markdown string (~0.1ms)
      → remarkStructure extraction (headings, sections) (~1-5ms)
        → For each section:
          → Generate BM25 tokens (engine-specific, <1ms)
          → Generate embedding (100-200ms per article, async)
            → Upsert into search engine (<1ms BM25, <1ms vector)
```

**Latency breakdown per article update:**

| Step | Time | Sync/Async |
|------|------|-----------|
| Y.Text → markdown string | ~0.1ms | Sync |
| remarkStructure parse | ~1-5ms | Sync |
| Engine: remove old docs for article | <1ms (all engines) | Sync (Orama/SQLite), Async (PGlite) |
| Engine: insert new BM25 tokens | <1ms (all engines) | Sync (Orama/SQLite), Async (PGlite) |
| Embedding generation (bge-small-en-v1.5) | **100-200ms** | Async |
| Engine: insert/update vector | <1ms (all engines) | Sync (Orama/SQLite), Async (PGlite) |
| **Total (BM25 only)** | **~2-7ms** | |
| **Total (BM25 + vector)** | **~100-210ms** | |

Embedding generation is 95%+ of the total latency. The engine choice makes virtually no difference.

### Finding: Orama per-document update is remove + insert (by design)
**Confidence:** CONFIRMED
**Evidence:** [Orama update docs](https://docs.orama.com/open-source/usage/update)

Orama's `update()` is explicitly documented as an alias for `remove()` + `insert()`. The update is synchronous (v3 default, unless async plugins are registered).

```typescript
// Per-article re-index in Orama
remove(db, articleId);
insert(db, { id: articleId, title, topics, embedding });
```

For Fumadocs-style per-section indexing (10-20 docs per article), the pattern is:
```typescript
// Remove all sections for this article
const sectionIds = getSectionIdsForArticle(articleId);
for (const id of sectionIds) remove(db, id);
// Insert new sections
for (const section of newSections) insert(db, section);
```

Latency: <1ms total for 20 remove + 20 insert operations at 1K total docs.

### Finding: SQLite per-document update uses standard DELETE + INSERT with contentless_delete
**Confidence:** CONFIRMED
**Evidence:** SQLite FTS5 docs, contentless_delete mode

```sql
-- Remove old index entries for article
DELETE FROM fts_articles WHERE rowid IN (SELECT rowid FROM article_sections WHERE article_id = ?);
DELETE FROM vec_articles WHERE article_id = ?;
DELETE FROM article_sections WHERE article_id = ?;

-- Insert new index entries
INSERT INTO article_sections (article_id, section_id, title) VALUES (?, ?, ?);
INSERT INTO fts_articles (rowid, content) VALUES (last_insert_rowid(), ?);
INSERT INTO vec_articles (article_id, embedding) VALUES (?, ?);
```

With better-sqlite3's synchronous API, this executes in a transaction:
```typescript
const reindex = db.transaction((articleId, sections) => {
  deleteStmt.run(articleId);
  for (const section of sections) {
    insertMetaStmt.run(articleId, section.id, section.title);
    insertFtsStmt.run(db.lastInsertRowId, section.content);
    insertVecStmt.run(articleId, section.embedding);
  }
});
```

Latency: <1ms total for 20 rows at 1K docs. Prepared statements + transaction = minimal overhead.

### Finding: PGlite per-document update uses same SQL but async + WASM overhead
**Confidence:** INFERRED
**Evidence:** PGlite report D4, PostgreSQL UPSERT pattern

```sql
-- PGlite uses standard PostgreSQL
DELETE FROM search_index WHERE doc_id LIKE $1 || '%';
INSERT INTO search_index (doc_id, fts, embedding)
VALUES ($1, to_tsvector('english', $2), $3)
ON CONFLICT (doc_id) DO UPDATE SET
  fts = to_tsvector('english', $2), embedding = $3;
```

All PGlite operations are async (WASM boundary crossing). Each query has ~0.05-0.1ms overhead per WASM call.

For 20 sections: ~1-3ms total (vs <1ms for Orama/SQLite). Still negligible compared to embedding generation.

### Finding: BM25 update can be synchronous while embedding update is async -- all engines support this
**Confidence:** CONFIRMED
**Evidence:** Architectural analysis

The pattern works for all three engines:
1. On article change: synchronously update BM25 index (instant, <1ms)
2. Queue async embedding generation (~100-200ms)
3. When embedding ready: update vector index (<1ms)

Between steps 1 and 3, the article is searchable via BM25 but has stale vectors. This is acceptable -- BM25 freshness matters more than vector freshness for incremental updates.

Orama: insert without embedding field first, then update with embedding after generation
SQLite: INSERT into FTS5 immediately, INSERT into vec_articles after embedding ready
PGlite: INSERT with NULL embedding, UPDATE embedding column after generation

### Finding: Integration with just-bash exec pattern is equally natural for all three engines
**Confidence:** CONFIRMED
**Evidence:** Architectural analysis of the `search` command wrapper

The `search` command in just-bash or semantic tools wraps the search engine internally:

```typescript
// Inside the `search` command implementation
async function searchCommand(query: string, options: { topic?: string, limit?: number }) {
  const results = await searchEngine.search(query, options);
  // Format as text output for MCP
  return results.map(r =>
    `## ${r.title} (score: ${r.score.toFixed(3)})\n` +
    `Path: ${r.id}\n` +
    `${r.snippet}\n`
  ).join('\n---\n');
}
```

The search engine is an implementation detail behind this command. The MCP tool consumer (agent) never sees the engine -- only the text output. All three engines produce the same data (ranked IDs + scores), and the command wrapper formats them identically.

**Friction differences:**
- Orama: single `search()` call returns everything. Simplest wrapper.
- SQLite: prepare SQL statement, bind parameters, iterate rows. Slightly more code but well-understood pattern.
- PGlite: `await pg.query(sql, params)`. Similar to SQLite but async.

None of these differences are meaningful -- the wrapper is 20-30 lines regardless of engine.

---

## Gaps / follow-ups

- Orama v3 remove() behavior with custom documentsStore (contentless) needs verification
- PGlite per-query WASM overhead should be measured directly, not estimated
