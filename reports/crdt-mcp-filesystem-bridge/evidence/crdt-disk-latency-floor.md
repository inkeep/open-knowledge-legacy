# Evidence: CRDT → Disk Persistence Latency Floor

**Dimension:** CRDT → disk latency: can the 2-10s debounce be tightened to <500ms?
**Date:** 2026-04-07
**Sources:** Hocuspocus server source (Hocuspocus.ts, debounce.ts, types.ts), Node.js fs documentation, Yjs performance discussions

---

## Key files / pages referenced

- `hocuspocus/packages/server/src/Hocuspocus.ts:29-30` — Default debounce configuration
- `hocuspocus/packages/server/src/util/debounce.ts` — Debounce implementation
- `hocuspocus/packages/server/src/Hocuspocus.ts:461-502` — `storeDocumentHooks` method
- `hocuspocus/packages/server/src/types.ts:40-50` — `shouldSkipStoreHooks` and `skipStoreHooks`
- `hocuspocus/tests/server/onStoreDocument.ts` — Debounce behavior tests
- https://github.com/yjs/yjs/issues/675 — Yjs encoding performance issues

---

## Findings

### Finding: Hocuspocus debounce is fully configurable down to 0ms
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus.ts:29-30, debounce.ts

```typescript
// Default configuration
export const defaultConfiguration = {
  debounce: 2_000,    // 2 seconds
  maxDebounce: 10_000, // 10 seconds
};
```

The debounce implementation in `debounce.ts` uses two parameters:
- `debounce`: trailing edge wait time (resets on each new change)
- `maxDebounce`: absolute maximum time since first change before forced execution

```typescript
const debounce = async (id, func, debounce, maxDebounce) => {
  const old = timers.get(id);
  const start = old?.start || Date.now();
  // ...
  if (debounce === 0) { return run(); }  // 0 = immediate
  if (Date.now() - start >= maxDebounce) { return run(); }  // force after max
  // ...
};
```

Setting `debounce: 0` triggers immediate execution. Setting `debounce: 200, maxDebounce: 500` would write within 200-500ms of changes.

Test at line 110 confirms debounce works as expected with `debounce: 300` — 5 rapid changes produce only 1 onStoreDocument call.

**Implications:** No Hocuspocus code changes are needed. Simply configure `debounce: 200, maxDebounce: 500` for sub-second persistence.

---

### Finding: onStoreDocument serialization runs exclusively via saveMutex
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus.ts:461-502

```typescript
storeDocumentHooks(document, hookPayload, immediately?) {
  const debounceId = `onStoreDocument-${document.name}`;
  return this.debouncer.debounce(debounceId, async () => {
    await document.saveMutex.runExclusive(async () => {
      await this.hooks("onStoreDocument", hookPayload);
      await this.hooks("afterStoreDocument", hookPayload);
    });
  }, immediately ? 0 : this.configuration.debounce, this.configuration.maxDebounce);
}
```

The `saveMutex.runExclusive()` ensures only one onStoreDocument executes at a time per document. If a previous save is in progress, the next debounced save WAITS (confirmed by test at line 530: "does not start a new onStoreDocument if there is already one running").

**Implications:** At 200ms debounce, if a save takes >200ms, the next save waits. This self-throttles: faster saves = more frequent writes, slower saves = naturally rate-limited. No write amplification at the Hocuspocus layer.

---

### Finding: Yjs binary encoding (encodeStateAsUpdate) is fast for typical documents
**Confidence:** CONFIRMED (for typical doc sizes), INFERRED (for edge cases)
**Evidence:** Yjs issue #675, Yjs docs

Benchmark data from Yjs issue #675 (large 8MB document):
- v1 encoding: ~110ms for 8.97MB output
- v2 encoding: ~250ms for 452KB output (better compression, slower)

For a typical 10KB markdown document, the in-memory Y.Doc would be small. Binary encoding would be sub-millisecond.

**Implications:** Binary CRDT persistence (Layer 1 crash recovery) at 200ms intervals is negligible cost for typical document sizes.

---

### Finding: Markdown serialization is a separate, potentially slower step
**Confidence:** INFERRED
**Evidence:** Analysis of the serialization pipeline

