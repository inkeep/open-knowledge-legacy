# Evidence: Logseq DB version (SQLite-backed graphs)

**Dimension:** How Logseq's DB-mode changes the folder/mutation/conversion story relative to file-mode
**Date:** 2026-04-12
**Sources:** discuss.logseq.com, github.com/logseq/logseq, github.com/logseq/sqlite-db, github.com/logseq/docs

---

## Key sources referenced

- [discuss.logseq.com — Why the database version and how it's going](https://discuss.logseq.com/t/why-the-database-version-and-how-its-going/26744) — Tienson's April 2024 announcement
- [discuss.logseq.com — Logseq OG (markdown) vs Logseq (DB:sqlite) FAQ](https://discuss.logseq.com/t/logseq-og-markdown-vs-logseq-db-sqlite/34608)
- [discuss.logseq.com — Logseq DB Unofficial FAQ](https://discuss.logseq.com/t/logseq-db-unofficial-faq/32508)
- [discuss.logseq.com — Database version: too drastic choice?](https://discuss.logseq.com/t/database-version-too-drastic-choice/20346)
- [discuss.logseq.com — Is there still a bi-directional approach of DB-Markdown?](https://discuss.logseq.com/t/is-there-still-a-bi-directional-approach-of-db-markdown-or-only-export-to-markdown-remains/26051)
- [discuss.logseq.com — Current Logseq DB Import Limitations](https://discuss.logseq.com/t/current-logseq-db-import-limitations/31172)
- [github.com/logseq/docs — db-version.md](https://github.com/logseq/docs/blob/master/db-version.md)
- [github.com/logseq/sqlite-db — repo README](https://github.com/logseq/sqlite-db/blob/master/README.md)
- [github.com/logseq/logseq — PR #11829 (basic markdown export for DB graphs)](https://github.com/logseq/logseq/pull/11829)

---

## Findings

### Finding: DB version is a parallel SQLite-backed mode announced April 2024; as of April 2026 it remains in beta and is not the default
**Confidence:** CONFIRMED
**Evidence:** [Why the database version and how it's going](https://discuss.logseq.com/t/why-the-database-version-and-how-its-going/26744), [db-version.md](https://github.com/logseq/docs/blob/master/db-version.md)

Tienson's announcement committed to coexistence:

> "No, we'll continue to support both file-based and database-based graphs. Our long-term goal is to achieve seamless two-way sync between the database and markdown files."

The current docs still carry the warning:

> "While there is an automated backup for DB graphs, we recommend only using DB graphs for testing purposes."

File-mode remains the default; DB-mode is opt-in.

---

### Finding: DB graphs store content in a single `db.sqlite` file, not as `.md` files
**Confidence:** CONFIRMED
**Evidence:** [github.com/logseq/sqlite-db](https://github.com/logseq/sqlite-db/blob/master/README.md), [Logseq DB Unofficial FAQ](https://discuss.logseq.com/t/logseq-db-unofficial-faq/32508)

Implementation: `sqlite-db` package uses `rusqlite` (compiled to WASM) and `wa-sqlite`'s SAH pool. A forked Datascript with persistent storage sits on top of SQLite. Each graph is a single `db.sqlite` file (plus standard Logseq accessory folders in the graph directory).

> "DB graphs store everything in a SQLite database (`db.sqlite`), while file graphs use individual markdown/org files on disk."

**Implications:** There is no `pages/*.md` to open, grep, or version-control as text. The authoritative store is an opaque binary DB file.

---

### Finding: DB-mode does not support "open folder of `.md` and edit" — it only accepts File-to-DB imports
**Confidence:** CONFIRMED
**Evidence:** [Current Logseq DB Import Limitations](https://discuss.logseq.com/t/current-logseq-db-import-limitations/31172), [Converting custom workflows for Logseq DB import](https://discuss.logseq.com/t/converting-custom-workflows-for-logseq-db-import/31173)

The only way to get an existing markdown graph into DB-mode is via the one-way **File to DB graph** importer (three-dots menu → Import → File to DB graph). There is no "Open local directory" for DB-mode that binds Logseq to existing `.md` files. After import, the DB is independent — edits happen in the DB, not in the original `.md` files.

**Implications:** This is a hard category shift from file-mode. File-mode keeps markdown authoritative; DB-mode makes markdown an import-only artifact.

---

### Finding: Export from DB-mode back to markdown is one-way and lossy
**Confidence:** CONFIRMED
**Evidence:** [Is there still a bi-directional approach of DB-Markdown?](https://discuss.logseq.com/t/is-there-still-a-bi-directional-approach-of-db-markdown-or-only-export-to-markdown-remains/26051), [PR #11829](https://github.com/logseq/logseq/pull/11829), [Database version: too drastic choice?](https://discuss.logseq.com/t/database-version-too-drastic-choice/20346)

The team's stance shifted from "bidirectional markdown sync" to "DB is the single source of truth, export is secondary":

> "make the database the so-called 'single source of truth' ... support for import/export to various formats exists 'only to the degree that these formats are compatible'."

Known export caveats: markdown export drops tags and properties (community FAQ); EDN export captures more but is not human-editable in the same way. PR #11829 adds "basic markdown export for DB graphs" — the word "basic" is consistent with the tier being an afterthought relative to file-mode's file-equals-content identity.

---

### Finding: Community sentiment on DB-mode transition is cautious but resolved into coexistence
**Confidence:** CONFIRMED
**Evidence:** [Database version: too drastic choice?](https://discuss.logseq.com/t/database-version-too-drastic-choice/20346), [Questions about the upcoming database version](https://discuss.logseq.com/t/questions-about-the-upcoming-database-version/27108), [Logseq OG vs Logseq DB FAQ](https://discuss.logseq.com/t/logseq-og-markdown-vs-logseq-db-sqlite/34608)

Documented concerns: loss of plaintext portability, loss of external-tool integration (VS Code, regex search, static site generators), data longevity questions. The "too drastic choice?" thread captured the portability worry. Resolution has been practical: the OG/markdown mode is explicitly positioned as a viable continuation for users who need markdown on disk.

> "If you don't require DB enhancements, continuing with the markdown edition remains viable."

---

## Gaps / follow-ups

- No stable-release timeline for DB-mode graduating out of beta
- Whether DB-mode will eventually reach "seamless two-way sync" (the stated long-term goal) remains open-ended — no evidence of shipping progress toward it beyond basic export
- Whether file-mode will be maintained indefinitely or eventually deprecated
