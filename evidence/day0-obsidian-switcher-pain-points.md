---
title: "Day-0 pain points for the Obsidian+Claude Code user"
type: synthesis
created: 2026-04-02
---

## TLDR
Walking through a typical day of a developer using Obsidian + Claude Code surfaces 10 pain points. 5 are already covered by existing stories. 5 are gaps — not separate stories, but enrichments and one new story that would make the day-0 experience dramatically better than the current setup.

## The persona's typical day

### Morning: "What did my agent do?"
User opens their KB. Claude ran a scheduled lint/compile skill overnight.
- **Obsidian pain:** Files changed on disk. No indication what changed or why. Must `git diff` in terminal. Raw diff of markdown is hard to parse.
- **Us:** Activity feed: "Claude edited 3 articles (2h ago) — fixed inconsistencies in deployment section." Click → visual diff per article. Accept or review.
- **Covered by:** S5 mentions "activity feed" but doesn't emphasize the ASYNC review case. S5 is framed as real-time presence, not async "what happened while I was away."
- **GAP: Async activity review is different from real-time presence.** The morning catch-up is a distinct UX moment.

### Working session: "I'm bouncing between terminal and editor"
User asks Claude to research something and write it up. Switches to Obsidian to read. Wants edits. Switches back to terminal. Wants to see rendered result. Switches back.
- **Obsidian pain:** Two separate apps, no integration between them. Context switch cost.
- **Us:** Agent writes, user sees it appear in the same editor they're reading. No app switching.
- **Covered by:** S5 (presence — you see the agent writing in real-time in your editor).

### Editing alongside the agent: "I can't edit while Claude is working"
User asks Claude to add a section to an article they're currently editing.
- **Obsidian pain:** Claude writes to the file. Obsidian detects file change. Dialog: "File changed on disk. Reload?" User's unsaved edits may conflict. If they save while Claude is writing, last-write-wins.
- **Us:** CRDT merges both edits. User's cursor doesn't jump. Their edits are preserved alongside Claude's.
- **Covered by:** S5 (co-editing) + CC1 (CRDT).

### Undoing agent changes: "Claude messed up, how do I undo just its changes?"
Claude rewrites a section and the user doesn't like it.
- **Obsidian pain:** Cmd+Z in Obsidian undoes YOUR last edit, not Claude's. Claude's edit was a file-level overwrite from terminal. To undo Claude, you'd `git checkout -- file.md` (loses ALL changes since last commit, including yours).
- **Us:** Cmd+Z with per-origin undo (trackedOrigins). Undoes Claude's edits specifically. Your edits preserved.
- **Covered by:** Mentioned in S5 constraints and CC4, but NOT as a user-facing capability in any story description.
- **GAP: Per-origin undo is a killer feature that's buried in technical details.** Should be prominent.

### Finding things: "Obsidian search only finds exact words"
User wants to find everything related to "deployment."
- **Obsidian pain:** Text search finds "deployment" but misses the CI/CD article, the Docker article, the rollback runbook. Graph view shows explicit links only — no semantic connections.
- **Us:** Semantic search finds conceptually related articles even without keyword matches.
- **NOT covered by any story.** Search is mentioned in S3 (Next) as "full-text search" and in S4 as a MCP tool, but semantic search isn't in any story.
- **GAP: Semantic search is a day-0 differentiator that's currently not scoped.**

### Wiki-linking: "I know there's a related article but I can't remember the name"
User is writing and wants to link to another article.
- **Obsidian pain:** Type `[[`, start typing. Obsidian autocompletes by title. If you can't remember the title, you have to browse or search separately.
- **Us:** Type `[[`, autocomplete suggests articles by semantic relevance to what you're currently writing — not just title match.
- **NOT covered.** Wiki-link autocomplete isn't in any story.
- **GAP: Semantic wiki-link autocomplete would be a small but high-impact feature.**

### Agent's search quality: "Claude can't find things in my KB"
User asks Claude "what do we know about rate limiting?" Claude searches the KB via MCP.
- **Obsidian MCP pain:** Plugin does text search. Misses the "API throttling" article and the "request quotas" article.
- **Us:** MCP search tool uses the same semantic index. Claude finds conceptually related articles.
- **Same gap as "Finding things" above — semantic search in MCP tools.**

### Setting up: "I spent 2 hours configuring MCP plugins"
User wants Claude Code to work with their Obsidian vault.
- **Obsidian pain:** Find an MCP plugin (which of the 12?). Install it. Configure the vault path. Configure auth (if any). Test it. Some plugins are unmaintained. Some break after Obsidian updates.
- **Us:** `npx openknowledge init` creates a project. Add one line to Claude Code MCP config. Done.
- **NOT explicitly a story.** Zero-friction setup is DX, not a feature. But it's critical for day-0 adoption.
- **GAP: Onboarding/setup experience isn't scoped as a story or cross-cutting concern.**

### Sharing: "Check out my research"
User wants a colleague to see an article.
- **Obsidian pain:** Share the vault? Colleague needs Obsidian installed + clone the repo. Or export to PDF (loses links, formatting). Or use Obsidian Publish ($8/mo, limited).
- **Us (P0):** It's a web UI — share localhost URL on same network? Or push to git, colleague runs `npx openknowledge` on their clone. Still not seamless.
- **Partially covered by Later stories (S-L1, S-L2).** For P0, sharing is git-based which is fine for developers.

### Reorganizing: "I moved files and now links are broken"
User restructures their KB — moves articles between folders.
- **Obsidian pain:** Internal links break. Obsidian has some auto-update but it's imperfect, especially for links Claude Code created.
- **Us:** Product understands the link graph and updates references when articles move.
- **NOT covered.** Link integrity on reorganization isn't in any story.
- **This is probably a S3 (navigation/organization) enrichment, not a separate story.**

## Summary of gaps

| Gap | Impact on day-0 switching | Where it belongs |
|---|---|---|
| **Async activity review** ("what did my agent do while I was away?") | HIGH — the morning catch-up moment | Enrich S5 or new story |
| **Per-origin undo as prominent feature** | HIGH — "I can undo just Claude's changes" is a killer selling point | Surface prominently in S5 description |
| **Semantic search** (for both human UI and MCP tools) | HIGH — dramatically better than Obsidian's text search for both human and agent | New story or enrich S4 |
| **Zero-friction onboarding** (`npx openknowledge init` + one MCP config line) | HIGH — day-0 friction determines adoption | CC or DX story |
| **Wiki-link semantic autocomplete** | MEDIUM — nice-to-have, not a switching trigger | Enrich S1 or semantic search story |
| **Link integrity on reorganization** | MEDIUM — matters when KB grows, not day-0 critical | Enrich S3 (Next) |
