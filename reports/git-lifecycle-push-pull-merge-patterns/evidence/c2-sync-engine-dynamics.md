# Evidence: Sync-Engine App Scheduling + Queue Dynamics

**Dimension:** Sync-Engine Apps — scheduling, reconnection, queue management
**Date:** 2026-04-15
**Sources:** Linear (reverse-engineering + blog), Figma (blog), Notion (blog + docs), Replit (crosis), Obsidian Sync (docs), Google Docs (community analysis)

---

## Key files / pages referenced

- [wzhudev/reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine) — CTO-endorsed reverse engineering
- [Scaling the Linear Sync Engine](https://linear.app/blog/scaling-the-linear-sync-engine) — official architecture overview
- [marknotfound reverse engineering](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/) — independent analysis
- [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — Evan Wallace
- [Making multiplayer more reliable](https://www.figma.com/blog/making-multiplayer-more-reliable/) — WAL journal details
- [How we made Notion available offline](https://www.notion.com/blog/how-we-made-notion-available-offline) — SQLite + CRDT migration
- [replit/crosis](https://github.com/replit/crosis) — WebSocket protocol client
- [Obsidian Sync forum](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544) — conflict resolution details

---

## Findings

### Finding: Linear uses microtask batching — changes within the same JS event loop share a batchIndex
**Confidence:** CONFIRMED
**Evidence:** [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)

`commitCreatedTransactions` is a microtask that moves transactions from `createdTransactions` → `queuedTransactions`. A separate `dequeueTransaction` scheduler controls when batches are sent to the server, subject to GraphQL mutation size limits. Not per-change, not polling — event-loop microtask grouping.

### Finding: Linear's 4-stage queue persists to IndexedDB — transactions survive browser restart
**Confidence:** CONFIRMED
**Evidence:** [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)

Four named queues: `createdTransactions` → `queuedTransactions` (persisted to IndexedDB `__transactions` table) → `executingTransactions` → `completedButUnsyncedTransactions`. Transactions move forward unidirectionally. Model tables store confirmed-only state. Unconfirmed mutations live only in `__transactions`.

### Finding: Linear reconnection uses lastSyncId delta catch-up, not full re-download
**Confidence:** CONFIRMED
**Evidence:** [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)

On reconnect, client compares local `lastSyncId` vs server, fetches only missing delta packets. In-flight `executingTransactions` are replayed from `queuedTransactions`.

### Finding: Figma sends batched updates at 33ms / 30 FPS tick rate
**Confidence:** CONFIRMED
**Evidence:** [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

Client accumulates changes and flushes as a single frame every 33ms. Server journals entries with `start_sequence_number` / `end_sequence_number` fields, further batching.

### Finding: Figma reconnection uses full re-download + local replay, not incremental catch-up
**Confidence:** CONFIRMED
**Evidence:** [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

On reconnect: download fresh document, reapply offline edits on top, resume WebSocket. Anti-flicker: client tracks unacknowledged property changes and refuses to overwrite them with incoming server deltas carrying older `sequence_number`.

### Finding: Figma server uses WAL journal + 30-60s S3 checkpoints
**Confidence:** CONFIRMED
**Evidence:** [Making multiplayer more reliable](https://www.figma.com/blog/making-multiplayer-more-reliable/)

Server WAL journal with sequence numbers. Checkpointing (full binary snapshot to S3) every 30-60s. Journal covers the gap since last checkpoint. Up to 30s of changes at risk in worst-case server crash.

### Finding: Notion offline uses SQLite with 15s autosave cadence and edit-count badge
**Confidence:** CONFIRMED
**Evidence:** [Notion offline blog](https://www.notion.com/blog/how-we-made-notion-available-offline), [Notion help guides](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know)

SQLite local store survives reboot. Autosave every 15 seconds. UI shows "Offline" banner + "N edits to sync" badge + green "Synced" indicator after drain. Reconnection uses timestamp comparison (`lastDownloadedTimestamp` vs server `lastUpdatedTime`).

### Finding: Notion uses push-based subscriptions, not polling
**Confidence:** CONFIRMED
**Evidence:** [Notion offline blog](https://www.notion.com/blog/how-we-made-notion-available-offline)

Clients subscribe to per-page channels. Messages trigger fetches. On reconnect: timestamp comparison decides re-fetch necessity. No polling cadence.

### Finding: Google Docs offline logs operations with timestamps; server applies OT on reconnect
**Confidence:** CONFIRMED
**Evidence:** [Medium — The Invisible Engine](https://medium.com/@tnale/the-invisible-engine-how-google-docs-syncs-your-offline-edits-28896ea0ab09)

Ordered operation log stored locally during offline. On reconnect: upload change log, server applies OT transformation against concurrent edits, broadcasts reconciled state. Not designed for concurrent multi-author offline.

### Finding: Obsidian Sync syncs on file-save events, not continuously — with diff-match-patch merge for markdown
**Confidence:** CONFIRMED
**Evidence:** [Obsidian Sync forum](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544)

Not real-time. Syncs on file-save. Markdown: 3-way merge via diff-match-patch. Other files: last-modified-wins (destructive). Notes created on two devices within a short window trigger LWW instead of merge.

### Finding: Replit/crosis leaves queue management to the application layer
**Confidence:** CONFIRMED
**Evidence:** [replit/crosis README](https://github.com/replit/crosis)

Crosis exposes connection state + lifecycle callbacks (`willReconnect`). "How you handle this is up to you" — no canonical queue or retry.

---

## Cross-Tool Patterns

1. **Optimistic local application is universal** — all apply changes locally before server confirmation
2. **Conflict detection at boundary, not at write time** — Linear: server ack; Figma: ack boundary; Notion: reconnect timestamp; Google Docs: server OT
3. **Reconnection bifurcates: incremental catch-up (Linear, Google Docs) vs full re-download + replay (Figma, Notion)**
4. **Queue persistence correlates with conflict model** — durable queues (Linear IndexedDB, Notion SQLite) vs ephemeral (Figma re-download)
5. **Batching window matched to interaction model** — issue tracker: event-loop microtask; design: 33ms tick; notes: 15s autosave

---

## Gaps / follow-ups

- Linear reconnection backoff timing not documented in public sources
- Figma offline edit persistence mechanism not officially confirmed (30-day IndexedDB retention is community-sourced)
- Replit/crosis reconnection backoff curve not published
- Obsidian Sync scheduling internals (exact cadence) not documented
