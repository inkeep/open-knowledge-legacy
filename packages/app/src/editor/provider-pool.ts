import { HocuspocusProvider } from '@hocuspocus/provider';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { evictCmEditor, evictTiptapEditor } from './editor-cache';
import { sharedExtensions } from './extensions/shared.ts';
import { isSystemDoc } from './is-system-doc';
import { setupObservers } from './observers';
import { BridgeSetupError, invalidateSyncPromise, rejectSyncPromise } from './sync-promise';

export type SyncState = 'connecting' | 'synced' | 'disconnected';

interface PoolEntry {
  provider: HocuspocusProvider;
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

  constructor(maxSize: number, wsUrl: string, recycleDebounceMs?: number) {
    this.maxSize = maxSize;
    // wsUrl is REQUIRED post-lifecycle-split (US-014 / FR-1.13) — resolved
    // asynchronously by `useCollabUrl()` from the `ok ui` /api/config endpoint
    // before the pool is instantiated. Callers must not pass an empty string.
    this.wsUrl = wsUrl;
    this.recycleDebounceMs = recycleDebounceMs ?? RECYCLE_DEBOUNCE_MS;
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

    const provider = new HocuspocusProvider({
      url: this.wsUrl,
      name: docName,
      forceSyncInterval: FORCE_SYNC_INTERVAL_MS,
    });

    const entry: PoolEntry = {
      provider,
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

    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('disconnect', onDisconnect);

    this.entries.set(docName, entry);
    this.touch(docName);
    this.notify();

    return entry;
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
   * `DocumentErrorBoundary` and `NavigationPendingBar` tier-3 to recover from
   * `BridgeSetupError` (or any sync failure that leaves the provider in a
   * known-broken state). Differs from `close + open` in that it does NOT
   * intermediately null `activeDocName`, so `EditorArea` does not flash the
   * "Select a document" empty state during the swap.
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
        console.log(`[ProviderPool] Evicting LRU entry: ${docName}`);
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
    console.log(`[ProviderPool] Recycling disconnected entry: ${docName}`);

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
