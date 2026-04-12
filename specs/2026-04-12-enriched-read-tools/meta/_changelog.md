# Changelog

## 2026-04-12 — Initial draft

- Scope: 3 new MCP tools (`read_file`, `search`, `/consolidate`) + 2 supporting primitives (just-bash wrapper, `CatalogStore` read interface)
- Context: Supersedes closed PR #40 (overbuilt spec that duplicated Andrew #50 and Mike #71)
- Baseline commit: 39fcd87
- Scope is intentionally narrow — ~5 new files, ~2 file edits, 1 new npm dep
- All P0 questions resolved through iterative chat discussion:
  - D1: just-bash as internal shell primitive (cloud-compatible, composable)
  - D2: Backlinks always-on in `read_file`, graceful degrade when Hocuspocus down
  - D3: `CatalogStore` read interface (SQLite future-proofing without touching write path)
  - D4: No replacement of Andrew/Mike tools — new tools fill orthogonal gaps
  - D5: Per-tool config under `mcp.tools.<name>.<setting>`
  - D6: No CLI subcommands — just-bash is internal primitive only
  - D7: `/consolidate` follows instructional-text pattern (matches `research`/`ingest`)
  - D8: `read_file` parallelizes independent ops via `Promise.all`
- Evidence file: `evidence/existing-infrastructure.md`
