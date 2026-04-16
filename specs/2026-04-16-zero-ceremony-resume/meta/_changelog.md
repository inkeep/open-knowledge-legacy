---
title: "Zero-Ceremony Resume — Spec Changelog"
description: "Append-only process history for specs/2026-04-16-zero-ceremony-resume/SPEC.md. Tracks decision evolution, assumption lifecycle, scope changes, and session summaries."
tags:
  - changelog
  - meta
  - spec
---

# Changelog

## 2026-04-16

### Session start (spec kickoff)

- **Input:** `projects/zero-ceremony-resume/PROJECT.md` — just finalized. 20 Decided items, 1 Assumed HIGH, 3 Parked. Implementer's veto passes.
- **Scope:** One SPEC.md covering all 3 stories (US-001 Lifecycle split, US-002 previewUrl contract, US-003 Init defaults) as a bundle per user's "one SPEC.md for the whole bundle" choice.
- **Worktree:** `.claude/worktrees/zero-ceremony-resume-spec/`. Open Knowledge MCP server rooted at main — writes use native `Write` / `Edit` with "Open Knowledge MCP unavailable:" prefix. `projects/zero-ceremony-resume/` copied in for reference.
- **Baseline commit:** `5dab8683`.

### Carry-forward from PROJECT.md (Items table → spec-level)

**Decisions LOCKED (carried):**
- PQ2: `.mcp.json` at project root only.
- PQ3: Hybrid spawn (client-launched + MCP stdio fallback).
- PQ4: UI + Collab as two processes per project, each with own lockfile.
- PQ6: macOS + Linux only; Windows [NOT NOW].

**Decisions DIRECTED (carried):**
- PQ5: 30-min idle auto-shutdown, symmetric.
- PQ7: Init default = all detected editors.
- PQ8: `ok stop` command in Story 1 scope.
- TQ1: `spawn({detached:true, stdio:'ignore'}).unref()`.
- TQ2: Extend existing `previewUrl` field; no new field name.
- TQ3: List tools get per-result `previewUrl` arrays.
- TQ4: MCP always-spawn when lock absent; `OK_MCP_AUTOSTART=0` env opt-out.
- TQ6: New `ok ui` top-level command.
- TQ7: `.claude/launch.json` updated to start both UI + collab.
- TQ8: Spawn-race via `ServerLockCollisionError` + bounded retry.
- XQ1: Shared `attachIdleShutdown({...})` helper.
- XQ2: §D4 supersession write-up mandatory.
- XQ6: `bun run dev` compat required.

**Assumed HIGH (carried — verify in spec):**
- TQ5: per-contentDir lock handles N concurrent projects.
- XQ3: MCP clients ignore unknown fields.

**Parked (carried to Future Work):**
- PQ10: Process supervisor / auto-restart.
- XQ4: Electron non-regression confirmation (parked).
- XQ5: CC1 broadcaster as liveness signal (alt to lockfile polling).

### Phase 5 iteration (completed same session)

- Investigated OQ-2.1, OQ-2.2, OQ-5.1 autonomously via code traces. All resolved (D-015, D-016, D-026).
- Investigated OQ-1.1 UI client-tracking → new evidence file `ui-client-tracking.md`; surfaced simpler "tie UI to collab" design (D-017, later revised per H1).
- Investigated OQ-1.2 launch.json → new evidence file `launch-json-and-port.md`; resolved to single entry pointing at `ok ui` (D-020).
- User confirmed Group A decisions: D-017 UI tied to collab; D-018 child-written log (later revised via M7); D-019 show-all-unselected; D-020 single launch.json; D-023 ok start auto-spawns UI.
- First SPEC.md written with 579 lines, 14 FRs, 27 decisions, 2 open questions (OQ-1.4, OQ-A7).

### Phase 6 audit (completed same session)

- Spawned auditor (general-purpose subagent + /audit) + challenger (general-purpose subagent + design-challenge protocol) in parallel.
- **Auditor (15 findings):** 4 High (tool count 17→21, port 3000 default, editor config paths, preview_start port-model contradiction). 7 Medium. 4 Low.
- **Challenger (11 findings):** 5 High (H1 BLOCKING idle-shutdown design hole; H2 port 3000 self-imposed; H3 Story 2 independent; H4 agent session leak; H5 stepping-stone overclaim). 4 Medium. 2 Low.
- Findings written to `meta/audit-findings.md` and `meta/design-challenge.md`.

### Phase 7 assessment (completed same session)

