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
 * Dispatch model (precedent #13(b), bridge-correctness SPEC §6 R4): the
 * observers use `doc.on('afterAllTransactions', ...)` — per-drain, not
 * per-transaction, and not a wall-clock `setTimeout` debounce. One outermost
 * `doc.transact(...)` call = one drain = one settlement fire. Observer
 * callbacks set dirty flags; the settlement handler dispatches synchronous
 * sync work (A before B) and clears the flags.
 *
 * No typing-defer logic (server never types — that was client-specific UX).
 * No REMOTE_TREE_SYNC_GRACE_MS (origin guards replace the timing guard).
 * Fires on BOTH transaction.local=true (server-local) and local=false (remote).
 *
 * @see specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md
 * @see specs/2026-04-16-bridge-correctness/SPEC.md §6 R4, §10 D5
 */

import type { LocalTransactionOrigin } from '@hocuspocus/server';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import {
  applyFastDiff,
  applyIncrementalDiff,
  BridgeMergeContentLossError,
  getFrontmatter,
  mergeThreeWay,
  normalizeBridge,
  prependFrontmatter,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import {
  incrementBridgeMergeCheckpointCreated,
  incrementBridgeMergeContentLoss,
  incrementServerObserverError,
  incrementServerObserverFire,
} from './metrics.ts';
import { type ShadowHandle, saveInMemoryCheckpoint } from './shadow-repo.ts';

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
 * Branded `LocalTransactionOrigin` for paired-write semantics — transactions
 * where the caller atomically writes BOTH Y.XmlFragment and Y.Text inside
 * one `doc.transact(..., ORIGIN)` block.
 *
 * Compile-time extension of precedent #1 (bridge-correctness SPEC §6 R0 +
 * review iteration 5). Origin literals opt in by asserting `satisfies
 * PairedWriteOrigin` at their definition site; that annotation forces the
 * literal to carry `context.paired: true` and prevents typos. See the
 * four paired origins in the repo — AGENT_WRITE_ORIGIN, FILE_WATCHER_ORIGIN,
 * ROLLBACK_ORIGIN, MANAGED_RENAME_ORIGIN — each satisfies this shape.
 *
 * Runtime remains structural (`context.paired === true`) so remote-arriving
 * transactions (where the origin object identity is reconstructed by Yjs)
 * still match; `satisfies PairedWriteOrigin` is the authoring-site gate,
 * not a runtime `instanceof` narrowing.
 *
 * Today's paired origin count: 4. When adding a 5th, the ONLY required
 * change is `satisfies PairedWriteOrigin` at the literal. No registry
 * update. No Observer A/B wiring. No `BRIDGE_ENFORCING_ORIGINS` change
 * (that set is unrelated — it enforces the bridge-invariant watcher's
 * post-transaction assertion, not paired-write short-circuit).
 */
export type PairedWriteOrigin = LocalTransactionOrigin & {
  readonly context: {
    readonly origin: string;
    readonly paired: true;
  };
};

/**
 * Semantic match (bridge-correctness SPEC §6 R0, precedent #1 extension).
 *
 * When an observer callback sees a paired-write origin, it refreshes
 * `lastSyncedXmlMd` synchronously from the post-write state and declines to
 * set its dirty flag — the settlement handler then has no work to dispatch
 * for this drain (the paired writer already made both CRDTs consistent).
 *
 * The structural runtime check covers both locally-written origins (where the
 * object identity is the one we exported) and remote-arriving transactions
 * (where Yjs may have reconstructed the origin from the wire payload). The
 * `PairedWriteOrigin` brand above is the authoring-site compile-time gate;
 * this predicate is the read-site runtime gate. Both together close the
 * loop the T8/T9/T10 regression class left open.
 *
 * Fuzz reproduction: `STRESS_FUZZ_SEED=1776325179241 bun test
 * packages/app/tests/stress/bridge-convergence.fuzz.test.ts` produces an
 * "Oracle (e) content-set violation — missing 'M3-charlie hotel echo'" failure
 * whose proximate cause is a duplicated `M0-alpha echo` line that a later
 * agent-patch `indexOf('alpha')` locks onto instead of the intended target.
 */
const isPairedWriteOrigin = (origin: unknown): boolean => {
  if (origin == null || typeof origin !== 'object') return false;
  const ctx = (origin as { context?: { paired?: boolean } }).context;
  return ctx?.paired === true;
};

/**
 * Affirmative throw gate for `BridgeMergeContentLossError` inside Observer A
 * Path B. SPEC §10 D3-LOCKED commits production to the silent-checkpoint
 * recovery path (log + queue checkpoint + apply merge as-computed) so the
 * editor keeps responding; tests want the error loud so regressions surface.
 *
 * The check is affirmative rather than `NODE_ENV !== 'production'` because
 * Bun leaves `NODE_ENV` undefined when the runtime is `bun run` or
 * `open-knowledge start` — the negative form inverted the contract and
 * re-threw in production (bridge-correctness review iteration 4). `bun test`
 * auto-populates `NODE_ENV=test`, which is the primary signal; callers that
 * want loud failures outside `bun test` (integration harnesses launched via
 * `bun run`, spike scripts) opt in with `OK_RETHROW_BRIDGE_LOSS=1`.
 *
 * Exported for the unit-test regression guard — the gate decision is a
 * first-class concern, not an implementation detail.
 */
export function shouldRethrowBridgeMergeLoss(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test' || env.OK_RETHROW_BRIDGE_LOSS === '1';
}

// Bridge utilities (applyIncrementalDiff, applyFastDiff, mergeThreeWay,
// diffLinesFast, getFrontmatter, normalizeBridge) are imported from
// `@inkeep/open-knowledge-core` so they live in one place shared with the
// client observer (precedent #4: shared computation, per-surface rendering).

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Accessor for a `ShadowHandle` that may be lazy-initialized in the server
 * lifecycle. Observer A Path B's silent-checkpoint writer reads this
 * indirectly so a not-yet-ready shadow simply skips the checkpoint
 * (logging continues regardless — telemetry still records the violation).
 */
export type ShadowAccessor = () => ShadowHandle | undefined;

/**
 * Accessor for the current project branch name; used in the
 * `refs/checkpoints/<branch>/<sha>` ref namespace. Returns 'main' when the
 * git HEAD resolver isn't available (e.g., standalone repos without a
 * project `.git/`).
 */
export type BranchAccessor = () => string;

/**
 * Decision surfaced by the settlement handler on each drain it processes.
 *
 * - `'none'`: drain contained only observer-self or paired-write origins
 *   (baselines refreshed synchronously in the observer callback; no dispatch
 *   needed).
 * - `'a'`: Observer A's sync work ran (XmlFragment → Y.Text).
 * - `'b'`: Observer B's sync work ran (Y.Text → XmlFragment).
 *
 * A single drain can produce `'a'` followed by `'b'` — Observer A runs
 * before Observer B so any Y.Text write from A is visible to B.
 */
export type ObserverDispatchKind = 'none' | 'a' | 'b';

/**
 * Test-only hook — invoked after the settlement handler makes its dispatch
 * decision for a drain. Production code omits this; unit tests use it to
 * assert that paired-write drains produce `'none'` (no observer-layer work)
 * and that non-paired drains produce the expected 'a' and/or 'b' dispatches.
 *
 * Never throws — the settlement handler runs in `doc.on('afterAllTransactions')`
 * and a throw from here would propagate through Yjs's transaction machinery.
 * Tests use `expect` calls outside the hook body.
 */
export type ObserverDispatchHook = (kind: ObserverDispatchKind) => void;

export interface SetupServerObserversOpts {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
  /**
   * Per-document name; used as the tree-path + filename inside the silent
   * checkpoint commit so TimelinePanel can attribute the artifact to the
   * doc that produced the loss. Omit for unit tests that only exercise
   * the bridge mechanics; Path B then skips the checkpoint but still
   * emits the structured log and metrics counter.
   */
  docName?: string;
  /** Accessor for the shadow handle (lazy; may return undefined pre-init). */
  shadow?: ShadowAccessor;
  /** Accessor for the current branch name. Defaults to 'main' when omitted. */
  getBranch?: BranchAccessor;
  /** Absolute content root (used to place the blob inside the checkpoint tree). */
  contentRoot?: string;
  /**
   * Test-only dispatch hook. Omitted in production. When provided, called
   * once per drain (from inside `afterAllTransactions`) with the dispatch
   * decision the settlement handler made.
   */
  onDispatch?: ObserverDispatchHook;
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
 * Dispatch (precedent #13(b)): Observer callbacks only flag dirty state.
 * The `afterAllTransactions` listener runs Observer A's sync work first
 * (so any Y.Text write is visible to Observer B) and then Observer B's,
 * clearing the dirty flags afterwards. One outermost `doc.transact()` call
 * produces exactly one settlement dispatch.
 *
 * Returns a cleanup function that detaches the observers and the settlement
 * handler. The settlement handler holds no timers; cleanup is O(1).
 */
export function setupServerObservers(opts: SetupServerObserversOpts): () => void {
  const { doc, xmlFragment, ytext, mdManager, schema } = opts;

  /**
   * Structured-log + silent-checkpoint writer for mergeThreeWay post-condition
   * violations (SPEC §6 R7 + R9). Fire-and-forget on the checkpoint; the
   * bridge hot path never awaits the git commit. When `opts.shadow` /
   * `opts.docName` / `opts.contentRoot` aren't provided (unit tests), skip
   * the checkpoint — telemetry still records the violation.
   */
  const handleBridgeMergeLoss = (
    err: BridgeMergeContentLossError,
    preMergeBaseline: string,
  ): void => {
    // R9 structured log — machine-consumable, keyed shape so log aggregators
    // can chart rate-per-doc over time. See CLAUDE.md "Logging conventions"
    // — JSON.stringify for machine-read events, bracket-prefix for ad-hoc
    // operational warnings.
    //
    // `lostSubstrings` is redacted by default (length + FNV-1a digest) so
    // verbatim user content doesn't flow into log aggregators. Operators
    // running a single-tenant local deployment can opt in to raw strings
    // via `OK_TELEMETRY_VERBOSE=1`.
    const verbose = process.env.OK_TELEMETRY_VERBOSE === '1';
    console.warn(
      JSON.stringify({
        ...err.toLog({ verbose }),
        docName: opts.docName ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
    incrementBridgeMergeContentLoss();

    const shadow = opts.shadow?.();
    if (!shadow || !opts.docName) return;
    const branch = opts.getBranch?.() ?? 'main';
    const contentRoot = opts.contentRoot ?? '';
    queueMicrotask(() => {
      saveInMemoryCheckpoint(shadow, contentRoot, {
        kind: 'bridge-merge-loss',
        docName: opts.docName as string,
        contents: preMergeBaseline,
        label: `Before concurrent merge @ ${new Date().toISOString()}`,
        branch,
        metadata: { lostSubstrings: err.info.lostSubstrings },
      })
        .then((sha) => {
          incrementBridgeMergeCheckpointCreated();
          console.warn(
            JSON.stringify({
              event: 'bridge-merge-checkpoint-created',
              docName: opts.docName,
              sha,
              kind: 'bridge-merge-loss',
              timestamp: new Date().toISOString(),
            }),
          );
        })
        .catch((checkpointErr: unknown) => {
          const err =
            checkpointErr instanceof Error ? checkpointErr : new Error(String(checkpointErr));
          console.warn('[Server Observer A] Silent checkpoint write failed:', {
            name: err.name,
            message: err.message,
            stack: err.stack?.split('\n').slice(0, 4).join('\n'),
          });
        });
    });
  };

  // ─── Observer A: XmlFragment → Y.Text ─────────────────────
  let lastSyncedXmlMd = '';
  let xmlDirty = false;
  let textDirty = false;

  /** Initialize Observer A baseline from current XmlFragment state. */
  try {
    const initialJson = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
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
    try {
      const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
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

      const preMergeBaseline = lastSyncedXmlMd;
      doc.transact(() => {
        if (currentText === lastSyncedXmlMd) {
          // Path A: Y.Text in sync with baseline — use diffLines
          applyIncrementalDiff(ytext, currentText, md);
        } else {
          // Path B: Y.Text diverged — hybrid diff3+DMP three-way merge.
          // mergeThreeWay's post-condition (SPEC R1) throws
          // BridgeMergeContentLossError if content is dropped by the merge.
          // Production policy (D3-LOCKED, SPEC §10): log a structured event,
          // queue a silent version-history checkpoint of the pre-merge state
          // (US-004's saveInMemoryCheckpoint), and apply the merge as-computed
          // so the editor keeps responding. Dev/test re-throws so
          // integration tests and fuzz runs fail loudly.
          try {
            const mergedText = mergeThreeWay(lastSyncedXmlMd, md, currentText);
            applyFastDiff(ytext, currentText, mergedText);
          } catch (mergeErr) {
            if (!(mergeErr instanceof BridgeMergeContentLossError)) throw mergeErr;
            handleBridgeMergeLoss(mergeErr, preMergeBaseline);
            // D3-LOCKED polarity: throw only when the runtime affirmatively
            // identifies itself as a test (see `shouldRethrowBridgeMergeLoss`
            // JSDoc for why the gate is affirmative, not `!== 'production'`).
            if (shouldRethrowBridgeMergeLoss()) throw mergeErr;
            // Apply the merge's as-computed result so the editor progresses.
            applyFastDiff(ytext, currentText, mergeErr.info.result);
          }
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
   * Origin guards prevent infinite loops and opt the paired-write fast-path
   * out of settlement-handler dispatch.
   */
  const observerA = (_events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
    // Self-skip: our own cross-CRDT write
    if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;

    // Paired-write origins atomically wrote both XmlFragment and Y.Text inside
    // this transaction, so the baseline IS the current XmlFragment serialization.
    // Refresh synchronously and decline to set xmlDirty — the settlement
    // handler then has nothing to dispatch for this drain. Without this,
    // Observer A's sync would still run (harmlessly early-exit via the
    // normalize gate), but we prefer a typed structural short-circuit that
    // avoids the re-serialization work and documents the contract.
    // See `isPairedWriteOrigin` JSDoc for the fuzz seed.
    if (isPairedWriteOrigin(transaction.origin)) {
      try {
        const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
        const body = mdManager.serialize(json);
        const frontmatter = getFrontmatter(doc);
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
      } catch (err) {
        incrementServerObserverError('a');
        console.warn(
          '[Server Observer A] Paired-write baseline refresh failed — falling through to settlement:',
          err instanceof Error ? err.message : String(err),
        );
        // Fall through to the settlement path so the next afterAllTransactions
        // dispatch can recover. The runObserverASync catch block resets the
        // baseline from Y.Text if the underlying issue persists.
        xmlDirty = true;
      }
      return;
    }

    xmlDirty = true;
  };

  // ─── Initial sync: populate Y.Text from XmlFragment if empty ──
  if (xmlFragment.length > 0 && ytext.length === 0) {
    try {
      const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
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

  /**
   * Observer B sync work. Parses Y.Text markdown and applies to XmlFragment
   * via updateYFragment. Handles frontmatter sync: strips frontmatter from
   * Y.Text, caches in Y.Map('metadata'), parses body only.
   *
   * Under the settlement dispatcher, this always runs AFTER runObserverASync
   * within the same drain (when both flags are set), so any fresh XmlFragment
   * state from Observer A's write is already visible to this pass.
   */
  const runObserverBSync = (): void => {
    try {
      const md = ytext.toString();
      const { frontmatter, body } = stripFrontmatter(md);

      // Early-exit: if Y.Text already matches the last canonical XmlFragment
      // serialization (via normalizeBridge), tree and text are in sync.
      // Uses the maintained `lastSyncedXmlMd` baseline instead of a fresh
      // serialize(XmlFragment) call — the baseline is refreshed on every
      // Observer A path and on every paired-write origin's synchronous
      // short-circuit (lines 433-451), so it always reflects the current
      // canonical XmlFragment form. This avoids an O(doc-size) serialize
      // on every Observer B fire, which during bursty Y.Text writes
      // (chunked-paste of 1 MB in 20 × 50 KB transactions) aggregated to
      // hundreds of ms of wasted work on content the observer wouldn't
      // touch anyway.
      if (normalizeBridge(lastSyncedXmlMd) === normalizeBridge(md)) {
        // Tree and text are already in sync — just update frontmatter if changed.
        const metaMap = doc.getMap('metadata');
        const currentFm = metaMap.get('frontmatter');
        if ((currentFm ?? '') !== frontmatter) {
          doc.transact(() => {
            metaMap.set('frontmatter', frontmatter);
          }, OBSERVER_SYNC_ORIGIN);
        }
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

      // Canonicalize Y.Text to match serialize(XmlFragment) so the bridge
      // invariant `ytext === serialize(fragment)` holds after every B drain.
      // The canonical form is derived from `parsedJson` — the PM tree we just
      // wrote to XmlFragment via updateYFragment. Using parsedJson (which we
      // already have) instead of re-reading XmlFragment via
      // yXmlFragmentToProsemirrorJSON avoids a full-doc re-serialization on
      // every fire — under the settlement dispatcher, Observer B runs on
      // every Y.Text write including bursty ones (chunked-paste is 20×
      // 50 KB transactions, each triggering one B fire). Re-reading
      // XmlFragment on every fire was O(N²) aggregate work over a 1 MB
      // paste; using parsedJson is O(N) per fire and O(N · chunks) aggregate.
      //
      // Round-trip fast path: if `body` is already round-trip-stable
      // (serialize(parse(body)) === body), then canonicalYText === the input
      // Y.Text the client wrote, so applyFastDiff would be a no-op. Skip it
      // entirely. This is the overwhelmingly common case for clean markdown
      // (paste pipeline output, programmatic agent writes, chunked-source-
      // insert of already-canonical text). The slow path fires for
      // non-canonical bytes (CRDT merge interleaves producing unusual
      // whitespace, WYSIWYG-origin serializations with minor normalization
      // deltas), which is the regression class the canonicalization was
      // added to handle.
      //
      // The write uses OBSERVER_SYNC_ORIGIN so observers self-skip the
      // resulting inner drain (no cascading settlement work).
      try {
        const canonicalBody = mdManager.serialize(parsedJson);
        if (canonicalBody === body) {
          // Fast path: body is round-trip-stable. No canonicalization needed.
          lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
        } else {
          const canonicalYText = prependFrontmatter(frontmatter, canonicalBody);
          const currentYText = ytext.toString();
          if (currentYText !== canonicalYText) {
            doc.transact(() => {
              applyFastDiff(ytext, currentYText, canonicalYText);
            }, OBSERVER_SYNC_ORIGIN);
          }
          lastSyncedXmlMd = canonicalYText;
        }
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
      // Mirrors Observer A's baseline recovery pattern.
      try {
        const postJson = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
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
   * Origin guards prevent infinite loops and opt the paired-write fast-path
   * out of settlement-handler dispatch.
   */
  const observerB = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    // Self-skip: our own cross-CRDT write
    if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;

    // Paired-write origins atomically wrote both XmlFragment and Y.Text inside
    // this transaction. Symmetric counterpart to Observer A's branch above
    // (bridge-correctness SPEC §6 R0c). Refresh Observer A's baseline from the
    // post-paired-write XmlFragment state and decline to set textDirty — the
    // settlement handler has nothing to dispatch for this drain on the
    // paired-write path.
    if (isPairedWriteOrigin(transaction.origin)) {
      try {
        const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
        const body = mdManager.serialize(json);
        const frontmatter = getFrontmatter(doc);
        lastSyncedXmlMd = prependFrontmatter(frontmatter, body);
      } catch (err) {
        incrementServerObserverError('b');
        console.warn(
          '[Server Observer B] Paired-write baseline refresh failed — falling through to settlement:',
          err instanceof Error ? err.message : String(err),
        );
        // Fall through so the next afterAllTransactions can reconcile via
        // runObserverBSync's own recovery branches.
        textDirty = true;
      }
      return;
    }

    textDirty = true;
  };

  // ─── Settlement dispatcher (precedent #13(b), SPEC R4) ────────
  /**
   * Runs once per outermost `doc.transact()` drain after observers have fired
   * synchronously. Inspects the batch of transactions:
   *
   * - If no observer flagged dirty state (self-origin or paired-write only),
   *   dispatch nothing — baseline was already kept consistent inside the
   *   observer callbacks.
   * - Otherwise dispatch Observer A's sync first (its Y.Text write is
   *   visible to B's read), then Observer B's. Both are synchronous; each
   *   clears its flag before running so a reentrant transact started by
   *   the sync work doesn't double-dispatch.
   */
  const afterAll = (_doc: Y.Doc, transactions: Y.Transaction[]): void => {
    if (!xmlDirty && !textDirty) {
      opts.onDispatch?.('none');
      return;
    }
    // Belt-and-suspenders: if every transaction in this drain was our own
    // write, the observer callbacks should have self-skipped (flags stayed
    // false). If a dirty flag somehow got set anyway (e.g., an external
    // subscriber mutated our origin object), skip the dispatch — we don't
    // want to recurse on our own output.
    if (transactions.every((t) => t.origin === OBSERVER_SYNC_ORIGIN)) {
      xmlDirty = false;
      textDirty = false;
      opts.onDispatch?.('none');
      return;
    }

    // Observer A FIRST: if both flags are set (a rare case where a single
    // non-paired transaction mutated both CRDTs), A's write of Y.Text is
    // visible to B's subsequent read and B typically early-exits via its
    // normalize gate. This mirrors the debounce-era "defer Observer B while
    // Observer A pending" behavior but is now synchronous and ordered rather
    // than time-coupled.
    if (xmlDirty) {
      xmlDirty = false;
      opts.onDispatch?.('a');
      runObserverASync();
    }
    if (textDirty) {
      textDirty = false;
      opts.onDispatch?.('b');
      runObserverBSync();
    }
  };

  // ─── Subscribe ─────────────────────────────────────────────
  xmlFragment.observeDeep(observerA);
  ytext.observe(observerB);
  doc.on('afterAllTransactions', afterAll);

  // ─── Cleanup ───────────────────────────────────────────────
  return () => {
    doc.off('afterAllTransactions', afterAll);
    xmlFragment.unobserveDeep(observerA);
    ytext.unobserve(observerB);
  };
}
