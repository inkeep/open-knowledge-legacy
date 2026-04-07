---
title: "Auto-persistence architecture — transferred from OpenDesign"
type: synthesis
created: 2026-04-02
---

## TLDR
Users never think about saving or git. Three-tier architecture: invisible crash recovery (CRDT → filesystem, 2-10s), invisible auto-commits (WIP refs, 30-60s), visible named checkpoints (user-initiated). Git is the durability layer but the user's mental model is Figma/Notion — continuous editing, no "save" button.

## The three tiers

| Tier | Mechanism | Frequency | User sees |
|---|---|---|---|
| Crash recovery | CRDT → filesystem via Hocuspocus | Every 2-10s | Nothing |
| Granular history | Auto-commits to WIP refs (`refs/wip/<writer>/<branch>`) | Every 30-60s idle | Nothing (collapsed in timeline) |
| Named checkpoints | Squash to main + annotated tag | User action, AI completion, session end | Prominent timeline entry |

## Key decisions (from OpenDesign Reports 44-46)

1. **Auto-commits go to WIP refs** — invisible to `git branch`, `git log`, GitHub. Per-writer refs eliminate contention.
2. **Commit trigger is Hocuspocus `afterStoreDocument` hook** — NOT filesystem watchers (race conditions). Provides attribution metadata.
3. **Debounce: 30s idle / 60s max.** Balances history granularity vs commit volume.
4. **Named checkpoints via `git merge --squash` + annotated tag.** Clean single commit on main.
5. **Attribution: human = author, system = committer.** Downstream compatibility.
6. **No in-app merge resolution.** Defer to GitHub PR UI. Abstract built it and it was their biggest pain point.
7. **Five git operations for non-technical users:** Create branch ("Start experiment"), see branch (always visible label), switch branch (dropdown), publish (= PR, never called "Pull Request"), view history (timeline).
8. **Never use git terminology in UI.** No checkout, merge, rebase, pull request.

## Timeline UX

```
Today
  [Named] "Updated deployment guide" — Edwin, 2:30 PM
    Auto-save 2:28 PM — updated deployment-guide.md
    Auto-save 2:25 PM — created troubleshooting.md
  [Named] "AI: Compiled architecture articles" — Claude (via MCP), 1:45 PM
    Auto-save 1:44 PM — generated auth-system.md, api-reference.md
  [Auto-group] Morning session (9:00 AM - 12:15 PM)
    23 auto-saves (click to expand)
```

## Implications for knowledge base product
- No "save" button anywhere in the UI
- Git operations hidden behind action-oriented language
- Version history is a timeline, not a commit log
- Auto-commits and named checkpoints are separate concerns
- Multi-writer attribution distinguishes human edits from agent edits
- Same architecture works for single-player (local git) and multiplayer (remote git)
