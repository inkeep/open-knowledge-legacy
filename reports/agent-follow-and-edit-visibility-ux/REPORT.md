---
title: Agent Follow-and-Edit Visibility UX — Cross-Product Landscape
date: 2026-04-20
topic: UI/UX patterns for multi-file agent presence, follow, and edit visualization
framing: 3P (external products); 1P advantages mentioned as context only
confidence: High (primary-source cited across shipping products)
---
# Agent follow-and-edit visibility UX — cross-product landscape

## Executive summary

**Primary question:** what are the best UI/UX patterns for users to follow AI agents across multiple files, see their edits in real-time, and maintain control of their own work?

**Headline finding:** the UX pattern the user is building — *pin an agent, follow them across files, glow their presence when active, expose their edits as a diff timeline* — has **no shipping prior art that combines all four**. Every piece exists in some product (Replit has filetree presence; VS Code Live Share has multi-pin follow; Cursor has inline AI diff; Devin has session replay; Notion has avatar pulse), but the combination targeted at AI agents specifically is unshipped territory. This is both an opportunity (differentiation) and a caution (nobody has debugged the edge cases yet).

**Five load-bearing recommendations** fall out of the 3P survey:

1. **Borrow VS Code Live Share's pushpin follow model, not Google Docs' aggressive-auto-break.** Agent work is long-running; auto-break on every scroll is wrong. See [[d1-d2-follow-and-control-plane]].
2. **Adopt Replit's filetree-avatar pattern for cross-file agent presence.** Only shipping tool that solves cross-file presence cleanly. Glow/pulse per Notion's Live Presence convention. See [[d3-d7-cross-file-presence-and-indicators]].
3. **Use AI inline diff (Cursor/Zed pattern) as the primary edit visualization, NOT live-cursor highlights.** Live cursor doesn't apply to agent bursts; inline diff is the right time-resolution. Complement with a Replit-style checkpoint scrubber for session view. See [[d4-edit-visualization]].
4. **Ship two feed shapes: per-agent scrubber (Devin-style, session-scoped) + workspace reverse-chron (Linear-style).** Both are needed — one for active watching, one for catching up. See [[d5-activity-feeds]].
5. **Design for multi-agent from day one.** Every shipping tool surveyed treats multi-agent as a retrofit (Cursor adds parallel-agent tabs; Devin bolts multi-session onto single-session UX). The pattern shows up clunky. If a product is building agent presence from scratch, co-designing multi-agent semantics with the presence primitives avoids the same cost. See [[d6-d9-agent-prior-art]].

**Novel affordances without prior art** that would genuinely differentiate:

- Pause-the-agent button during follow (no human equivalent; high value for agent burstiness)
- Rewind + play-forward scrubbing while following live
- Per-file filter on the pin ("follow agent-X only on `foo.ts`")

## Research rubric

The rubric locked at scoping and driving the investigation:

| ID | Dimension                                                 | Priority | Depth    | Evidence                                     |
| -- | --------------------------------------------------------- | -------- | -------- | -------------------------------------------- |
| D1 | Follow-mode mechanics                                     | P0       | Deep     | [[d1-d2-follow-and-control-plane]]           |
| D2 | Presence as control plane                                 | P0       | Deep     | [[d1-d2-follow-and-control-plane]]           |
| D3 | Cross-file / cross-surface presence                       | P0       | Deep     | [[d3-d7-cross-file-presence-and-indicators]] |
| D4 | Real-time edit visualization for batch / non-cursor edits | P0       | Deep     | [[d4-edit-visualization]]                    |
| D5 | Activity feeds / timelines                                | P0       | Moderate | [[d5-activity-feeds]]                        |
| D6 | Agent-specific prior art                                  | P0       | Deep     | [[d6-d9-agent-prior-art]]                    |
| D7 | Active / idle / typing indicators                         | P1       | Moderate | [[d3-d7-cross-file-presence-and-indicators]] |
| D8 | User sovereignty during follow                            | P1       | Moderate | [[d8-user-sovereignty]]                      |
| D9 | Multi-agent disambiguation                                | P1       | Moderate | [[d6-d9-agent-prior-art]]                    |

## The landscape in one picture

The \~15 products surveyed cluster into three categories that do not overlap:

