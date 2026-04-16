---
title: "Symlink Handling in File-Sync / CRDT / Editor Pipelines"
description: "Evidence-driven analysis of symlink semantics across rename(2), Node.js fs, watchers, editors, LSPs, and git — to drive the design of symlink-preserving persistence and realpath-based document identity in the open-knowledge server."
createdAt: 2026-04-12
updatedAt: 2026-04-12
subjects:
  - Node.js
  - "@parcel/watcher"
  - chokidar
  - write-file-atomic
  - VS Code
  - Obsidian
  - rust-analyzer
  - gopls
  - Hocuspocus
  - Yjs
  - git
topics:
  - filesystem atomicity
  - symlink identity
  - CRDT persistence
  - file watchers
  - TOCTOU security
---
# Symlink Handling in File-Sync / CRDT / Editor Pipelines

**Purpose:** Derive concrete, evidence-grounded design decisions for two related changes to the open-knowledge server:

1. A symlink-preserving persistence write path (replacing the current `writeFile(tmp) + rename(tmp, target)` that silently clobbers symlinks).
2. A realpath-based document identity layer in the file watcher, so two aliased paths (e.g. `CLAUDE.md` → `AGENTS.md`) resolve to the same Y.Doc.

This report is the source-of-truth for the subsequent SPEC.md. It cites primary sources (POSIX man pages, Node.js docs, VS Code / rust-analyzer / gopls issue trackers, npm package source, CVE records) so every recommendation is traceable.

---

## Executive Summary

**For persistence writes: implement the **`write-file-atomic`** pattern — realpath the destination, then atomic tmp+rename against the canonical path.** This is the exact fix npm shipped in `write-file-atomic@1.3.1` to resolve the same class of bug we hit. It preserves atomicity (tmp + atomic rename on the same filesystem) and preserves symlinks (the link entry is untouched; its target gets replaced atomically). Security side-effect: realpath also lets us enforce that writes cannot escape `contentDir`, which is independently worth doing.

**For watcher identity: realpath every indexed file at discovery time, keyed into the index by canonical path, with alias paths recorded as secondary lookup keys.** This matches how TypeScript, Node's require cache, rust-analyzer, and pnpm resolve module identity. The cost — one extra `lstat`/`realpath` per indexed file at startup, negligible on modern filesystems — is far smaller than the correctness wins (no duplicate Y.Docs, no double-edit races, no broken "same file two tabs" UX).

**The specific bug we hit is real, confirmed, and has two plausible contributors:** (a) the persistence rename-clobber described above, and (b) git merge drift that at some point committed `CLAUDE.md` as a regular file. The persistence fix addresses (a) directly. (b) is a git discipline issue outside the server's scope — but the persistence fix means that *if* the worktree has a symlink when the server starts, it will stay a symlink.

**Major tradeoffs:**

- **Atomic vs write-through:** We recommend atomic (realpath-then-rename). Write-through (`writeFile` directly) is simpler but sacrifices crash-safety. The write-file-atomic pattern gives us both.
- **Strict vs permissive escape policy:** We recommend **strict by default** (reject writes whose canonical path is outside contentDir). This matches the OWASP guidance reflected in multiple tar/container CVEs. A config escape hatch is cheap to add later if needed.
- **Realpath dedup strategy:** We recommend **canonical path as primary key**, with original-path-as-alias recorded for the watcher-event ↔ docName lookup. This is a small indirection but matches how every robust comparable system (TypeScript, rust-analyzer, pnpm) handles it.

**Key Findings:**

