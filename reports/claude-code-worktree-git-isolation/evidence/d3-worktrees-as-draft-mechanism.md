# Evidence: Git Worktrees as Draft Mechanism -- Tradeoffs

**Dimension:** D3 -- Git worktrees as draft mechanism for a knowledge platform
**Date:** 2026-04-02
**Sources:** Git documentation, performance benchmarks, CMS implementations

---

## Key pages referenced

- https://git-scm.com/docs/git-worktree -- official git worktree docs
- https://gitcheatsheet.dev/docs/advanced/worktrees/performance/ -- performance optimization
- https://tina.io/docs/drafts/editorial-workflow/ -- TinaCMS editorial workflow (git-backed drafts)
- https://automerge.org/docs/hello/ -- Automerge CRDT documentation

---

## Findings

### Finding: What a git worktree gives you
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-worktree

A git worktree provides:
1. **Separate working directory** -- real files on disk, independent of the main checkout
2. **Shared .git object database** -- no duplication of repository history
3. **Independent branch** -- each worktree checks out a different branch
4. **Standard git operations** -- commit, diff, merge, rebase all work normally
5. **Lightweight** -- only the working tree files are duplicated, not the repo

Technical details:
- Each linked worktree has a private sub-directory in `$GIT_DIR/worktrees/<name>`
- Contains a `.git` file (not directory) pointing back to the main repo
- Cannot check out the same branch in two worktrees simultaneously
- `git worktree prune` cleans up stale worktree references

### Finding: Performance at KB scale (100-1000 .md files)
**Confidence:** INFERRED (from benchmarks at larger scale + git internals)
**Evidence:** https://gitcheatsheet.dev/docs/advanced/worktrees/performance/

Benchmark data for 5,000-file repo with 10,000 commits:
- `git status`: 80ms (single worktree), 150ms selective (10 worktrees)
- `git checkout`: 450ms (single), 900ms parallel (10 worktrees)
- `git fetch`: 1.2s (single), 1.3s shared (10 worktrees)

For a knowledge base of 100-1000 markdown files:
- **Worktree creation**: Sub-second. `git worktree add` creates a directory and checks out files. For 1000 .md files averaging 5KB each, total checkout is ~5MB -- virtually instant on any modern filesystem.
- **Worktree removal**: Sub-second. `git worktree remove` deletes the directory and updates .git/worktrees.
- **Shared history**: All worktrees share the same pack files. No disk duplication of repository history.
- **Disk overhead per worktree**: Only the working tree files (~5MB for 1000 files). No .git directory duplication.

**Implications:** At KB scale (100-1000 markdown files), worktree creation and removal are effectively instantaneous. This makes "create a draft = create a worktree" viable from a performance perspective. Even 50 concurrent drafts would only use ~250MB of disk (trivial).

### Finding: TinaCMS uses git branches for editorial workflow / drafts
**Confidence:** CONFIRMED
**Evidence:** https://tina.io/docs/drafts/editorial-workflow/

```
Instead of saving content directly to a protected branch (e.g., main), a new branch
is created. A draft pull request is generated, and all subsequent edits are made on
this new branch. When the content is ready to be published, it can be merged back
into the protected branch via GitHub.
```

TinaCMS is a production CMS that uses git branches for drafts:
- Branch = draft workspace
- Draft PR = review mechanism
- Merge to main = publish
- Branch switcher in the CMS UI

This is the closest production precedent for "git branch = draft" in a content platform.

**Key difference from worktrees:** TinaCMS uses branches (not worktrees), so the user switches between branches in a single working directory. With worktrees, each draft would have its own directory, allowing simultaneous access to multiple drafts.

### Finding: Editor integration considerations
**Confidence:** INFERRED
**Evidence:** Multiple sources

For a web-based editor serving content from worktrees:
1. **File serving**: The web server needs to know which worktree directory to read from for each draft session. This is a routing/session concern, not a git concern.
2. **File watching**: Standard file system watchers work on worktree directories (they're regular directories).
3. **Hot reload**: Since worktree files are real files, any file-watching dev server (Next.js, Vite, etc.) can serve from them.
4. **Concurrent access**: Multiple users can read from the same worktree directory. Write conflicts would need locking or CRDT at the file level.
5. **Web-based editing**: The editor would write to worktree files on disk, then commit. No CRDT needed for single-user draft editing. CRDT only needed if two users edit the same draft simultaneously.

### Finding: Diff and merge work naturally
**Confidence:** CONFIRMED
**Evidence:** Git documentation

Worktree branch to main:
```bash
# From any working directory
git diff main..worktree-draft-name          # see changes
git merge worktree-draft-name               # merge draft into main
git merge-tree --write-tree main draft-name # pre-flight conflict check (no working tree needed)
```

All standard git merge strategies work:
- Fast-forward (if main hasn't changed)
- Three-way merge (if both diverged)
- Rebase (if linear history preferred)

**Implications:** Publishing a draft = merging the worktree branch into main. This is a solved problem with well-understood semantics.

### Finding: Worktree-per-skill-run is viable
**Confidence:** INFERRED
**Evidence:** Claude Code's `isolation: worktree` pattern

Pattern: When an AI agent runs a skill that edits content (e.g., "rewrite this section"), create a worktree, let the agent work in it, then either apply or discard.

This is exactly what Claude Code does with `isolation: worktree` for subagents. The pattern works:
1. Create worktree (sub-second)
2. Agent makes changes
3. Commit changes in worktree
4. If user approves: merge to main
5. If user rejects: remove worktree
6. Cleanup: sub-second

At KB scale, this is trivially fast. The agent has a real filesystem to work with, and standard git diff shows exactly what changed.

### Finding: Nested worktrees are not supported
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-worktree

Git does not support nested worktrees -- a worktree cannot contain another worktree. However, this is unlikely to be a limitation for drafts, since a draft is a flat workspace (one worktree per draft, not nested).

---

## Negative searches

### Search: Git worktree real-time collaboration
* Searched: "git worktree real-time collaborative editing multiple users"
* Result: No native support. Worktrees are single-user by design. Two users editing the same worktree would need an external locking or CRDT mechanism.

### Search: Git worktree web server integration
* Searched: "serve git worktree files web server", "git worktree content management web"
* Result: No purpose-built tooling. A web server would need to be configured to serve from the worktree directory, which is straightforward (it's a regular directory) but requires custom routing.

---

## Gaps / follow-ups

- Benchmark worktree creation at exactly 1000 markdown files (empirical test)
- How to handle the "multiple users editing same draft" scenario (CRDT overlay needed?)
- Whether sparse checkout can further optimize worktree creation for large repos
