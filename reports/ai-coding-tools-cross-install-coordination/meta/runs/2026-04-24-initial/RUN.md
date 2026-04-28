# Run: 2026-04-24-initial

**Status:** Active
**Purpose:** First research pass for `ai-coding-tools-cross-install-coordination`. Three subagents split by tool family. Factual-landscape stance.

---

## Delta rubric (this run — all P0)

| # | Dimension | Depth | Focus |
|---|-----------|-------|-------|
| 1 | Installation surface map | Moderate | Per tool: DMG / CLI / IDE ext / web, where state lives. |
| 2 | Cross-install coordination mechanisms | Deep | Lock files? IPC? Shared config dirs? Handshake protocols? |
| 3 | Version-drift handling | Deep | DMG v1.5 meets CLI v2.0 — silent drift / refuse / reconcile / who wins? |
| 4 | Launch-time binary precedence | Moderate | Multiple CLI shims resolving same command name — who wins? |
| 5 | Self-update coordination | Moderate | Per-install auto-update; does DMG update bundled CLI; CLI detect stale DMG? |
| 6 | Shared-state directory conventions | Moderate | `~/.<tool>/`, schema-version markers, portability across installs. |
| 7 | Vendor messaging on install choice | Light | Docs/README guidance on "which path to use". |

---

## Subagent assignments

| Agent | Tools | Primary sources |
|-------|-------|-----------------|
| **A1 — Claude Code cluster** | Claude Code (CLI), Claude desktop app, Claude Code IDE extensions | Anthropic docs, `~/.claude/` inspection (if locally accessible), changelogs, issue tracker if public. Claude Code source is not public — rely on docs + observable behavior + binary inspection where possible. Label `INFERRED` liberally. |
| **A2 — VS Code lineage** | VS Code, Cursor, Windsurf | github.com/microsoft/vscode (OSS), Cursor docs, Windsurf docs. VS Code is the reference pattern; Cursor & Windsurf inherit from it and may add divergences. |
| **A3 — Independent architectures** | Zed, Warp | github.com/zed-industries/zed (OSS), Warp docs + support articles. Both have unique architectures — Zed is Rust-native, Warp blends terminal + AI. |

---

## Output contract (every agent)

Return a single Markdown response with these sections, in order. Do not write files.

```
## Tool: <name>

### D1 — Installation surface
- Enumerated install paths with evidence cites (URL + access date OR file:line)

### D2 — Cross-install coordination
- Mechanism (if any). Lock files, IPC, shared dirs, version handshakes.
- Explicitly state `NOT FOUND` with searches documented if no mechanism exists.

### D3 — Version-drift handling
- What happens when coexisting installs disagree on version?
- Cite tests / docs / issue threads where the answer is empirical.

### D4 — Launch-time binary precedence
- If two install paths both put a `tool` on PATH, who wins and why?

### D5 — Self-update coordination
- Per-install auto-update. Does DMG also bump bundled CLI? CLI stale-detection?

### D6 — Shared-state dirs
- `~/.<tool>/` or equivalent. Schema versioning on disk. Per-install or shared?

### D7 — Vendor install-choice messaging
- Single-sentence characterization of docs stance.

### Gaps / followups
- Anything P0 that couldn't be resolved; searches tried.

### Confidence summary
- Per-dimension label: CONFIRMED / INFERRED / UNCERTAIN / NOT FOUND.
```

---

## Canonical sources (don't re-discover)

- `electron-bundled-cli-install-patterns/` — existing report on VS Code DMG→PATH CLI install mechanism. Cite, do NOT re-derive.
- `mastra-speakeasy-cli-install-recommendations/` — distribution-channel posture.
- `electron-desktop-app-operations-2025/` — Electron ops surface.

---

## Non-goals (do not investigate)

- Electron code-signing specifics
- Single-install DMG→PATH symlink mechanics (covered in cited report)
- Windows + Linux divergence (mention only if material)
- Non-AI-coding tools (Slack, Discord, Obsidian)
- 1P application to Open Knowledge (report stance is Factual)

---

## Coverage tasks (orchestrator tracks)

| # | P0 dim | Status |
|---|--------|--------|
| 1 | Installation surface (all tools) | pending |
| 2 | Cross-install coordination (all tools) | pending |
| 3 | Version-drift handling (all tools) | pending |
| 4 | Launch-time binary precedence (all tools) | pending |
