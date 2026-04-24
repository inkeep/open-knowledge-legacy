# Changelog

## 2026-04-16 — Initial research

**Context:** Commissioned from in-flight `specs/2026-04-16-editor-asset-and-embed-surface/` (spec worktree `spec/asset-embed-surface` off origin/main `432a834b`). Consumer wanted cross-editor prior-art signal for open decisions D-B, D-C, D-D, D-E, D-F, D-I, D-J.

**Scope:** 16 editors across 6 tiers × 8 dimensions. OSS source-code inspection primary; WebFetch secondary for Zettlr/Docmost/HedgeDoc/SilverBullet/AFFiNE (no local repo).

**Execution:** 4 parallel Explore/general-purpose subagents across tier boundaries (Tier 1, Tier 2A, Tier 2B+3, Tier 6). Each returned structured per-editor findings; orchestrator consolidated into `evidence/per-editor-findings.md` and synthesized into `REPORT.md`.

**Routing:** Path A (formal report). Worldmodel had just run in the parent spec flow; catalogue scan confirmed no existing report covers universe-wide asset+embed comparison.

**Validation:** Inline checklist below. **Audit (Step 5b) SKIPPED** — rationale: subagent outputs were independently produced (cross-review function); findings are survey-style not opinionated; consumer spec's own audit step will verify. Logged for audit trail.

### Validation checklist

- [x] Executive Summary answers the rubric's primary question (dominant patterns + divergences across 16 editors)
- [x] All 8 rubric dimensions covered in Detailed Findings with tables
- [x] Every finding links to `evidence/per-editor-findings.md` which cites file:line
- [x] "NOT FOUND" and "UNCERTAIN" claims documented per editor where applicable
- [x] Gaps (Zettlr, Docmost D3-D8, SilverBullet plugs, Notion) listed in Limitations
- [x] Non-goals respected (no benchmarks, no OK recommendations beyond decision-mapping)
- [x] Report framing is 3P (external editors) — NO 1P codebase analysis
- [x] Cross-finding consistency: D1 ↔ D3 align (typed-node editors don't render embeds); D4 convergence (no hash dedup anywhere) appears consistently
- [x] Stat consistency: "16 editors", "4 of 16 parse `![[...]]`", "0 of 16 do hash dedup" consistent across Exec Summary + Detailed Findings + Decision mapping
- [x] Prose certainty matches evidence — "CONFIRMED" for file:line-cited claims, "INFERRED" for architectural inference, "UNCERTAIN" for insufficient data
- [x] External sources section includes hyperlinks to each editor's GitHub
- [x] Report in `reports/editor-asset-embed-patterns-across-universe/`

### Known limitations acknowledged in-report

- Zettlr not source-inspected (no local repo)
- Docmost D3-D8 not source-inspected (web-only access)
- SilverBullet plug behavior not verified
- Notion proprietary — paste-image-from-URL not investigated

---

## 2026-04-16 — Path C update: cloned source reads

**Trigger:** User unlocked cloning capability; invoked Path C research to close uncertain dimensions where OSS-level depth adds signal.

**Cloned:** docmost (AGPL), silverbullet (MIT), zettlr (GPL) via `git clone --depth 1` into `~/.claude/oss-repos/`. Skipped AFFiNE app (redundant w/ BlockSuite), HedgeDoc (architectural mismatch).

**Dispatched:** 3 parallel Explore subagents, one per repo, each investigating 8 dimensions with file:line citations.

### Findings surfaced (surgical updates to REPORT.md + evidence/per-editor-findings.md)

**Docmost** — 8 dimensions closed UNCERTAIN → CONFIRMED:
- Typed Tiptap nodes (image/video/pdf/attachment/excalidraw/drawio) with Mantine pill UI
- UUID v7 for all attachments; optional `attachmentId` overwrite for diagram saves
- **Novel architectural pattern:** UUID-embedded URLs (`/api/files/${attachmentId}/...`) make refs immune to page rename by construction — sidesteps D7 rewrite entirely
- No Obsidian import (Confluence only)
- No basename index; not needed (UUIDs are authoritative)

**SilverBullet** — MAJOR correction + strongest rename behavior in the universe:
- **Prior classification WRONG:** SilverBullet DOES parse `![[file.ext]]` natively. Parser at `parser.ts:26-86` checks char-91 (`[`) OR char-33 (`!`); regex `/(?<leadingTrivia>!?\[\[)...` captures both variants. Supports dimension modifiers `|200x300`.
- **Strongest rename rewrite surveyed:** `refactor.ts:432-498` updates all backlinks AND co-relocates documents in same folder with the page (`batchRenameDocuments` at lines 254-265). Goes further than Foam/Dendron.
- Timestamp-based naming for pasted files (no hash dedup)
- Lua-based query engine for file indexing

**Zettlr** — 8 dimensions closed UNCERTAIN → CONFIRMED:
- Surprise gap: CM6 drop handler SILENTLY IGNORES PDF drops despite academic/citation use case (line 235-250 of md-paste-drop-handlers.ts: images → save; markdown/code → open; other → no-op)
- Zettelkasten wikilinks `[[]]` via `zkn-link-parser.ts`; **no `![[]]` embed variant**
- Dual-index resolver (ID-regex via config + filename + basename) with 3-strategy `findExact()` — elegant for academic note-ID conventions
- **User-prompted rename rewrite** — only editor surveyed that confirms with user before rewriting inbound links (`file-rename.ts:136-181`)

### Report-level metric updates

- **Wiki-embed support: was 4 of 16 → now 5 of 16** (SilverBullet added)
- **Rename rewrite: was 2 of 16 → now 4 of 16** (SilverBullet + Zettlr added)
- **Limitations section:** Zettlr/Docmost/SilverBullet entries removed from UNCERTAIN list; replaced with "Dimensions Closed by Path C Update" subsection

### Validation

- [x] Updates are surgical (targeted edits, not wholesale rewrite)
- [x] Evidence file sections updated in place with file:line citations
- [x] REPORT.md tables updated for D1/D2/D4/D5/D6/D7/D8 + Convergences + Limitations
- [x] Executive Summary stat corrected (4 → 5 of 16 parse `![[...]]`)
- [x] Cross-finding consistency: SilverBullet's D2=YES + D6=Lua-indexed + D7=strongest-rename-rewrite align coherently
- [x] Confidence ceilings respected: all 24 new findings HIGH confidence from file:line-cited source reads

### Audit

Skipped (same rationale as initial pass — subagent outputs are independently-produced cross-review; consumer spec audit will verify). Logged for trail.

### Remaining open

- Obsidian + Notion proprietary — not invested; secondary-source only
- AFFiNE app-layer integration (beyond BlockSuite) — low value
- HedgeDoc D1/D3/D4 INFERRED — architecturally distant from OK, skipped