The markdown write pipeline for a 10KB document:
1. `ytext.toString()` → string (~µs, in-memory concatenation)
2. Parse to ProseMirror JSON → ~0.5-2ms (depends on doc complexity)
3. ProseMirror JSON → Markdown string (serializer.serialize) → ~1-5ms for 10KB
4. `fs.writeFile()` → ~0.5-2ms (async, kernel-buffered)

Total: ~2-10ms for a 10KB document.

At 200ms intervals, this is ~5% CPU overhead (10ms every 200ms). For 100ms intervals, this would be ~10% CPU — still acceptable but getting noisy.

**Note:** No published benchmarks exist for prosemirror-markdown serialization throughput. The estimates above are inferred from typical JSON serialization + string manipulation costs for 10KB documents.

---

### Finding: fs.writeFile at 200ms intervals is safe for SSDs
**Confidence:** INFERRED
**Evidence:** Node.js documentation, SSD write characteristics

Modern SSDs:
- Endurance: 600+ TBW (terabytes written) for consumer NVMe
- Write coalescing: OS kernel buffers writes; `fs.writeFile` of 10KB every 200ms = ~50KB/s = ~1.5TB/year = well within endurance
- Write amplification factor (WAF): SSD controllers coalesce small writes internally; 10KB writes are smaller than typical SSD page size (16-256KB), so the SSD may write a full page per update. WAF of ~16-25x at page granularity means ~25-50KB/s effective → still negligible

File system journaling (ext4, APFS): adds metadata writes per file update, but the overhead is constant per write, not proportional to file size.

**Implications:** 200ms write intervals for markdown files are safe for SSD endurance. 100ms would also be safe but provides diminishing returns given the serialization cost.

---

### Finding: skipStoreHooks prevents feedback loops for DirectConnection writes
**Confidence:** CONFIRMED
**Evidence:** hocuspocus/packages/server/src/types.ts:18, 40-50

```typescript
export interface LocalTransactionOrigin {
  source: "local";
  skipStoreHooks?: boolean;  // <-- prevents onStoreDocument from firing
  context?: any;
}

export function shouldSkipStoreHooks(origin: unknown): boolean {
  // ...
  case "local": return origin.skipStoreHooks ?? false;
}
```

When a DirectConnection transact uses `{ source: "local", skipStoreHooks: true }`, the `onChange` handler in Hocuspocus.ts:297 returns early before calling `storeDocumentHooks`:

```typescript
if (shouldSkipStoreHooks(origin)) { return; }
```

**Implications:** File watcher → CRDT updates can use `skipStoreHooks: true` to prevent the update from triggering persistence (which would write back to disk → trigger watcher → loop). Agent DirectConnection writes should NOT skip store hooks (they should persist to disk).

---

### Finding: Separate cadences for binary persistence vs markdown serialization are architecturally natural
**Confidence:** INFERRED
**Evidence:** Hocuspocus architecture analysis

Hocuspocus `onStoreDocument` receives the full Y.Doc. The hook implementation decides what to persist. Two separate persistence strategies can coexist:

1. **Layer 1 (crash recovery):** Write Yjs binary (`encodeStateAsUpdate`) every 200ms via one hook. Fast (~µs for typical docs), small (binary), essential for durability.

2. **Layer 2 (markdown for Cursor/source toggle):** Write markdown file every 200-500ms via another hook. Slower (serialization cost), larger (text), needed for external tool interop.

3. **Layer 3 (git):** Commit every 30-60s via a separate timer. No change needed.

These can run on different timers. The `onStoreDocument` hook fires for all changes; each hook decides independently whether to act.

---

## Negative searches

* Searched: "prosemirror markdown serialization benchmark" → No published benchmarks found for serialization throughput
* Searched: "hocuspocus sub-second debounce" → No documented production use at <1s debounce, but no technical barrier identified

---

## Gaps / follow-ups

* Need actual benchmarks for prosemirror-markdown serialization at various document sizes to validate the 2-10ms estimate
* The saveMutex serialization means a slow storage backend (e.g., network DB) could bottleneck sub-second persistence. For file writes this is unlikely to matter.
* @parcel/watcher event coalescing at 200ms write intervals: how many events does it emit? Could it cause UI jank if the watcher handler is processing events on the main thread?
