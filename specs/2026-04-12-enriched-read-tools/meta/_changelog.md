# Changelog

## 2026-04-12 — Initial draft

- Scope: 3 new MCP tools (`read_document`, `search`, `consolidate`) + 2 supporting primitives (shell wrapper, `CatalogStore` read interface)
- Context: Supersedes closed PR #40 (overbuilt spec that duplicated Andrew #50 and Mike #71)
- Baseline commit: 39fcd87
- Scope intentionally narrow — ~5 new files, ~3 file edits, no new runtime deps
- All P0 questions resolved through iterative chat discussion:
  - D1: Shell wrapper as internal primitive (cloud-compatible, composable; originally proposed `just-bash`, shipped with `node:child_process` — see D1 in SPEC.md for why)
  - D2: Backlinks always-on in `read_document`, graceful degrade when Hocuspocus down
  - D3: `CatalogStore` read interface (SQLite future-proofing without touching write path)
  - D4: No replacement of Andrew/Mike tools — new tools fill orthogonal gaps
  - D5: Per-tool config under `mcp.tools.<tool>.<camelCaseSetting>` (tool names snake_case matching MCP wire; settings camelCase matching sibling sections)
  - D6: No CLI subcommands — shell wrapper is internal primitive only
  - D7: `consolidate` follows instructional-text pattern (matches `research` / `ingest`)
  - D8: `read_document` parallelizes independent ops via `Promise.all`
- Evidence file: `evidence/existing-infrastructure.md`

## 2026-04-12 — Round 1 PR review fixes (#74)

- Renamed `read_file` → `read_document` (matches `*_document` convention)
- Dropped slash prefix from `/consolidate`, `/ingest`, `/research` (tool names don't have slashes)
- Clarified `read_document` dependency graph (step 4 depends on step 2; 2/3/5/6 parallelize)
- Fixed "all three workflow tools" → "both existing workflow tools"
- Expanded D1 rationale with explicit R1 fallback note

## 2026-04-12 — Implementation + round 2 review fixes (#74)

- Shipped the build per the plan at `.claude/plans/agile-bouncing-pizza.md`
- Swapped D1 primitive: `just-bash` → `node:child_process` (just-bash doesn't ship git; interpreter overhead adds no security value inside our own MCP server). R1 mitigation exercised as documented in the spec.
- Graceful degrade: non-critical `Promise.all` arms (`gitLog`, `getCatalog`, `fetchBacklinks`) have `.catch()` fallbacks so an unexpected filesystem/network error never fails the whole read
- Path guard added to `cat` so future callers can't traverse outside project root
- `gitLog` now logs unexpected errors to stderr (still empty-array on expected "not a git repo" failure)
- Config keys switched to camelCase (`historyDepth`, `maxResults`) to match sibling sections (`debounceMs`, etc.). Tool-name keys stay snake_case since they match MCP wire names.
- Fixed variable shadowing in `fetchBacklinks` (`docName` → `sourceDocName`)
- Workflow tool prompts updated: research/ingest reference `consolidate` (no slash), research directs agents to prefer `read_document`/`search` for wiki reads, init-content adds a verification step using the new tools, scaffolded AGENTS.md Navigation section rewritten to lead with enriched tools
