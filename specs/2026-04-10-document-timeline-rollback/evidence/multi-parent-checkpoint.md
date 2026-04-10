---
type: evidence
source: experimental verification in /tmp/shadow-merge-test
confidence: HIGH
created: 2026-04-10
---

# Multi-Parent (Octopus) Checkpoint Commits — Feasibility

## Verdict: Works perfectly. ~10 line change. Should be in scope.

## Experiment Results

### git log traverses all parents ✅
`git log <merge-sha>` walks all parent chains by default. File-scoped queries 
(`git log <merge> -- <file>`) also correctly return commits from all parent chains.

### Octopus merges (3+ parents) work ✅
`git commit-tree` with multiple `-p` flags creates multi-parent commits. `%P` format
shows all parent hashes. `cat-file` confirms all `parent` lines. All commits from
all chains appear in log output.

### git show returns the checkpoint tree ✅
`git show <checkpoint>:<file>` returns content from the checkpoint's own tree (the 
CRDT snapshot), not from any parent. This is exactly what we want for previewing
a historical version.

### Performance is negligible ✅
- 152 commits (10 checkpoints × 3 writers × 5 WIP): `git log` = 15ms
- 901 commits (100 checkpoints × 3 writers × 3 WIP): `git log` = 50ms
- File-filtered query across 901 commits: 189ms worst case

### History simplification subtlety ⚠️
When a checkpoint's tree happens to be TREESAME to one parent for a given file,
`git log -- <file>` may skip the other parent's commits. 

**Fix:** Always use `--full-history` flag for file-scoped timeline queries.

Since checkpoint trees come from CRDT snapshots (which typically differ from all
individual writer states), this edge case is rare but should be guarded against.

### Ordering for timeline
- `--author-date-order`: True chronological interleaving across writers (RECOMMENDED)
- `--date-order`: Same as default (chronological by commit date)
- `--topo-order`: Groups per-writer chains together (NOT suitable for timeline)

### Linear chain alternative: rejected
Cherry-picking across writer chains causes conflicts (writers edit the same files
concurrently). Manual tree construction is possible but strictly worse — loses
per-writer chain topology with no benefit.

## Implementation

Change in `saveVersion()` (shadow-repo.ts):

```typescript
// BEFORE: single parent from first writer
let shadowParent: string | null = null;
for (const w of writers) {
  try {
    shadowParent = (await sg.raw('rev-parse', `refs/wip/${branch}/${w.id}`)).trim();
    break;
  } catch { }
}

// AFTER: collect all parents
const parents: string[] = [];
for (const w of writers) {
  try {
    const sha = (await sg.raw('rev-parse', `refs/wip/${branch}/${w.id}`)).trim();
    parents.push(sha);
  } catch { }
}
try {
  const upstreamSha = (await sg.raw('rev-parse', `refs/wip/${branch}/upstream`)).trim();
  parents.push(upstreamSha);
} catch { }

// Use all parents in commit-tree
for (const p of parents) checkpointArgs.push('-p', p);
```

## Timeline Query Patterns

| Query | Command | Notes |
|-------|---------|-------|
| All edits to a file | `git log <ref> --full-history --author-date-order -- <file>` | Interleaves across writers |
| Edits by one writer | `git log <ref> --author="<name>"` | Per-writer view |
| Checkpoints only | `git log <ref> --merges` | Only multi-parent commits |
| Between two checkpoints | `git rev-list <cp1>..<cp2>` | Inter-checkpoint range |
| Content at checkpoint | `git show <sha>:<file>` | Returns CRDT snapshot |
