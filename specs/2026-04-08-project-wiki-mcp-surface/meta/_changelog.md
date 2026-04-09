# Changelog

## 2026-04-08 — Initial spec session

### Intake
- Problem framed: project wiki in `.open-knowledge/` that stays current with codebase
- SCR stress-tested against 5 probes — strong on all dimensions
- Three personas identified: developer (Claude Code), developer (other tools), team lead/new member

### Key decisions (initial round)
- D1-D3: Agent writes files directly, no CRDT, no drafts/permissions
- D2 evolved: Started as "just-bash approach" → changed to "thin MCP server, agent uses native tools"
- D4: `init` as MCP tool + `/init-wiki` skill for population
- D5-D6: `.mcp.json` in repo, catalogs consolidated in `.open-knowledge/`
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

## 2026-04-09 — Session: CLI init pivot, skills → MCP prompts, config merge, canonical naming, adaptive write deferred

### Scope additions (built beyond the original spec)

- **Sticky folder descriptions in subfolder `INDEX.md`** — subfolder INDEX.md files now preserve `title` and `description` frontmatter fields across every catalog regeneration. They surface in the parent folder's `## Subfolders` list (`- **[Title](path/INDEX.md)** (N articles) — description`). New helper `readIndexMeta` in `packages/cli/src/wiki/catalog.ts`; `rebuildDirCatalog` in `watcher.ts` sticks whatever the author wrote into the generator's output. Watcher also picks up `INDEX.md` edits directly (previously filtered); infinite-loop risk is contained by content-hash dedup in `writeIfChanged`.
- **Directory rename `.openknowledge/` → `.open-knowledge/`** — unifies the wiki directory name with the CLI server config directory (both hyphenated now, matching the package name `@inkeep/open-knowledge`). Touched ~27 files across code, tests, in-flight spec, and project docs. Historical reports in `reports/` left with the old name.
- **Prompt-file extraction to `packages/cli/src/mcp/prompts/`** — each of the three workflow prompts lives in its own file (`init-wiki.ts`, `ingest.ts`, `research.ts`) alongside `shared.ts` (helpers) and `index.ts` (barrel with `registerAllPrompts`). `server.ts` shrinks ~200 lines and no longer carries inline prompt bodies.
- **Canonical `mcp__openknowledge__*` naming** — documented form for referring to prompts. Used in `AGENTS.md`, server `INSTRUCTIONS`, all prompt file comments, and this changelog. Unambiguous across MCP clients.

### Architectural pivots

- **Config merge (Option B).** Deleted `packages/cli/src/wiki/config.ts` + its test. Wiki paths moved into `ConfigSchema` in `packages/cli/src/config/schema.ts` as a new `wiki:` section with the same three fields (`articles_path`, `external_sources_path`, `research_path`) and the same defaults. New helper `packages/cli/src/wiki/paths.ts` exports `resolveWikiPaths(config, okDir)`. Callers (`mcp/server.ts`, `mcp/commands/mcp.ts`, `wiki/watcher.ts`, `wiki/init.ts`) all updated. Scaffolding no longer writes `.open-knowledge/config.yaml` — wiki config comes from the same `.open-knowledge/config.yml` as CLI server config. **D16 updated.**

- **Skills → MCP prompts pivot.** The three workflow skills (`/init-wiki`, `/ingest`, `/research`) were previously shipped as Claude Code SKILL.md files bundled with the package and copied via `install-skills`. All three SKILL.md files deleted (from both `packages/cli/skills/` and the repo-level `.claude/skills/` copies). `install-skills` CLI subcommand + tests deleted. They are now MCP prompts registered from `packages/cli/src/mcp/prompts/`. Cross-client by design — any MCP client that implements `prompts/list` gets them without any file copying. Claude Code surfaces them in its slash menu as `mcp__openknowledge__<name>`. **D4 updated.** Spec §6 Should rows rewritten.

- **Scaffolding moved from MCP tool to CLI subcommand.** Deleted the `init` MCP tool registration from `server.ts` (~60 LOC). Added `open-knowledge init` as a new Commander subcommand (`packages/cli/src/commands/init.ts`) alongside `start` and `mcp`. It calls the same `initWiki()` function the old tool used AND writes an `openknowledge` entry to `./.mcp.json` (preserving existing entries, idempotent, `--force` to overwrite, `--skip-mcp` to scaffold only). Resolves the chicken-and-egg problem for first-time setup: users previously couldn't call an MCP tool to scaffold the directory before the MCP server was wired up. **D4 and D13 updated.** Phase 1 renamed.

