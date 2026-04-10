# Evidence: Worktree Merge Strategies

**Dimension:** D4 — Worktree merge strategies
**Date:** 2026-03-30
**Sources:** Git documentation, Atlassian tutorials, LesFurets git-octopus, Raymond Chen blog

---

## Key pages referenced

- https://git-scm.com/docs/git-merge — official merge docs
- https://git-scm.com/docs/git-merge-tree — merge-tree (in-memory merge)
- https://git-scm.com/book/en/v2/Git-Tools-Rerere — git rerere
- https://github.com/lesfurets/git-octopus — continuous merge workflow
- https://www.atlassian.com/git/tutorials/using-branches/merge-strategy — merge strategies
- https://devblogs.microsoft.com/oldnewthing/20180312-00/?p=98215 — cherry-pick vs merge

---

## Findings

### Finding: Five distinct merge strategies for N worktree branches
**Confidence:** CONFIRMED
**Evidence:** Multiple sources

**1. Sequential two-way merge (incremental):**
Merge branches one at a time into the integration branch: `git merge branch1`, `git merge branch2`, etc.
- Pro: Simple, easy to reason about conflicts at each step
- Con: Creates N merge commits, each branch sees only prior merges
- Con: Order-dependent — different merge order can produce different results

**2. Octopus merge (all-at-once):**
`git merge -s octopus branch1 branch2 ... branchN`
- Pro: Single merge commit with N parents, clean history
- Con: Refuses to proceed if ANY conflict exists — zero tolerance
- Con: Impractical for more than 5-8 branches
- Note: Default git strategy when merging 3+ heads

**3. Integration branch + sequential merge:**
Create temp branch, merge all into it, then merge temp into main:
`git checkout -b integration && git merge branch1 && git merge branch2 && git checkout main && git merge integration`
- Pro: Isolates merge work from main branch
- Pro: Can resolve conflicts in integration branch without touching main
- Con: Still sequential within the integration branch

**4. Rebase then fast-forward:**
`git checkout feature && git rebase main && git checkout main && git merge feature`
- Pro: Linear history, no merge commits
- Con: Rewrites history — dangerous for shared branches
- Con: Each rebase may encounter conflicts at every commit

**5. Cherry-pick (surgical):**
Pick specific commits from each branch into integration.
- Pro: Fine-grained control over which changes land
- Con: Breaks ancestry — future merges confused by duplicate commits
- Con: Raymond Chen's advice: "Stop cherry-picking, start merging"

**Implications:** For agent-produced branches, sequential merge into an integration branch (strategy #3) is the most practical. Octopus is too fragile for real work. Cherry-pick breaks ancestry.

### Finding: `git merge-tree --write-tree` enables pre-flight conflict detection
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-merge-tree

```
git merge-tree performs a merge using the same features as "real" git merge,
including recursive ancestor consolidation. After the merge completes, a new
toplevel tree object is created. It doesn't touch your working tree or index.

Exit status: 0 = clean merge (no conflicts), 1 = conflicts detected, other = error.
```

Critical caveats from the docs:
1. Do NOT parse the tree to find conflicts — use the Conflicted file info section
2. Do NOT interpret empty conflict list as clean — check exit status
3. Supports `--stdin` mode for batch checking multiple branch pairs
4. `-q` mode exits early on first conflict (fast for pre-flight)

**Implications:** `git merge-tree` is the ideal tool for pre-flight conflict detection between agent branches. It's fast (in-memory), has no side effects, and supports batch mode for checking all branch pairs.

### Finding: `git rerere` records and replays conflict resolutions
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/book/en/v2/Git-Tools-Rerere

```
In a workflow employing relatively long lived topic branches, the developer
sometimes needs to resolve the same conflicts over and over again. This command
assists by recording conflicted automerge results and corresponding hand resolve
results on the initial manual merge, and applying previously recorded hand
resolutions to their corresponding automerge results.
```

Resolutions stored in `.git/rr-cache`. Operates at patch-level, not file-level. Enabled via `git config rerere.enabled true`. Auto-invoked by `git merge` and `git commit`. Resolutions expire after 60 days (resolved) or 15 days (unresolved).

**Implications:** `git rerere` can help with repeated merges of similar branches. Useful if an orchestrator needs to re-merge after an agent retries. But resolutions are local to the repo — not portable across machines.

### Finding: LesFurets git-octopus provides continuous merge workflow
**Confidence:** CONFIRMED
**Evidence:** https://github.com/lesfurets/git-octopus

```
git-octopus allows you to merge all your feature branches together at any moment
so you can have an assembly of all the work that is going on and finally do a
continuous integration job on that merge.

The octopus merge is not kept in any history line. The next push on any feature
branch will trigger the build of a new merge that will be force-pushed on octopus.
```

Real-world scale: 40-70 branches in progress at LesFurets.com, 3-10 branches per deployment, 1 deployment/day.

Conflict resolution strategies: (1) rewrite to avoid, (2) use `git-conflict` to record resolutions, (3) exclude one branch from merge, (4) rebase one on other (last resort — breaks branch independence).

**Implications:** The continuous merge model is directly applicable to agent orchestration. Merge all agent branches into a throwaway integration branch for testing. Only merge individually to main when validated.

### Finding: Cherry-pick should be avoided for feature integration
**Confidence:** CONFIRMED
**Evidence:** https://devblogs.microsoft.com/oldnewthing/20180312-00/?p=98215

Raymond Chen's analysis: cherry-picking creates duplicate commits with different SHAs. If the original branch is later merged normally, Git may struggle to reconcile the duplicated changes, leading to conflicts or misinterpretation. Recommendation: always use merge-based workflows for feature integration. Cherry-pick only for hotfixes/backports.

**Implications:** Agent branches should always be merged, never cherry-picked, into the integration branch.

### Finding: Conflict mid-sequence requires a decision — skip, resolve, or abort
**Confidence:** CONFIRMED
**Evidence:** Standard git merge semantics

When merging N branches sequentially and branch K conflicts:
- **Resolve and continue:** Fix conflicts, commit, proceed to branch K+1
- **Skip:** Omit branch K from integration, proceed to K+1
- **Abort:** Undo all merges, start over with different order

There is no built-in "try all possible orderings" mechanism in git. The merge order matters because:
- Merging A then B may conflict differently than merging B then A
- Once A is merged, B's diff is computed against (main + A), not just main

**Implications:** For agent orchestration, a conflict-detection pass (using `git merge-tree`) BEFORE the actual merge sequence allows optimal ordering or early human escalation.

---

## Gaps / follow-ups

- Performance characteristics of `git merge-tree` at scale (thousands of files)
- Whether `git merge-tree --stdin` can be used for N-way conflict matrix
- How GitHub merge queue handles multi-PR integration testing
