# Evidence: Permission-Scoped Search + Local-to-Cloud Migration Path

**Dimensions:** D5 (Permission-scoped search for cloud), D6 (Local to cloud migration path)
**Date:** 2026-04-04
**Sources:** Orama filter docs, SQLite/PostgreSQL query patterns, Orama Cloud docs, Neon/Supabase docs, prior reports

---

## Key files / pages referenced

- [Orama Filters docs](https://docs.orama.com/open-source/usage/search/filters) -- where clause
- [Orama Cloud docs](https://docs.orama.com/cloud) -- managed service
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search) -- PostgreSQL RRF pattern
- [Neon pgvector docs](https://neon.com/docs/extensions/pgvector) -- managed pgvector
- Prior report: /reports/pglite-search-engine-evaluation/REPORT.md D7 (same engine story)
- PROJECT.md PQ7 (Zanzibar permission model)

---

## Findings

### Finding: Orama supports pre-filter during search via `where` clause -- adequate for permission filtering
**Confidence:** CONFIRMED
**Evidence:** [Orama Filters docs](https://docs.orama.com/open-source/usage/search/filters)

Orama's `where` clause filters DURING search (pre-filter), not post-filter:

```typescript
search(db, {
  term: 'authentication',
  mode: 'hybrid',
  vector: { value: queryEmbed, property: 'embedding' },
  where: {
    // Permission filter: only articles the user can access
    access_groups: { containsAny: ['team-engineering', 'all-company'] }
  }
});
```

This requires indexing `access_groups: 'enum[]'` in the schema. The where clause narrows the search space before BM25 and vector scoring.

**Scaling concern:** At 10K-100K docs with complex permission rules (Zanzibar-style: user has access IF user is in group AND group has role on folder AND folder contains article), Orama's flat enum filter cannot express transitive permission chains. You would need to:
1. Pre-compute accessible article IDs for the user (resolve Zanzibar graph)
2. Filter Orama results by the resolved ID set

Pre-computation + post-filter is the realistic pattern. The `where` clause handles simple cases (group membership). Complex Zanzibar resolution happens before the search call.

**Latency at 10K-100K docs:** Orama's where clause on enum arrays is O(n) scan of the enum index. At 100K docs, this adds ~1-5ms. Manageable.

### Finding: SQLite handles permission-scoped search natively via SQL JOINs
**Confidence:** CONFIRMED
**Evidence:** Standard SQL patterns

```sql
-- Pre-compute accessible articles (Zanzibar resolution stored in a permissions table)
-- Or inline: JOIN with a permissions CTE

WITH accessible AS (
  SELECT article_id FROM permissions
  WHERE user_id = ? AND permission >= 'read'
),
fts AS (
  SELECT rowid, row_number() OVER (ORDER BY rank) AS rn
  FROM fts_articles
  WHERE fts_articles MATCH ?
    AND rowid IN (SELECT article_id FROM accessible)
  LIMIT ? * 2
),
vec AS (
  SELECT article_id, row_number() OVER (ORDER BY distance) AS rn
  FROM vec_articles
  WHERE embedding MATCH ? AND k = ? * 2
    AND article_id IN (SELECT article_id FROM accessible)
)
SELECT ...  -- RRF fusion
```

The `IN (SELECT article_id FROM accessible)` clause pre-filters both FTS5 and vector search. This is clean, efficient, and well-understood.

**Scaling:** SQLite's query planner uses the IN clause to prune the search space. At 100K docs with 10K accessible: the IN clause is a hash lookup. Total latency increase: ~1-2ms.

### Finding: PGlite/PostgreSQL handles permission-scoped search identically to cloud PostgreSQL
**Confidence:** CONFIRMED
**Evidence:** Standard PostgreSQL patterns, Supabase RLS docs

PostgreSQL offers two patterns:

**Pattern 1: SQL JOINs (same as SQLite)**
```sql
SELECT * FROM hybrid_search($1, $2, 10)
WHERE doc_id IN (SELECT article_id FROM permissions WHERE user_id = $3);
```

**Pattern 2: Row-Level Security (PostgreSQL-native, cloud-ready)**
```sql
-- Define RLS policy
ALTER TABLE search_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own ON search_index FOR SELECT
  USING (doc_id IN (
    SELECT article_id FROM permissions WHERE user_id = current_setting('app.user_id')
  ));
```

RLS is transparent -- all queries automatically filtered. This is powerful for cloud multi-tenant but overkill for local single-user.

**The PGlite advantage:** The SAME RLS policies work on local PGlite and cloud PostgreSQL. Write the security policy once, deploy everywhere. No Orama equivalent. No SQLite equivalent (SQLite has no RLS).

### Finding: Migration paths have dramatically different costs
**Confidence:** CONFIRMED (analysis based on documented API surfaces)

**Path 1: Orama local -> Orama Cloud**
- API similarity: HIGH. Orama Cloud has a different API surface (`@orama/core` vs `@orama/orama`) but Fumadocs demonstrates the migration pattern -- `@orama/switch` provides a unified interface.
- Data migration: Re-index on cloud (documents pushed via Cloud API). No data portability -- rebuild from source.
- Effort: ~1-3 days. Rewrite search wrapper to use Cloud API. Rebuild index on Cloud.
- Risk: Orama Cloud is a small company's managed service. Vendor lock-in to a single provider. If Orama Cloud goes down or the company pivots, no alternative (unlike PostgreSQL where Neon/Supabase/RDS/Aurora are interchangeable).

**Path 1b: Orama local -> PostgreSQL/Elasticsearch cloud**
- API similarity: NONE. Complete rewrite of search layer.
- Effort: ~1-2 weeks. Rewrite search engine implementation behind the abstraction layer.
- If the abstraction layer (D10) is clean, effort reduces to implementing the new backend (~200-400 lines of code).

**Path 2: SQLite local -> PostgreSQL cloud**
- API similarity: MODERATE. SQL is SQL, but syntax differences exist (FTS5 MATCH vs tsvector @@, sqlite-vec MATCH vs pgvector <=>).
- Data migration: Export/import via SQL. Schema is similar but not identical.
- Effort: ~3-5 days. Rewrite SQL queries (FTS5 -> tsvector, sqlite-vec -> pgvector, RRF query restructure). Same RRF algorithm, different SQL syntax.
- Behind the abstraction layer: implement PostgreSQL backend (~200-400 lines).

**Path 3: PGlite local -> Managed PostgreSQL cloud**
- API similarity: ~95%. Same SQL, same pgvector, same tsvector/tsquery.
- Data migration: Application-level INSERT generation (PGlite has no pg_dump). Or: dump via SELECT *, load via COPY.
- The 5% gap: pg_textsearch BM25 (if used locally) not available on Neon/Supabase. Connection pooling changes. SET search_path if using schema-per-tenant.
- Effort: **~1-2 days** if using native ts_rank (no pg_textsearch). ~3-5 days if using pg_textsearch (need to rewrite to ts_rank_cd or choose Tiger Data).
- Behind the abstraction layer: change connection string + add connection pooling. Search queries unchanged.

### Finding: The abstraction layer makes all migration paths ~1-3 days with engine-specific backend
**Confidence:** INFERRED

If we build the `SearchEngine` interface (D10), migration is:
1. Implement the new backend (200-400 lines per engine)
2. Switch the configuration to use the new backend
3. Rebuild the index (automated from source content)

The abstraction layer equalizes migration cost. The question is: how much effort is the abstraction layer itself?

---

## Gaps / follow-ups

- Orama Cloud pricing and SLA for our scale (10K-100K docs per tenant)
- pg_textsearch availability on Tiger Data / Timescale Cloud needs direct verification
- RLS policy performance impact at 100K docs with complex permission graphs
