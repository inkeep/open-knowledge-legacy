# Evidence: Git Squash-Merge + Annotated Tag Patterns (D2)

**Dimension:** D2 — Git plumbing for checkpoint creation
**Date:** 2026-04-08
**Sources:** Git documentation, simple-git v3.35.0 TypeScript types, bartman/git-wip OSS project, git merge-tree docs

---

## Key files / repos referenced
- simple-git v3.35.0 — `.raw()`, `.addAnnotatedTag()`, `.tag()` APIs
- bartman/git-wip — OSS WIP ref pattern using `write-tree`/`commit-tree`/`update-ref`
- git-merge-tree — in-memory merge without working tree (Git 2.38+)
- Git trailer support — `--trailer` flag (Git 2.46+)

---

## Findings

### Finding: Raw plumbing (`commit-tree` + `update-ref`) is correct for squash-merge, not porcelain
**Confidence:** CONFIRMED
**Evidence:** Porcelain `git merge --squash` requires a checked-out branch, modifies working tree and index. Conflicts with the isolation model. The correct plumbing sequence:
```
WIP_TREE=$(git rev-parse refs/wip/main^{tree})
MAIN_SHA=$(git rev-parse main)
COMMIT=$(git commit-tree $WIP_TREE -p $MAIN_SHA -m "checkpoint: <name>")
git update-ref refs/heads/main $COMMIT
```
This works because the WIP ref's tree IS the desired state. No merge resolution needed.

**Implication:** Layer 3 follows the same `git.raw()` pattern as Layer 2. ~5 sequential plumbing calls.

### Finding: `git merge-tree --write-tree` (Git 2.38+) enables multi-writer merge without working tree
**Confidence:** CONFIRMED
**Evidence:** `git merge-tree --write-tree` performs a real three-way merge in memory, outputting a merged tree hash. Non-zero exit indicates conflicts. Designed for scripted merge operations.

**Implication:** When multi-writer support is added, `merge-tree` enables merging multiple WIP refs without checkout. For single-writer v1, the simple "WIP tree wins" approach is sufficient.

### Finding: simple-git `.raw()` is sufficient for all plumbing operations
**Confidence:** CONFIRMED
**Evidence:** simple-git v3.35.0 exposes `.raw(...args)` returning `Promise<string>`. The existing Layer 2 code already uses this extensively. `.merge()` is porcelain-only and unsuitable. `.addAnnotatedTag()` only tags HEAD — need `.raw('tag', '-a', ...)` for targeting specific commits.

**Implication:** No need for `child_process` fallback. `git.raw()` is equivalent with better error handling.

### Finding: Annotated tags can carry structured metadata via trailers (Git 2.46+)
**Confidence:** CONFIRMED
**Evidence:** `git tag --trailer "Key: Value"` appends key-value pairs parseable by `git interpret-trailers`. For older git, structured message body with header/body separation works. Tag objects auto-store tagger name, email, and date.

**Implication:** Use trailers for attribution metadata (author, files-changed count). Query via `git for-each-ref --format='%(contents:trailers)'`.

### Finding: Sequential checkpoint numbering via tag query is the simplest naming scheme
**Confidence:** INFERRED
**Evidence:** Tag listing `git tag -l 'checkpoint/*' --sort=-version:refname | head -1` gives the latest number. Sequential is human-friendly and maps well to timeline UI. Timestamp-based is safer for multi-writer but verbose.

**Implication:** Use `checkpoint/<N>` for single-writer v1. Migrate to `checkpoint/<timestamp>-<slug>` if multi-writer requires it.

### Finding: Layer 3 does NOT need GIT_INDEX_FILE isolation
**Confidence:** CONFIRMED
**Evidence:** `rev-parse`, `commit-tree`, `update-ref`, and `tag` are pure plumbing operating on the object database and ref store directly. No index involvement. Only `write-tree` and `read-tree` touch the index, and Layer 3 doesn't use them (the WIP tree is already computed).

**Implication:** Simplifies implementation — no temp index management for checkpoint operations.

### Finding: WIP refs should be deleted after checkpoint, then auto-recreated on next save
**Confidence:** INFERRED
**Evidence:** bartman/git-wip resets WIP refs after each real commit. The existing Layer 2 code handles the "no parent" case (first WIP commit) on lines 70-79 of persistence.ts. Deleting refs after checkpoint allows git gc to clean up old objects.

**Implication:** Checkpoint sequence ends with `git update-ref -d refs/wip/main`. Next auto-save recreates it.

---

## Negative searches
- Searched for OSS projects implementing WIP-ref-to-checkpoint squash patterns: only bartman/git-wip found as direct analog
- Searched for simple-git squash-merge examples: none found — confirms raw plumbing is the right approach

---

## Gaps / follow-ups
- Git 2.38+ requirement for `merge-tree --write-tree` — need to verify minimum git version on target platforms
- Performance of `git for-each-ref` with 1000+ checkpoint tags not benchmarked
