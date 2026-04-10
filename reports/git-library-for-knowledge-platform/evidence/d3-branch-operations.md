# Evidence: Branch Operations

**Dimension:** D3 — Branch operations (create, switch, merge --squash, delete, annotated tags)
**Date:** 2026-04-02
**Sources:** isomorphic-git docs, simple-git docs, git merge-tree docs

---

## Key files / pages referenced

- https://isomorphic-git.org/docs/en/merge.html — isomorphic-git merge API
- https://isomorphic-git.org/docs/en/writeTag — isomorphic-git annotated tag support
- https://isomorphic-git.org/docs/en/checkout.html — isomorphic-git checkout
- https://github.com/isomorphic-git/isomorphic-git/issues/325 — merge conflict issue (open since 2018)
- https://git-scm.com/docs/git-merge-tree — git merge-tree --write-tree
- https://www.npmjs.com/package/simple-git — simple-git npm page

---

## Findings

### Finding: isomorphic-git merge is limited — no squash merge, broken recursive strategy
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git merge docs, GitHub issue #325

isomorphic-git merge limitations:
1. "Currently it will fail if multiple candidate merge bases are found. (It doesn't yet implement the recursive merge strategy.)"
2. No squash merge support (no `--squash` option in the API)
3. Conflict handling is partial: a `mergeDriver` parameter was added in PR #1588 (May 2022) to allow custom conflict markers, but "it is not possible to abort an incomplete merge" and there is no `--continue` support
4. Issue #325 (merge conflicts) has been open since July 2018 and remains open

The merge function does support: fast-forward, dryRun, noUpdateBranch, abortOnConflict, custom author/committer.

**Implications:** isomorphic-git cannot do merge --squash natively. This is a significant gap for draft lifecycle operations.

### Finding: Squash merge is achievable via plumbing in both libraries
**Confidence:** INFERRED
**Evidence:** git plumbing documentation, isomorphic-git tree/commit APIs

A squash merge can be constructed from plumbing operations:
1. Perform a regular merge (get the merged tree)
2. Create a commit with only one parent (the target branch) pointing to that merged tree
3. This is semantically identical to `git merge --squash && git commit`

With isomorphic-git: use `merge({ dryRun: true })` to get the merged tree OID (if the merge is clean), then `commit({ tree: mergedTreeOID, parent: [mainSHA] })`.

With native git: `git merge-tree --write-tree main draft` → `git commit-tree <tree> -p main -m "message"` → `git update-ref refs/heads/main <commit>`.

**Implications:** Squash merge is implementable with plumbing, but isomorphic-git adds risk due to its broken recursive merge strategy.

### Finding: simple-git provides full merge --squash support via git CLI delegation
**Confidence:** CONFIRMED
**Evidence:** simple-git npm documentation, git CLI docs

simple-git delegates to native git, which has full merge --squash support: `await git.merge(['--squash', 'draft-branch'])`. Also supports all merge strategies, conflict detection, and `MergeResult` typed responses with conflict arrays.

**Implications:** simple-git is the safe choice for merge operations.

### Finding: isomorphic-git supports annotated tags
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git writeTag docs, annotatedTag docs

isomorphic-git provides `writeTag()` and `annotatedTag()` functions for creating annotated tags. The tag object includes: target OID, type, tag name, tagger info, message, and optional PGP signature.

**Implications:** Named checkpoints via annotated tags work in isomorphic-git.

### Finding: isomorphic-git checkout writes to the working directory
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git checkout docs, performance issues

`git.checkout()` in isomorphic-git reads tree objects and writes files to the working directory. For 100-1000 files, this involves I/O for each file. Performance issues have been reported (#291: bad performance with huge pack files; #1841: readBlob too slow for cross-branch operations).

**Implications:** Branch switching with isomorphic-git is a disk-heavy operation that may be slow for 1000 files without caching.

### Finding: git merge-tree --write-tree (Git 2.38+) enables merge without checkout
**Confidence:** CONFIRMED
**Evidence:** git-scm.com git-merge-tree documentation

`git merge-tree --write-tree` "performs a merge without touching the index or working tree." Returns exit 0 + tree OID for clean merge, exit 1 + conflict info for conflicts. Combined with commit-tree and update-ref, enables full merge workflow without any checkout.

**Implications:** Native git plumbing can do both WIP commits AND merge operations without touching the working directory.

---

## Gaps / follow-ups

* Test isomorphic-git merge with `dryRun: true` to verify it returns a usable tree OID
* Benchmark isomorphic-git checkout vs native git checkout at 1000 files
