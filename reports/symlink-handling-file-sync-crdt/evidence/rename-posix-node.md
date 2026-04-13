# Evidence: rename(2) and Node.js fs semantics on symlinks

**Dimension:** Atomic writes through symlinks
**Date:** 2026-04-12
**Sources:** man7.org rename(2), Node.js docs, write-file-atomic repo

---

## Key references

- https://man7.org/linux/man-pages/man2/rename.2.html — POSIX/Linux rename(2)
- https://nodejs.org/api/fs.html — Node.js fs documentation (v25.x)
- https://github.com/npm/write-file-atomic/issues/5 — upstream symlink bug + fix
- https://github.com/npm/write-file-atomic — current implementation

---

## Findings

### Finding: rename(2) does NOT follow symlinks — it operates on the link itself
**Confidence:** CONFIRMED
**Evidence:** rename(2) man page, quoted via WebFetch 2026-04-12

> "If oldpath refers to a symbolic link, the link is renamed"
> "if newpath refers to a symbolic link, the link will be overwritten."

**Implication:** When our persistence code does `rename(tmp, target)` and `target` was a symlink, the symlink is atomically **replaced** by the regular tmp file. The old link — and its target path — is lost. The file on the other side of the link is untouched but the vault entry now points at a freshly created regular file.

### Finding: fs.writeFile DOES follow symlinks (opens the target, truncates, writes)
**Confidence:** CONFIRMED
**Evidence:** Node.js behaves per POSIX `open(2)` semantics — `open(path, O_WRONLY|O_CREAT|O_TRUNC)` on a symlink traverses the link unless `O_NOFOLLOW` is set, which Node does not set. write-file-atomic issue #5 confirms this as the baseline Node behavior the package needed to preserve.

**Implication:** A direct `fs.writeFile(symlinkPath, data)` writes through to the target file and preserves the link. This is the write-through pattern. Tradeoff: it is NOT atomic (partial-write window on crash).

### Finding: write-file-atomic resolves the symlink via realpath before tmp+rename
**Confidence:** CONFIRMED
**Evidence:** write-file-atomic issue #5, resolved in v1.3.1 (commit f90c7dd, Jan 2017):

> "When the target is a symlink, write-file-atomic now overwrites the destination of the symlink, instead of replacing the symlink itself. This makes its behavior match fs.writeFile."

Implementation pattern (paraphrased from the package source lineage):
1. `realpath(target)` → canonical
2. write `tmp` next to the **canonical** path (same directory as the real file, so rename stays same-filesystem)
3. `rename(tmp, canonical)`
4. symlink at original path is untouched; its target has been atomically replaced

**Implication:** This is the canonical pattern for "atomic AND symlink-preserving." It is the pattern `npm` itself uses for package.json, lock files, etc. It is the direct fix for our bug.

### Finding: rename(tmp, target) is only atomic within a single filesystem
**Confidence:** CONFIRMED
**Evidence:** rename(2) — EXDEV error: "oldpath and newpath are not on the same mounted filesystem." Symlinks can cross mount points, so realpath-then-rename must also validate that the tmp directory is on the same filesystem as the real target, or fall back to write-through.

### Finding: fs.rename on Windows — behavior near-identical on NTFS
**Confidence:** INFERRED
**Evidence:** libuv translates `uv_fs_rename` to `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`. MoveFileEx on an existing reparse point (symlink) replaces the reparse point itself. There is no documented "follow-then-replace" variant. Node's behavior matches POSIX on this point.

---

## Negative searches

- Searched Node fs docs for explicit "rename" + "symlink" prose — Node docs do not spell out the symlink behavior; they defer to POSIX. This is itself evidence: there is no Node-level abstraction or flag.
- Searched for `fs.rename` options `{ followSymlinks: true }` — no such option exists in Node.js.

---

## Gaps / follow-ups

- Does `fs.rename` behave identically on exFAT / FAT32 (no symlink support)? Not relevant for our use case (content dirs are on native filesystems).
