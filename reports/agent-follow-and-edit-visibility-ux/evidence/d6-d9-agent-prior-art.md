---
dimension: D6 + D9
topic: Agent-specific prior art and multi-agent disambiguation
confidence: High (shipping products surveyed directly)
---
# D6 + D9 — Agent-specific prior art and multi-agent disambiguation

The critical finding across this dimension: **no shipping product treats AI agents as first-class members of a collaborative presence system.** Every AI coding tool either shows the agent as "the assistant in my panel" (single-user mental model) or as "a background task producing artifacts" (CI/workspace mental model). Cross-file presence, follow-an-agent, and multi-agent disambiguation are largely unsolved in shipped product.

## Three schools of AI agent UX

### School 1 — In-editor assistant panel (Cursor, Zed, Continue, Cline)

The dominant shape: agent is a **chat panel** in the editor sidebar that can apply edits to files. Reference: [Cursor Agent](https://docs.cursor.com/chat/agent), [Zed Assistant](https://zed.dev/docs/assistant/assistant), [Continue](https://docs.continue.dev/), [Cline](https://github.com/cline/cline), [Roo Code](https://github.com/RooVetGit/Roo-Cline).

**Presence model:** single agent, single user, single editor. No cross-file presence because there's no cross-user model — the agent is "my agent." Agent edits appear as inline diffs (see [[d4-edit-visualization]]).

**Following:** not applicable. The agent and the user are co-located in the editor by definition.

**Multi-agent:** Cursor introduced [parallel/background agents](https://docs.cursor.com/agent/overview) in 2025; they run in separate "tabs" or cloud workspaces with their own diff view. Not presence-integrated; they're more like long-running CI jobs that you check in on.

### School 2 — Autonomous workspace (Devin, Claude Cowork, Copilot Workspace, OpenHands)

The agent has **its own workspace** (a VM, a repo clone, a sandbox) and reports progress to a dashboard. References: [Devin](https://docs.devin.ai/), [Copilot Workspace](https://githubnext.com/projects/copilot-workspace), [OpenHands](https://github.com/All-Hands-AI/OpenHands).

**Presence model:** the agent is a dashboard row, not a collaborator in your editor. You visit its workspace to see progress.

**Following:** Devin has a **"Following" toggle** per session that scrolls the session view as the agent adds events. Reference: the Devin session page. This is the **closest shipping prior art to the user's "pin an agent" goal** — but it's tab/session-level, not file-level. You follow the session's event stream; you don't follow the agent's editing cursor across files.

**Multi-agent:** Devin supports multiple concurrent sessions; you tab between them. Cowork shows multiple agents as dashboard cards. No product shows multiple agents co-present in the same file with distinct colors + follow affordances.

### School 3 — Terminal multiplexer (Claude Code teams, Warp AI, tmuxinator-style)

Agents run in terminal processes, sometimes in parallel `git worktree`s. References: [Anthropic's guidance on multi-agent Claude Code](https://www.anthropic.com/engineering/claude-code-best-practices), [Warp AI](https://www.warp.dev/ai).

**Presence model:** terminal tab per agent. No visual presence UI at all — you see agent work by reading its terminal output.

**Following:** N/A in the UX sense. You "follow" by switching terminal tabs.

**Multi-agent:** yes (multiple worktrees + terminal panes) but fully manual. No aggregation, no unified timeline.

## Critical gaps identified

### Gap 1 — No per-file agent presence glow in any shipping product

Replit shows *human* avatars in the filetree. Cursor's parallel-agent-tabs show agent sessions, not file-level presence. Devin's session view is workspace-scoped.

**Nothing combines:** "here are all the files this agent is editing right now, with a liveness indicator on each."

### Gap 2 — No "follow agent across files" feature

Devin's per-session "Following" toggle is the closest but is tab-level (follow the event stream of one session) not file-level (follow the agent as it opens new files). VS Code Live Share's human-follow crosses files but isn't agent-aware.

The missing piece in the 3P landscape is the *pin UI* that lets users choose to follow one agent's focus broadcasts across files. A pub-sub primitive carrying per-agent current-file focus is the data foundation; pin-UI + mode indicator is the interaction surface on top.

### Gap 3 — No stable per-agent colors

Human collaboration tools assign stable colors to users (Figma, Docs, Notion all persist colors per-user). AI tools either show no agent identity (it's just "the assistant") or generate a session color that doesn't persist across sessions.

For multi-agent UX, stable per-agent colors are foundational — agent-X should have the same color across every surface (presence bar, cursor, diff gutter, activity feed, file badge). Nothing ships this today for agents.

### Gap 4 — No agent identity as a first-class presence entity

The closest is Cursor's session tab list (agent sessions have IDs, names, status) but they're dashboard rows, not presence entities. Across the 3P survey, no shipping tool models an agent as a collaborator-class presence participant (same data shape as a human: avatar color, stable identity, live cursor/focus) — they are either sidebar assistants or dashboard jobs.

## Multi-agent disambiguation (D9)

### How tools that have multi-agent disambiguate

| Tool                         | Disambiguation mechanism     | Visual                                     |
| ---------------------------- | ---------------------------- | ------------------------------------------ |
| Cursor parallel agents       | Separate tabs per session    | Tab label ("Agent Task 1", "Agent Task 2") |
| Devin                        | Session cards on dashboard   | Session name, status badge, avatar         |
| Claude Code teams (terminal) | Separate terminal panes      | Terminal title, optional tmux colors       |
| Cowork                       | Per-agent cards in a sidebar | Agent name, avatar, status                 |
| Copilot Workspace            | One per PR draft             | PR title, status                           |

**Common pattern:** a "sessions" list with name + status + avatar, where clicking switches the active view. Not presence-integrated.

### How human collaboration tools disambiguate simultaneous actors

| Tool               | Encoding                                                          |
| ------------------ | ----------------------------------------------------------------- |
| Figma              | Stable per-user color on cursor, flag shows name on hover         |
| Google Docs        | Stable per-user color on cursor, label with email on hover        |
| Notion             | Per-user color, name on hover, stacked-avatar bar                 |
| VS Code Live Share | Per-participant color on cursor, named entry in participants list |

**Pattern:** color + name label is the universal answer. Stable colors matter — changing colors between sessions breaks mental model.

### Combining for multi-agent

For N agents + M humans in the same workspace, Open Knowledge should combine:

- **Stable color per agent** (persisted across sessions; hash of agent ID)
- **Name label** with disambiguation suffix when duplicates exist (e.g., "Claude Code (spec-work)" vs "Claude Code (bug-fix)" if two agents are both "Claude Code" base identity)
- **Icon to distinguish** agent (bot glyph) from human (avatar) at first glance — don't use color alone
- **Presence bar section separator** between humans and agents (or a filter chip to toggle agent visibility)

## Anti-patterns observed

- **"The agent" singular** — Cursor, Zed, Claude Code all default to a singular-agent mental model, then retrofit multi-agent as separate "sessions." This makes multi-agent feel like a power-user feature, not a first-class capability.
- **No persistent agent identity across sessions** — a fresh agent-session = new UUID = new color = discontinuous user experience. The user has to re-learn which agent is which each session.
- **Dashboard-divorced-from-editor** — Devin's dashboard is separate from the editor. Users have to context-switch to see agent state. In-editor presence surfaces are the opposite direction and appear to be the right one.
- **Hidden attribution** — Aider, Cline, Continue all do their work without leaving a visible artifact trail in the file history (the diffs exist in git but aren't UI-surfaced in the editor's activity feed). Products that expose a durable per-agent attribution journal get richer downstream surfaces (activity feeds, rollback, follow) for free.

## Missing UX layers across the 3P landscape

Relative to what a product targeting "pin-an-agent follow" would need, these are the UX gaps not filled by any shipping prior art:

1. **Cross-file presence badges for agents** — Replit ships them for humans; no tool ships them for agents.
2. **Pin-an-agent-follow affordance** — no shipping AI tool has file-level follow; VS Code Live Share has it only for humans.
3. **Stable color assignment + rendering across surfaces** — humans get stable colors in Figma, Docs, Notion, Live Share; agents get session-fresh colors or none at all.
4. **Per-agent session scrubber** — Devin ships a scrubber, but it's session-UI-only, not tied to a durable per-writer attribution log.
5. **Inline diff per agent burst exposed to non-editor viewers** — Cursor shows it to the editor user only; no tool shows it to a collaborator who's viewing the doc from a different surface.

## References

- [Cursor Agent docs](https://docs.cursor.com/chat/agent)
- [Cursor parallel / background agents](https://docs.cursor.com/agent/overview)
- [Zed Assistant](https://zed.dev/docs/assistant/assistant)
- [Continue docs](https://docs.continue.dev/)
- [Cline repository](https://github.com/cline/cline)
- [Roo Code](https://github.com/RooVetGit/Roo-Cline)
- [Devin docs](https://docs.devin.ai/)
- [GitHub Copilot Workspace](https://githubnext.com/projects/copilot-workspace)
- [OpenHands (formerly OpenDevin)](https://github.com/All-Hands-AI/OpenHands)
- [Claude Code multi-agent best practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Warp AI](https://www.warp.dev/ai)

## Decision triggers for Open Knowledge

- **Design for multi-agent from day one.** Shipping products that retrofit multi-agent (Cursor, Devin) feel clunky; greenfielding presence-first means Open Knowledge can be the first product where "follow agent across files" is a flagship feature, not a power-user add-on.
- **Stable agent color.** Hash-derived from agent identity (MCP `clientInfo.name` + optional instance suffix). Color must persist across sessions.
- **Agent-vs-human visual distinction beyond color.** Bot glyph on the avatar (a small corner badge) is the cleanest solution — colorblind-safe and glanceable.
- **"Following" affordance borrowed from VS Code Live Share, not Devin.** Devin's tab-level follow is too coarse. Live Share's pushpin model applied to per-file focus broadcasts is the right shape.
- **Agent session scrubber.** Devin-style timeline backed by shadow-repo commits is the Open Knowledge-native implementation.
- **Do not adopt:** singular-agent mental model (Cursor's "the agent"); session-UUID-colored-anew-every-time pattern; dashboard-divorced-from-editor UX.
