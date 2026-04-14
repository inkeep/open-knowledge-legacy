/**
 * Bidirectional observers between Y.XmlFragment('default') and Y.Text('source').
 *
 * Observer A (tree→text): Computes an incremental DELTA between the last-synced
 *   XmlFragment state and the current state, and applies ONLY that delta to Y.Text.
 *   This is non-destructive: if Y.Text has content the XmlFragment doesn't have
 *   (e.g., an agent write that hasn't been propagated via Observer B yet), that
 *   content is preserved.
 *
 * Observer B (text→tree): Parses Y.Text markdown, applies to XmlFragment via
 *   updateYFragment. Defers while the user is actively typing in WYSIWYG (the tree
 *   replacement would otherwise obliterate in-flight user mutations).
 *
 * Transaction origin guards prevent infinite loops:
 *   - Observer A writes with origin 'sync-from-tree', Observer B skips those.
 *   - Observer B writes with origin 'sync-from-text', Observer A skips those.
 *
 * Observer B early-exit: If the current XmlFragment already serializes to the same
 * markdown as Y.Text, skip updateYFragment entirely — nothing to do, avoid the tree
 * replacement and any cursor disruption.
 *
 * Race condition fix — concurrent user typing + agent write:
 *   Previously Observer A's diffLines(currentYText, newXmlMd) would subtract agent
 *   content from Y.Text because the XmlFragment didn't yet have it, and Observer B's
 *   updateYFragment would overwrite user XmlFragment content with the agent-only
 *   parsed tree. Both sides could destroy the other's in-flight content.
 *
 *   Fix: Observer A now tracks the last XmlFragment state it synced (lastSyncedXmlMd)
 *   and applies only the user's delta (lastSyncedXmlMd → currentXmlMd), preserving
 *   any other content in Y.Text. Observer B defers while the user is typing, and also
 *   waits briefly after a peer tree-only update so the corresponding remote Y.Text
 *   transaction can merge before updateYFragment rebuilds the tree.
 */

import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { prependFrontmatter, stripFrontmatter, VFileMessage } from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';
import { diffLinesFast as diffLines } from './diff-lines-fast';

// Module-local instance so DMP tuning never collides with other importers
// (e.g., diff-lines-fast.ts has its own instance). Match_Threshold pinned to
// the DMP default (0.5) explicitly per audit F15 — depending on the default
// would silently regress if a future module mutated the shared singleton.
const dmp = new DiffMatchPatch();
dmp.Match_Threshold = 0.5;

export const ORIGIN_TREE_TO_TEXT = 'sync-from-tree';
export const ORIGIN_TEXT_TO_TREE = 'sync-from-text';

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
}

const typingStateByDoc = new WeakMap<Y.Doc, TypingState>();

function getTypingState(doc: Y.Doc): TypingState {
  let state = typingStateByDoc.get(doc);
  if (!state) {
    state = { lastUserTypedAt: 0, lastRemoteTreeOnlyAt: 0 };
    typingStateByDoc.set(doc, state);
  }
  return state;
}

/**
 * Mark that the local user just typed. Call this from the editor's DOM event handlers
 * (keydown, paste, drop, etc.). Observer B uses this to defer its tree replacement.
 */
export function markUserTyping(doc: Y.Doc): void {
  getTypingState(doc).lastUserTypedAt = Date.now();
}

// ─────────────────────────────────────────────────────────────
// Observer internals
// ─────────────────────────────────────────────────────────────

interface ObserverDeps {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
  onSyncError?: (direction: 'tree-to-text' | 'text-to-tree', error: Error) => void;
  /** Optional: invoked when DMP patch_apply reports one or more failed patches
   *  during Observer A's Path B three-way merge. Diagnostic only — non-fatal.
   *  Consumers (debug panel, V0-14 telemetry) opt in; omitted callback = no-op.
   *  The same event is always logged via `console.warn`. */
  onMergeFailed?: (info: {
    failedPatches: number;
    totalPatches: number;
    baseLen: number;
    userLen: number;
    agentLen: number;
    mergedLen: number;
  }) => void;
}

/**
 * Apply incremental diff from `currentText` to `newText` on a Y.Text instance.
 * Uses diffLines to minimize CRDT mutations — preserves concurrent source-mode edits
 * when the changes are line-aligned.
 */
