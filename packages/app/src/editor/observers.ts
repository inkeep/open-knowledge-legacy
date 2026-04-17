/**
 * Client-side observer shell for Y.XmlFragment and Y.Text.
 *
 * Cross-CRDT sync writes run exclusively on the server observer module at
 * `packages/server/src/server-observers.ts` (precedent #14). The
 * historical client-side debounce + per-doc `TypingState` machinery was
 * removed under bridge-correctness SPEC §6 R5b / D14 DELEGATED = option
 * (a) DELETE. Precedent #13(b) — no wall-clock `setTimeout` in bridge
 * observer files; the grep gate at
 * `packages/server/src/bridge-no-wallclock.test.ts` pins this.
 *
 * The shell's surface reduces to:
 *   1. Own the `ORIGIN_TREE_TO_TEXT` / `ORIGIN_TEXT_TO_TREE` object
 *      identities required by the bridge-invariant watcher's enforcing
 *      set (precedent #1 identity match).
 *   2. Fire `onSyncError` for non-transient parse failures on Y.Text so
 *      the editor surfaces real diagnostics (transient mid-edit MDX
 *      syntax errors are swallowed at debug log).
 *   3. Record keystroke timestamps via `markUserTyping` for the
 *      `SystemDocSubscriber` agent-focus typing guard (global wall-clock
 *      timestamp, not per-doc state).
 *
 * See `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` and
 * `specs/2026-04-16-bridge-correctness/SPEC.md` §6 R4-R5b.
 */

import type { LocalTransactionOrigin } from '@hocuspocus/server';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { stripFrontmatter, VFileMessage } from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import type * as Y from 'yjs';

/**
 * Transaction origin for Observer A (historical tree → text direction).
 *
 * Precedent #1 (CLAUDE.md): all Y.Doc transaction origins are
 * `LocalTransactionOrigin` OBJECT references, never raw strings.
 * `Set.has()` matching in `trackedOrigins` or the bridge-invariant
 * watcher's `BRIDGE_ENFORCING_ORIGINS` set is identity-based — a string
 * literal would silently fail to match the production tx.origin object.
 *
 * Kept for identity-stable membership in the enforcing set even though
 * client observers no longer write the derived CRDT (precedent #14).
 */
export const ORIGIN_TREE_TO_TEXT = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'sync-from-tree' },
} satisfies LocalTransactionOrigin;

/**
 * Transaction origin for Observer B (historical text → tree direction).
 * See `ORIGIN_TREE_TO_TEXT` JSDoc for the identity rationale.
 */
export const ORIGIN_TEXT_TO_TREE = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'sync-from-text' },
} satisfies LocalTransactionOrigin;

// ─────────────────────────────────────────────────────────────
// Typing state (agent-focus guard consumer — SystemDocSubscriber)
// ─────────────────────────────────────────────────────────────

/**
 * Module-level keystroke timestamp — shared across all docs so nav
 * suppression in `SystemDocSubscriber` can react to typing anywhere in the
 * editor. Global by design because the nav decision is global. Always
 * tracks `Date.now()` because `SystemDocSubscriber` compares against the
 * real wall clock.
 */
let lastGlobalUserKeystrokeMs = 0;

/** Read the most-recent global user-keystroke timestamp (0 if never typed). */
export function getLastUserKeystroke(): number {
  return lastGlobalUserKeystrokeMs;
}

/**
 * Mark that the local user just typed. Call from the editor's DOM event
 * handlers (keydown, paste, drop, etc.). Updates the global keystroke
 * timestamp consumed by `SystemDocSubscriber`'s agent-focus typing guard.
 *
 * Previous iterations accepted a `Y.Doc` parameter that drove per-doc
 * typing-defer state; that state was deleted under server-authoritative
 * bridge + settlement dispatch (precedent #14 + SPEC §6 R5b). The
 * zero-arg shape pins the reduced surface so callers don't hold onto
 * `provider.document` unnecessarily (review iteration 5 cleanup).
 */
export function markUserTyping(): void {
  lastGlobalUserKeystrokeMs = Date.now();
}

// ─────────────────────────────────────────────────────────────
// Observer shell
// ─────────────────────────────────────────────────────────────

export interface ObserverDeps {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  /**
   * ProseMirror schema — retained in the interface for call-site
   * compatibility with the prior client-observer signature. No longer
   * used by the observer body under precedent #14; the server observer
   * owns all schema-involving mutations.
   */
  schema?: Schema;
  onSyncError?: (direction: 'tree-to-text' | 'text-to-tree', error: Error) => void;
}

/**
 * Attach the client observer shell to a Y.Doc.
 *
 * Observer A (XmlFragment): currently a no-op callback — the server owns
 * XmlFragment → Y.Text propagation. Subscribing keeps the callback slot
 * live so future read-side instrumentation can hook in without a signature
 * change, and makes the tear-down path symmetric with Observer B.
 *
 * Observer B (Y.Text): performs diagnostic parse validation so real (non-
 * transient) markdown failures surface via `onSyncError`. Transient
 * mid-edit errors (`SyntaxError`, `VFileMessage`, "Invalid content for
 * node" `RangeError`) are swallowed — XmlFragment keeps its last valid
 * state and the next keystroke re-triggers validation.
 *
 * Returns a cleanup function that detaches both callbacks. No timers to
 * clear — precedent #13(b) forbids wall-clock `setTimeout` here.
 */
export function setupObservers(deps: ObserverDeps): () => void {
  const { xmlFragment, ytext, mdManager } = deps;

  const observerA = (_events: Y.YEvent<Y.XmlFragment>[], _transaction: Y.Transaction): void => {
    // Intentionally empty under server-authoritative bridge (precedent #14).
    // The server observer (`server-observers.ts`) owns XmlFragment → Y.Text
    // propagation on its own copy of the Y.Doc. The client observer
    // subscribes only to keep the callback slot wired for future read-side
    // instrumentation without breaking call-site signatures.
  };

  const observerB = (_event: Y.YTextEvent, transaction: Y.Transaction): void => {
    // Skip self-origin writes (historical tree→text sync) — no such writes
    // happen today under precedent #14, but the guard keeps the identity-
    // based origin semantics intact for the enforcing set.
    if (transaction.origin === ORIGIN_TREE_TO_TEXT) return;
    // Skip remote transactions (peer/agent writes arriving via CRDT sync).
    // The server observer already propagated them to XmlFragment; the
    // client has no further work.
    if (!transaction.local) return;

    try {
      const md = ytext.toString();
      const { body } = stripFrontmatter(md);
      try {
        mdManager.parse(body);
      } catch (parseErr) {
        // Transient mid-edit MDX noise — log at debug and swallow.
        if (
          parseErr instanceof SyntaxError ||
          parseErr instanceof VFileMessage ||
          (parseErr instanceof RangeError && parseErr.message.includes('Invalid content for node'))
        ) {
          console.debug('[Observer B] Parse skipped (partial/invalid markdown):', parseErr);
          return;
        }
        throw parseErr;
      }
    } catch (err) {
      console.error('[Observer B] Failed to validate text→tree:', err);
      deps.onSyncError?.('text-to-tree', err instanceof Error ? err : new Error(String(err)));
    }
  };

  xmlFragment.observeDeep(observerA);
  ytext.observe(observerB);

  return () => {
    xmlFragment.unobserveDeep(observerA);
    ytext.unobserve(observerB);
  };
}
