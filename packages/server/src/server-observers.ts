/**
 * Server-authoritative observer bridge — single-writer cross-CRDT sync.
 *
 * Mirrors the client-side observer bridge's write-side logic on the server:
 *   Observer A: XmlFragment → Y.Text (via applyByPrefixSuffix)
 *   Observer B: Y.Text → XmlFragment (via updateYFragment)
 *
 * Runs on the server's copy of the Y.Doc so concurrent client edits converge
 * through one writer instead of N. Client observer cross-CRDT write paths are
 * deleted (not gated) — see precedent #14.
 *
 * @see specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md
 */

import type { LocalTransactionOrigin } from '@hocuspocus/server';

/**
 * Transaction origin for server observer cross-CRDT writes.
 *
 * Object reference per precedent #1 — identity-based matching in
 * Set.has / Y.UndoManager.trackedOrigins / attachBridgeInvariantWatcher
 * enforcing sets requires the exact object ref.
 *
 * skipStoreHooks: true — prevents observer → persistence → file-watcher →
 * observer feedback loop (EC4 blocker resolution). Same pattern as
 * FILE_WATCHER_ORIGIN in external-change.ts.
 */
export const OBSERVER_SYNC_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'observer-sync' },
} satisfies LocalTransactionOrigin;
