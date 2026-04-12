# Changelog

## 2026-04-12 — Initial report

- Created report covering Obsidian, AFFiNE, Logseq folder-opening semantics
- Evidence files for each tool
- User-driven scope expansion: started as Obsidian-only, expanded to include AFFiNE (user-requested) and Logseq (grounded via `openknowledge-competitive-landscape` and `wiki-links-backlinks-architecture` prior reports)

## 2026-04-12 — Additive extension: Logseq DB-mode + Foam + Dendron + SilverBullet

**Update type:** Additive
**Why this pass happened:** After initial report delivery, user requested extending coverage to close the Logseq DB-mode gap and add Foam/Dendron/SilverBullet to the comparison.

### Scope (delta only)
- Logseq DB-mode as distinct storage architecture (SQLite `db.sqlite`, one-way File-to-DB importer, lossy export)
- Foam (VS Code extension, zero-sidecar, in-memory graph)
- Dendron (VS Code extension, required frontmatter injection, dot-hierarchy naming)
- SilverBullet (self-hosted web app, `.silverbullet.db*` regenerable index, folder-as-space model)

### What changed (current-state)
- `REPORT.md` — retitled to drop the "Obsidian vs AFFiNE vs Logseq" framing in favor of a six-tool scope
  - Executive Summary rewritten to categorize tools into three buckets (non-invasive, mutation-invasive, not-folder-of-markdown)
  - Comparison table expanded from 3 columns to 7 (Logseq split into file-mode and DB-mode)
  - New section after Detailed Findings: "Logseq DB-Mode (addendum)" + brief sections for Foam, Dendron, SilverBullet
  - Limitations section extended with new tool-specific gaps
  - References section extended with new source groupings
- `evidence/` — added:
  - `logseq-db-version.md`
  - `foam.md`
  - `dendron.md`
  - `silverbullet.md`
- Untouched: original `evidence/obsidian.md`, `evidence/affine.md`, `evidence/logseq.md` (still accurate for their scope)

### Notes on confidence / contradictions
- No contradictions between the new and original findings
- Key categorization shift: SilverBullet maps closely to Obsidian's model (both use regenerable SQLite indices over authoritative markdown), making the "Obsidian is the only true folder editor" framing from v1 inaccurate — updated in v2
- Logseq DB-mode findings confirm the suspicion that it breaks the "markdown on disk, portable" promise of file-mode; team explicitly repositioned DB as single source of truth

### Open questions / gaps
- Logseq DB-mode stability timeline (still beta as of April 2026)
- Dendron `id` frontmatter strictness (required or merely warned)
- SilverBullet markdown normalization on save (not tested)
- Dendron project maintenance activity (development appears to have slowed since 2022-2023, not formally investigated)
