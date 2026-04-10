# Evidence: Contentless Operation -- Index-Only with Content from CRDT

**Dimension:** D1 -- Contentless operation
**Date:** 2026-04-04
**Sources:** Orama docs, SQLite FTS5 docs, PostgreSQL docs, Orama source code analysis (prior reports), PGlite report

---

## Key files / pages referenced

- [Orama Components docs](https://docs.orama.com/open-source/internals/components) -- documentsStore component API
- [Orama Schema Optimization blog](https://orama.com/blog/optimizing-orama-schema-optimization) -- schema advice
- [SQLite FTS5 docs](https://www.sqlite.org/fts5.html) -- contentless and contentless-delete modes
- [PostgreSQL tsvector docs](https://www.postgresql.org/docs/current/datatype-textsearch.html) -- tsvector-only tables
- Prior report: /reports/orama-deep-dive/REPORT.md -- D2 (schema/document model), D6 (persistence)
- Prior report: /reports/pglite-search-engine-evaluation/REPORT.md -- D9 (contentless FTS)
- Prior report: /reports/local-search-retrieval-stacks-2025-2026/evidence/d1-sqlite-fts5-vec.md

---

## Findings

### Finding: Orama stores documents in its documentsStore and returns them from search results -- NOT purely index-only
**Confidence:** CONFIRMED
**Evidence:** Orama source code analysis (prior orama-deep-dive D2), Orama components docs

Orama's search() returns full document objects from its internal `documentsStore`. The `documentsStore` component has a `get(store, id)` method that retrieves stored documents. When you `insert(db, doc)`, Orama stores the entire document in the documentsStore AND indexes the searchable fields in the text/vector indexes.

However, Orama's schema optimization guidance states: "An Orama Schema should therefore only contain the data we want to search through." And: "Orama will only index properties specified in the schema but will allow you to set and store additional data if needed."

The architecture implication: if you define `schema: { title: 'string', embedding: 'vector[384]' }` but insert `{ id: 'article-1', title: 'Deploy Guide', content: 'full text...', embedding: [...] }`, Orama stores the full document object (including `content`) but only indexes `title` and `embedding`.

**For contentless operation:** You would define only the fields needed for ranking in the schema, AND only pass those fields when inserting. Example:
```typescript
const db = create({
  schema: { title: 'string', topics: 'enum[]', embedding: 'vector[384]' }
});
insert(db, { id: 'article-1', title: 'Deploy Guide', topics: ['deployment'], embedding: [...] });
// Content NOT stored -- only ranking fields
```

Search returns `{ id, title, topics, embedding, score }`. To get content, read from CRDT Y.Doc using the id.

**The BM25 question:** If you want BM25 ranking on article content, you MUST pass the content text to Orama for tokenization. Orama's BM25 index (Radix trie) stores tokenized terms, not the original text. So you could pass content for BM25 indexing without needing to retrieve it -- BUT the content IS stored in the documentsStore.

**Workaround for truly contentless BM25:** Use Orama's custom `documentsStore` component to implement a no-op store. The components API allows replacing `documentsStore` with a custom implementation. A custom store could store only the document ID, discarding content after tokenization:
```typescript
const db = create({
  schema: { content: 'string', embedding: 'vector[384]' },
  components: {
    documentsStore: {
      // Custom implementation that stores IDs only
      create: () => ({ docs: new Map(), count: 0 }),
      get: (store, id) => ({ id }),  // Return ID only
      store: (store, id, doc) => { store.docs.set(id, { id }); store.count++; },
      // ... other methods
    }
  }
});
```

This is feasible but requires implementing the full documentsStore interface. Orama's internal search pipeline would still work -- BM25 scoring happens in the index, not the store. The store is only consulted when building the result objects.

**Implications:** Orama can operate semi-contentless with careful schema design (don't include content field). For full BM25 on content, a custom documentsStore is needed to avoid storing the original text. Moderate engineering effort (~50-100 lines).

### Finding: SQLite FTS5 has native contentless mode -- purpose-built for this pattern
**Confidence:** CONFIRMED
**Evidence:** [SQLite FTS5 docs](https://www.sqlite.org/fts5.html), contentless_delete option since SQLite 3.43

SQLite FTS5 provides two contentless modes:

**Mode 1: Contentless (`content=''`)**
```sql
CREATE VIRTUAL TABLE search_index USING fts5(content, content='');
```
- Only stores the inverted index (token positions, document lengths for BM25)
- Does NOT store original text
- Snippet() and highlight() functions do NOT work (they need original text)
- DELETE requires the special `INSERT INTO search_index(search_index, rowid, content) VALUES('delete', ?, ?)` command
- INSERT must provide explicit rowid

**Mode 2: Contentless-Delete (`content='', contentless_delete=1`)** -- Since SQLite 3.43.0 (2023-08)
```sql
CREATE VIRTUAL TABLE search_index USING fts5(content, content='', contentless_delete=1);
```
- Same as Mode 1 but supports standard DELETE and UPDATE statements
- Much more natural for our per-article update pattern
- UPDATE requires providing ALL columns (not partial updates)

**Combined with sqlite-vec for vector search:**
```sql
-- Contentless FTS5 for BM25
CREATE VIRTUAL TABLE fts_articles USING fts5(content, content='', contentless_delete=1);

-- sqlite-vec for vector search (inherently contentless -- stores only vectors)
CREATE VIRTUAL TABLE vec_articles USING vec0(article_id INTEGER PRIMARY KEY, embedding float[384]);

-- Metadata table (small -- just IDs, titles, frontmatter)
CREATE TABLE articles (id TEXT PRIMARY KEY, title TEXT, topic TEXT);
```

Storage reduction: at 1K articles with ~5KB average content, the content alone is ~5MB. Contentless FTS5 stores only the inverted index (~500KB-1MB estimated). sqlite-vec stores vectors (~1.5MB for 384-dim). Total: ~2-3MB vs ~7-8MB with content stored. ~60-70% reduction.

**Implications:** SQLite FTS5 contentless mode is purpose-built for exactly our use case. It's the cleanest path to "scoring index only." The contentless_delete option (since 3.43) solves the DELETE limitation.

### Finding: PostgreSQL achieves contentless via tsvector-only table -- standard pattern, no hack
**Confidence:** CONFIRMED
**Evidence:** [PostgreSQL docs](https://www.postgresql.org/docs/current/datatype-textsearch.html), prior PGlite report D9

PostgreSQL does not have a formal "contentless" mode like FTS5. The standard pattern:

```sql
CREATE TABLE search_index (
  doc_id TEXT PRIMARY KEY,
  fts tsvector NOT NULL,
  embedding vector(384)
);
CREATE INDEX ON search_index USING GIN(fts);
CREATE INDEX ON search_index USING hnsw (embedding vector_cosine_ops);
```

The tsvector column stores lexemes with positions -- NOT the original text. The original text is discarded after `to_tsvector('english', content)`. To reconstruct text from tsvector would require reversing stemming and stop-word removal -- effectively impossible.

Storage: tsvector for 1K articles (~500KB estimated), vector embeddings (~1.5MB), doc_id + metadata (~100KB). Total: ~2MB. Similar to SQLite contentless.

The difference from SQLite: more explicit (5-10 lines SQL setup vs 1-line FTS5 option), but achieves the same result. UPSERTs work naturally with `ON CONFLICT DO UPDATE`.

**Implications:** PGlite's contentless approach is standard PostgreSQL -- well-documented, well-understood, portable to cloud. Slightly more setup than SQLite FTS5 but functionally equivalent.

### Finding: Snippet generation from CRDT adds ~0.5-2ms per result at 1K docs
**Confidence:** INFERRED
**Evidence:** Yjs Y.Doc access patterns, typical in-memory data structure performance

When the search engine returns ranked IDs (contentless), constructing snippets requires:
1. For each result ID, look up the Y.Doc (in-memory Map lookup: <0.01ms)
2. Extract the Y.Text content as string (~0.1-0.2ms per doc)
3. Find the matching terms in the content string (regex or string search: <0.1ms)
4. Extract a window around the match (substring: <0.01ms)

For top-10 results: ~1-2ms total. This is negligible compared to the search itself (1-15ms depending on engine).

The latency is the SAME regardless of which search engine we use -- all three return IDs, and we read content from CRDT for all three.

**Implications:** Contentless operation has no meaningful latency penalty for our architecture. The CRDT read is fast because Y.Docs are already in memory (Hocuspocus keeps them loaded).

---

## Gaps / follow-ups

- Orama's custom documentsStore API needs verification at the implementation level -- the components API documentation is sparse on exact method signatures
- FTS5 contentless_delete compatibility with better-sqlite3's bundled SQLite version needs confirmation (better-sqlite3 bundles SQLite 3.47+ as of v11, which includes 3.43 features)
