---
title: "@parcel/watcher for Bidirectional Disk-CRDT Sync: Source-Level Implementation Analysis"
description: "Deep technical analysis of using @parcel/watcher to detect external file changes (VS Code, Cursor) and sync them into a Hocuspocus + Yjs CRDT editor. Covers the FSEvents backend, content-hash feedback loop prevention with race condition analysis, Hocuspocus document lifecycle for force-loading, updateYFragment minimal-diff behavior, concurrent edit clobber scenarios, frontmatter handling, file create/delete lifecycle, editor save patterns, and performance at 1000-file scale."
createdAt: 2026-04-07
updatedAt: 2026-04-07
subjects:
  - "@parcel/watcher"
  - Hocuspocus
  - Yjs
  - y-prosemirror
  - VS Code
  - Cursor
  - FSEvents
topics:
  - bidirectional file sync
  - CRDT disk bridge
  - file watcher feedback loops
  - concurrent edit safety
---

# @parcel/watcher for Bidirectional Disk-CRDT Sync: Source-Level Implementation Analysis

**Purpose:** Provide source-code-level answers for implementing the disk-to-CRDT sync path using @parcel/watcher, completing the bidirectional bridge between a Hocuspocus + Yjs editor and the local filesystem. The reader is building this system and needs to understand every race condition, every coalescing behavior, and every edge case before writing code.

---

## Executive Summary

After reading the C++ source of @parcel/watcher (Debounce.cc, FSEventsBackend.cc, Event.hh, Watcher.cc), the Hocuspocus server source (Hocuspocus.ts, DirectConnection.ts, Document.ts, types.ts), and the y-prosemirror v1/v2 sync implementations, the central finding is:

**The disk-to-CRDT sync path is implementable with @parcel/watcher and works cleanly for the common case (external-only edits). The hard problem is concurrent edits -- when BOTH a browser user and an external editor modify the same document simultaneously.** For this case, no off-the-shelf solution exists; the simplest safe strategy is to defer the watcher update and let the CRDT state win.

**Key Findings:**

- **@parcel/watcher's FSEvents backend delivers events in 2-52ms on macOS.** The C++ debounce layer uses hardcoded constants: MIN_WAIT_TIME=50ms, MAX_WAIT_TIME=500ms. First event after 500ms of quiet fires immediately; subsequent events batch in 50ms windows. The FSEvents latency parameter is set to 1ms.

- **Atomic writes (temp+rename) are handled correctly by @parcel/watcher's EventList coalescing.** Delete+create on the same path coalesces to an update event. Create+delete on the temp file is filtered out entirely. The existing persistence layer's atomic write pattern is fully compatible.

- **Content-hash feedback loop prevention works for 4 out of 5 traced race condition scenarios.** The one failure case is when our persistence writes simultaneously with an external editor within the same 50ms coalescing window -- our write lands last and the external change is overwritten by the CRDT state. This is a genuine concurrent write conflict that requires CRDT-vs-disk prioritization, not just loop prevention.

- **Hocuspocus's openDirectConnection force-loads documents not currently in memory, but the recommended strategy is to only sync documents already open in the browser.** For unopened documents, external changes are loaded from disk on next access. This avoids circular loading.

- **updateYFragment (v1, used via @tiptap/y-tiptap) produces minimal CRDT ops for single-paragraph edits but will clobber concurrent CRDT mutations.** The clobber only occurs when BOTH CRDT and disk were modified since the last sync -- detectable via document.lastChangeTime comparison.

- **Frontmatter changes require dual-path handling: Y.Map for metadata, updateYFragment for body.**

