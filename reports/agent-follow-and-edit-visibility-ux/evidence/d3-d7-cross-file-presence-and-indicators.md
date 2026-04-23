---
dimension: D3 + D7
topic: Cross-file/cross-surface presence and active/idle/typing indicators
confidence: High
---
# D3 + D7 — Cross-file presence and liveness indicators

Clustered because both answer "where and how is presence displayed?": D3 covers *spatial* presence (filetree badges, outline markers, panels), D7 covers *temporal* liveness (active / idle / typing). Both matter for "glow when working" UX.

## D3 — Cross-file / cross-surface presence

Almost all collaborative tools show presence only on the currently-open surface (cursor in doc). Cross-surface presence (showing *who is in a file you're not viewing*) is rare and the prior art is small.

### Replit filetree presence (best prior art)

[Replit's multiplayer documentation](https://docs.replit.com/teams-edu/intro-teams-edu#multiplayer) and product screenshots show avatars in the file tree next to each file currently being edited, plus a stacked-avatar indicator when >1 person is in the same file. Clicking the avatar navigates to that file.

This is the single closest prior art to the Open Knowledge goal: "see at a glance which files agents are editing without navigating." No other consumer tool does cross-file presence at filetree granularity.

### VS Code Live Share participants panel

[Live Share's participants panel](https://learn.microsoft.com/en-us/visualstudio/liveshare/use/vscode) shows a vertical list of all participants with a "currently editing" file-name subline under each. Click the participant → pin follow. This is list-oriented (vs Replit's tree-inline) but carries the same cross-file information.

### Notion avatar rail

Notion shows an avatar rail in the top-right of the page with the set of people "currently viewing this page." It does **not** show avatars on the sidebar next to other pages — Notion has no cross-page presence at all. You can only tell who's on *this* page. Notion has approached presence as page-scoped, not workspace-scoped.

### Google Docs / Office 365 — same scope

Both show avatars at the top of the current document. Neither shows which sibling documents in the same folder/drive have active collaborators. Cross-file presence is absent.

### Linear / Jira / Asana (project-management class)

[Linear](https://linear.app/changelog) and similar tools show a "last active" indicator per user in the team sidebar, and per-issue they show who's assigned, but *real-time* presence ("X is viewing this issue right now") is absent. The pattern is "heartbeat every N minutes" not "live cursors."

### Figma — single-scope presence

Even Figma, which is the gold standard for real-time cursors, only shows presence *inside the current file*. The file browser doesn't show who's active where. Figma's pro answer to cross-file presence is "use the Activity tab" (async log of edits with user attribution) — which is the activity-feed pattern covered in [[d5-activity-feeds]].

### Slack / Discord (channel presence)

Green dot next to name = online. Clicking the name → DM, not navigation. This is online-status, not work-location. Not directly applicable but worth noting because the **green-dot metaphor** is universal and transferable to agent presence.

### Cross-file presence summary

| Tool               | Cross-surface presence     | Granularity           | Update frequency   |
| ------------------ | -------------------------- | --------------------- | ------------------ |
| Replit             | **Yes** (filetree avatars) | Per-file              | Live               |
| VS Code Live Share | Yes (participants panel)   | Per-file (as subline) | Live               |
| Notion             | No                         | N/A                   | N/A                |
| Google Docs        | No                         | N/A                   | N/A                |
| Figma              | No                         | Only current file     | Live (within file) |
| Linear             | Partial ("last active")    | Per-user heartbeat    | Minutes            |
| Slack              | Online-status only         | Per-user              | Live               |

**Gap:** no tool shows cross-surface presence with per-file granularity *and* a glow / activity indicator for "actively editing right now" vs "open but idle." Replit shows the avatar but doesn't distinguish "in the file" from "actively typing in the file."

## D7 — Active / idle / typing indicators

### The three-state model (universal)

Nearly every tool uses some flavor of a three-state presence model:

1. **Active** (recently interacted within short window)
2. **Idle** (present but no interaction in N minutes)
3. **Away / offline** (disconnected or no activity in longer window)

### Cutoff values (from product docs and observed behavior)

| Tool               | Active → Idle threshold                                   | Idle → Away threshold           | Source                                                                                  |
| ------------------ | --------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| Microsoft Teams    | 5 minutes no interaction                                  | 15 minutes                      | [Teams presence docs](https://learn.microsoft.com/en-us/microsoftteams/presence-admins) |
| Discord            | 5 minutes no input                                        | 10 minutes configured as "Away" | Client settings                                                                         |
| Slack              | 10 minutes (default; user-configurable)                   | Sign-out / app close            | [Slack profile status](https://slack.com/help/articles/201864558)                       |
| Google Chat        | 5 minutes                                                 | Sign-out                        | Google Workspace admin docs                                                             |
| Figma              | No explicit cutoff documented; cursor disappears on leave | —                               | —                                                                                       |
| VS Code Live Share | Status shown in participants list; no documented cutoff   | —                               | —                                                                                       |

**5 minutes is the modal active-idle threshold** across consumer chat tools (Teams, Discord, Google Chat per their respective docs). Slack's default is 10 minutes (user-configurable per [profile settings](https://slack.com/help/articles/201864558)). The 5-minute convention is worth adopting for agent presence unless product constraints dictate otherwise — 2 minutes is so short that single context-switches flip state, 10+ minutes is long enough that the indicator can misrepresent current activity.

### Typing indicators (fast layer)

| Tool        | TTL on "typing"                                                                         | Emission frequency                                   |
| ----------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Slack       | 2 seconds (per [Slack API typing docs](https://api.slack.com/methods/chat.postMessage)) | Sent on keystroke; heartbeat every \~1s while typing |
| iMessage    | \~5 seconds after last keypress                                                         | Continuous while typing                              |
| Google Chat | 3 seconds                                                                               | Continuous                                           |
| Figma       | N/A (cursor movement is the typing signal)                                              | Continuous                                           |
| Google Docs | Cursor + selection-flash                                                                | Continuous                                           |

**Agent application:** the "typing indicator" for AI agents maps cleanly to "agent has an in-flight write to this doc." A 2-3s TTL after the last write event gives a "currently editing" pulse. The difference from human typing: agent bursts are step-function (write, then think, then write again), not continuous. A typing indicator with 2s TTL will flicker. A 10s TTL keeps it steadier.

### Presence indicator visual vocabulary

Across consumer tools, the visual encoding is conventional:

- **Solid avatar** (full opacity) = active / present
- **Greyed avatar** (30-50% opacity) = idle
- **Green dot** (Slack/Discord/Teams) = online/active
- **Yellow dot** = idle / away
- **Grey dot** = offline
- **Colored cursor flag** (Figma/Docs) = currently editing something specific
- **Pulsing glow / halo** = actively typing or modifying (Figma, Notion)
- **Selection flash / highlight** = recent edit visible to others (Docs, Figma)

Notion in particular uses **full-color avatar for active viewer, greyed for recently-idle-but-still-connected**, which is the specific pattern the user's agent-activity branch should probably adopt: solid when agent has an open session/connection with recent writes, greyed when session is open but no writes in N minutes.

### Pulsing glow — the "working right now" affordance

Notion uses a subtle **scale+opacity pulse** on avatars of users whose cursor is actively moving. Figma uses a **cursor-border halo** on active cursors that fades when idle. Both are CSS animations running at \~1.5Hz, short duration (300ms pulse, 1-2s cycle).

**Agent application:** the user's spec explicitly mentions "presence icon could glow when \[agents] are actively doing work." The prior art (Notion pulse, Figma halo) is directly transferable: a CSS `@keyframes` pulse on the avatar when the agent has emitted a write in the last \~10s, with cubic-bezier easing for a "breathing" feel. The pulse should be visible but subtle — Notion's implementation is the reference (not Figma's, which is more aggressive).

## Cross-D3/D7 patterns

1. **Solid vs greyed avatar** is the universal active/idle encoding.
2. **Glow / pulse** is reserved for "actively modifying" — it's an intensity layer on top of the base active/idle state.
3. **Cross-file presence is the unsolved problem.** Replit is the only tool that solves it cleanly; everyone else either ignores it or pushes the user to an async activity feed.
4. **5-minute active-idle cutoffs** are the modal convention.
5. **Typing indicators need >2s TTL for agent bursts** — the chat-tool 2-3s TTL will flicker under step-function agent write cadence.

## Anti-patterns observed

- **Green-dot online indicators decoupled from work location** are misleading — Slack's green dot doesn't mean "reading this channel." Avoid a user-status green dot that doesn't correlate with current-doc presence for agents.
- **Over-aggressive idle timeouts** risk flipping state during short pauses (e.g. reading a long doc, brief context-switches). Prefer conservative defaults — 5 min is the modal industry convention, not 2 min.
- **Absent cross-file presence** (Notion, Google Docs) means a user has to navigate into each doc to discover activity. Multi-doc workspaces hosting agents benefit from surfacing per-file agent presence at the file-list level.

## References

- [Replit Multiplayer docs](https://docs.replit.com/teams-edu/intro-teams-edu#multiplayer)
- [VS Code Live Share participants panel](https://learn.microsoft.com/en-us/visualstudio/liveshare/use/vscode)
- [Microsoft Teams presence states](https://learn.microsoft.com/en-us/microsoftteams/presence-admins)
- [Slack profile and presence](https://slack.com/help/articles/201864558)
- [Slack API typing behavior](https://api.slack.com/methods/chat.postMessage)
- [Notion presence behavior (observational)](https://www.notion.so/help/comments-mentions-and-reminders)

## Decision triggers for Open Knowledge

- **Cross-file presence:** adopt Replit's filetree-avatar pattern. In `FileTree.tsx`, overlay a stacked-avatar badge on files with active agent sessions. Max 3 avatars before `+N` overflow.
- **Liveness states:** 3-state model (active / idle / offline). 5-minute active-idle cutoff for agents matches consumer convention. "Offline" = MCP session closed or disconnected >2 min.
- **Glow affordance:** Notion-style subtle opacity+scale pulse when the agent has written in the last 10s. CSS `@keyframes`, \~1.5Hz, ease-in-out.
- **Typing equivalent:** "writing" indicator with 10-15s TTL (not 2s) — agents don't type continuously, they burst.
- **Avoid:** green-dot status decoupled from file location (Slack anti-pattern). Agent presence should always indicate *where* the agent is, not just that it's connected.
