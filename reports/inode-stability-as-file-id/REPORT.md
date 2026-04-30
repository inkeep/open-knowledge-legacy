---
title: Inode stability as file-and-folder identity
description: Empirical test of whether (dev, ino) provides a stable ID for content-directory files and folders across rename, move, copy, edit, and atomic-save operations.
tags: [report, filesystem, identity, file-watcher]
---

# Inode stability as file-and-folder identity

## Context

Slack discussion (Mike Rashkovsky):

> would using the folder's inode work? seems like it should hold up across mv operations

Concretely, the proposal is:

```ts
import { stat } from "node:fs/promises";

async function getFolderId(path: string) {
  const s = await stat(path, { bigint: true });
  if (!s.isDirectory()) throw new Error("Not a directory");
  return `${s.dev}:${s.ino}`;
}
```

This report runs an 11-test bash harness against `/tmp` (APFS) on macOS to characterize where `dev:ino` actually holds and where it breaks, with implications for using inode as a file-or-folder identity inside an Open Knowledge content directory.

## TL;DR

`dev:ino` is a **partially stable** identity. It survives every same-filesystem rename and move — including renames of an ancestor directory — and one specific file-watcher gotcha invalidates it for the most common write path:

- ✅ Folder rename / move within the same FS — inode preserved.
- ✅ Files inside a moved/renamed folder — inodes preserved.
- ❌ Editor "atomic save" (`write tmp + rename over`) — **new inode** for the file. This is the default save path for VS Code, vim, and many others.
- ❌ Cross-filesystem move — both `dev` and `ino` change.
- ❌ `cp`, `rm + recreate` — new inode (expected).
- ⚠ Symlinks: `stat` follows by default, `lstat` doesn't — pick deliberately.
- ⚠ Hardlinks: one inode, multiple paths — `dev:ino` is no longer one-to-one with a "file."

For Open Knowledge, where content is markdown files edited by a wide range of external editors, **inode is not reliable as the primary identity for files**. It remains useful as a **strong signal for folder rename detection** and as **one input** to a file-watcher's heuristic for "is this the same file I saw a moment ago" — alongside path, size, and content hash. This matches the existing project stance that **path is identity** for documents in the content directory.

## Test results

All tests run on macOS Darwin 25.4.0, APFS via `/tmp`. Re-run with `bash test.sh` from this directory.

| #  | Operation                                                       | Inode behavior              | Stable for ID? |
| -- | --------------------------------------------------------------- | --------------------------- | -------------- |
| 1  | `mv folder-a folder-b` (same FS)                                | preserved                   | ✅              |
| 2  | `mv folder /other-dir/` (same FS)                               | preserved                   | ✅              |
| 3  | Rename a parent — children's inodes                             | preserved                   | ✅              |
| 4  | `cp file file-copy`                                             | new inode                   | ❌              |
| 5  | `rm` + recreate at same path                                    | new inode                   | ❌              |
| 6a | In-place edit (`echo v2 >> file`)                               | preserved                   | ✅              |
| 6b | Atomic-save (`echo v2 > tmp && mv tmp file`)                    | **new inode**               | ❌              |
| 7  | Cross-filesystem move (HFS+ disk image)                         | new `dev` AND `ino`         | ❌              |
| 8  | Symlink: `stat` follows / `lstat` doesn't                       | two distinct inodes         | depends        |
| 9  | Hardlink                                                        | same inode, multiple paths  | ⚠ ambiguous    |
| 10 | 200 rapid create/delete cycles in `/tmp`                        | 0 reuses, 200 unique inodes | ✅ short-term   |
| 11 | Editor save (write-tmp + rename, the gotcha)                    | **new inode**               | ❌              |

### Verbatim output (final run)

