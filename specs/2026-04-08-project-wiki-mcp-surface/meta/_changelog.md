# Changelog

## 2026-04-08 — Initial spec session

### Intake
- Problem framed: project wiki in `.openknowledge/` that stays current with codebase
- SCR stress-tested against 5 probes — strong on all dimensions
- Three personas identified: developer (Claude Code), developer (other tools), team lead/new member

### Key decisions (initial round)
- D1-D3: Agent writes files directly, no CRDT, no drafts/permissions
- D2 evolved: Started as "just-bash approach" → changed to "thin MCP server, agent uses native tools"
- D4: `init` as MCP tool + `/init-wiki` skill for population
- D5-D6: `.mcp.json` in repo, catalogs consolidated in `.openknowledge/`
- D12: Catalog naming locked as INDEX.md

### Architecture settled
- Thin MCP server: @modelcontextprotocol/sdk + @parcel/watcher
- Agent uses native tools (Read, Write, Edit, Grep) for all file operations
- MCP server handles: instructions, init, file watching, catalog regeneration

### Research agents dispatched
- just-bash investigation: confirmed overkill for this use case
- Catalog format prior art: confirmed INDEX.md, eager frontmatter rendering
- MCP server patterns: confirmed minimal stack (~200 LOC)

## 2026-04-08 — Audit + challenge (against v1 spec with code-index)

Audit and challenge ran against a version of the spec that included code-index (per-file codebase annotations) and PR ingestion. Those findings are in `audit-findings.md` and `design-challenge.md`. Key items addressed before the scope was later simplified.

## 2026-04-08 — Major scope simplification

### Removed from scope
- **Code-index** — file-by-file codebase mirror. Agent reads source code directly. Wiki captures understanding, not file descriptions. (D7 LOCKED)
- **PR ingestion** — `/ingest` for PR diffs. Moved to Future Work.
- **CLAUDE.md code-index freshness convention** — no code-index means no freshness concern
- All code-index-related decisions (old D13, D14, D17, D18) removed or replaced

### Added
- **Content lifecycle model** — three-stage: external-sources (raw) → research (analysis) → articles (canonical) (D14 LOCKED)
- `/ingest` redefined as raw capture only — fetches URLs/PDFs, saves to `external-sources/` (D19 LOCKED)
- `/research` composes with `/ingest` — gathers sources, writes analysis to `research/` (D20 DIRECTED)
- `/consolidate` promotes research → articles (Future Work until pattern validates)
- `config.yaml` for configurable article paths — repo-as-wiki, existing docs/, internal folder (D16 DIRECTED)
- Spec conversations / exploratory work go to `research/`, promote to `articles/` when solidified (D21)
- stdio transport with full catalog rebuild on startup (D15 LOCKED)

### Decision log now has 21 decisions
- 17 LOCKED/DIRECTED, 1 DEFERRED (D9 wiki-links), 0 ASSUMED
- Old ASSUMED D14 (CLAUDE.md freshness) removed — no longer applicable without code-index

### Implementation phases updated
- Phase 1: MCP server + init + catalogs
- Phase 2: /init-wiki skill
- Phase 3: CLAUDE.md + AGENTS.md conventions
- Phase 4: /ingest skill (external sources only)
- Phase 5: /research skill
- Phase 6 (extensions): /consolidate, status tool, GitHub Actions

### Note on audit/challenge files
`audit-findings.md` and `design-challenge.md` were written against the pre-simplification spec (with code-index). They are retained as historical artifacts. The challenger's H2 finding (code-index unsustainable at scale) contributed directly to the decision to remove code-index from scope.