- **Watching 1000 .md files has negligible overhead.** Single FSEvents stream, ~144KB memory, 2-52ms latency.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| 1 | @parcel/watcher API and behavior (events, FSEvents backend, coalescing) | P0 | Deep | CONFIRMED |
| 2 | Content-hash feedback loop prevention (race conditions) | P0 | Deep | CONFIRMED |
| 3 | Hocuspocus document lifecycle (load/unload, force-load, DirectConnection) | P0 | Deep | CONFIRMED |
| 4 | updateYFragment diff behavior for minimal external edits | P0 | Deep | CONFIRMED |
| 5 | Concurrent edit scenarios (browser user + external editor) | P0 | Deep | CONFIRMED |
| 6 | Frontmatter handling (add/remove/modify by external editor) | P0 | Moderate | CONFIRMED |
| 7 | File deletion and creation lifecycle | P0 | Moderate | INFERRED |
| 8 | VS Code / Cursor save patterns (atomic writes, auto-save timing) | P1 | Moderate | CONFIRMED |
| 9 | Performance at scale (1000 .md files) | P1 | Moderate | INFERRED |

**Stance:** Factual with conclusions.
**Non-goals:** Implementing the solution, designing the three-way merge algorithm, y-prosemirror v2 migration path, UI/UX for conflict resolution.

---

## Detailed Findings

### 1. @parcel/watcher API and Behavior

**Finding:** @parcel/watcher on macOS uses FSEvents with a 1ms latency parameter and a C++ debounce layer with 50ms minimum wait and 500ms maximum wait. Events are { path: string, type: 'create' | 'update' | 'delete' } -- no content, no PID, no old/new values. The EventList coalesces multiple operations on the same path: delete+create becomes update, create+delete is filtered out entirely.

**Evidence:** [evidence/parcel-watcher-api-internals.md](evidence/parcel-watcher-api-internals.md)

The event delivery pipeline:

```
Kernel VFS detects write (~0ms)
  -> FSEvents delivers to user space (~1ms, configured latency)
  -> C++ EventList coalesces by path (deduplication)
  -> Debounce timer: 
     - If >500ms since last event: fire immediately
     - Else: wait 50ms for more events
  -> N-API ThreadSafeFunction -> JavaScript callback
```

Total latency: **2-52ms** from file save to JavaScript callback.

The coalescing rules in Event.hh are critical for atomic writes:

| Write pattern | Events generated | Coalesced result |
|---|---|---|
| Direct fs.writeFile (truncate+write) | 1x update | update |
| Atomic write (temp+rename) | temp: create+delete, target: update | Target: update only (temp filtered out) |
| VS Code save (truncate to 0, write content) | 1x update | update |
| File rename | Old: delete, New: create | delete + create (separate paths) |

The ignore option supports both absolute paths (checked via prefix matching in C++) and glob patterns (compiled to regex via picomatch, matched in C++). Path-based exclusions are additionally passed to FSEventStreamSetExclusionPaths for kernel-level filtering.

**Implications:**
- File filtering to .md only must happen in the JavaScript callback -- the API has no include option
- The 50ms debounce window means rapid saves produce ~2 callbacks/second, not 10
- No content is included in events -- must read the file after receiving the event

---

### 2. Content-Hash Feedback Loop Prevention

**Finding:** A two-layer prevention architecture is required. Layer 1 (content-hash gate at the watcher) prevents self-writes from re-entering the CRDT. Layer 2 (skipStoreHooks flag on the DirectConnection transaction origin) prevents watcher-originated CRDT mutations from re-triggering disk persistence. Five race condition scenarios were traced; four resolve correctly, one reveals a genuine concurrent write conflict.

**Evidence:** [evidence/content-hash-feedback-loops.md](evidence/content-hash-feedback-loops.md)

The write tracker pattern:

```typescript
const writeTracker = new Map<string, { hash: string; timestamp: number }>();

// In onStoreDocument, BEFORE writing to disk:
writeTracker.set(path, {
  hash: createHash('sha256').update(markdown).digest('hex'),
  timestamp: Date.now(),
});

// In watcher callback:
const content = await readFile(event.path, 'utf-8');
const hash = createHash('sha256').update(content).digest('hex');
const tracked = writeTracker.get(event.path);
if (tracked && tracked.hash === hash) {
  writeTracker.delete(event.path);
  return; // Self-write -- skip
}
```

