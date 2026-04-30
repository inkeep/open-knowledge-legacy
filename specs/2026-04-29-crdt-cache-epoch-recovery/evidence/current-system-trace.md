---
title: Current System Trace — CRDT Cache Epoch Recovery
description: Traces the current server/client persistence, auth, and recovery paths relevant to stale browser CRDT state duplicating Markdown-rebuilt server Y.Docs.
created: 2026-04-29
last-updated: 2026-04-29
---

# Current System Trace

## Findings

### F1 — Server reconstructs Y.Doc state from Markdown on load

**Confidence:** CONFIRMED

`packages/server/src/persistence.ts` loads disk Markdown in `onLoadDocument`, parses it, and populates an empty `Y.XmlFragment` using `updateYFragment`.

Sources:

- `packages/server/src/persistence.ts:633-646` — `onLoadDocument` obtains `documentName`, resolves `safeContentPath`, returns if file absent.
- `packages/server/src/persistence.ts:664-691` — reads raw Markdown, strips frontmatter, parses body with `mdManager.parseWithFallback`.
- `packages/server/src/persistence.ts:673-701` — obtains `document.getXmlFragment('default')`; if empty, creates PM node from JSON and calls `updateYFragment`.
- `packages/server/src/persistence.ts:679-683` — inline comment states: “Markdown is the sole source of truth” and restart recovery is client-side.

Implication: after a server restart/unload, the server creates fresh Yjs item identities for content that may already exist in browser IndexedDB under old item identities.

### F2 — Server-side unload suppression from commit 627a5c52 addresses one restart/unload path

**Confidence:** CONFIRMED

`packages/server/src/standalone.ts` overrides `hocuspocus.shouldUnloadDocument` so normal user docs remain resident unless shutdown or explicit force-unload allows unload.

Sources:

- `packages/server/src/standalone.ts:346-351` — comment identifies the unsafe sequence: browser refresh keeps durable client copy; server rebuilds fresh Y.Doc from Markdown; next sync union-merges both item sets and duplicates document.
- `packages/server/src/standalone.ts:352-355` — `shouldUnloadDocument` returns true only when `shutdownAllowsUnload` or `forceUnloadSet.has(document)` plus default Hocuspocus condition.

Implication: this reduces automatic unload-induced duplication, but it does not address all stale browser IDB cases after server restart or across per-document caches.

### F3 — Client IndexedDB database name is branch + document

**Confidence:** CONFIRMED

`packages/app/src/editor/client-persistence.ts` constructs one IndexedDB persistence database per `{branch, docName}`.

Sources:

- `packages/app/src/editor/client-persistence.ts:105-108` — `_dbName = ok-ydoc:${branch}:${docName}` and new `IndexeddbPersistence(this._dbName, doc)`.
- `packages/app/src/editor/provider-pool.ts:846-860` — ProviderPool creates client persistence with current observed branch and docName.

Implication: stale Yjs state is scoped per branch+doc, not globally.

### F4 — The server-instance marker associated with IDB is global

**Confidence:** CONFIRMED

The marker introduced by commit `627a5c52` uses one localStorage key for all docs and branches.

Sources:

- `packages/app/src/editor/provider-pool.ts:194` — `const IDB_SYNCED_SERVER_INSTANCE_ID_KEY = 'ok-idb-synced-server-instance-id';`
- `packages/app/src/editor/provider-pool.ts:546-557` — `getOrInitIdbSyncedServerInstanceId()` reads that single key.
- `packages/app/src/editor/provider-pool.ts:565-577` — `persistIdbSyncedServerInstanceId()` writes/removes that single key.
- `packages/app/src/editor/provider-pool.ts:579-580` — provider auth source is `idbSyncedServerInstanceId ?? cachedServerInstanceId`.

Implication: one document syncing cleanly can update the server-instance marker used by every other document, even though their IDB databases are distinct.

### F5 — A clean sync writes current live server ID to the global marker

**Confidence:** CONFIRMED

When a provider emits `synced`, ProviderPool captures the Y.Doc state vector and persists `cachedServerInstanceId` to the global marker.

Sources:

- `packages/app/src/editor/provider-pool.ts:885-898` — on `synced`, sets `entry.lastServerSyncedSV`; if `cachedServerInstanceId !== null`, calls `persistIdbSyncedServerInstanceId(this.cachedServerInstanceId)`.

Implication: doc A can overwrite the marker after syncing with a fresh server, even if doc B's IndexedDB database still contains stale CRDT items from the old server epoch.

### F6 — Server rejects mismatched instance claims before sync

**Confidence:** CONFIRMED

Server auth rejects non-empty `expectedServerInstanceId` claims that differ from the current process instance ID.

Sources:

- `packages/server/src/standalone.ts:398-404` — parses auth token.
- `packages/server/src/standalone.ts:406-421` — compares `parsed?.expectedServerInstanceId` with `serverInstanceId`; throws `HocuspocusAuthRejection('server-instance-mismatch', ...)` on mismatch.

Implication: the mechanism is sound when the client sends the stale instance ID associated with the exact IDB content being hydrated. It fails if a global marker has already been advanced by another doc.

### F7 — Mismatch recovery already uses buffer → clearData → recycle ordering

**Confidence:** CONFIRMED

ProviderPool's mismatch handler buffers unsynced deltas relative to a trusted state vector, clears IndexedDB, then recycles entries.

Sources:

- `packages/app/src/editor/provider-pool.ts:1119-1122` — snapshots entries before async work.
- `packages/app/src/editor/provider-pool.ts:1144-1171` — chooses baseline `lastDiskAckedSV ?? lastServerSyncedSV`, computes unsynced update, stores buffer when non-empty.
- `packages/app/src/editor/provider-pool.ts:1174-1193` — clearData gating before recycle.
- `packages/app/src/editor/provider-pool.ts:1196-1250` — partial failures recycle only cleared entries; all-clear path recycles all entries.
- `packages/app/src/editor/provider-pool.ts:1070-1102` — fresh provider replays buffered update once after `synced` via `Y.applyUpdate(..., TAB_REPLAY_ORIGIN)`.

Implication: buffer-and-replay is the right conceptual shape; the suspected bug is stale-cache detection/keying, not the broad ordering.

### F8 — Persistence warns on possible duplication but still writes

**Confidence:** CONFIRMED

`onStoreDocument` logs a warning when serialized Markdown is >1.5x current base length, then proceeds to write the file.

Sources:

- `packages/server/src/persistence.ts:823-833` — warning logs markdown length/base length and fragment children.
- `packages/server/src/persistence.ts:881-884` — writes temp file and renames it to canonical path after the warning block.

Implication: the latest incident was detected by existing warning logic but not prevented.

## Working hypothesis

**Confidence:** INFERRED

The remaining duplication hole is likely cross-document marker masking:

1. Browser has stale branch+doc IndexedDB databases for multiple docs.
2. Server restarts and gets a new server instance ID.
3. Opening one stale doc triggers recovery or otherwise syncs cleanly.
4. Clean sync writes the current server ID to the one global `ok-idb-synced-server-instance-id` marker.
5. Opening another stale doc uses the current server ID claim, so server auth accepts and Yjs sync merges stale baseline items into the Markdown-rebuilt server doc.

This hypothesis matches the user-provided incident shape (several `.changeset/*` docs opened before `.changeset/README` duplicated) and the current keying mismatch (per-doc IDB, global marker). It still needs a targeted failing regression test for confirmation.
