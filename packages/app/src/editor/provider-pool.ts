import { HocuspocusProvider } from '@hocuspocus/provider';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import type { HocuspocusAuthToken } from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import * as Y from 'yjs';
import { mark } from '../lib/perf/mark';
import {
  asDocName,
  type ClientPersistenceProvider,
  captureStateVector,
  computeUnsyncedUpdate,
  createClientPersistence,
} from './client-persistence';
import { appendTraceContextToCollabUrl } from './collab-otel';
import { evictCmEditor, evictTiptapEditor } from './editor-cache';
import { sharedExtensions } from './extensions/shared.ts';
import { isSystemDoc } from './is-system-doc';
import { setupObservers } from './observers';
import { BridgeSetupError, invalidateSyncPromise, rejectSyncPromise } from './sync-promise';

/**
 * Opaque Y.Doc transaction origin applied when the pool replays a buffered
 * update onto a freshly-recycled provider. Lets tests and future observers
 * distinguish replay writes from user edits / server sync deliveries.
 */
export const TAB_REPLAY_ORIGIN = Object.freeze({ kind: 'tab-replay' } as const);

export type SyncState = 'connecting' | 'synced' | 'disconnected';

interface PoolEntry {
  provider: HocuspocusProvider;
  /**
   * Client-side Yjs persistence attached to this entry's Y.Doc. Hydrates
   * from IndexedDB on cold mount (instant Cmd-R), persists new updates to
   * the `ok-ydoc:${docName}` database, and is the handle the mismatch
   * recycle flow uses to `clearData()` before destroying the provider.
   * Null after the entry has been torn down.
   */
  persistence: ClientPersistenceProvider | null;
  /**
   * Server state vector captured after every `synced` event. The delta
   * between this and the Y.Doc's current state is the "unsynced buffer"
   * that must survive `server-instance-mismatch` recycle — after clearData
   * wipes the IDB, the buffered bytes are replayed onto the fresh
   * provider's Y.Doc at its first `synced` event.
   */
  lastServerSyncedSV: Uint8Array | null;
  observerCleanup: (() => void) | null;
  syncState: SyncState;
  docName: string;
  lastAccessedAt: number;
  hasSynced: boolean;
  tearingDown: boolean;
  pendingRecycleTimer: ReturnType<typeof setTimeout> | null;
  /**
   * True when `setupObservers` threw during initial sync. The provider stays
   * pool-resident so `EditorArea` keeps rendering the boundary subtree (which
   * shows `DocumentErrorBoundary`'s `BridgeSetupError` UI), but the entry is
   * inert — observers are not wired, no further writes will land. The user's
   * "Try again" path calls `pool.recycle(docName)` which destroys + recreates
   * the entry to retry from a clean slate.
   */
  bridgeSetupFailed: boolean;
}

type PoolChangeCallback = () => void;

const editorSchema = getSchema(sharedExtensions);

/**
 * How long to wait after a disconnect before recycling the provider (ms).
 * During this window the provider's built-in exponential backoff handles
 * reconnection attempts. If it reconnects and syncs, the pending recycle is
 * cancelled. If the window expires with the provider still disconnected, a
 * single recycle fires. Rapid disconnect events (server flapping) reset the
 * timer — collapsing a flap storm into one recycle at the end.
 *
 * 4s is long enough to ride out a server restart cycle (typically 1-3s) and
 * short enough that the user doesn't stare at a stale disconnected state.
 * Validated by the Liveblocks `lostConnectionTimeout` pattern (default 5s).
 */
const RECYCLE_DEBOUNCE_MS = 4_000;

/**
 * Periodic full-sync nudge for HocuspocusProvider. Secondary defense against
 * the `synced`-never-fires edge cases documented in hocuspocus#183 and
 * y-websocket#81; D7's 30s syncPromise timeout is the primary safety net.
 *
 * 5000ms chosen per SPEC.md §10 D8: 0.2 msgs/sec × 10 providers × 2 directions
 * ≈ 4 msgs/sec steady-state — negligible overhead vs the 100 msgs/sec the
 * originally-proposed 200ms interval would generate. Still catches the
 * never-fires edge within 5s, imperceptible vs the 30s timeout.
 */
const FORCE_SYNC_INTERVAL_MS = 5_000;

