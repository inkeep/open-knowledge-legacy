# Evidence: File Watcher Feedback Loop Prevention

**Dimension:** Preventing CRDT → disk → watcher → CRDT → disk feedback loops
**Date:** 2026-04-07
**Sources:** @parcel/watcher TypeScript types (index.d.ts), Hocuspocus types.ts, analysis of write/watch interaction patterns

---

## Key files / pages referenced

- https://github.com/parcel-bundler/watcher/blob/master/index.d.ts — @parcel/watcher Event type definition
- `hocuspocus/packages/server/src/types.ts:18` — skipStoreHooks flag
- `hocuspocus/packages/server/src/Hocuspocus.ts:297` — shouldSkipStoreHooks early return

---

## Findings

### Finding: @parcel/watcher events do NOT include process/PID information
**Confidence:** CONFIRMED
**Evidence:** @parcel/watcher index.d.ts

```typescript
export type EventType = 'create' | 'update' | 'delete';
export interface Event {
  path: FilePath;
  type: EventType;
}
export type SubscribeCallback = (err: Error | null, events: Event[]) => unknown;
```

Events contain ONLY path and type. No PID, no file descriptor, no inode information. There is no way to determine whether a file change was caused by our own process or an external process.

**Implications:** Feedback loop prevention cannot rely on "was this our write?" detection at the watcher level. Must use application-level tracking.

---

### Finding: Application-level write tracking is the standard feedback loop prevention pattern
**Confidence:** CONFIRMED
**Evidence:** Analysis of standard patterns, chokidar documentation, Hocuspocus skipStoreHooks

The standard pattern for preventing feedback loops:

```typescript
// Track files we're writing
const writesInFlight = new Map<string, { timestamp: number, hash: string }>();

// Before writing to disk:
function writeFileToDisk(path: string, content: string) {
  const hash = computeHash(content);
  writesInFlight.set(path, { timestamp: Date.now(), hash });
  await fs.writeFile(path, content);
}

// In file watcher handler:
function onFileChanged(event: Event) {
  const tracked = writesInFlight.get(event.path);
  if (tracked && Date.now() - tracked.timestamp < THRESHOLD) {
    // This is likely our own write — verify with hash
    const currentContent = await fs.readFile(event.path, 'utf-8');
    if (computeHash(currentContent) === tracked.hash) {
      writesInFlight.delete(event.path);
      return; // Skip — this is our own write
    }
  }
  // Not our write — process the external change
  processExternalChange(event.path);
}
```

Key considerations:
- **Timestamp-based**: May miss if another process writes immediately after us (within THRESHOLD)
- **Hash-based**: More reliable but requires reading the file again
- **Combined**: Timestamp for quick check, hash for verification

---

### Finding: Two-layer feedback loop prevention is needed (Hocuspocus + file watcher)
**Confidence:** INFERRED
**Evidence:** Architecture analysis

**Loop 1: CRDT → disk → watcher → CRDT**
- Agent writes to CRDT via DirectConnection
- onStoreDocument hook serializes to markdown and writes .md file
- @parcel/watcher detects .md change
- Watcher handler reads .md, parses to PM, calls updateYFragment
- This writes IDENTICAL content back to CRDT (no-op diff, but still triggers onChange)
- onChange triggers onStoreDocument again...

**Prevention for Loop 1:**
- Write tracking (see above) at the file watcher level
- The content hash check should short-circuit: if disk content matches CRDT content, skip the updateYFragment call

**Loop 2: External write → watcher → CRDT → onStoreDocument → disk**
- Cursor writes to .md file
- Watcher detects change, updates CRDT
- CRDT change triggers onStoreDocument
- onStoreDocument writes .md file (with content that's identical to what Cursor just wrote)
- Watcher detects this write...

**Prevention for Loop 2:**
- Use `skipStoreHooks: true` in the LocalTransactionOrigin when the file watcher writes to CRDT
- This prevents the watcher → CRDT path from triggering persistence

```typescript
// File watcher → CRDT path
conn.transact((doc) => {
  // apply disk changes to CRDT
}, { source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } });
```

Combined with write tracking for Loop 1, this fully prevents feedback loops.

---

### Finding: @parcel/watcher batches events with ~25-50ms latency
**Confidence:** INFERRED
**Evidence:** @parcel/watcher documentation, typical OS file notification latency

The callback signature `(err: Error | null, events: Event[])` delivers events in batches. On macOS (FSEvents backend), events are coalesced over ~25-50ms. On Linux (inotify), events arrive individually with ~0-10ms latency.

At 200ms CRDT → disk write intervals:
- macOS: watcher may coalesce 0-1 events per 200ms window
- If our own write and an external write happen within the same coalescing window, they arrive as a single batch with both events

**Implications:** The write tracking hash check is essential — timestamp alone cannot distinguish events within a single batch.

---

## Gaps / follow-ups

* The `skipStoreHooks` flag was added in Hocuspocus v4. Need to verify the OpenDesign project is using v4+.
* Atomic write patterns (write to temp file, rename) could affect watcher behavior — @parcel/watcher may report a delete+create instead of an update for rename-based atomic writes.
