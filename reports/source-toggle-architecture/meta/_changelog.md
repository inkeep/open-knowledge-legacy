# Changelog

## 2026-04-12 — D8: Block-canonical editing capabilities ceiling

**Update type:** Additive
**Why this pass happened:** User asked "what can we do or are doing that they truly can't?" — wanted evidence-based enumeration of block-level editing capabilities that structurally require a ProseMirror tree model vs. what CM6 decorations/widgets can provide.

### Scope (delta only)
- D8: 10 concrete capabilities (table editing, NodeViews, block drag-drop, selection types, schema enforcement, structural transforms, collaborative editing within blocks, schema-aware clipboard, structural undo/redo, nested blocks)
- Three-column evidence: ProseMirror/TipTap API → CM6 architectural limits → Obsidian real-world constraints

### What changed (current-state)
- `REPORT.md` — added D8 to rubric table, added D8 findings section before Limitations, added evidence file to references, updated description and updatedAt
- `evidence/` — added `block-editing-capabilities-ceiling.md` (primary sources from prosemirror.net, codemirror.net, discuss.codemirror.net, forum.obsidian.md)

### Notes on confidence / contradictions
- All 10 capabilities CONFIRMED from primary sources on both sides (PM docs + CM6 docs)
- Obsidian evidence is behavioral (closed source) — specific CM6 techniques inferred from user-facing behavior and forum posts
- No contradictions with existing D1-D7 findings; D8 complements D5's "text-canonical vs block-canonical" framing

### Open questions / gaps
- Whether `sharedEffects` in @codemirror/collab could enable widget-internal collaboration (no production evidence found)
- Obsidian v1.5 table editor internals (closed source)

## 2026-04-07 — Post-spec corrections

- Option A description updated: source mode writes to disk (not in-memory buffer). Added "Update" block explaining the disk-based toggle mechanism discovered during spec development.
- Evidence file `hocuspocus-direct-connection.md` is in the spike evidence directory (separate from this report) — note that the spec evidence was also corrected for the Vite WebSocket pattern and #832 fix status.

## 2026-04-07 — Initial report + audit corrections

**Created:** Full report with 7 dimensions, 10 architecture options (9 original + 1 from audit), 5 evidence files.

**Audit corrections applied:**
- Added Option J (read-only source view) — acknowledged and scoped out per S2 product requirement
- Added concrete round-trip loss examples (6 specific lossy markdown structures) to substantiate Option B's risk claim
- Added "Concurrent edit conflict on toggle-back" section under D4
- Added "Awareness lock considerations" section under D4 (timeout, stale lock, contention UX, configureYProsemirror caveat)
- Clarified spike recommendation: validates both A core AND I extension
- Hedged performance estimate in Executive Summary (estimated, not measured)
- Added MDX round-trip dependency note in Limitations
- Added split-view future UX enhancement note
- Clarified Milkdown as partial prior art for serialize-on-toggle pattern (noted but not elevated)
