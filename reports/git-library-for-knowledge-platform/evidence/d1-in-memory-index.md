# Evidence: In-Memory Index Manipulation

**Dimension:** D1 — In-memory index manipulation (critical safety property)
**Date:** 2026-04-02
**Sources:** isomorphic-git docs, libgit2 docs, git plumbing docs, Azure Fluid Relay blog

---

## Key files / pages referenced

- https://isomorphic-git.org/docs/en/writeBlob — writeBlob API
- https://isomorphic-git.org/docs/en/writeTree — writeTree API
- https://isomorphic-git.org/docs/en/commit — commit API with `tree` parameter
- https://isomorphic-git.org/docs/en/writeRef — writeRef API
- https://isomorphic-git.org/docs/en/readTree — readTree API
- https://isomorphic-git.org/docs/en/walk — walk API with TREE walker
- https://libgit2.org/docs/guides/101-samples/ — libgit2 in-memory index samples
- https://git-scm.com/docs/git-merge-tree — git merge-tree --write-tree docs
- https://devblogs.microsoft.com/microsoft365dev/azure-fluid-relay-leveraging-azure-blob-storage-to-scale-git/ — Azure Fluid Relay isomorphic-git pattern

---

## Findings

### Finding: isomorphic-git supports full in-memory tree building without touching the on-disk index
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git API docs (writeBlob, writeTree, commit)

The isomorphic-git `commit()` API accepts an explicit `tree` parameter: "If not specified, a new tree object is created from the current git index. You can use this to create a commit that points to a specific tree." Combined with `writeBlob()` (writes directly to object store) and `writeTree()` (accepts a TreeObject array), this enables creating commits without ever reading or writing `.git/index`.

The complete workflow:
1. `writeBlob({ fs, dir, blob })` → returns SHA for each file content
2. `writeTree({ fs, dir, tree })` → accepts array of TreeEntry, returns tree SHA
3. `commit({ fs, dir, tree: treeSHA, parent: [parentSHA], ref: 'refs/wip/...' })` → creates commit pointing to that tree

The `commit()` also has `noUpdateBranch: true` which prevents HEAD/branch pointer changes.

Azure Fluid Relay uses exactly this pattern: "By handling the Git filesystem computation of the summary tree in memory using isomorphic-git with memfs, the approach minimizes network overhead." They create ref + commit + tree + blob without touching any index.

**Implications:** isomorphic-git can do WIP auto-commits without ever touching `.git/index`, which is the critical safety property needed to avoid interfering with manual git operations.

### Finding: Native git plumbing commands also bypass the index
**Confidence:** CONFIRMED
**Evidence:** git-scm.com documentation for hash-object, mktree, commit-tree, update-ref

The workflow `git hash-object -w` → `git mktree` → `git commit-tree` → `git update-ref` creates commits without reading or writing `.git/index`. This is the standard plumbing approach.

Additionally, `git merge-tree --write-tree` (Git 2.38+) performs a full three-way merge "without touching the index or working tree."

Via simple-git: `await git.raw(['hash-object', '-w', '--stdin'])` etc.

**Implications:** Both isomorphic-git and native git (via simple-git `.raw()`) can achieve the critical safety property.

### Finding: libgit2 provides explicit in-memory index via git_index_new()
**Confidence:** CONFIRMED
**Evidence:** libgit2 101-samples documentation

libgit2 has `git_index_new()` which creates an in-memory index that cannot be saved to disk but can be used to create tree objects: "In-memory indexes cannot be saved to disk, but can be useful for creating trees." Also provides `git_treebuilder_new()` for constructing trees entirely in memory.

**Implications:** This is the gold standard for in-memory index manipulation, but only accessible through native bindings (nodegit/wasm-git), which have other drawbacks.

### Finding: GIT_INDEX_FILE environment variable can isolate native git operations
**Confidence:** CONFIRMED
**Evidence:** git-scm.com documentation

Setting `GIT_INDEX_FILE=/tmp/wip-index` before running `git add`/`git write-tree` creates and uses a separate index file. However, this still creates a file on disk (just not `.git/index`). The plumbing approach (hash-object + mktree + commit-tree) is superior as it creates no index file at all.

**Implications:** If using simple-git's porcelain commands (add/commit), GIT_INDEX_FILE provides isolation but is messier than the plumbing approach.

---

## Gaps / follow-ups

* Benchmark the isomorphic-git writeBlob → writeTree → commit pipeline for 100-1000 files
* Test whether isomorphic-git's `dir` parameter in writeTree/writeBlob can point to a read-only or non-existent directory when only writing to the object store
