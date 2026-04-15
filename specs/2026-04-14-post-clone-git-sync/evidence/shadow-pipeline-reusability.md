---
title: Shadow Git Pipeline — Reusability Map for Parent-Git Sync
date: 2026-04-14
sources:
  - packages/server/src/shadow-repo.ts
  - packages/server/src/persistence.ts
  - packages/server/src/head-watcher.ts
  - packages/server/src/file-watcher.ts
  - packages/server/src/external-change.ts
  - packages/server/src/reconciliation.ts
  - packages/server/src/standalone.ts
  - packages/core/src/shadow-repo-layout.ts
confidence: CONFIRMED
---

# Shadow Git Pipeline — Reusability Map for Parent-Git Sync

## Purpose
Map every surface of the existing shadow-git pipeline to answer: **what's literally reusable by passing a different `GitHandle`, vs. what's net-new for parent-git sync?**

## Key insight
`ShadowHandle` and a hypothetical `ParentGitHandle` are isomorphic: both are `{ gitDir: string; workTree: string }`. Every git plumbing command in the pipeline operates on env vars (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`) that accept either target. The existing code is already polymorphic over the git target; it just needs one more caller.

## Reusability matrix

### Tier A — Zero-effort reuse (pass different `GitHandle`)

| Function | File:Lines | What it does | Works against parent? |
|----------|-----------|--------------|-----------------------|
| `commitWip(shadow, writer, contentRoot, message, branch)` | `shadow-repo.ts:120-197` | Stages content → writes tree → commit-tree → update-ref | **Yes.** Every plumbing command (`hash-object`, `read-tree`, `add`, `write-tree`, `commit-tree`, `update-ref`) operates on the `GIT_DIR` env var. Pass parent `.git/` dir, get parent commits on the same ref pattern. Caveat: ref pattern `refs/wip/<branch>/<writer>` is inappropriate for parent git — parent should commit directly to `<branch>` (e.g., `main`), not WIP refs. Needs a `ref` parameter. |
| `saveVersion(shadow, contentRoot, writers, branch)` | `shadow-repo.ts:417-521` | Creates checkpoint commit with all WIP refs as parents; resets WIP refs | **Yes with parameterization.** For parent: single commit to `<branch>`, no WIP-ref reset needed (parent doesn't have WIP refs). |
| `parkBranch(shadow, branch, sessionId, docs)` | `shadow-repo.ts:282-367` | Saves Y.Doc + disk snapshot to `refs/wip/<branch>/human-<sessionId>` for cross-branch restore | **Not applicable** to parent. Parent doesn't park in-memory state; shadow does. Keep shadow-only. |
| `readParkedState`, `restoreBranchWIP` | `shadow-repo.ts`, `standalone.ts:994-1051` | Read parked WIP; three-way merge restore on cross-branch switch | **Not applicable.** Shadow-only. |
| `commitUpstreamImport(shadow, contentRoot, old, new, branch)` | `shadow-repo.ts:215-227` | Records external HEAD moves as shadow commits attributed to `upstream` writer | **Shadow-only** (this is shadow's attribution for parent-git events — by definition not applicable to parent itself). |
| `safetyCheckpoint(shadow, contentRoot, writer)` | `shadow-repo.ts:254-262` | Pre-action snapshot; delegates to commitWip | **Shadow-only.** Parent doesn't need pre-rollback snapshots. |
| `shadowGit(shadow)` | `shadow-repo.ts:42-50` | simple-git factory with env vars set | **Yes — generalize.** Rename to `createGitInstance(handle)` or have a `parentGit(handle)` factory. |

### Tier B — Reuse with minor parameterization

| Subsystem | File | Change needed |
|-----------|------|--------------|
| `scheduleGitCommit()` / `commitToWipRef()` | `persistence.ts:275-292` | Add second commit call: if `parentGitRef.current`, also `commitWip(parentGit, writer, contentRoot, message, branch)` with branch ref (not WIP ref). |
| Write tracker / `registerWrite` | `file-watcher.ts:76-101` | **No change.** Path-based; git-target agnostic. |
| Batch gating (`isBatchInProgress`, `setBatchInProgress`) | `persistence.ts:118-127` | **No change.** Module-level flag; works across both targets. |
| External change handler (`applyExternalChange`) | `external-change.ts:30-63` | **No change.** CRDT-layer only; doesn't touch git. |
| Reconciliation (`reconcile`) | `reconciliation.ts` | **No change.** CRDT three-way merge; git-agnostic. |
| HEAD watcher | `head-watcher.ts` | **No change.** Already watches parent `.git/HEAD`; classifies batch kind. |

### Tier C — Net-new (no shadow equivalent)

| Capability | Why shadow doesn't have it | Expected effort |
|-----------|---------------------------|-----------------|
| Remote detection (`git remote -v`) | Shadow has no remotes | Trivial — one simple-git call at startup |
| `git fetch origin` | Shadow is local-only | Small — simple-git method + interval |
| `git merge origin/<branch>` | Shadow never merges from remote | Medium — merge + conflict detection |
| `git push origin <branch>` | Shadow is never pushed | Small — simple-git method |
| Credential injection (`GIT_ASKPASS`) | Shadow doesn't need auth | Medium — helper binary/script + keyring read |
| Conflict resolution UI | Shadow conflicts are logged, not rendered | Medium — extend DiffView with `mergeControls` |
| Sync status indicator | Shadow status isn't user-facing | Small — CC1 channel + React component |
| Error classification | Shadow ops are local (no network errors) | Medium — 5-class taxonomy + per-class UX |
| Retry with backoff | Shadow doesn't fail transiently | Small — wrap push/fetch/merge with retry |
| Config schema | No shadow config today | Trivial — add `sync` section |

## GitHandle unification

Proposed type:

```typescript
// packages/server/src/git-handle.ts (new file)
export interface GitHandle {
  gitDir: string;
  workTree: string;
  /** Optional classifier for logging / debugging. */
  kind?: 'shadow' | 'parent';
}

// Alias for existing callers:
export type ShadowHandle = GitHandle;

// New factory (replaces or supplements shadowGit):
export function createGitInstance(handle: GitHandle) {
  return simpleGit({
    baseDir: handle.workTree,
    timeout: { block: GIT_TIMEOUT_MS },
  }).env({
    GIT_DIR: handle.gitDir,
    GIT_WORK_TREE: handle.workTree,
  });
}
```

Existing `ShadowHandle` type at `shadow-repo.ts:21-24` is already `{ gitDir: string; workTree: string }` — the unification is purely additive.

## Parent GitHandle resolution

Parent git always lives at `<projectRoot>/.git/`. No special resolver needed:

```typescript
// In standalone.ts createServer():
const parentGitPath = resolve(projectRoot, '.git');
const parentGitHandle: GitHandle | null =
  existsSync(parentGitPath) && statSync(parentGitPath).isDirectory()
    ? { gitDir: parentGitPath, workTree: projectRoot, kind: 'parent' }
    : null;
```

`resolveShadowDir` at `packages/core/src/shadow-repo-layout.ts:72-83` already handles the "no parent .git/" case (returns standalone shadow). No new logic needed for parent detection.

## Writer identity for parent commits

Shadow uses typed writer IDs (`agent-<id>`, `human-<id>`, `upstream`, `server`). Parent git should use the user's git config identity (`user.name`, `user.email`), NOT our internal writer IDs. Parent commits will appear in the user's git log with proper attribution — this is an intentional divergence from shadow's attribution model.

Approach:
- For auto-sync L2 commits: `git -c user.name="<user>" -c user.email="<email>" commit` using values from `git config --get user.name/.email` (fall back to reasonable defaults).
- For agent-authored commits: co-author via `Co-Authored-By:` trailer (optional; future work).
- For Save Version commits: use git config identity; no special writer ID.

## Index isolation

`commitWip` uses `GIT_INDEX_FILE=<gitDir>/index-wip-<writer-id>` to avoid touching the project's staging area. For parent-git commits, we MUST preserve this isolation:
- Parent-git commit uses `GIT_INDEX_FILE=<parentGitDir>/index-ok-sync` (or similar)
- Never touches `<parentGitDir>/index` (the user's actual staging area)
- Uses standard plumbing sequence: hash-object → read-tree → add → write-tree → commit-tree → update-ref

This preserves the developer escape hatch: user can `git status` externally and see their own staged changes unaffected by our sync commits.

## Ref model — parent is flatter than shadow

| Target | Ref pattern | Purpose |
|--------|-------------|---------|
| **Shadow** | `refs/wip/<branch>/<writer-id>` | Per-writer WIP chain; collapsed at Save Version |
| **Shadow** | `refs/checkpoints/<branch>/<sha>` | Durable save-version snapshots |
| **Shadow** | `refs/wip/<branch>/upstream` | External git events |
| **Parent** | `refs/heads/<branch>` | Just the branch head. Every L2 commit advances this. |
| **Parent** | Lightweight tag `ok/v<N>` | Save Version markers (optional, nice-to-have) |

Parent ref handling:
- Every L2 auto-commit → advance `refs/heads/<branch>` (normal git commit)
- Save Version → same + create lightweight tag `refs/tags/ok/v<N>` (sequential, scanned on startup)
- Conflict during merge → leaves `.git/MERGE_HEAD`, `.git/MERGE_MSG` present; HEAD watcher's existing logic classifies this correctly

## Summary

- **90% of the commit pipeline is literally reusable** via a second `GitHandle` argument
- **The sync engine is NOT a separate subsystem** — it's the existing L2 pipeline with a second target + an additive remote-operations layer
- **Ref model differs** (parent flatter than shadow) but this only requires a `ref` parameter, not a parallel function
- **Writer identity differs** (parent uses git config, shadow uses typed IDs) but this is an environment-variable swap at commit time
- **Index isolation must be preserved** for developer escape hatch (never touch user's staging area)