/**
 * Default pool capacity. Exported so the single point of truth lives in this
 * module (the pool that owns the constraint), and so callers that construct
 * a `ProviderPool` can reference the same name rather than a magic literal.
 *
 * Coupled to `ACTIVITY_MOUNT_LIMIT = 3` (exported from `EditorActivityPool.tsx`)
 * per SPEC.md §10 DX9 / precedent #15(c): `MAX_POOL` bounds how many warm
 * providers we keep; `ACTIVITY_MOUNT_LIMIT` bounds how many editor subtrees
 * are Activity-mounted inside those providers. The two constraints are
 * intentionally independent — pool-resident-but-not-Activity-mounted docs
 * keep their warm provider (≈5–10 MB) for fast Suspense-gated remount
 * without paying per-editor memory or observer-CPU cost.
 *
 * Changing either constant is an ASK_FIRST boundary (spec §16 / CLAUDE.md
 * scope). If one moves, audit the other for sympathetic impact.
 */
export const MAX_POOL = 10;

/**
 * Build the stringified JSON `token` HocuspocusProvider sends on every
 * connect, or `undefined` when no claim is set. Returning `undefined` (vs.
 * `'{}'`) preserves the pre-US-001 shape where the `token` option is simply
 * absent for anonymous connections — older servers that don't parse the
 * token see no change in the wire protocol.
 *
 * Exported for the MECHANISM-ONLY unit tests in `provider-pool.test.ts` per
 * the Commit 3 acceptance criteria in the spec. Callers inside this module
 * pass the current pool state; external callers should not depend on this
 * symbol.
 */
export function buildAuthToken(
  tabIdentity: { principalId: string; tabSessionId: string } | null,
  expectedServerInstanceId: string | null,
): string | undefined {
  // Type is type-only-imported from the server package — the schema's
  // single source of truth is `HocuspocusAuthTokenSchema`. Adding a field
  // there propagates to the type consumed here with no client-side drift.
  const claim: HocuspocusAuthToken = {};
  if (tabIdentity !== null) {
    claim.principalId = tabIdentity.principalId;
    claim.tabSessionId = tabIdentity.tabSessionId;
  }
  if (expectedServerInstanceId !== null && expectedServerInstanceId.length > 0) {
    claim.expectedServerInstanceId = expectedServerInstanceId;
  }
  if (Object.keys(claim).length === 0) return undefined;
  return JSON.stringify(claim);
}

/**
 * LRU pool of HocuspocusProvider instances. Plain TS class — not a React hook.
 * Owns WebSocket connections, survives React re-renders.
 *
 * **Contract — `wsUrl` is frozen at construction ("first-URL wins").**
 * `DocumentContext` instantiates the module-level singleton the first time
 * `useCollabUrl()` resolves a non-null URL. If `/api/config` later reports a
 * different URL (e.g. `ok start` crashed and was respawned on a different
 * kernel-allocated port, OR the user clicks the ConnectingBanner's Retry
 * after a terminal-state transition and `/api/config` now returns a new
 * port), this pool continues targeting the original URL.
 *
 * Why we accept this today: the built-in HocuspocusProvider exponential
 * backoff + our 4s recycle debounce handle server-restart-on-same-port
 * transparently, which is the common case. Port-change-on-restart is rare
 * enough that a full page reload is an acceptable recovery path — and
 * tearing down live providers mid-session would require deciding about
 * unsaved-CRDT-state preservation, which is out of scope for the
 * Zero-Ceremony Resume bet.
 *
 * The next maintainer who wants dynamic `wsUrl` updates must: (a) add a
 * tear-down + rebuild step keyed on `wsUrl` changes, (b) decide how to
 * reconcile any pending CRDT ops buffered during the disconnect, and (c)
 * extend the multi-client test harness with a port-change scenario.
 */
