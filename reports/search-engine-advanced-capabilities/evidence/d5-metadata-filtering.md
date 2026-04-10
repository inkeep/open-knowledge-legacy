# Evidence: Metadata Filtering & Faceted Search

**Dimension:** D5 — Filter syntax, pre/post filtering, facets, geo, combined queries
**Date:** 2026-04-04
**Sources:** Orama docs, sqlite-vec blog, pgvector GitHub, pgfaceting, PostGIS

---

## Key files / pages referenced

- [Orama filters docs](https://docs.orama.com/open-source/usage/search/filters) — where clause operators
- [Orama facets docs](https://docs.orama.com/open-source/usage/search/facets) — native faceting
- [Orama geosearch docs](https://docs.orama.com/open-source/usage/search/geosearch) — BKD tree
- [sqlite-vec metadata release](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) — v0.1.6 metadata columns
- [pgvector 0.8.0 iterative scan](https://www.postgresql.org/about/news/pgvector-080-released-2952/) — filtered search fix
- [pgfaceting extension](https://github.com/cybertec-postgresql/pgfaceting) — Roaring Bitmap facets

---

## Findings

### Finding: Orama has the richest built-in filter + facet + geo experience
**Confidence:** CONFIRMED
Single `search()` call combines: FTS + vector + where filters + facets + geosearch. Native facets (string, number ranges, boolean, enum). Geopoint with radius search via BKD trees. Dot notation for nested objects.

### Finding: sqlite-vec added metadata filtering in v0.1.6 with bitmap pre-filtering
**Confidence:** CONFIRMED
Metadata columns: boolean, integer, float, text. Pre-filter via bitmap intersection. Partition keys for ~3x speedup. No LIKE/REGEXP. No NULLs. No facets. No geo.

### Finding: pgvector uses post-filtering, fixed in v0.8.0 with iterative scan
**Confidence:** CONFIRMED
HNSW traverses first, WHERE applied after. High-selectivity filters historically problematic. v0.8.0 iterative_scan: up to 5.7x faster, 100x better result completeness. Full SQL + JSONB + PostGIS available.

### Finding: Only Orama has native faceted search
**Confidence:** CONFIRMED
PostgreSQL can do facets via GROUP BY or pgfaceting extension (Roaring Bitmaps). sqlite-vec has no faceting support.

---

## Gaps / follow-ups

- Orama filter performance not benchmarked publicly at scale
- pgvector iterative_scan + highly selective filters needs real-world validation
