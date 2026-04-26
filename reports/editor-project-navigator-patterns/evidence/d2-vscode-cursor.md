# Evidence: D2 — VSCode + Cursor

**Dimension:** D2 — VSCode + Cursor (Welcome-page pattern, IDE convention)
**Date:** 2026-04-25
**Sources:** code.visualstudio.com/docs (T1 official); github.com/microsoft/vscode (T1 source); cursor.com/docs and cursor.com/changelog (T1 official); forum.cursor.com (T3, flagged where used)

---

## Key files / pages referenced

- code.visualstudio.com/docs/getstarted/userinterface — UI areas, `window.openFoldersInNewWindow` values
- code.visualstudio.com/docs/editing/workspaces/workspaces — Open Folder, single-folder model
- code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces — Open Workspace, Add Folder, Save Workspace As, `(Workspace)` indicator
- code.visualstudio.com/docs/reference/default-keybindings — Close Window, New Window, Close Folder keybindings
- code.visualstudio.com/docs/getstarted/personalize-vscode — `workbench.startupEditor` setting + values
- code.visualstudio.com/docs/getstarted/tips-and-tricks — `Ctrl+R` Open Recent
- github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/actions/workspaceActions.ts — source-of-truth for `workbench.action.closeFolder` = `CloseWorkspaceAction`
- github.com/microsoft/vscode/issues/245078 — `Ctrl+K F` `when` clause gating
- cursor.com/docs/get-started/quickstart — Cursor first-launch flow
- cursor.com/changelog/3-0 — Cursor 3.0 redesign (agent UI, no navigator changes)
- forum.cursor.com/t/welcome-page-is-mising-on-cursor/158706 — T3 bug report

---

## Findings

### Finding: VSCode's "project navigator" is the in-editor Welcome page, not a separate window
**Confidence:** CONFIRMED
**Evidence:** code.visualstudio.com/docs/getstarted/personalize-vscode

The Welcome page is a tab in the editor area that appears when no folder is open. Setting: `workbench.startupEditor` (default `welcomePage`; values: `welcomePageInEmptyWorkbench`, `none`, `readme`, `newUntitledFile`, `agentSessionsWelcomePage`). Layout: two prominent buttons (**Open Folder**, **Clone Repository**), a **Recent** list, and walkthrough cards. Reachable from inside a project via Help → Welcome (command id `workbench.action.showWelcomePage`).

**Implications for taxonomy:** VSCode is the canonical "Welcome page" pattern — navigator-as-tab, no separate OS window.

### Finding: `Close Folder` and `Close Workspace` are the same command, dynamically labeled
**Confidence:** CONFIRMED
**Evidence:** github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/actions/workspaceActions.ts

```text
Single command id: workbench.action.closeFolder
Class: CloseWorkspaceAction
Menu label switches based on whether a single folder or .code-workspace is loaded.
```

Effect: window stays open, workspace association dropped, Welcome page renders. Default keybinding `⌘K F` (mac) / `Ctrl+K F` (win/linux), gated by `when: focusedView != ''` ([issue #245078](https://github.com/microsoft/vscode/issues/245078)) — this means the binding can fail when no view is focused (empty workbench, Welcome screen).

**Implications:** "Return to navigator" within the same window is a first-class affordance, not a side-effect of closing the window.

### Finding: VSCode Welcome page reappears whenever a window has no workspace
**Confidence:** CONFIRMED
**Evidence:** code.visualstudio.com/docs/editing/workspaces/workspaces

Behavior triggers:
- Cold start with no recent projects → Welcome page in default window
- After `Close Folder` / `Close Workspace` → Welcome page in the same (now-empty) window
- `New Window` → fresh window with Welcome page (current project window remains)

`window.restoreWindows` (default value reopens previously-open windows on launch) — Welcome only appears on truly empty windows.

### Finding: `window.openFoldersInNewWindow` controls window-management policy with three values
**Confidence:** CONFIRMED
**Evidence:** code.visualstudio.com/docs/getstarted/userinterface

- `default` (default) — folders open in a new window unless picked from inside the application (where current window is replaced)
- `on` — folders always open in a new window
- `off` — folders always replace the active window's contents

CLI flags `--new-window` / `--reuse-window` override the setting per invocation.

**Implications:** VSCode lets the user choose between swap-in-place and one-window-per-project by setting; default is context-dependent.

### Finding: `Open Recent` has three entry points sharing one persistence backing
**Confidence:** CONFIRMED (entry points); INFERRED (persistence file path)
**Evidence:** code.visualstudio.com/docs/getstarted/tips-and-tricks; code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces

Three surfaces:
1. File menu submenu — flat list, `(Workspace)` suffix on multi-root entries
2. Quick-pick via `workbench.action.openRecent`, default `⌃R` / `Ctrl+R`
3. Welcome page "Recent" section

Holding `⌘`/`Ctrl` while selecting opens chosen entry in a new window.

Persistence: VSCode's recents are stored in the global state DB (community references identify `state.vscdb` under `~/Library/Application Support/Code/User/globalStorage/`; not directly enumerated in T1 docs surveyed). [Cross-reference: prior research at `reports/onboarding-multiproject-ux/evidence/multi-project-switching.md` independently identifies VS Code recents storage location as `state.vscdb`.] Cursor uses `~/Library/Application Support/Cursor/...` parallel path.

### Finding: Cursor inherits VSCode's navigator pattern verbatim; one bug delta
**Confidence:** CONFIRMED (inheritance); CONFIRMED (bug existence, T3)
**Evidence:** cursor.com/docs/get-started/quickstart; cursor.com/changelog/3-0; forum.cursor.com/t/welcome-page-is-mising-on-cursor/158706

Cursor's docs describe onboarding as "Open the app and sign in. Then pick a folder and start with a small task" — sign-in is the only Cursor-specific layer before VSCode's Welcome page. Cursor 3.0 redesign focuses on agent UI (Agents Window, Agent Tabs, Design Mode); no project-navigator changes.

**Bug delta (T3):** `workbench.startupEditor: welcomePage` reportedly silently ignored by Cursor in some versions, with the center-screen Recent projects list missing.

**Vendor caveat:** Cursor sells access to its agent product; product positioning is "VSCode-like + agent." Inheritance from VSCode is structural (fork), not a deliberate design echo. Treat "Cursor matches VSCode" claims as default expectation for this dimension.

---

## Negative searches (NOT FOUND)

- **Cursor changelog entry for any project-navigator UI change:** searched `cursor.com/changelog welcome page`, `cursor onboarding new project` — only agent-UI changes surfaced through 2026-04-25.
- **`workbench.action.openWorkspace` default keybinding:** searched explicitly — none documented; appears unbound.
- **Official docs page that explicitly states `closeFolder` and `closeWorkspace` are the same command:** docs treat them as separate menu labels without unifying language. Confirmation came from source code.

---

## Gaps / follow-ups

- Cursor's exact File menu labels are inferred from VSCode lineage; no public source enumerates them verbatim.
- The `globalStorage` path for recents is observable from VSCode source layout, not from official docs — flagged as INFERRED.
