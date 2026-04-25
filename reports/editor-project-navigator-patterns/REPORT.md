---
title: "Project-Navigator Patterns in Desktop Editors and KB Apps"
description: "How VSCode, Cursor, Obsidian, JetBrains IDEs, Zed, Sublime Text, and Logseq let users return to (or live without) a project navigator from inside an open project. Pattern taxonomy with affordance inventories, window-management semantics, and trade-offs."
createdAt: 2026-04-25
updatedAt: 2026-04-25
subjects:
  - VSCode
  - Cursor
  - Obsidian
  - JetBrains IDEs
  - IntelliJ IDEA
  - Zed
  - Sublime Text
  - Logseq
topics:
  - project navigator UX
  - welcome screen patterns
  - window management
  - desktop editor conventions
  - return-to-launcher affordances
---

# Project-Navigator Patterns in Desktop Editors and KB Apps

**Purpose:** Inform a product decision for `@inkeep/open-knowledge-desktop` — should it present a project navigator, and if so, which conventional pattern? This report enumerates what users have already learned across seven mature desktop editors and KB apps, with the trade-offs each pattern carries. Recommendations are out of scope; the decision is downstream.

---

## Executive Summary

Across the seven apps surveyed, the field divides into **four distinct project-navigator patterns** — including "no-navigator" as a viable design point. The Vault Switcher pattern has two presentation variants (modal and in-chrome). The "convention" users are familiar with depends on which neighbourhood the app sits in: IDE convention is the in-editor Welcome page; markdown-KB convention is a Vault-Switcher-style modal or in-chrome dropdown; the JetBrains exemplar is a dedicated navigator window.

**Key Findings:**

- **Four patterns cover the field, not one "convention".** (1) **Welcome page** — in-editor tab (VSCode, Cursor, Zed). (2) **Welcome window** — separate OS window dedicated to navigation (JetBrains). (3) **Vault Switcher** — modal or in-chrome picker (Obsidian, Logseq). (4) **No-navigator** — menu-bar lists only, no greeter (Sublime). The right "familiar" pattern depends on which user population the product targets — IDE users vs markdown/KB users vs power-users coming from minimal editors.

- **The return-to-navigator path differs in shape, not just keystrokes.** VSCode-style "Close Folder" leaves the same window open and renders the navigator inside it. JetBrains-style "Close Project" closes the project window and surfaces a different, dedicated Welcome window. Obsidian-style switcher opens the navigator alongside the current vault — never replaces it. These choices imply different mental models of "what is a window for."

- **Window-management policy is the most consequential design axis.** Three positions exist: **swap-in-place** (Logseq, Sublime's `Switch Project`), **one-window-per-project** (Obsidian, Zed, JetBrains default, VSCode default), **user-configurable** (VSCode's `window.openFoldersInNewWindow`, JetBrains' `Open project in` setting, Sublime's per-action choice). The choice cascades into navigator semantics: a swap-in-place app can have an ambient navigator (Logseq sidebar dropdown); a one-window-per-project app needs an explicit "close current to return" affordance.

- **First-launch behaviour cleaves orthogonally.** Three apps show the navigator first (Obsidian Vault switcher, JetBrains Welcome screen, Zed Welcome page). VSCode/Cursor show the Welcome tab in a single window. Logseq shows a demo graph. Sublime shows an empty Untitled buffer. There is no single "expected" first-launch shape — but every app surveyed except Sublime makes the navigator (or a stand-in) reachable within one click of cold launch.

- **The "no-navigator" pattern (Sublime) is shippable.** It's a viable design point — but it requires users to know `Project → Switch Project…` exists. Sublime's most popular project-management package (`ProjectManager`) is a third-party plugin that fills the perceived gap. This is signal: a sizeable user base wants more affordance than Sublime ships with.

**Critical Caveats:**

