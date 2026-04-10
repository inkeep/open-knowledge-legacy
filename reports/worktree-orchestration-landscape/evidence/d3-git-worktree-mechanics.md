# Evidence: Git Worktree Mechanics

**Dimension:** D3 — Git worktree mechanics (reference)
**Date:** 2026-03-30
**Sources:** Official git documentation, git-scm.com, community articles

---

## Key pages referenced

- https://git-scm.com/docs/git-worktree — official git worktree docs
- https://git-scm.com/docs/git-merge-tree — merge-tree docs
- https://git-scm.com/docs/git-sparse-checkout — sparse checkout docs
- https://www.gitworktree.org/faq — community FAQ

---

## Findings

### Finding: Worktrees share .git objects but maintain independent per-worktree state
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-worktree

```
When you create a worktree at a path and checkout a commit into it, the new
worktree is linked to the current repository, sharing everything except
per-worktree files such as HEAD, index, etc.

With git worktrees, each time you fetch/pull in any of the working directories,
shared objects will automatically be updated.
```

Shared: object database, refs, remote config, hooks, rerere cache.
Per-worktree: HEAD, index, sparse-checkout config, MERGE_HEAD, REBASE_HEAD.

**Implications:** Worktrees are extremely lightweight — no object duplication. A new worktree adds only the working tree files + per-worktree metadata. This makes them ideal for rapid parallel agent spawning.

### Finding: Same branch cannot be checked out in two worktrees simultaneously
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-worktree + https://www.gitworktree.org/faq

```
Two worktrees can't be on the same branch simultaneously because they'd conflict
on what HEAD means. If branch feature/x is checked out in a worktree, Git may
prevent you from checking it out elsewhere.
```

Workarounds: (1) Create new branch from same commit: `git worktree add -b feature-x-copy ../copy feature/x`, (2) Use `--force` to override, (3) Use detached HEAD: `git worktree add --detach ../wt <commit>`.

**Implications:** Each agent MUST use a unique branch. This is natural for the parallel-agent use case (each agent = unique feature branch) but blocks "multiple agents on same branch" patterns.

### Finding: Submodules in worktrees are experimental and incomplete
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-worktree

```
Multiple checkout in general is still experimental, and the support for
submodules is incomplete.

The main worktree or linked worktrees containing submodules cannot be moved
with the git worktree move command.
```

Each worktree needs separate `git submodule update --init`. The `--update-submodules` flag is strongly warned against as it can break the .git directory.

**Implications:** Projects using submodules should avoid worktree-based parallelism or handle submodule init explicitly in WorktreeCreate hooks.

### Finding: Sparse checkout is per-worktree and scales with cone mode
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-sparse-checkout

```
To ensure that adjusting the sparse-checkout settings within a worktree does
not alter the sparse-checkout settings in other worktrees, the set subcommand
will upgrade your repository config to use worktree-specific config.
```

Non-cone mode: O(N*M) pattern matching (N patterns, M paths). Cone mode + sparse index: significant performance improvement for `git status` and `git add`.

**Implications:** Sparse checkout can reduce worktree disk usage for large repos. Per-worktree configuration means each agent can check out only the files it needs. Cone mode is strongly recommended for performance.

### Finding: Worktree disk usage scales linearly with working tree size
**Confidence:** CONFIRMED
**Evidence:** Community reports + build tool documentation

Each worktree duplicates the full working tree (or sparse subset). Build artifacts, node_modules, and caches are NOT shared by default. Cursor users reported 9.82 GB for a 2GB codebase in 20 minutes. Build tools (Bazel, ccache) may not share caches across worktrees due to absolute path differences.

Mitigation: Configure build tools to use shared cache directories outside any worktree. Use sparse checkout to limit per-worktree footprint.

**Implications:** For monorepos or large codebases, worktree proliferation can consume significant disk space. The `bun install` / `npm install` step in each worktree is a real cost.

### Finding: `git worktree prune` cleans stale references
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-worktree

If a worktree directory is deleted manually (e.g., `rm -rf`), the branch association persists and blocks checkout elsewhere. `git worktree prune` cleans up stale entries.

**Implications:** Automated cleanup should run `git worktree prune` periodically. Agent orchestrators should call `git worktree remove` (not `rm -rf`) to clean up properly.

---

## Gaps / follow-ups

- Performance benchmarks for worktree creation at scale (100+ worktrees)
- Shallow worktree support (git worktree add with --depth)
- Git LFS interaction with worktrees