Layer 2 -- using skipStoreHooks:

```typescript
document.transact(() => {
  // apply changes
}, {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'file-watcher' },
} satisfies LocalTransactionOrigin);
```

Note: DirectConnection.transact() does not expose skipStoreHooks. Access conn.document and call document.transact() directly.

**Five traced scenarios:**

1. Simple self-write -> hash matches -> SKIP (correct)
2. External write only -> hash does not match -> PROCESS (correct)
3. Our write + external write in same 50ms window, external last -> hash mismatch -> PROCESS (correct)
4. External write + our write in same 50ms window, ours last -> hash matches -> SKIP (external change lost -- concurrent conflict)
5. External write with identical content -> hash matches -> SKIP (correct, nothing to sync)

Scenario 4 is a genuine concurrent write conflict, not a feedback loop.

---

### 3. Hocuspocus Document Lifecycle

**Finding:** openDirectConnection(documentName) creates or reuses the Y.Doc, runs onLoadDocument hooks on first access, and returns a DirectConnection to the same in-memory document instance that WebSocket clients use. Documents unload when all connections reach zero.

**Evidence:** [evidence/hocuspocus-document-lifecycle.md](evidence/hocuspocus-document-lifecycle.md)

**Recommendation: Strategy C (Piggyback + defer).** Only sync documents already in hocuspocus.documents map. For unopened documents, defer -- changes load from disk on next access.

```typescript
function shouldProcessWatcherEvent(docName: string): boolean {
  return hocuspocus.documents.has(docName);
}
```

This avoids circular loading (opening a DirectConnection triggers onLoadDocument which reads the file we are trying to sync from) and avoids memory overhead for documents no one is viewing.

---

### 4. updateYFragment Diff Behavior

**Finding:** updateYFragment (v1, via @tiptap/y-tiptap) produces minimal CRDT operations for single-paragraph text edits. The left/right scan algorithm preserves unchanged surrounding paragraphs. For a one-word change in paragraph 3 of 10, only paragraph 3's text content is modified.

**Evidence:** [evidence/updateyfragment-diff-behavior.md](evidence/updateyfragment-diff-behavior.md)

Scan pattern for single-paragraph edit:
- Left scan matches unchanged prefix paragraphs
- Right scan matches unchanged suffix paragraphs
- Middle: same-type nodes updated in-place (text content replaced)

Result: approximately the same CRDT footprint as a human typing the change.

The project uses v1 via @tiptap/y-tiptap. y-prosemirror v2 (2.0.0-2) replaces this with a delta-based approach operating at the character level -- better granularity for concurrent edits, but not yet available for headless server-side use.

---

### 5. Concurrent Edit Scenarios

**Finding:** The concurrent edit problem is the critical safety concern. updateYFragment's two-way diff will overwrite CRDT changes with disk content. Detection via document.lastChangeTime; recommended mitigation is defer-and-let-CRDT-win.

**Evidence:** [evidence/concurrent-edits-frontmatter-lifecycle.md](evidence/concurrent-edits-frontmatter-lifecycle.md)

| Scenario | Safety |
|---|---|
| Only external edit | Safe |
| Only CRDT edit | Safe (hash gate skips) |
| Both edited, different paragraphs | **Unsafe** -- CRDT edits clobbered |
| Both edited, same paragraph | **Unsafe** -- user changes lost |
| External adds/deletes paragraph only | Safe |

Detect-and-defer mitigation:

```typescript
if (tracked && doc.lastChangeTime > tracked.timestamp) {
  // Concurrent edit -- defer, let CRDT win
  return;
}
```

---

### 6. Frontmatter Handling

**Finding:** Dual-path: Y.Map('metadata') for frontmatter, updateYFragment for body. All four edge cases handled.

