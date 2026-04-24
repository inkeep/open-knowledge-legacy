---
dimension: D5
topic: Activity feeds / timelines
confidence: High
---
# D5 — Activity feeds and timelines

Activity feeds are the asynchronous complement to real-time presence. When a user returns to the product after an agent has worked for 20 minutes, the feed answers "what happened?" Three distinct design families ship in production, each optimized for a different mental model.

## Family 1 — Inbox-shaped activity feed

### Linear inbox / activity

[Linear's inbox](https://linear.app/docs/inbox) and per-entity activity logs use a **reverse-chron list of events** with actor + verb + object + timestamp. Grouped by entity (issue, project). Filterable by actor. Reads like Twitter but for work.

### Notion updates

[Notion's Updates tab](https://www.notion.so/help/updates) is structurally identical: per-page activity log with avatar + action + timestamp. Batched ("Alice made 5 edits") when a user does multiple things in a short window.

### GitHub notifications / activity

[GitHub notifications](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github) aggregate at the repo level with a feed view. Per-PR activity log is also inbox-shaped.

### Slack / Discord activity rails

Not work products but same pattern: reverse-chron, actor-verb-object, per-channel grouping.

**Strengths:** familiar (social-media cadence), scannable, supports filtering, works at scale.

**Weaknesses for agent work:** agents emit dozens of small events in minutes; raw feed becomes a wall of text. Grouping is essential.

## Family 2 — Right-rail version timeline

### Google Docs version history sidebar

Right-rail panel with **named + auto-saved versions**, each clickable to preview. Diff view when selecting two points. Reference: [Docs version history](https://support.google.com/docs/answer/190843).

### Figma version history

Same shape — right-rail panel, per-save snapshot, named versions for milestones.

### Notion page history

Right-rail panel, per-edit snapshot, scrubbable timeline.

**Strengths:** anchored to a specific document (not workspace-wide), easy to compare two points, doubles as rollback UI.

**Weaknesses:** single-doc only. For cross-file agent work, the per-doc timeline misses the cross-file narrative.

## Family 3 — Embedded agent session log

### Devin session replay

[Devin's session page](https://docs.devin.ai/essential-guidelines/session-overview) shows the agent's work as a **chronological log** with interactive scrubbing, per-step artifacts, and the agent's reasoning between actions. A session maps one-to-one with a conversation; the log persists as the artifact.

### Replit Agent conversation panel

Conversation plus checkpoint scrubber in one view. Each agent step is a log entry with embedded diff. Rollback to any step from the timeline.

### Cursor Agent panel

Right-hand panel showing the agent's chain of tool calls, edits, and reasoning. Scrollable but not scrubbable. Each tool call shows a mini-diff or command output inline.

### Claude Code terminal log

The terminal transcript IS the session log. Every edit appears as a diff; every tool call shows its result. Not UI-rich, but complete.

### Claude Cowork

Cowork (Anthropic's multi-agent browser product) maintains per-agent activity logs with step-by-step artifacts, clickable to expand.

**Strengths:** session-scoped (matches the agent's mental model), interactive (scrub, rollback), shows the *reasoning* between edits not just the edits themselves.

**Weaknesses:** session-scoped means no cross-session view; if you have 5 agents working simultaneously, you need 5 session panels.

## Cross-family insights

### Event grouping is essential for agent cadence

Every tool that survives agent velocity uses **temporal + semantic grouping**:

- **Linear** groups "5 comments in 2 min by Alice" into one row
- **Notion** groups "edited page 12 times over 30 min" into one entry
- **GitHub** groups commits within a push event
- **Devin** groups sub-steps within a plan step

For agent work, the natural grouping unit is the **agent turn** or **agent plan step**, not the wall-clock minute. This aligns with Open Knowledge's AGENT\_WRITE\_ORIGIN transaction semantics — one transaction per agent turn becomes one feed entry per turn.

### Filter by actor is universal

Every feed UI supports filtering by user. For multi-agent work, filtering by agent is the same pattern: "show me only agent-X's edits in this session."

### Scrubber vs list-view is the key split

Session-scoped feeds (Devin, Replit) tend to be **scrubber-shaped** — dragging a handle replays the session. Workspace-scoped feeds (Linear, Notion, GitHub) tend to be **reverse-chron list** — scroll back to read history. These are different mental models.

For Open Knowledge, the per-agent timeline wants scrubber shape (time-lapse playback of one agent's work). The workspace activity (who touched what today) wants list shape.

### Artifacts embedded in feed entries

Devin, Replit, Cursor, and Claude Code all embed the **actual artifact** (diff, command output, screenshot) inline in the feed entry, not as a link you click to open. This is a qualitative step up from Linear/Notion's plain-text "Alice edited Page X" entries.

## Anti-patterns observed

- **Unbatched firehose** — raw event-per-keystroke feeds are unusable. Slack's typing-indicator pattern is wrong for activity logs.
- **No actor filter** — essential affordance; tools without it feel broken at team scale.
- **Hidden replay state** — Devin's scrubber returns the UI to a past state which can be confusing ("why is this empty?"). Clear mode indicator ("Viewing session state at 12:34 — return to live") is required.
- **Duplicating the diff in every feed entry AND a separate diff viewer** creates two sources of truth. Inline diff in feed should *link to* the authoritative diff viewer, not duplicate it.

## Open Knowledge-specific application

The existing shadow git repo at `.git/openknowledge/` already maintains per-writer WIP refs with commits per agent write. This is a natural backing store for a feed: `git log refs/wip/<branch>/<writer-id>` IS the agent activity timeline. The UI layer just needs to render it.

Two views feel right:

1. **Per-agent session timeline** (scrubber, Devin-style) — read from the shadow-repo commits for a single agent over a session window. Embedded diff per commit. Rollback-to-this-point affordance (Open Knowledge already has `/api/save-version` and rescue buffers).

2. **Workspace activity feed** (reverse-chron list, Linear-style) — aggregated across all agents + humans, filterable by actor, with file-level grouping ("Agent-X made 12 edits to `foo.md` between 10:00 and 10:15"). Read from the shadow repo + the existing activity map (`Y.Map('activity')`).

## References

- [Linear inbox](https://linear.app/docs/inbox)
- [Notion updates](https://www.notion.so/help/updates)
- [GitHub notifications](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github)
- [Google Docs version history](https://support.google.com/docs/answer/190843)
- [Devin session overview](https://docs.devin.ai/essential-guidelines/session-overview)
- [Replit Agent docs](https://docs.replit.com/replitai/agent)
- [Figma version history](https://help.figma.com/hc/en-us/articles/360038006754)

## Decision triggers for Open Knowledge

- **Two feed shapes required:** per-agent scrubber (session-scoped, Devin-style) + workspace reverse-chron feed (Linear-style).
- **Grouping unit:** agent turn (1 AGENT\_WRITE\_ORIGIN transaction = 1 feed entry), not keystroke, not wall-clock minute.
- **Actor filter required.** With multi-agent ambition, filtering by agent becomes essential.
- **Embed diffs inline.** Use the shadow-repo commits as the data source; render commit-diff in the feed entry.
- **Replay mode indicator:** if the user scrubs into a historical state, show a clear banner ("Viewing state as of 10:14 — return to live").
- **Do not duplicate** the diff viewer across feed and a separate panel — link to the canonical viewer.
