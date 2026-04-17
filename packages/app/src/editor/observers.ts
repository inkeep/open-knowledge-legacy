/**
 * Client-side observer baseline tracking for Y.XmlFragment and Y.Text.
 *
 * Under the server-authoritative architecture (precedent #14), cross-CRDT
 * sync writes are performed exclusively by the server observer module at
 * `packages/server/src/server-observers.ts`. This client module NO LONGER
 * writes the derived CRDT — the write paths (Observer A → Y.Text via
 * `applyByPrefixSuffix`, Observer B → XmlFragment via `updateYFragment`)
 * were deleted per FR-7 of the server-authoritative observer bridge spec.
 *
 * What this module STILL does:
 *   - Subscribes to XmlFragment and Y.Text changes (callbacks still fire)
 *   - Maintains `lastSyncedXmlMd` baseline for read-side reasoning and
 *     the Bug-B conditional-refresh logic from 2026-04-14 spec
 *   - Exports `ORIGIN_TREE_TO_TEXT` and `ORIGIN_TEXT_TO_TREE` typed origins
 *     (still used by the bridge-invariant watcher's enforcing set)
 *   - Exports `markUserTyping(doc)` for typing-defer in Observer B
 *   - Exports `setupObservers(deps)` — callers unchanged (G3)
 *
 * What this module does NOT do:
 *   - Write Y.Text (no `doc.transact(..., ORIGIN_TREE_TO_TEXT)`)
 *   - Write XmlFragment (no `doc.transact(..., ORIGIN_TEXT_TO_TREE)`)
 *   - Perform initial Y.Text population (server observer handles this)
 *
 * See `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` for
 * the full architectural rationale and Mutation G (FR-11) which validates
 * the deletion is load-bearing.
 */

import type { LocalTransactionOrigin } from '@hocuspocus/server';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import {
  defaultScheduler,
  getFrontmatter,
  prependFrontmatter,
  type Scheduler,
  stripFrontmatter,
  VFileMessage,
} from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';

// Re-export Scheduler + defaultScheduler for backward-compatible imports
// (test-harness.ts and observers.test.ts import Scheduler from this module).
// Authoritative definitions live in @inkeep/open-knowledge-core/bridge.
export { defaultScheduler, type Scheduler };

/**
 * Transaction origin for Observer A (tree → text).
 *
 * Precedent #1 (AGENTS.md): all Y.Doc transaction origins are `LocalTransactionOrigin`
 * OBJECT references, never raw strings. `Set.has()` matching in `trackedOrigins` or
 * the bridge-invariant watcher's enforcing set is identity-based for objects — a
 * string literal would silently fail to match the production tx.origin object.
 *
 * `as const satisfies` (Matt Pocock's "deeply read-only config" pattern) produces
 * a `Readonly<...>` sentinel whose field types are all narrow literals — makes
 * the singleton-immutability intent explicit at the type level alongside the
 * identity-match guarantee.
 */
export const ORIGIN_TREE_TO_TEXT = {
  source: 'local',
  skipStoreHooks: false,
  context: { origin: 'sync-from-tree' },
} as const satisfies LocalTransactionOrigin;

/**
 * Transaction origin for Observer B (text → tree). See `ORIGIN_TREE_TO_TEXT` JSDoc
 * for why this is an object, not a string.
 */
export const ORIGIN_TEXT_TO_TREE = {
  source: 'local',
  skipStoreHooks: false,
  context: { origin: 'sync-from-text' },
} as const satisfies LocalTransactionOrigin;

const DEBOUNCE_MS = 50;

/**
 * Window during which user typing activity defers Observer B's sync.
 * - Observer B: defers while user typed within TYPING_DEFER_MS (300ms).
 * - Observer A relies only on its normal debounce window (DEBOUNCE_MS = 50ms).
 * Tuned to be long enough to cover fast-typing bursts and network round-trips, short
 * enough that source mode catches up quickly when the user pauses.
 */