export class ProviderPool {
  readonly entries = new Map<string, PoolEntry>();
  private lruOrder: string[] = [];
  private activeDocName: string | null = null;
  private readonly maxSize: number;
  private readonly wsUrl: string;
  private readonly recycleDebounceMs: number;
  private onChange: PoolChangeCallback | null = null;
  private tabIdentity: { principalId: string; tabSessionId: string } | null = null;
  /**
   * Last-observed server instance ID. Set at boot via
   * `DocumentContext`'s one-shot `GET /api/server-info` fetch, and refreshed
   * on every `__system__` CC1 `server-info` broadcast arriving through
   * `SystemDocSubscriber`. When non-null, included in the auth token's
   * `expectedServerInstanceId` field on every `open()`. When the server
   * rejects with `reason: 'server-instance-mismatch'` (Commit 4), the
   * `authenticationFailed` handler nulls this field so the recycled
   * providers re-open with an anonymous claim and resync cleanly.
   *
   * Null-by-default: preserves the backward-compat path where a client that
   * never reached `/api/server-info` (endpoint 404, fetch blocked, boot
   * race) simply doesn't claim an instance ID — server treats this as a
   * legacy token and accepts.
   */
  private cachedServerInstanceId: string | null = null;
  /**
   * Unsynced-edit buffer captured per-doc during a `server-instance-mismatch`
   * recycle. Populated right before `clearData()` wipes IDB; drained at the
   * fresh provider's FIRST post-recycle `synced` event when the replay
   * listener applies the bytes back to the Y.Doc. In-memory only — a tab
   * crash inside the recycle window loses the buffer (accepted trade-off
   * per SPEC §6).
   */
  private readonly bufferedUpdates = new Map<string, Uint8Array>();

  constructor(maxSize: number, wsUrl: string, recycleDebounceMs?: number) {
    this.maxSize = maxSize;
    // wsUrl is REQUIRED post-lifecycle-split (US-014 / FR-1.13) — resolved
    // asynchronously by `useCollabUrl()` from the `ok ui` /api/config endpoint
    // before the pool is instantiated. Callers must not pass an empty string.
    this.wsUrl = wsUrl;
    this.recycleDebounceMs = recycleDebounceMs ?? RECYCLE_DEBOUNCE_MS;
  }

  /**
   * Set the browser tab's identity (principalId + tabSessionId) after the
   * principal has been fetched from the server. New provider opens will
   * include this as a JSON `token` in the HocuspocusProvider so the server's
   * `onAuthenticate` hook can set `connection.context.principalId` for
   * correct writer attribution (D50, US-024).
   */
  setTabIdentity(identity: { principalId: string; tabSessionId: string }): void {
    this.tabIdentity = identity;
  }

  /**
   * Update the cached server instance ID the pool will claim in every future
   * provider's auth token. Pass `null` to clear (used by the auth-failure
   * recycle path in Commit 4, and by the boot fetch on network failure).
   *
   * Idempotent: if the new ID matches the cached one, no-op. Does NOT
   * recycle existing providers — the claim only affects new `open()` calls.
   * Commit 4 wires recycle on server-side rejection, which is the path that
   * flips stale pools to the new ID.
   */
  setExpectedServerInstanceId(id: string | null): void {
    if (this.cachedServerInstanceId === id) return;
    this.cachedServerInstanceId = id;
  }

  /** Register a callback that fires whenever pool state changes. */
  setOnChange(cb: PoolChangeCallback | null): void {
    this.onChange = cb;
  }

  private notify(): void {
    this.onChange?.();
  }

  /** Touch a doc in the LRU order (move to end = most recently used). */
  private touch(docName: string): void {
    const idx = this.lruOrder.indexOf(docName);
    if (idx !== -1) this.lruOrder.splice(idx, 1);
    this.lruOrder.push(docName);
  }

  /**
   * Open (or reuse) a document. Returns the pool entry, or `null` if the
   * docName is reserved (the `__system__` pseudo-doc carries CC1 signals and
   * is never user-editable — see SPEC.md §10 DX7). If the pool is at
   * capacity, evicts the LRU entry (never the active doc).
   */
  open(docName: string): PoolEntry | null {
    if (isSystemDoc(docName)) return null;

    const existing = this.entries.get(docName);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      this.touch(docName);
      this.notify();
      return existing;
    }

    // Evict if at capacity
    if (this.entries.size >= this.maxSize) {
      this.evictLru();
    }

