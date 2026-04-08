# Evidence: Multi-Project / Workspace Switching UX

**Dimension:** D2 — Multi-project / workspace switching UX
**Date:** 2026-04-08
**Sources:** Obsidian docs/forums, VS Code docs, Notion docs, Cursor docs, JetBrains docs, iTerm2/Warp docs, Raycast/Alfred extensions, XDG spec, zoxide/ghq/Projectile docs, cognitive load research

---

## Key files / pages referenced

- [Obsidian Help - Vault Switcher](https://help.obsidian.md/User+interface/Vault+switcher)
- [VS Code - Workspaces](https://code.visualstudio.com/docs/editing/workspaces/workspaces)
- [Notion Help - Create, join & leave workspaces](https://www.notion.com/help/create-delete-and-switch-workspaces)
- [JetBrains - Open, close, and move projects](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html)
- [Warp - Launch Configurations](https://docs.warp.dev/terminal/sessions/launch-configurations)
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/)
- [UXmatters - Cognitive Distance](https://www.uxmatters.com/mt/archives/2024/12/cognitive-distance-streamlining-context-switching-in-ux.php)

---

## Findings

### Finding: Three distinct discovery models exist — manual register, auto-history, account-based
**Confidence:** CONFIRMED
**Evidence:**

| Model | Tools | Trade-off |
|-------|-------|-----------|
| Manual register | Obsidian, Warp, iTerm2 | Explicit but high friction |
| Auto from history | VS Code, JetBrains, Cursor, zoxide | Low friction but no intentional curation |
| Account-based | Notion | Zero local state but cloud-dependent |

**Implications:** For a CLI tool, auto-discovery (detecting `.openknowledge/` markers) combined with a lightweight registry is the best balance.

### Finding: Launcher aggregation (Raycast/Alfred) solves "universal view" better than any individual tool
**Confidence:** CONFIRMED
**Evidence:** Raycast reads VS Code's `state.vscdb` and JetBrains' `recentProjects.xml` to provide one fuzzy-searchable list across all IDEs. The pattern is: hotkey → type → enter, typically under 2 seconds. Individual tools (Obsidian, VS Code) each only know about their own projects.

**Implications:** Open-knowledge's project registry should be in a format that launchers can read, or expose a CLI command (`openknowledge list`) that launchers can invoke.

### Finding: Sub-1-second switching is the cognitive load threshold
**Confidence:** CONFIRMED
**Evidence:** Nielsen's latency thresholds: 100ms feels instant, 1s keeps attention, 10s risks losing the user. Context switching costs developers 9.5 minutes to return to productive flow (Qatalog/Cornell). Notion achieves near-instant sidebar swap; VS Code's Cmd+R fuzzy search is instant for listing but 1-2s for reload.

**Implications:** Project switching should be a lightweight context swap (change which `.openknowledge/` root is active), not a full server restart.

### Finding: Project registries converge on XDG_STATE_HOME or app-specific JSON
**Confidence:** CONFIRMED
**Evidence:**

| Tool | Format | Location |
|------|--------|----------|
| VS Code | SQLite | ~/Library/Application Support/Code/.../state.vscdb |
| JetBrains | XML | ~/Library/Application Support/JetBrains/.../recentProjects.xml |
| Obsidian | JSON | ~/Library/Application Support/obsidian/obsidian.json |
| zoxide | Binary DB | ~/.local/share/zoxide/db.zo |

XDG spec: `XDG_STATE_HOME` (~/.local/state) is for data that persists across restarts but isn't important enough for `XDG_DATA_HOME`.

**Implications:** A `~/.openknowledge/projects.json` (or XDG-compliant path) is the right location for the project registry.

### Finding: JetBrains project groups with custom icons is the richest organization model
**Confidence:** CONFIRMED
**Evidence:** JetBrains Welcome Screen supports right-click → "New Project Group", drag projects into groups, custom SVG icons per project, "Open All Projects in Group" action.

**Implications:** For MVP, a flat list with frecency ordering is sufficient. Groups/tags can come later.

---

## Gaps / follow-ups

- How should the project registry handle stale entries (deleted projects)?
- Should the registry track additional metadata (last opened, agent connections, active branch)?