const TYPING_DEFER_MS = 300;
/**
 * Peer WYSIWYG edits arrive as a remote XmlFragment-only transaction first. The
 * remote peer's Observer A then emits a follow-up Y.Text transaction after its
 * local debounce window. Give that paired text sync one debounce window plus
 * network / event-loop slack before Observer B rebuilds from the current local
 * source buffer.
 *
 * This is a pragmatic eventual-consistency guard, not an explicit cross-client
 * handshake. If the follow-up text sync misses this window, Observer B may
 * briefly rebuild from stale local source, but the subsequent remote sync still
 * re-converges both surfaces instead of wedging the bridge. A future metadata-
 * based sync counter or similar event-driven handshake would let us remove this
 * heuristic entirely.
 */
const REMOTE_TREE_SYNC_GRACE_MS = DEBOUNCE_MS * 3;

// ─────────────────────────────────────────────────────────────
// Per-document coordination state
// ─────────────────────────────────────────────────────────────

interface TypingState {
  lastUserTypedAt: number;
  lastRemoteTreeOnlyAt: number;
  /** Scheduler used to read `now()` for timestamp recording. Defaults to
   *  `defaultScheduler` (real clock) when `markUserTyping` is called before
   *  `setupObservers` runs for this doc. `setupObservers` overrides with its
   *  injected scheduler so all elapsed-time comparisons use a consistent
   *  clock. */
  scheduler: Scheduler;
}

const typingStateByDoc = new WeakMap<Y.Doc, TypingState>();

function getTypingState(doc: Y.Doc): TypingState {
  let state = typingStateByDoc.get(doc);
  if (!state) {
    state = { lastUserTypedAt: 0, lastRemoteTreeOnlyAt: 0, scheduler: defaultScheduler };
    typingStateByDoc.set(doc, state);
  }
  return state;
}

/**
 * Module-level keystroke timestamp — shared across all docs so nav suppression
 * in `SystemDocSubscriber` can react to typing anywhere in the editor. This
 * is intentionally global (not per-doc) because the nav decision is global.
 */
let lastGlobalUserKeystrokeMs = 0;

/** Read the most-recent global user-keystroke timestamp (0 if never typed). */
export function getLastUserKeystroke(): number {
  return lastGlobalUserKeystrokeMs;
}

/**
 * Mark that the local user just typed. Call this from the editor's DOM event handlers
 * (keydown, paste, drop, etc.). Observer B uses the per-doc value to defer its tree
 * replacement. `SystemDocSubscriber` reads the global value to suppress agent-driven
 * nav during active user input.
 *
 * Uses the scheduler's `now()` for the per-doc timestamp so virtual-clock tests
 * observe consistent timestamps with scheduler `setTimeout` dueAt calculations.
 * The global `lastGlobalUserKeystrokeMs` always tracks the real clock because its
 * consumer (SystemDocSubscriber) compares against `Date.now()`.
 */
export function markUserTyping(doc: Y.Doc): void {
  const state = getTypingState(doc);
  state.lastUserTypedAt = state.scheduler.now();
  lastGlobalUserKeystrokeMs = Date.now();
}

// ─────────────────────────────────────────────────────────────
// Observer internals
// ─────────────────────────────────────────────────────────────

interface ObserverDeps {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema?: Schema;
  onSyncError?: (direction: 'tree-to-text' | 'text-to-tree', error: Error) => void;
  /** Optional scheduler injection for deterministic testing (FR-15).
   *  Default: arrow-wrapped passthrough to globalThis.setTimeout/clearTimeout.
   *  Tests: inject createManualScheduler() for synchronous flush. */
  scheduler?: Scheduler;
}

// getFrontmatter imported from @inkeep/open-knowledge-core (bridge module)

/**
 * Set up bidirectional observers between Y.XmlFragment and Y.Text.
 * Call after HocuspocusProvider connects. Observers persist for app lifetime.
 *
 * Returns a cleanup function that removes both observers.
 */