```
  HUMAN COLLABORATION                AI CODING ASSISTANTS              AI AUTONOMOUS AGENTS
  (Figma, Docs, Notion,              (Cursor, Zed, Continue,          (Devin, Cowork, Copilot
   Live Share, Replit, Miro)          Cline, Aider, Claude Code)       Workspace, OpenHands)

  ✓ Multi-user presence              ✗ Presence (singular user)        ✗ Presence in editor
  ✓ Follow affordance                ✗ Follow (agent is your panel)    ~ Follow (session-level)
  ✓ Cursor-based edit viz            ✓ Inline diff per edit            ✓ Dashboard-level activity
  ~ Activity feeds                   ✓ Conversation log                ✓ Session replay
  ~ Cross-file presence              ✗ Cross-file presence             ~ Cross-session dashboard
```

Every arrow that points to the ideal Open Knowledge experience — per-file agent presence, pin-an-agent follow, shadow-repo backed live diff — crosses a gap in one of these categories. The opportunity is to compose pieces from all three.

## Detailed findings per dimension

### D1 — Follow-mode mechanics (P0, Deep)

**Universal pattern:** avatar is the entry point. Every tool without exception puts the follow affordance on the avatar. No tool uses a separate "Follow" button or dialog.

**Three persistence regimes** (auto-break policy):

- **Aggressive** (Google Docs) — any interaction breaks follow. Frequently complained about.
- **Interaction-only** (Figma Observation Mode) — only *your* direct interaction with the same surface breaks. Middle ground.
- **Explicit only** (VS Code Live Share pushpin) — unpinning is the only way out.

For agent follow, **explicit-only is correct**. Agent work is long-running; auto-breaking on scroll makes follow un-useful. Live Share's model is the template.

**Notification to followed entity:**

- Silent (default: Figma, Docs, Live Share) — the followed person never knows.
- Notified (outlier: Miro) — followed user gets a badge.

