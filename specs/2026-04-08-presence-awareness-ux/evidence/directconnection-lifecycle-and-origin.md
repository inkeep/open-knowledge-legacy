---
title: DirectConnection Lifecycle and Origin Propagation
type: technical-trace
sources:
  - node_modules/@hocuspocus/server/src/DirectConnection.ts
  - node_modules/@hocuspocus/server/src/Document.ts
  - node_modules/@hocuspocus/server/src/Hocuspocus.ts
  - node_modules/@hocuspocus/server/src/types.ts
---

# DirectConnection Lifecycle and Origin Propagation

## Q6: Can DirectConnection stay open as a persistent session?

**YES.** Verified from source:

- No timeout mechanism in DirectConnection class
- No auto-disconnect logic
- `disconnect()` is manual only (line 46)
- Multiple `transact()` calls supported on same instance (line 29-44 checks `if (!this.document)`)
- Awareness state persists between transactions (same Y.Doc, same Awareness instance)
- Connection tracked via `document.addDirectConnection()` / `removeDirectConnection()`
- Document only triggers `onDisconnect` when ALL connections closed

### Implication for agent sessions

```
Open DC → set awareness → transact → ... → transact → clear awareness → disconnect
   └─────────── session lifetime ──────────────────────────────┘
```

Pool DCs in `Map<docName, DirectConnection>`. One DC per document per agent.

## Q7: doc.transact() with string origin — do Hocuspocus hooks fire?

**YES.** Verified from source:

### conn.transact() (DirectConnection.ts:29-44)
```typescript
this.document.transact(
  (x) => { transaction(this.document!); },
  { source: "local", context: this.context } satisfies LocalTransactionOrigin
);
```
- Hardcodes origin to `{ source: "local", context }` — cannot pass custom origin
- No parameter to override origin

### shouldSkipStoreHooks() (types.ts)
```typescript
export function shouldSkipStoreHooks(origin: unknown): boolean {
  if (!isTransactionOrigin(origin)) return false;  // ← string fails this check
  // ... only reaches here if origin is TransactionOrigin object
}
```
- `isTransactionOrigin('agent-write')` → false (string, not object with `source`)
- Therefore `shouldSkipStoreHooks` → false
- Therefore hooks fire: onChange + onStoreDocument + afterStoreDocument

### Hook dispatch chain (Hocuspocus.ts:297-310)
```
doc.transact(fn, 'agent-write')
  → Y.Doc "update" event
    → Document.handleUpdate(update, origin='agent-write')
      → Hocuspocus.handleDocumentUpdate(doc, origin, update)
        → hooks("onChange", ...) ✅
        → shouldSkipStoreHooks('agent-write') → false
        → storeDocumentHooks(doc, ...) ✅ (debounced 2s)
          → persistence.onStoreDocument() → disk write + git commit
```

### UndoManager tracking
```typescript
new Y.UndoManager(ytype, { trackedOrigins: new Set(['agent-write']) })
```
- `trackedOrigins.has('agent-write')` → true (string identity via Set.has)
- Agent writes tracked ✅
- Non-agent writes (ySyncPluginKey, YSyncConfig, 'sync-from-tree', etc.) NOT tracked ✅

### Combined approach
```typescript
// Use dc.document.transact() directly (not conn.transact())
dc.document.transact(() => {
  // Y.Text or XmlFragment mutations
}, 'agent-write');
// ✅ Hocuspocus hooks fire (persistence works)
// ✅ UndoManager tracks this origin
// ✅ Observer guards pass (origin !== 'sync-from-tree' and !== 'sync-from-text')
```