**Evidence:** [evidence/concurrent-edits-frontmatter-lifecycle.md](evidence/concurrent-edits-frontmatter-lifecycle.md)

---

### 7. File Deletion and Creation

**Finding:** Deletion: set metaMap.set('deleted', true) for open documents. Creation: lazy load (no action needed -- onLoadDocument reads from disk on first open).

**Evidence:** [evidence/concurrent-edits-frontmatter-lifecycle.md](evidence/concurrent-edits-frontmatter-lifecycle.md)

---

### 8. VS Code / Cursor Save Patterns

**Finding:** VS Code uses truncate-and-write (not atomic rename) by default. Auto-save delay: 1000ms (configurable). Cursor inherits this. Both produce single update events.

**Evidence:** [evidence/concurrent-edits-frontmatter-lifecycle.md](evidence/concurrent-edits-frontmatter-lifecycle.md)

---

### 9. Performance at Scale

**Finding:** Single FSEvents stream per directory tree. ~144KB memory for 1000 files. 2-52ms latency. Use p-limit for burst processing.

**Evidence:** [evidence/performance-at-scale.md](evidence/performance-at-scale.md)

---

## Architecture Overview

```
                    External Editors (VS Code, Cursor, Vim)
                               |
                               v
                    Local Filesystem (.md files)
                               |
           +-------------------+-------------------+
           | FSEvents (kernel)                     | fs.writeFile (atomic)
           v                                       ^
  @parcel/watcher                    CRDT -> Disk Persistence
  (C++ native, 50ms batch)          (onStoreDocument hook)
           |                                       |
           v                                       |
  File Watcher Handler                             |
  1. Filter to .md files                           |
  2. Content-hash gate ---------- SKIP if self ---+
  3. Check doc is loaded
  4. Detect concurrent edit ----- DEFER if CRDT modified
  5. Strip frontmatter
  6. Parse markdown -> PM
  7. updateYFragment
  8. Update Y.Map metadata
  (transact w/ skipStoreHooks)
           |
           v
  Hocuspocus Y.Doc <===WSS===> Browser Editor (TipTap)
  (in-memory, shared)          (immediate propagation)
```

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- Three-way merge algorithm for concurrent CRDT + disk edits
- y-prosemirror v2 server-side headless API
- Cursor exact auto-save timing

### Out of Scope
- Implementation code
- Three-way merge algorithm design
- y-prosemirror v2 migration path
- UI/UX for conflict notification

---

## References

### Evidence Files
- [evidence/parcel-watcher-api-internals.md](evidence/parcel-watcher-api-internals.md) - FSEvents backend, debounce constants, event coalescing, glob filtering
- [evidence/content-hash-feedback-loops.md](evidence/content-hash-feedback-loops.md) - Write tracker, five race scenarios, two-layer prevention
- [evidence/hocuspocus-document-lifecycle.md](evidence/hocuspocus-document-lifecycle.md) - openDirectConnection, load/unload, Strategy C
- [evidence/updateyfragment-diff-behavior.md](evidence/updateyfragment-diff-behavior.md) - v1 scan algorithm, minimal ops, v2 comparison
- [evidence/concurrent-edits-frontmatter-lifecycle.md](evidence/concurrent-edits-frontmatter-lifecycle.md) - Concurrent matrix, frontmatter, file lifecycle, editor patterns
- [evidence/performance-at-scale.md](evidence/performance-at-scale.md) - FSEvents efficiency, memory, latency, burst handling

### External Sources
- [@parcel/watcher source](https://github.com/parcel-bundler/watcher)
- [VS Code atomic saves discussion](https://github.com/microsoft/vscode/issues/98063)
- [Cursor auto-save frequency request](https://forum.cursor.com/t/autosave-frequency-should-be-adjustable/12737)

### Related Research
- [reports/crdt-mcp-filesystem-bridge/](../crdt-mcp-filesystem-bridge/) - updateYFragment clobber analysis, feedback loop conceptual architecture, Hocuspocus DirectConnection API