function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;

  // No padding needed here — this function walks the diff with byte-level
  // `delete(offset, len)` + `insert(offset, value)` operations. Even if `diffLines`
  // produces a spurious `removed: X` + `added: X + Y` pair on an unterminated final
  // line, deleting X then re-inserting X+Y at the same offset produces the correct
  // net effect. The aliasing artifact cancels itself out.
  const changes = diffLines(currentText, newText);
  let offset = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      // Content-comparison gate (D7): if Y.Text already has the added content
      // at this offset, skip both delete and insert — preserve CRDT Items.
      const targetSlice = currentText.substring(offset, offset + next.value.length);
      if (targetSlice === next.value) {
        // No-op replacement; advance offset by the (now equal) length.
        offset += next.value.length;
        i++; // consume the paired ADDED
        continue;
      }
      ytext.delete(offset, change.value.length);
      ytext.insert(offset, next.value);
      offset += next.value.length;
      i++; // consume the paired ADDED
    } else if (change.removed) {
      ytext.delete(offset, change.value.length);
    } else if (change.added) {
      ytext.insert(offset, change.value);
      offset += change.value.length;
    } else {
      offset += change.value.length;
    }
  }
}

/**
 * Apply a text change to Y.Text using prefix/suffix comparison — O(n) string
 * scan, zero diff algorithm overhead. Produces at most one delete + one insert
 * CRDT operation. Used by applyUserDelta to avoid a second diff pass.
 */