    const token = buildAuthToken(this.tabIdentity, this.cachedServerInstanceId);
    const provider = new HocuspocusProvider({
      // OTel trace context propagation for the WebSocket handshake. The
      // browser's WebSocket API cannot set request headers, so traceparent
      // rides in the query string. No-op when OTel is disabled.
      url: appendTraceContextToCollabUrl(this.wsUrl),
      name: docName,
      forceSyncInterval: FORCE_SYNC_INTERVAL_MS,
      ...(token !== undefined ? { token } : {}),
    });

    // Attach client-side Yjs persistence to the provider's Y.Doc. Hydrates
    // from `ok-ydoc:${docName}` on cold mount and persists every non-self
    // update back. On server-instance-mismatch, buffer-and-replay captures
    // unsynced edits before clearData + recycle.
    const persistence = createClientPersistence(asDocName(docName), provider.document);

    const entry: PoolEntry = {
      provider,
      persistence,
      lastServerSyncedSV: null,
      observerCleanup: null,
      syncState: 'connecting',
      docName,
      lastAccessedAt: Date.now(),
      hasSynced: false,
      tearingDown: false,
      pendingRecycleTimer: null,
      bridgeSetupFailed: false,
    };

    // Track sync state
    const onStatus = ({ status }: { status: string }) => {
      if (entry.tearingDown || this.entries.get(docName) !== entry) return;
      if (status === 'disconnected') {
        entry.syncState = 'disconnected';
        this.notify();
      }
    };
    const onSynced = () => {
      if (entry.tearingDown || this.entries.get(docName) !== entry) return;
      entry.syncState = 'synced';
      entry.hasSynced = true;
      // Refresh the "last server acked" state vector on every sync event —
      // the delta between this and the doc's current state is what the
      // `server-instance-mismatch` recycle buffers before calling clearData.
      entry.lastServerSyncedSV = captureStateVector(provider.document);
      // Cancel pending recycle — provider reconnected successfully
      if (entry.pendingRecycleTimer) {
        clearTimeout(entry.pendingRecycleTimer);
        entry.pendingRecycleTimer = null;
      }
      this.notify();

      // Set up bidirectional observers once after first sync. A throw here
      // (Y.js observer wiring failure, baseline read crash, schema mismatch)
      // is rare but must not be silent — without surfacing it through the
      // syncPromise, the user would see the doc vanish and fall back to the
      // empty "Select a document" state with no signal about what happened.
      //
      // Path: reject the syncPromise with BridgeSetupError + mark the entry
      // bridgeSetupFailed. The entry stays in the pool so `activeProvider`
      // remains non-null and `EditorArea` continues to render the boundary
      // subtree — `DocumentBoundary`'s suspended fiber re-renders, `use()`
      // re-throws the rejection, and `DocumentErrorBoundary` shows the
      // "Couldn't open document" UI. The user-driven retry path
      // (`pool.recycle(docName)`) destroys + recreates the entry on click;
      // until then the broken provider stays pool-resident but inert
      // (observers not wired, no further writes possible from this client).
      if (!entry.observerCleanup) {
        try {
          const doc = provider.document;
          const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
          entry.observerCleanup = setupObservers({
            doc,
            xmlFragment: doc.getXmlFragment('default'),
            ytext: doc.getText('source'),
            mdManager: mdMgr,
            schema: editorSchema,
            onSyncError: (direction, error) => {
              console.warn(`[Sync] ${direction} failed for ${docName}:`, error.message);
            },
          });
        } catch (err) {
          console.error(`[ProviderPool] setupObservers init failed for ${docName}:`, err);
          entry.bridgeSetupFailed = true;
          rejectSyncPromise(docName, new BridgeSetupError(docName, err));
        }
      }
    };
    const onDisconnect = () => {
      if (entry.tearingDown || this.entries.get(docName) !== entry) return;
      entry.syncState = 'disconnected';
      this.notify();

      // If this provider has no local-only CRDT changes buffered, schedule a
      // debounced recycle. During the debounce window the provider's built-in
      // exponential backoff handles reconnection — if it syncs before the timer
      // fires, onSynced cancels the pending recycle. Only the FIRST disconnect
      // sets the timer; subsequent disconnects (from failed reconnect attempts)
      // are no-ops — they shouldn't extend the window because each one just
      // means "still can't reach the server."
      if (entry.hasSynced && provider.unsyncedChanges === 0 && !entry.pendingRecycleTimer) {
        entry.pendingRecycleTimer = setTimeout(() => {
          entry.pendingRecycleTimer = null;
          if (entry.tearingDown || this.entries.get(docName) !== entry) return;
          this.recycleDisconnectedEntry(docName);
        }, this.recycleDebounceMs);
      }
    };