```
Running in: /tmp/inode-test-final
Filesystem dev: 16777232

=== TEST 1: Rename folder within same FS ===
Before rename: 16777232:197741127
After  rename: 16777232:197741127
STABLE

=== TEST 2: Move folder into another folder (same FS) ===
Before move: 16777232:197741127
After  move: 16777232:197741127
STABLE

=== TEST 3: Files inside a moved folder keep their inodes ===
File before parent rename: 16777232:197741129
File after  parent rename: 16777232:197741129
STABLE

=== TEST 4: cp creates a NEW inode ===
Original: 16777232:197741129
Copy:     16777232:197741130
CHANGED (expected)

=== TEST 5: rm + recreate at same path ===
Original: 197741131
Recreate: 197741132
NEW INODE

=== TEST 6: In-place edit vs atomic-save (write-tmp + rename) ===
inplace before: 197741133
inplace after edit (>>): 197741133
atomic before: 197741134
atomic after (write-tmp + mv): 197741135

=== TEST 7: Cross-filesystem move (HFS+ disk image) ===
/tmp dev:              16777232
/Volumes/XFSTest dev: 16777238
Before: 16777232:197741138
After:  16777238:18
CHANGED (expected)

=== TEST 8: Symlink — own inode vs target inode ===
ls -lid linkdir   (the symlink itself):
197741140 lrwxr-xr-x  1 andrew  wheel  7 Apr 30 ... linkdir -> realdir
ls -liLd linkdir  (follows to target):
197741139 drwxr-xr-x  2 andrew  wheel  64 Apr 30 ... linkdir
ls -lid realdir   (target):
197741139 drwxr-xr-x  2 andrew  wheel  64 Apr 30 ... realdir

=== TEST 9: Hardlink — same inode, different paths ===
original: 16777232:197741141
hardlink: 16777232:197741141
after rm original.md, hardlink.md still exists:
  content: v1
  inode:   197741141

=== TEST 10: Rapid create/delete churn ===
200 create/delete cycles → 0 inode reuses, 200 unique inodes

=== TEST 11: Editor-style atomic save (the gotcha) ===
Before save: 197741345
After save:  197741346
CHANGED — file watchers keying on inode see this as 'deleted + new file'
```

## Discussion — what each result means for an Open Knowledge file/folder ID

### Folders are well-behaved (Tests 1–3)

For the original framing — "stable folder identity across moves" — the answer is yes, on the same filesystem. A folder rename preserves the folder's inode AND every descendant file's inode. A naive watcher that keyed off path would see "every file changed"; an inode-aware watcher correctly sees "the folder moved, everything inside is the same."

This is the strongest case for using `dev:ino` as a folder identity in the file-watcher / shadow-repo / backlink layers.

### Files break under atomic save (Tests 6 + 11)

This is the most consequential result. The "atomic save" pattern — write a temp file, fsync, rename over the target — is the default save path for VS Code, vim (with `:set backupcopy=auto`, the default on most systems), nvim, IntelliJ, and many other editors. It changes the inode every save.

A file-watcher keying on inode for identity would observe every save as a "delete + create" pair rather than a "modify." The Open Knowledge file-watcher already handles this case via path-based reconciliation; introducing inode as the primary key would make the common path harder, not easier.

### Cross-filesystem moves change `dev` (Test 7)

This is the documented limitation in the original Slack message. For a content directory that lives on a single volume — the typical case — this doesn't matter. For users who move a vault between an internal drive and an external drive, identity would reset. Same outcome as today (path-based identity).

### Symlinks vs hardlinks (Tests 8 + 9)

- **Symlinks** are two filesystem objects with two inodes; whether your code "sees through" the link depends on `stat` vs `lstat`. Node's `fs.stat()` follows by default. The repo's existing handling (`reports/symlink-handling-file-sync-crdt/REPORT.md`) already addresses this with realpath-based identity inside the content directory.
- **Hardlinks** invert the relationship: one inode, multiple paths. If `dev:ino` were the primary identity, two paths would map to one document — which may or may not be desired. (The current path-as-identity model treats them as two documents pointing at the same bytes; a watcher would receive events for whichever path was touched.)

### Inode reuse is not an immediate concern (Test 10)

200 rapid create/delete cycles produced 200 unique inodes on APFS. APFS uses 64-bit inodes that are not reused within a session in normal operation. Test 5 only saw a numerically-adjacent inode, not the recycled previous one. So short-term reuse hazard is low in practice, even though the API doesn't promise that.

## Implications for Open Knowledge

This report does not propose a design change. It characterizes the technique so a future spec discussion has evidence to reference.

- **Path remains identity** for documents in the content directory. Confirmed by memory (`Filesystem is the source of truth — path is identity`) and by Tests 6 + 11: inode-as-primary-id would break every save by every editor that uses atomic save.
- **Inode is a useful folder-rename signal.** When the watcher sees "folder X disappeared and folder Y appeared," matching inodes is a strong tell that this was a rename rather than a delete + create. Same logic applies to files in the rare case where the editor uses in-place writes (Test 6a).
- **Inode is not sufficient by itself.** Cross-FS moves, atomic saves, and `cp` all produce inode changes that are NOT semantic identity changes. Combining `dev:ino` with content hash + size + path would be needed for a robust "is this the same document" decision.
- **Existing symlink handling stands.** The repo already uses realpath-based identity for symlink edge cases — see `reports/symlink-handling-file-sync-crdt/REPORT.md`. Inode would not change that conclusion.

## How to run

```bash
bash reports/inode-stability-as-file-id/test.sh
# optional: pass a different test directory
bash reports/inode-stability-as-file-id/test.sh /tmp/my-inode-test
```

The script creates and tears down its own test directory; safe to re-run. macOS-specific (uses `stat -f` and `hdiutil`); a Linux port would substitute `stat -c '%d:%i'` and a `tmpfs` mount for Test 7.
