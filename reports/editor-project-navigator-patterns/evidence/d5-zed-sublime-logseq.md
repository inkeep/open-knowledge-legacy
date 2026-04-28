# Evidence: D5 — Zed, Sublime, Logseq (light cross-check)

**Dimension:** D5 — Cross-check (does the field break down into more than 4 patterns?)
**Date:** 2026-04-25
**Sources:** zed.dev/docs (T1); github.com/zed-industries/zed (T1 source/issues); docs.sublimetext.io (T2 community); sublimetext.com/docs (T1); sublime-text-unofficial-documentation.readthedocs.io (T2); blog.logseq.com (T1); deepwiki.com/logseq (T2 ); discuss.logseq.com (T3)

---

## Key files / pages referenced

- zed.dev/docs/getting-started — welcome page on no-folder launch
- github.com/zed-industries/zed/discussions/43158 — PR #44048 added welcome page to no-workspace cold-start
- github.com/zed-industries/zed/discussions/6653 — `projects: open recent` shortcut
- github.com/zed-industries/zed/issues/9874 — community request for menu-bar Close Project; evidence of one-window-per-project
- docs.sublimetext.io/guide/usage/file-management/projects.html — Switch vs Open Recent same-window vs new-window distinction
- sublime-text-unofficial-documentation.readthedocs.io/en/latest/file_management/projects.html — Quick Switch Project popup
- sublimetext.com/docs/projects.html — `.sublime-project` / `.sublime-workspace` file pair
- packagecontrol.io/packages/ProjectManager — third-party project switcher
- blog.logseq.com/how-to-setup-and-use-logseq-sync/ — sidebar graph switcher and All Graphs page
- deepwiki.com/logseq/logseq/4.3-repository-and-graph-management — `:graph/switch` swap-in-place handler
- discuss.logseq.com/t/.../4297 — demo-graph + "Open a local folder" first-launch behavior

---

## Findings

### Finding: Zed = Welcome page (VSCode-style) with command-palette `Welcome` to return
**Confidence:** CONFIRMED
**Evidence:** zed.dev/docs/getting-started; github.com/zed-industries/zed/discussions/43158

Welcome page renders inside the editor center pane when no folder is open. Quick actions: open a folder, clone a repo, view docs. Disappears once any folder/file opens. Return path: close all center-pane items OR run `welcome` command from command palette.

PR #44048 (2025) made the welcome page render on no-workspace cold start (replacing prior "empty untitled buffer" behavior).

**Pattern classification:** Welcome page (VSCode-style). The welcome UI is a tab inside the editor area, not a separate chrome window or modal.

### Finding: Zed has a separate `projects: open recent` action with `Ctrl+R` keybinding (mirrors VSCode)
**Confidence:** CONFIRMED
**Evidence:** github.com/zed-industries/zed/discussions/6653

Default keybinding `alt-cmd-o` or `ctrl-r` (the latter mirrors VSCode). Filters and switches to a recent project; brings already-open project window/Space into focus rather than spawning a duplicate.

**Implications:** Zed deliberately echoes VSCode's `Ctrl+R` Open Recent — interpretable as a "user familiarity" design call.

### Finding: Zed enforces one-window-per-project with no menu-bar Close Project affordance
**Confidence:** CONFIRMED
**Evidence:** github.com/zed-industries/zed/issues/9874; #19501/#19520

Closing the workspace closes the whole window; users have explicitly requested a `Close Project` menu item. Currently no path to "return to navigator within the same window" — the user closes the window or runs `welcome` from palette to surface the welcome state.

### Finding: Sublime Text = no-navigator pattern (no welcome screen, no built-in picker)
**Confidence:** CONFIRMED
**Evidence:** docs.sublimetext.io/guide/usage/file-management/projects.html; sublime-text-unofficial-documentation.readthedocs.io/en/latest/file_management/projects.html

