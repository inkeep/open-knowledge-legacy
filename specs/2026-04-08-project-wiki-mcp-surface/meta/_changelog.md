# Changelog

## 2026-04-08 — Initial spec session

### Intake
- Problem framed: project wiki in `.openknowledge/` that stays current with codebase
- SCR stress-tested against 5 probes — strong on all dimensions
- Three personas identified: developer (Claude Code), developer (other tools), team lead/new member

### Key decisions made during session
- D1-D3: Agent writes files directly, no CRDT, no drafts/permissions
- D2 evolved: Started as "just-bash approach" → changed to "thin MCP server, agent uses native tools" after research showed just-bash is overkill for file watcher + catalog generator
- D4: `init` as MCP tool + `/init-wiki` skill for full population
- D5-D6: `.mcp.json` in repo, catalogs consolidated in `.openknowledge/`
- D7: Two-layer content model (knowledge articles + code mirror index)
- D11: Directory structure finalized (articles, code-index, research, external-sources)
- D12: Catalog naming locked as INDEX.md
- D13: Every file gets a code-index annotation
- D14: Freshness via CLAUDE.md convention + `/ingest` at PR boundaries
- D17: Code-index annotations include key exports, functions, dependencies
- D18: Exclusions follow .gitignore + skip < 25 lines
- D19: External sources in `.openknowledge/external-sources/`
- D20: Stale entries cleaned by `/ingest`, drift detected by `status` tool

### Architecture settled
- Thin MCP server: @modelcontextprotocol/sdk + @parcel/watcher
- Agent uses native tools (Read, Write, Edit, Grep) for all file operations
- MCP server handles: instructions, init, file watching, catalog regeneration
- Five implementation phases: MCP server → /init-wiki → conventions → /ingest → extensions

### Research agents dispatched
- just-bash investigation: confirmed overkill for this use case
- Catalog format prior art: confirmed INDEX.md, eager frontmatter rendering
- MCP server patterns: confirmed minimal stack (~200 LOC)

### Open questions remaining at scaffold
- Q4: Frontmatter fields required vs optional
- Q5: Exact catalog format (naming resolved, details TBD)
- Q6: /ingest PR mechanics (high-level resolved, skill design TBD)
- Q7: /init-wiki skill design details
- Q11: /init-wiki skill prompt
- Q14: File watcher loop prevention (pattern exists in init_spike)

## 2026-04-08 — Iterate + resolve all open questions

- Q4 resolved: D23 — title + description required, tags recommended, open schema
- Q5 resolved: Full format specified in Section 9 (frontmatter + articles list + subfolders)
- Q6 resolved: D21 — reads full diff, updates/rewrites/adds/deletes as appropriate
- Q7/Q11 resolved: D22 — two-phase: bash exploration → code-index, then synthesize articles
- Q14 resolved: content-hash + ignore INDEX.md files (pattern from init_spike PR #6)
- D21-D23 added to decision log
- Section 9 (Proposed solution) written: full architecture, data flows, formats, skill definitions, implementation phases
- Section 13 (In Scope) written: five implementation phases with acceptance criteria

## 2026-04-08 — Audit + challenge assessment

### Auditor findings (8 total: 2H, 3M, 3L)
- H1 (STORIES.md divergence): Documented as risk — intentional rescope, needs team alignment
- H2 (stale just-bash risk row): Fixed
- M1 (Q4 already resolved): Already fixed
- M2 (instructions classification): Fixed — clarified as MCP server capability
- M3 (Amazon Science stat unverified): Caveat added to assumption A2
- L1 (Deep Wiki context): Added
- L2 (Agent constraints empty): Filled during finalization
- L3 (Q5 status): Fixed

### Challenger findings (5 total: 2H, 2M, 1L)
- H1 (disk-first vs CRDT): Intentional phasing. Convergence path documented in risks. Held.
- H2 (per-file code-index scaling): Real concern. Scaling boundary (~500 files) documented. Batch limits exist. Held.
- M3 (watcher vs explicit triggers): Watcher is better — catches writes from any source. Held.
- M4 (coexistence with editor stack): Added as risk with mitigation (debounce + content-hash).
- L5 (CLAUDE.md freshness is ASSUMED): Downgraded D14 from DIRECTED to ASSUMED.

### Changes from audit/challenge
- D14 downgraded to ASSUMED (CLAUDE.md compliance unvalidated)
- 4 new risks added (coexistence, disk-first divergence, code-index scaling, STORIES.md divergence)
- Risk table row for just-bash updated to reflect actual stack

## 2026-04-08 — Finalization

- All 19 open questions resolved (0 remaining)
- 23 decisions in decision log (21 LOCKED/DIRECTED, 1 DEFERRED (D9), 1 ASSUMED (D14))
- Section 16 (Agent constraints) filled: SCOPE, EXCLUDE, STOP_IF, ASK_FIRST
- Status set to Approved
- Baseline commit: bfee3dc (unchanged — no commits during session)
