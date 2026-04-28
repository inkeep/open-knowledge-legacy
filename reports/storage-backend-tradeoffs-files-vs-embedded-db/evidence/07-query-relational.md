---
title: "Query + relational capabilities"
description: "Filter/sort/aggregate, joins, foreign keys, unique constraints, multi-table invariants, complex queries, indexing, FTS, and when SQL pays off across 10 storage backends"
date: 2026-04-23
sources:
  - SQLite official documentation (sqlite.org): json1.html, fts5.html, lang_with.html, lang_aggfunc.html, gencol.html, foreignkeys.html, partialindex.html, windowfunctions.html, optoverview.html
  - PostgreSQL official documentation (postgresql.org): GIN indexes, JSON types, text search types, window functions
  - PGlite documentation + repo (electric-sql/pglite, pglite.dev/extensions/, pglite.dev/examples)
  - Drizzle ORM documentation (orm.drizzle.team): rqb-v2, sql, select, perf-queries
  - lowdb README (github.com/typicode/lowdb)
  - electron-store README (github.com/sindresorhus/electron-store)
  - libSQL documentation (docs.turso.tech/libsql, github.com/tursodatabase/libsql)
  - better-sqlite3 docs and benchmarks (github.com/WiseLibs/better-sqlite3)
  - jq Manual (jqlang.org/manual/)
  - Notion engineering blog (notion.com/blog/sharding-postgres-at-notion, .../the-great-re-shard, .../building-and-scaling-notions-data-lake)
  - ElectricSQL Linearlite case study (electric-sql.com/blog/2023/10/12/linerlite-local-first-with-react)
  - DoltHub "JSON Showdown: Dolt vs Sqlite" (dolthub.com/blog/2024-11-18-json-sqlite-vs-dolt/)
  - "When JSON Sucks or The Road To SQLite Enlightenment" (pl-rants.net/posts/when-not-json/)
  - HN discussion (news.ycombinator.com/item?id=2685131, item?id=43627646)
  - pganalyze blog (pganalyze.com/blog/gin-index)
  - Crunchy Data, Beekeeper Studio, Sling Academy, npm-compare comparison pages
framing: 3P / external sources only
---

# Query + relational capabilities across 10 storage backends

Scope: filter/sort/aggregate, joins, foreign keys, unique constraints, multi-table invariants, complex queries (CTEs/window functions), indexing, full-text search, and the threshold question of "when does SQL pay off?". 3P-factual landscape only — no recommendations.

Confidence labels in brackets: CONFIRMED (multiple primary sources agree), INFERRED (single source or extrapolation from documented capabilities), UNCERTAIN (sources debate or are silent).

---

## 1. Filter, sort, aggregate

**SQL backends (better-sqlite3, bun:sqlite, libSQL, PGlite, Drizzle).** All five expose the standard SQL surface for `WHERE`, `ORDER BY`, `GROUP BY`, `HAVING`. SQLite's documented aggregates include `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, plus `group_concat`, `string_agg`, `json_group_object`, `json_group_array`. Per the SQLite reference, "if an `ORDER BY` clause is provided, that clause determines the order in which the inputs to the aggregate are processed" — relevant for `string_agg()` / `json_group_object()` where order is observable in output. The clause ordering is `FROM → WHERE → GROUP BY → HAVING → ORDER BY` ([SQLite Aggregate Functions](https://sqlite.org/lang_aggfunc.html), [SQLiteTutorial GROUP BY](https://www.sqlitetutorial.net/sqlite-group-by/)). [CONFIRMED]