function applyByPrefixSuffix(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;

  let prefixLen = 0;
  const minLen = Math.min(currentText.length, newText.length);
  while (prefixLen < minLen && currentText[prefixLen] === newText[prefixLen]) prefixLen++;

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    currentText[currentText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deleteLen = currentText.length - prefixLen - suffixLen;
  const insertStr = newText.slice(prefixLen, newText.length - suffixLen);
  if (deleteLen > 0) ytext.delete(prefixLen, deleteLen);
  if (insertStr.length > 0) ytext.insert(prefixLen, insertStr);
}

/**
 * Apply ONLY the user's delta to Y.Text, when Y.Text has diverged from the last
 * synced XmlFragment state (Path B). Uses DMP's canonical three-way merge:
 *
 *   - base   = oldXmlMd (lastSyncedXmlMd, the common ancestor)
 *   - user   = newXmlMd (the user's branch via XmlFragment serialize)
 *   - agent  = currentText (the agent's branch in Y.Text)
 *
 * DMP `patch_make(base, user)` computes the user's edits as patches, then
 * `patch_apply(patches, agent)` applies them against the agent's diverged text.
 * The result preserves Item-equal prefix/suffix via `applyByPrefixSuffix`.
 *
 * Known merge semantics (LOCKED decisions):
 *   - D8: exact-character overlap (`base="hello", user="hello!", agent="hello!"`)
 *     produces `"hello!!"` — inherent to three-way merge, both sides independently
 *     made the same change. Mitigation paths NG6/NG7 deferred.
 *   - D9: user-wins on collision — when user deletes a line that agent modified,
 *     the deletion wins (DMP default behavior).
 */
function applyUserDelta(deps: ObserverDeps, oldXmlMd: string, newXmlMd: string): void {
  if (oldXmlMd === newXmlMd) return;
  const { ytext } = deps;
  const currentText = ytext.toString();

  // Three-way merge: patch built from base→user, applied to agent's diverged Y.Text.
  const patches = dmp.patch_make(oldXmlMd, newXmlMd);
  const [mergedText, results] = dmp.patch_apply(patches, currentText);

  // Failed patches indicate the patch's context could not be located in agent's
  // text within Match_Threshold. patch_apply still returns mergedText with the
  // successful patches applied and failed ones skipped — that's "user-wins on what
  // we could merge". Emit a console.warn (matches existing observers.ts
  // diagnostic precedent at lines 337/367/500) and invoke the optional
  // onMergeFailed callback for consumers who want structured signal.
  if (results.some((ok: boolean) => !ok)) {
    const failedPatches = results.filter((ok: boolean) => !ok).length;
    const info = {
      failedPatches,
      totalPatches: results.length,
      baseLen: oldXmlMd.length,
      userLen: newXmlMd.length,
      agentLen: currentText.length,
      mergedLen: mergedText.length,
    } as const;
    console.warn(
      `[Observer A] patch_apply had ${failedPatches}/${results.length} failed patches`,
      info,
    );
    deps.onMergeFailed?.(info);
  }

  if (mergedText === currentText) return;

  // Apply via prefix/suffix to minimize CRDT mutations beyond what patch_apply already
  // resolved. Items in the matching prefix/suffix are preserved (no delete fires for them).
  applyByPrefixSuffix(ytext, currentText, mergedText);
}

/** Read frontmatter from Y.Doc metadata map. */
function getFrontmatter(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  const fm = metaMap.get('frontmatter');
  return typeof fm === 'string' ? fm : '';
}

/**
 * Set up bidirectional observers between Y.XmlFragment and Y.Text.
 * Call after HocuspocusProvider connects. Observers persist for app lifetime.
 *
 * Returns a cleanup function that removes both observers.
 */
export function setupObservers(deps: ObserverDeps): () => void {
  const { doc, xmlFragment, ytext, mdManager, schema } = deps;

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

      const currentText = ytext.toString();

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
      if (currentText === md) {
        lastSyncedXmlMd = md;
        return;
      }

      doc.transact(() => {
        if (currentText === lastSyncedXmlMd) {
          applyIncrementalDiff(ytext, currentText, md);
        } else {
          applyUserDelta(deps, lastSyncedXmlMd, md);
        }
      }, ORIGIN_TREE_TO_TEXT);

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
        state.lastRemoteTreeOnlyAt = changedParentTypes?.has(ytext) ? 0 : Date.now();

        const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
        const body = mdManager.serialize(json);
        const frontmatter = getFrontmatter(doc);
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
      } catch (err) {
        // Non-critical — baseline will catch up on next local sync
        console.debug('[Observer A] Baseline refresh failed on remote change:', err);
      }
      return;
    }
    if (debounceA) clearTimeout(debounceA);
    debounceA = setTimeout(runObserverASync, DEBOUNCE_MS);
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
    const elapsedSinceTyping = Date.now() - lastUserTypedAt;
    if (elapsedSinceTyping < TYPING_DEFER_MS) {
      // User is still typing. Defer.
      const waitMs = TYPING_DEFER_MS - elapsedSinceTyping;
      debounceB = setTimeout(runObserverBSync, waitMs);
      return;
    }
    if (lastRemoteTreeOnlyAt > 0) {
      const elapsedSinceRemoteTree = Date.now() - lastRemoteTreeOnlyAt;
      if (elapsedSinceRemoteTree < REMOTE_TREE_SYNC_GRACE_MS) {
        debounceB = setTimeout(
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
        // Observer A's callback returns early for ORIGIN_TEXT_TO_TREE events (line 325),
        // so it never runs its sync work for Observer B's writes — this explicit update
        // prevents the baseline from going stale between Observer B cycles.
        lastSyncedXmlMd = prependFrontmatter(frontmatter, currentBody);
        return;
      }

      let parsedJson: ReturnType<typeof mdManager.parse>;
      try {
        parsedJson = mdManager.parse(body);
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

      // Schema validation errors (e.g., malformed PM JSON from a handler bug) are
      // NOT transient — they indicate a pipeline regression and must reach onSyncError
      // via the outer catch. Kept outside the parse try/catch deliberately.
      const pmNode = schema.nodeFromJSON(parsedJson);

      doc.transact(() => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc, xmlFragment, pmNode, meta);
        const metaMap = doc.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
      }, ORIGIN_TEXT_TO_TREE);

      // After updateYFragment, re-serialize XmlFragment to capture the post-sync state
      // (updateYFragment may normalize the tree differently from the input body). This
      // becomes Observer A's new baseline so its next delta diff starts from reality —
      // otherwise Observer A would see the new content as a "user delta" and re-propagate
      // it back into Y.Text (duplication / undo reversal bug).
      try {
        const postJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
        const postBody = mdManager.serialize(postJson);
        lastSyncedXmlMd = prependFrontmatter(frontmatter, postBody);
      } catch (err) {
        // Serialization failure is non-fatal — use the input body as a best-effort
        // baseline so Observer A's next delta diff starts from a reasonable state.
        // The convergence guard (currentText === md) will correct any remaining drift.
        //
        // Note: `onSyncError` is deliberately NOT called here. This is a recoverable
        // baseline drift (the fallback assignment below + the next-run convergence
        // guard together recover automatically), not a sync failure. Surfacing it as
        // an onSyncError would pollute telemetry with transient noise. The outer
        // catch below reserves onSyncError for actual sync failures (parse errors
        // that leave XmlFragment in a stale state).
        console.warn(
          '[Observer B] Post-sync re-serialization failed — using input body as baseline:',
          err,
        );
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
      }
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
    if (debounceB) clearTimeout(debounceB);
    debounceB = setTimeout(runObserverBSync, DEBOUNCE_MS);
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

  // Initial sync: populate Y.Text from current XmlFragment content
  if (xmlFragment.length > 0 && ytext.length === 0) {
    try {
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const body = mdManager.serialize(json);
      const frontmatter = getFrontmatter(doc);
      const md = prependFrontmatter(frontmatter, body);
      doc.transact(() => {
        ytext.insert(0, md);
      }, ORIGIN_TREE_TO_TEXT);
      lastSyncedXmlMd = md;
    } catch (err) {
      console.error('[Observer A] Failed initial sync:', err);
      deps.onSyncError?.('tree-to-text', err instanceof Error ? err : new Error(String(err)));
    }
  }

  return () => {
    if (debounceA) clearTimeout(debounceA);
    if (debounceB) clearTimeout(debounceB);
    xmlFragment.unobserveDeep(observerA);
    ytext.unobserve(observerB);
  };
}
