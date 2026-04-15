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
 * No typing-defer logic (server never types — that was client-specific UX).
 * No REMOTE_TREE_SYNC_GRACE_MS (origin guards replace the timing guard).
 * Fires on BOTH transaction.local=true (server-local) and local=false (remote).
 *
 * @see specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md
 */

import type { LocalTransactionOrigin } from '@hocuspocus/server';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import { applyByPrefixSuffix, prependFrontmatter } from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';

// ─────────────────────────────────────────────────────────────
// Diff utilities (ported from packages/app/src/editor/diff-lines-fast.ts
// and packages/app/src/editor/observers.ts)
// ─────────────────────────────────────────────────────────────

/** Module-local DMP instance for line-level diff. */
const dmpDiff = new DiffMatchPatch();

interface DiffChange {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/** Fast line-level diff using DMP's line-mode optimization. */
function diffLinesFast(oldStr: string, newStr: string): DiffChange[] {
  if (oldStr === newStr) return [{ value: oldStr }];
  const { chars1, chars2, lineArray } = dmpDiff.diff_linesToChars_(oldStr, newStr);
  const diffs = dmpDiff.diff_main(chars1, chars2, false);
  dmpDiff.diff_charsToLines_(diffs, lineArray);
  dmpDiff.diff_cleanupSemantic(diffs);
  const result: DiffChange[] = [];
  for (const [op, text] of diffs) {
    if (op === DiffMatchPatch.DIFF_DELETE) {
      result.push({ value: text, removed: true });
    } else if (op === DiffMatchPatch.DIFF_INSERT) {
      result.push({ value: text, added: true });
    } else {
      result.push({ value: text });
    }
  }
  return result;
}

/** Module-local DMP instance for three-way merge. Match_Threshold pinned to 0.5. */
const dmpMerge = new DiffMatchPatch();
dmpMerge.Match_Threshold = 0.5;

// ─────────────────────────────────────────────────────────────
// Origin constant
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Scheduler interface (structural match with client Scheduler)
// ─────────────────────────────────────────────────────────────

/**
 * Scheduler interface for observer debounces and clock reference.
 * Structurally identical to the client-side Scheduler (observers.ts).
 * Production: real setTimeout/clearTimeout/Date.now passthrough.
 * Tests: inject ManualScheduler for deterministic flush.
 */
export interface Scheduler {
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  now: () => number;
}

const defaultScheduler: Scheduler = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  now: () => Date.now(),
};

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 50;

// ─────────────────────────────────────────────────────────────
// Observer internals
// ─────────────────────────────────────────────────────────────

/**
 * Apply incremental diff from `currentText` to `newText` on a Y.Text instance.
 * Uses diffLines to minimize CRDT mutations — preserves concurrent source-mode
 * edits when the changes are line-aligned.
 *
 * Ported from client observers.ts:213-258.
 */
function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;
  const changes = diffLinesFast(currentText, newText);
  let offset = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      const targetSlice = currentText.substring(offset, offset + next.value.length);
      if (targetSlice === next.value) {
        offset += next.value.length;
        i++;
        continue;
      }
      ytext.delete(offset, change.value.length);
      ytext.insert(offset, next.value);
      offset += next.value.length;
      i++;
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
 * Apply ONLY the user's delta to Y.Text when Y.Text has diverged from the
 * last synced XmlFragment state (Path B). Uses DMP three-way merge:
 *   base  = oldXmlMd (lastSyncedXmlMd)
 *   user  = newXmlMd (current XmlFragment serialized)
 *   agent = currentText (current Y.Text)
 *
 * Ported from client observers.ts:280-319.
 */
function applyUserDelta(ytext: Y.Text, oldXmlMd: string, newXmlMd: string): void {
  if (oldXmlMd === newXmlMd) return;
  const currentText = ytext.toString();
  const patches = dmpMerge.patch_make(oldXmlMd, newXmlMd);
  const [mergedText, results] = dmpMerge.patch_apply(patches, currentText);

  if (results.some((ok: boolean) => !ok)) {
    const failedPatches = results.filter((ok: boolean) => !ok).length;
    console.warn(
      `[Server Observer A] patch_apply had ${failedPatches}/${results.length} failed patches`,
    );
  }

  if (mergedText === currentText) return;
  applyByPrefixSuffix(ytext, currentText, mergedText);
}

