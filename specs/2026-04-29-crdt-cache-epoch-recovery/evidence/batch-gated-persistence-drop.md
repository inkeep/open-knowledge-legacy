---
title: Batch-Gated Persistence Drop Trace
description: Evidence that CRDT-to-disk persistence can be dropped when onStoreDocument fires during a git batch window.
created: 2026-04-29
last-updated: 2026-04-29
---
# Batch-Gated Persistence Drop Trace

## Findings

### F1 — Live CRDT state diverged from disk

**Confidence: CONFIRMED**

The live server document for `.changeset/init-gitignore-consolidation` contained the user's latest line `asass!!!!!!!!!!!!!!!`, while the disk file still contained `asass!!`.

Sources:

- Live server query: `GET /api/document?docName=.changeset/init-gitignore-consolidation` returned content ending with `asass!!!!!!!!!!!!!!!`.
- Disk read through Open Knowledge MCP returned `.changeset/init-gitignore-consolidation.md` ending with `asass!!`.

Implication: browser refresh survival was coming from live server/client CRDT state, not from successful Markdown persistence.

### F2 — The server had not emitted any disk-ack state vectors

**Confidence: CONFIRMED**

`GET /api/server-info` returned `currentDiskAckSVs: {}` for the live server instance while the document was dirty in memory.

Implication: the server had accepted and retained CRDT state, but no successful L1 disk write had advanced the disk durability watermark.

### F3 — The head watcher was repeatedly opening short `index.lock` batches

**Confidence: CONFIRMED**

The user-provided server log showed repeated batches:

```text
[batch] begin trigger=index.lock
[batch] end kind=within-branch headMoved=false docs=0
```

`headMoved=false` and `docs=0` indicate no branch transition and no buffered Markdown file events. This shape is consistent with frequent Git index refreshes rather than a user-visible checkout/rebase.

Source references:

- `packages/server/src/head-watcher.ts` watches `index.lock` alongside `HEAD`, `MERGE_HEAD`, and `ORIG_HEAD`.
- `packages/server/src/standalone.ts` sets `batchInProgress(true)` on batch begin and clears it on batch end.

### F4 — `onStoreDocument` currently drops stores that fire during a batch

**Confidence: CONFIRMED**

`packages/server/src/persistence.ts` returns immediately when `isBatchInProgress()` is true at the top of `onStoreDocument`.

Current behavior shape:

```ts
if (isSystemDoc(documentName)) return;
if (isBatchInProgress()) return;
```

There is no observed replay queue for skipped CRDT-to-disk stores. `standalone.ts` drains buffered disk events after a within-branch batch, but that buffer covers disk→CRDT watcher events, not skipped CRDT→disk stores.

Implication: if the Hocuspocus store debounce fires during an `index.lock` batch, the Markdown write can be lost until another non-skipped mutation happens.

### F5 — Shadow repo init fails in worktrees, but that is a separate L2/history issue

**Confidence: CONFIRMED**

The log showed `ENOTDIR: not a directory, mkdir '<worktree>/.git/open-knowledge'`. In a Git worktree, `.git` is a pointer file, not a directory. Shadow repo initialization currently assumes `<projectRoot>/.git/open-knowledge` is creatable.

Implication: this explains degraded shadow history/attribution in this worktree, but does not explain L1 Markdown write loss by itself. The immediate disk persistence issue is the batch-gated `onStoreDocument` early return.

## Root-cause hypothesis

**Confidence: HIGH**

The reported live/disk divergence is caused by a CRDT-to-disk store firing while `batchInProgress` was true. The store returned early and was not rescheduled. Frequent `index.lock` batches made this likely during normal editing.

This hypothesis explains all observed symptoms:

- Mutations arrived in the live Y.Doc.
- Refresh preserved the text because the server/client CRDT state still had it.
- Disk did not change because L1 persistence did not complete.
- `currentDiskAckSVs` stayed empty because successful disk writes are what emit disk-ack watermarks.
- The log showed many short `index.lock` batches around the edit window.
