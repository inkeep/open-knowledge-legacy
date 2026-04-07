---
title: "Editing context model — design exploration (main, drafts, proposals)"
type: synthesis
created: 2026-04-02
---

## TLDR
Three editing contexts (main, draft, proposal) backed by CRDT namespaces and git branches. Default is main (no ceremony). Drafts are opt-in for iterative AI sessions. Proposals are for autonomous/review-gated changes. The persistence pipeline is identical across all contexts — parameterized by branch target.

## The core tension
When iterating with an AI agent (write, revise, restructure, revise again), intermediate states shouldn't necessarily be "live." But quick edits shouldn't require ceremony. The model needs to serve both.

## Three contexts

- **Main:** Live state of the KB. Quick human edits go here directly. Like Notion — edit, saved, done.
- **Draft:** Isolated workspace forked from main. You and agent iterate freely. Main untouched. "Apply" merges to main. "Discard" → nothing happened. Persists across sessions. Multiple drafts can coexist.
- **Proposal:** Draft created by autonomous agent or triggered by team review policies. Surfaces in review queue rather than as user's active workspace.

## When each activates (current thinking, not prescribed)
- Quick edit while browsing → main
- "Work with Claude on this" / explicit "Start draft" → draft
- Agent task touching multiple files → draft or proposal depending on scope
- Scheduled/autonomous agent task → proposal
- Team policy requires review (Later) → forces draft/proposal even for human edits

## What the user sees
- Subtle indicator: "Editing: Main" vs "Draft: Restructure architecture"
- Draft panel showing changes, duration, apply/discard buttons
- Ability to flip between draft and main to compare
- Multiple active drafts in a sidebar list

## Persistence pipeline (identical for all contexts)
The only difference is where git commits land:
- Main: Layer 2 commits to `refs/wip/<writer>/main`. Layer 3 checkpoints on main branch.
- Draft: Layer 2 commits to `refs/drafts/<name>`. "Apply" = squash-merge to main as one checkpoint.
- Proposal: Same as draft, surfaces in review queue.
Editor, CRDT, Hocuspocus hooks, serialization — all identical. Branch target is parameterized.

## MCP routing (Decided — PQ10)
Skills manage context via MCP tools (`create_draft`, `apply_draft`, `discard_draft`, `get_active_context`). Default: writes go to user's active editor context. No mode parameter on every write.

## Suggest mode (Decided — PQ11, not needed)
Agents produce batch rewrites, not per-word suggestions. Google Docs inline suggestions are a UX mismatch. Co-edit (live with batch undo) + draft review (section-level diffs) covers the actual interaction pattern.

## What competitors do
- **GitBook:** Built "Change Requests" (own branching). Real-time collab DISABLED with Git Sync. Pick one.
- **Mintlify:** Pure git branches, no abstraction. Developer-friendly, non-technical users struggle.
- **Notion/Confluence/Outline:** No branching. Everything live, always. No isolation for iterative work.
- **v0:** Branch-per-chat. Good isolation but too rigid (can't persist across sessions).
- **Nobody combines real-time co-editing + draft isolation + git-native.** This is a gap.

## What transfers from OpenDesign
- OpenDesign research (collaborative editing literature): users strongly prefer isolation over transparent merge
- Every shipping product (Replit Agent 4, Cursor, Copilot Workspace) chose isolation for AI edits
- Four-layer defense for co-edit mode: awareness → validation → retry → soft lock
- Five-operation branching UX: create, see, switch, publish, history — no git vocabulary
- WIP refs for invisible auto-persistence within drafts

## Open questions
- **PQ9:** Should drafts be default for AI sessions or opt-in? Lean: opt-in, skills request when needed.
- Can you co-edit a draft with another person? (Later, for teams)