For agents, silent is safe (agents don't have feelings). But *other humans* in the workspace might want to see "3 users are pinned to agent-X right now" as a governance signal — not covered by any prior art for agents.

**Multi-pin:** only VS Code Live Share supports it, via editor-group scoping. This is the prior art for following multiple agents simultaneously. If Open Knowledge's editor supports split views, editor-group-scoped pin is elegant; otherwise a "followed agents" chip row in the presence bar approximates the UX.

**Decision trigger:** avatar → pushpin-style persistent pin (unpin on explicit action), silent to agents, per-editor-pane scoping where split views exist.

### D2 — Presence as control plane (P0, Deep)

Every affordance (follow, pin, jump-to-cursor, profile view) is accessed via the presence bar or participant list — never via a separate menu. The "rules" that shipping tools consistently follow:

1. Avatar click = jump-to-cursor (navigate to where they are)
2. Avatar hover = name + status tooltip
3. Avatar right-click or menu icon = actions (pin follow, profile, mute, etc.)
4. Avatar long-press (mobile) = actions
5. Stacked avatars with `+N` overflow when >3-4 present

**Open Knowledge existing implementation:** the spec `specs/2026-04-08-presence-awareness-ux/` already models avatars + identity; the affordance layer is what this dimension adds. Click the agent avatar → menu with "Follow Agent," "Jump to current edit," "View activity."

### D3 — Cross-file / cross-surface presence (P0, Deep)

**The one clear prior art is Replit's filetree.** Replit shows avatars next to each file in the tree where someone is currently editing. Stacked when >1, click to navigate. No other shipping tool with multi-file workspaces solves cross-file presence this cleanly.

**Implication for Open Knowledge:** overlay a stacked-avatar badge on `FileTree.tsx` entries when agent sessions are active on that file. Combined with the glow affordance (D7), this gives the single-glance "who is working where" view that's the centerpiece of the branch goal.

**Notion and Google Docs are zero-coverage cases** — no cross-file presence at all, users have to visit each doc to see who's there. This is the gap the user specifically called out ("only works in embedded browser"). Fixing it is a real differentiator.

### D4 — Real-time edit visualization (P0, Deep)

**Five families, only two apply to agent work:**

- Live highlights (cursor-driven fade): wrong for batch agent edits; would flash 50-line paragraphs
- Suggestion mode: right for low-trust agents; too much friction for high-trust continuous work
- Version history: retrospective only; not real-time
- **AI inline diff** (Cursor/Zed): right for per-burst agent edits
- Git diff viewer: retrospective; right for post-session review

**Time-resolution is the determining factor:**

| Time band                  | UI family                              |
| -------------------------- | -------------------------------------- |
| Sub-second (cursor/typing) | Live highlights + fade                 |
| Seconds (agent burst)      | **AI inline diff**                     |
| Minutes (session view)     | **Checkpoint scrubber** (Replit-style) |
| Multi-session              | Git diff viewer / PR review            |

Open Knowledge's agent edits occupy the middle two bands, so **AI inline diff + checkpoint scrubber** is the right combination. The shadow repo is already the backing store for the scrubber — `git log refs/wip/<branch>/<writer-id>` is the timeline; per-commit diff is already computable.

**Acceptance model:** auto-persist with one-click "undo last agent burst" (like Replit's rollback-to-checkpoint) is the right default. Suggestion-mode per edit is too heavy for continuous work.

### D5 — Activity feeds / timelines (P0, Moderate)

**Two shapes are needed, not one:**

- **Per-agent session scrubber** (Devin-style) — scrub timelapse of one agent over one session. Anchored to a session ID. Great for "what did agent-X do in this 30 minutes?"
- **Workspace reverse-chron feed** (Linear/Notion-style) — filterable by actor, grouped by file, reads like an inbox. Great for "what happened while I was away?"

The shadow repo provides the data for both. The scrubber is `git log` over one writer-id; the workspace feed is `git log --all` with actor filtering.

**Grouping unit is the agent turn** (1 AGENT\_WRITE\_ORIGIN transaction = 1 feed entry), not keystroke, not wall-clock minute. This matches how every tool that survives agent velocity handles grouping.

**Replay-mode indicator** is required — if the user scrubs to a historical state, show a banner ("Viewing state as of 10:14 — return to live"). Devin doesn't do this well (users get confused about state); a clear banner would leapfrog.

### D6 — Agent-specific prior art (P0, Deep)

**Three schools, none solve multi-file agent presence:**

- **In-editor panel** (Cursor, Zed) — agent is your sidebar. No cross-file, no presence, not multi-user.
- **Autonomous workspace** (Devin, Cowork) — agent is a dashboard row in a separate screen. Disconnected from your editor.
- **Terminal multiplexer** (Claude Code teams) — agents in terminal panes. No visual presence.

**Closest shipping prior art to the user's goal** is Devin's per-session "Following" toggle — but it's tab-level, not file-level. You follow the session's event stream, not the agent's cursor across files.

**Critical unshipped combination:** no product has all of (a) agent-as-presence-entity, (b) cross-file presence badges, (c) pin-an-agent-across-files, (d) per-agent stable colors. A product that ships this combination is establishing a pattern the category does not yet have.

### D7 — Active / idle / typing indicators (P1, Moderate)

**Conventions to adopt:**

- **3-state model** (active / idle / offline) — universal
- **5-minute active-idle threshold** — consumer modal (Teams, Discord, Slack)
- **Solid-vs-greyed avatar** for presence
- **Notion-style opacity+scale pulse** for "actively working right now" (not Figma's more aggressive halo)

**Typing indicator TTL needs adjustment for agents:** 2-3s chat-tool TTL will flicker under step-function agent write bursts. Use 10-15s TTL ("recently writing") to keep the indicator steady. This is an agent-specific adjustment not found in human-collaboration prior art.

**Do not use:** generic online-status green dot decoupled from file location (Slack anti-pattern). Agent presence must always indicate *where* the agent is, not just that it's connected.

### D8 — User sovereignty during follow (P1, Moderate)

**Baseline:** VS Code Live Share's sovereignty model (follow is sticky, survives most interactions, scoped to an editor pane).

**Agent-specific affordances without prior art:**

1. **Pause-the-agent button during follow** — unique to agent-follow; no human equivalent. High value because agents are firehoses.
2. **Rewind + play-forward** via shadow-repo scrubbing while following live. Lets the user re-read context without losing the live track.
3. **Per-file filter on the pin** — "keep following agent-X only on `foo.ts`."

**Must-haves from general prior art:**

- Mode indicator (always show "Following Agent-X" chip)
- ESC key exit (WCAG 2.1.2 No Keyboard Trap)
- Respect reduced-motion preference (snap-to-follow, not animated pan)

### D9 — Multi-agent disambiguation (P1, Moderate)

**Stable color per agent** is foundational and missing from every shipping AI tool. Hash the agent identity (MCP `clientInfo.name` + instance suffix) to a palette slot so the color persists across sessions. Human tools do this for humans; no AI tool does it for agents.

**Agent-vs-human visual distinction beyond color:** bot glyph on the avatar (small corner badge) is the cleanest solution — colorblind-safe and glanceable.

**Presence bar structure** for mixed human + multi-agent populations: grouped sections ("👤 Humans" and "🤖 Agents") with a filter chip to show/hide each group. No shipping tool needs this because they don't have the mix; any multi-agent collaborative product will.

## Cross-dimension synthesis — the integrated UX recommendation

A concrete shape composed from the 3P findings. Specific integration with the user's codebase (file paths, primitives, spec references) belongs in an implementation spec, not this research report.

### Surface 1 — Presence bar (the control plane)

- Avatar pill per active agent + active human, with stable color and bot/person glyph
- Glow (Notion-style opacity+scale pulse, \~1.5Hz) when the agent has written in the last 10s
- Click → actions menu: "Follow across files," "Jump to current edit," "View session timeline," "Pause agent"
- Stacked avatars with `+N` overflow at >3 present
- Filter chips: "Show humans," "Show agents"

### Surface 2 — Filetree presence (cross-file "glow when working")

- Overlay stacked-avatar badge on filetree entries where an agent session is active
- Pulse on the file-row badge when agent is actively writing to that file
- Click the badge → jump to that file
- Implementation requires a push channel carrying each agent's current-file focus state to the client

### Surface 3 — Inline diff per agent burst (per-edit visualization)

- When an agent writes, render the diff inline (pre/post, colored hunks) with a subtle 2-3s dwell animation
- Gutter color indicates authoring agent (stable color, matches presence bar)
- "Undo this burst" affordance appears on hover of the diff gutter
- For low-trust agents, optional suggestion-mode that gates each burst on user approval

### Surface 4 — Follow mode (pin an agent)

- Click agent avatar → "Follow across files"
- Pushpin icon on the agent's avatar while following
- Follow is sticky (explicit unpin); survives scrolling, selection, and side-panel interactions
- When the agent opens a new file, the user's editor opens the same file (or previews in a secondary pane)
- Mode indicator: "Following Agent-X" chip in the header with unpin button
- ESC key unpins

### Surface 5 — Agent session timeline (Devin-meets-Replit)

- Right-rail panel (or toggleable view) showing the agent's session as a scrubbable timeline
- Each entry = one AGENT\_WRITE\_ORIGIN transaction = one shadow-repo commit
- Click to preview state at that point; scrub to replay forward/backward
- Clear "Viewing state as of <timestamp>" banner when scrubbed off live
- "Rollback to this point" one-click action
- Per-step: file name, diff summary (+N/-N), agent reasoning text (if available via the MCP session)

### Surface 6 — Workspace activity feed (the async catch-up)

- Linear-style reverse-chron feed, filterable by actor and file
- Grouped entries ("Agent-X made 12 edits to `foo.md` between 10:00 and 10:15")
- Inline diff preview on hover
- Read/unread state per viewer (optional)

## Limitations and caveats

1. **3P framing:** this report deliberately does not analyze the Open Knowledge codebase, only surveys external products and cites existing specs as context. 1P implementation details (file paths, API shapes, spec cross-references) belong in the implementation spec, not this research report.

2. **No user research cited:** the report synthesizes product documentation and observed behavior. It does not incorporate usability studies. A follow-up direction is to test the proposed surfaces with users.

3. **Rapidly evolving landscape:** AI agent UX is the fastest-moving surface in software right now. Cursor parallel agents, Devin's session UX, and Claude Code's team patterns have all changed within the last 6 months. Some specific claims may be stale by late 2026.

4. **Accessibility coverage is incomplete:** the report mentions reduced-motion, colorblind, screen-reader considerations, but a dedicated accessibility audit is a separate exercise.

5. **Scale considerations uninvestigated:** the recommendations work for 1-5 concurrent agents. Behavior at 20+ concurrent agents per workspace (dense presence bar, avatar saturation, activity-feed firehose) is not covered by prior art and would need dedicated design.

6. **Security / trust model out of scope:** who can follow whom, whether agents can see each other, how to revoke agent access — all deferred to a security spec.

## Attribution primitives from PR #222 (1P cross-reference)

_This section is a deliberate 1P excursion — it cites the _[[specs/2026-04-19-agent-identity-attribution-foundation/SPEC]]_ foundation spec (shipped via [PR #222](https://github.com/inkeep/open-knowledge/pull/222)) to map its 57-decision attribution substrate onto the UX surfaces above. The substrate is the engine; the surfaces in this report are the dashboard. Treat this as guidance for implementation sequencing, not a 3P finding._

### Primitives the spec provides

| PR 222 primitive                                                                                                                              | What it gives you                                                             | UX gap it closes                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Per-session frozen `PairedWriteOrigin` (`session_id`, `agent_type`, `principal`) stamped at MCP connect                                       | Every CRDT transaction carries actor identity inline — no side-channel lookup | Resolves D2 ("who is editing right now") at the CRDT layer, not guesses from awareness                     |
| Actor tuple `(principal, agent_session, kind)` with writer-ID schema (`agent-<connId>`, `<principalId>`, `file-system`, `git-upstream`, etc.) | Shared vocabulary across presence, timeline, and revert surfaces              | Eliminates the "mysterious agent" class (D9) — every write has a typed origin                              |
| Session lifecycle (connect → heartbeat → keepalive close → 30s cancellable grace → closed)                                                    | Deterministic "active / idle / gone" state machine                            | Powers the presence dot's 3-state color ramp (D3) without heuristics                                       |
| `Y.Map('agent-flash')` + `Y.Map('agent-effects')` side channels                                                                               | Live attribution pings separate from content CRDT                             | D4 edit-flash + D5 activity feed share one source of truth                                                 |
| Per-session history refs in the shadow repo (`refs/wip/<branch>/agent-<connId>`)                                                              | Every session has a reverse-chron commit stream                               | D5 activity feed's "what did Agent-X do across files" becomes a `git log` query, not a reconstructed index |
| `/api/session-revert` with txn / burst / session granularity                                                                                  | Revert button at three zoom levels                                            | D8 sovereignty — the "undo everything this agent did" recommendation is a single endpoint                  |
| `bucketIntoBursts(sessionStack, humanEdits)` shared core utility                                                                              | Consistent burst definition across UI + agent paths                           | D5 grouping and the timeline entries match the revert granularity exactly                                  |

### How recommendations shift

1. **Presence bar (D3 + Surface 1):** color ramp keys off session lifecycle enum, not awareness-only heuristics. Three real states — active (recent write), idle (heartbeat OK, no recent write), closing (in 30s grace) — map cleanly to dot color without fuzzy timing.

2. **Edit flash (D4 + Surface 2):** flash payload comes from `Y.Map('agent-flash')`, which is stamped inside the same transaction as the content write. No cross-source race between "edit landed" and "who did it" — they arrive together.

3. **Activity feed (D5 + Surface 3):** backed by the per-session history ref. A single `git log refs/wip/<branch>/agent-<connId>` gives the reverse-chron stream directly; bursts come from `bucketIntoBursts`. No separate index to keep in sync.

4. **Pin-and-follow (D2 + Surface 4):** the follow target is a `session_id`, not an agent name. A reconnected agent gets a fresh session; the follow relationship ends cleanly, matching real-world intent ("follow _this run_", not "follow whoever calls themselves Claude").

5. **Cross-file navigation (D7 + Surface 5):** next-file suggestions query the session's recent `agent-effects` entries. Follow-mode can auto-advance because it knows, with CRDT certainty, which file this session touched last.

6. **User sovereignty (D8 + Surface 6):** three-granularity revert is already specified. The UX work is presentation, not plumbing — per-txn inline undo, per-burst "undo this run", per-session "undo everything Agent-X did".

### UI / agent parity as a cross-cutting principle

PR 222's writer-ID schema is identity-symmetric: the same actor tuple shape applies whether the write comes from a browser user or an agent. That symmetry extends to capabilities — an agent can `pin` / `unpin` / `session-revert` via its own MCP tools with the same semantics a human gets in the UI. This unlocks an agent self-navigation pattern that the external prior art does not provide: agents can coordinate on who's editing what through the same control plane users see, removing the "agents fight over a file" failure mode without bespoke orchestration.

### New follow-up directions

6. **Agent self-navigation UX contract.** What happens in the UI when Agent-A calls `pin(Agent-B)` to follow Agent-B's cross-file edits? Does the human viewer see a "chain" indicator? Does Agent-A appear in Agent-B's followers list? Prior art is silent — pair agents don't exist in Figma / Notion / Cursor because those tools don't expose presence as a first-class agent capability.

7. **Closed-session rendering: timeline vs presence.** PR 222's lifecycle says closed sessions exit the presence set but remain attributable in history. The UX question: when a user pins Agent-X mid-edit and Agent-X's session closes, does the pin dissolve into the timeline (history-only view) or stick to a "last known" marker? Both patterns exist in Google Docs (cursor fades) vs Figma (cursor disappears instantly).

8. **Co-Authored-By rendering outside GitHub.** PR 222's save-version attribution proposes `Co-Authored-By` trailers for agent participation. GitHub renders these as avatars on the commit page. Inside the editor, the equivalent is... unclear — a hover-card on the version entry? A grouped avatar stack next to the commit message? This is a dedicated design exercise.

### Caveats on treating PR 222 as load-bearing

- **Spec, not implementation.** PR 222 is the attribution foundation _design_. Timelines in it are sequenced behind V0-14 per-session UndoManager work and the Q100-Q105 open questions. Some UX surfaces (session-revert in particular) are gated on implementation that hasn't landed.
- **Q104 unresolved (cross-session UM scope).** Whether UndoManager is strictly per-session or supports a "follow target's session" view is open. Surface 4 (pin-and-follow) depends on the answer — a cross-session UM view is what lets the follower see the followee's inline diff as they type.
- **Q105 minimal metadata.** `agent-effects` entries store `session_id + timestamp + range + content hash` today. Richer metadata (intent strings, tool call IDs, parent conversation) is not in the v1 schema — activity-feed grouping quality depends on whether that schema grows.

## Related prior research in this repo

See [[reports/mcp-agent-attribution-implementation/REPORT]] for the 1P implementation plan wiring MCP `clientInfo` into CRDT/shadow-repo attribution. That report establishes the identity foundation this UX layer builds on.

See [[reports/ai-coding-tools-embedded-browsers/REPORT]] for the context on why the current system only works in embedded browsers — the push-nav-via-MCP-tool constraint that the follow-mode UX replaces.

See [[reports/crdt-observer-bridge-latency-analysis/REPORT]] for related architectural context on the observer/edit propagation pipeline.

## References — top-level product docs cited

Full per-dimension references are inside each evidence file.

- Figma: [help.figma.com](https://help.figma.com/)
- VS Code Live Share: [learn.microsoft.com/liveshare](https://learn.microsoft.com/en-us/visualstudio/liveshare/)
- Google Docs: [support.google.com/docs](https://support.google.com/docs/)
- Replit Multiplayer + Agent: [docs.replit.com](https://docs.replit.com/)
- Devin: [docs.devin.ai](https://docs.devin.ai/)
- Cursor: [docs.cursor.com](https://docs.cursor.com/)
- Zed: [zed.dev/docs/assistant](https://zed.dev/docs/assistant/assistant)
- Notion: [notion.so/help](https://www.notion.so/help)
- Linear: [linear.app/docs](https://linear.app/docs)
- GitHub: [docs.github.com](https://docs.github.com/)
- Microsoft Teams presence: [learn.microsoft.com/teams](https://learn.microsoft.com/en-us/microsoftteams/presence-admins)
- Slack presence: [slack.com/help](https://slack.com/help/)
- Miro: [help.miro.com](https://help.miro.com/)
- Anthropic Claude Code: [anthropic.com/engineering/claude-code-best-practices](https://www.anthropic.com/engineering/claude-code-best-practices)

## Evidence files

- [[d1-d2-follow-and-control-plane]]
- [[d3-d7-cross-file-presence-and-indicators]]
- [[d4-edit-visualization]]
- [[d5-activity-feeds]]
- [[d6-d9-agent-prior-art]]
- [[d8-user-sovereignty]]