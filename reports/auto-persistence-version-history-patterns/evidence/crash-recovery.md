# Evidence: Server-Restart & Crash Recovery Patterns (D5)

**Dimension:** D5 — CRDT recovery strategies
**Date:** 2026-04-08
**Sources:** Hocuspocus docs, Yjs docs, AFFiNE/BlockSuite architecture, git-fsck docs

---

## Key sources referenced
- Hocuspocus persistence guide — https://tiptap.dev/docs/hocuspocus/guides/persistence
- Hocuspocus SQLite extension — https://tiptap.dev/docs/hocuspocus/server/extensions/sqlite
- Hocuspocus issue #344 — content duplication on reconnect
- Yjs document updates API — https://docs.yjs.dev/api/document-updates
- AFFiNE dual-provider pattern — deepwiki.com/toeverything/AFFiNE

---

## Findings

### Finding: Hocuspocus reloads via `onLoadDocument` on first client connect after restart
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus docs: `onLoadDocument` fires whenever a client connects to a document not already in memory. After restart, all documents evicted. The extension populates the Y.Doc from storage before the hook returns.

**Implication:** The existing `persistence.ts` implementation (read .md → parse → updateYFragment) is the correct hook point.

### Finding: Reconstructing Y.Doc from markdown alone causes content duplication on client reconnect
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus issue #344: when server restarts and clients reconnect, content from `onLoadDocument` gets appended to the editor instead of syncing. Root cause: reconnecting client has local Y.Doc with original CRDT item IDs; server creates fresh Y.Doc with new item IDs; Yjs sync merges them, duplicating content.

**Implication:** CRITICAL for Open Knowledge. Persisting Yjs binary state alongside markdown prevents this bug.

### Finding: Dual persistence (Yjs binary + markdown) is the recommended pattern
**Confidence:** CONFIRMED
**Evidence:** AFFiNE uses dual-provider (IndexedDB for Yjs binary + WebSocket for sync). Hocuspocus SQLite extension persists `Uint8Array` binary state. Yjs docs recommend `Y.encodeStateAsUpdate(doc)` for persistence and `Y.applyUpdate(doc, state)` for restore. The general Yjs ecosystem pattern: persist binary as CRDT source of truth; derive markdown/JSON as export.

**Implication:** On `onStoreDocument`: serialize to markdown (for git) AND `encodeStateAsUpdate` (for CRDT recovery). On `onLoadDocument`: prefer binary if available, fall back to markdown only for first load or binary corruption.

### Finding: Atomic file write (temp + rename) is correct but production needs fsync
**Confidence:** CONFIRMED
**Evidence:** POSIX `rename()` is atomic for other processes but NOT guaranteed durable on crash without `fsync()`. Full bulletproof sequence: write temp, fsync temp, rename, fsync parent dir. The existing code does temp+rename but not fsync — acceptable for dev, should add for production.

**Implication:** Add `fsync()` calls to the persistence pipeline for production robustness.

### Finding: Partial git object corruption is handled by existing git safety mechanisms
**Confidence:** CONFIRMED
**Evidence:** `git update-ref` uses lockfile+rename internally (atomic). If crash happens between `write-tree` and `update-ref`, orphan objects exist but WIP ref is safe (points to previous commit). `git fsck` detects all corruption. Dangling objects cleaned by `git gc` after 2-week grace.

**Implication:** On startup, run `git fsck --no-dangling` (fast) to detect actual corruption. Orphaned objects are harmless.

### Finding: Recommended recovery sequence on restart
**Confidence:** INFERRED
**Evidence:** Synthesized from Hocuspocus, Yjs, and git recovery patterns.

Sequence: (1) check git state via `git fsck --no-dangling`, (2) check filesystem for orphaned .tmp files (delete), (3) load Yjs binary from SQLite/sidecar if available, (4) fall back to markdown reconstruction if binary missing, (5) reconcile: if markdown is newer than binary (external edit), apply markdown changes to Y.Doc via disk bridge.

**Implication:** Production server should implement this startup sequence.

---

## Gaps / follow-ups
- Yjs binary storage location not decided (SQLite via Hocuspocus extension vs sidecar files in `.openknowledge/cache/`)
- Client-side y-indexeddb interaction with server restart recovery not fully investigated
- Performance of `git fsck --no-dangling` on repos with 10K+ objects not benchmarked
