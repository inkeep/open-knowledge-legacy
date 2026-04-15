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
import {
  applyByPrefixSuffix,
  prependFrontmatter,
  stripFrontmatter,
  VFileMessage,
} from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';
import { incrementServerObserverError, incrementServerObserverFire } from './metrics.ts';

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
    const info = {
      failedPatches,
      totalPatches: results.length,
      baseLen: oldXmlMd.length,
      userLen: newXmlMd.length,
      agentLen: currentText.length,
      mergedLen: mergedText.length,
    };
    const failedPatchDetail = dmpMerge.patch_toText(patches.filter((_, idx) => !results[idx]));
    console.warn(
      `[Server Observer A] patch_apply had ${failedPatches}/${results.length} failed patches`,
      info,
      failedPatchDetail,
    );
  }

  if (mergedText === currentText) return;
  applyByPrefixSuffix(ytext, currentText, mergedText);
}

/**
 * Normalize for bridge comparison: strip trailing whitespace per line,
 * strip trailing newlines, collapse 3+ consecutive newlines to 2.
 * Matches the client-side normalizeBridge in test-harness.ts and the
 * bridge invariant definition (CLAUDE.md §Bridge invariant).
 */
function normalizeBridge(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
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
 * Observer B (Y.Text → XmlFragment): parses Y.Text markdown, applies to
 * XmlFragment via updateYFragment. Handles frontmatter sync (Y.Text ↔ Y.Map).
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

      // Already-in-sync gate: if Y.Text already matches XmlFragment (after
      // bridge normalization), just update baseline. The normalization handles
      // trailing newline differences between raw Y.Text and serialized
      // XmlFragment (remark-stringify adds a trailing newline).
      if (normalizeBridge(currentText) === normalizeBridge(md)) {
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

      incrementServerObserverFire('a');
      lastSyncedXmlMd = md;
    } catch (err) {
      incrementServerObserverError('a');
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

    // No callback-level baseline refresh needed on the server. Unlike the
    // client Bug-B fix (which conditionally refreshes for remote transactions
    // to prevent stale baselines when multiple peers collaborate), the server
    // is the single writer for cross-CRDT sync. The baseline is correctly
    // managed by runObserverASync: updated after successful write and at the
    // already-in-sync gate (currentText === md → lastSyncedXmlMd = md).
    // Refreshing here would cause the debounce to see lastSyncedXmlMd === md
    // and early-exit without writing Y.Text.

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
      // Reset baseline to match Y.Text's actual state (still empty) so the
      // next Observer A firing treats the entire XmlFragment as new content
      // via Path A (incremental diff from empty → full doc). Without this,
      // baseline holds the full doc from init while Y.Text is empty — Path B's
      // DMP patch_apply would fail (no matching context in empty string).
      lastSyncedXmlMd = '';
    }
  }

  // ─── Observer B: Y.Text → XmlFragment ─────────────────────
  let debounceB: ReturnType<typeof setTimeout> | null = null;

  /**
   * Observer B sync work. Parses Y.Text markdown and applies to XmlFragment
   * via updateYFragment. Handles frontmatter sync: strips frontmatter from
   * Y.Text, caches in Y.Map('metadata'), parses body only.
   */
  const runObserverBSync = (): void => {
    debounceB = null;

    // If Observer A has a pending debounce, defer Observer B until after
    // Observer A runs. This prevents Observer B from overwriting XmlFragment
    // content that was just added by a WYSIWYG edit but hasn't been synced
    // to Y.Text yet. Observer B self-reschedules after DEBOUNCE_MS; by then
    // Observer A will have fired and cleared debounceA, allowing Observer B
    // to proceed. (Note: Observer A's Y.Text write uses OBSERVER_SYNC_ORIGIN
    // which Observer B's callback skips — the self-reschedule on the next
    // line is the sole recovery mechanism, not a retrigger from Observer A.)
    if (debounceA) {
      debounceB = sched.setTimeout(runObserverBSync, DEBOUNCE_MS);
      return;
    }

    try {
      const md = ytext.toString();
      const { frontmatter, body } = stripFrontmatter(md);

      // Early-exit: if XmlFragment already serializes to the same body
      // (after normalization), no work needed.
      const currentJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const currentBody = mdManager.serialize(currentJson);
      if (normalizeBridge(currentBody) === normalizeBridge(body)) {
        // Tree and text are already in sync — just update frontmatter if changed.
        const metaMap = doc.getMap('metadata');
        const currentFm = metaMap.get('frontmatter');
        if ((currentFm ?? '') !== frontmatter) {
          doc.transact(() => {
            metaMap.set('frontmatter', frontmatter);
          }, OBSERVER_SYNC_ORIGIN);
        }
        // Refresh Observer A's baseline so it doesn't see a stale delta.
        lastSyncedXmlMd = prependFrontmatter(frontmatter, currentBody);
        return;
      }

      let parsedJson: ReturnType<typeof mdManager.parse>;
      try {
        parsedJson = mdManager.parse(body);
      } catch (parseErr) {
        // Transient parse errors from remark-mdx/acorn while user is mid-edit.
        // XmlFragment keeps its last valid state; next keystroke retriggers.
        if (
          parseErr instanceof SyntaxError ||
          parseErr instanceof VFileMessage ||
          (parseErr instanceof RangeError &&
            (parseErr as RangeError).message.includes('Invalid content for node'))
        ) {
          console.debug('[Server Observer B] Parse skipped (partial/invalid markdown):', parseErr);
          return;
        }
        throw parseErr;
      }

      const pmNode = opts.schema.nodeFromJSON(parsedJson);

      doc.transact(() => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc, xmlFragment, pmNode, meta);
        const metaMap = doc.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
      }, OBSERVER_SYNC_ORIGIN);

      incrementServerObserverFire('b');

      // Re-serialize XmlFragment post-update for Observer A's baseline
      // (updateYFragment may normalize differently from input).
      try {
        const postJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
        const postBody = mdManager.serialize(postJson);
        lastSyncedXmlMd = prependFrontmatter(frontmatter, postBody);
      } catch (reserializeErr) {
        console.warn(
          '[Server Observer B] Post-sync re-serialization failed — using input body as baseline:',
          reserializeErr,
        );
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
      }
    } catch (err) {
      incrementServerObserverError('b');
      console.error('[Server Observer B] Failed to sync text→tree:', err);
    }
  };

  /**
   * Observer B callback — fires on every Y.Text change.
   * Origin guards prevent infinite loops and skip already-paired writes.
   */
  const observerB = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    // Self-skip: our own cross-CRDT write
    if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;

    // Already-paired writes: agent-write and file-watcher both write both
    // sides atomically. runObserverBSync will early-exit at the already-in-sync
    // gate, but we skip scheduling entirely to avoid unnecessary work.

    if (debounceB) sched.clearTimeout(debounceB);
    debounceB = sched.setTimeout(runObserverBSync, DEBOUNCE_MS);
  };

  // ─── Subscribe ─────────────────────────────────────────────
  xmlFragment.observeDeep(observerA);
  ytext.observe(observerB);

  // ─── Cleanup ───────────────────────────────────────────────
  return () => {
    if (debounceA) sched.clearTimeout(debounceA);
    if (debounceB) sched.clearTimeout(debounceB);
    xmlFragment.unobserveDeep(observerA);
    ytext.unobserve(observerB);
  };
}
