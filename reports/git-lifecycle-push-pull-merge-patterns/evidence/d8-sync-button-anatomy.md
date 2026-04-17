# Evidence: D8 Sync Button Decomposition (Update 2026-04-14)

**Dimension:** D8 — What atomic operations hide behind abstracted sync/save/backup buttons
**Date:** 2026-04-14
**Sources:** Obsidian-Git (source), TinaCMS (source), Logseq/git-auto (source), SiYuan/Dejavu (source), Joplin (source + spec), Linear (reverse-engineered), iCloud/Dropbox (docs)

---

## Key files / pages referenced

- `Vinzent03/obsidian-git` `src/main.ts` — `commitAndSync()` sequence
- `Vinzent03/obsidian-git` `src/gitManager/simpleGit.ts` — git operations
- `Vinzent03/obsidian-git` `src/automaticsManager.ts` — `promiseQueue` serialization
- `tinacms/tinacms` `packages/tinacms-gitprovider-github/src/index.ts` — `onPut()` API flow
- [TinaCMS Editorial Workflow](https://tina.io/docs/tinacloud/editorial-workflow)
- [Logseq git-auto](https://github.com/logseq/git-auto) — archived shell script
- `siyuan-note/dejavu` `sync.go` — ~15-step sync protocol
- [Joplin sync spec](https://joplinapp.org/help/dev/spec/sync/) — 3-phase sync
- `laurent22/joplin` `packages/lib/Synchronizer.ts`
- [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)
- [Apple TN2336](https://developer.apple.com/library/archive/technotes/tn2336/_index.html) — iCloud conflicts
- [Dropbox conflicted copy help](https://help.dropbox.com/organize/conflicted-copy)

---

## Findings

### Finding: Obsidian-Git "Commit-and-sync" is a 4-6 step composite with no rollback
**Confidence:** CONFIRMED
**Evidence:** `Vinzent03/obsidian-git` `src/main.ts`, `src/gitManager/simpleGit.ts`

Sequence: stage all → commit → (conditional) pull → push. Double-press serialized via `promiseQueue.addTask()`. Failed pull does not prevent push attempt. Commit persists locally even if push fails. The plugin registers 30+ commands ranging from the unified "Commit-and-sync" to individual Stage/Unstage/Fetch.

### Finding: TinaCMS "Save" is near-atomic — single GitHub API commit
**Confidence:** CONFIRMED
**Evidence:** `tinacms/tinacms` `packages/tinacms-gitprovider-github/src/index.ts`

`onPut()`: getContent (fetch SHA) → createOrUpdateFileContents (one commit). Default message: "Edited with TinaCMS." Editorial workflow: branch-per-editor → auto-generates draft PR → "Publish" = merge PR on GitHub.

### Finding: SiYuan/Dejavu sync is a 15-step lock-protected protocol with semantic block-level merging
**Confidence:** CONFIRMED
**Evidence:** `siyuan-note/dejavu` `sync.go`

Sequence: acquire lock → retrieve indexes → compare IDs → download/upload (concurrent) → three-way diff → semantic conflict detection (7-min temporal guard for `.sy` files) → generate conflict history → merge index → restore files → update references → release lock. Index updates are the "commit point."

### Finding: Joplin "Synchronise" is a 3-phase per-item protocol — not git-based
**Confidence:** CONFIRMED
**Evidence:** [Joplin sync spec](https://joplinapp.org/help/dev/spec/sync/), `Synchronizer.ts`

Phase 1: delete-remote. Phase 2: upload-local (conflict detection via `sync_time` comparison). Phase 3: download-remote (delta). Supports 7 sync targets (filesystem, WebDAV, OneDrive, Dropbox, S3, Joplin Server, Joplin Cloud). Conflicts go to "_Conflict_" notebook.

### Finding: Linear sync is invisible — no button, no user-facing "sync" concept
**Confidence:** CONFIRMED
**Evidence:** [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)

Write: MobX mutation → in-memory update (optimistic) → Transaction queue → IndexedDB cache → GraphQL → server `syncId`. Read: WebSocket delta packets. Transactions survive app restarts via IndexedDB `_transaction` table.

### Finding: iCloud and Dropbox use invisible OS/service-level sync with conflicted-copy patterns
**Confidence:** CONFIRMED
**Evidence:** [Apple TN2336](https://developer.apple.com/library/archive/technotes/tn2336/_index.html), [Dropbox help](https://help.dropbox.com/organize/conflicted-copy)

iCloud: content-based comparison → bounced files ("file 2.txt") or NSFileVersion dialog. Dropbox: `<filename> (<device>'s conflicted copy <YYYY-MM-DD>).<ext>`. Both persist conflicts until manually resolved.

---

## Decomposition Summary

| Tool | Button | Steps | Atomic? | Failure recovery |
|------|--------|-------|---------|-----------------|
| Obsidian-Git | "Commit-and-sync" | 4-6 | No | None; commit persists on push fail |
| TinaCMS | "Save" | 2 | Near-atomic (API) | API-level: no partial state |
| Logseq | None (auto) | 2 | Near-atomic (local) | No error handling |
| SiYuan | "Sync now" | ~15 | No (lock-protected) | Fast-fail; index is commit point |
| Joplin | "Synchronise" | 3 phases | No (per-item atomic) | sync_time checkpoint; lock-based |
| Linear | None (invisible) | ~8 | Server-side atomic | IndexedDB cache; auto-resubmit |
| iCloud | None (invisible) | OS-managed | File-level atomic | OS-managed; conflicts persist |
| Dropbox | None (invisible) | Service-managed | File-level atomic | Service-managed; copies persist |

---

## Gaps / follow-ups

- Logseq's archived `git-auto` script has no maintained successor; community scripts vary in quality
