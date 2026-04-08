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
 *   any other content in Y.Text. Observer B defers while the user is typing to give
 *   Observer A time to sync the user's delta first.
 */

import type { MarkdownManager } from '@tiptap/markdown';
import type { Schema } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { diffLines } from 'diff';
import type * as Y from 'yjs';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';

export const ORIGIN_TREE_TO_TEXT = 'sync-from-tree';
export const ORIGIN_TEXT_TO_TREE = 'sync-from-text';

const DEBOUNCE_MS = 50;

/**
 * Window during which one side's recent activity blocks the other side's sync.
 * - If the user typed within TYPING_DEFER_MS, Observer B waits.
 * - If Y.Text was written by a non-local source within TYPING_DEFER_MS, Observer A waits.
 * Tuned to be long enough to cover fast-typing bursts and network round-trips, short
 * enough that source mode catches up quickly when the user pauses.
 */
const TYPING_DEFER_MS = 300;

// ─────────────────────────────────────────────────────────────
// Module-level coordination state
// ─────────────────────────────────────────────────────────────

/** Timestamp of the last local user typing event (set by markUserTyping). */
let lastUserTypedAt = 0;

/**
 * Mark that the local user just typed. Call this from the editor's DOM event handlers
 * (keydown, paste, drop, etc.). Observer B uses this to defer its tree replacement.
 */
export function markUserTyping(): void {
  lastUserTypedAt = Date.now();
}

/** Test helper: reset coordination state (call before each test case). */
export function __resetCoordinationState(): void {
  lastUserTypedAt = 0;
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
 * Apply ONLY the user's delta to Y.Text, when Y.Text has diverged from the last
 * synced XmlFragment state. This is used in the race-condition path where another
 * source (agent, peer, file watcher) wrote to Y.Text between Observer A syncs.
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

  // Compute line-level diff of the user's change: oldXmlMd → newXmlMd
  const changes = diffLines(oldXmlMd, newXmlMd);

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

  // Apply the result via the standard incremental diff
  applyIncrementalDiff(ytext, currentText, newText);
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
   * Defers briefly while the user is typing to coalesce rapid keystrokes into one
   * serialization pass.
   */
  const runObserverASync = (): void => {
    debounceA = null;

    // Coalesce rapid typing — if the user is still actively typing, wait a bit.
    // (Much shorter than TYPING_DEFER_MS because we now sync incrementally.)
    const elapsedSinceTyping = Date.now() - lastUserTypedAt;
    if (elapsedSinceTyping < DEBOUNCE_MS) {
      debounceA = setTimeout(runObserverASync, DEBOUNCE_MS - elapsedSinceTyping);
      return;
    }

    try {
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const body = mdManager.serialize(json);
      const frontmatter = getFrontmatter(doc);
      const md = prependFrontmatter(frontmatter, body);

      if (lastSyncedXmlMd === md) return; // No change since last sync

      const currentText = ytext.toString();
      console.log('[Observer A] sync tree→text');
      doc.transact(() => {
        if (currentText === lastSyncedXmlMd) {
          // Y.Text is in the state we last synced to. Safe to full-diff.
          applyIncrementalDiff(ytext, currentText, md);
        } else {
          // Y.Text has diverged — apply only the user's delta (lastSyncedXmlMd → md)
          // without subtracting the content that diverged.
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
    const elapsedSinceTyping = Date.now() - lastUserTypedAt;
    if (elapsedSinceTyping < TYPING_DEFER_MS) {
      // User is still typing. Defer.
      const waitMs = TYPING_DEFER_MS - elapsedSinceTyping;
      debounceB = setTimeout(runObserverBSync, waitMs);
      return;
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
        return;
      }

      const parsedJson = mdManager.parse(body);
      const pmNode = schema.nodeFromJSON(parsedJson);

      console.log('[Observer B] sync text→tree');
      doc.transact(() => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc, xmlFragment, pmNode, meta);
        const metaMap = doc.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
      }, ORIGIN_TEXT_TO_TREE);
    } catch (err) {
      // Parse error — log but don't crash. XmlFragment keeps last valid state.
      console.error('[Observer B] Failed to sync text→tree:', err);
      deps.onSyncError?.('text-to-tree', err instanceof Error ? err : new Error(String(err)));
    }
  };

  const observerB = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === ORIGIN_TREE_TO_TEXT) return;
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