- VSCode and Cursor share the same pattern because Cursor is a fork. Cursor 3.0's redesign focuses on agent UI, not the project navigator. Treat "Cursor matches VSCode" as default, "Cursor diverges" as evidence-required.
- All findings are 3P/external. No 1P assessment of Open Knowledge or recommendation for which pattern to pick is included — by design.

---

## Research Rubric

| # | Dimension | Depth | Priority | Status |
|---|---|---|---|---|
| D1 | Pattern taxonomy — enumerate distinct project-navigator patterns; define each shape | Deep | P0 | Synthesized below |
| D2 | VSCode + Cursor — Welcome page, Close Folder/Workspace, Open Recent, window semantics | Deep | P0 | [d2-vscode-cursor.md](evidence/d2-vscode-cursor.md) |
| D3 | Obsidian — Vault Switcher modal, vault-per-window, registry mechanics | Deep | P0 | [d3-obsidian.md](evidence/d3-obsidian.md) |
| D4 | JetBrains IDEs — Welcome window, project grouping, "close project → return to welcome" | Moderate | P0 | [d4-jetbrains.md](evidence/d4-jetbrains.md) |
| D5 | Zed, Sublime, Logseq — cross-check; do other patterns exist? | Light | P1 | [d5-zed-sublime-logseq.md](evidence/d5-zed-sublime-logseq.md) |
| D6 | First-launch & return semantics per pattern | Deep | P0 | Synthesized below |
| D7 | Trade-offs across patterns | Moderate | P0 | Synthesized below |

**Non-goals:**
- Recommending which pattern Open Knowledge should adopt
- 1P codebase analysis of `@inkeep/open-knowledge-desktop`
- Multi-root workspace internals beyond what disambiguates D6 semantics
- CLI invocation behaviors (`code .`, `cursor .`) — covered in [`electron-bundled-cli-install-patterns/`](../electron-bundled-cli-install-patterns/REPORT.md)

---

## D1 — Pattern Taxonomy

Four distinct patterns. The presentation variants matter for design choice; the underlying mental models do not.

### Pattern 1: Welcome Page (in-editor tab)

**Apps:** VSCode, Cursor (inherits VSCode), Zed.

**Shape:** A tab inside the editor's main content area. Renders when no folder is open. Layout: prominent "Open Folder" / "Clone Repository" buttons + a Recent list + walkthrough cards. Reachable on demand via Help → Welcome (VSCode) or `welcome` palette command (Zed).

**Window relationship:** Lives inside a regular editor window. The same window pivots from "navigator state" to "project state" (and back) without spawning a separate OS window.

**User mental model:** *"My window starts empty; the welcome tab is what the empty window shows. Opening a folder fills it. Closing the folder empties it again."*

**Evidence:** [d2-vscode-cursor.md](evidence/d2-vscode-cursor.md) (VSCode); [d5-zed-sublime-logseq.md](evidence/d5-zed-sublime-logseq.md) (Zed).

### Pattern 2: Welcome Window (dedicated OS window)

**Apps:** JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, GoLand, CLion, Rider).

**Shape:** A separate OS window, distinct chrome from project windows. Layout: left-side tabs (Projects, Customize, Plugins, Learn, Remote Development) + a searchable recent-projects list with curation features (project groups, custom SVG icons, drag-and-drop ordering, "Open All Projects in Group").

**Window relationship:** Welcome window and project windows coexist as peer top-level OS windows. Welcome appears when zero project windows are open; closes when a project opens (with `Open project in: New Window` setting) or closes the navigator first (`Current Window` setting).

**User mental model:** *"The IDE is always running. The Welcome window is its home base. Project windows are where I work. The home base reappears when I'm not working on anything."*

**Evidence:** [d4-jetbrains.md](evidence/d4-jetbrains.md).

### Pattern 3: Vault Switcher (singleton workspace, dedicated picker)

**Apps:** Obsidian (modal variant), Logseq (in-chrome variant).

