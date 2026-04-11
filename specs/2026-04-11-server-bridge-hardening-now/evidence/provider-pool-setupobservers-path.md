---
title: "provider-pool.ts setupObservers init-time call trace"
type: raw-proof
sources:
  - packages/app/src/editor/provider-pool.ts
  - packages/app/src/editor/DocumentContext.tsx
  - packages/app/src/editor/provider-pool.test.ts
created: 2026-04-11
baseline-commit: 2d35736
---

## TLDR

`setupObservers()` is called synchronously at `provider-pool.ts:100-109` inside the `onSynced` event handler. If it throws, the error propagates up into HocuspocusProvider's internal event emitter and disappears — no caller sees it. The provider remains cached in the pool with `observerCleanup: null`; future lookups return the broken entry permanently until page reload or pool disposal. The existing `onSyncError` callback handles *runtime* sync errors (caught inside observer bodies after setup succeeds); the init-time throw is a separate failure mode that `onSyncError` does not cover.

## Detail

### The call site

**CONFIRMED** — `packages/app/src/editor/provider-pool.ts:92-111`:

```typescript
const onSynced = () => {
  entry.syncState = 'synced';
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

Registered via `provider.on('synced', onSynced)` at line 118.

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

### `destroyEntry` semantics — exists as cleanup pattern

**CONFIRMED** — `provider-pool.ts:193-198`:

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