    // CRDT server-restart recovery (Shape 2+): when the server's
    // `onAuthenticate` throws with `reason: 'server-instance-mismatch'`,
    // OUR Y.Doc and OUR IndexedDB carry ghost items from the prior server
    // incarnation — letting Yjs sync merge them additively under the fresh
    // server's state produces the content-duplication bug class.
    //
    // The recycle flow is:
    //   1. Buffer each entry's unsynced delta (client's own writes the
    //      server hasn't yet acked) relative to its last-acked state vector.
    //   2. `clearData()` every entry's persistence — wipes IDB. Load-bearing:
    //      must run BEFORE the destroy/recycle path so the fresh provider
    //      hydrates an EMPTY IDB before sync delivers the markdown-rebuilt
    //      server state. Without this, the fresh Y.Doc rehydrates pre-
    //      restart items and observer-bridge resync writes under the new
    //      clientID produce 3x duplication.
    //   3. `recycleAllEntries()` — destroys every provider + re-opens the
    //      active doc with a fresh Y.Doc + fresh (empty) IDB.
    //   4. On the fresh provider's FIRST `synced` event, replay the buffered
    //      bytes back onto the Y.Doc so the user's unsynced edits survive.
    //
    // Idempotence: after a server restart, every open provider fires
    // authenticationFailed in quick succession. The first call nulls the
    // cached ID; subsequent calls find it already null and short-circuit.
    const onAuthenticationFailed = ({ reason }: { reason: string }): void => {
      if (reason !== 'server-instance-mismatch') return;
      if (this.cachedServerInstanceId === null) return;
      this.cachedServerInstanceId = null;
      this.handleServerInstanceMismatch();
    };

    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('disconnect', onDisconnect);
    provider.on('authenticationFailed', onAuthenticationFailed);

    // Buffer-replay wiring: if this docName has a pending buffered update
    // from a prior authenticationFailed recycle, apply it to the fresh
    // Y.Doc on the first `synced` event. The listener self-detaches after
    // firing once; if no buffered update exists for this docName, this is
    // a no-op path. Origin `TAB_REPLAY_ORIGIN` lets observers distinguish
    // replay writes from user edits / server sync deliveries.
    const buffered = this.bufferedUpdates.get(docName);
    if (buffered !== undefined) {
      const replayOnce = (): void => {
        provider.off('synced', replayOnce);
        if (entry.tearingDown || this.entries.get(docName) !== entry) return;
        const current = this.bufferedUpdates.get(docName);
        if (current === undefined) return;
        this.bufferedUpdates.delete(docName);
        Y.applyUpdate(provider.document, current, TAB_REPLAY_ORIGIN);
      };
      provider.on('synced', replayOnce);
    }

    this.entries.set(docName, entry);
    this.touch(docName);
    this.notify();

