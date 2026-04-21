# Evidence D5: Collision Dialog UX Survey

**Dimension:** D5 (P0) — What happens when you open the same project/workspace twice? Comparative UX survey
**Date:** 2026-04-17
**Sources:** Source-code inspection (VS Code, Logseq, GitHub Desktop) + forum/docs (Obsidian, Cursor, Notion, Linear, Figma, Slack)

---

## Key URLs

- [VS Code Issue #35207 — Open Folder always uses existing window](https://github.com/microsoft/vscode/issues/35207)
- [Obsidian Forum — Open vault in multiple windows](https://forum.obsidian.md/t/open-vault-in-multiple-windows/72521)
- [Cursor Forum — How to open a cursor project in 2 different windows](https://forum.cursor.com/t/how-to-open-a-cursor-project-in-2-different-windows-at-the-same-time/73758)
- [GitHub Desktop Issue #12433 — Allow multiple instances](https://github.com/desktop/desktop/issues/12433)
- [Figma Forum — Is there a way to have the same file open in two separate windows](https://forum.figma.com/t/is-there-a-way-to-have-the-same-file-open-in-two-separate-windows/26655)
- [Slack Help — Open separate windows in Slack](https://slack.com/help/articles/4403608802963-Open-separate-windows-in-Slack)
- [Logseq source: `handler.cljs :openNewWindow`](https://github.com/logseq/logseq) (verified in local cache)

---

## Findings

### Finding D5a: The dominant production pattern is "silent focus existing window" — no collision dialog at all

**Confidence:** CONFIRMED
**Evidence:** VS Code source (D1a), Obsidian forum (D3a), Cursor forum (D4a), GitHub Desktop source + issues

The four reference Electron apps examined that key off "per-project/workspace identity" — VS Code, Cursor, Obsidian, GitHub Desktop — all refuse to open a second window/instance on the same project. The existing window is focused; no dialog appears; no option to "open anyway" is presented. Any file targets are redirected into the existing window.

**Implications:**
- The "collision dialog with Cancel/Focus" UX we proposed is *not* observed in the reference apps. Silent-focus is the convention.
- A collision dialog is a meaningful UX upgrade over silent focus for power users who want explicit agency, but it diverges from muscle-memory.

---

### Finding D5b: Logseq allows multi-window-same-graph without any friction — opposite end of the spectrum

**Confidence:** CONFIRMED
**Evidence:** `handler.cljs:400-410` (D2b)

Logseq's `openNewWindow` IPC handler creates a second BrowserWindow for the same graph with no collision check. This is a deliberate product stance, not an oversight (see D2c: graph→windows reverse index used for reference-counted teardown).

**Implications:**
- Concurrent multi-window-same-project is feasible when the shared resource (graph DB) has internal concurrency safety. Logseq inherits SQLite WAL-mode locking.
- A CRDT-backed data layer (our case) arguably has stronger concurrency semantics than SQLite, making Logseq's "just allow it" stance even more justifiable.

---

### Finding D5c: Figma uses within-single-window split-tab synchronization, not multi-instance — the third distinct model

**Confidence:** CONFIRMED
**Evidence:** [Figma Forum - same file multiple tabs](https://forum.figma.com/t/is-there-a-way-to-have-the-same-file-open-in-two-separate-windows/26655)

Figma's desktop app supports "Split Tab View" — the same file can be split into two tabs in the same window, with real-time synchronization between the views. This is the conceptual equivalent of Obsidian's pop-out windows (one vault/file, multiple viewports) except kept inside one OS window.

**Implications:**
- A third archetype: "one process, one window, multiple synchronized viewports." Useful when the user wants to see two parts of the same project simultaneously.
- This archetype does NOT address multi-monitor / multi-desktop workflows (the reason users ask for multi-window in the first place).

---

### Finding D5d: Slack single-instance + multiple windows within the app — workspace-switcher pattern

**Confidence:** CONFIRMED
**Evidence:** [Slack Help — Open separate windows in Slack](https://slack.com/help/articles/4403608802963-Open-separate-windows-in-Slack)

Slack is single-instance (second launch focuses the existing). Within the single instance, users can open multiple windows (channel-scoped detach views). Workspace switching happens via the left sidebar within the app, not via separate windows or processes. Similar to Obsidian's main-vault + pop-out model.

**Implications:**
- This is the "one app, in-app multi-workspace switcher" archetype — used by multi-tenant apps where multiple workspaces are common.
- Not a good fit for our use case: users want parallel work on multiple projects, not switching.

---

### Finding D5e: Duplicate-open UX by app (comparative table)

**Confidence:** CONFIRMED (table synthesizes across evidence files)

| App | Behavior on 2nd open of same project | Collision dialog? | Workaround for power users |
| --- | --- | --- | --- |
| **VS Code** | Silent focus existing window; any files redirected into it | No | `--new-window` CLI flag opens any path in new window (but still refuses to open SAME workspace twice) |
| **Cursor** | Silent focus existing (inherits VS Code) | No | None currently; forum-requested feature |
| **Obsidian** | Silent focus existing (by path identity) | No | Symlink / bind-mount to alias path |
| **GitHub Desktop** | Single-instance app: 2nd launch focuses the one window; cannot open 2 repos simultaneously at all | No | None; years-long feature request (#12433, #12578, #9307) |
| **Logseq** | Opens same graph in 2nd window without complaint | No | Native support |
| **Figma desktop** | Opens in existing window; offers "Split Tab View" within window | No | Split Tab View for multi-viewport |
| **Slack desktop** | Single-instance; 2nd launch focuses; within app, per-channel pop-out windows | No | None for workspace; pop-out for channels |
| **Notion desktop** | Single-instance; 2nd launch focuses | No (no evidence of dialog) | Pop-out for pages (similar to Slack) |
| **Linear desktop** | Single-instance; 2nd launch focuses | No (no evidence of dialog) | Web-based, minimal multi-window |

**Observation:** Of the apps surveyed, **none** present a "project already open — Cancel / Focus existing" confirmation dialog. The dominant pattern is silent focus. Logseq's "just allow concurrent opens" is the only significant divergence.

**Implications:**
- A collision dialog is *an unmet convention* in this product space. Our proposed design adds an explicit confirmation step that no reference app provides.
- A dialog creates an extra click for the common case (user accidentally double-opens). But: it also prevents silent data-model confusion in cases where a CRDT-backed system *could* legitimately support concurrent opens — which is our architectural possibility.
- There's no clear "right answer" — this is a product-design judgment, informed by how confident we are in the underlying concurrency semantics.

---

## Gaps / follow-ups

- Notion and Linear: no direct source inspection available; behavior inferred from user-observable patterns and forum threads. High-confidence on "single-instance + focus" but low-confidence on any dialog.
- Did not test Visual Studio (non-Code), JetBrains IDEs, or Xcode for contrast.