/** Read frontmatter from Y.Doc metadata map. */
function getFrontmatter(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  const fm = metaMap.get('frontmatter');
  return typeof fm === 'string' ? fm : '';
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export interface SetupServerObserversOpts {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
  scheduler?: Scheduler;
}

/**
 * Set up server-side bidirectional observers between Y.XmlFragment and Y.Text.
 *
 * Observer A (XmlFragment → Y.Text): mirrors client Observer A's write-side
 * logic — Path A (diffLines + content-comparison gate when Y.Text in sync
 * with baseline) and Path B (DMP three-way merge when Y.Text diverged).
 *
 * Observer B (Y.Text → XmlFragment): added in US-003.
 *
 * Returns a cleanup function that detaches observers and clears debounces.
 */
export function setupServerObservers(opts: SetupServerObserversOpts): () => void {
  const { doc, xmlFragment, ytext, mdManager } = opts;
  const sched: Scheduler = opts.scheduler ?? defaultScheduler;

  // ─── Observer A: XmlFragment → Y.Text ─────────────────────
  let lastSyncedXmlMd = '';
  let debounceA: ReturnType<typeof setTimeout> | null = null;

  /** Initialize Observer A baseline from current XmlFragment state. */
  try {
    const initialJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
    const initialBody = mdManager.serialize(initialJson);
    const initialFrontmatter = getFrontmatter(doc);
    lastSyncedXmlMd = prependFrontmatter(initialFrontmatter, initialBody);
  } catch (err) {
    console.warn(
      '[Server Observer A] Baseline init failed — starting from empty snapshot:',
      err instanceof Error ? err.message : String(err),
    );
    lastSyncedXmlMd = '';
  }

  /**
   * Observer A sync work. Computes delta between lastSyncedXmlMd and current
   * XmlFragment, applies ONLY that delta to Y.Text.
   */
  const runObserverASync = (): void => {
    debounceA = null;
    try {
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const body = mdManager.serialize(json);
      const frontmatter = getFrontmatter(doc);
      const md = prependFrontmatter(frontmatter, body);

      if (lastSyncedXmlMd === md) return;

      const currentText = ytext.toString();

      // Already-in-sync gate: if Y.Text already matches XmlFragment, just
      // update baseline. Covers disk-bridge feedback and Observer B writes.
      if (currentText === md) {
        lastSyncedXmlMd = md;
        return;
      }

      doc.transact(() => {
        if (currentText === lastSyncedXmlMd) {
          // Path A: Y.Text in sync with baseline — use diffLines
          applyIncrementalDiff(ytext, currentText, md);
        } else {
          // Path B: Y.Text diverged — use DMP three-way merge
          applyUserDelta(ytext, lastSyncedXmlMd, md);
        }
      }, OBSERVER_SYNC_ORIGIN);

      lastSyncedXmlMd = md;
    } catch (err) {
      console.error('[Server Observer A] Failed to sync tree→text:', err);
    }
  };

  /**
   * Observer A callback — fires on every XmlFragment deep change.
   * Origin guards prevent infinite loops and skip already-paired writes.
   */
  const observerA = (_events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
    // Self-skip: our own cross-CRDT write
    if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;

    // Already-paired check for agent writes: applyAgentMarkdownWrite writes
    // both XmlFragment + Y.Text atomically, so the derived CRDT already matches.
    // We still schedule a debounce so Observer A can update its baseline, but
    // the runObserverASync body will early-exit at the currentText === md gate.
    // Same for FILE_WATCHER_ORIGIN (applyExternalChange pairs both sides).

    // Bug-B conditional baseline refresh (ported from client):
    // Only refresh baseline when no local debounce is pending.
    if (!debounceA) {
      try {
        const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
        const body = mdManager.serialize(json);
        const frontmatter = getFrontmatter(doc);
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
      } catch (_err) {
        // Non-critical — baseline catches up on next sync
      }
    }

    if (debounceA) sched.clearTimeout(debounceA);
    debounceA = sched.setTimeout(runObserverASync, DEBOUNCE_MS);
  };

  // ─── Initial sync: populate Y.Text from XmlFragment if empty ──
  if (xmlFragment.length > 0 && ytext.length === 0) {
    try {
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const body = mdManager.serialize(json);
      const frontmatter = getFrontmatter(doc);
      const md = prependFrontmatter(frontmatter, body);
      doc.transact(() => {
        ytext.insert(0, md);
      }, OBSERVER_SYNC_ORIGIN);
      lastSyncedXmlMd = md;
    } catch (err) {
      console.error('[Server Observer A] Failed initial sync:', err);
    }
  }

  // ─── Subscribe ─────────────────────────────────────────────
  xmlFragment.observeDeep(observerA);

  // ─── Cleanup ───────────────────────────────────────────────
  return () => {
    if (debounceA) sched.clearTimeout(debounceA);
    xmlFragment.unobserveDeep(observerA);
  };
}