PostgreSQL via PGlite supports the same pipeline plus all standard SQL aggregates and "vast subset of the Postgres syntax including Joins, CTEs, and Window Functions" ([PGlite GitHub](https://github.com/electric-sql/pglite), [Medium PGlite overview](https://medium.com/@tugrulgedikli/pglite-full-postgresql-in-the-browser-via-webassembly-44ad8db1b053)). [CONFIRMED]

**File backends (YAML, JSON, JSONL).**
- YAML / JSON files: no built-in query layer. Workflow per [MDN Array.filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter) and [freeCodeCamp map/reduce/filter](https://www.freecodecamp.org/news/15-useful-javascript-examples-of-map-reduce-and-filter-74cbbb5e0a1f) is to load the entire file into memory, parse, then use `Array.prototype.filter()` / `.map()` / `.sort()` / `.reduce()` / `.toSorted()`. Aggregation is hand-rolled (`.reduce((acc, x) => …)`). [CONFIRMED]
- JSONL: "By default, jq will look at one JSON object at a time when parsing a file; consequently, it can stream very large files without having to load the entire set in to memory." For aggregation, "we need to give jq access to every JSON object in a file simultaneously" via `-s/--slurp`. `group_by(expr)` is the built-in equivalent of SQL's `GROUP BY` ([jq Manual](https://jqlang.org/manual/), [Programming Historian](https://programminghistorian.org/en/lessons/json-and-jq), [DigitalOcean jq tutorial](https://www.digitalocean.com/community/tutorials/how-to-transform-json-data-with-jq)). [CONFIRMED]
- All file backends require a full scan for any non-trivial filter (no index). [CONFIRMED]

**lowdb.** "You can query using native Array functions: `posts.at(0)` for the first post, `posts.filter()` to filter by conditions, `posts.find()` to find by id, and `posts.toSorted()` to sort by properties." Optionally extends with a Lodash chain: `db.chain.get('posts').find({ id: 1 }).value()` — must call `.value()` to execute ([lowdb README](https://github.com/lowdb/lowdb), [npm lowdb](https://www.npmjs.com/package/lowdb)). All execution is in-memory over the loaded root JSON object. [CONFIRMED]

**electron-store.** No query API. Only documented surface is `get(key)` / `set(key, value)` with dot-notation for nested keys (`store.get('foo.bar.foobar')`). To filter or aggregate, the application code must `get()` an array and run `Array.prototype` methods externally ([electron-store README](https://github.com/sindresorhus/electron-store)). [CONFIRMED]

**Drizzle.** Builds a typed query AST that compiles to SQL: "select, insert, update, delete, as well as using aliases, WITH clauses, subqueries, prepared statements, and more" — and provides a separate Queries API for relational nested-data fetches ([Drizzle Why](https://orm.drizzle.team/docs/overview), [Drizzle Query](https://orm.drizzle.team/docs/rqb-v2)). For unsupported expressions, falls back to `db.execute(sql\`…\`)` raw parameterized queries ([Drizzle SQL](https://orm.drizzle.team/docs/sql)). [CONFIRMED]

---

## 2. Joins

**SQL backends.** All standard `INNER`, `LEFT`, `RIGHT` (Postgres only — SQLite added `RIGHT/FULL OUTER` in 3.39, [release notes]), `FULL OUTER`, and `CROSS` joins. better-sqlite3 documents "with proper indexing, better-sqlite3 has been able to achieve upward of 2000 queries per second with 5-way-joins in a 60 GB database" ([Better-SQLite3 guide](https://www.w3resource.com/sqlite/snippets/better-sqlite3.php)). Better-SQLite3 also exposes `.expand()` to namespace overlapping column names by table on JOINs ([Better-SQLite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)). [CONFIRMED]

PGlite supports the full Postgres join surface ([PGlite README](https://github.com/electric-sql/pglite)). [CONFIRMED]

Drizzle exposes joins as both query-builder methods and through its relational Queries API ("fetch relational, nested data from the database in the most convenient and performant way, without worrying about joins or data mapping" — [Drizzle Why](https://orm.drizzle.team/docs/overview)). [CONFIRMED]

**File backends + lowdb + electron-store.** No join operator. Per [The New Stack: JSON and Relational Tables](https://thenewstack.io/json-and-relational-tables-how-to-get-the-best-of-both/), if data is stored in JSON documents, "a facilities-management application would have to propagate changes by searching for references in differently structured JSON documents". Equivalent of join is manual: nested loop over arrays, lookup-by-id maps the application maintains, or `.flatMap()` chains. [CONFIRMED]

For JSONL specifically, jq can compose two streams via `--slurpfile` + manual key matching, but no built-in join operator exists in the language ([jq Manual](https://jqlang.org/manual/)). [CONFIRMED]

---

## 3. Foreign keys

**SQLite (better-sqlite3, bun:sqlite, libSQL).** Foreign keys are declared with `REFERENCES`. The five `ON DELETE` / `ON UPDATE` actions per [SQLite Foreign Key Support](https://sqlite.org/foreignkeys.html) are: `NO ACTION` (default), `RESTRICT`, `SET NULL`, `SET DEFAULT`, `CASCADE`.

> "The enforcement of foreign keys is off by default in SQLite (for historical compatibility reasons)."
> "PRAGMA foreign_keys = ON;" must be set per connection.

[CONFIRMED — multiple sources]: [SQLite Foreign Keys](https://sqlite.org/foreignkeys.html), [TechOnTheNet](https://www.techonthenet.com/sqlite/foreign_keys/foreign_delete.php), [SQLAlchemy issue #4858](https://github.com/sqlalchemy/sqlalchemy/issues/4858).

`RESTRICT` semantics differ from `NO ACTION` in that "RESTRICT processing happens as soon as the field is updated — not at the end of the current statement" ([SQLite Foreign Keys](https://sqlite.org/foreignkeys.html)). [CONFIRMED]

**PGlite.** Inherits Postgres' enforcement; FKs are on by default and cannot be disabled per-table the way SQLite's PRAGMA disables them globally per connection. [INFERRED — sources cover PGlite's "vast subset of Postgres syntax" but do not exhaustively enumerate FK features; treated as standard Postgres behavior]

**Drizzle.** Schema DSL supports FK declaration that compiles to native `REFERENCES` clauses; relies on the underlying engine (SQLite or Postgres) for enforcement. [INFERRED — Drizzle docs cover schema definition; FK action enforcement is delegated to the backend]

**Files (YAML, JSON, JSONL), lowdb, electron-store.** No foreign-key concept exists. Per [The New Stack](https://thenewstack.io/json-and-relational-tables-how-to-get-the-best-of-both/) and [LinkedIn: Referential Integrity Solution Pattern](https://www.linkedin.com/pulse/referential-integrity-solution-pattern-world-document-addepalli):

> "NoSQL document stores typically do not support complex transactions and referential integrity constraints, so data consistency becomes the developer's problem."
> "Required workarounds for enforcing referential integrity in document stores increase system complexity, reduce security, and allow inconsistencies."

Application code must enumerate references on every delete (manual cascade) or refuse the delete (manual restrict). [CONFIRMED]

---

## 4. Unique constraints

**SQLite.** Per [SQLite UNIQUE Constraint](https://www.sqlitetutorial.net/sqlite-unique-constraint/) and [TechOnTheNet UNIQUE](https://www.techonthenet.com/sqlite/unique.php):
- Single-column: `name TEXT UNIQUE`
- Composite: `UNIQUE(col1, col2)` as a table-level constraint
- Named: `CONSTRAINT name_unique UNIQUE (last_name, first_name)`
- "SQLite treats all NULL values as different, therefore, a column with a UNIQUE constraint can have multiple NULL values" — diverges from some other SQL engines.
- "ALTER TABLE in SQLite can only be used to rename a table or add a new column to an existing table. It is not possible to add or remove constraints from a table." [CONFIRMED]

**PGlite (Postgres).** Standard `UNIQUE` and `UNIQUE(a, b)` table constraints. Postgres treats `NULL` as not-equal under unique constraints by default, same as SQLite. `ALTER TABLE … ADD CONSTRAINT … UNIQUE` is supported (unlike SQLite). [INFERRED from Postgres docs + PGlite syntax-coverage claim]

**Drizzle.** Schema DSL exposes `.unique()` on columns and `unique('name').on(t.col1, t.col2)` for composite, compiled to native `UNIQUE` SQL ([Drizzle docs](https://orm.drizzle.team/docs/select)). [INFERRED from query-builder coverage]

**Files / lowdb / electron-store.** No unique-constraint enforcement. Application code must read-then-check-then-write, which is racy without an external lock. Per [Acceldata: Referential Integrity](https://www.acceldata.io/blog/referential-integrity-why-its-vital-for-databases), the absence of declarative uniqueness "shifts the burden of maintaining [...] integrity to application code". [CONFIRMED]

---

## 5. Multi-table invariants ("user must have exactly one default profile")

**SQL backends.** Two enforcement primitives:

1. **CHECK constraints.** Per [Sling Academy: SQLite CHECK](https://www.slingacademy.com/article/using-sqlite-check-constraint-to-validate-data/), "CHECK constraints allow you to define certain conditions that the data must meet before being entered into a table". Single-row scope — cannot reference other rows or other tables.
2. **Triggers.** Per [w3resource: SQLite Triggers](https://www.w3resource.com/sqlite/sqlite-triggers.php), a trigger "is an event-driven action that are run automatically when a specified change operation (INSERT, UPDATE and DELETE statement) is performed on a specified table." `BEFORE` triggers can `RAISE(ABORT, …)` to enforce cross-row / cross-table invariants. [CONFIRMED]

For "exactly one default profile per user", the typical pattern is a partial unique index: `CREATE UNIQUE INDEX one_default_per_user ON profiles(user_id) WHERE is_default = 1` (see Indexing §7 below). [INFERRED — partial-index documentation directly supports this idiom]

**PGlite.** Supports CHECK constraints, triggers, partial indexes, and additionally `EXCLUDE` constraints (Postgres-specific) and deferrable constraints. [INFERRED from "vast Postgres surface" claim; not enumerated in primary PGlite sources]

**Files / lowdb / electron-store.** Application code only. The "one default profile" invariant must be enforced in every code path that writes profiles — load, validate, write. No declarative mechanism. [CONFIRMED]

---

## 6. Complex queries (CTEs, window functions, recursive)

**SQLite.** Per [SQLite WITH clause](https://sqlite.org/lang_with.html):
- Non-recursive CTEs supported.
- Recursive CTEs supported via `WITH RECURSIVE cte_name AS (initial-select UNION ALL recursive-select)`.
- "SQLite now allows multiple recursive SELECT statements in a single recursive CTE" ([HN thread](https://news.ycombinator.com/item?id=24843643), 2020+).

Window functions per [SQLite Window Functions](https://sqlite.org/windowfunctions.html): 11 built-in window functions including `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `PERCENT_RANK`, `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE`. "All of SQLite's aggregate functions may be used as aggregate window functions". `OVER (PARTITION BY … ORDER BY …)` syntax is standard. [CONFIRMED]

**better-sqlite3, bun:sqlite, libSQL.** Inherit SQLite's full surface (CTEs + window functions). libSQL is "fully backwards compatible with SQLite" ([Turso libSQL docs](https://docs.turso.tech/libsql)). [CONFIRMED]

**PGlite.** Per [PGlite README](https://github.com/electric-sql/pglite) and [Medium PGlite article](https://medium.com/@tugrulgedikli/pglite-full-postgresql-in-the-browser-via-webassembly-44ad8db1b053): "common table expressions work fully, and you can write recursive and non-recursive CTEs just like in a standard PostgreSQL installation. ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, and other window functions are all available". [CONFIRMED]

**Drizzle.** Supports CTEs (`WITH` clauses) and window functions through both the query builder and the `sql\`\`` template tag ([Drizzle SQL](https://orm.drizzle.team/docs/sql), [Drizzle Select](https://orm.drizzle.team/docs/select)). [CONFIRMED]

**Files / lowdb / electron-store.** No declarative recursive query mechanism. To walk a tree (e.g., comments → replies → replies-of-replies), application code must implement BFS/DFS over a Map<id, item> — possible but non-trivial. Window functions are emulated via `Array.prototype.reduce()` with manual partition tracking. [CONFIRMED via absence of language-level support]

---

## 7. Indexing

**SQLite.** Per [SQLite Index guide](https://www.sqlitetutorial.net/sqlite-index/), [SQLite Partial Indexes](https://www.sqlite.org/partialindex.html), and [SQLite Generated Columns](https://sqlite.org/gencol.html):
- **B-tree** is the only on-disk index type. "SQLite uses B-tree for organizing indexes, where B stands for balanced (not binary)" ([jvns.ca SQLite btrees](https://jvns.ca/blog/2014/10/02/how-does-sqlite-work-part-2-btrees/)).
- **No hash index** — design choice for embedded targets: "adding a separate hash table implementation would increase the size of the library, which is designed for use on low-memory embedded devices, for minimal performance gain" ([SQLite users mailing list](https://sqlite-users.sqlite.narkive.com/U5smvNXx/feature-request-hash-index)).
- **Partial indexes:** `CREATE INDEX idx ON tbl(col) WHERE condition` — "only rows of the table for which the WHERE clause evaluates to true are included in the index, and rows where the WHERE clause evaluates to NULL or false are omitted" ([Partial Indexes](https://www.sqlite.org/partialindex.html)).
- **Expression indexes:** index a deterministic expression rather than a column. "The SQLite query planner considers using an index on an expression when the expression that is indexed appears in the WHERE clause or in the ORDER BY clause of a query, exactly as it is written in the CREATE INDEX statement" ([Choosing the Right Index](https://blog.sqlite.ai/choosing-the-right-index-in-sqlite)).
- **Generated columns + indexes:** "An index that uses STORED generated columns is just an ordinary index, but an index that uses one or more VIRTUAL generated columns is an expression index" ([Generated Columns](https://sqlite.org/gencol.html)). Common idiom: `json_extract(data, '$.draft')` as a virtual column, then index it ([DB Pro Blog: SQLite JSON Virtual Columns](https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing)).

[CONFIRMED]

**PGlite (Postgres).** Postgres supports B-tree (default), Hash, GiST, SP-GiST, GIN, and BRIN. Per [pganalyze: GIN Indexes](https://pganalyze.com/blog/gin-index): "GIN indexes only support Bitmap Index Scans (not Index Scan or Index Only Scan)". Partial indexes (`WHERE`) and expression indexes are standard Postgres features. PGlite inherits Postgres' index types per its "vast subset of the Postgres syntax" claim ([PGlite README](https://github.com/electric-sql/pglite)). [CONFIRMED for Postgres; INFERRED for PGlite-specific support of every index type]

**Drizzle.** Schema DSL exposes `.index()` and `.uniqueIndex()` declarations; partial indexes via a `.where()` clause when supported by the backend ([Drizzle docs](https://orm.drizzle.team/docs/perf-queries)). [INFERRED]

**Files / lowdb / electron-store.** No persistent index. To accelerate lookup, application code must build an in-memory `Map<key, value>` after loading the file, and rebuild it on each load. Per [PL-Rants: When JSON Sucks](https://pl-rants.net/posts/when-not-json/) and [HN comment thread on JSON-vs-SQLite](https://news.ycombinator.com/item?id=2685131), this works at small N but degrades:

> "JSON files are read into memory at once, you can't search the list without reading the whole thing, and you can't write to the list without writing the whole thing all at once."

For lowdb specifically, the entire JSON object lives in memory; "lookup" performance is `Array.prototype.find()` complexity (O(n) linear scan) unless the application maintains its own index. [CONFIRMED]

**Cost of maintaining indexes (general).** Per [Choosing the Right Index in SQLite](https://blog.sqlite.ai/choosing-the-right-index-in-sqlite): every index adds write-amplification (insert/update/delete must update the index B-tree). Partial indexes cut this by indexing only matching rows. [CONFIRMED]

---

## 8. Full-text indexing

**SQLite (better-sqlite3, bun:sqlite, libSQL).** FTS5 is the canonical full-text extension. Per [SQLite FTS5](https://www.sqlite.org/fts5.html), [Sling Academy FTS3/FTS5](https://www.slingacademy.com/article/understanding-fts3-and-fts5-in-sqlite/), and [Daniel Zolnai on SQLite FTS](https://dzolnai.medium.com/speed-up-searching-in-your-app-by-using-sqlite-and-fts-8896ab74b598):
- Virtual table type. Inverted index over tokenized content.
- Supports prefix searches, phrase searches, proximity, boolean (AND/OR/NOT) queries.
- BM25 ranking built in.
- "FTS5 builds an inverted index: a mapping from tokens (terms) to the rows that contain them. When you search for text, FTS5 finds the token lists and intersects them, which is typically far faster than scanning all text" ([blog.sqlite.ai FTS5](https://blog.sqlite.ai/fts5-sqlite-text-search-extension)).
- Compiled in by default in modern SQLite builds.

[CONFIRMED]

**PGlite.** Supports Postgres' built-in `tsvector` / `tsquery` per [PGlite Examples](https://pglite.dev/examples) ("There is an example showing how to use Full Text Search (FTS) with PGlite"). Additional extensions per [PGlite Extensions](https://pglite.dev/extensions/):
- `pg_trgm` — trigram similarity matching
- `unaccent` — accent stripping for accent-insensitive search
- `pg_textsearch` ([timescale/pg_textsearch](https://github.com/timescale/pg_textsearch)) — BM25 ranking, listed as available extension class

Postgres tsvector cost characteristics per [DEV: SQL and Postgres for Advanced FTS](https://dev.to/wagenrace/sql-and-postgresql-for-advanced-full-text-search-3cle): "the cost of tsvector searches is lower than even LIKE and ILIKE searches", with GIN indexes on generated tsvector columns recommended for performance. [CONFIRMED]

**FTS5 vs tsvector head-to-head.** Sources do not provide a direct, reproducible benchmark. Instead they characterize different approaches: [HN discussion on Postgres FTS](https://news.ycombinator.com/item?id=43627646) frames the trade-off as "how do I bring Postgres to Elastic-level performance across a wide range of real-world boolean, fuzzy, faceted, relevance-ranked queries?" — i.e., optimization strategies dominate the choice of engine. [UNCERTAIN — sources debate methodology rather than reporting numbers]

**Drizzle.** Inherits FTS5 (when on SQLite) or tsvector (when on Postgres / PGlite); typically accessed via `sql\`\`` raw template since FTS-specific syntax (`MATCH`, `@@`) is not first-class in the query builder. [INFERRED]

**Files / lowdb / electron-store.** No FTS. Three application-side options per [Mattermost: Best Search Packages for JavaScript](https://mattermost.com/blog/best-search-packages-for-javascript/) and [npm-compare: lunr / fuse / flexsearch / minisearch](https://npm-compare.com/elasticlunr,flexsearch,fuse.js,lunr,search-index):
- **Lunr.js / Elasticlunr** — pre-built inverted index in JavaScript; "full-text support for 14 languages and offers fuzzy term matching"; inspired by Solr.
- **Fuse.js** — fuzzy match via Bitap algorithm; "iterates through the whole collection of documents upon each search"; "can be slow on huge datasets, and you'll need to load the complete dataset on the client side because Fuse.js needs access to the entire dataset" ([Mattermost](https://mattermost.com/blog/best-search-packages-for-javascript/)).
- **MiniSearch / FlexSearch** — comparable to Lunr with different size/perf trade-offs ([MiniSearch](https://lucaongaro.eu/blog/2019/01/30/minisearch-client-side-fulltext-search-engine.html)).

Tantivy is a Rust full-text engine (used by some embedded apps via FFI); not a typical JavaScript-side option for lowdb / electron-store deployments. [CONFIRMED]

---

## 9. When SQL pays off (heuristics from real-world adoption)

Sources give multiple, sometimes contradictory thresholds. Reporting all:

**Storage-size threshold (large datasets).** [DoltHub: JSON Showdown](https://www.dolthub.com/blog/2024-11-18-json-sqlite-vs-dolt/) and [PL-Rants: When JSON Sucks](https://pl-rants.net/posts/when-not-json/):

> "Data originally stored in 18GB of JSON files took only 4.8GB when consolidated into a single SQLite database."

Storage compression alone is a documented SQL win once data grows beyond hand-edit scale. [CONFIRMED]

**Working-set threshold (in-memory limits).** [PL-Rants: When JSON Sucks](https://pl-rants.net/posts/when-not-json/):

> "JSON files are read into memory at once, you can't search the list without reading the whole thing, and you can't write to the list without writing the whole thing all at once."
> "With SQLite you can very easily save a single entry, while with JSON you have to save an entire file over and over again."

The threshold is "when the file no longer fits comfortably in RAM" or "when full-file writes become a latency problem". No specific row count given. [CONFIRMED qualitative; UNCERTAIN on numeric threshold]

**Query-pattern threshold (need ad-hoc queries).** [Notion engineering blog: Sharding Postgres at Notion](https://www.notion.com/blog/sharding-postgres-at-notion):

> "From 2015 to 2020, Notion relied on a single large PostgreSQL database hosted on Amazon RDS."
> "Notion has a data doubling rate of six months to a year, starting from a few tens of billions of blocks. Notion users update existing blocks much more often than they add new ones, with 90% of Notion upserts being updates."

Notion's choice was Postgres from the start; the question they faced was sharding (32 then 96 physical instances), not "Postgres vs JSON". This is a high-end signal that document-shaped data still benefits from SQL when the query surface is broad. [CONFIRMED]

**Local-first with sync threshold.** [ElectricSQL: Linearlite](https://electric-sql.com/blog/2023/10/12/linerlite-local-first-with-react):

> "Local-first software platform used to build super fast, collaborative, offline-capable apps directly on Postgres by syncing to a local SQLite database."

Linear (the production product Linearlite emulates) is the canonical example of a local-first app that uses SQL on the client. The trigger is "need ad-hoc queries on the client" + "need indexed lookups across many entities" — not a row count. [CONFIRMED qualitative]

**JSON-favorable counter-thresholds.** [HN comment thread, 2011](https://news.ycombinator.com/item?id=2685131):

> "For me JSON has replaced SQLLite, with a large reduction in code and complexity."

Quoted to illustrate the opposing view. The follow-on debate emphasizes that small datasets, document-shaped access patterns, and the absence of ad-hoc queries can favor JSON. No specific upper bound given. [UNCERTAIN — represents a real adoption pattern but no hard threshold]

**Aggregate signal from comparison sources.** Per [JSONlite vs SQLite stackup](https://www.stackshare.io/stackups/jsonlite-vs-sqlite) and [The New Stack: JSON and Relational Tables](https://thenewstack.io/json-and-relational-tables-how-to-get-the-best-of-both/), the consensus framing is: SQL pays off when (a) the dataset is too large to load fully into memory, (b) you need indexed lookups, (c) you need joins or referential integrity, or (d) you need partial updates without rewriting the whole file. JSON wins on simplicity for human-readable, hand-edited, small, document-shaped data. [CONFIRMED]

**No single numeric threshold across sources.** Reported scales vary from "few MB" (where JSON is fine) up to Notion's "tens of billions of blocks" (where Postgres needs sharding). The qualitative trigger is consistent: when query patterns become diverse and indexed access becomes load-bearing. [CONFIRMED multi-source]

---

## 10. Cost of NOT having SQL

When the storage layer offers no query engine, application code must replicate the missing functionality. Concrete costs by category:

**Filtered access.** Hand-rolled `Array.prototype.filter()` chains. O(n) per query unless the app builds and maintains its own in-memory `Map`. [CONFIRMED — see §7]

**Joins.** Manual lookup-by-id maps maintained in user code; nested-loop joins over arrays; `.flatMap()` chains. Per [The New Stack](https://thenewstack.io/json-and-relational-tables-how-to-get-the-best-of-both/): change-propagation must walk references in differently structured documents — O(documents × references-per-document) per change. [CONFIRMED]

**Referential integrity.** Per [Acceldata](https://www.acceldata.io/blog/referential-integrity-why-its-vital-for-databases) and [LinkedIn: Referential Integrity Solution Pattern](https://www.linkedin.com/pulse/referential-integrity-solution-pattern-world-document-addepalli):

> "Required workarounds for enforcing referential integrity in document stores increase system complexity, reduce security, and allow inconsistencies."

Every delete must enumerate all references; every insert must validate parent existence. Race conditions are the developer's problem unless an external lock is added. [CONFIRMED]

**Unique-constraint enforcement.** Read-then-check-then-write pattern. Without a transactional engine, two concurrent writes can both pass the check and corrupt uniqueness. [CONFIRMED — see §4]

**Multi-table invariants.** Application code must enforce on every write path. No declarative analog to CHECK / triggers / partial unique indexes. Easy to forget when adding a new write surface. [CONFIRMED — see §5]

**Recursive walks.** BFS/DFS over `Map<id, item>` reimplemented per use case. SQL's `WITH RECURSIVE` is replaced by hand-written graph traversal. [CONFIRMED — see §6]

**Indexed lookup.** In-memory `Map<key, value>` rebuilt on every load; no persistent index across process restarts. For lowdb this is the model ("posts.find(p => p.id === 1)" is linear; building a Map first amortizes only across queries within one session). [CONFIRMED]

**Full-text search.** Lunr / Fuse / FlexSearch / MiniSearch — all build their own inverted index in memory at startup, all require the entire corpus to be loaded ([Mattermost](https://mattermost.com/blog/best-search-packages-for-javascript/)). For datasets that don't fit in memory, FTS is unavailable without an external service. [CONFIRMED]

**Aggregate code-complexity claim.** Per [RxDB: JSON-Based Databases](https://rxdb.info/articles/json-based-database.html): document-shaped storage is simpler when the application is itself document-shaped (CRUD on documents, no ad-hoc queries). The complexity inverts when the application needs cross-document operations — that's where the application-side code grows. [CONFIRMED qualitative; UNCERTAIN quantitative]

---

## Query capability matrix

Legend: Y = native support; A = via application code; sql = via raw SQL escape hatch; FTS = external library required.

| Backend | Filter | Sort | Aggregate | Joins | FK | Unique | FTS | CTE | Window |
|---|---|---|---|---|---|---|---|---|---|
| YAML files | A | A | A | A | A | A | A (Lunr/Fuse) | A | A |
| JSON files | A | A | A | A | A | A | A (Lunr/Fuse) | A | A |
| JSONL append-only | A (jq) | A (jq) | A (jq -s + group_by) | A (jq --slurpfile) | A | A | A (jq tokenize or external) | A | A |
| better-sqlite3 | Y | Y | Y | Y | Y (PRAGMA on) | Y | Y (FTS5) | Y | Y |
| bun:sqlite | Y | Y | Y | Y | Y (PRAGMA on) | Y | Y (FTS5) | Y | Y |
| libSQL | Y | Y | Y | Y | Y (PRAGMA on) | Y | Y (FTS5) | Y | Y |
| PGlite | Y | Y | Y | Y | Y | Y | Y (tsvector + pg_trgm) | Y | Y |
| Drizzle ORM | Y | Y | Y | Y (+ Queries API) | Y | Y | sql (FTS5/tsvector raw) | Y | Y |
| lowdb | A (.filter / chain) | A (.toSorted / chain) | A (.reduce / chain) | A | A | A | A (Lunr/Fuse) | A | A |
| electron-store | A (get + .filter) | A | A | A | A | A | A | A | A |

Sources for matrix entries: SQLite ([sqlite.org/foreignkeys.html](https://sqlite.org/foreignkeys.html), [windowfunctions.html](https://sqlite.org/windowfunctions.html), [lang_with.html](https://sqlite.org/lang_with.html), [fts5.html](https://www.sqlite.org/fts5.html)); libSQL ([docs.turso.tech/libsql](https://docs.turso.tech/libsql)); PGlite ([github.com/electric-sql/pglite](https://github.com/electric-sql/pglite), [pglite.dev/extensions/](https://pglite.dev/extensions/)); Drizzle ([orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql), [orm.drizzle.team/docs/rqb-v2](https://orm.drizzle.team/docs/rqb-v2)); lowdb ([github.com/lowdb/lowdb](https://github.com/lowdb/lowdb)); electron-store ([github.com/sindresorhus/electron-store](https://github.com/sindresorhus/electron-store)); jq ([jqlang.org/manual/](https://jqlang.org/manual/)).

---

## Cross-cutting notes

**JSON inside SQL.** SQLite's JSON1 extension (built in by default since SQLite 3.38.0, 2022-02-22, per [JSON Functions](https://sqlite.org/json1.html)) and Postgres' JSONB allow document-shaped data inside SQL tables, with index support:
- SQLite: `CREATE INDEX idx_blogpost_draft ON blogpost (json_extract(metadata, '$.draft'))` — expression index over JSON path ([JSON Functions](https://sqlite.org/json1.html), [DB Pro Blog](https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing)).
- Postgres: GIN index on JSONB column. `jsonb_ops` (default, supports more operators, larger index 60–80% of table size) vs `jsonb_path_ops` (smaller 20–30%, narrower operator set, faster for its supported operators) per [Crunchy Data: Indexing JSONB](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres) and [pganalyze: GIN Indexes](https://pganalyze.com/blog/gin-index).
- "JSONB supports indexing with GIN indexes, dramatically accelerating queries on nested fields, while JSON cannot be indexed directly. JSONB operators use optimized binary operations versus string parsing, making JSONB orders of magnitude faster for equality checks" ([JSON Console FAQ](https://jsonconsole.com/faq/questions/json-vs-jsonb-query-performance-postgresql)).

This blurs the file-vs-DB line: SQL backends can store JSON-shaped data while still offering query, index, FK, FTS surfaces. [CONFIRMED]

**Drizzle's relational query escape hatch.** Per [Drizzle docs Discussion #540](https://github.com/drizzle-team/drizzle-orm/discussions/540), the `sql\`\`` template tag allows arbitrary SQL embedded in the typed builder (e.g., for FTS5 `MATCH`, Postgres `@@` tsquery operators). "By leveraging the sql template in Drizzle, you can maintain the advantages of type safety and query parameterization while achieving the desired query structure and complexity". [CONFIRMED]

**SQLite FK enforcement gotcha.** Multiple sources independently flag the "PRAGMA foreign_keys = ON" requirement as a common bug source: [SQLAlchemy issue #4858](https://github.com/sqlalchemy/sqlalchemy/issues/4858), [EF Core issue #23935](https://github.com/dotnet/efcore/issues/23935), [SQLite forum thread](https://sqlite.org/forum/info/659ed3100d70b77e). The PRAGMA is per-connection; libraries that pool connections must apply it on every checkout. [CONFIRMED]

**libSQL inheritance.** Per [Turso libSQL announcement](https://turso.tech/blog/libsql-the-fork-of-sqlite-crosses-5k-github-stars): "libSQL is production-ready, fully backwards compatible with SQLite, and adds features like native vector search. It extends SQLite with features like embedded replicas and remote access, but inherits SQLite's fundamental limitations such as the single-writer model." All SQLite query/relational capabilities apply unchanged. [CONFIRMED]

**electron-store framing.** Per [electron-store README](https://github.com/sindresorhus/electron-store): "Simple data persistence for your Electron app or module - Save and load user preferences, app state, cache, etc." It is positioned as a settings store, not a database. The dot-path API (`store.get('foo.bar.foobar')`) is the entire query surface; there is no documented filter/sort/aggregate API. [CONFIRMED]