**Shape:** A picker UI dedicated to choosing which vault/graph is "active." Two presentation variants:
- **Modal variant (Obsidian):** Switcher window/modal with rows for known vaults + "Create new vault" + "Open folder as vault" + per-row overflow menu (rename, move, remove, copy ID). Reached from inside a vault via a dedicated chrome icon (chevrons-up-down at sidebar bottom) or `obsidian://choose-vault` URI. Always opens vaults in a **new** OS window — no swap-in-place.
- **In-chrome variant (Logseq):** Sidebar dropdown showing current graph name; clicking opens a list of all known graphs + "All graphs" entry. A separate "All Graphs" page houses richer management. Switching is **swap-in-place** via `:graph/switch` event handler.

**Window relationship:** Both treat the project (vault/graph) as a singleton workspace. The variants diverge sharply on window count: Obsidian = N windows for N open vaults; Logseq = 1 window, swaps state on switch.

**User mental model:** *"I am inside vault X. The picker is my way to leave vault X for a different one. The picker doesn't show until I ask."*

**Evidence:** [d3-obsidian.md](evidence/d3-obsidian.md) (modal); [d5-zed-sublime-logseq.md](evidence/d5-zed-sublime-logseq.md) (in-chrome).

### Pattern 4: No-Navigator

**Apps:** Sublime Text.

**Shape:** No welcome screen, no picker UI, no greeter. Cold start opens to an empty Untitled buffer. Project management is menu-bar items: `Project → Open Project…`, `Switch Project…`, `Quick Switch Project…`, `Open Recent`. The popular third-party `ProjectManager` package fills the perceived gap with a hotkey-driven switcher.

**Window relationship:** Whatever the user has set up. Sublime is unique among the surveyed apps in offering both same-window swap (`Switch Project`) and new-window open (`Open Recent`) as first-class menu items in the same product.

**User mental model:** *"Projects are just files I open. There is no home base. If I want a launcher, I install one."*

**Evidence:** [d5-zed-sublime-logseq.md](evidence/d5-zed-sublime-logseq.md).

### Pattern map (visual)

```
                                    Navigator presence
                       always-visible in chrome    reveal-on-demand
                       ────────────────────────    ──────────────────
                       ┌────────────────────────┬──────────────────────┐
        swap-in-place  │ Logseq                 │   —                  │
                       │ (sidebar dropdown +    │                      │
   Window              │  All Graphs page)      │                      │
   relationship        ├────────────────────────┼──────────────────────┤
                       │   —                    │ VSCode / Cursor      │
   one-window-         │                        │ (Welcome tab)        │
   per-project         │                        │ Zed (Welcome tab)    │
                       │                        │ Obsidian (modal)     │
                       │                        │ JetBrains (window)   │
                       └────────────────────────┴──────────────────────┘

  No built-in opinion: Sublime — menu-bar lists only, user picks
  swap-in-place (`Switch Project`) or new-window (`Open Recent`)
  per invocation.
```

---

## D6 — First-Launch and Return Semantics Matrix

How each pattern handles the two key user moments: first cold launch, and "return to navigator" from inside a project.

### First-launch behaviour

