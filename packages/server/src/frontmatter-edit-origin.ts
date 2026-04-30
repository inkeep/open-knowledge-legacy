import type { LocalTransactionOrigin } from '@hocuspocus/server';

/**
 * Transaction origin for the persistence-hook frontmatter-revert path.
 *
 * Object reference per precedent #1 — identity-based matching in the L3
 * frontmatter validation hook's entry-gate (`if (origin ===
 * FRONTMATTER_VALIDATION_REVERT_ORIGIN) return 'no-op'`). Mirrors
 * `CONFIG_VALIDATION_REVERT_ORIGIN`.
 *
 * `skipStoreHooks: true` is the primary defense against a revert →
 * validate → revert loop; the entry-gate is belt-and-suspenders. The
 * revert transaction body restores per-key `Y.Map('metadata')` slots from
 * an in-memory LKG cache; `skipStoreHooks` prevents Hocuspocus from firing
 * `onStoreDocument` for the revert itself, so the hook never re-validates
 * what is already known to be the last good state.
 *
 * NOT a paired-write origin — the revert is a `Y.Map`-only mutation. Adding
 * `paired: true` would route this origin through `isPairedWriteOrigin`'s
 * settlement-handler short-circuit, which is wrong: Observer A still must
 * fire after the revert so Y.Text re-syncs from the restored per-key state.
 */
export const FRONTMATTER_VALIDATION_REVERT_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'frontmatter-validation-revert' },
} as const satisfies LocalTransactionOrigin;
