# Evidence: Multi-Language, Concurrent Read/Write, Operational Risk

**Dimensions:** D7 (Multi-language support), D8 (Concurrent read/write for cloud), D9 (Operational complexity and failure modes)
**Date:** 2026-04-04
**Sources:** Prior reports, engine documentation, GitHub issues

---

## Key files / pages referenced

- Prior report: /reports/orama-deep-dive/REPORT.md D1, D7, D10
- Prior report: /reports/pglite-search-engine-evaluation/REPORT.md D3, D6
- Prior report: /reports/local-search-retrieval-stacks-2025-2026/evidence/d1-orama.md
- Prior report: /reports/local-search-retrieval-stacks-2025-2026/evidence/d1-sqlite-fts5-vec.md
- [SQLite FTS5 tokenizers](https://www.sqlite.org/fts5.html#tokenizers)
- [PostgreSQL Snowball stemmers](https://www.postgresql.org/docs/current/textsearch-dictionaries.html)

---

## Findings

### Finding: Multi-language stemming -- SQLite is the clear loser, Orama and PostgreSQL both strong
**Confidence:** CONFIRMED
**Evidence:** Prior reports + official docs

| Engine | Languages | Mechanism | Out-of-box |
|--------|-----------|-----------|-----------|
| Orama | 30+ | @orama/stemmers package (Snowball-derived) | English only in core; others via package |
| SQLite FTS5 | 1 (English) | Porter stemmer built-in. Unicode61 tokenizer. | English only. No multi-language stemming. |
| PostgreSQL/PGlite | 30+ | Snowball dictionaries built-in to PostgreSQL | All 30+ available immediately |

SQLite FTS5's limitation: only the English porter stemmer. For other languages, you would need to implement a custom tokenizer in C -- not viable for our architecture.

For P0 (English developer audience): all three engines are equivalent (English BM25 works).
For cloud (global teams): SQLite FTS5 becomes a significant limitation. Orama and PostgreSQL both handle international content natively.

CJK support: Orama has `@orama/tokenizers` for Japanese and Chinese segmentation. PostgreSQL requires third-party extensions (not built-in). SQLite FTS5 has no CJK support.

### Finding: Concurrent read/write -- irrelevant for P0 local, cloud uses a different engine regardless
**Confidence:** CONFIRMED
**Evidence:** Architectural analysis

**Local (P0): Single user, single writer.**
- Orama: single-threaded in-memory. No concurrency concern. One user searches while their own edits trigger re-indexing -- these are sequential in the same event loop.
- SQLite: WAL mode allows reads during writes. But with one user, this is academic.
- PGlite: WASM single-threaded. Same as Orama -- no concurrency concern for single user.

**Cloud (Later): Multiple concurrent users.**
- If cloud uses managed PostgreSQL (likely): full MVCC concurrency. Concurrent readers and writers natively. No concern.
- If cloud uses Orama Cloud: their managed service handles concurrency. No concern.
- If cloud uses SQLite: WAL mode allows concurrent reads but only one writer. Would need write serialization. Less natural for multi-tenant.

**The local engine choice does NOT constrain the cloud concurrency model.** Cloud will almost certainly use a different engine (managed PostgreSQL, Elasticsearch, or Orama Cloud). The local engine's concurrency properties are irrelevant to the cloud product.

### Finding: Operational risk matrix -- SQLite is most stable, Orama is adequate, PGlite is risky
**Confidence:** CONFIRMED
**Evidence:** Prior reports (maturity sections of all three deep-dives)

**Orama operational risk (MEDIUM):**
- v3.0 tokenization regression (issue #869): broke search for 7 months. Root cause: small team, major refactor.
- In-memory = data loss on crash. Mitigated by: CRDT is source of truth, search index is derived/rebuildable.
- Schema fixed at creation -- no field addition without rebuild. At 1K docs, rebuild is <1s.
- No production search failures beyond the v3.0 regression. Fumadocs and Deno docs use it successfully.
- Debugging: `save(db)` dumps the entire index as JSON for inspection. Good.

**SQLite FTS5 + sqlite-vec operational risk (LOW):**
- SQLite itself: 30+ years of battle-testing. Used by every major OS, browser, mobile app.
- FTS5: stable, part of SQLite amalgamation, well-documented.
- sqlite-vec: pre-v1 (v0.1.9). This is the primary risk factor. However: maintained by Alex Garcia (well-known, sponsored by Mozilla/Fly.io/Turso), actively developed, simple C codebase.
- better-sqlite3: 8 years stable, 5M weekly downloads, prebuild binaries for all platforms.
- Native addon friction: better-sqlite3 requires prebuild binaries. Occasionally breaks on new Node.js versions or unusual platforms. Mitigated by: prebuilds for all major platforms, widespread usage.
- Debugging: standard SQLite tooling (sqlite3 CLI, DB Browser). Excellent.
- WAL edge case: WAL mode has a known 2GB limitation on 32-bit systems. Not relevant (all modern dev machines are 64-bit).

**PGlite operational risk (HIGH):**
- Alpha (v0.4.2): pre-v1, not recommended for production by its own documentation.
- No production search users identified. PGlite's downloads are driven by CI testing (Prisma), not production search.
- WASM memory limits: 2GB per instance (V8 WASM heap limit). At 1K docs this is not a concern, but it's an architectural ceiling.
- pg_textsearch: experimental extension. No one has publicly tested it in PGlite's WASM environment for search workloads.
- ElectricSQL funding: $5M seed. Modest. If funding runs out, PGlite maintenance depends on community.
- Debugging: standard PostgreSQL tooling does NOT work directly with PGlite (no pg_dump, no psql). Must use the JavaScript API for inspection.

### Finding: Debugging and inspection capabilities favor SQLite, then Orama, then PGlite
**Confidence:** CONFIRMED
**Evidence:** Tooling landscape analysis

| Capability | Orama | SQLite | PGlite |
|-----------|-------|--------|--------|
| CLI inspection | No (JS library) | sqlite3 CLI | No (WASM, no psql) |
| GUI inspection | No | DB Browser for SQLite | No |
| JSON dump | Yes (save to JSON) | .dump command | SQL queries only |
| Index contents | Via save() JSON | Standard SQL queries | Standard SQL queries |
| Explain query plan | No | EXPLAIN QUERY PLAN | EXPLAIN (but WASM) |
| Third-party tools | None | Dozens | None (PGlite-specific) |

SQLite has the richest debugging ecosystem. Orama's JSON save provides adequate inspection for our scale. PGlite lacks tools beyond its JavaScript API.

---

## Gaps / follow-ups

- sqlite-vec v1.0 timeline and ANN index roadmap
- Orama v3 regression -- has the root cause been addressed structurally, or could it recur?
- PGlite v1.0 timeline -- no published date
