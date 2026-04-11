---
title: "provider-pool.ts setupObservers init-time call trace"
type: raw-proof
sources:
  - packages/app/src/editor/provider-pool.ts
  - packages/app/src/editor/DocumentContext.tsx
  - packages/app/src/editor/provider-pool.test.ts
created: 2026-04-11
baseline-commit: 48d8f04
superseded-baseline: 2d35736 (line refs shifted +5 by PR #56 — see "PR #56 drift audit" below)
---

## TLDR

`setupObservers()` is called synchronously at `provider-pool.ts:105-114` (inside the `onSynced` event handler declared at line 97) in baseline `48d8f04`. Was at lines 100-109 in `2d35736`; shifted +5 by PR #56 (which added `hasSynced`/`tearingDown` fields and event-handler guards). If it throws, the error propagates up into HocuspocusProvider's internal event emitter and disappears — no caller sees it. The provider remains cached in the pool with `observerCleanup: null`; future lookups return the broken entry permanently until page reload or pool disposal. The existing `onSyncError` callback handles *runtime* sync errors (caught inside observer bodies after setup succeeds); the init-time throw is a separate failure mode that `onSyncError` does not cover. **PR #56 integration: S4's fix composes cleanly with the new `tearingDown` mechanism — destroy+evict in S4's catch path automatically propagates the `tearingDown = true` flag via `destroyEntry()`, suppressing any late-firing event handlers on the already-torn-down entry.**

## Detail

### The call site (baseline `48d8f04`, post-PR-56)

**CONFIRMED** — `packages/app/src/editor/provider-pool.ts:97-116`:

```typescript
const onSynced = () => {
  if (entry.tearingDown || this.entries.get(docName) !== entry) return;  // NEW (PR #56) — suppresses events on torn-down entries
  entry.syncState = 'synced';
  entry.hasSynced = true;  // NEW (PR #56) — used by onDisconnect's recycleDisconnectedEntry path
  this.notify();

  // Set up bidirectional observers once after first sync
  if (!entry.observerCleanup) {
    const doc = provider.document;
    const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
    entry.observerCleanup = setupObservers({
      doc,
      xmlFragment: doc.getXmlFragment('default'),
      ytext: doc.getText('source'),
      mdManager: mdMgr,
      schema: editorSchema,
      onSyncError: (direction, error) => {
        console.warn(`[Sync] ${direction} failed for ${docName}:`, error.message);
      },
    });
  }
};
```

Registered via `provider.on('synced', onSynced)` at line 123 (was 118 pre-PR-56).

### PR #56 drift audit (new section added 2026-04-11 post-migration)

PR #56 ("Prevent whole-document duplication after server restart") added 42 lines to `provider-pool.ts` between our baseline (`2d35736`) and the new worktree's base (`48d8f04`). Changes relevant to S4:

1. **`PoolEntry` interface gained two fields** (lines 14-15):
   ```typescript
   hasSynced: boolean;
   tearingDown: boolean;
   ```

2. **All three event handlers (`onStatus`, `onSynced`, `onDisconnect`) got a top guard:**
   ```typescript
   if (entry.tearingDown || this.entries.get(docName) !== entry) return;
   ```
   This is the entry-identity check: if the entry has been replaced in the pool (e.g., by recycle) or flagged for teardown, the handler is a no-op.

3. **`onDisconnect` got a new `recycleDisconnectedEntry` path:**
   ```typescript
   if (entry.hasSynced && provider.unsyncedChanges === 0) {
     this.recycleDisconnectedEntry(docName);
   }
   ```
   Only fires if the entry had reached `synced` state AND has no buffered local-only edits. Tears down the entry and re-opens a fresh one.

4. **`destroyEntry()` was hardened (lines 209-220):**
   ```typescript
   private destroyEntry(entry: PoolEntry): void {
     entry.tearingDown = true;  // NEW
     entry.observerCleanup?.();
     entry.observerCleanup = null;
     try {
       entry.provider.destroy();
     } catch (err) {
       console.warn(`[ProviderPool] Provider destroy failed for ${entry.docName}:`, err);
     }
   }
   ```

5. **New `recycleDisconnectedEntry(docName)` method** at lines 222-237 — mirrors `close()`'s teardown but optionally re-opens if the recycled entry was active.

**Consequences for S4's fix:**

| Concern | Pre-PR-56 | Post-PR-56 |
|---|---|---|
| Late-firing event handlers after S4's destroy+evict | Possible latent bug (reconnect storm → spurious re-fire → partial observer state) | **Suppressed by `tearingDown` guard** — S4's call to `destroyEntry()` automatically sets the flag |
| Error inside `provider.destroy()` during S4's teardown | Unhandled, could escape S4's catch | **Caught by `destroyEntry`'s own try/catch** |
| Race with `recycleDisconnectedEntry` | N/A (method didn't exist) | **No race:** S4's path fires during `onSynced` before `onDisconnect`; even if both fired, both route through `destroyEntry` which is idempotent via `tearingDown` |

**Net effect: S4's fix is structurally identical but its runtime integration is more robust after PR #56.** No changes to the spec's planned code shape — just line numbers shift and the rationale/interaction note gets richer.

### Failure mode analysis

When `setupObservers()` throws synchronously (e.g., `updateYFragment` fails during initial sync, schema mismatch, malformed persisted state):

1. The throw propagates out of `onSynced` into HocuspocusProvider's internal event emitter.
2. HocuspocusProvider is built on `mitt` / `Emittery` semantics (need to verify) — listener exceptions in emitters typically are either swallowed silently or re-emitted as 'error' events. Neither path is caught by this pool.
3. `entry.syncState` was already set to `'synced'` at line 93 (before the setup call).
4. `entry.observerCleanup` stays `null`.
5. `entry.notify()` was already called at line 94.
6. The entry remains in `this.entries` and `this.lruOrder`.
7. Subsequent `open(docName)` calls hit the `existing` early return at line 60 and return the broken entry forever.
8. The active document's Y.Doc has no observers — WYSIWYG↔source sync is silently broken.
9. From the React context's perspective, `syncState === 'synced'` so the editor shows as "ready" but neither edit surface updates the other.

### The `if (!entry.observerCleanup)` guard (line 97)

The guard exists so that if `onSynced` fires multiple times (unusual but possible — e.g., reconnect after disconnect), `setupObservers` only runs once. If the first call throws partway through (some observers attached, then error), `observerCleanup` stays null and a subsequent `onSynced` fire would attempt setup again — potentially stacking partial observer state.

This is a second-order concern: in practice, `onSynced` fires once per connection lifecycle. But it's a latent footgun that a retry loop during reconnect storms could hit.

### `destroyEntry` semantics — exists as cleanup pattern (PRE-PR-56)

**Pre-PR-56 form (`2d35736`, lines 193-198)** — preserved here for historical context:

```typescript
private destroyEntry(entry: PoolEntry): void {
  // Observer cleanup first (observers reference Y.Doc state), then full teardown
  entry.observerCleanup?.();
  entry.observerCleanup = null;
  entry.provider.destroy(); // destroy() disconnects + removes all listeners + awareness cleanup
}
```

Used by `close()` (line 133) and `dispose()` (line 174) and `evictLru()` indirectly via `close()`. This is the pattern S4 should reuse for init-throw recovery: call `destroyEntry(entry)` to tear down cleanly.

### Consumers of the pool

**CONFIRMED** — single consumer: `packages/app/src/editor/DocumentContext.tsx:19-24`:

```typescript
let pool: ProviderPool | null = null;
function getPool(): ProviderPool {
  if (!pool) {
    pool = new ProviderPool(10);
  }
  return pool;
}
```

Consumed by React's DocumentProvider via `openDocument(docName)` (line 78), which calls `pool.open(docName)` then `pool.setActive(docName)`. The `open()` call returns a `PoolEntry` which is not used directly — React subscribes to state changes via `setOnChange` callback.

Implication: after a failed setup, React state shows `syncState: 'synced'` but no observer is wired. **There is no existing consumer path that checks `entry.observerCleanup`**. If S4 adds an `'error'` sync state, it becomes a new contract visible to consumers; if S4 destroys+evicts silently, consumers see the previously-active document disappear and would need to re-open it (the LRU close path already handles this via `onChange → setSnapshot`).

### Existing test coverage

**CONFIRMED** — `provider-pool.test.ts` (194 lines) covers:
- Empty pool semantics, `open()` creating entries, LRU eviction order
- Active-doc protection during eviction
- `close()`, `dispose()` lifecycle
- `setOnChange()` notifications

**NOT FOUND** — no test exercises the `onSynced` callback or `setupObservers()` throw path. The test file uses `DUMMY_WS = 'ws://localhost:1/collab'` so providers never actually connect, meaning `onSynced` never fires in tests. This is a gap but an intentional one — the tests are about pool mechanics, not observer lifecycle.

## Implications

1. **The init-throw path is genuinely unguarded** — the onSyncError callback handles runtime errors (mid-sync failures after setup succeeds), NOT init errors during `setupObservers()` itself.

2. **Destroy-and-evict is the right recovery** because it matches the existing `destroyEntry` pattern used by `close()`, `dispose()`, and `evictLru()`. Consumers already handle entries disappearing from the pool via the `onChange` notification path.

3. **Adding a new `'error'` syncState is possible but invasive** — no existing consumer checks for it, so the entire DocumentContext → editor render chain would need updates. Destroy-and-evict is simpler and doesn't change the public contract.

4. **The test gap is specific: no test exercises `onSynced`.** The existing `provider-pool.test.ts` uses a dummy WS URL that never connects. Testing S4's fix requires either (a) mocking/injecting `setupObservers` to force a throw, or (b) using a real Hocuspocus server. Option (a) is cleaner — we can test by stubbing `setupObservers` in a test-only subclass or exporting the pool's internals for test access.

## Pointers

- `packages/app/src/editor/provider-pool.ts:92-111` — the unguarded call site
- `packages/app/src/editor/provider-pool.ts:193-198` — destroyEntry pattern to reuse
- `packages/app/src/editor/DocumentContext.tsx:17-24` — singleton pool consumer
- `packages/app/src/editor/provider-pool.test.ts` — existing test patterns (LRU, lifecycle)
- `packages/app/src/editor/observers.ts:setupObservers` — the function that may throw

## Gaps / follow-ups

- Have not verified whether `setupObservers()` can actually throw synchronously on any realistic input. The function is a ~500-line module with complex observer attachment logic. A concrete reproduction case would be valuable for S4 test design — if the setup is so robust it can't throw in practice, S4 becomes defensive-only.
- Have not verified the `onSynced` re-fire semantics during reconnect. The `if (!entry.observerCleanup)` guard assumes re-fires are rare and benign, but the partial-setup-throw case creates a latent issue.
