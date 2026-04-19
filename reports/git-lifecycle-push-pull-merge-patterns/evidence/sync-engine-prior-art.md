# Evidence: Sync-Engine Prior Art (Update 2026-04-14)

**Dimension:** Cross-cutting — Offline affordances (R3) + Progress reporting (R5) from sync-engine apps
**Date:** 2026-04-14
**Sources:** Linear, Figma, Notion, Replit, Google Docs, Obsidian Sync (docs + blogs + reverse-engineering); simple-git, isomorphic-git, dugite, libgit2/git2-rs (source + docs)

---

## Key files / pages referenced

- [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine) — CTO-endorsed analysis
- [Linear sync engine blog](https://linear.app/blog/scaling-the-linear-sync-engine)
- [Tuomas Artman on localfirst.fm #15](https://www.localfirst.fm/15)
- [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Figma offline docs](https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma)
- [Figma incremental frame loading](https://www.figma.com/blog/incremental-frame-loading/)
- [Notion offline blog](https://www.notion.com/blog/how-we-made-notion-available-offline)
- [TechCrunch — Notion offline](https://techcrunch.com/2025/08/20/finally-notion-now-works-without-an-internet-connection/)
- [Crosis (Replit)](https://github.com/replit/crosis)
- [Google Docs offline](https://support.google.com/docs/answer/6388102?hl=en)
- [Obsidian Sync](https://obsidian.md/sync)
- [simple-git progress plugin](https://github.com/steveukx/git-js/blob/main/docs/PLUGIN-PROGRESS-EVENTS.md)
- [isomorphic-git onProgress](https://isomorphic-git.org/docs/en/onProgress)
- [git2-rs RemoteCallbacks](https://docs.rs/git2/latest/git2/struct.RemoteCallbacks.html)
- [VS Code Issue #91845](https://github.com/microsoft/vscode/issues/91845) — clone progress
- [JetBrains Background Processes SDK](https://plugins.jetbrains.com/docs/intellij/background-processes.html)
- [GitKraken progress feedback](https://feedback.gitkraken.com/suggestions/194899/more-progress-details-for-clone-merge-fetch-push-and-pull)

---

## Findings — Offline Affordances

### Finding: Linear persists transactions to IndexedDB with a 4-stage queue pipeline
**Confidence:** CONFIRMED
**Evidence:** [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)

Pipeline: `createdTransactions` → `queuedTransactions` (IndexedDB `_transaction` table) → `executingTransactions` (sent, awaiting response) → `completedButUnsyncedTransactions` (server-accepted, awaiting delta). Delta sync via monotonic `lastSyncId`. Transactions survive app restarts. Queue visibility: syncing spinner + "Offline"/"Syncing" badge top-left.

Caveat: users report "Unknown Error loading your workspace data" when reopening the Mac app without connectivity — persistent offline access requires a continuous session ([HN discussion](https://news.ycombinator.com/item?id=33583604)).

### Finding: Figma supports offline editing with IndexedDB persistence and reconnection reapply
**Confidence:** CONFIRMED
**Evidence:** [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/), [Figma offline docs](https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma)

On disconnection: continue editing, changes stored in IndexedDB. On reconnection: download fresh doc, reapply offline edits on top, resume WebSocket. Storage retention: Chrome/Firefox/Edge 30 days, Safari 7 days. Offline indicator: toolbar icons + bottom notification. Limitations: cannot open previously-created files, access unloaded pages, receive collaborator updates.

### Finding: Notion shipped offline in August 2025 using SQLite + CRDT migration
**Confidence:** CONFIRMED
**Evidence:** [Notion blog](https://www.notion.com/blog/how-we-made-notion-available-offline), [TechCrunch](https://techcrunch.com/2025/08/20/finally-notion-now-works-without-an-internet-connection/)

Desktop + mobile only (not browser). Pages explicitly marked "available offline" are migrated to CRDT data model. SQLite tables: `offline_page`, `offline_action`. Push-based sync per-page channels. Conflict resolution: CRDT auto-merge for text; "Conflict" duplicate pages for non-text. Database offline limited to first 50 rows.

### Finding: Replit (Crosis/Goval) has no offline mode — OT requires active server connection
**Confidence:** CONFIRMED
**Evidence:** [Crosis GitHub](https://github.com/replit/crosis), [Replit multiplayer blog](https://blog.replit.com/multi)

Channel-based WebSocket protocol. Docs explicitly state developers must choose between "disabling UI elements" or "local buffering strategies." Multiple community reports of persistent disconnection/reconnection issues. No offline feature request implemented.

### Finding: Google Docs offline uses operation-log-based reconciliation with OT transformation
**Confidence:** CONFIRMED
**Evidence:** [Google Docs offline help](https://support.google.com/docs/answer/6388102?hl=en), [Medium analysis](https://medium.com/@tnale/the-invisible-engine-how-google-docs-syncs-your-offline-edits-28896ea0ab09)

Requires Chrome extension + opt-in. Every offline change logged with timestamp + version reference. Reconnection: 4-step OT reconciliation (upload → compare → transform → broadcast). Chrome/Edge only, one account per profile.

### Finding: Obsidian Sync uses diff-match-patch three-way merge — architecturally distinct from Obsidian-Git
**Confidence:** CONFIRMED
**Evidence:** [Obsidian Sync docs](https://obsidian.md/sync), [Forum](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544)

First-party paid service ($4/month). E2E encryption. Markdown: diff-match-patch auto-merge. Non-markdown: last-modified-wins. v1.9.7+: configurable "Create conflict file" option. Fully offline-first by design (local files are the source of truth; sync is overlay).

### Finding: Git editors have zero offline affordances — confirmed universally primitive
**Confidence:** CONFIRMED
**Evidence:** VS Code, GitHub Desktop, JetBrains, GitKraken, lazygit, Obsidian-Git investigation

No editor queues operations when offline. No editor provides retry with backoff. The sole exception: Obsidian-Git's timed auto-commit/push retries on the next interval (naive timer, not exponential backoff). isomorphic-git local operations (commit, status) work fine offline; network operations (fetch, push) throw with no retry/queue.

---

## Findings — Progress Reporting

### Finding: Four git libraries provide progress with varying API quality
**Confidence:** CONFIRMED
**Evidence:** simple-git docs, isomorphic-git docs, dugite source, git2-rs docs

| Library | API | Data | Quality |
|---------|-----|------|---------|
| simple-git | `SimpleGitProgressEvent` callback | method + stage + progress (0-100) | Cleanest |
| isomorphic-git | `onProgress` callback | phase + loaded + total (total may be 0) | Weakest — indeterminate phases, no aggregation |
| dugite | Parses native git `--progress` stderr | Raw strings (percentage, counts, speed) | Fragile (stderr parsing) |
| libgit2/git2-rs | `RemoteCallbacks` typed callbacks | `Progress` struct (objects, bytes) + sideband | Most granular |

### Finding: Only JetBrains and Sublime Merge provide both percentage display AND cancel buttons
**Confidence:** CONFIRMED
**Evidence:** JetBrains SDK docs, VS Code Issue #91845, GitKraken feedback, Sublime Merge docs

| Editor | Progress | Cancel | Operations |
|--------|----------|--------|-----------|
| VS Code | Percentage (clone only), spinner (others) | No | Clone |
| GitHub Desktop | Percentage (clone), rotating circle | No | Clone, LFS |
| JetBrains | `setFraction(0.0-1.0)` + `setText()` | Yes (`checkCanceled()`) | Push, pull, fetch, checkout, merge |
| Sublime Merge | Progress bar | Yes ("x" button) | Push, merge |
| lazygit | No progress bar | `Esc` (limited) | Push, pull |
| GitKraken | Rotating circle | No | Clone, push, pull |

### Finding: Git operations are safe to interrupt — push is server-confirmed, fetch writes atomically
**Confidence:** CONFIRMED
**Evidence:** git internals, [git-users discussion](https://git-users.narkive.com/KoZLeEOC/restarting-interrupted-git-operations-clone-fetch-push-update-etc)

Push: ref not updated locally until server confirms. Fetch: temporary packfiles renamed atomically on completion; SIGINT leaves temps for GC. Clone: partial `.git/` persists; not resumable through any editor UI. No editor provides cleanup beyond what git itself handles.

### Finding: Cross-domain progress patterns converge on single aggregate indicator with phase labels
**Confidence:** INFERRED
**Evidence:** Figma incremental loading, npm/pnpm reporters, Docker pull issues, VS Code extension progress

Effective UX: (1) single aggregate indicator, (2) phase labels, (3) determinate percentage when possible. Docker's per-layer approach is widely seen as an anti-pattern ([moby issue #4022](https://github.com/moby/moby/issues/4022)). Git's multi-phase output maps well to phase labels but no editor aggregates into a single percentage.

---

## Gaps / follow-ups

- No git editor ETA estimates — even npm/yarn provide rough speed indicators
- Figma's incremental frame loading (progressive enhancement during load) has no git-editor equivalent
- git-annex's resumable operations are the strongest prior art for interrupted-operation recovery in the git ecosystem