| App | Cold start (no recent projects) | Subsequent launch (has recent) |
|---|---|---|
| **VSCode** | Single window, Welcome tab in editor area | Restores last-open windows (`window.restoreWindows`); Welcome only on empty windows |
| **Cursor** | Sign-in screen → then VSCode-equivalent Welcome tab | Same as VSCode (one bug noted in [d2 evidence](evidence/d2-vscode-cursor.md)) |
| **Obsidian** | Vault switcher itself (Create + Open rows) | Re-opens last-used vault directly; switcher does NOT appear |
| **JetBrains** | Import Settings dialog → Welcome screen window | If "Reopen projects on startup" enabled (default): restore last projects; else Welcome screen |
| **Zed** | Welcome page in editor (since PR #44048, 2025) | Restores last project; Welcome on no-workspace |
| **Sublime** | Empty Untitled buffer | Same — empty Untitled buffer |
| **Logseq** | Demo graph with banner nudging "Open a local folder" | Restores last graph |

**Pattern:** Six of seven apps surface a navigator (or stand-in) on cold launch (some after a one-time setup dialog or sign-in — Cursor's auth screen, JetBrains' Import Settings dialog). Sublime is the exception. None show a navigator on subsequent launches by default — every app prefers to restore the user's last context.

### Return-to-navigator path (from inside an open project)

| App | Primary path | Keybinding | Window effect | Same window or new? |
|---|---|---|---|---|
| **VSCode** | File → Close Folder | `⌘K F` / `Ctrl+K F` (gated by focused-view) | Window stays open, Welcome tab renders | Same |
| **Cursor** | Same as VSCode | Same | Same | Same |
| **Obsidian** | Vault profile icon (sidebar bottom) → Manage Vaults | None default | Switcher window opens alongside current vault | New (alongside) |
| **JetBrains** | File → Close Project | None default | Project window closes; if last, Welcome screen appears | New (different window) |
| **Zed** | `welcome` palette command OR close all center-pane items | None default for `welcome` | Welcome page in current window | Same |
| **Sublime** | No "return to navigator" — Project menu items only | None default | (n/a) | (n/a — no navigator) |
| **Logseq** | Click sidebar graph dropdown | None default | Dropdown opens in current chrome | Same chrome (no window change) |

**Patterns:**
- **Same-window return** is the convention for in-editor tab (VSCode, Cursor, Zed) and in-chrome (Logseq) shapes.
- **New-window return** is the convention for separate-window patterns (Obsidian's switcher window, JetBrains' Welcome screen).
- **No path** in Sublime — by design.

### Open Recent surfaces

| App | Command palette / quick-pick | Menu submenu | Welcome surface | Default keybinding |
|---|---|---|---|---|
| **VSCode** | ✓ `workbench.action.openRecent` | ✓ File → Open Recent | ✓ on Welcome page | `⌃R` / `Ctrl+R` |
| **Cursor** | ✓ (inherited) | ✓ | ✓ (subject to noted bug) | `⌃R` / `Ctrl+R` |
| **Obsidian** | ✓ "Open another vault" | — (use Vault switcher) | ✓ Vault switcher itself is the Recent list | None default |
| **JetBrains** | ✓ via Find Action | ✓ File → Recent Projects | ✓ Welcome screen Projects tab | None default for submenu |
| **Zed** | ✓ `projects: open recent` | — | — | `alt-cmd-o` or `ctrl-r` |
| **Sublime** | ✓ Quick Switch Project | ✓ Project → Open Recent / Switch Project | — | None default |
| **Logseq** | ✓ via sidebar dropdown | — | ✓ All Graphs page | None default |

**Pattern:** Every app exposes a recent-projects list somewhere. Three apps (VSCode/Cursor, Zed) ship a default keybinding; the rest require user-assigned hotkeys.

---

## D7 — Trade-offs Across Patterns

What each pattern optimizes for and what it costs. Decision-supporting, not prescriptive.

### Welcome Page (VSCode-style)

**Optimizes for:**
- **Minimal window count.** One window can be in any state (empty, project, multi-project via multi-root). Users with many projects don't need many OS windows.
- **Discoverability.** Welcome tab is visible the moment the user has nothing to do; CTAs ("Open Folder") are immediately actionable.
- **In-editor consistency.** The navigator uses the same chrome as the editor; nothing new to learn.

**Costs:**
- **No always-visible "where am I" indicator.** Users can lose track of which project the current window holds; recovery is via window title or a sidebar root header.
- **Close Folder is a learned affordance.** `⌘K F` is a chord, gated by `when: focusedView != ''` — invisible to users who don't read the Command Palette. New users typically discover it via search.
- **Curation is shallow.** Welcome page lists recents flat, by recency only. No groups, no custom icons, no manual ordering.

**Used by:** VSCode, Cursor, Zed.

### Welcome Window (JetBrains-style)

**Optimizes for:**
- **Curation depth.** Project groups, custom SVG icons, drag-and-drop ordering, "Open All Projects in Group." Welcome IS a dashboard, not just a recent list.
- **Clear separation.** Project windows are for work; Welcome window is for navigation. Users don't conflate states.
- **Power-user multi-project workflows.** Users with 20+ projects benefit from group structure; the dedicated window has room to render it.

**Costs:**
- **Window proliferation.** Every project is its own window. Users with 5 open projects have 5 + 1 (Welcome) windows on their desktop. macOS users sometimes resort to "Merge All Project Windows" to tab them.
- **Cold-start ceremony.** Welcome screen → Project list → choose project → wait for indexing. The first second of "I want to code" is consumed by the navigator.
- **More chrome to learn.** Three windows can exist (Welcome + 2 projects); each has its own state. New users sometimes lose the Welcome window behind project windows.
- **Default "reopen on startup" setting hides the Welcome from regular users.** Most users never see the curation surface unless they explicitly close all projects — the dashboard is gated behind a state most users skip.

**Used by:** IntelliJ IDEA, PyCharm, WebStorm, GoLand, CLion, Rider.

### Vault Switcher (modal variant — Obsidian)

**Optimizes for:**
- **Singleton-workspace clarity.** "I am in vault X" is unambiguous; the picker is rare and explicit.
- **Multi-vault concurrency.** Users with parallel vaults (work + personal + projects) keep them in separate OS windows that don't share state — essential for KB tools where vault === knowledge graph.
- **Safe, deliberate switching.** Picker doesn't appear by accident; the user opens it on purpose.

**Costs:**
- **Switching is window-additive.** Users who think they're "switching" actually accumulate windows. The Move-vault flow explicitly instructs the user to close the current window first.
- **No close-and-replace affordance.** Users wanting one window must manually close before opening — friction.
- **Picker discovery.** The chevrons-up-down icon at sidebar bottom isn't labelled; new users don't know to click it. The "Open another vault" command exists but has no default keybinding.

**Used by:** Obsidian.

### Vault Switcher (in-chrome variant — Logseq)

**Optimizes for:**
- **Always-visible context.** Current graph name is always in the chrome; switcher is one click away.
- **Swap-in-place.** No window proliferation. Single window, multiple graphs over time.
- **Low ceremony for switching.** Click → dropdown → pick → done.

**Costs:**
- **Lost work risk.** Swap-in-place means the previous graph's window state (open notes, scroll position, cursor) is gone. Logseq mitigates via IndexedDB persistence, but the UX is "context replaced," not "context paused."
- **Single-context constraint.** Cannot have two graphs open side-by-side without OS-level workarounds (separate user accounts, etc.).
- **Chrome real estate cost.** The graph name occupies sidebar space at all times.

**Used by:** Logseq.

### No-Navigator (Sublime)

**Optimizes for:**
- **Speed.** Cold start is instant — no greeter, no window setup, just an editor.
- **Out-of-the-way.** Power users who manage projects via terminal / shell aliases / dotfiles aren't paying for a UI they never use.
- **Per-action choice.** `Switch Project` swaps in place; `Open Recent` opens new window. Users pick per invocation.

**Costs:**
- **Discoverability cliff.** Project management is menu-bar text only. Users who don't open the menu don't know it exists.
- **Third-party gap-filling.** The `ProjectManager` package is widely installed because the built-in affordances feel insufficient. The market is signaling: a sizeable fraction of users want more UI.
- **No first-launch onboarding.** New users see an empty buffer. There's nothing to do, and nothing to tell them what to do.

**Used by:** Sublime Text.

### Cross-cutting axes

Three axes drive most of the trade-off space.

**Window-management policy:**

| Position | Apps |
|---|---|
| Swap-in-place | Logseq |
| One-window-per-project | Obsidian, JetBrains (default), Zed (default) |
| User-configurable | VSCode (`window.openFoldersInNewWindow`), JetBrains (`Open project in` setting), Sublime (per-action) |

**Navigator presence:**

| Position | Apps |
|---|---|
| Always visible in chrome | Logseq (sidebar dropdown) |
| Reveal-on-demand | Obsidian, JetBrains, VSCode, Cursor, Zed |
| None | Sublime |

**First-launch surface:**

| Position | Apps |
|---|---|
| Navigator first | Obsidian, JetBrains, Zed |
| Single window with Welcome tab | VSCode, Cursor |
| Demo content | Logseq |
| Empty editor (no surface) | Sublime |

These axes are **not orthogonal**. A swap-in-place product naturally tilts toward an always-visible navigator (no other persistent "where am I" cue). A one-window-per-project product naturally tilts toward reveal-on-demand (the navigator is rare, so it doesn't need to be visible all the time).

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Pixel-level UI shape of the Vault Switcher window** (modal vs separate window) for Obsidian. Reconstructed from procedural docs; could be confirmed by a single product launch.
- **Exact button labels for JetBrains' "Open in New/This Window/Attach" prompt.** Help docs describe the three Settings values but don't enumerate the dialog button labels. Community sources confirm buttons exist but order/label specifics vary by version.
- **`Recent Projects` submenu behavior in JetBrains:** whether it follows the same `Open project in` setting as fresh `File → Open` is plausible but not directly cited.

### Out of Scope (per Rubric)

- Recommending a pattern for Open Knowledge
- 1P codebase analysis
- Multi-root workspace internals beyond what disambiguates D6
- CLI invocation behaviors

---

## References

### Evidence Files

- [d2-vscode-cursor.md](evidence/d2-vscode-cursor.md) — VSCode + Cursor Welcome page, affordances, window semantics, Cursor delta
- [d3-obsidian.md](evidence/d3-obsidian.md) — Obsidian Vault Switcher, vault registry, URI scheme, Quick Switcher disambiguation
- [d4-jetbrains.md](evidence/d4-jetbrains.md) — JetBrains Welcome screen, project groups, "Reopen projects on startup", Project widget
- [d5-zed-sublime-logseq.md](evidence/d5-zed-sublime-logseq.md) — Zed Welcome page, Sublime no-navigator, Logseq in-chrome switcher

### External Sources (selected)

- [VSCode: Workspaces docs](https://code.visualstudio.com/docs/editing/workspaces/workspaces)
- [VSCode: Multi-root workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)
- [VSCode: Default keybindings](https://code.visualstudio.com/docs/reference/default-keybindings)
- [VSCode source: workspaceActions.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/actions/workspaceActions.ts)
- [Cursor changelog 3.0](https://cursor.com/changelog/3-0)
- [Obsidian help: Manage vaults](https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Files%20and%20folders/Manage%20vaults.md)
- [Obsidian help: Obsidian URI](https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Obsidian%20URI.md)
- [JetBrains: Open, move, and close projects](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html)
- [JetBrains: Run IntelliJ IDEA for the first time](https://www.jetbrains.com/help/idea/run-for-the-first-time.html)
- [JetBrains: New UI](https://www.jetbrains.com/help/idea/new-ui.html)
- [Zed: Getting started](https://zed.dev/docs/getting-started)
- [Sublime Text Community Documentation: Projects](https://docs.sublimetext.io/guide/usage/file-management/projects.html)
- [Logseq blog: How to set up and use Logseq Sync](https://blog.logseq.com/how-to-setup-and-use-logseq-sync/)

Full URL list per dimension is in each evidence file's "Cited sources" section.

### Related Research

- [`onboarding-multiproject-ux/`](../onboarding-multiproject-ux/REPORT.md) — covers the discovery/registry side of multi-project UX (recent project lists across editors, registry mechanisms). Complements this report's affordance/return-semantics focus.
- [`electron-bundled-cli-install-patterns/`](../electron-bundled-cli-install-patterns/REPORT.md) — covers CLI invocation (`code .`, `cursor .`) for these editors.
- [`web-to-macos-desktop-wrapping-2025/`](../web-to-macos-desktop-wrapping-2025/REPORT.md) — covers Electron app structure for several of the same products.
