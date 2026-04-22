---
dimension: D4
topic: Real-time edit visualization for batch / non-cursor edits
confidence: High (multiple families of shipping product behavior)
---
# D4 — Real-time edit visualization for batch / non-cursor edits

Human collaborative editing has well-understood visualizations (colored cursors + selection flashes + slow-fade highlights). Agent edits are different: they arrive in bursts, they can mutate entire paragraphs at once, and there's no continuous cursor motion to communicate intent. Five distinct families of edit visualization ship in production tools, each with different trade-offs.

## Family 1 — Live highlights (cursor/burst, consumer-tool standard)

### Google Docs

When another user types, the inserted text appears with a **colored underline** in their user color, plus a brief fade highlight (observationally \~2-3s; Google's docs do not publish a precise duration) on the paragraph. Deletions animate briefly. The user's cursor flag carries their name label. Reference: [Google's docs collab help](https://support.google.com/docs/answer/2494886).

### Figma

Cursor motion shows the flag; edits to properties show a short flash (observationally \~1s; Figma does not publish the exact duration) on the changed attribute in the user's color, visible in the properties panel. Canvas edits (moving objects) show a brief outline trace.

### Notion

Highlights edits with a brief **selection flash** (observationally \~800ms; Notion does not publish the exact duration) and keeps the user's cursor visible in their color. Deletion is not visualized (just disappears).

**Limits for agent edits:** these all assume cursor-driven, incremental edits. An agent replacing a 50-line paragraph in one atomic write either flashes the entire replacement (visually overwhelming) or shows no visualization (nothing happens).

## Family 2 — Suggestion mode (Notion, Google Docs suggested edits)

### Google Docs suggested edits

Per [Google's suggesting mode docs](https://support.google.com/docs/answer/6033474), switching to suggestion mode makes edits appear as **inline insertions (colored underline) + deletions (strikethrough)** with an accept/reject UI in the margin. Changes don't land in the canonical document until accepted.

### Notion suggested edits

Similar affordance: edit is pending, rendered as markup-style delta, accept/reject interactions.

**Advantage for agent edits:** this is the natural UI for "agent proposes, human accepts." If agents write in suggestion mode by default, the user gets a review surface and the edit doesn't land until they approve. The UX is well-understood by anyone who's used Google Docs.

**Disadvantage:** breaks the "live collaboration" feel. For trusted agents doing bulk edits, forcing every edit through a suggestion gate creates too much friction. Probably right for low-trust or bulk-edits; wrong for high-trust continuous edits.

## Family 3 — Version-history / timeline scrubber

### Google Docs version history

[Google Docs version history](https://support.google.com/docs/answer/190843) shows a named-version timeline with diff view per version. Time-sliced (every N minutes auto-snapshot) plus named-version saves. The diff view highlights insertions/deletions with the user's color.

### Notion page history

Time-sliced snapshots with per-edit attribution. Less granular than Docs but same pattern.

### Figma version history

Per-file save points with user attribution. Named versions for milestones.

**Limits for real-time:** version-history is strictly retrospective. You can see who did what 10 minutes ago, but not what's happening *now*. Useful as the complement to real-time viz, not a replacement.

## Family 4 — AI inline diff (Cursor, Zed, Claude Code, Copilot)

### Cursor inline diff

When Cursor Agent or Cmd-K generates an edit, the UI shows a **side-by-side or inline diff** with the proposed change. Accept/reject per hunk. Reference: [Cursor docs on inline chat and agent edits](https://docs.cursor.com/chat/agent).

### Zed agent panel

Similar: AI edits appear as a diff preview overlaid on the editor, with keybinds to accept/reject/iterate. Reference: [Zed AI docs](https://zed.dev/docs/assistant/assistant).

### Claude Code (terminal)

Claude Code shows proposed edits as inline diffs in the terminal with explicit user approval (default mode). In auto-edit mode, edits apply directly and the diff is shown as an after-the-fact log entry.

### GitHub Copilot Workspace

Copilot Workspace shows the full proposed change set as a file-by-file diff in a dedicated review surface before landing to the branch.

**Characteristic shape:** these tools treat AI edits as **proposed patches** with human-in-the-loop review, NOT as continuous collaborative edits. The diff is the interaction surface. This is fundamentally different from Google Docs' "edit lands immediately + fade highlight" model.

## Family 5 — Git diff viewer surfaces (GitHub, GitLab, code-review tools)

### GitHub pull request diff

Red/green line-level diff with syntax highlighting, inline comments, and line-anchored review. Reference: [GitHub PR review docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests).

### Reviewable, Phabricator, Gerrit

Patch-oriented code review with line-level commenting, review state per hunk, and chained review rounds.

**Characteristic:** these are strictly batch review surfaces — the diff is the final work product, not a live view into a working session. But the **visual vocabulary** (red/green, unified-vs-split, hunk headers, line-anchoring) is the dominant shared vocabulary for "show me what changed."

## Open Knowledge-specific prior art: Replit Checkpoints + Devin timeline

### Replit Agent checkpoints

Replit Agent creates a **checkpoint after every meaningful step** and shows them as a scrubbable timeline in a side panel. Click a checkpoint → see the diff vs the previous checkpoint. "Rollback to this checkpoint" is a first-class affordance. Reference: [Replit Agent docs](https://docs.replit.com/replitai/agent).

This is the single closest prior art for "expose agent edits as a git diff over the shadow repo." Replit's implementation:

- Per-step snapshot (tied to the agent's plan steps, not wall-clock)
- Inline diff per checkpoint
- Cumulative diff from session start
- One-click rollback

### Devin interactive timelapse

Devin's session replay shows the agent's edits as a **scrubbable timelapse** — drag a scrubber to replay the agent's work from session start to current state. Diff per step. Reference: [Devin docs](https://docs.devin.ai/essential-guidelines/session-overview).

### Claude Code session replay

Claude Code's terminal log is the de facto replay: each edit shows the pre/post diff inline. Not a scrubber UI, but functionally equivalent if you scroll up in the conversation.

## Cross-family synthesis

| Family             | Real-time?    | Acceptance required? | Batch-friendly?            | Cross-file view?      |
| ------------------ | ------------- | -------------------- | -------------------------- | --------------------- |
| Live highlights    | Yes           | No (auto-apply)      | No (overwhelming for bulk) | No (current doc only) |
| Suggestion mode    | Yes           | Yes                  | Yes                        | No                    |
| Version history    | No (retro)    | No                   | Yes                        | Yes (across file set) |
| AI inline diff     | Yes           | Yes (usually)        | Yes                        | Usually per-file      |
| Git diff viewer    | No (retro)    | Yes (PR merge)       | Yes                        | Yes                   |
| Replit checkpoints | Near-realtime | Optional rollback    | Yes                        | Yes (whole repo)      |

## Key insight: time resolution determines UI shape

- **Sub-second** (cursor motion, typing) → live highlights + fade
- **Seconds** (agent batch edit) → AI inline diff OR suggestion mode
- **Minutes** (session-level summary) → version history OR checkpoint scrubber
- **Multi-session** (retrospective review) → git diff surface

An agent that writes continuously across many files over many minutes occupies the middle two bands, which means: **inline diff per edit** (Cursor-style) **+ checkpoint scrubber for session view** (Replit-style) is the combination the user's agent-activity branch should aim for. The cursor/fade pattern (Family 1) is wrong for agent edits. The git PR viewer (Family 5) is right for post-session review but wrong for in-session view.

## Color and accessibility

- Red/green diff must pass colorblind testing — GitHub's diff uses red/green but supplements with `-`/`+` prefixes.
- Don't use author color for diff background — it conflicts with the user color from presence. Use semantic colors (red/green) for diffs, author colors only for cursor/presence.
- Avoid full-line highlights for bulk edits (overwhelming). Use a subtle left-edge color bar instead (Notion does this for comment-anchored paragraphs).

## Anti-patterns observed

- **Fade highlight on large replacements** — Docs flashing a 50-line paragraph is visually jarring and doesn't help comprehension.
- **Continuous live-cursor rendering for agents** — agents don't have meaningful cursor motion; showing a flickering cursor as agents batch-write misleads about agency.
- **Silent edits with no visualization** — too subtle; user misses that changes happened.
- **Accept/reject on every agent keystroke** — defeats the "live collaboration" promise. Gate on bursts, not keystrokes.

## References

- [Google Docs suggesting mode](https://support.google.com/docs/answer/6033474)
- [Google Docs version history](https://support.google.com/docs/answer/190843)
- [Cursor agent docs](https://docs.cursor.com/chat/agent)
- [Zed AI assistant docs](https://zed.dev/docs/assistant/assistant)
- [Replit Agent docs](https://docs.replit.com/replitai/agent)
- [Devin session overview](https://docs.devin.ai/essential-guidelines/session-overview)
- [GitHub PR review](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests)

## Decision triggers for Open Knowledge

- **Primary edit visualization:** AI inline diff per agent edit (Cursor/Zed pattern) — shows pre/post state for agent writes, live as they arrive.
- **Session-level view:** Replit-style checkpoint scrubber driven off the existing shadow git repo (`.git/openknowledge/`). Each agent session becomes a scrubbable timeline of commits.
- **Cross-file view:** sidebar diff badge (e.g., +5/-2) next to files with agent edits in the current session. Click → cross-file diff viewer. Clear on session-end or user-acknowledge.
- **What to skip:** live cursor rendering for agents (wrong time-band), suggestion-mode gating on every edit (too much friction; reserve for low-trust edits).
- **Acceptance model:** "accept" is implicit for auto-persist agents, but "undo last agent burst" should be a one-click affordance from the scrubber.
- **Colors:** red/green for diff content, agent presence color for the surrounding card/gutter only.