- `rename(2)`** overwrites symlinks atomically with the new file** — it does not follow links ([rename(2) man page](https://man7.org/linux/man-pages/man2/rename.2.html)). This is the direct mechanism of our persistence bug.
- `fs.writeFile`** follows symlinks** (writes through to the target) but is not atomic. `write-file-atomic` in 2017 added realpath-then-rename to reconcile the two — the canonical fix.
- **@parcel/watcher's symlink behavior is formally undocumented** ([open issue #173](https://github.com/parcel-bundler/watcher/issues/173)); we cannot assume it fires events reliably for symlinks. We must enumerate symlinks explicitly at the application layer.
- **VS Code chose NOT to realpath** workspace folders and lives with the "same file two tabs" bug ([#100533](https://github.com/microsoft/vscode/issues/100533)). We should choose differently — our identity model (docName) makes realpath dedup trivially correct.
- **No Hocuspocus/Yjs persistence extension handles symlinks** — this is genuinely novel territory. We are building the reference pattern.

---

## Research Rubric

The 12 research questions supplied in the task prompt served as the rubric. Each has a dedicated section below. Stance: **factual with grounded recommendation** — the report documents evidence and states a recommendation with rationale, but the final decision is the operator's in the SPEC.

---

## Detailed Findings

### 1. Atomic writes through symlinks

**Finding:** `rename(2)` and Node's `fs.rename` atomically **replace** a symlink at the destination with the renamed source file. Neither follows the link. This is POSIX-specified behavior and Node.js inherits it without abstraction.

**Evidence:** [evidence/rename-posix-node.md](evidence/rename-posix-node.md). Direct quote from [rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html):

> "If oldpath refers to a symbolic link, the link is renamed; if newpath refers to a symbolic link, the link will be overwritten."

By contrast, `fs.writeFile` (and POSIX `open(path, O_WRONLY|O_CREAT|O_TRUNC)`) **does** follow symlinks — it opens the target and writes through. This is exactly the asymmetry that causes the bug: the naive atomic-write pattern `writeFile(tmp) + rename(tmp, target)` has the correct atomicity but the wrong symlink semantics, because `rename` does not preserve the link.

**The canonical fix, shipped by **`write-file-atomic@1.3.1`** in January 2017:**

1. Call `fs.realpath(target)` → `canonical`.
2. Write the tmp file next to `canonical` (same directory → same filesystem → rename-atomic).
3. `rename(tmp, canonical)`.
4. The symlink at the original path is untouched; its target has been atomically replaced.

Maintainer commit message for the fix: *"When the target is a symlink, write-file-atomic now overwrites the destination of the symlink, instead of replacing the symlink itself. This makes its behavior match *`fs.writeFile`*."*

**Implications:**

- Our persistence fix is a direct port of this pattern. No novel algorithm required.
- The tmp file MUST be created next to the **canonical** path, not next to the symlink — otherwise rename could cross filesystems (EXDEV) if the symlink points to a different volume.
- For broken symlinks (target missing), `realpath` throws `ENOENT`. Fallback: write to the symlink's own path, which creates a new regular file there. This is the only defensible behavior for a broken link.

### 2. Realpath semantics and caching

**Finding:** `fs.realpath` and `fs.realpath.native` resolve the canonical path on every call via `lstat(2)`/`readlink(2)`. There is no hidden process-wide cache. Repointing a symlink at runtime (`ln -sf newtarget link`) is reflected immediately on the next `realpath` call. Max symlink chain depth is OS-defined (Linux: 40).

**Evidence:** [evidence/realpath-semantics.md](evidence/realpath-semantics.md). Confirmed against [Node.js fs docs](https://nodejs.org/api/fs.html) and nodejs/node PR history ([PR #10253](https://github.com/nodejs/node/pull/10253), inode bigint fix [commit b894df8](https://github.com/nodejs/node/commit/b894df860a)).

**Implications:**

- Safe to call `realpath` per-write without worrying about stale results.
- At scale (thousands of files indexed at startup), per-call realpath is not free — PR #10253 saved \~6200 lstat calls in a fresh ember build. For our watcher index, we should realpath **once per path at discovery/watcher-event time** and cache in our own data structure.
- `realpath` throws `ENOENT` for broken symlinks and non-existent paths. Calling code must handle both cases.

### 3. How Obsidian handles symlinks

**Finding:** Obsidian does **not** officially support symlinks. The community-plugin prior art (pjeby/obsidian-symlinks, now archived) documents the full spectrum of failure modes: duplicate search results from aliased files, missed change events on symlinked files, and infinite-loop traversal on cyclic symlinks.

**Evidence:** [evidence/comparable-systems.md](evidence/comparable-systems.md). Direct quotes from the Obsidian symlinks plugin README:

> "Symlinking to a target that is inside the same vault is likely to give you duplicate search results, among other issues."
> "It's unlikely that change events will be processed for symlinked files..."
> "This plugin doesn't check for symlink loops (direct or indirect) ... you run the risk of Obsidian trying to load infinite subdirectories, using up all your memory, crashing Obsidian, and maybe your computer along with it."

**Implications:** Obsidian is the cautionary tale. Any approach we ship must explicitly handle: (a) alias deduplication, (b) reliable event routing back to the canonical Y.Doc, (c) cycle detection during index enumeration.

### 4. How Foam and Dendron handle symlinks

**Finding:** Neither has dedicated symlink handling. Foam inherits VS Code's FileSystem API behavior. Dendron has symlinked-vault support as an open feature request, not an implementation.

**Evidence:** [evidence/comparable-systems.md](evidence/comparable-systems.md). Foam source search returned no symlink-specific code paths. Dendron [RFC 42 discussion](https://github.com/dendronhq/dendron/discussions/2349) notes "Dendron first would need to be able to handle Symlinks to handle this way of doing it."

**Implications:** No prior art to copy. We need to design this ourselves.

### 5. How VS Code workspace indexing handles symlinks

**Finding:** VS Code does **not** realpath workspace folders (changed from earlier behavior in PR #37144, Sept 2018, resolving [issue #18837](https://github.com/microsoft/vscode/issues/18837)). The cost of this choice is documented in [issue #100533](https://github.com/microsoft/vscode/issues/100533) ("Symbolic links to folders can lead to the same file opened in two tabs") — closed as out-of-scope. VS Code uses `@parcel/watcher` as its recursive watcher backend ([File Watcher Internals wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)).

**Evidence:** [evidence/comparable-systems.md](evidence/comparable-systems.md).

**Implications:** VS Code chose path-based identity over canonical-path identity because users (especially Perforce users) relied on workspace paths being preserved as-opened. Our situation is different: our user-facing identity is a `docName`, not a filesystem path. We have full latitude to realpath, and it costs us nothing user-visible.

### 6. How language servers handle symlinks

**Finding:** TypeScript / tsserver, rust-analyzer, gopls all converged on **canonicalize for identity** (with caveats). TypeScript's `preserveSymlinks` defaults to false (i.e., realpath on resolution). rust-analyzer explicitly canonicalizes in multiple code paths and even rejects symlinks in rust-project.json to avoid ambiguity. gopls has open correctness bugs (duplicate edits through aliases — [golang/go#59550](https://github.com/golang/go/issues/59550)) when canonicalization fails.

**Evidence:** [evidence/comparable-systems.md](evidence/comparable-systems.md). [TypeScript preserveSymlinks docs](https://www.typescriptlang.org/tsconfig/preserveSymlinks.html); rust-analyzer PR #15868, PR #14402; golang/go issues #74686, #74782, #59550.

**Implications:** The LSP ecosystem's convergence is strong evidence for canonical-path identity. The gopls bugs specifically — duplicate edits to files reachable via aliases — are the exact class of bug we would introduce if we did NOT realpath-dedupe.

### 7. How git handles symlinks

**Finding:** git stores symlinks as tree entries with mode `120000`; the blob content is the target path string. `core.symlinks` (default: true on Unix, false on Windows) controls whether checkout materializes a real symlink or a regular file containing the target string. **git never writes through a symlink** — on a mode conflict between index and worktree, it replaces whichever entry is wrong. If a prior commit has `CLAUDE.md` as a regular file (mode 100644) with literal content, `git checkout` of that commit replaces the symlink with a regular file.

**Evidence:** [evidence/watchers-and-git.md](evidence/watchers-and-git.md). [git-scm config docs](https://git-scm.com/docs/git-config).

**Implications:** This matters for our bug analysis (§12): the "merge drift" observation in commit `54ebbe9` strongly suggests at least one contributing factor was git-level — a branch committed `CLAUDE.md` as a regular file at some point, and checkouts of that branch materialized it. The persistence fix preserves what's in the worktree; it does not create symlinks. Keeping the symlink healthy in git history is an operator concern.

### 8. @parcel/watcher and chokidar behavior on symlinks

**Finding:**

- **chokidar** has an explicit `followSymlinks` option (default `true`) but leaky semantics: event paths can be either the symlink or the realpath depending on OS backend ([chokidar #691](https://github.com/paulmillr/chokidar/issues/691)), and multiple open bugs cover edge cases (#31, #696, #959).
- **@parcel/watcher** has **no documented symlink behavior** ([open issue #173](https://github.com/parcel-bundler/watcher/issues/173)). Inferred behavior varies by backend: inotify (Linux) follows by default; FSEvents (macOS) reports by path and misses external targets; ReadDirectoryChangesW (Windows) does not traverse reparse points. Circular symlinks can cause 100% CPU ([parcel #2069](https://github.com/parcel-bundler/parcel/issues/2069)).

**Evidence:** [evidence/watchers-and-git.md](evidence/watchers-and-git.md).

**Implications:** We cannot rely on @parcel/watcher to surface symlink events reliably. Our watcher module already performs an initial `readdir` walk to populate the file index — we must enhance that walk with `lstat` and `realpath` calls to catch symlinks explicitly at startup. Ongoing watcher events will fire for the canonical paths (inside our contentDir) and we route those to the correct Y.Doc via the canonical→docName map.

### 9. Security: symlink escape and TOCTOU

**Finding:** Symlink escape is a well-documented CVE class. TOCTOU (time-of-check-time-of-use) races are a real concern in adversarial environments. For our threat model (localhost dev tool, trusted user), **escape validation via realpath matters for user protection** (prevent accidental writes to `/etc/passwd` through a user-created link), but TOCTOU hardening (openat with O\_NOFOLLOW relative to a pinned root fd) is overkill.

**Evidence:** [evidence/security-and-platform.md](evidence/security-and-platform.md). CVE-2021-32803 (node-tar), CVE-2025-47290 (containerd), CVE-2022-29799/29800 (systemd networkd-dispatcher), CVE-2026-32282 (Go Root.Chmod).

**Implications:** On every write, realpath the target and verify `canonical.startsWith(contentRoot)`. On escape: refuse the write by default (strict); log clearly. An optional config allowlist can be added later if a concrete need emerges.

### 10. Platform differences

**Finding:** macOS APFS and Linux ext4/btrfs/zfs: POSIX-compliant symlinks, no surprises. Windows NTFS: symlink creation requires `SeCreateSymbolicLinkPrivilege` (admin) or Developer Mode (Win10 1703+). Junctions are a legacy NTFS reparse-point variant that works without privilege but only for directories and absolute paths. **Node.js abstracts these** — `fs.lstat().isSymbolicLink()` returns true for both junctions and symlinks; `fs.realpath` resolves both transparently.

**Evidence:** [evidence/security-and-platform.md](evidence/security-and-platform.md). [Windows Developer Blog on symlinks](https://blogs.windows.com/windowsdeveloper/2016/12/02/symlinks-windows-10/), [Git for Windows symlinks](https://gitforwindows.org/symbolic-links).

**Implications:** We do not need platform-specific code. We only read/traverse symlinks — we never create them from the server. No privilege requirements on any platform for our access pattern.

### 11. Yjs/Hocuspocus ecosystem prior art

**Finding:** No Hocuspocus or Yjs persistence extension handles symlinks. The ecosystem's persistence integrations (SQLite, Redis, S3, generic database) sidestep filesystem concerns entirely. Filesystem-markdown CRDT systems exist (Logseq, Obsidian Sync) but their persistence is proprietary.

**Evidence:** [evidence/hocuspocus-ecosystem.md](evidence/hocuspocus-ecosystem.md). Negative search across ueberdosis/hocuspocus, Yjs discuss forum.

**Implications:** This is novel territory for the Yjs/Hocuspocus ecosystem. Our design should combine two well-established patterns from adjacent domains: `write-file-atomic`'s atomic-with-symlinks write pattern, and language-server-style canonical-path identity. We should document our pattern clearly — it may well become the ecosystem reference.

### 12. The specific bug (commit `12e7998` → `54ebbe9` restoration)

**Finding:** Both hypothesized root causes are confirmed and are non-exclusive.

1. **Persistence **`rename(tmp, symlinkPath)`** replaces the symlink atomically** — mechanistically confirmed against rename(2) semantics (§1). `packages/server/src/persistence.ts` lines 369–385 do not realpath before rename; `safeContentPath` does not realpath either. Any CRDT save to `CLAUDE.md` will replace the symlink.
2. **Git merge drift** — the restoration commit is titled `"docs: restore CLAUDE.md → AGENTS.md symlink and merge drift"`. Git history shows multiple content-touching commits on `CLAUDE.md` after the symlink was established, suggesting at some point a branch committed it as a regular file, and checkout of that branch materialized a regular file.

**Evidence:** [evidence/our-bug-analysis.md](evidence/our-bug-analysis.md).

**Implications:** The persistence fix (this spec) addresses cause (1) directly and completely. Cause (2) is outside server scope and is addressed by operator discipline — but with the persistence fix in place, once the worktree has the symlink back, subsequent edits keep it a symlink.

---

## Decision Matrix

| Axis                        | Option A                           | Option B                                     | Option C                                         | Recommendation                      | Rationale                                                                             |
| --------------------------- | ---------------------------------- | -------------------------------------------- | ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------- |
| **Write semantics**         | Atomic tmp+rename (current, buggy) | Write-through `writeFile(symlinkPath)`       | Realpath-then-rename (write-file-atomic pattern) | **C**                               | Preserves both atomicity and symlink. Directly ports npm's 2017 fix.                  |
| **Escape policy**           | Permissive (any canonical path)    | Strict (reject writes outside contentDir)    | Allowlist (config-driven exceptions)             | **B** default, **C** optional later | Matches OWASP guidance and multiple CVE mitigations.                                  |
| **Watcher identity**        | Path-based (current)               | Realpath-based primary, path-alias secondary | Fully realpath (drop original paths)             | **B**                               | Matches TypeScript/rust-analyzer/pnpm convergence. Alias map preserves event routing. |
| **Cycle detection**         | None (current)                     | Visited-inode set during enumeration         | OS-limit only (rely on realpath ELOOP)           | **B**                               | Parcel #2069 shows the 100% CPU footgun of trusting OS limits alone.                  |
| **Broken symlink behavior** | Crash on ENOENT                    | Write at original path (create regular file) | Skip silently                                    | **B**                               | Only defensible choice — the user's intent was clearly "a file at this path."         |
| **Realpath cache**          | Call per event (simple)            | Cache in watcher index (fast)                | LRU with TTL                                     | **B**                               | File watcher index already keys per-path; canonical+inode fields are trivial to add.  |

---

## Edge Case Catalog

| Case                                                      | Recommended behavior                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write to regular file (no symlinks)                       | Current path: tmp+rename. Realpath returns the file itself; no behavior change.                                                                         |
| Write to symlink → file inside contentDir                 | Realpath to canonical; tmp next to canonical; rename to canonical. Symlink preserved.                                                                   |
| Write to symlink → file outside contentDir                | Strict mode: refuse with clear error. User can add an allowlist entry if intentional.                                                                   |
| Write to symlink → non-existent target (broken)           | Realpath throws ENOENT. Fall back to direct write at original path. Creates a regular file at the symlink location. Log warning.                        |
| Write to path that does not exist                         | Same as broken symlink — no realpath target; direct write at the path creates the file.                                                                 |
| Write to symlink chain (A → B → C)                        | `realpath(A)` returns C; tmp next to C; rename to C. All intermediate links preserved.                                                                  |
| Cyclic symlink chain (A → B → A)                          | `realpath` throws ELOOP. Refuse the write with a clear error. Log the cycle.                                                                            |
| Two paths aliased to same inode (hardlink)                | Hardlinks share inode but distinct directory entries. Minor case; dedup by inode if ever observed.                                                      |
| Symlink to directory containing content files             | Watcher enumeration follows; realpath each file inside; dedup by canonical. First-encountered path wins for the alias map.                              |
| Symlink repointed at runtime                              | Next realpath call returns the new target. Next write hits the new canonical. Old alias map entry cleared on next watcher event.                        |
| Symlink created at runtime inside contentDir              | Watcher 'add' event fires on original path. Handler does lstat→realpath; dedup into known docName or apply escape policy.                               |
| Symlink deleted at runtime                                | Watcher 'unlink' fires. Remove from alias map. Canonical entry persists (its real file still exists).                                                   |
| Write race: symlink repointed between realpath and rename | Worst case: write lands at the previous canonical. Watcher reconciliation detects drift; CRDT sync corrects. Not a data-loss scenario.                  |
| Same file reachable via two symlinks                      | Both map to same canonical docName. No duplicate Y.Doc. Watcher events from either path route to the same Y.Doc.                                        |
| Cross-filesystem symlink (target on a different volume)   | tmp file colocated with canonical → same filesystem → rename works. Fallback to write-through with warning if colocation impossible.                    |
| Windows: target path contains reparse point (junction)    | `fs.realpath` resolves transparently. No special handling.                                                                                              |
| Windows: `core.symlinks=false` checkout                   | File in worktree is a regular file containing the target path string. Git-side issue; server sees a regular file and treats it as one. Not our concern. |

---

## Open Questions

These could not be resolved from external evidence and are user-decisions for the SPEC:

1. **Scope of realpath dedup at startup.** Realpath-everything at first `readdir`, or lazy (first time a path is touched)? Eager is simpler and more predictable. *Leaning eager.*

2. **UI surfacing of symlink state.** Should the editor indicate "this doc is also reachable via CLAUDE.md and AGENTS.md"? Purely a UX question; the underlying identity model supports it if desired.

3. **Config key for escape policy.** `content.symlinks.allowEscape: false` with optional `content.symlinks.allowedExternalPaths: []`? Naming and shape.

4. **Should we reject writes when realpath disagrees with **`safeContentPath`**'s containment check?** `safeContentPath` already guards against `..` traversal. With realpath, we add a second layer. If they disagree (symlink inside contentDir whose realpath is outside), the realpath check is stricter — this should refuse the write in strict mode.

5. **Git-level symlink preservation:** is it worth adding a startup check that warns if git's working tree differs from what the watcher expects? Scope creep risk; probably not part of this spec but worth flagging.

6. **Logseq investigation.** Logseq is the closest open-source comparable. We did not examine its source in this pass. A follow-up could confirm or challenge our "novel territory" claim in §11.

---

## References

### Evidence Files

- [evidence/rename-posix-node.md](evidence/rename-posix-node.md) — POSIX rename(2), Node fs, write-file-atomic pattern
- [evidence/realpath-semantics.md](evidence/realpath-semantics.md) — Node realpath caching and ELOOP behavior
- [evidence/comparable-systems.md](evidence/comparable-systems.md) — Obsidian, Foam, Dendron, VS Code, tsserver, rust-analyzer, gopls
- [evidence/watchers-and-git.md](evidence/watchers-and-git.md) — chokidar, @parcel/watcher, git core.symlinks
- [evidence/security-and-platform.md](evidence/security-and-platform.md) — CVEs, Windows privilege model, platform matrix
- [evidence/hocuspocus-ecosystem.md](evidence/hocuspocus-ecosystem.md) — negative search across Yjs/Hocuspocus persistence
- [evidence/our-bug-analysis.md](evidence/our-bug-analysis.md) — persistence.ts review + git history of CLAUDE.md

### External Sources (primary)

- [rename(2) Linux manual page](https://man7.org/linux/man-pages/man2/rename.2.html)
- [Node.js File System docs](https://nodejs.org/api/fs.html)
- [write-file-atomic issue #5 — symlink handling](https://github.com/npm/write-file-atomic/issues/5)
- [TypeScript preserveSymlinks](https://www.typescriptlang.org/tsconfig/preserveSymlinks.html)
- [@parcel/watcher issue #173 — document symlinks](https://github.com/parcel-bundler/watcher/issues/173)
- [chokidar README — followSymlinks](https://github.com/paulmillr/chokidar)
- [VS Code #18837 — do not realpath workspace](https://github.com/microsoft/vscode/issues/18837)
- [VS Code #100533 — duplicate tabs via symlink](https://github.com/microsoft/vscode/issues/100533)
- [rust-analyzer PR #15868 — canonicalize OUT\_DIR](https://github.com/rust-lang/rust-analyzer/pull/15868)
- [golang/go #59550 — duplicate edits via symlink aliases](https://github.com/golang/go/issues/59550)
- [CVE-2021-32803 — node-tar symlink path traversal](https://www.sentinelone.com/vulnerability-database/cve-2021-32803/)
- [Windows Developer Blog — Symlinks in Windows 10](https://blogs.windows.com/windowsdeveloper/2016/12/02/symlinks-windows-10/)
- [git-config docs — core.symlinks](https://git-scm.com/docs/git-config)

