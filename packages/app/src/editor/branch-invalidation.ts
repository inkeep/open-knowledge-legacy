/**
 * Client-side handler for the CC1 `branch-switched` broadcast.
 *
 * When the server normalizes to a new branch it emits a CC1 signal via
 * `cc1Broadcaster.emitBranchSwitched(newBranch)` on the `__system__`
 * pseudo-doc. `SystemDocSubscriber`'s `onStateless` handler parses the
 * payload and calls this module to clear every open provider's client-side
 * persistence cache and recycle the providers so they re-sync against the
 * new branch's markdown-rebuilt state.
 *
 * Contrast with the `server-instance-mismatch` flow in `provider-pool.ts`:
 * that path buffers unsynced edits and replays them post-recycle because
 * the edits are still semantically valid against the restarted server.
 * Branch switch is different — edits authored against branch A are NOT
 * valid against branch B's content, so we deliberately discard them.
 * Buffering would reintroduce stale markers from the old branch.
 */

import type { ProviderPool } from './provider-pool';

/**
 * Wipe every open provider's IndexedDB persistence and recycle the
 * providers. Accepts a `branch` label for structured observability — not
 * acted on for dedup because the server's `emitBranchSwitched` only fires
 * on the cross-branch normalization path (SPEC §Phase 4.1), so every
 * signal already represents a real branch change.
 *
 * `clearData` failures are caught per-entry and logged as structured
 * `ok-branch-switched-clear-failed` warn events so the recycle still
 * proceeds; a transient IDB hiccup on one doc must not leave the rest of
 * the pool stranded on branch A.
 */
export async function handleBranchSwitched(pool: ProviderPool, branch: string): Promise<void> {
  const clears: Promise<void>[] = [];
  for (const [docName, entry] of pool.entries) {
    if (entry.tearingDown || entry.persistence === null) continue;
    clears.push(
      entry.persistence.clearData().catch((err: unknown) => {
        console.warn(
          JSON.stringify({
            event: 'ok-branch-switched-clear-failed',
            docName,
            branch,
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
      }),
    );
  }
  await Promise.all(clears);
  pool.recycleAllEntries();
}