- **Ingest prompt body simplified.** Earlier version had a per-source-type matrix (GitHub → `gh gist view`, generic → `curl -sL`, etc.). Replaced per user direction with "fetch for URLs, Read for local files, stop if blocked" — simpler decision tree, lets the agent pick its own raw-fetcher, explicit fallback behavior for anti-scraping sites (Twitter/X, paywalls, etc.).

- **Watcher starts on MCP server startup when `.open-knowledge/` exists.** Already worked, but previously the `init` MCP tool was also responsible for starting the watcher mid-session (via `ensureCatalogs()`). Now that scaffolding happens in the CLI, the watcher only starts via the server startup block — if a user scaffolds mid-session, they need to `/mcp` reconnect to pick up the new directory.

### Deferred (from original spec, not yet built)

- **Adaptive write path (D1, was LOCKED → now DEFERRED).** SPEC.md §6 required that agent writes route through the MCP server to Hocuspocus DirectConnection (when running) or disk (when not), and D2 listed "adaptive write path" as part of the thin-server surface. Not built in any user story — US-005 shipped `init` + `instructions` + catalogs but skipped the write tool. For P0 the disk-only subset is acceptable per NG5; the three MCP prompts all instruct agents to use their native `Write` tool. The adaptive path's real value is in the editor-open case (instant propagation, origin tagging, per-origin undo), which is Phase 2 (S1) territory. **D1 marked DEFERRED with explicit trigger condition.** Full work plan in §15 Future Work entry "Adaptive write path".

### Spec updates (SPEC.md changes made this session)

- **§6 Must rows rewritten** — thin MCP server row (init → prompts), adaptive write path row (replaced with "native tools for P0, see D1 deferral"), init MCP tool row (→ CLI subcommand), config.yaml row (→ `config.yml` `wiki:` section).
- **§6 Should rows rewritten** — three skills → three MCP prompts.
- **§9 architecture diagram updated** — removed "init tool (scaffold)" and "adaptive write path"; added "workflow prompts" + "NO TOOLS" callout + separate CLI entry-point block.
- **§9 Coexistence section** — marked DEFERRED with pointer to §15 Future Work.
- **§10 decision log** — D1 LOCKED → DEFERRED (with trigger); D2 wording updated; D4 wording updated; D13 wording updated; D16 wording updated.
- **§13 Phase 1** — renamed "MCP server + init + catalogs" → "CLI init + MCP server + catalogs", requirements and acceptance criteria rewritten.
- **§15 Future Work** — new "Adaptive write path (D1 deferred from LOCKED)" entry with concrete work plan.

### Phase acceptance demonstrated this session

- **Phase 4 (`/ingest`):** ran `mcp__openknowledge__ingest https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`, produced `.open-knowledge/external-sources/karpathy-llm-wiki.md` with correct frontmatter, `external-sources/INDEX.md` auto-updated via the watcher, found and fixed a cosmetic double-period bug in the catalog generator along the way.
- **Phase 5 (`/research`):** ran `mcp__openknowledge__research` against the Karpathy URL, produced `.open-knowledge/research/llm-maintained-wikis-pattern.md` — a structured provisional analysis comparing Karpathy's LLM Wiki pattern against Open Knowledge's design, grounded in PROJECT.md §XQ2 differentiators.
- **Phase 2 (`mcp__openknowledge__init-wiki`):** prompt registration verified end-to-end (Claude Code's slash menu surfaces it as `mcp__openknowledge__init-wiki`; the rendered prompt body reflects the workflow), but the "produce real articles from the codebase" run was **not executed this session**. The prompt has never been invoked against Open Knowledge's own codebase to produce canonical articles. Phase 2 acceptance is technically pending. Scheduling: next session or when someone needs the articles. The rest of the phase's machinery is in place (prompt, watcher, sticky folder descriptions, scaffolded subfolders) — the only missing piece is the agent actually running through the workflow once and writing real content to `articles/`.
