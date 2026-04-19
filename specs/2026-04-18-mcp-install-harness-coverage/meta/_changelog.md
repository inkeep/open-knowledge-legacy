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

---

## 2026-04-18 — Session 2: Iteration + source audits + findings applied

### Research added (4 new evidence files)
- `claude-desktop-project-scope.md` — confirms Claude Desktop has no project concept for MCP; Cowork workspace mount ≠ MCP routing
- `mcp-resolution-multi-kb.md` — session-switch is impossible on all harnesses; `/add-dir` INITIALLY INFERRED to emit `roots/list_changed`, later corrected via source audit
- `codex-roots-source-audit.md` — **Codex does NOT advertise `roots` capability** (single production path: `codex-rs/codex-mcp/src/mcp_connection_manager.rs:1400-1419`, `roots: None` verbatim)
- `claude-code-roots-source-audit.md` — Claude Code 2.1.114 binary inspection: advertises `roots` as `{}` (no `listChanged`), returns 1 root = startup cwd, `/add-dir` does NOT emit `roots/list_changed`
- `cowork-launcher-cwd-audit.md` — in-flight (Opus subagent)

### Analysis via /analyze on 4 load-bearing decisions
- Decision 1 (NG4 precedent): uphold NARROWLY → D-5 LOCKED
- Decision 2 (Claude Desktop gate): gate on `--global` → D-6 LOCKED
- Decision 3 (settings.local.json gitignore): add to .gitignore → D-10 LOCKED
- Decision 4 (atomic write impl): adopt `write-file-atomic` npm package → D-Intake-3 updated

### PR #207 coordination
Research surfaced [PR #207 "fix(cli): enforce strict MCP routing"](https://github.com/inkeep/open-knowledge/pull/207) as in-flight work touching same surface:
- Adds Claude Desktop as `editors.ts` target (same scope as our D-6)
- Introduces strict `roots/list`-based routing (replaces `process.cwd()` binding)
- Adds identical-vs-conflicting-vs-missing merge trichotomy (our D-9)
- **Our spec inherits PR #207's architecture** (D-8 DIRECTED) and adds install-time capabilities layered on top

### Critical finding from source audits
**PR #207 breaks 2-3 of 7 harnesses** (Codex CLI/Desktop/IDE ext; Claude Desktop Chat) because they don't advertise `roots` capability. `--project <abs-path>` arg baked at install time is the fallback — our D-7 LOCKS this.

### Decisions LOCKED this session
- D-5: Uphold NG4 narrowly; `~/.claude.json` allowed under `--global`
- D-6: Claude Desktop gated on `--global`
- D-7: `--project` arg baked for Codex family + Claude Desktop Chat
- D-8: PR #207 inherited as dependency (DIRECTED)
- D-9: Adopt PR #207's merge trichotomy (DIRECTED)
- D-10: `.claude/settings.local.json` added to `.gitignore`
- D-Intake-3 updated: adopt `write-file-atomic` npm package (not DIY)

### Decisions closed this session (as Assumptions → CONFIRMED)
- A1 (Claude Desktop paths) → CONFIRMED
- A4 (atomic writes via `write-file-atomic`) → CONFIRMED via package adoption
- A7/A8/A9 (roots capability per harness) → CONFIRMED via source audits

### Open questions remaining
- Q3 (cursor-agent mcp enable reliability) — verify during implementation
- Q4 (Windows path resolution) — decide during implementation
- Q19 (docs surface) — resolve during implementation
- Q-Cowork-cwd — blocked on in-flight Opus agent
- Q-PR207 — coordination sequencing with mike-inkeep

### Next steps
- Wait for Opus Cowork audit to complete
- If Cowork launcher cwd resolves to mounted workspace → Cowork works with PR #207 alone (no `--project` needed for Cowork SDK-bridge path)
- If not → document Cowork as blocked on Anthropic architecture, not our spec
- Then move to audit phase (tasks #16-#17)