    return entry;
  }

  /**
   * Top of the `server-instance-mismatch` recycle flow. Split out of the
   * event handler so the three steps — buffer, clearData, recycle — are
   * sequenced with explicit awaits. Fire-and-forget at the call site: the
   * returned promise is owned here; errors are logged structurally and
   * never rethrown into Hocuspocus's event emitter.
   */
  private handleServerInstanceMismatch(): void {
    // Snapshot entries BEFORE any async work — subsequent recycle mutates
    // the map via destroyEntry → delete → re-open.
    const snapshot = Array.from(this.entries.entries());

    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.tearingDown) continue;
      const unsynced = computeUnsyncedUpdate(
        poolEntry.provider.document,
        poolEntry.lastServerSyncedSV,
      );
      if (unsynced.byteLength > 0) {
        this.bufferedUpdates.set(docName, unsynced);
      }
    }

    const clears: Promise<void>[] = [];
    for (const [docName, poolEntry] of snapshot) {
      const persistence = poolEntry.persistence;
      if (poolEntry.tearingDown || persistence === null) continue;
      clears.push(
        persistence.clearData().catch((err: unknown) => {
          console.warn(
            JSON.stringify({
              event: 'ok-client-persistence-clear-failed',
              docName,
              reason: err instanceof Error ? err.message : String(err),
            }),
          );
        }),
      );
    }

    Promise.all(clears)
      .then(() => {
        this.recycleAllEntries();
      })
      .catch((err: unknown) => {
        console.warn(
          JSON.stringify({
            event: 'ok-mismatch-recycle-failed',
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
      });
  }

  /**
   * Recycle every pool entry by calling `recycleDisconnectedEntry` for each.
   * Used by the `authenticationFailed` handler on `server-instance-mismatch`
   * — every provider in the pool is bound to a Y.Doc that merged items under
   * the old server's clientID, so all of them must restart from a fresh
   * Y.Doc before Yjs sync runs.
   *
   * Snapshot the keys first so mutations in `recycleDisconnectedEntry` (which
   * deletes + re-opens the active doc) don't disturb the iteration.
   */
  private recycleAllEntries(): void {
    const docNames = Array.from(this.entries.keys());
    for (const docName of docNames) {
      this.recycleDisconnectedEntry(docName);
    }
  }

  /**
   * V2 SPEC FR12 (Option G): pre-warm a provider on sidebar hover.
   *
   * Opens a HocuspocusProvider for `docName` WITHOUT promoting it in the
   * LRU order — the returned entry sits at LRU-oldest, evictable by any
   * subsequent user-initiated `open()`. Rate-limiting and concurrency
   * caps are the caller's responsibility (FileSidebar uses an 80 ms
   * intent debounce + a 3-concurrent cap per Audit §S4).
   *
   * Idempotent: if the doc is already in the pool (any state), returns
   * the existing entry without modification. The existing entry's LRU
   * position is unchanged by prewarm — calls to `touch()` only happen on
   * user-initiated `open()` / `setActive()`.
   *
   * Returns null for system docs. The pool does not evict an Activity-
   * mounted doc on prewarm admission — evictLru() always skips the
   * active doc. When the pool is at capacity, prewarm's cold-path
   * returns the newly-constructed entry even though it sits at the
   * oldest position and will be the first to be evicted.
   */
  prewarm(docName: string): PoolEntry | null {
    if (isSystemDoc(docName)) return null;
    const existing = this.entries.get(docName);
    if (existing) {
      // Already warm — return without touching LRU.
      return existing;
    }
    // Cold path: use `open()` to construct the provider but DO NOT touch
    // LRU or active. `open()` internally calls `touch(docName)` which
    // bumps LRU to most-recent — we need to counter-act so prewarms are
    // at the oldest slot. The simplest approach: let `open()` run its
    // full init, then move the docName to LRU-oldest immediately.
    const entry = this.open(docName);
    if (!entry) return null;
    // Demote to LRU-oldest — prewarms should never evict user-initiated docs.
    const idx = this.lruOrder.indexOf(docName);
    if (idx !== -1) {
      this.lruOrder.splice(idx, 1);
      this.lruOrder.unshift(docName);
    }
    return entry;
  }

  /** Close a specific document — disconnect and clean up. */
  close(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) return;

    this.destroyEntry(entry);
    this.entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);

    if (this.activeDocName === docName) {
      this.activeDocName = null;
    }
    this.notify();
  }

  /** Set the active document. Must already be open. */
  setActive(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) {
      throw new Error(`[ProviderPool] Cannot setActive — "${docName}" is not open`);
    }
    entry.lastAccessedAt = Date.now();
    this.touch(docName);
    this.activeDocName = docName;
    this.notify();
  }

  /** Clear the active document without closing any open providers. */
  clearActive(): void {
    if (this.activeDocName === null) return;
    this.activeDocName = null;
    this.notify();
  }

  /** Get the active pool entry, or null if nothing is active. */
  getActive(): PoolEntry | null {
    if (!this.activeDocName) return null;
    return this.entries.get(this.activeDocName) ?? null;
  }

  /** Get the active document name. */
  getActiveDocName(): string | null {
    return this.activeDocName;
  }

  /** Check if a document is open in the pool. */
  has(docName: string): boolean {
    return this.entries.has(docName);
  }

  /**
   * Destroy and recreate the entry for `docName`, preserving `activeDocName`
   * across the swap. Used by the "Try again" retry path in
   * `DocumentErrorBoundary` to recover from `BridgeSetupError` (or any sync
   * failure that leaves the provider in a known-broken state). Differs from
   * `close + open` in that it does NOT intermediately null `activeDocName`,
   * so `EditorArea` does not flash the "Select a document" empty state
   * during the swap.
   *
   * No-op if the doc is not in the pool.
   */
  recycle(docName: string): void {
    this.recycleDisconnectedEntry(docName);
  }

  /** Dispose of all entries. */
  dispose(): void {
    for (const entry of this.entries.values()) {
      this.destroyEntry(entry);
    }
    this.entries.clear();
    this.lruOrder = [];
    this.activeDocName = null;
    this.onChange = null;
  }

  private evictLru(): void {
    // Find the LRU entry that is NOT the active doc
    for (const docName of this.lruOrder) {
      if (docName !== this.activeDocName) {
        mark('ok/pool/evict-lru', { docName });
        this.close(docName);
        return;
      }
    }
  }

  private destroyEntry(entry: PoolEntry): void {
    entry.tearingDown = true;
    if (entry.pendingRecycleTimer) {
      clearTimeout(entry.pendingRecycleTimer);
      entry.pendingRecycleTimer = null;
    }
    // Detach the syncPromise cache entry BEFORE destroy() fires the provider's
    // `close` event — otherwise the sync-promise listener would reject the
    // already-consumed promise with PreSyncDisconnectError on pool-triggered
    // teardown. Natural (network-triggered) close events still reject as
    // expected because this path only runs inside pool destroy/recycle/evict.
    invalidateSyncPromise(entry.docName);
    // Evict V2 editor cache entries BEFORE destroying the provider: the cache
    // holds Editor/EditorView instances bound to `provider.document` via
    // Collaboration.configure / y-codemirror.next. If the cache survived the
    // pool's destroy, the next `mountTiptapEditor/mountCmEditor(docName)`
    // would return a stale entry bound to an orphaned Y.Doc (Critical #2 from
    // 2026-04-21 review). Coupling eviction here — the single point that
    // destroys the provider — keeps the invariant at one site. Eviction is
    // safe when the cache has no entry (no-op returns false). It also runs
    // editor.destroy() itself, so the React subtree receives a destroyed
    // editor on next mount and falls through to factory-construct a fresh
    // one.
    evictTiptapEditor(entry.docName);
    evictCmEditor(entry.docName);
    // Observer cleanup first (observers reference Y.Doc state), then full teardown
    entry.observerCleanup?.();
    entry.observerCleanup = null;

    // Tear down client-side persistence BEFORE the provider. The synchronous
    // part of y-indexeddb's `destroy()` runs `doc.off('update', _storeUpdate)`
    // and `doc.off('destroy', this.destroy)` immediately, so by the time
    // `provider.destroy()` runs (which calls `document.destroy()` internally)
    // the persistence's listeners are gone — no recursive re-entry. The
    // returned promise only covers the IDB connection close, which is safe
    // to run asynchronously against a separate IDB handle. We intentionally
    // do not `await` here — keeping `destroyEntry` synchronous preserves all
    // call-site shapes.
    const pendingPersistenceDestroy = entry.persistence?.destroy();
    pendingPersistenceDestroy?.catch((err) => {
      console.warn(`[ProviderPool] persistence destroy failed for ${entry.docName}:`, err);
    });
    entry.persistence = null;

    try {
      entry.provider.destroy(); // destroy() disconnects + removes all listeners + awareness cleanup
    } catch (err) {
      console.warn(`[ProviderPool] Provider destroy failed for ${entry.docName}:`, err);
    }
  }

  private recycleDisconnectedEntry(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.tearingDown) return;

    const wasActive = this.activeDocName === docName;
    mark('ok/pool/recycle-disconnected', { docName, wasActive });

    this.destroyEntry(entry);
    this.entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);

    if (wasActive) {
      // docName came from `this.entries.get(docName)` above — a system doc
      // cannot reach this branch because `open()` rejects system docs at
      // admission time.
      const reopened = this.open(docName);
      if (reopened) this.setActive(docName);
      return;
    }

    this.notify();
  }
}
