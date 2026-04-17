# Changelog

## 2026-04-16

### Session start

- **Bet description:** "Zero-ceremony resume" — a user who ran `ok init` 10 days ago opens their MCP client (Claude Code, Cursor, Windsurf, Codex, VS Code) and the handshake alone brings up the collab server + UI, connects MCP tools, and surfaces a UI URL for the client's preview pane. Multi-agent-per-project and multi-project-per-machine both supported.

- **Decisions locked by user before session**
  - **D1 (LOCKED):** Decompose into 2-3 sibling stories (not a single story; use `/projects`-level shaping).
  - **D2 (LOCKED):** `.mcp.json` location = project root only. No user-global `~/.claude/` fallback in this project.
  - **D3 (LOCKED):** Spawn model = hybrid. Prefer client-launched (Claude Code `launch.json` + `preview_start`); fall back to MCP stdio spawning `ok start` for clients without a launch concept.

- **Non-goals (carried from user brief)**
  - Project registry / switching is a sibling bet ([[stories/init-and-project-switching/STORY]] Part B).
  - Onboarding UX is owned by [[projects/day-0-editor-completeness]] ED-4.
  - Electron desktop lifecycle is a separate spec ([[specs/2026-04-11-electron-desktop-app/SPEC]]).

- **Scaffolding:** Created `projects/zero-ceremony-resume/{PROJECT.md, evidence/, meta/_changelog.md}`.

- **Worldmodel dispatch:** `general-purpose` subagent launched with `--depth full` on MCP-as-starter prior art, service lifecycle patterns, MCP client lifecycle variation, orphan-process discipline, multi-project coordination, and MCP tool-response URL conventions. Running in background.

### Worldmodel return

- Subagent returned \~260k tokens of synthesis. Captured in `evidence/worldmodel-synthesis.md`.
- Key finding: [reports/zero-config-bunx-cli-packaging/REPORT.md §D4](../../../reports/zero-config-bunx-cli-packaging/REPORT.md) argued against MCP auto-starting, but this project answers that report's Open Question #1 with detached-spawn rationale. Not a contradiction; it's the resolution §D4 explicitly left open.

### Phase 1 decisions (batch A)

- **PQ4 (LOCKED):** UI + collab as TWO processes per project, each with its own lockfile in `<contentDir>/.open-knowledge/`. Global UI serving multi-collab is a future bet; this project ships per-project split.
- **PQ5 (DIRECTED):** Idle auto-shutdown after 30 min with zero clients connected. Symmetric for UI and collab.
- **PQ6 (LOCKED):** Windows \[NOT NOW]. macOS + Linux only.
- **PQ9 (DELEGATED):** Appetite = no formal time-box. Greenfield; speed > rigor.

### Phase 1 artifact writes

- `PROJECT.md` Strategic context, Items table (18 items triaged), Cross-cutting concerns (CC-A through CC-F), draft Stories section with 3 sibling stories + 'Now' phasing rationale.
- `evidence/current-state.md` created — verified baseline code trace.
- `evidence/worldmodel-synthesis.md` created — landscape discovery output.

### Cascade effect

- PQ4 decision reshaped Story 1 from "MCP spawn a single server" into "lifecycle architecture" bundling UI split + per-project UI lockfile + MCP spawn + shared idle primitive + `ok stop`. Acknowledged to user; 3-story count preserved.

### Phase 2 refinement (completed same session)

- Story 1 sharpened: added TQ3 (list-tool per-result URL), TQ4 (always-spawn with env opt-out), TQ6 (`ok ui` entry point), TQ7 (`.claude/launch.json` update in scope), TQ8 (spawn-race bounded-retry), XQ1 (idle-shutdown helper signature), XQ6 (`bun run dev` monorepo compat).
- Story 2 enumerated the 14 tools receiving `previewUrl` (plus single-doc vs list-array shape distinction per TQ3).
- Story 3 clarified config-dir-exists heuristic as acceptable false positive (TTY prompt is escape hatch).

### Phase 3 synthesis (completed same session)

- Phasing: all 3 stories in Now. Rationale: risk-first (Story 1 tests the core bet assumption), dependency-first (Story 3 is precondition for Story 1 cross-client value), value-first conditional (bundle value is binary; subset = partial-broken UX). Walking-skeleton passes.
- Rabbit holes finalized: 7 tempting-but-out-of-scope items with explicit "don't" rationale.
- Pre-mortem expanded: 6 failure modes + mitigations; 3 explicit assumptions with verification plans.
- Implementer's veto: passes. Spec-sharpener can proceed without re-asking bet-level questions.

### Final score

20 Decided, 0 Exploring, 0 Open, 1 Assumed (HIGH), 3 Parked. Ready for spec-level sharpening on Story 1 (the big one).

### Next steps (post-session)

- Spec Story 1 first (longest pole; detaches the §D4 supersession and orphan-cleanup decisions).
- Spec Story 2 second or in parallel (depends on Story 1's UI lock shape only for URL resolution, which is dynamic).
- Spec Story 3 last (smallest; flag-flip + editor-detection generalization).

### Pending (carry-forward)

- PQ10, XQ4, XQ5 parked with revisit triggers.
- Windows support deferred (PQ6) — document gotchas in Story 1 spec but no testing.

