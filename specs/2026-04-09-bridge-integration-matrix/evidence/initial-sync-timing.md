---
name: initial-sync-timing
description: OQ10 investigation — onLoadDocument → client initial sync has no timing gap vulnerability
type: factual
sources:
  - packages/server/src/persistence.ts
  - packages/app/src/editor/observers.ts
  - node_modules/@hocuspocus/server (Hocuspocus lifecycle)
---

# OQ10: Initial Sync Timing — No Vulnerability

**Finding: SAFE BY DESIGN. No timing gap exists.**

1. **Server `onLoadDocument` completes before any client sync.** The client's SyncStep1 is queued while `createDocument` runs; queue flushes only after `await createDocument()` resolves (hocuspocus `setUpNewConnection`).

2. **Y.Text intentionally left empty by server.** `persistence.ts:136-162` only populates XmlFragment + metadata. Y.Text is a client-side concern.

3. **Observer A initial sync is atomic.** After client receives server state → `provider.synced = true` → `setupObservers()` → finds `xmlFragment.length > 0 && ytext.length === 0` → populates Y.Text in one transaction. Entire chain is synchronous — no observable intermediate state.

4. **Two simultaneous clients don't collide.** Server deduplicates via `loadingDocuments` Promise cache. Client-side `ytext.length === 0` guard prevents double-inserts.

**Status:** RESOLVED — add US-018 (initial sync test) as a coverage improvement, not a bug fix.
