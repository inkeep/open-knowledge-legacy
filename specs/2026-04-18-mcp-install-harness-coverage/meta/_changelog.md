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

---

## 2026-04-20 — Session 3: Cowork audit applied + PR #207 re-verification

### Opus Cowork audit delivered
- `evidence/cowork-launcher-cwd-audit.md` (281 lines, 4 primary sources)
- **Finding:** Cowork launcher spawns in-VM `claude` with `cwd = /sessions/<sessionName>/` — NOT the mounted workspace. Workspace passed via `--add-dir` (permission-only, not cwd). In-VM claude advertises `file:///sessions/<sessionName>/` as its sole MCP root — ephemeral VM scaffolding.
- Cross-verified: local `~/.claude/oss-repos/claude-code/src/bootstrap/state.ts:260-278` + `src/services/mcp/client.ts:1009-1018` + issue #50168 `[Spawn:create]` log evidence + aaddrick.com RE
- Anthropic stance audited: #24433 CLOSED not-planned; #26259 OPEN zero staff engagement 6 weeks; #26287 CLOSED (feature request for `--cwd`); #47371 OPEN zero comments
- A10 FALSIFIED; Q-Cowork-cwd RESOLVED → D-11

### Decisions LOCKED this session
- **D-11 (new):** Cowork is NOT a supported consumer of `open-knowledge mcp` under current Anthropic architecture. Claude Desktop standalone IS supported. Re-evaluate only if Anthropic ships #26287 or changes spawn cwd.
- **D-Intake-2 revised:** Split Claude Desktop standalone (supported) vs Cowork mode (NOT SUPPORTED — architectural limit).
- **NG12 (new):** Never work around Cowork in-VM cwd binding. Requires Anthropic upstream.

### PR #207 re-verification (HEAD `c7bb5132`, verified 2026-04-20 via live diff)
- **D-9 SHIPPED in #207:** identical/conflicting/missing merge trichotomy in `init.ts`
- **D-6 PARTIALLY SHIPPED in #207:** `claude-desktop` editors.ts target with plain entry — no `--global` gate, no `--project` baking
- **A11 CONFIRMED with nuance:** `bypassProjectSelection: true` exists as `McpServerOptions` field; currently reachable ONLY via `--port`. Our `--project <abs-path>` is a ~10 LoC Commander delta.
- **Latent regression identified:** #207 at `c7bb5132` ships Codex + Claude Desktop Chat broken out of the box (both hit `ROOTS_UNAVAILABLE_ERROR`). Our D-7 is the fix.

### Spec updates applied (SPEC.md)
- Header: baseline desc updated; PR #207 link pinned to `c7bb5132`
- §1 Problem statement: Cowork split from Claude Desktop
- §2 Goals: G4 split (Desktop standalone supported; Cowork NOT SUPPORTED)
- §3 Non-goals: added NG12 (never work around Cowork cwd)
- §6 FR-8 caveat block: 3-way split (standalone works / Cowork NOT SUPPORTED / Linux unsupported)
- §8 Current state: rewrote MCP runtime paragraph for main vs post-#207 with `c7bb5132` verified details
- §10 D-6 / D-7 / D-8 / D-9 / D-11: updated to reflect #207's ship state + locate the latent regression
- §11 Q-Cowork-cwd RESOLVED → D-11; Q-PR207 Directed (after merge); added Q-PR207-cowork-err, Q-PR207-project-arg
- §12 A10 FALSIFIED; A11 CONFIRMED with nuance

