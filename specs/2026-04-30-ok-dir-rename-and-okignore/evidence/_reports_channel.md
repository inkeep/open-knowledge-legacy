---
name: reports_channel
description: Reports-channel scan for prior research relevant to `.open-knowledge/` rename + `.okignore` lift
type: evidence
date: 2026-04-30
sources:
  - reports/CATALOGUE.md
  - reports/git-directory-nesting-shadow-repo/REPORT.md
depth: full
---

# Reports channel — relevant prior research

Scanned `reports/CATALOGUE.md` for entries related to: file-watcher, content-filter, gitignore handling, content scoping, path conventions, server.lock, shadow-repo, symlink. Two relevant hits.

## `git-directory-nesting-shadow-repo/REPORT.md` (2026-04-08) — HIGH relevance

**Status:** investigation that produced the current `.git/open-knowledge/` placement.

**Executive summary excerpt:**
> Yes, `.git/openknowledge/` is safe. Empirical testing and tool precedent analysis confirm that custom subdirectories inside `.git/` are untouched by git maintenance commands (`gc`, `prune`, `fsck`, `repack`), invisible to the git transport protocol (`clone`, `push --mirror`, `fetch`), and established practice for production tools (git-lfs, git-annex, git-branchless).

**Key findings carried forward:**
- `.git/<custom>/` is safe from `git gc --aggressive --prune=now`, `git fsck`, `git repack` (empirically tested).
- Invisible to `git clone`, `git push --mirror` (empirically tested + protocol design).
- Battle-tested pattern: git-lfs uses `.git/lfs/`, git-annex uses `.git/annex/`.
- Better for worktrees: `.git/<custom>/` shared across worktrees via main `.git/`; alternative `.openknowledge/` in working tree would create per-worktree copies.
- Trade-off: `rm -rf .git && git init` destroys the shadow. Acceptable because durable history lives in project repo's commit DAG.

**Implication for this spec:** Renaming `.git/open-knowledge/ → .git/ok/` preserves all of these properties — both names are custom subdirs of `.git/`. The original placement decision (project-tree dotdir → `.git/<custom>/`) does NOT need to be re-litigated.

## `symlink-handling-file-sync-crdt/REPORT.md` (2026-04-12) — LOW-MEDIUM relevance

**Topics:** filesystem atomicity, symlink identity, CRDT persistence, file watchers, TOCTOU security.

**Why scanned:** Content-filter walks the contentDir and could plausibly encounter symlinked dirs. The report covers `@parcel/watcher` and chokidar behavior.

**No findings to carry forward** for this spec. Symlink handling is a separate code path; the `.ok/` rename + `.okignore` lift do not change symlink semantics.

## Negative findings

No prior research reports on:
- `.gitignore` syntax / semantics
- Content-scoping refactors
- `.<tool>ignore` file conventions in tools or AI agents
- File-rename refactors of comparable scope

This spec is novel territory in the OK reports collection.
