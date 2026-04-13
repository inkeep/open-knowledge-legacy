# Evidence: File watchers and git

**Dimension:** @parcel/watcher, chokidar, git symlink handling
**Date:** 2026-04-12
**Sources:** chokidar docs, parcel-bundler/watcher, git-scm docs

---

## Findings

### chokidar: `followSymlinks` option, defaults to true
**Confidence:** CONFIRMED
**Evidence:** paulmillr/chokidar README (v3/v4):
> "followSymlinks (default: true). When false, only the symlinks themselves will be watched for changes instead of following the link references and bubbling events through the link's path."

Known issues from issue tracker:
- #31, #696 — Edge cases where symlinks to files don't reliably emit change events even with `followSymlinks: true`
- #691 — Symlinked file change reports the **real path**, not the watched symlink path, with "no way to find out the resolved path"
- #959 — `awaitWriteFinish` can incorrectly follow symlinks even when `followSymlinks: false`

**Implication:** chokidar's abstraction is leaky. The path reported in events can be either the symlink path or the real path depending on OS backend. Our watcher index needs to be resilient to either.

### @parcel/watcher: symlink behavior UNDOCUMENTED, open issue #173
**Confidence:** CONFIRMED (that it's undocumented)
**Evidence:**
- parcel-bundler/watcher issue #173 (open, May 2024): "Document how symlinks are handled" — opened by Ben McCann, unresolved
- parcel-bundler/parcel issue #4950: "Parcel does not watch/refresh changes inside a symlink folder" — observed behavior, not followed by default
- parcel-bundler/parcel issue #2069: invalid (circular) symlink causes 100% CPU on macOS

**Inferred behavior from source (based on community reports):**
- Linux (inotify backend): inotify is inode-based; watching a symlink via `inotify_add_watch` follows the link by default (does not have a `IN_DONT_FOLLOW` flag set by @parcel/watcher)
- macOS (FSEvents backend): FSEvents streams by path; symlinks outside the watched root are **not** reported even if the target is inside
- Windows (ReadDirectoryChangesW): does not traverse reparse points by default

**Implication:** Using @parcel/watcher, we should NOT assume symlinks fire events reliably. For our file index, we need to:
1. Enumerate symlinks explicitly at startup (`readdir` + `lstat`)
2. Realpath them
3. If realpath points inside contentDir, record both aliases mapping to the same docName
4. If realpath points outside contentDir, decide policy (include or exclude — see security evidence)

### git: `core.symlinks` controls whether working tree materializes symlinks
**Confidence:** CONFIRMED
**Evidence:** git-scm.com/docs/git-config:
- `core.symlinks` default: true on Unix, false on Windows (absent explicit user config)
- When true: git materializes the link; when false: git writes a plain file whose content is the target path string
- The tree object always stores the symlink entry as mode 120000 with blob = link target string

**Behavior on checkout/merge with mode conflict:**
- If core.symlinks=true and working tree has a regular file where index has a symlink, checkout **replaces** the regular file with a symlink (and vice versa)
- This is a stable, atomic semantic — git does not "write through" the symlink

**Critical:** git never writes through a symlink. If your worktree has `CLAUDE.md -> AGENTS.md`, and a rebase/merge modifies `CLAUDE.md` content (because some historical commit had it as a regular file with literal content), git will **replace the symlink with a regular file**. This is the git-level manifestation of our bug class.

### Our observed bug trajectory (git log of CLAUDE.md)
**Confidence:** CONFIRMED
**Evidence:** `git log --oneline -- CLAUDE.md`:
- 54ebbe9 "docs: restore CLAUDE.md → AGENTS.md symlink and merge drift" (most recent) — **symlink restored**
- 3a5ee59, 1f72b85, e5bfff4 — content edits (presumably through symlink or direct file writes)
- 12e7998 "chore: restore scoped research reports and fix reports config" — bulk commit that included CLAUDE.md content changes (likely git-checkout materialized the file)

The "broke → restored" cycle matches both (a) persistence write through tmp+rename clobbering the link, AND (b) git checkout on a branch that had CLAUDE.md as regular file clobbering the link on switch.

**Two root causes are plausible and non-exclusive:**
1. Persistence `rename(tmp, symlinkPath)` replaced the link with a regular file — matches the described bug.
2. A prior commit had CLAUDE.md as a regular file with literal content (`# Open Knowledge\n...`), and `git checkout` materialized that file, replacing the symlink. Once replaced, subsequent persistence writes reinforce the regular-file state.

Both should be addressed: (1) by realpath-before-rename; (2) is addressed by maintaining discipline — the symlink needs to exist consistently in the commit history, which is an operator-side concern.

---

## Gaps / follow-ups

- We did not enumerate exact @parcel/watcher source — the README defers to backend specifics, and the backends (FSEvents, inotify, ReadDirectoryChangesW) have their own quirks. Our watcher index is already doing a `readdir` walk at startup (per `file-watcher.ts`); we should do that walk with `lstat` awareness.
