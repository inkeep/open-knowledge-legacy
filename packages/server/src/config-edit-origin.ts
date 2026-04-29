import type { LocalTransactionOrigin } from '@hocuspocus/server';

/**
 * Transaction origin for the persistence-hook config-doc revert path
 * (D45 Layer 3 / D58 / FR-34).
 *
 * Object reference per precedent #1 — identity-based matching in the
 * `onStoreDocument` config-doc branch's entry-gate (`if
 * (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return`).
 *
 * `skipStoreHooks: true` is the primary defense against a revert →
 * validate → revert loop; the entry-gate is belt-and-suspenders. The
 * revert transaction body replaces Y.Text content with the in-memory
 * LKG cache; `skipStoreHooks` prevents Hocuspocus from firing
 * `onStoreDocument` for the revert itself, so the hook never re-validates
 * what is already known to be the last good state.
 *
 * NOT a paired-write origin (D58, D41 — bridge is bypassed for config
 * docs at `server-observer-extension.ts:50`). No `paired: true` flag —
 * adding one would route this origin through `isPairedWriteOrigin`'s
 * settlement-handler short-circuit, which is wrong: the revert is a
 * Y.Text-only mutation with no XmlFragment counterpart.
 */
export const CONFIG_VALIDATION_REVERT_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'config-validation-revert' },
} satisfies LocalTransactionOrigin;

/**
 * Transaction origin for config-file-watcher → Y.Text writes (US-007 / FR-15 / D52).
 *
 * `skipStoreHooks: true` prevents the persistence-hook from re-writing the
 * file we just READ from disk — that is the exact feedback loop the watcher
 * exists to avoid. Without this flag, every external edit would round-trip
 * through Y.Text → onStoreDocument → tracedRename → chokidar → onChange and
 * the LKG-equality short-circuit would only break the loop one cycle later
 * than necessary.
 *
 * Identity-distinct from `CONFIG_VALIDATION_REVERT_ORIGIN` so any future
 * filtering or telemetry can tell the two skip-store paths apart even though
 * both carry `skipStoreHooks: true`.
 *
 * NOT a paired-write origin (bridge is bypassed for config docs at
 * `server-observer-extension.ts:50` per D41). No `paired: true` flag.
 */
export const CONFIG_FILE_WATCHER_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'config-file-watcher' },
} satisfies LocalTransactionOrigin;