### Next steps
- User to open draft PR + tag mike-inkeep with the 3 evidence-grounded items:
  1. Codex + Claude Desktop Chat regression — `--project <abs-path>` arg is the 10 LoC fix (+ install-time baking from our spec)
  2. `roots/list_changed` handler is dormant for Claude Code (not a bug — Claude Code's root is static)
  3. Consider Cowork-specific error pattern match on `^/sessions/[A-Za-z0-9-]+/?$` to save triage
- Then move to audit phase (task #16): parallel /audit + design-challenge subprocesses
- Then /assess-findings (task #17), verify + finalize (task #18)

---

## 2026-04-20 — Session 4: `git fetch origin main` — major overlap with merged PR #221

### Discovery
PR #221 merged 2026-04-20 at 16:50 UTC as commit `31888dcc` on main — shipped Tim Cardona's `specs/2026-04-17-claude-desktop-init-cwd/SPEC.md` (17 decisions LOCKED). Our spec had no visibility into it prior to the `git fetch`. The spec makes significant overlap with our D-6/D-7/D-9; we now build on top rather than in parallel.

### What #221 shipped (verified via reading `editors.ts` + `global-scope-entry.ts` on origin/main)
- **`claude-desktop` editor target** — macOS + Windows, Linux refuses with friendly error
- **`--cwd <abs>` baked into args** for global-scope targets (Claude Desktop + Windsurf)
- **Project-qualified server keys** — `open-knowledge-<slug(basename(cwd))>` with `-2`/`-3` auto-disambiguation
- **Realpath-normalized `--cwd` match** for idempotent re-init across symlinked paths + hand-crafted keys
- **Shared `globalScopeResolveServerKey` helper** in `global-scope-entry.ts` — parameterized by `{detectLegacy}`
- **Windsurf legacy migration** — plain `open-knowledge` entry with no `--cwd` → rewrites to qualified form
- **Windsurf upgraded to global-scope write path** — closes latent pre-#221 multi-project collision bug
- **Restart hint** — "quit and relaunch Claude Desktop to activate" emitted on written/overwritten
- **17 decisions LOCKED** in their own spec with evidence, audit findings, design-challenge

### Impact on our spec (decisions reclassified)
- **D-6 SUPERSEDED**: Our `--global` gate for Claude Desktop conflated host-user-global scope with opt-in; #221's detect-and-preselect is cleaner. No action needed.
- **D-9 SUPERSEDED**: #221's `resolveServerKey` via realpath-match is semantically richer than our planned identical-vs-conflicting trichotomy (handles hand-crafted keys, symlinks, auto-disambig). When #207 rebases onto main it should adopt #221's shape.
- **D-7 RENAMED** `--project` → `--cwd` to align with #221's convention. Reframed as: (a) wire `--cwd` to `bypassProjectSelection: true` in #207's resolver (~10 LoC), (b) bake `--cwd` into Codex project-scope (D-13) + user-scope (D-12) configs.
- **D-12 LOCKED (new)**: Codex user-scope adopts `globalScopeResolveServerKey` helper verbatim — same class of multi-project collision bug Windsurf had pre-#221.
- **D-13 LOCKED (new)**: Codex project-scope bakes `--cwd` — one-line `buildEntry(cwd)` widening. Breaks post-#207 without it.
- **NG13 added**: Never re-ship #221 work (Claude Desktop target, `--cwd` baking for global-scope, Windsurf migration, globalScopeResolveServerKey helper).

### Q-221-rebase added
When #207 rebases onto main @ `31888dcc`, mike needs to drop #207's claude-desktop target in favor of #221's. #207's version is plain-entry / no-`--cwd` / no-qualification — a regression against main. Mention in coordination note.

### A12 added (SUPPORTED)
`globalScopeResolveServerKey` helper works for `codex-user` with `detectLegacy: false` — verify at implementation.

### Spec updates applied (SPEC.md)
- Header: added #221 as prior-art link, reframed #207 dependency, updated baseline to note `origin/main` at `31888dcc`
- §1 Problem statement: reframed to acknowledge #221's coverage (6 editors, global-scope pattern, restart hint); 8 remaining gaps
- §2 Goals: G4 renamed `--project` → `--cwd`
- §3 Non-goals: added NG13 (never re-ship #221 work)
- §6 FR-1: marked SHIPPED in #221 (strikethrough); FR-2 expanded with Codex user-scope note
- §8 Current state: complete rewrite — state of main post-#221, state of #207, routing landscape, 8 remaining gaps
- §9 Data model: 9 IDs, clear split between roots-routing vs globalScope-pattern editors; `--cwd` alignment throughout
- §9 Architecture diagram: updated to show #221 patterns + our sidecar layering
- §10 Decision log: D-6 SUPERSEDED, D-9 SUPERSEDED, D-7 reframed + renamed, D-12 + D-13 added, D-8 clarified as multi-PR-layered
- §11 Q-PR207 directed after-merge; Q-PR207-project-arg renamed → Q-PR207-cwd-wiring; added Q-221-rebase
- §12 A11 updated to reflect `--cwd` alignment; A12 added for globalScopeResolveServerKey

### Next steps unchanged
- User to open draft PR on our worktree branch; tag mike with 3 items + Q-221-rebase guidance
- Then audit phase (task #16)
- Then assess-findings (task #17), verify + finalize (task #18)
