# Evidence: SilverBullet

**Dimension:** Folder opening behavior for SilverBullet (self-hosted web app)
**Date:** 2026-04-12
**Sources:** silverbullet.md, github.com/silverbulletmd/silverbullet, community.silverbullet.md, LWN article

---

## Key sources referenced

- [silverbullet.md — home](https://silverbullet.md/)
- [silverbullet.md — Plugs](https://silverbullet.md/Plugs)
- [github.com/silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet)
- [community.silverbullet.md — Installation](https://community.silverbullet.md/t/installation/2117/14)
- [community.silverbullet.md — Import .md files](https://community.silverbullet.md/t/import-md-files/512)
- [LWN.net — A look at the SilverBullet note-taking application](https://lwn.net/Articles/1030941/) (T2 independent reporting)

---

## Findings

### Finding: A SilverBullet "space" is a folder — launched directly via CLI or Docker volume
**Confidence:** CONFIRMED
**Evidence:** [github.com/silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet), [community — Installation](https://community.silverbullet.md/t/installation/2117/14)

Typical invocation:
```
silverbullet <PATH-TO-YOUR-SPACE>
```
Or via Docker: `docker run -p 3000:3000 -v /path/to/space:/space silverbullet`.

The server reads the folder, serves a web editor on localhost:3000, and treats the folder as the "space." No "import" step, no format conversion.

---

### Finding: SilverBullet creates `.silverbullet.db*` SQLite files and a `_plug/` folder on first run
**Confidence:** CONFIRMED
**Evidence:** [LWN — A look at SilverBullet](https://lwn.net/Articles/1030941/), [community — Import .md files](https://community.silverbullet.md/t/import-md-files/512)

On first run against an existing folder, SilverBullet writes:
- `.silverbullet.db`, `.silverbullet.db-shm`, `.silverbullet.db-wal` — SQLite index/cache + WAL
- `_plug/` — bundled core plugs and user-installed plugs (`.plug.js`)
- `index.md` — default landing page (created if absent, contains startup tips)
- `SETTINGS.md` — configuration file (created if absent)

The `.silverbullet.db*` files are regenerable caches; `index.md` and `SETTINGS.md` are user-visible markdown files SilverBullet seeds for UX.

---

### Finding: SilverBullet does not rewrite existing `.md` files on open; markdown is authoritative
**Confidence:** CONFIRMED
**Evidence:** [LWN — A look at SilverBullet](https://lwn.net/Articles/1030941/), [silverbullet.md](https://silverbullet.md/)

The documented project stance is "truth is in the markdown." The SQLite DB indexes the space but is regenerable from the `.md` files; if deleted, a re-scan rebuilds it. Edits through the web UI are written back to the original `.md` files. No auto-injected frontmatter, no heading rewrites.

---

### Finding: `.silverbullet.db*` should be gitignored; user markdown is committed normally
**Confidence:** INFERRED
**Evidence:** [LWN](https://lwn.net/Articles/1030941/), [github.com/silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet)

Community convention (inferred from the nature of the files): ignore the DB files (regenerable, local to each environment). `_plug/` can be committed if plugs are part of the space definition. `SETTINGS.md` and `index.md` are user-authored markdown and normally committed.

---

### Finding: SilverBullet's storage model is markdown-primary with a regenerable SQLite index layer
**Confidence:** CONFIRMED
**Evidence:** [silverbullet.md](https://silverbullet.md/), [LWN](https://lwn.net/Articles/1030941/)

This is architecturally similar to Obsidian: `.md` on disk is the source of truth; the DB is a derived index that enables queries, Objects, and indexed search. Distinct from Logseq DB-mode (where SQLite IS the authoritative store) and from AFFiNE (where CRDT in SQLite is authoritative). Closest conceptual match among the six tools: Obsidian.

---

## Gaps / follow-ups

- Exact SQLite schema of `.silverbullet.db` not documented externally; reverse engineering possible but not pursued here
- Whether SilverBullet does any markdown normalization on save (e.g., list marker style) — not investigated; stance statements suggest no, but edge cases untested
