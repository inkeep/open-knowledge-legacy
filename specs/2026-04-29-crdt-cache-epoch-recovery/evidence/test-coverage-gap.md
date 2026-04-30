---
title: Test Coverage Gap — Cross-Document Stale Cache Masking
description: Summarizes existing tests around commit 627a5c52 and identifies the missing regression shape for the current incident.
created: 2026-04-29
last-updated: 2026-04-29
---

# Test Coverage Gap

## Existing coverage from commit 627a5c52

### F1 — Page reload after server restart, same doc

**Confidence:** CONFIRMED

`packages/app/tests/integration/provider-pool-reconnect.test.ts:144-206` covers a page reload after server restart where the fresh pool opens the same stale document. The test asserts that the stale server ID remains in storage after the fast `/api/server-info` fetch and that opening the doc avoids duplication.

Key lines:

- `provider-pool-reconnect.test.ts:163-169` — first session syncs and expects `ok-idb-synced-server-instance-id` to equal first server ID.
- `provider-pool-reconnect.test.ts:181-192` — server restarts; second pool observes new server ID, but storage remains old server ID.
- `provider-pool-reconnect.test.ts:193-205` — opens the same `docName` and asserts no duplicated headings/links.

### F2 — Unit tests assert global marker behavior, not per-doc marker behavior

**Confidence:** CONFIRMED

`packages/app/src/editor/provider-pool.test.ts:993-1071` tests the global localStorage marker flow:

- `setExpectedServerInstanceId` does not overwrite pre-seeded storage.
- Pre-seeded storage wins over fast boot fetch on first open.
- A clean synced provider writes current server ID to storage.
- A mismatch clears stale storage but preserves fresh current ID for reconnect.

These tests encode the global marker design rather than testing branch+doc granularity.

## Missing regression

**Confidence:** INFERRED

No observed test covers this sequence:

1. Stale IDB exists for doc A and doc B.
2. Server restarts with new instance ID.
3. Opening/syncing doc A advances the global marker to the new server ID.
4. Opening doc B later should still send doc B's stale IDB-associated old server ID.
5. Current code likely sends the new global ID instead, letting doc B sync stale baseline into a fresh server Y.Doc.

## Required test shape

A regression test should fail on current HEAD and pass after fix:

- Seed two branch+doc IndexedDB databases under old server instance.
- Restart server.
- Open doc A and let recovery/sync complete.
- Verify marker advancement for doc A does not affect doc B's auth claim.
- Open doc B and assert either:
  - server rejects with `server-instance-mismatch` and client clears/recycles before sync, or
  - epoch-scoped DB naming means doc B opens a fresh DB with no stale baseline.
- Assert doc B's persisted Markdown has exactly one copy of baseline content.

## Spec implication

The implementation should add both mechanism and integration coverage:

- ProviderPool unit tests for cache marker key derivation by branch+doc.
- Integration test through real Hocuspocus server and fake-indexeddb or browser-like storage for cross-doc stale-cache masking.
- Persistence test for block/rescue tripwire when suspicious doubled content reaches `onStoreDocument`.
