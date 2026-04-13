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
import { prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { diffLinesFast as diffLines } from './diff-lines-fast';

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
}

/**
 * Apply incremental diff from `currentText` to `newText` on a Y.Text instance.
 * Uses diffLines to minimize CRDT mutations — preserves concurrent source-mode edits
 * when the changes are line-aligned.
 */
function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;

  // No padding needed here — unlike `applyUserDelta` below, this function walks the
  // diff with byte-level `delete(offset, len)` + `insert(offset, value)` operations.
  // Even if `diffLines` produces a spurious `removed: X` + `added: X + Y` pair on an
  // unterminated final line, deleting X then re-inserting X+Y at the same offset
  // produces the correct net effect. The aliasing artifact cancels itself out.
  //
  // `applyUserDelta` is different: it walks line-by-line with content-matching
  // (`indexOf`), which IS vulnerable to the aliasing because lines are treated as
  // atoms. That function pads its inputs before diffing.
  const changes = diffLines(currentText, newText);
  let offset = 0;
  for (const change of changes) {
    if (change.removed) {
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
 * synced XmlFragment state. This is used in the race-condition path where another
 * source wrote to Y.Text between Observer A syncs. Known triggers: agent writes
 * (via `agent-write` origin), file-watcher disk events (via `file-watcher` origin),
 * and — critically — a remote peer's WYSIWYG edit arriving as a Y.Text-only
 * transaction while the local user is mid-sync on XmlFragment. This last trigger
 * was observed empirically during PR #43's multi-client test matrix merge and is
 * the reason single-client test coverage is insufficient for observer bridge changes.
 *
 * Strategy: compute the line-level diff between the old XmlFragment md and the new
 * XmlFragment md. For each added line, insert it at the corresponding line index in
 * Y.Text (matched by anchor lines before the insertion). For each removed line,
 * delete it from Y.Text (matched by content). This preserves any lines in Y.Text
 * that weren't in either old or new XmlFragment md — i.e., content from other sources.
 *
 * This is not a perfect three-way merge, but it's correct for the common case of
 * "user appends/deletes lines while agent appends lines". When two sources modify
 * overlapping lines simultaneously, the user's change wins (applied last).
 */
function applyUserDelta(ytext: Y.Text, oldXmlMd: string, newXmlMd: string): void {
  if (oldXmlMd === newXmlMd) return;

  const currentText = ytext.toString();
  const currentLines = currentText.split('\n');

  // Pad both sides with a trailing newline so diffLines aligns cleanly at line
  // boundaries. Without padding, an unterminated final line in `old` ("foo" with no
  // \n) aliases into a spurious "removed foo" + "added foo\n..." pair, which then
  // causes the added block to re-insert content we intended to leave alone.
  const oldPadded = oldXmlMd.endsWith('\n') ? oldXmlMd : `${oldXmlMd}\n`;
  const newPadded = newXmlMd.endsWith('\n') ? newXmlMd : `${newXmlMd}\n`;

  // Compute line-level diff of the user's change: oldXmlMd → newXmlMd.
  // With both inputs newline-terminated (padded above), diffLines treats each line as
  // an atomic token — removed+added pairs never share prefix lines, so no overlap
  // trimming is needed.
  const changes = diffLines(oldPadded, newPadded);

  // Walk the diff and apply each change to currentLines by matching context.
  // This preserves any lines in currentText that aren't part of oldXmlMd → newXmlMd
  // (e.g., lines from other sources that wrote to Y.Text between Observer A syncs).
  const resultLines = [...currentLines];
  let resultCursor = 0;

  for (const change of changes) {
    const changeLines = change.value.split('\n');
    // diffLines includes a trailing empty string when value ends with \n
    if (changeLines[changeLines.length - 1] === '') changeLines.pop();

    if (change.removed) {
      // Delete these lines from resultLines, matching by content
      for (const line of changeLines) {
        const idx = resultLines.indexOf(line, resultCursor);
        if (idx >= 0) {
          resultLines.splice(idx, 1);
          // resultCursor stays at the same position (next line is now here)
        }
      }
    } else if (change.added) {
      // Insert these lines into resultLines at resultCursor
      resultLines.splice(resultCursor, 0, ...changeLines);
      resultCursor += changeLines.length;
    } else {
      // Unchanged — advance resultCursor past these context lines
      for (const line of changeLines) {
        const idx = resultLines.indexOf(line, resultCursor);
        if (idx >= 0) {
          resultCursor = idx + 1;
        }
      }
    }
  }

  const newText = resultLines.join('\n');
  if (newText === currentText) return;

  // Apply the result directly via prefix/suffix comparison — avoids a second
  // diff pass that applyIncrementalDiff would perform.
  applyByPrefixSuffix(ytext, currentText, newText);
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
          applyUserDelta(ytext, lastSyncedXmlMd, md);
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

      let pmNode: ReturnType<typeof schema.nodeFromJSON>;
      try {
        const parsedJson = mdManager.parse(body);
        pmNode = schema.nodeFromJSON(parsedJson);
      } catch (parseErr) {
        // MDX expression attributes (e.g., `<Chart data={[1,2,3]} />`) and other
        // partial syntax can cause remark-mdx / acorn parse failures while the user
        // is mid-edit. This is NOT a data loss event — XmlFragment keeps its last
        // valid state and the next keystroke will re-trigger Observer B. Log at
        // debug level; do NOT fire onSyncError (that's reserved for actual sync
        // failures, not transient live-typing parse noise).
        console.debug('[Observer B] Parse skipped (partial/invalid markdown):', parseErr);
        return;
      }

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
