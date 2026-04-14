---
type: evidence
source: codebase trace (shadow-repo.ts lines 487-535)
confidence: HIGH
created: 2026-04-10
---

# WIP Ref Preservation Across Save Versions

## Critical Finding: Already Solved via Checkpoint Ancestry

The checkpoint commit **already parents on the latest WIP commit** (shadow-repo.ts lines 491-504):

```typescript
let shadowParent: string | null = null;
for (const w of writers) {
  try {
    shadowParent = (await sg.raw('rev-parse', `refs/wip/${branch}/${w.id}`)).trim();
    break;  // Takes first writer's WIP ref
  } catch {
    // try next writer
  }
}
// ... checkpoint commit uses shadowParent as -p argument
```

After `saveVersion()`:
1. Checkpoint commit is created with parent = latest WIP commit
2. WIP refs are deleted via `update-ref -d`
3. BUT: all WIP commits remain **reachable through the checkpoint's ancestor chain**

Example lineage:
```
checkpoint-A → wip-3 → wip-2 → wip-1 → [previous checkpoint or root]
```

## Implications for Timeline

- **No code changes needed** for WIP preservation
- Timeline can walk backward from any checkpoint ref to find all inter-checkpoint WIP commits
- `git log refs/checkpoints/<branch>/<sha>` will include all WIP commits in its ancestry
- WIP commits are protected from `git gc` as long as the checkpoint ref exists

## Single-Writer Limitation

Current code takes the **first** writer's WIP ref as the checkpoint parent. If multiple writers have independent WIP chains, only one chain is preserved in the checkpoint ancestry. The others become orphaned.

**Mitigation options:**
- A) Use merge commit for checkpoint (multiple parents) — preserves all chains
- B) Accept single-chain — most common case is one human writer
- C) Chain WIP refs before checkpoint (rebase writer chains into linear history)

For MVP: Option B is likely sufficient. Multi-writer checkpoint ancestry is a future optimization.

## Reflog Status

No reflog configured for the shadow repo (`core.logallrefupdates` not set). Not needed since checkpoint ancestry provides reachability.

## GC Status

No `git gc` invocation anywhere in codebase. Orphaned commits (from non-primary writers) are safe until external gc runs.
