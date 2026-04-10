# Evidence: OverlayFs for Draft Isolation

**Dimension:** D5 — OverlayFs as alternative/complement to git branches for drafts
**Date:** 2026-04-02
**Sources:** github.com/vercel-labs/just-bash `src/fs/overlay-fs/overlay-fs.ts`

---

## Key files referenced

- `src/fs/overlay-fs/overlay-fs.ts` — Full OverlayFs implementation
- `src/fs/overlay-fs/overlay-fs.test.ts` — Tests showing behavior
- `src/fs/overlay-fs/overlay-fs.e2e.test.ts` — End-to-end tests

---

## Findings

### Finding: OverlayFs uses two data structures — Map for writes, Set for deletes
**Confidence:** CONFIRMED
**Evidence:** `src/fs/overlay-fs/overlay-fs.ts` lines 122-123

```typescript
private readonly memory: Map<string, MemoryEntry> = new Map();
private readonly deleted: Set<string> = new Set();
```

Read resolution order: deleted set (ENOENT) → memory layer → real filesystem.
Write: always to memory layer + remove from deleted set.
Delete: add to deleted set + remove from memory layer.

This is a classic union mount / copy-on-write pattern.

### Finding: OverlayFs has NO built-in "commit" or "merge to base" operation
**Confidence:** CONFIRMED
**Evidence:** Full scan of overlay-fs.ts — no merge/commit/flush method exists

The class provides `getMountPoint()`, constructor, and IFileSystem methods. There is no method to:
- Flush memory layer to disk
- Merge changes back to the base filesystem
- Enumerate what has changed
- Export a diff/patch

To "commit" an overlay, you would need to:
1. Iterate `memory` Map to find all changed files
2. Check `deleted` Set for removed files
3. Manually write changes back to disk

Neither Map nor Set is exposed publicly — you'd need to add API surface.

### Finding: OverlayFs has a readOnly mode that blocks all writes
**Confidence:** CONFIRMED
**Evidence:** `src/fs/overlay-fs/overlay-fs.ts` lines 95-96, 158-162

```typescript
readOnly?: boolean; // constructor option

private assertWritable(operation: string): void {
  if (this.readOnly) {
    throw new Error(`EROFS: read-only file system, ${operation}`);
  }
}
```

This is what Mintlify's ChromaFs uses — OverlayFs with readOnly:true over their virtual backend.

### Finding: OverlayFs is bound to real disk via node:fs — not composable with virtual backends
**Confidence:** CONFIRMED
**Evidence:** `src/fs/overlay-fs/overlay-fs.ts` line 14

```typescript
import * as fs from "node:fs";
```

OverlayFs reads from the real filesystem using `node:fs`. It cannot overlay on top of an InMemoryFs or another IFileSystem implementation. This is fundamentally a "real directory + in-memory changes" pattern, not a "IFileSystem A + IFileSystem B" composition.

For draft isolation over a virtual backend (like Yjs), OverlayFs is NOT directly applicable. You'd need a new "VirtualOverlayFs" that composes two IFileSystem instances.

### Finding: MountableFs IS composable — it can layer any IFileSystem implementations
**Confidence:** CONFIRMED
**Evidence:** `src/fs/mountable-fs/mountable-fs.ts` lines 24-29, 57-62

```typescript
interface MountConfig {
  mountPoint: string;
  filesystem: IFileSystem; // Any IFileSystem implementation
}
```

MountableFs delegates based on path prefix matching. It accepts any IFileSystem at any mount point. For draft isolation, you could:
- Mount base branch content at `/kb/main/`
- Mount draft overlay at `/kb/draft/`
- Or switch the mount dynamically based on agent context

### Finding: Draft isolation via OverlayFs vs git branches — tradeoff analysis
**Confidence:** INFERRED
**Evidence:** Structural analysis

| Aspect | OverlayFs layers | Git branches |
|--------|-----------------|--------------|
| Isolation granularity | Per-session, ephemeral | Named, persistent |
| Merge/commit | No built-in mechanism | `git merge` with conflict resolution |
| History | None — just current state | Full commit history |
| Multiple collaborators | Single-writer only | Multi-writer via CRDT |
| Persistence across restarts | Lost (in-memory) | Persisted (on disk) |
| Performance | Zero overhead reads | Minimal (branch checkout) |
| Nested drafts | Not supported | Branch from branch |
| Discarding | Discard the Map reference | `git branch -D` |

For a knowledge platform with persistent drafts that multiple agents/users can collaborate on, git branches are structurally superior. OverlayFs is better for ephemeral, single-session sandboxing (which is exactly what Mintlify uses it for).

---

## Gaps / follow-ups

* Whether a "VirtualOverlayFs" that composes two IFileSystem instances would be trivial to build
* Memory overhead of the overlay layer for large changesets
