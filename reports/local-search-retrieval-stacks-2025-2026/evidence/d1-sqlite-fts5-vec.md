# Evidence: SQLite FTS5 + sqlite-vec

**Dimension:** D5 — SQLite FTS5 + sqlite-vec
**Date:** 2026-04-03
**Sources:** sqlite.org, GitHub asg017/sqlite-vec, Alex Garcia blog posts, better-sqlite3 docs

---

## Key files / pages referenced

- [GitHub: asg017/sqlite-vec](https://github.com/asg017/sqlite-vec) — 7.3K stars, MIT/Apache-2.0
- [sqlite-vec v0.1.0 announcement](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- [sqlite-vec hybrid search blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html)
- [sqlite-vec JS docs](https://alexgarcia.xyz/sqlite-vec/js.html) — Node.js integration guide
- [SQLite FTS5 docs](https://www.sqlite.org/fts5.html) — BM25 scoring reference
- [Simon Willison on FTS5 ranking](https://simonwillison.net/2019/Jan/7/exploring-search-relevance-algorithms-sqlite/)
- [Simon Willison on hybrid search](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/)
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3)

---

## Findings

### Finding: sqlite-vec is maintained by Alex Garcia, v0.1.9, pre-v1 with breaking change warnings
**Confidence:** CONFIRMED
**Evidence:** [GitHub](https://github.com/asg017/sqlite-vec) — v0.1.9 (Mar 31, 2026), 87 releases, 7.3K stars

Sponsored by Mozilla Builders, Fly.io, Turso, SQLite Cloud, Shinkai. Written in C with zero dependencies. Supports float32, int8, and bit vectors. Distance metrics: L2, cosine, inner product. SIMD acceleration via AVX (x86) and NEON (ARM).

**Implications:** Actively maintained by a well-known SQLite extension developer with significant sponsorship. Pre-v1 API may change, but v0.1.x has been stable for production-light use.

### Finding: FTS5 implements standard Okapi BM25 with hardcoded k1=1.2, b=0.75
**Confidence:** CONFIRMED
**Evidence:** [SQLite FTS5 docs](https://www.sqlite.org/fts5.html)

`bm25()` returns negative values (more negative = better). Column weighting supported. `ORDER BY rank` is faster than `ORDER BY bm25()` due to lazy pre-computation. Porter stemmer built-in (English only). Unicode61 tokenizer handles most Latin scripts.

**Implications:** Adequate BM25 for English developer documentation. No multi-language stemming — but for an English tech knowledge base, this is sufficient.

### Finding: Documented RRF hybrid search pattern combining FTS5 + sqlite-vec in a single SQL query
**Confidence:** CONFIRMED
**Evidence:** [Alex Garcia hybrid search blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html), [Simon Willison coverage](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/)

Three strategies documented: (1) Keyword-first union, (2) Reciprocal Rank Fusion via CTEs, (3) FTS-first + vector re-ranking. RRF avoids score normalization issues by using rank positions only.

```sql
WITH fts_matches AS (
  SELECT rowid, row_number() OVER (ORDER BY rank) AS rank_number
  FROM docs WHERE docs MATCH :query ORDER BY rank LIMIT :k
),
vec_matches AS (
  SELECT rowid, row_number() OVER (ORDER BY distance) AS rank_number
  FROM vec_index WHERE embedding MATCH :embedding AND k = :k
)
SELECT docs.text,
  (COALESCE(1.0 / (:rrf_k + fts_matches.rank_number), 0.0) * :weight_fts +
   COALESCE(1.0 / (:rrf_k + vec_matches.rank_number), 0.0) * :weight_vec)
  AS combined_rank
FROM docs
LEFT JOIN fts_matches ON docs.rowid = fts_matches.rowid
LEFT JOIN vec_matches ON docs.rowid = vec_matches.rowid
WHERE fts_matches.rowid IS NOT NULL OR vec_matches.rowid IS NOT NULL
ORDER BY combined_rank DESC
```

**Implications:** Hybrid search is achievable but requires implementing the fusion query yourself. Not a single API call — but the SQL is well-documented and copy-pasteable.

### Finding: better-sqlite3 + sqlite-vec npm provides excellent Node.js integration
**Confidence:** CONFIRMED
**Evidence:** [sqlite-vec JS docs](https://alexgarcia.xyz/sqlite-vec/js.html)

Official npm package: `npm install sqlite-vec`. Loading pattern:
```javascript
import * as sqliteVec from "sqlite-vec";
import Database from "better-sqlite3";
const db = new Database(":memory:");
sqliteVec.load(db);
```

Compatible with better-sqlite3, node:sqlite (Node 23.5+), node-sqlite3, Deno, and Bun. FTS5 requires no extension — built into SQLite.

**Implications:** Best Node.js integration story in this comparison. Single `npm install` for the entire hybrid search stack.

### Finding: ~7-12MB disk, ~10-50MB RAM for 1,000 docs with 768-dim embeddings
**Confidence:** CONFIRMED (calculated)
**Evidence:** Calculation: 768 * 4 bytes * 1,000 = 3MB vectors + 2-5MB FTS5 index + 1-3MB content = 7-12MB disk. SQLite pages in via cache (default 2MB, configurable). With mmap: entire DB in ~30-50MB window.

100K vectors at 384 dims benchmark: ~68ms on M1 Pro. For 1,000 docs: well under 10ms for vector portion. FTS5 on 1,000 docs: sub-millisecond.

**Implications:** Extremely lightweight. Fits comfortably in any memory budget. Disk-based with mmap means predictable memory usage.

### Finding: sqlite-vec is brute-force only — no ANN index in stable releases
**Confidence:** CONFIRMED
**Evidence:** [v0.1.0 announcement](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) — "sqlite-vec as of v0.1.0 will be brute-force search only"

ANN (IVF, HNSW, DiskANN) planned pre-v1 but experimental alpha only as of April 2026. Practical latency ceiling ~50K-100K vectors under 100ms for 768-dim.

**Implications:** No concern at 1,000 docs. Brute force through 3MB of float data is sub-10ms. Becomes relevant only at much larger scale.

---

## Gaps / follow-ups

- FTS5 porter stemmer is English-only — verify this is sufficient for the target use case
- sqlite-vec ANN index timeline unclear — may be important for future scaling
- Need to verify Bun compatibility caveat (system SQLite on macOS may not allow extensions)