- Loaded `/assess-findings`. Applied 4-phase protocol.
- Verified H1 via Hocuspocus `getConnectionsCount()` semantics + CC1 broadcaster at `standalone.ts:861`.
- Verified H2 via Claude Code official docs — `autoPort:true` finds free port, passes via `PORT` env var. My prior evidence (secondary sources) missed this.
- Verified F-002 via `config/schema.ts:17` — `ok start` default port = 3000 today.
- Verified F-003 via `editors.ts` — Cursor `.cursor/mcp.json`, Windsurf `~/.codeium/...` user-global.
- Verified F-005 via grep — no `onConnect/onDisconnect` usages in `packages/server/src/` (corrected evidence file).
- Verified F-007 — my D-003 was imprecise; embedding (§D4 OQ#1) vs sibling-spawn (our answer) distinction clarified.
- Presented 4 Group A decision-reopens to user via AskUserQuestion.

### Phase 7 user decisions (Group A, 2026-04-16)

- **H1/F-006 resolved to D-017 revised:** Count WebSocket clients only via `httpServer.on('upgrade')`; DirectConnections invisible to idle-shutdown.
- **H2/F-002/F-004 resolved to D-021 revised:** `ok ui` default=3000 + `autoPort:true`; `ok start` default=0 kernel-allocated.
- **H3 resolved: keep bundled.** 3-story release per PROJECT.md D-013 + user H3 confirmation.
- **H4 resolved: out of scope.** Added NG10 (agent-session cleanup) + Future Work Explored entry. D-029.

### Phase 7 auto-applied corrections + Group C improvements

**Auto-applied factual corrections:**
- F-001 Tool count 21 (not 17); baseline 14% (not 18%); 18 tools to add.
- F-003 Editor config paths corrected (per-editor — Cursor `.cursor/mcp.json`; VS Code `.vscode/mcp.json`; Windsurf user-global).
- F-005 Evidence file corrected re: `onConnect/onDisconnect` hooks not wired.
- F-007 D-003 clarified: embedding vs sibling-spawn architectural distinction.
- F-008 A2 softened to MEDIUM (SEP-1624 clarifying) — D-028.
- F-009 §5 P1 caveat re: OQ-1.4 runtime verification.
- F-010 Added `startedAt` to §1 server.lock shape description.
- F-011 D-011 marked SUPERSEDED.
- H5 Stepping-stone framing softened — split justified on own merits (launch.json + Electron), not as direct path to global UI.

**Group C design improvements applied:**
- M6 → D-009 revised + FR-1.15: dual opt-out (env var `OK_MCP_AUTOSTART=0` AND config `mcp.autoStart: false`).
- M7 → D-018 revised + FR-1.4: kernel `stdio` redirect to tempfile (replaces child-written log).
- M8 → D-027 + FR-1.13: `/api/config` endpoint (replaces `window.__OK_COLLAB_URL__` injection).
- M9 → D-024 revised + FR-1.7/1.7b split: `ok stop` (live kill) separated from `ok clean` (stale prune).

### Phase 8 verify + finalize (completed same session)

**Mechanical checks:**
- ASSUMED decisions: A1/A3 HIGH, A2/A4/A5/A6 MEDIUM — all have verification plans.
- 1-way door confidence: D-003 reversible-flag no; D-007/D-013/D-015/D-016/D-027 all Yes 1-way-door, all at HIGH confidence or clearly scoped.
- Non-goal accuracy: all NG have temporal tags; NG5/6/7/8/9/10 have revisit triggers.

**Resolution completeness gate:**
- All P0 decisions made — 31 decisions with resolution status assigned.
- No new 3P dependencies required.
- Architectural viability validated (detach-spawn via Node docs; autoPort via Claude Code docs; idle-shutdown design via Hocuspocus source trace).
- Integration feasibility verified by A3 + A4 test plans.
- All AC are falsifiable.
- No dependency on Future Work items (H4/NG10 explicitly decoupled via D-017 revised).

**Quality bar:** passes. Every top FR maps to a decision and plan; every decision has user-impact rationale; 1-way doors have evidence references; Future Work has maturity tiers; traceability complete.

**Agent constraints:** SCOPE/EXCLUDE/STOP_IF/ASK_FIRST derived in §16 from In Scope.

### Final spec state

- **SPEC.md:** 587 lines. 17 FRs across 3 user stories. 31 decisions. 7 assumptions (1 resolved). 1 remaining OQ (OQ-1.4 runtime-verifiable at implementation). 12 non-goals with temporal tags.
- **Evidence files (3 spec-local):** `ui-client-tracking.md`, `launch-json-and-port.md`, `idle-shutdown-directconnection.md`.
- **Audit trail:** `meta/audit-findings.md`, `meta/design-challenge.md`.
- **Baseline commit:** `5dab8683` (worktree baseline unchanged from scaffold).

### Status

**Ready for implementation.** Spec passes resolution completeness gate; one remaining OQ is runtime-verifiable and has a documented fallback.
