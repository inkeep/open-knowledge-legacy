# Evidence: Content-Hash Feedback Loop Prevention

**Dimension:** Content-hash feedback loop prevention, race conditions, coalescing window interactions
**Date:** 2026-04-07
**Sources:** @parcel/watcher source (Debounce.hh, Event.hh), Hocuspocus types.ts (skipStoreHooks), persistence.ts (existing atomic write pattern)

---

## Key files referenced

- `@parcel/watcher/src/Debounce.hh:9-10` -- MIN_WAIT_TIME=50, MAX_WAIT_TIME=500
- `@parcel/watcher/src/Event.hh:30-67` -- EventList coalescing logic
- `hocuspocus/packages/server/src/types.ts:40-50` -- shouldSkipStoreHooks
- `open-knowledge/init_spike/src/server/persistence.ts:188-202` -- Atomic write implementation

---

## Findings

### Finding: Content-hash gate is the correct primary mechanism for distinguishing self-writes from external writes
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis of event model and write tracking

The write tracker pattern:

```typescript
const writeTracker = new Map<string, { hash: string; timestamp: number }>();

// Before writing to disk (in onStoreDocument):
function trackWrite(path: string, content: string): void {
  writeTracker.set(path, {
    hash: createHash('sha256').update(content).digest('hex'),
    timestamp: Date.now(),
  });
}

// In file watcher callback:
async function onFileChanged(event: { path: string; type: string }): Promise<void> {
  if (event.type === 'delete') { /* handle deletion */ return; }
  
  const content = await readFile(event.path, 'utf-8');
  const hash = createHash('sha256').update(content).digest('hex');
  
  const tracked = writeTracker.get(event.path);
  if (tracked && tracked.hash === hash) {
    writeTracker.delete(event.path);
    return; // Our own write -- skip
  }
  
  // External change -- apply to CRDT
  writeTracker.delete(event.path);
  await applyExternalChangeToCRDT(event.path, content);
}
```

Why content hash over timestamp:
- @parcel/watcher coalesces events within 50ms windows (Debounce.hh MIN_WAIT_TIME=50)
- If our write and an external write happen within the same 50ms window, the watcher delivers a single batch
- In that batch, both paths appear as `update` events -- timestamps cannot distinguish them
- Content hash definitively answers: "does the file currently contain what we wrote?"

---

### Finding: Race condition analysis -- five scenarios traced through the coalescing window
**Confidence:** INFERRED
**Evidence:** Analysis combining Debounce.cc timing, EventList coalescing, and write tracker logic

**Scenario 1: Simple self-write (no concurrent external writes)**
```
T=0ms: CRDT changes -> onStoreDocument fires
T=2ms: persistence writes content C1 to disk (atomic: tmp+rename)
T=2ms: writeTracker.set(path, hash(C1))
T=3ms: FSEvents delivers to @parcel/watcher C++ layer
T=53ms: Debounce fires (50ms MIN_WAIT after first event)
T=53ms: JS callback receives [{path, type: 'update'}]
T=54ms: Read file -> content is C1 -> hash matches writeTracker -> SKIP
```
Result: Correctly ignored. No feedback loop.

**Scenario 2: External write only (Cursor saves the file)**
```
T=0ms: Cursor writes content C2 to disk
T=1ms: FSEvents delivers to @parcel/watcher
T=51ms: Debounce fires
T=51ms: JS callback receives [{path, type: 'update'}]
T=52ms: Read file -> content is C2 -> hash does NOT match writeTracker (empty) -> PROCESS
T=53ms: Apply C2 to CRDT via DirectConnection with skipStoreHooks=true
```
Result: Correctly processed. External change synced to CRDT.

**Scenario 3: Our write + external write within the same 50ms coalescing window**
```
T=0ms: Our persistence writes C1, sets writeTracker hash(C1)
T=1ms: FSEvents gets our write event
T=30ms: Cursor writes C2 (different content, within same 50ms window)
T=31ms: FSEvents gets Cursor's write event
T=51ms: Debounce fires -- EventList has ONE event for this path (coalesced)
T=52ms: Read file -> content is C2 (Cursor's write) -> hash(C2) != hash(C1) -> PROCESS
```
Result: **Correctly handled.** Even though our write was also in the batch, the file's current content is C2 (Cursor's), which doesn't match our tracked hash. We process it as an external change.

