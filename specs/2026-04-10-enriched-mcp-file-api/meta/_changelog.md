# Changelog

## 2026-04-10 — Finalized

- Status → Complete
- Baseline commit updated to e5bfff4
- All 10 open questions resolved (OQ1-OQ10)
- 23 decisions recorded (D1-D23), 3 LOCKED, 20 DIRECTED
- Audit: 2 high-severity coherence issues fixed (agent constraints contradicted D19)
- Design challenge: 8 challenges assessed — D16 revised (extract all frontmatter fields), undo/redo tools added (D21), persistence scope expanded (D23), universal sidecar model flagged for review (D22)
- 7 tool specifications complete: read_file, list_files, search, write_file, edit_file, undo, redo
- R6 added: INDEX.md → _catalog.yml migration risk

## 2026-04-10 — Initial draft

- Scaffolded SPEC.md with problem statement, goals, requirements, solution vertical slice
- Key architectural decisions locked:
  - D5: All metadata in `.open-knowledge/metadata/` as `.yml` sidecars — no frontmatter in content files
  - D6: Metadata tree mirrors wiki root directory structure
  - D7: `write_file` accepts content + metadata as separate parameters
  - D8: Watcher aggressively syncs external file changes (rename, delete, content change)
  - D9: Initial scan extracts existing frontmatter to seed `.yml` sidecars
- Evolution from inline frontmatter → separated `.yml` sidecars driven by:
  - External roots can't have frontmatter injected (not our files)
  - Shadow metadata tree eliminates frontmatter round-trip complexity
  - Watcher becomes simpler (watches .md for content, .yml for metadata — no self-triggering)
  - Existing CRDT layer (Y.Map('metadata')) and shadow repo already model metadata separation
- Evidence file created: `evidence/current-architecture.md`
