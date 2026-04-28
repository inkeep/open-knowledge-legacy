# Evidence: D4 — JetBrains IDEs

**Dimension:** D4 — JetBrains (Welcome window pattern, "welcome-as-navigator" exemplar)
**Date:** 2026-04-25
**Sources:** jetbrains.com/help/idea, jetbrains.com/help/webstorm, jetbrains.com/help/clion, jetbrains.com/help/pycharm (T1 official); jetbrains.com/guide (T1); intellij-support.jetbrains.com (T2); medium.com/techverito (T3, flagged)

---

## Key files / pages referenced

- jetbrains.com/help/idea/open-close-and-move-projects.html — Welcome screen, Close Project, Close All Projects, project groups, custom icons, "Reopen projects on startup", New Window vs Current window vs Ask, Next/Previous Project Window keybindings
- jetbrains.com/help/idea/run-for-the-first-time.html — first-launch flow, Welcome screen tabs (Projects, Customize, Plugins, Learn, Remote Development)
- jetbrains.com/help/webstorm/opening-reopening-and-closing-projects.html — confirms platform-wide pattern; "When closing the last open project, WebStorm displays the Welcome screen"
- jetbrains.com/help/clion/welcome-screen.html — Welcome screen pattern shared across products
- jetbrains.com/help/pycharm/welcome-screen.html — "Projects and Files pane" labeling
- jetbrains.com/help/idea/new-ui.html — Project widget in main toolbar
- jetbrains.com/guide/java/tutorials/import-project/open-recent-project/ — `File | Recent Projects`, Find Action route
- jetbrains.com/help/idea/reference-keymap-mac-default.html — `⌘ ⇧ A` Find Action
- intellij-support.jetbrains.com/hc/en-us/community/posts/360006748439 — `⌘ \`` for next window
- medium.com/techverito/custom-shortcut-to-manage-recent-projects-in-intellij-idea-0e51f556f087 — keymap path for Manage Projects (T3)

---

## Findings

### Finding: JetBrains Welcome screen IS a separate OS window dedicated to project navigation
**Confidence:** CONFIRMED
**Evidence:** jetbrains.com/help/idea/run-for-the-first-time.html; jetbrains.com/help/idea/open-close-and-move-projects.html

T1 description: Welcome screen is "the starting point to your work with the IDE." Layout: left-side tabs (Projects, Customize, Plugins, Learn, Remote Development; PyCharm and IntelliJ IDEA add product-specific tabs like Kotlin Notebook). Selecting **Projects** shows a searchable recent-projects list with buttons for new project, open existing, get from VCS, connect to remote dev environment.

PyCharm's docs label this area the "Projects and Files pane."

**Implications for taxonomy:** Distinct OS window dedicated to navigation — not an in-editor tab (VSCode), not a modal (Obsidian).

### Finding: Welcome screen reappears whenever the last project window closes
**Confidence:** CONFIRMED
**Evidence:** jetbrains.com/help/webstorm/opening-reopening-and-closing-projects.html ("When closing the last open project, WebStorm displays the Welcome screen"); jetbrains.com/help/idea/open-close-and-move-projects.html

Trigger: zero open project windows → Welcome screen appears. The IDE process keeps running; quitting is separate (`⌘ Q` on macOS).

If other project windows remain open when Close Project is invoked, no Welcome screen appears — only when zero project windows exist.

### Finding: New UI exposes a "Project widget" in the main toolbar for in-window switching
**Confidence:** CONFIRMED
**Evidence:** jetbrains.com/help/idea/new-ui.html

The Project widget shows current project name and "allows switching between recent projects, creating new projects, and opening existing ones" without first closing the current project. Does not open the standalone Welcome window — provides Welcome-window-like recent-projects switching ambient in the chrome.

**Implications:** JetBrains has BOTH the dedicated Welcome window AND an in-chrome quick-switcher. Two complementary affordances.

### Finding: Opening a project while another is open prompts a New Window vs Current vs Ask choice
**Confidence:** CONFIRMED (states + setting); INFERRED (exact button labels)
**Evidence:** jetbrains.com/help/webstorm/opening-reopening-and-closing-projects.html

