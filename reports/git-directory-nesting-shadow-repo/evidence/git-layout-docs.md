# Evidence: Git Repository Layout Documentation

**Dimension:** Git internal directory structure, formal guarantees
**Date:** 2026-04-08
**Sources:** https://git-scm.com/docs/gitrepository-layout, https://github.com/git/git/blob/master/Documentation/gitrepository-layout.adoc

---

## Documented .git/ paths (exhaustive from gitrepository-layout)

### Core
- `HEAD` — current branch symref
- `config` — repository configuration
- `config.worktree` — worktree-specific config (extensions.worktreeConfig)
- `index` — current staging area
- `sharedindex.<SHA-1>` — split index files
- `packed-refs` — packed reference storage
- `shallow` — shallow clone commit boundaries

### Directories
- `objects/` — object store (loose objects in `[0-9a-f][0-9a-f]/`, packs in `pack/`, metadata in `info/`)
- `refs/` — reference storage (`heads/`, `tags/`, `remotes/`, `replace/`)
- `logs/` — reflog storage
- `info/` — repository info (`refs`, `grafts`, `exclude`, `attributes`, `sparse-checkout`)
- `hooks/` — git hooks
- `modules/` — gitlink submodule repos
- `worktrees/` — linked working tree administrative data
- `common/` — shared files in multi-worktree setups (extensions.worktreeConfig)

### Legacy/Deprecated
- `branches/` — deprecated remote shorthands
- `remotes/` — deprecated remote config

---

## Finding: No formal guarantee about custom subdirectories

**Confidence:** CONFIRMED

The documentation lists every path git manages. It does **not** make any statement about:
- Whether custom subdirectories are safe
- Whether git will never create new paths in future versions
- Whether maintenance commands are scoped to documented paths only

However, the documentation is structured as a **descriptive enumeration** — it describes what git uses, not what it might use in the future. The absence of a guarantee is not the same as a warning against custom dirs.

---

## Finding: Git transport protocol only sends refs + objects

**Confidence:** CONFIRMED (via empirical test + protocol design)

Git's transfer protocol (used by clone, push, fetch) operates on refs and objects. It does not transfer filesystem-level directory contents. Custom `.git/` subdirectories are invisible to the transport layer.

Evidence: `gitrepository-layout` describes the transported state as refs + objects. Empirical testing confirms custom dirs are not cloned or pushed.

---

## Finding: modules/ and worktrees/ are the precedent for nested repo-like structures

**Confidence:** CONFIRMED

Git itself nests repository-like structures inside `.git/`:
- `.git/modules/<name>/` — full sub-repositories for gitlink submodules
- `.git/worktrees/<name>/` — per-worktree administrative state

This establishes that git's own architecture already contains nested repo structures inside `.git/`. Our shadow repo at `.git/openknowledge/history.git` follows this established pattern.