**Scenario 4: External write + our write within the same 50ms coalescing window**
```
T=0ms: Cursor writes C2
T=1ms: FSEvents gets Cursor's event
T=30ms: Our persistence writes C1, sets writeTracker hash(C1)
T=31ms: FSEvents gets our event
T=51ms: Debounce fires -- single coalesced event
T=52ms: Read file -> content is C1 (our write, which was last) -> hash(C1) matches -> SKIP
```
Result: **Cursor's write C2 is lost.** Our persistence overwrote it, and the watcher correctly sees our content. This is a real conflict -- but it's the same conflict that would occur even without a watcher. The CRDT state at T=30ms was whatever triggered onStoreDocument, and Cursor's write happened concurrently. The watcher cannot help here -- this is a concurrent write problem that requires either:
- Lock-based mutual exclusion (pause persistence during watcher processing)
- Three-way merge (compare last-known ancestor, disk, and CRDT)

**Scenario 5: External write has the same hash as our write (identical content)**
```
T=0ms: Our persistence writes C1, sets writeTracker hash(C1)
T=50ms: External editor writes content that happens to be identical to C1
T=100ms: Watcher fires
T=101ms: Read file -> hash matches writeTracker -> SKIP
```
Result: **Silently skipped -- but this is correct.** If the external editor wrote identical content, there's nothing to sync. The CRDT already has this content.

---

### Finding: Two-layer prevention architecture is required (watcher layer + Hocuspocus layer)
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus types.ts:40-50, architecture analysis

**Layer 1 (watcher -> CRDT): Content hash gate**
Prevents the watcher from syncing back content that our persistence just wrote.

**Layer 2 (CRDT -> persistence): skipStoreHooks flag**
When the file watcher writes to the CRDT, use `skipStoreHooks: true` to prevent the CRDT change from triggering onStoreDocument, which would write the file again.

```typescript
// In file watcher handler:
conn.transact((doc) => {
  // Apply disk content to CRDT
  applyContentToFragment(doc, content);
}, {
  source: 'local',
  skipStoreHooks: true,  // KEY: prevents persistence echo
  context: { origin: 'file-watcher' }
} satisfies LocalTransactionOrigin);
```

Without Layer 2, the following loop occurs:
```
Cursor writes .md -> watcher -> CRDT (with content hash gate clearing the tracker)
  -> onChange -> onStoreDocument -> writes .md (identical content)
  -> watcher fires again -> content hash MATCHES because we just wrote it -> SKIP
```
This loop terminates after 2 cycles (our re-write matches the hash), but it's wasteful. With skipStoreHooks, the loop is cut at the source.

---

### Finding: Write tracker cleanup is critical to prevent stale entries
**Confidence:** INFERRED
**Evidence:** Architecture analysis

The writeTracker map must be cleaned up to prevent:
1. **Memory leak**: entries accumulate for every persisted file
2. **False positive skips**: if a tracked hash matches a future unrelated external write

Cleanup strategy:
- Delete entry when the watcher processes it (whether skipped or processed)
- Add a TTL (e.g., 5 seconds) to auto-expire entries not consumed by the watcher
- The TTL handles edge cases where the watcher event is somehow lost

```typescript
// Enhanced write tracker with TTL
function trackWrite(path: string, content: string): void {
  writeTracker.set(path, {
    hash: createHash('sha256').update(content).digest('hex'),
    timestamp: Date.now(),
  });
  // Auto-expire after 5 seconds
  setTimeout(() => {
    const entry = writeTracker.get(path);
    if (entry && Date.now() - entry.timestamp >= 5000) {
      writeTracker.delete(path);
    }
  }, 5000);
}
```

---

## Gaps / follow-ups

* Scenario 4 (external write overwritten by our persistence) is a genuine concurrent write conflict that cannot be solved by the content hash gate alone. This requires either: (a) a lock that pauses persistence while processing watcher events, or (b) comparing the CRDT state vector before and after to detect concurrent mutations.
* Hash computation cost: SHA-256 on a 10KB markdown file is ~0.01ms. For 1000 files, even if all are simultaneously modified, total hash time is ~10ms. Negligible.
