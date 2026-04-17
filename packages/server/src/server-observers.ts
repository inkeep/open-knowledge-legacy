/**
 * Server-authoritative observer bridge — single-writer cross-CRDT sync.
 *
 * Mirrors the client-side observer bridge's write-side logic on the server:
 *   Observer A: XmlFragment → Y.Text (Path A: applyIncrementalDiff; Path B: mergeThreeWay + applyFastDiff)
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
  applyFastDiff,
  applyIncrementalDiff,
  defaultScheduler,
  getFrontmatter,
  mergeThreeWay,
  normalizeBridge,
  prependFrontmatter,
  type Scheduler,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { AGENT_WRITE_ORIGIN } from './agent-sessions.ts';
import { FILE_WATCHER_ORIGIN } from './external-change.ts';
import { incrementServerObserverError, incrementServerObserverFire } from './metrics.ts';

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
 * FILE_WATCHER_ORIGIN in external-change.ts. Verified by the
 * persistenceDiskWrites counter in `server-observer-feedback-loop.test.ts`.
 */
export const OBSERVER_SYNC_ORIGIN = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'observer-sync' },
} as const satisfies LocalTransactionOrigin;

/**
 * Paired-write origins — transactions where the caller atomically wrote BOTH
 * XmlFragment and Y.Text inside a single `doc.transact(..., ORIGIN)` block:
 *
 *   - AGENT_WRITE_ORIGIN   → applyAgentMarkdownWrite (agent-sessions.ts)
 *   - FILE_WATCHER_ORIGIN  → applyExternalChange (external-change.ts)
 *
 * Observer A MUST synchronously refresh `lastSyncedXmlMd` and cancel any
 * pending debounce when it sees one of these origins. Otherwise, a concurrent
 * Y.Text mutation arriving during the 50 ms debounce window causes
 * `runObserverASync` to fire with a stale baseline and run Path B's
 * `mergeThreeWay` — which duplicates content when user (XmlFragment) and
 * agent (Y.Text) both contain the same addition.
 *
 * Fuzz reproduction: `STRESS_FUZZ_SEED=1776325179241 bun test
 * packages/app/tests/stress/bridge-convergence.fuzz.test.ts` produces an
 * "Oracle (e) content-set violation — missing 'M3-charlie hotel echo'" failure
 * whose proximate cause is a duplicated `M0-alpha echo` line that a later
 * agent-patch `indexOf('alpha')` locks onto instead of the intended target.
 */
const isPairedWriteOrigin = (origin: unknown): boolean =>
  origin === AGENT_WRITE_ORIGIN || origin === FILE_WATCHER_ORIGIN;

// Bridge utilities (applyIncrementalDiff, applyFastDiff, mergeThreeWay,
// diffLinesFast, Scheduler, defaultScheduler, getFrontmatter, normalizeBridge)
// are imported from `@inkeep/open-knowledge-core` so they live in one place
// shared with the client observer (precedent #4: shared computation,
// per-surface rendering).

const DEBOUNCE_MS = 50;

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
    incrementServerObserverError('a');
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
          // Path B: Y.Text diverged — hybrid diff3+DMP three-way merge
          const mergedText = mergeThreeWay(lastSyncedXmlMd, md, currentText);
          applyFastDiff(ytext, currentText, mergedText);
        }
      }, OBSERVER_SYNC_ORIGIN);

      incrementServerObserverFire('a');
      // Set baseline to the ACTUAL Y.Text state after the merge, not just
      // the XmlFragment serialization (md). Under Path B, the DMP merge
      // preserves content from Y.Text that wasn't in XmlFragment (e.g.,
      // concurrent source-mode edits). Setting baseline = md would cause
      // the NEXT firing to re-diff "old XmlFragment → new XmlFragment"
      // and re-include content already in Y.Text — producing duplication.
      // Setting baseline = Y.Text ensures the next Path B merge's
      // patch_make(baseline, newMd) only includes GENUINELY NEW changes.
      lastSyncedXmlMd = ytext.toString();
    } catch (err) {
      incrementServerObserverError('a');
      console.error('[Server Observer A] Failed to sync tree→text:', err);
      // Reset baseline to current Y.Text so the next retry computes a
      // fresh delta instead of re-applying the stale diff that just failed.
      try {
        lastSyncedXmlMd = ytext.toString();
      } catch (innerErr) {
        console.warn('[Server Observer A] Baseline recovery also failed:', innerErr);
      }
    }
  };

  /**
   * Observer A callback — fires on every XmlFragment deep change.
   * Origin guards prevent infinite loops and skip already-paired writes.
   */
  const observerA = (_events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
    // Self-skip: our own cross-CRDT write
    if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;

    // Paired-write origins atomically wrote both XmlFragment and Y.Text inside
    // this transaction, so the baseline IS the current XmlFragment serialization.
    // Refresh synchronously and cancel any pending debounce — a later
    // `runObserverASync` firing against stale `lastSyncedXmlMd` would incorrectly
    // take Path B and duplicate content when a concurrent Y.Text mutation lands
    // in the debounce window. See `isPairedWriteOrigin` JSDoc for the fuzz seed.
    if (isPairedWriteOrigin(transaction.origin)) {
      try {
        const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
        const body = mdManager.serialize(json);
        const frontmatter = getFrontmatter(doc);
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
        if (debounceA) {
          sched.clearTimeout(debounceA);
          debounceA = null;
        }
      } catch (err) {
        incrementServerObserverError('a');
        console.warn(
          '[Server Observer A] Paired-write baseline refresh failed — falling through to debounce:',
          err instanceof Error ? err.message : String(err),
        );
        // Fall through to the debounce path for best-effort recovery. The
        // next runObserverASync firing will reset the baseline from Y.Text
        // in its own catch block if the underlying issue persists.
        if (debounceA) sched.clearTimeout(debounceA);
        debounceA = sched.setTimeout(runObserverASync, DEBOUNCE_MS);
      }
      return;
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
      incrementServerObserverError('a');
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

      // FR-22 (G9 bridge always-live): parseWithFallback never throws — it
      // always produces a valid JSONContent tree, falling back to rawMdxFallback
      // for unparseable spans via single-pass structural enumeration (FR-23).
      // Replaces the previous mdManager.parse(body) + catch-and-freeze pattern
      // that swallowed SyntaxError/VFileMessage/RangeError and froze XmlFragment
      // on any malformed MDX. Under server-authoritative architecture
      // (precedent #14), this observer is the sole writer for XmlFragment — so
      // preserving the "always-live" contract here means no client sees frozen
      // WYSIWYG when another peer is mid-typing a broken MDX tag.
      //
      // Consistency: every other server parse call site already uses
      // parseWithFallback (persistence.ts, external-change.ts, agent-sessions.ts,
      // api-extension.ts). Previously this observer was the sole outlier.
      const parsedJson = mdManager.parseWithFallback(body);

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
      // Reset baseline to current XmlFragment state so the next retry computes
      // a fresh delta instead of re-applying the stale diff that just failed.
      // Mirrors Observer A's baseline recovery pattern (lines 167-168).
      try {
        const postJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
        const postBody = mdManager.serialize(postJson);
        const fm = getFrontmatter(doc);
        lastSyncedXmlMd = prependFrontmatter(fm, postBody);
      } catch (innerErr) {
        console.warn('[Server Observer B] Baseline recovery also failed:', innerErr);
      }
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
