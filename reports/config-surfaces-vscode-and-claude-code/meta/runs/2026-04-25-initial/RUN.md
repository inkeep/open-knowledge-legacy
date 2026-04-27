# Run: 2026-04-25-initial

**Status:** Closed
**Intent:** Initial
**Created:** 2026-04-25
**Closed:** 2026-04-25

## Purpose
Build a side-by-side conceptual map of how VS Code (mature GUI editor) and Claude Code (young CLI agent) handle per-user-global / per-project / per-user-project configuration. Stance: factual landscape only.

## Scope

**In-scope (delta = full rubric, initial run):**
- D1 Conceptual axes (light, orchestrator-authored)
- D2 VS Code scope topology (DEEP — worker A)
- D3 Claude Code scope topology (DEEP — worker B)
- D4 Side-by-side equivalences (deep, orchestrator-authored from D2+D3)
- D5 Asymmetries (moderate, orchestrator-authored)
- D6 Design-choice analysis (moderate, orchestrator-authored)
- D7 Brief comparison-product touch (light — worker C: git/ESLint/JetBrains/npm/Cursor)

**Out-of-scope:**
- Apple defaults / XDG / 12-Factor lineage history
- 15-product survey matrix
- 1P analysis: Open Knowledge `.open-knowledge/config.yml`
- Settings/Preferences/Configuration terminology history
- Performance / load-time analysis
- Schema validation libraries (covered in `reports/config-edit-paths/`)

## Delta Rubric

| # | Dimension | Depth | Priority | Owner |
|---|-----------|-------|----------|-------|
| D1 | Conceptual axes | Light | P1 | Orchestrator (synthesis from D2/D3) |
| D2 | VS Code scope topology | Deep | P0 | Worker A |
| D3 | Claude Code scope topology | Deep | P0 | Worker B |
| D4 | Side-by-side equivalences | Deep | P0 | Orchestrator |
| D5 | Asymmetries | Moderate | P1 | Orchestrator |
| D6 | Design-choice analysis | Moderate | P1 | Orchestrator |
| D7 | Comparison-product touch | Light | P2 | Worker C |

## Source Anchors

- VS Code official docs: `https://code.visualstudio.com/docs/configure/settings` (accessed 2026-04-25)
- VS Code Settings Sync: `https://code.visualstudio.com/docs/configure/settings-sync`
- VS Code Profiles: `https://code.visualstudio.com/docs/configure/profiles`
- VS Code multi-root workspaces: `https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces`
- VS Code Configuration API: `https://code.visualstudio.com/api/references/vscode-api#ConfigurationTarget`
- VS Code source: `https://github.com/microsoft/vscode` (microsoft/vscode @ main)
- Claude Code settings docs: `https://docs.claude.com/en/docs/claude-code/settings`
- Claude Code memory docs: `https://docs.claude.com/en/docs/claude-code/memory`
- Claude Code MCP docs: `https://docs.claude.com/en/docs/claude-code/mcp`
- Claude Code subagents: `https://docs.claude.com/en/docs/claude-code/sub-agents`
- Claude Code skills: `https://docs.claude.com/en/docs/claude-code/skills`
- Claude Code hooks: `https://docs.claude.com/en/docs/claude-code/hooks`
- Prior report (Claude Code config resolution narrow scope, MCP/skills/agents): `~/.claude/reports/claude-code-configuration-resolution/REPORT.md`
- Prior report (config-edit-paths): `reports/config-edit-paths/REPORT.md`

## Shared Context

### Canonical sources and owners

| Source | Owner | Notes |
|--------|-------|-------|
| VS Code official docs (settings/profiles/sync/keybindings/workspaces) | Worker A | Primary for D2 |
| `microsoft/vscode` source (settings registry, scope enum) | Worker A | Primary code source for scope tag definitions |
| Claude Code official docs (settings/memory/mcp/agents/skills/hooks/plugins) | Worker B | Primary for D3 |
| Prior `claude-code-configuration-resolution` report | Worker B (read for context) | Treat as secondary; re-verify any cited claim against current docs. Pre-existing depth on MCP/skills/agents resolution. |
| Git/ESLint/JetBrains/npm/Cursor docs | Worker C | Primary for D7; one paragraph each, NOT exhaustive |

### Notes for workers
- Stance is **factual landscape only**. No recommendations, no "you should." Decision-triggers ("matters when X") welcome.
- This is a 3P/external survey. Do NOT analyze the user's own codebase.
- Length discipline: workers return findings (max 10), not prose. Orchestrator synthesizes.
- Confidence labels CONFIRMED/INFERRED/UNCERTAIN/NOT FOUND used consistently.
