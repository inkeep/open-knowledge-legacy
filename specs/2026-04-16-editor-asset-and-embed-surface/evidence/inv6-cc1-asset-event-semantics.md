---
name: INV6 — CC1 `ch:'files'` broadcast semantics for non-markdown assets
description: Verify whether file-watcher DiskEvents for asset (non-.md) files reach the CC1 broadcaster
created: 2026-04-16
sources:
  - packages/server/src/standalone.ts:261-380
  - packages/server/src/cc1-broadcast.ts
  - packages/server/src/file-watcher.ts
  - packages/server/src/content-filter.ts
---

# INV6 — CC1 Broadcaster Semantics for Asset Events

## Question

Does `cc1Broadcaster.signal('files')` fire when a non-markdown asset file (e.g. `photo.png`, `draft.pdf`) is created, deleted, or renamed? FR-6 (basename-index invalidation via CC1 reuse) depends on it.

## Findings

**Current flow:** `file-watcher.ts` emits `DiskEvent` unions via `@parcel/watcher` (chokidar fallback). The event pipeline goes to `handleDiskEvent` in `standalone.ts:262`. Inspection of `standalone.ts:264-380` shows:

- `create` → `signalChannel('files')` + backlinks + graph (line 271-273)
- `update` → `signalChannel('backlinks')` + graph only (no `'files'`) — file list didn't change
- Other cases (delete, rename, conflict) — need to read full switch
- **Critical unknown:** are DiskEvents emitted for asset files, or does file-watcher filter to `.md`/`.mdx` only?

**Content-filter behavior (verified):** `content-filter.ts:202-204` references `ASSET_EXTENSIONS` from `@inkeep/open-knowledge-core`:
```typescript
if (ASSET_EXTENSIONS.has(ext)) {
  // sibling-asset rule: extension in ASSET_EXTENSIONS AND dir has included .md
}
```

Content-filter admits assets for HTTP serving (sirv), but the question is whether the **file-watcher event stream itself** surfaces asset create/delete events upstream to `handleDiskEvent`.

**Likely state (UNRESOLVED pending full read of `file-watcher.ts`):** The file-watcher likely filters to `.md`/`.mdx` events before emitting DiskEvents. The content-filter's asset admission works in a different code path (startup scan for sirv index + refcount map maintenance). If this is correct, **asset create/delete does NOT reach CC1**.

## Implications for FR-6

If asset events do NOT currently reach CC1, FR-6 has three options:

**Option A — Widen file-watcher to emit asset DiskEvents.**
- Extend `file-watcher.ts` to pass through asset events with a new `DiskEvent` variant (e.g. `{kind: 'asset-create' | 'asset-delete' | 'asset-rename', path}`).
- `handleDiskEvent` adds a case that `signalChannel('files')` for asset events too.
- **Cost:** ~20 LOC in file-watcher.ts + ~10 in standalone.ts. Matches prior spec D16 intent ("small asset event handler addition").

**Option B — New CC1 channel `ch:'asset-index'`.**
- Separate channel dedicated to basename-index invalidation.
- Requires new `signal()` path from the asset-aware subsystem.
- Semantics: only basename index rebuilds listen. Keeps `ch:'files'` pure for file-list view.
- **Cost:** similar LOC; more conceptual overhead.

**Option C — Basename index owns its own polling + fs.watch.**
- Index subscribes to the filesystem directly, bypassing file-watcher.
- Decoupled from server's DiskEvent stream.
- **Cost:** duplicate watcher; risk of drift vs file-watcher's index.

**Recommendation:** Option A. Reuses existing infrastructure, matches prior spec intent, minimal new surface. The basename index subscribes to `ch:'files'` and rebuilds — markdown events also trigger rebuild but that's cheap (Map<basename, string[]> linear scan in single-digit ms at our scale).

## Decision surfaced to user

- **D-H (new):** Option A (widen file-watcher) vs Option B (new channel) vs Option C (independent watcher). Raised as a follow-up to INV6. Default recommendation: Option A.

## Remaining unresolved

Full read of `file-watcher.ts` to confirm whether asset events are actually filtered out today, or already pass through but are ignored by `handleDiskEvent`. Deferred to iterate phase — not blocking for the first decision batch.