Setting: **Settings → Appearance & Behavior → System Settings → Project → "Open project in"**. Three values:
- **New window** — every project in a separate window
- **Current window** — close current, open new in same window
- **Ask** (default) — show dialog with action buttons

Some surfaces also surface an **Attach** option (multi-project-in-one-window approach; extended by the Multi-Project Workspace plugin).

### Finding: Project groups, custom icons, and bulk actions are first-class on the Welcome screen
**Confidence:** CONFIRMED
**Evidence:** jetbrains.com/help/idea/open-close-and-move-projects.html

Capabilities (right-click on Projects tab):
- **New Project Group** — name + populate
- **Move to Group** — relocate a project
- Group settings (gear icon on hover) → **All Projects in Group** (open every member as separate windows)
- **Set Custom Project Icon** — SVG file, displays next to project name
- Search field (filters recent-projects list)
- Drag-and-drop reordering within and between groups

**Implications:** JetBrains treats the Welcome window as a curated dashboard, not just a recent-projects list. Distinguishes from VSCode's flat MRU-only Open Recent.

### Finding: "Reopen projects on startup" controls whether Welcome screen shows on launch
**Confidence:** CONFIRMED
**Evidence:** jetbrains.com/help/idea/open-close-and-move-projects.html ("if you quit the IDE having multiple opened projects, they all will be reopened the next time you launch IntelliJ IDEA")

- Setting location: **Settings → Appearance & Behavior → System Settings → Project**
- Default: **enabled** (checked)
- Behavior when enabled: skip Welcome screen on launch, restore previously-open projects directly
- Behavior when disabled: Welcome screen appears with recent-projects list populated

**Vendor caveat:** JetBrains sells the IDEs whose Welcome screen this report describes; product-positioning bias is possible (e.g., "the Welcome screen is the starting point to your work with the IDE" is marketing-adjacent language, but procedural facts in the same docs are independently verifiable).

### Finding: Close Project / Close All Projects / Close Other Projects are bare menu items, no default keybindings
**Confidence:** CONFIRMED
**Evidence:** jetbrains.com/help/idea/open-close-and-move-projects.html; jetbrains.com/help/idea/reference-keymap-mac-default.html

- `File | Close Project` — closes current; if last, Welcome screen appears
- `File | Close All Projects` — closes every window; Welcome screen appears
- `File | Close Other Projects` — closes every window except current

None have default keybindings. Reachable via Find Action / Search Everywhere (`⌘ ⇧ A` mac, `Ctrl+Shift+A` win/linux).

`Window | Next/Previous Project Window` does have defaults: mac `⌘ \`` (next) and `⌥ ⌘ [` (previous); win/linux `Ctrl+Alt+]` and `Ctrl+Alt+[`.

---

## Negative searches (NOT FOUND)

- **Exact button labels in the New Window/This Window prompt:** docs describe the three states as Settings options but don't screenshot the dialog. Searched: `IntelliJ "Open Project" dialog "This Window" "New Window" "Attach" button labels`. Community posts confirm buttons exist but JetBrains help doesn't enumerate exact labels or order.
- **`reopenLastProject` literal property name:** user-facing checkbox is "Reopen projects on startup"; underlying option-property name not documented in surveyed help pages. JetBrains YouTrack article SUPPORT-A-468 returned in search but body did not load.
- **Whether `File | Recent Projects` submenu opens new window or replaces current project:** JetBrains Guide page explicitly does not state this. In practice it follows the same `Open project in` setting as a fresh `File | Open`, but no T1/T2 source within search budget confirmed it.

---

## Gaps / follow-ups

- Visual confirmation of the Welcome window's empty-state vs populated-state right-pane content was not captured (docs reference image filenames but narrative text was sparse).
- The "Attach" option's surfacing varies by IDE/version; could not pin down whether it's a third button in the New/This/Ask dialog vs a separate dialog vs only available with the Multi-Project Workspace plugin.
