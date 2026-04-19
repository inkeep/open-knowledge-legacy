# Changelog — MCP Install Harness Coverage Spec

## 2026-04-18 — Session 1: Intake + Scaffold

### Intake decisions (all recommended, confirmed by user)
- **D-Intake-1 (LOCKED):** Scope = all 7 harnesses in one spec (not phased).
- **D-Intake-2 (LOCKED):** Cowork stance = "supported with known caveats" — init writes `claude_desktop_config.json`; docs list #24433 per-tool approval + #26259 stdio bridge reliability as known Anthropic-side issues.
- **D-Intake-3 (LOCKED):** Atomic writes = own them (tmp+rename) across all targets. No vendor-CLI fallback.
- **D-Intake-4 (LOCKED):** Headless mode = `--yes` flag for non-interactive install of all detected harnesses.

### Agent-recommended, not user-confirmed (subject to user override)
- **R-1 (DIRECTED):** User-scope default = project-scope stays default; `--global` flag opts into user-scope writes. Preserves existing behavior; team-lead persona keeps project-scope-as-code.

### Artifacts created
- `SPEC.md` (scaffold with Intake content)
- `evidence/` (ready for iteration-loop findings)
- `meta/_changelog.md` (this file)
- Baseline commit: `aced0253`
- Branch: `spec/mcp-install-harnesses` (worktree)

### Dispatched
- Worldmodel subagent — 1P codebase surfaces related to init + MCP config; output to `evidence/worldmodel-1p.md`

### Base reference
Research complete at `reports/mcp-server-auto-install-harnesses/` (committed as `aced0253`):
- 14 evidence files covering 7 harnesses × 11 dimensions
- 4 research passes: initial 7-harness survey; enable-by-default + CLI-vs-file + tooling; gap-closure (Cowork + Cursor first-run); localhost-HTTP pass; runtime self-install + Cowork escape paths
