# Changelog

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
