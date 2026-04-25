---
run-id: 2026-04-25-initial
status: Closed
purpose: Initial deep research pass — dispatch parallel app investigations for D2/D3/D4/D5, orchestrator synthesizes D1/D6/D7
closed-at: 2026-04-25
outcome: All 7 dimensions covered. 4 evidence files written. REPORT.md synthesizes D1/D6/D7 from worker findings. Validation pending.
---

# Run: 2026-04-25-initial

## Purpose

Investigate conventional project-navigator patterns across desktop editors and KB apps. Output is a factual taxonomy with trade-offs that supports a downstream product decision for `@inkeep/open-knowledge-desktop`: should it present a project navigator, and which pattern.

## Delta rubric for this run

All 7 dimensions are in scope. Strategy:

- **Subagent A — VSCode + Cursor (D2):** Deep app investigation. Cursor inherits VSCode patterns; subagent must surface deltas explicitly.
- **Subagent B — Obsidian (D3):** Deep app investigation. Most relevant analog for a markdown KB tool.
- **Subagent C — JetBrains IDEs (D4):** Moderate app investigation. The "welcome-as-navigator" exemplar.
- **Subagent D — Zed + Sublime + Logseq (D5):** Light cross-check — does the field break down into more than 4 patterns?
- **Orchestrator (D1, D6, D7):** Synthesizes after subagents return. Pattern taxonomy, return-semantics matrix, trade-offs.

## Anchor sources

Workers should prioritize T1 official documentation:

- **VSCode:** code.visualstudio.com/docs (Getting Started, Editing, Workspaces sections)
- **Cursor:** cursor.com/docs, cursor.com/changelog, forum.cursor.com (changelog often documents UI deltas)
- **Obsidian:** help.obsidian.md (Vault section, Window section, Switching vaults)
- **JetBrains:** jetbrains.com/help/idea (Welcome Screen, Recent Projects sections), youtube channel for visuals
- **Zed:** zed.dev/docs, github.com/zed-industries/zed (issues + source for pattern confirmation)
- **Sublime:** sublimetext.com/docs, sublimetext.com/docs/projects.html
- **Logseq:** docs.logseq.com (Graph section)

## Output contract for workers

Workers return Markdown with this structure:

```markdown
# Findings: <App name>

## Project-navigator pattern (one paragraph)
What this app's project navigator looks like — physical UI, window relationship, when it appears. Use the pattern names from D1 (Welcome page, dedicated launcher, vault switcher, no-navigator, hybrid) but if a fifth shape exists, name it.

## Affordances inventory
For each affordance:
- **Name** (as shown in UI / docs)
- **Surface** (File menu / command palette / keybinding / sidebar / status-bar / launcher window)
- **Default keybinding** (mac + win/linux when documented)
- **Effect on window** (closes window / replaces content / spawns new window / opens modal)
- **Effect on workspace state** (folder closed / workspace closed / multi-root toggled)
- **Source citation** (URL + access date)

## First-launch behavior
What happens on first cold start with no prior project. What happens on subsequent launches.

## Return-to-navigator path
Concrete step-by-step: from "I'm inside a project, I want back to the navigator," what does the user do? Multiple paths if they exist.

## Window-management semantics
Does this app default to one-window-per-project, swap-in-place, or both? How does the navigator interact with multiple windows?

## Cited sources
Bullet list of every URL referenced, with access date.

## Gaps / NOT FOUND
Anything you searched for but couldn't confirm. Include search terms.
```

## Coverage tasks

- [ ] D2: VSCode + Cursor (Subagent A)
- [ ] D3: Obsidian (Subagent B)
- [ ] D4: JetBrains (Subagent C)
- [ ] D5: Zed + Sublime + Logseq (Subagent D)
- [ ] D1, D6, D7: orchestrator synthesis after workers return

## Constraints

- T1 sources (official docs) preferred. T2 (mature community wikis, established blogs) acceptable. T3 (forum posts, Stack Overflow) only as supporting evidence with caveat.
- Each finding must cite a URL with access date.
- For VSCode/Cursor: Cursor is a fork — call out where Cursor's behavior is identical to VSCode (default expectation) vs where it diverges (must be evidence-backed, ideally from changelog).
- Workers do NOT write evidence files. Return Markdown findings; orchestrator writes evidence.
- Stay factual. Do not editorialize on which pattern is "best."