export function setupObservers(deps: ObserverDeps): () => void {
  const { doc, xmlFragment, ytext, mdManager } = deps;
  const sched: Scheduler = deps.scheduler ?? defaultScheduler;

  // Register the scheduler into the doc's TypingState so `markUserTyping`
  // (called from editor DOM event handlers, external to setupObservers)
  // reads the same clock as the observer timers. Without this, an injected
  // ManualScheduler would have `setTimeout` on virtual time but
  // `markUserTyping` would record real-clock timestamps, producing unbounded
  // skew in `elapsedSinceTyping` comparisons.
  getTypingState(doc).scheduler = sched;

  // Track the last XmlFragment state we successfully synced to Y.Text. On each sync,
  // Observer A computes the incremental delta between this snapshot and the current
  // XmlFragment state, and applies ONLY that delta to Y.Text. This preserves any
  // content in Y.Text that wasn't in the XmlFragment (e.g., agent writes that haven't
  // yet propagated via Observer B) — we don't subtract it because it's not part of
  // the user's delta.
  let lastSyncedXmlMd = '';

  // ─────────────────────────────────────────────────────────────
  // Observer A: XmlFragment → Y.Text
  // ─────────────────────────────────────────────────────────────
  let debounceA: ReturnType<typeof setTimeout> | null = null;

  /**
   * Observer A's sync work. Computes the delta between the previously-synced
   * XmlFragment state and the current state, and applies ONLY that delta to Y.Text.
   *
   * This is non-destructive: if Y.Text has content the XmlFragment doesn't have
   * (e.g., an agent write awaiting Observer B's propagation), that content is
   * preserved — it's not part of the user's delta so Observer A doesn't touch it.
   *
   * Debounced to coalesce rapid tree mutations into one serialization pass. The
   * older explicit "typed within the last 50ms" gate was redundant with this
   * debounce once typing state became per-document, so the debounce is now the
   * sole coalescing mechanism here.
   */
  const runObserverASync = (): void => {
    debounceA = null;

    try {
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const body = mdManager.serialize(json);
      const frontmatter = getFrontmatter(doc);
      const md = prependFrontmatter(frontmatter, body);

      if (lastSyncedXmlMd === md) {
        return;
      }

      // If Y.Text already matches the serialized XmlFragment, skip the write.
      // This guard covers two independent cases (both fixes converged on the
      // same check):
      //
      // 1. **Disk-bridge feedback loop** — the file watcher updated both
      //    XmlFragment and Y.Text in one transaction; nothing left to sync
      //    and writing would trigger persistence → disk → watcher feedback.
      //
      // 2. **Observer B external-write propagation** — Observer B just wrote
      //    agent/peer/undo content to XmlFragment. Y.Text and XmlFragment are
      //    now consistent; we must update lastSyncedXmlMd here so Observer A's
      //    next user-delta diff starts from the right baseline. Without this,
      //    Observer A would re-propagate the external content as a "user delta"
      //    on its next firing, duplicating it in Y.Text.
      // Under server-authoritative architecture (precedent #14), cross-CRDT
      // writes are performed exclusively by the server observer. The client
      // observer only maintains the baseline for read-side reasoning.
      lastSyncedXmlMd = md;
    } catch (err) {
      console.error('[Observer A] Failed to sync tree→text:', err);
      deps.onSyncError?.('tree-to-text', err instanceof Error ? err : new Error(String(err)));
    }
  };

  const observerA = (_events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
    if (transaction.origin === ORIGIN_TEXT_TO_TREE) return;
    if (!transaction.local) {
      // Remote XmlFragment change (server agent write, peer, cross-tab).
      // Server-side writes update Y.Text + XmlFragment together, but peer WYSIWYG edits
      // arrive as tree-only changes first and rely on the remote client's Observer A to
      // sync Y.Text later in a second transaction. Record whether this transaction
      // touched Y.Text so Observer B can briefly wait for that follow-up text sync
      // before rebuilding the tree from a stale local source buffer.
      try {
        const state = getTypingState(doc);
        // `changedParentTypes` is not part of the public Y.Transaction type. If a future
        // Yjs release removes or renames it, this degrades to arming the grace window for
        // every remote XmlFragment change, which adds latency but preserves convergence.
        const changedParentTypes = (
          transaction as Y.Transaction & { changedParentTypes?: Map<unknown, unknown> }
        ).changedParentTypes;
        state.lastRemoteTreeOnlyAt = changedParentTypes?.has(ytext) ? 0 : sched.now();

        // Bug-B fix: only refresh baseline when no local debounce is pending.
        // If debounceA is active, a local edit is waiting to sync — refreshing
        // the baseline to the post-remote state would cause the debounce's
        // early-exit (lastSyncedXmlMd === md) to fire, absorbing the local
        // edit. By keeping the old baseline, the debounce fires Path A/B with
        // the correct delta (old baseline → current XmlFragment).
        if (!debounceA) {
          const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
          const body = mdManager.serialize(json);
          const frontmatter = getFrontmatter(doc);
          lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
        }
      } catch (err) {
        // Non-critical — baseline will catch up on next local sync
        console.debug('[Observer A] Baseline refresh failed on remote change:', err);
      }
      return;
    }
    if (debounceA) sched.clearTimeout(debounceA);
    debounceA = sched.setTimeout(runObserverASync, DEBOUNCE_MS);
  };

  // ─────────────────────────────────────────────────────────────
  // Observer B: Y.Text → XmlFragment
  // ─────────────────────────────────────────────────────────────
  let debounceB: ReturnType<typeof setTimeout> | null = null;

  /**
   * Observer B's sync work. Self-reschedules if the user typed recently — we must wait
   * for typing to pause before we run updateYFragment, otherwise the tree replacement
   * will obliterate the user's in-flight XmlFragment mutations.
   *
   * Early-exit: if the current XmlFragment already serializes to the same markdown as
   * Y.Text (because Observer A synced in the meantime), skip updateYFragment entirely.
   */
  const runObserverBSync = (): void => {
    debounceB = null;
    const { lastRemoteTreeOnlyAt, lastUserTypedAt } = getTypingState(doc);
    const elapsedSinceTyping = sched.now() - lastUserTypedAt;
    if (elapsedSinceTyping < TYPING_DEFER_MS) {
      // User is still typing. Defer.
      const waitMs = TYPING_DEFER_MS - elapsedSinceTyping;
      debounceB = sched.setTimeout(runObserverBSync, waitMs);
      return;
    }
    if (lastRemoteTreeOnlyAt > 0) {
      const elapsedSinceRemoteTree = sched.now() - lastRemoteTreeOnlyAt;
      if (elapsedSinceRemoteTree < REMOTE_TREE_SYNC_GRACE_MS) {
        debounceB = sched.setTimeout(
          runObserverBSync,
          REMOTE_TREE_SYNC_GRACE_MS - elapsedSinceRemoteTree,
        );
        return;
      }
      // The paired remote Y.Text sync took longer than the grace window. Proceed with the
      // current local source buffer; if a stale rebuild happens here, the follow-up remote
      // sync still re-converges the document on the next transaction.
    }

    try {
      const md = ytext.toString();
      const { frontmatter, body } = stripFrontmatter(md);

      // Early-exit: if the current XmlFragment already matches Y.Text, no work needed.
      // Avoids the destructive updateYFragment tree replacement and any cursor disruption.
      const currentJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const currentBody = mdManager.serialize(currentJson);
      if (currentBody === body) {
        // Tree and text are already in sync — just update frontmatter if it changed.
        const metaMap = doc.getMap('metadata');
        if (metaMap.get('frontmatter') !== frontmatter) {
          doc.transact(() => {
            metaMap.set('frontmatter', frontmatter);
          }, ORIGIN_TEXT_TO_TREE);
        }
        // Refresh Observer A's baseline: XmlFragment and Y.Text are in sync.
        // Observer A's callback returns early for ORIGIN_TEXT_TO_TREE events (the
        // origin guard at the top of observerA), so it never runs its sync work for
        // Observer B's writes — this explicit update prevents the baseline from going
        // stale between Observer B cycles.
        lastSyncedXmlMd = prependFrontmatter(frontmatter, currentBody);
        return;
      }

      try {
        mdManager.parse(body);
      } catch (parseErr) {
        // MDX expression attributes (e.g., `<Chart data={[1,2,3]} />`) and other
        // partial syntax can cause remark-mdx / acorn parse failures while the user
        // is mid-edit. This is NOT a data loss event — XmlFragment keeps its last
        // valid state and the next keystroke will re-trigger Observer B. Log at
        // debug level; do NOT fire onSyncError (that's reserved for actual sync
        // failures, not transient live-typing parse noise).
        //
        // Only swallow genuinely transient parse errors from the remark-mdx pipeline:
        //   - SyntaxError: from acorn when {…} content isn't valid JavaScript
        //   - VFileMessage: from remark-mdx when tag/expression syntax is malformed
        //     (e.g., unclosed `<Tag` without guard protection, `</` incomplete)
        //   - RangeError "Invalid content for node": from ProseMirror schema validation
        //     when valid mdast maps to an invalid PM structure (e.g., text directive
        //     inside strikethrough → inline jsxComponent violates doc.content spec)
        // Non-transient errors (TypeError from handler bugs, etc.) must propagate
        // to onSyncError via the outer catch so regressions are visible.
        if (
          parseErr instanceof SyntaxError ||
          parseErr instanceof VFileMessage ||
          (parseErr instanceof RangeError &&
            (parseErr as RangeError).message.includes('Invalid content for node'))
        ) {
          console.debug('[Observer B] Parse skipped (partial/invalid markdown):', parseErr);
          return;
        }
        throw parseErr;
      }

      // Under server-authoritative architecture (precedent #14), cross-CRDT
      // writes (updateYFragment) are performed exclusively by the server observer.
      // The client observer only validates parse success for diagnostic purposes.
    } catch (err) {
      // Parse error — log but don't crash. XmlFragment keeps last valid state.
      console.error('[Observer B] Failed to sync text→tree:', err);
      deps.onSyncError?.('text-to-tree', err instanceof Error ? err : new Error(String(err)));
    }
  };

  const observerB = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === ORIGIN_TREE_TO_TEXT) return;
    // Skip remote Y.Text changes (from other tabs/peers). When another tab's
    // Observer A writes Y.Text, the corresponding XmlFragment change also arrives
    // via sync — no local Observer B processing needed. For server-side writes
    // (agent), the server now updates both Y.Text and XmlFragment in the same
    // transaction, so clients receive paired changes that are already in sync.
    if (!transaction.local) {
      getTypingState(doc).lastRemoteTreeOnlyAt = 0;
      return;
    }
    if (debounceB) sched.clearTimeout(debounceB);
    debounceB = sched.setTimeout(runObserverBSync, DEBOUNCE_MS);
  };

  xmlFragment.observeDeep(observerA);
  ytext.observe(observerB);

  // Initialize the last-synced snapshot from the current XmlFragment state.
  // Observer A uses this as the baseline for computing incremental user deltas.
  try {
    const initialJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
    const initialBody = mdManager.serialize(initialJson);
    const initialFrontmatter = getFrontmatter(doc);
    lastSyncedXmlMd = prependFrontmatter(initialFrontmatter, initialBody);
  } catch (err) {
    // Baseline init failure means Observer A starts from an empty snapshot;
    // the first sync will effectively be a full replacement. Surface this so
    // initialization failures are diagnosable rather than silent.
    console.warn(
      '[Observer A] Baseline init failed — starting from empty snapshot:',
      err instanceof Error ? err.message : String(err),
    );
    lastSyncedXmlMd = '';
  }

  // Initial Y.Text population is handled by the server observer (precedent #14).
  // The server observer's setupServerObservers() populates Y.Text from XmlFragment
  // on first attach if Y.Text is empty. Client observer no longer writes Y.Text.

  return () => {
    if (debounceA) sched.clearTimeout(debounceA);
    if (debounceB) sched.clearTimeout(debounceB);
    xmlFragment.unobserveDeep(observerA);
    ytext.unobserve(observerB);
  };
}
