# Evidence: Node.js fs.realpath semantics and caching

**Dimension:** Realpath semantics and caching
**Date:** 2026-04-12
**Sources:** Node.js docs, nodejs/node PR history

---

## Key references

- https://nodejs.org/api/fs.html#fsrealpathpath-options-callback
- https://github.com/nodejs/node/pull/10253 — cache non-symlinks in realpathSync
- https://github.com/nodejs/node/commit/b894df860a — inode bigint fix

---

## Findings

### Finding: fs.realpath resolves symlinks on every call; no persistent process-wide cache
**Confidence:** CONFIRMED
**Evidence:** Node.js fs docs. `fs.realpath()` and `fs.realpath.native()` resolve the canonical path at call time by issuing `lstat(2)`/`readlink(2)` syscalls along the path chain. There is an **optional** `cache` argument for `fs.realpathSync` (legacy API) that lets callers provide their own memoization object — but it is opt-in and caller-owned. There is no hidden process-wide cache.

**Implication:** When a symlink is repointed at runtime (`ln -sf newtarget link`), the next `realpath` call returns the new target immediately. We can safely call `realpath` per-write without worrying about stale cached results.

### Finding: fs.realpath.native delegates to OS-level `realpath(3)`; `fs.realpath` is a JS re-implementation
**Confidence:** CONFIRMED
**Evidence:** Node fs docs — "The native realpath() function used internally by fs.realpath.native() is the C library realpath(3)." The pure-JS version walks components via lstat to produce equivalent results. Both resolve chained symlinks up to OS-defined limits.

### Finding: Max symlink depth is OS-defined (Linux default: 40)
**Confidence:** CONFIRMED
**Evidence:** Linux kernel constant `MAXSYMLINKS = 40` (in `include/linux/namei.h`); `realpath(3)` returns `ELOOP` beyond this. Node surfaces this as `ELOOP` on the returned error.

### Finding: realpath is not cheap at scale — non-symlink caching was added to avoid per-request lstat overhead
**Confidence:** CONFIRMED
**Evidence:** nodejs/node PR #10253 — caching non-symlinks into `realpathSync`'s optional cache saved ~6200 lstat calls in a fresh `ember build` (out of ~70000 syscalls). A naive `realpath` on every CRDT write is tractable (one call per write, not per module), but for the file watcher index we should `realpath` once per indexed path and cache inode→realpath.

### Finding: Broken symlinks cause realpath to throw ENOENT
**Confidence:** CONFIRMED
**Evidence:** Node fs docs; realpath(3) returns ENOENT when any path component (including the symlink target) is missing.

**Implication:** Our write path must handle `ENOENT` from realpath — on a broken link, fall back to writing at the link's own path (which will create a regular file at that location, which is "correct" for a broken link, since the target no longer exists).

---

## Gaps / follow-ups

- Race: symlink is repointed between `realpath(path)` and `rename(tmp, canonical)`. Minor — worst case we write to the previous target, CRDT next save corrects.
