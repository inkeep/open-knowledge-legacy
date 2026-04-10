# Evidence: Sandcastle Worktree Patterns

**Dimension:** D2 — Other AI Coding Tools (additive: Sandcastle)
**Date:** 2026-04-03
**Sources:** `/tmp/sandcastle-research/` (cloned from https://github.com/mattpocock/sandcastle)

---

## Key files referenced

- `src/WorktreeManager.ts:1-277` — worktree create, remove, prune, collision detection
- `src/SandboxFactory.ts:354-568` — Effect.acquireUseRelease bracket for worktree + container
- `src/SandboxLifecycle.ts:154-206` — temp-branch merge-back, commit collection
- `src/createSandbox.ts:235-265` — dirty worktree preservation on close
- `src/createSandbox.ts:210-232` — SIGINT/SIGTERM signal handlers
- `src/CopyToSandbox.ts:11-36` — reflink-aware file copy
- `src/run.ts:149-152` — WorktreeMode discriminated union

---

## Finding 1: Sandcastle implements the full worktree lifecycle (create → use → merge-back → cleanup) as a single bracket

**Confidence:** CONFIRMED
**Evidence:** `SandboxFactory.ts:423-563`

```typescript
return Effect.acquireUseRelease(
  // Acquire: prune stale + create worktree + start container
  WorktreeManager.pruneStale(hostRepoDir)
    .pipe(Effect.andThen(WorktreeManager.create(hostRepoDir, { branch }))),
  // Use: run agent work
  ({ worktreeInfo }) => makeEffect({ hostWorktreePath: worktreeInfo.path }),
  // Release: remove container; decide on worktree based on dirty state
  ({ worktreeInfo }, exit) =>
    removeContainer(containerName).pipe(
      Effect.andThen(
        WorktreeManager.hasUncommittedChanges(worktreeInfo.path).pipe(
          Effect.flatMap((isDirty) => isDirty
            ? Effect.void  // preserve
            : WorktreeManager.remove(worktreeInfo.path)  // cleanup
          ),
        ),
      ),
    ),
);
```

The `acquireUseRelease` pattern guarantees cleanup even on crash/error. The release phase has access to `exit` status (success/failure) for context-aware decisions.

## Finding 2: Three worktree modes as a discriminated union

**Confidence:** CONFIRMED
**Evidence:** `run.ts:149-152`

```typescript
export type WorktreeMode =
  | { readonly mode: "none" }        // bind-mount host dir directly
  | { readonly mode: "temp-branch" } // auto-create + auto-merge-back (default)
  | { readonly mode: "branch"; readonly branch: string };  // explicit named branch
```

- `none`: no worktree, agent works on host directory. Incompatible with `copyToSandbox`.
- `temp-branch`: creates `sandcastle/<name>/<timestamp>` branch, commits on it, merges back to host branch, deletes temp branch. Default mode.
- `branch`: creates worktree on named branch. Commits stay permanently. Used for parallel feature work.

## Finding 3: Branch collision detection prevents dual-checkout errors

**Confidence:** CONFIRMED
**Evidence:** `WorktreeManager.ts:142-153`

```typescript
const existing = yield* listWorktrees(repoDir);
const collision = existing.find((wt) => wt.branch === branch);
if (collision) {
  yield* Effect.fail(
    new WorktreeError({
      message: `Branch '${branch}' is already checked out in worktree at '${collision.path}'. ` +
        `Use a different branch name, or wait for the other run to finish.`,
    }),
  );
}
```

Checks `git worktree list --porcelain` before creating. This prevents the `fatal: '<branch>' is already checked out` git error with a user-friendly message.

## Finding 4: Stale worktree pruning runs automatically before creation

**Confidence:** CONFIRMED
**Evidence:** `SandboxFactory.ts:432`, `WorktreeManager.ts:165-189`

```typescript
// pruneStale() runs before every worktree creation
WorktreeManager.pruneStale(hostRepoDir)
  .pipe(Effect.andThen(WorktreeManager.create(hostRepoDir, { branch })))
```

`pruneStale()` implementation:
1. Lists all worktrees via `git worktree list --porcelain`
2. Filters for worktrees under `.sandcastle/worktrees/`
3. Checks if each worktree path still exists on disk
4. Removes stale references (deleted directory but git still tracks them)

This prevents stale worktree references from accumulating after crashes or manual deletions.

## Finding 5: Dirty worktree preservation on close and on signal

**Confidence:** CONFIRMED
**Evidence:** `createSandbox.ts:235-265` (close), `createSandbox.ts:210-232` (signals)

On `close()`:
```typescript
const isDirty = await Effect.runPromise(
  WorktreeManager.hasUncommittedChanges(worktreePath).pipe(
    Effect.catchAll(() => Effect.succeed(false)),
  ),
);
if (isDirty) {
  return { preservedWorktreePath: worktreePath };
}
// else: git worktree remove --force
```

`CloseResult` returns `preservedWorktreePath` so the caller knows where to find preserved work.

On SIGINT/SIGTERM:
```typescript
const forceCleanup = async () => {
  // Remove Docker container (always)
  await Effect.runPromise(removeContainer(containerName));
  // Check dirty state before deciding on worktree
  const isDirty = await Effect.runPromise(
    WorktreeManager.hasUncommittedChanges(worktreePath)
  ).catch(() => false);
  if (!isDirty) {
    await Effect.runPromise(WorktreeManager.remove(worktreePath));
  }
  // else: worktree preserved for manual recovery
  process.exit(1);
};
process.on("SIGINT", forceCleanup);
process.on("SIGTERM", forceCleanup);
```

Both paths share the same logic: check dirty → preserve if dirty, cleanup if clean.

## Finding 6: Temp-branch merge-back uses git merge (not cherry-pick)

**Confidence:** CONFIRMED
**Evidence:** `SandboxLifecycle.ts:154-206`

```typescript
// After agent work completes:
// 1. Detach worktree from temp branch
// 2. git merge temp-branch onto host branch
// 3. Delete temp branch
```

Explicitly uses `git merge` (not cherry-pick) because cherry-pick breaks with merge commits from parallel work. This aligns with the report's D4 finding that cherry-pick "breaks ancestry."

## Finding 7: `copyToSandbox` uses reflink-aware copy for fast node_modules transfer

**Confidence:** CONFIRMED
**Evidence:** `CopyToSandbox.ts:11-36`

```typescript
execFile("cp", ["-R", "--reflink=auto", src, dest], (error) => {
  if (error) {
    // Fall back to regular copy if reflink not supported
    execFile("cp", ["-R", src, dest], () => {
      resume(Effect.succeed(undefined));
    });
  }
});
```

`--reflink=auto`: uses copy-on-write when filesystem supports it (APFS on macOS, Btrfs on Linux). 500MB `node_modules` = near-instant metadata operation instead of full byte copy. Double fallback: reflink → regular copy → succeed anyway.

Usage pattern from templates:
```typescript
await using sandbox = await sandcastle.createSandbox({
  copyToSandbox: ["node_modules"],  // CoW copy at creation time
  hooks: { onSandboxReady: [{ command: "npm install" }] },  // safety net for platform binaries
});
```

---

## Negative searches

- Searched for conflict resolution logic in Sandcastle → NOT FOUND. Merge uses plain `git merge`; if it fails, error propagates to caller.
- Searched for merge ordering / conflict matrix → NOT FOUND. Single branch merge-back only.

---

## Gaps / follow-ups

- Sandcastle only merges ONE branch back (temp-branch → host). It has no N-branch merge strategy. That problem lives in the template layer (parallel-planner template has a "merge agent" phase).
- The reflink pattern could be benchmarked: how much faster is it for typical repos?
