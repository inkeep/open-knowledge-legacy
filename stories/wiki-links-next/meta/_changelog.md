# Changelog

## 2026-04-12 — Consolidated 4 stories into one file

- Merged the four separate story seeds (previously at `stories/slug-correctness/`, `stories/suggest-links-mcp-tool/`, `stories/managed-rename-inbound-rewrite/`, `stories/backlinks-push-over-awareness/`) into this single `stories/wiki-links-next/STORY.md`
- Preserved full fidelity of each story — no summaries, no compression. Every SCR paragraph, invariant, constraint, non-goal, AC, Items row, context bullet, and reference was carried over verbatim
- Disambiguated Items-table IDs across stories using `S1.` / `S2.` / `S3.` / `S4.` prefixes (e.g., `PQ1` → `S1.PQ1`, `S2.PQ1`, etc.) so cross-references in the consolidated file are unambiguous
- Cross-references between stories updated to use the prefixed IDs (e.g., Story 1's note about Story 3's infrastructure now references `S3.XQ2` instead of the ambiguous `XQ2`)
- Added top-level "How to read this document" + "Recommended sequencing" framing
- No evidence files existed in any of the four originals — nothing lost on that axis

## Per-story original changelog context (rolled up from the 4 original _changelog.md files)

### Story 1 (slug-correctness)
- Source: Staff-Eng Decision Brief handed to Mike for prioritization
- Bundles two related correctness items from the brief (Unicode slug + dup-heading dedup) because they share the same surface and have the same one-way-door property
- Status: ready for Mike's review + optional /spec pass

### Story 2 (suggest-links-mcp-tool)
- Source: Staff-Eng Decision Brief handed to Mike for prioritization
- Pulls M4 `suggest_links` forward to "address now" on the rationale that it closes the discovery half of the agent KB workflow and completes the net-new agent capability of the wiki-link work
- Status: ready for Mike's review + optional /spec pass

### Story 3 (managed-rename-inbound-rewrite)
- Source: Staff-Eng Decision Brief handed to Mike for prioritization
- Pulls M5a (managed rename only, not external-reconciliation) forward to "address now" on the rationale that rename silently breaks inbound links and is the one item in the brief explicitly flagged as tech debt rather than conscious deferral
- External-rename reconciliation (the hard half of spec M5) remains scoped to a future M5b story
- Status: ready for Mike's review + optional /spec pass

### Story 4 (backlinks-push-over-awareness)
- Source: Staff-Eng Decision Brief handed to Mike for prioritization
- Rationale: while polling technically works, it's a precedent-setting choice for a real-time-collab product. Switching to awareness-driven push now costs ~1 day and sets the pattern for all future derived-view UIs (orphans sidebar, hubs view, etc.)
- This is the lowest-priority of the four stories if Mike needs to cut scope — polling isn't broken, it's just not aligned with the product's real-time positioning
- Status: ready for Mike's review + optional /spec pass