Sublime cold-launches into an empty `Untitled` buffer. Project management lives entirely on the menu bar under `Project`:
- `Open Project…` — file picker for `.sublime-project`
- `Switch Project…` — closes current, opens new in **same window**
- `Quick Switch Project…` — fuzzy popup quick-pick
- `Open Recent` — opens chosen project in a **new window**

No welcome screen, no separate picker window, no modal. First-class GUI for project picking is delivered by the popular third-party `ProjectManager` package, not the editor.

**Pattern classification:** No-navigator. The only navigation is menu-bar text lists.

**Implications for taxonomy:** Sublime confirms "no-navigator" is a viable pattern (the editor is shippable without one).

### Finding: Sublime is the only surveyed app with both same-window swap AND new-window in the same product
**Confidence:** CONFIRMED
**Evidence:** docs.sublimetext.io/guide/usage/file-management/projects.html

`Switch Project` swaps in place; `Open Recent` opens in new window. Both are first-class menu items. User chooses per invocation.

**Implications:** Window-management policy axis is not strictly binary — Sublime occupies a hybrid point.

### Finding: Logseq = Vault Switcher pattern, but ambient-in-chrome rather than modal
**Confidence:** CONFIRMED
**Evidence:** blog.logseq.com/how-to-setup-and-use-logseq-sync/; deepwiki.com/logseq/logseq/4.3-repository-and-graph-management

Two cooperating switcher surfaces:
1. **Sidebar graph dropdown** — clicking the current graph name at the top of the left sidebar opens a dropdown listing all known graphs plus an "All graphs" entry
2. **All Graphs page** — full list view with management actions and "Open a local directory" button

Switching is **swap-in-place**: the running window swaps state to the new graph via `:graph/switch` event handler (export current state to IndexedDB, clear, restore target, redirect to home route).

Active graph is always identified by name in the sidebar header — picker is permanently visible in the chrome.

**Pattern classification:** Vault Switcher (Obsidian-style) — variant: in-chrome rather than modal. Same conceptual model (singleton workspace, dedicated picker, swap-in-place ambition); different surface (always-visible chrome dropdown vs occasional modal).

### Finding: Logseq first-launches into a demo graph
**Confidence:** CONFIRMED
**Evidence:** discuss.logseq.com/t/.../4297

In-content banner reads "This is a demo graph, changes will not be saved until you open a local folder." First-launch nudges the user toward "Open a local directory" affordance.

**Implications:** Logseq trades a dedicated "navigator first" cold start for a "demo content first" cold start — a different bias than the other apps surveyed.

### Finding: Aggregate — four patterns cover the field; Logseq is a presentation variant of Vault Switcher
**Confidence:** CONFIRMED
**Evidence:** Cross-check across all three apps

| App | Pattern | Distinct shape? |
|---|---|---|
| Zed | Welcome page (VSCode-style) | No — same as VSCode |
| Sublime | No-navigator | Yes — distinct pattern |
| Logseq | Vault Switcher (in-chrome variant) | Variant of Obsidian's; same mental model |

User mental model in Logseq ("I am in graph X; to go elsewhere I open the picker") is identical to Obsidian's. Only meaningful variation is presentation (always-visible chrome vs occasional modal). No fifth pattern is warranted.

---

## Negative searches (NOT FOUND)

- Direct screenshots of Zed's welcome page and Logseq's All Graphs page were not captured.
- Sublime Text's `Help` menu was not exhaustively enumerated; "no welcome screen" claim is supported by consistent forum testimony of the empty-Untitled-buffer default rather than by an explicit "no welcome screen" statement in vendor docs.
- Logseq mobile-platform graph-switching behavior (e.g., issue #4877) was deferred — desktop is the relevant comparand.

---

## Gaps / follow-ups

- Pixel-level layout of Zed's welcome page and Logseq's All Graphs page would resolve any presentation-detail questions.
- Sublime's per-platform first-launch behavior (does it differ on Windows vs macOS vs Linux?) wasn't probed — might affect "no-navigator" claim if a platform variant exists.
