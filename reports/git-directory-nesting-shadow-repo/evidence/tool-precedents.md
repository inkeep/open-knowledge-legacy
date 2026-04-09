# Evidence: Tools That Store Data Inside .git/

**Dimension:** Tool precedents
**Date:** 2026-04-08
**Sources:** Official documentation for each tool, web research

---

## Tools that create custom .git/ subdirectories

### git-lfs → `.git/lfs/`

**What it stores:** Local cache of LFS objects in `.git/lfs/objects/`.
**Survives clone?** No — LFS objects are fetched from the LFS server on clone. The `.git/lfs/` directory is recreated locally.
**Survives gc?** Yes — git gc does not touch `.git/lfs/`. LFS has its own `git lfs prune` command.
**Issues with git maintenance?** None reported. LFS has been production-stable since 2015.

Source: https://git-lfs.com/

### git-annex → `.git/annex/`

**What it stores:** Annexed file content in `.git/annex/objects/`, metadata, transfer logs, journals.
**Survives clone?** No — annex content is fetched separately via `git annex get`.
**Survives gc?** Yes — git gc does not touch `.git/annex/`.
**Issues with git maintenance?** None reported. git-annex has been in use since 2010.

Source: https://git-annex.branchable.com/

### git-branchless → `.git/branchless/`

**What it stores:** DAG metadata, event log, undo history for branchless workflows.
**Survives clone?** No — branchless state is local.
**Survives gc?** Yes.

### Hooks managers (Husky, Lefthook)

**What they modify:** `.git/hooks/` — a documented git path, not a custom subdir. Husky v9 uses `.husky/` in the working tree instead.

### GitHub Desktop / Tower / other GUIs

Some GUIs store state in `.git/` — e.g., `.git/sourcetreeconfig`. These are local-only and survive gc.

---

## Key finding: .git/ custom subdirs are a well-established pattern

**Confidence:** CONFIRMED

Multiple production-grade tools (git-lfs with millions of users, git-annex with 15+ years of use) create custom subdirectories inside `.git/` without issues. None report problems with git gc, git fsck, or any maintenance command touching their directories. This is an established, battle-tested pattern.

The common characteristics:
1. Data is local-only (not transferred via clone/push)
2. Each tool manages its own gc lifecycle
3. No interference from git's built-in maintenance
4. Tools accept that fresh clones don't have the data — it's reconstructed on demand
