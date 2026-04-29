import { HocuspocusProvider } from '@hocuspocus/provider';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import type {
  HocuspocusAuthRejectionReason,
  HocuspocusAuthToken,
} from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import * as Y from 'yjs';
import { mark } from '../lib/perf/mark';
import {
  type ClientPersistenceProvider,
  captureStateVector,
  computeUnsyncedUpdate,
  createClientPersistence,
  mergeStateVectors,
  UNKNOWN_BRANCH_SENTINEL,
} from './client-persistence';
import { appendTraceContextToCollabUrl } from './collab-otel';
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
export type ServerRestartRecoveryState =
  | { kind: 'idle' }
  | {
      kind: 'recovering';
      phase: 'clearing-local-cache' | 'reconnecting';
      docNames: readonly string[];
      failedDocNames: readonly string[];
      startedAt: number;
    }
  | {
      kind: 'failed';
      reason: 'clear-data-failed' | 'clear-data-timeout';
      docNames: readonly string[];
      failedDocNames: readonly string[];
      startedAt: number;
    };

const IDLE_SERVER_RESTART_RECOVERY: ServerRestartRecoveryState = Object.freeze({ kind: 'idle' });

/**
 * Pool entries follow a two-state lifecycle modeled as a discriminated
 * union: `Active` (the normal case — provider live, persistence attached)
 * and `TearingDown` (transient, inside `destroyEntry` after the kind flip
 * but before the entry is removed from `entries`).
 *
 * The discriminator narrows `persistence`, `observerCleanup`, and
 * `pendingRecycleTimer` to their non-transient shapes when consumers know
 * the entry is Active — replaces the implicit-invariant pattern of
 * `if (entry.tearingDown || entry.persistence === null) continue;` that
 * accumulated across review rounds 3, 6, 7.
 *
 * Note on `bridgeSetupFailed`: kept as a flag on `Active` rather than a
 * third variant. A bridge-failed entry stays pool-resident with
 * persistence still attached and the recycle-on-disconnect path still
 * functional — the only narrowing benefit of a separate variant would be
 * `observerCleanup === null`, which doesn't earn its variant weight.
 *
 * Note on stale-closure checks: variants don't subsume the
 * `this.entries.get(docName) !== entry` guard in event handlers. That
 * check answers "is my closure stale?" — orthogonal to the entry's
 * lifecycle state. Both checks remain.
 */
interface PoolEntryBase {
  provider: HocuspocusProvider;
  docName: string;
  lastAccessedAt: number;
  syncState: SyncState;
  hasSynced: boolean;
  /**
   * True when `setupObservers` threw during initial sync. The provider
   * stays pool-resident so `EditorArea` keeps rendering the boundary
   * subtree (which shows `DocumentErrorBoundary`'s `BridgeSetupError`
   * UI), but the entry is inert — observers not wired, no further writes
   * will land. The user's "Try again" path calls `pool.recycle(docName)`
   * which destroys + recreates the entry to retry from a clean slate.
   */
  bridgeSetupFailed: boolean;
  /**
   * Server state vector captured after every Y.js `synced` event ("server
   * has accepted your update into its in-memory Y.Doc"). The delta
   * between this and the doc's current state is the unsynced buffer
   * captured before `clearData` on a `server-instance-mismatch` recycle.
   * `handleServerInstanceMismatch` falls back to this when
   * `lastDiskAckedSV` is null (no disk-ack received yet).
   */
  lastServerSyncedSV: Uint8Array | null;
  /**
   * Stricter watermark advanced by the server's CC1 `disk-ack` channel
   * after L1 markdown flush ("server has durably persisted your update
   * to disk"). `handleServerInstanceMismatch` prefers this over
   * `lastServerSyncedSV` when present — disk-ack'd updates will survive
   * the markdown rebuild on a server-restart, so the recycle buffer
   * doesn't need to replay them. Closes the T11 mid-drain duplication
   * bug class.
   */
  lastDiskAckedSV: Uint8Array | null;
}

/**
 * Live pool entry. Most consumers narrow to this kind via
 * `if (entry.kind === 'active') { … }` so `persistence` is non-null.
 */
interface ActivePoolEntry extends PoolEntryBase {
  kind: 'active';
  /**
   * Client-side Yjs persistence attached to this entry's Y.Doc. Hydrates
   * from IndexedDB on cold mount (instant Cmd-R), persists every
   * non-self update back, and is the handle the mismatch recycle flow
   * uses to `clearData()` before destroying the provider.
   */
  persistence: ClientPersistenceProvider;
  /** Wired by `setupObservers` after first sync; null until then. */
  observerCleanup: (() => void) | null;
  /** Set when a disconnect schedules a debounced recycle; null otherwise. */
  pendingRecycleTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Transient state inside `destroyEntry` between the kind flip and
 * removal from `entries`. All cleanup-fields are nulled by the time
 * `destroyEntry` finishes; consumers that observe a `TearingDown` entry
 * via a stale event-handler closure should bail.
 */
interface TearingDownPoolEntry extends PoolEntryBase {
  kind: 'tearing-down';
  persistence: null;
  observerCleanup: null;
  pendingRecycleTimer: null;
}

type PoolEntry = ActivePoolEntry | TearingDownPoolEntry;

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
const CLEAR_DATA_TIMEOUT_MS = 10_000;

class ClientPersistenceClearTimeoutError extends Error {
  constructor(
    readonly docName: string,
    readonly timeoutMs: number,
  ) {
    super(`client persistence clearData timed out for ${docName} after ${timeoutMs}ms`);
    this.name = 'ClientPersistenceClearTimeoutError';
  }
}

/**
 * localStorage key for the persisted last-observed git branch. Used by
 * `ProviderPool` to seed the cross-branch defense's in-memory cache on
 * a fresh tab so the very first auth-token claim is checked against
 * the server's current branch (closes the fresh-tab-with-stale-IDB
 * gap). Single key per origin is fine — a single Hocuspocus server's
 * branch is global to the project.
 */
const LAST_OBSERVED_BRANCH_KEY = 'ok-last-observed-branch';
/**
 * localStorage key for the server instance ID associated with this tab's
 * hydrated IndexedDB Y.Doc state. Persisted across page reloads so that after
 * a full server-process restart (e.g. `vite.config.ts` touch → Vite restarts
 * the dev server), the first provider open claims the stale ID even if the
 * boot `/api/server-info` fetch has already observed the fresh server ID. The
 * server sees the mismatch and rejects, triggering the clearData + recycle
 * flow BEFORE any Yjs sync can union-merge IDB items with the freshly-loaded
 * server state.
 */
const IDB_SYNCED_SERVER_INSTANCE_ID_KEY = 'ok-idb-synced-server-instance-id';

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
 * Per-doc cap on the in-memory unsynced-update buffer captured during a
 * `server-instance-mismatch` recycle. A long disconnect window with paste-
 * heavy / agent-driven typing can produce an arbitrarily large
 * `Y.encodeStateAsUpdate(doc, lastAckedSV)` result; without a cap, the pool
 * could hold tens of MB across `MAX_POOL` entries while waiting for the
 * post-recycle `synced` event. 1 MiB matches the pattern used by
 * comparable buffer-and-replay implementations (Liveblocks, AFFiNE) and
 * comfortably fits typical session-length deltas while bounding the
 * pathological case. On overflow the buffer entry is dropped and a
 * loud-fail `mark` event fires so the user-visible "unsynced edits lost"
 * outcome is observable.
 */
const MAX_BUFFER_BYTES = 1 * 1024 * 1024;

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
 * connect, or `undefined` when no claim is set. Returning `undefined`
 * (rather than `'{}'`) keeps the wire shape identical for anonymous
 * connections — older servers that don't parse the token see no change.
 *
 * Exported for the mechanism-only unit tests in `provider-pool.test.ts`.
 * Callers inside this module pass the current pool state; external
 * callers should not depend on this symbol.
 */
export function buildAuthToken(
  tabIdentity: { principalId: string; tabSessionId: string } | null,
  expectedServerInstanceId: string | null,
  expectedBranch: string | null = null,
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
  if (expectedBranch !== null && expectedBranch.length > 0) {
    claim.expectedBranch = expectedBranch;
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
  /**
   * Internal mutable map. External callers see the read-only `entries`
   * getter below — `readonly` on the field would prevent reassignment
   * but not Map-level mutation (`set`/`delete`/`clear`). The getter
   * widens the type to `ReadonlyMap` so accidental external writes fail
   * compile.
   */
  private readonly _entries = new Map<string, PoolEntry>();
  /**
   * Read-only view of the live pool. Returned snapshot is the same Map
   * instance — iteration and reads stay zero-copy. Compile-time
   * `ReadonlyMap` typing prevents external `.set` / `.delete` /
   * `.clear` calls; runtime bypass via type-cast is theoretically
   * possible but requires deliberate effort.
   */
  get entries(): ReadonlyMap<string, PoolEntry> {
    return this._entries;
  }
  private lruOrder: string[] = [];
  private activeDocName: string | null = null;
  private readonly maxSize: number;
  private readonly wsUrl: string;
  private readonly recycleDebounceMs: number;
  private readonly clearDataTimeoutMs: number;
  private onChange: PoolChangeCallback | null = null;
  private tabIdentity: { principalId: string; tabSessionId: string } | null = null;
  private serverRestartRecoveryState: ServerRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
  /**
   * Last server instance ID observed from `/api/server-info` or CC1
   * `server-info`. This is the live-server fallback claim for empty-IDB /
   * post-clear opens. It is deliberately NOT persisted to localStorage:
   * persisting the boot fetch's fresh ID before the first document provider
   * opens would overwrite the stale IDB-associated value and mask the restart.
   */
  private cachedServerInstanceId: string | null = null;

  /**
   * Server instance ID associated with the hydrated client-side IDB data.
   * Lazily loaded from storage and preferred over `cachedServerInstanceId` in
   * auth tokens. Updated only after a provider has synced cleanly to the
   * current server, and cleared before mismatch recycle wipes IDB.
   */
  private idbSyncedServerInstanceId: string | null = null;
  private idbSyncedServerInstanceIdInitialized = false;
  /**
   * Unsynced-edit buffer captured per-doc during a `server-instance-mismatch`
   * recycle. Populated right before `clearData()` wipes IDB; drained at the
   * fresh provider's FIRST post-recycle `synced` event when the replay
   * listener applies the bytes back to the Y.Doc. In-memory only — a tab
   * crash inside the recycle window loses the buffer (accepted trade-off
   * per SPEC §6).
   */
  private readonly bufferedUpdates = new Map<string, Uint8Array>();

  /**
   * Storage handle the pool reads/writes `lastObservedBranch` through.
   * Defaults to `globalThis.localStorage` in browser bundles; tests pass
   * a `Map`-backed stub. `null` disables persistence entirely (the
   * in-memory cache still works). Mirrors the DI pattern used by
   * `use-editor-mode.ts` so the Bun test runner — which has no DOM
   * globals — can exercise the persistence code path directly.
   */
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

  constructor(
    maxSize: number,
    wsUrl: string,
    options?: {
      recycleDebounceMs?: number;
      clearDataTimeoutMs?: number;
      storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
    },
  ) {
    this.maxSize = maxSize;
    // wsUrl is REQUIRED post-lifecycle-split (US-014 / FR-1.13) — resolved
    // asynchronously by `useCollabUrl()` from the `ok ui` /api/config endpoint
    // before the pool is instantiated. Callers must not pass an empty string.
    this.wsUrl = wsUrl;
    this.recycleDebounceMs = options?.recycleDebounceMs ?? RECYCLE_DEBOUNCE_MS;
    this.clearDataTimeoutMs = options?.clearDataTimeoutMs ?? CLEAR_DATA_TIMEOUT_MS;
    if (options?.storage !== undefined) {
      this.storage = options.storage;
    } else {
      // `globalThis.localStorage` is undefined under SSR + the Bun test
      // runner; fall back to null so the pool gracefully no-ops.
      this.storage =
        typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
    }
  }

  /**
   * Set the browser tab's identity (principalId + tabSessionId) after the
   * principal has been fetched from the server. New provider opens will
   * include this as a JSON `token` in the HocuspocusProvider so the server's
   * `onAuthenticate` hook can set `connection.context.principalId` for
   * correct writer attribution.
   */
  setTabIdentity(identity: { principalId: string; tabSessionId: string }): void {
    this.tabIdentity = identity;
  }

  /**
   * Update the live server instance ID observed from `/api/server-info` or CC1
   * `server-info`. Does NOT overwrite the storage-backed IDB-associated ID:
   * a fast boot fetch after server restart must not mask stale IDB contents
   * before the first document provider opens.
   */
  setExpectedServerInstanceId(id: string | null): void {
    this.cachedServerInstanceId = id;
  }

  getServerRestartRecoveryState(): ServerRestartRecoveryState {
    return this.serverRestartRecoveryState;
  }

  /**
   * Advance the entry's `lastDiskAckedSV` watermark via element-wise
   * max-merge with any prior value. Called by `SystemDocSubscriber`
   * for every CC1 `disk-ack` payload AND by every `/api/server-info`
   * batch refresh — the server has just durably written the doc up to
   * this state vector. `handleServerInstanceMismatch` prefers
   * `lastDiskAckedSV` over `lastServerSyncedSV` when computing the
   * recycle buffer baseline: disk-ack'd updates will survive the
   * markdown rebuild on server-restart, so they don't need to be
   * replayed (and replaying them is what causes the T11 mid-drain
   * duplication bug).
   *
   * **Why merge, not overwrite.** Disk-ack updates flow over two
   * independent channels (CC1 stateless WS + `/api/server-info` HTTP)
   * that aren't ordered relative to each other. The server's per-doc
   * SV is monotonic at emit time, but a slow HTTP response can land
   * AFTER a newer WS broadcast — a pure overwrite would regress
   * `lastDiskAckedSV` from the newer to the older value, reopening
   * the disk-ack-staleness duplication path on the next
   * mismatch-recycle. Element-wise max-merge is conservative across
   * out-of-order receives: the merged SV is at least as advanced as
   * either input in every clientID dimension.
   *
   * No-op when no entry exists for `docName` or the entry is
   * tearing-down — both signal "this doc isn't an active part of the
   * pool right now," and a stale watermark on a future entry would
   * be incorrect anyway (each fresh entry starts at null).
   */
  observeDiskAck(docName: string, sv: Uint8Array): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.kind !== 'active') return;
    entry.lastDiskAckedSV = mergeStateVectors(entry.lastDiskAckedSV, sv);
  }

  /**
   * Refresh the `lastDiskAckedSV` watermark for every doc named in the
   * batch via the same element-wise max-merge as `observeDiskAck`.
   * Called by the boot fetch + every `__system__` reconnect via
   * `GET /api/server-info`'s `currentDiskAckSVs` field — closes the
   * missed-frame gap that CC1 stateless broadcasts leave open (no
   * replay; a brief `__system__` WS drop during a write burst would
   * otherwise leave `lastDiskAckedSV` permanently stale and reopen
   * the disk-ack-staleness duplication path on server-restart).
   *
   * Per-doc semantics match `observeDiskAck`: skip when no entry
   * exists for the doc or when the entry is tearing-down. Docs in the
   * batch that the client doesn't have open are silently ignored.
   * The merge protects against the WS+HTTP cross-over window where
   * a slow batch response could otherwise overwrite a newer
   * live-broadcast SV.
   */
  observeDiskAckBatch(svsByDocName: Record<string, Uint8Array>): void {
    for (const [docName, sv] of Object.entries(svsByDocName)) {
      this.observeDiskAck(docName, sv);
    }
  }

  /**
   * Last-observed git branch reported by the server (via `/api/server-info`
   * boot fetch + CC1 `server-info` broadcasts).
   *
   * Persisted to `localStorage` so cold-boot tabs claim the correct branch
   * in their first auth token. Without persistence the in-memory cache is
   * empty on a fresh tab → `expectedBranch` claim is omitted → server
   * accepts unconditionally → the IndexeddbPersistence then hydrates
   * stale-branch Y.Doc state, which Yjs sync union-merges with the
   * server's current-branch state (ghost items, the exact bug class this
   * defense exists to prevent). The persisted value lets the very first
   * post-restore connect's auth-token claim be checked against the
   * server's current branch, so a fresh tab against a switched branch
   * gets rejected → recycled → IDB cleared before sync runs.
   *
   * Lazily seeded from localStorage on first read (see
   * `getOrInitObservedBranch` below) — `localStorage` access at module
   * load would break SSR / Node test environments where `localStorage`
   * is undefined.
   *
   * **Co-eviction assumption.** This defense relies on `localStorage` and
   * IDB staying in sync as a unit. Modern browsers evict both together
   * (same "best-effort" eviction bucket), but a manual mismatch — e.g.
   * DevTools → Application → "Clear storage" with IDB unchecked,
   * profile import/export, custom storage tooling — re-opens the
   * cross-branch ghost-item scenario: localStorage cleared → empty
   * claim → server accepts → stale IDB hydrates → sync union-merge.
   * Recovery requires `provider.clearData()` or a full storage clear.
   * A future structural fix (branch-prefixed IDB names) would remove
   * the assumption; tracked in the spec's deferred-scope list.
   */
  private lastObservedBranch: string | null = null;
  private lastObservedBranchInitialized = false;

  /**
   * Lazy-init the in-memory cache from `this.storage`. Idempotent.
   * Tolerant of missing storage (Node tests, SSR) — falls back to the
   * initial null value.
   */
  private getOrInitObservedBranch(): string | null {
    if (this.lastObservedBranchInitialized) return this.lastObservedBranch;
    this.lastObservedBranchInitialized = true;
    try {
      const stored = this.storage?.getItem(LAST_OBSERVED_BRANCH_KEY) ?? null;
      if (stored !== null && stored.length > 0) {
        this.lastObservedBranch = stored;
      }
    } catch {
      // Storage access can throw in private-mode browsers / sandboxed
      // iframes — fall back to in-memory only.
    }
    return this.lastObservedBranch;
  }

  /**
   * Persist the observed branch alongside the in-memory cache. Tolerant
   * of storage failures (private browsing, quota exceeded) — the
   * in-memory cache always succeeds.
   */
  private persistObservedBranch(branch: string | null): void {
    this.lastObservedBranch = branch;
    this.lastObservedBranchInitialized = true;
    try {
      if (branch === null || branch.length === 0) {
        this.storage?.removeItem(LAST_OBSERVED_BRANCH_KEY);
      } else {
        this.storage?.setItem(LAST_OBSERVED_BRANCH_KEY, branch);
      }
    } catch {
      // Storage write failures are non-fatal — see read-side comment.
    }
  }

  /** Lazy-init the IDB-associated server instance ID from `this.storage`. */
  private getOrInitIdbSyncedServerInstanceId(): string | null {
    if (this.idbSyncedServerInstanceIdInitialized) return this.idbSyncedServerInstanceId;
    this.idbSyncedServerInstanceIdInitialized = true;
    try {
      const stored = this.storage?.getItem(IDB_SYNCED_SERVER_INSTANCE_ID_KEY) ?? null;
      if (stored !== null && stored.length > 0) {
        this.idbSyncedServerInstanceId = stored;
      }
    } catch {
      // Storage access can throw in private-mode browsers / sandboxed iframes.
    }
    return this.idbSyncedServerInstanceId;
  }

  /**
   * Persist the server instance ID associated with the current IDB contents.
   * This must not be called from `setExpectedServerInstanceId`; only a clean
   * provider sync proves the IDB state belongs to the current server.
   */
  private persistIdbSyncedServerInstanceId(id: string | null): void {
    this.idbSyncedServerInstanceId = id;
    this.idbSyncedServerInstanceIdInitialized = true;
    try {
      if (id === null || id.length === 0) {
        this.storage?.removeItem(IDB_SYNCED_SERVER_INSTANCE_ID_KEY);
      } else {
        this.storage?.setItem(IDB_SYNCED_SERVER_INSTANCE_ID_KEY, id);
      }
    } catch {
      // Storage write failures are non-fatal.
    }
  }

  private getServerInstanceIdForAuth(): string | null {
    return this.getOrInitIdbSyncedServerInstanceId() ?? this.cachedServerInstanceId;
  }

  private withClearDataTimeout(docName: string, promise: Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ClientPersistenceClearTimeoutError(docName, this.clearDataTimeoutMs));
      }, this.clearDataTimeoutMs);
      promise.then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (err: unknown) => {
          clearTimeout(timeout);
          reject(err);
        },
      );
    });
  }

  private beginServerRestartRecovery(docNames: readonly string[], startedAt: number): void {
    this.serverRestartRecoveryState = {
      kind: 'recovering',
      phase: 'clearing-local-cache',
      docNames,
      failedDocNames: [],
      startedAt,
    };
    for (const docName of docNames) {
      invalidateSyncPromise(docName);
    }
    this.notify();
  }

  private enterServerRestartReconnect(
    docNames: readonly string[],
    failedDocNames: readonly string[],
    startedAt: number,
    failureReason: 'clear-data-failed' | 'clear-data-timeout',
  ): void {
    if (docNames.length === 0) {
      this.serverRestartRecoveryState =
        failedDocNames.length === 0
          ? IDLE_SERVER_RESTART_RECOVERY
          : {
              kind: 'failed',
              reason: failureReason,
              docNames: failedDocNames,
              failedDocNames,
              startedAt,
            };
      this.notify();
      return;
    }

    this.serverRestartRecoveryState = {
      kind: 'recovering',
      phase: 'reconnecting',
      docNames,
      failedDocNames,
      startedAt,
    };
    this.notify();
  }

  private markServerRestartRecoverySynced(docName: string): void {
    const state = this.serverRestartRecoveryState;
    if (state.kind !== 'recovering' || state.phase !== 'reconnecting') return;
    if (!state.docNames.includes(docName)) return;

    const remaining = state.docNames.filter((candidate) => candidate !== docName);
    if (remaining.length > 0) {
      this.serverRestartRecoveryState = { ...state, docNames: remaining };
      return;
    }

    if (state.failedDocNames.length > 0) {
      this.serverRestartRecoveryState = {
        kind: 'failed',
        reason: 'clear-data-failed',
        docNames: state.failedDocNames,
        failedDocNames: state.failedDocNames,
        startedAt: state.startedAt,
      };
      return;
    }

    this.serverRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
  }

  /**
   * Update the observed branch without triggering invalidation. Called by
   * `handleBranchSwitched` after the live broadcast has already fired the
   * recycle, so the comparison path on the next `server-info` frame
   * doesn't double-invalidate.
   */
  setObservedBranch(branch: string): void {
    this.persistObservedBranch(branch);
  }

  /**
   * Compare-and-set the observed branch. Returns `true` when the supplied
   * branch differs from the previously-observed value (signalling the
   * caller should run `handleBranchSwitched`); returns `false` on first
   * observation or matching branch. Always advances `lastObservedBranch`
   * to the supplied value.
   */
  compareAndUpdateObservedBranch(branch: string): boolean {
    const prior = this.getOrInitObservedBranch();
    this.persistObservedBranch(branch);
    return prior !== null && prior !== branch;
  }

  /**
   * Handler invoked when the server rejects a connect with
   * `reason: 'branch-mismatch'`. Set by DocumentContext (which owns
   * `handleBranchSwitched` invocation) after pool construction so the
   * pool itself stays free of React/UI imports.
   *
   * Callback MUST return a Promise — the in-flight gate awaits the
   * returned promise to collapse concurrent dispatches across event-
   * loop turns. A `void`-fronted callback (e.g., `() => { void
   * fetch(...) }`) returns `undefined` synchronously; the gate clears
   * on the next microtask while the actual work is still in flight,
   * defeating the gate.
   *
   * In-flight gate: when a branch switch happens server-side that the
   * client missed (offline window, stale IDB), every open provider's
   * auth fails with `branch-mismatch` in quick succession — N parallel
   * `/api/server-info` fetches + N concurrent `handleBranchSwitched`
   * calls would otherwise fan out. The gate collapses concurrent
   * dispatches into a single in-flight promise: the first call runs
   * the user-supplied callback; subsequent calls during that window
   * are dropped (the recycle is already in progress for the whole
   * pool, so re-entry would just churn the active doc's fresh
   * provider).
   */
  // The wrapped dispatcher returns void synchronously (it just kicks off
  // the in-flight promise tracked in `branchMismatchInFlight`); the input
  // callback supplied via `setOnBranchMismatch` MUST return a Promise so
  // the gate can await it across event-loop turns.
  private onBranchMismatch: (() => void) | null = null;
  private branchMismatchInFlight: Promise<void> | null = null;
  setOnBranchMismatch(cb: (() => Promise<void>) | null): void {
    if (cb === null) {
      this.onBranchMismatch = null;
      return;
    }
    this.onBranchMismatch = () => {
      if (this.branchMismatchInFlight !== null) return;
      // Wrap `cb()` in `Promise.resolve().then(cb)` rather than
      // `Promise.resolve(cb())` so a synchronous throw from `cb`
      // settles the wrapper as a rejection instead of escaping the
      // gate. Without this, a sync throw bypasses the
      // `branchMismatchInFlight = inflight` assignment entirely; the
      // next dispatch sees a null gate and re-fires the (still
      // throwing) callback.
      const inflight = Promise.resolve()
        .then(cb)
        .finally(() => {
          if (this.branchMismatchInFlight === inflight) {
            this.branchMismatchInFlight = null;
          }
        });
      this.branchMismatchInFlight = inflight;
    };
  }

  /** Register a callback that fires whenever pool state changes. */
  setOnChange(cb: PoolChangeCallback | null): void {
    this.onChange = cb;
  }

  private notify(): void {
    this.onChange?.();
  }

  /**
   * Subscribers fired when the pool evicts an entry (whether via LRU,
   * close, recycle, or dispose). The cache module subscribes to clear
   * its `Editor` / `EditorView` cache entries that hold refs to
   * `provider.document` — without this, the next mountTiptapEditor /
   * mountCmEditor call for the same docName would return a stale entry
   * bound to an orphaned Y.Doc.
   *
   * Replaces the explicit `evictTiptapEditor(docName); evictCmEditor(docName)`
   * calls that lived inline in `destroyEntry` — keeps the pool free of
   * cross-module cache knowledge.
   *
   * Subscribers fire AFTER the kind flip to 'tearing-down' but BEFORE
   * `provider.destroy()`, preserving the ordering invariant: cache
   * eviction must run before provider teardown so cached editor
   * destroy() calls operate on a still-live Y.Doc.
   */
  private evictListeners = new Set<(docName: string) => void>();

  /**
   * Subscribe to entry-eviction events. Returns an unsubscribe function.
   * Multiple subscribers all fire in registration order; throws inside
   * a subscriber are caught + logged so one bad subscriber doesn't
   * prevent the others from running.
   */
  onEvict(cb: (docName: string) => void): () => void {
    this.evictListeners.add(cb);
    return () => {
      this.evictListeners.delete(cb);
    };
  }

  private fireEvict(docName: string): void {
    for (const listener of this.evictListeners) {
      try {
        listener(docName);
      } catch (err) {
        console.warn(`[ProviderPool] evict listener threw for ${docName}:`, err);
      }
    }
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

    const expectedServerInstanceId = this.getServerInstanceIdForAuth();
    const token = buildAuthToken(
      this.tabIdentity,
      expectedServerInstanceId,
      this.getOrInitObservedBranch(),
    );
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
    // from `ok-ydoc:${branch}:${docName}` on cold mount and persists every
    // non-self update back. On server-instance-mismatch, buffer-and-replay
    // captures unsynced edits before clearData + recycle. The branch
    // prefix isolates per-branch state by IDB-name boundary — different
    // branches → different IDBs by construction. `UNKNOWN_BRANCH_SENTINEL`
    // is used when no branch has been observed yet (fresh tab); the
    // auth-token mismatch on first connect drives the recycle to the
    // correct branch-prefixed name.
    const branch = this.getOrInitObservedBranch() ?? UNKNOWN_BRANCH_SENTINEL;
    const persistence = createClientPersistence({
      branch,
      docName,
      doc: provider.document,
    });

    const entry: ActivePoolEntry = {
      kind: 'active',
      provider,
      persistence,
      lastServerSyncedSV: null,
      lastDiskAckedSV: null,
      observerCleanup: null,
      syncState: 'connecting',
      docName,
      lastAccessedAt: Date.now(),
      hasSynced: false,
      pendingRecycleTimer: null,
      bridgeSetupFailed: false,
    };

    // Track sync state
    const onStatus = ({ status }: { status: string }) => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      if (status === 'disconnected') {
        entry.syncState = 'disconnected';
        this.notify();
      }
    };
    const onSynced = () => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      entry.syncState = 'synced';
      entry.hasSynced = true;
      // Refresh the "last server acked" state vector on every sync event —
      // the delta between this and the doc's current state is what the
      // `server-instance-mismatch` recycle buffers before calling clearData.
      entry.lastServerSyncedSV = captureStateVector(provider.document);
      if (this.cachedServerInstanceId !== null) {
        // Only persist after observing a concrete server instance ID. If the
        // boot/server-info path is unavailable, keep the legacy no-claim path
        // rather than pinning an unknown IDB association.
        this.persistIdbSyncedServerInstanceId(this.cachedServerInstanceId);
      }
      // Cancel pending recycle — provider reconnected successfully
      if (entry.pendingRecycleTimer) {
        clearTimeout(entry.pendingRecycleTimer);
        entry.pendingRecycleTimer = null;
      }
      this.markServerRestartRecoverySynced(docName);
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
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
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
          // Re-narrow inside the timer closure — `entry` was Active when the
          // timer was scheduled, but TS doesn't carry the narrowing across
          // the async boundary, and the entry may have been torn down before
          // the timer fired.
          if (entry.kind !== 'active') return;
          entry.pendingRecycleTimer = null;
          if (this.entries.get(docName) !== entry) return;
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
    // authenticationFailed in quick succession. The first call clears the
    // IDB-associated claim; sibling failures with the same stale claim then
    // short-circuit while preserving any already-observed fresh server ID.
    const onAuthenticationFailed = ({ reason }: { reason: string }): void => {
      // Trust-boundary narrow: `reason` is a wire-foreign string from
      // Hocuspocus. Inlined (not imported from the server's runtime
      // helper) because a runtime import pulls the entire server bundle
      // into the browser via tree-shake leaks (rolldown traces into
      // `@parcel/watcher`'s `.node` binary). The bidirectional drift
      // guard catches additions on either side: `satisfies` ensures
      // every local literal is in the server-side type; the
      // `_AssertCovers` extends-check fails when the server-side type
      // widens past the local set (the conditional resolves to `never`
      // and the `true` initializer fails to compile).
      const KNOWN = [
        'server-instance-mismatch',
        'branch-mismatch',
      ] as const satisfies readonly HocuspocusAuthRejectionReason[];
      type _AssertCovers = HocuspocusAuthRejectionReason extends (typeof KNOWN)[number]
        ? true
        : never;
      const _assertCovers: _AssertCovers = true;
      void _assertCovers;
      if (!(KNOWN as readonly string[]).includes(reason)) {
        console.warn(JSON.stringify({ event: 'ok-auth-failed-unknown-reason', reason }));
        return;
      }
      const typed = reason as HocuspocusAuthRejectionReason;
      if (typed === 'server-instance-mismatch') {
        // `expectedServerInstanceId` is the claim this provider actually sent.
        // If it came from stale IDB storage, clear only that storage-backed
        // claim and preserve a newer live-server ID learned from a fast boot
        // fetch so the post-clear recycle can reconnect without another
        // mismatch. If the live cache itself was the stale claim, clear it too.
        if (
          expectedServerInstanceId === null ||
          (this.getOrInitIdbSyncedServerInstanceId() === null &&
            this.cachedServerInstanceId !== expectedServerInstanceId)
        ) {
          return;
        }
        this.persistIdbSyncedServerInstanceId(null);
        if (this.cachedServerInstanceId === expectedServerInstanceId) {
          this.cachedServerInstanceId = null;
        }
        this.handleServerInstanceMismatch();
        return;
      }
      // Branch-mismatch is the late-join backstop for the cross-branch
      // invalidation flow: the client's auth-token claim
      // (`expectedBranch = lastObservedBranch`) didn't match the server's
      // current branch, which means a `branch-switched` broadcast happened
      // while this client was offline (or the tab was restored from
      // stale-branch IDB). Routing through the same recycle pathway as
      // CC1 `branch-switched` ensures `clearData` runs BEFORE Yjs sync
      // can union-merge stale-branch state. The handler is set by
      // DocumentContext after construction so the pool stays free of
      // React/UI dependencies; missing handler = legacy behavior (no
      // invalidation, accept current state).
      if (typed === 'branch-mismatch') {
        this.onBranchMismatch?.();
        return;
      }
      // Compile-time exhaustiveness — narrowed to `never` here. A new
      // member of HOCUSPOCUS_AUTH_REJECTION_REASONS without a
      // corresponding switch arm fails the build.
      const _never: never = typed;
      void _never;
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
        if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
        const current = this.bufferedUpdates.get(docName);
        if (current === undefined) return;
        // Drop the buffer reference up-front: a malformed update that
        // throws would throw again on retry, and the server's sync has
        // already delivered the canonical state. Catch the throw so it
        // doesn't escape into Hocuspocus's event emitter as an unhandled
        // rejection and so the next sync can proceed.
        this.bufferedUpdates.delete(docName);
        try {
          Y.applyUpdate(provider.document, current, TAB_REPLAY_ORIGIN);
        } catch (err: unknown) {
          console.warn(
            JSON.stringify({
              event: 'ok-buffer-replay-failed',
              docName,
              bytes: current.byteLength,
              reason: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      };
      provider.on('synced', replayOnce);
    }

    this._entries.set(docName, entry);
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
    const startedAt = Date.now();
    // Recovery UI (spinner + failure panel) only tracks the foreground doc.
    // Background pool entries still recycle and clear IDB on mismatch; if
    // clearData fails there, the provider stays inert until a later reconnect
    // retries — no separate banner per background tab by design.
    const activeRecoveryDocNames =
      this.activeDocName !== null &&
      snapshot.some(
        ([docName, poolEntry]) => docName === this.activeDocName && poolEntry.kind === 'active',
      )
        ? [this.activeDocName]
        : [];

    this.beginServerRestartRecovery(activeRecoveryDocNames, startedAt);
    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind === 'active' && !activeRecoveryDocNames.includes(docName)) {
        invalidateSyncPromise(docName);
      }
    }

    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind !== 'active') continue;
      // Baseline-selection: prefer `lastDiskAckedSV` (server has durably
      // persisted) when present — the markdown rebuild on restart will
      // already include those updates, so the recycle buffer doesn't need
      // to replay them. Falls back to `lastServerSyncedSV` for the
      // cold-connect window where no disk-ack has arrived yet
      // (preserving today's "in-memory ack is the best we have" behavior).
      // No baseline at all → drop unsynced state. Any Y.Doc state at this
      // point came from IDB hydration of a prior session whose server is,
      // by definition, a different instance — preserving it would
      // duplicate content. The 50–500 ms cold-connect-then-immediate-
      // mismatch window can lose keystrokes; accepted trade-off (SPEC §6).
      const baseline = poolEntry.lastDiskAckedSV ?? poolEntry.lastServerSyncedSV;
      if (baseline === null) continue;
      const unsynced = computeUnsyncedUpdate(poolEntry.provider.document, baseline);
      if (unsynced.byteLength > MAX_BUFFER_BYTES) {
        // Drop the buffer for this doc; the post-recycle replay would
        // otherwise pin tens of MB on the pool while waiting for sync.
        // Loud-fail so the resulting "unsynced edits lost" outcome is
        // visible — silent-drop would mask the same data-loss class
        // buffer-and-replay exists to prevent.
        mark('ok/pool/buffer-overflow', { docName, bytes: unsynced.byteLength });
        continue;
      }
      if (unsynced.byteLength > 0) {
        this.bufferedUpdates.set(docName, unsynced);
      }
    }

    // Gate per-doc on clearData success. A `clearData` failure (blocked
    // by another tab/DevTools, quota exhaustion, transaction-aborted)
    // means the IDB still holds the pre-restart Y.Doc state — recycling
    // into the un-cleared DB would hydrate the fresh provider's Y.Doc
    // from stale data BEFORE Yjs sync runs, re-opening the content-
    // duplication bug class clearData exists to prevent. Use
    // `Promise.allSettled` so per-element rejections surface (the prior
    // `Promise.all + per-element catch` swallowed every failure, then
    // recycled unconditionally).
    const clears: { docName: string; promise: Promise<void> }[] = [];
    for (const [docName, poolEntry] of snapshot) {
      // TearingDown entries have null persistence by construction; the
      // discriminator narrowing ensures we never call .clearData() on a
      // null. BridgeFailed entries (Active with bridgeSetupFailed=true)
      // still have persistence attached and SHOULD be cleared.
      if (poolEntry.kind !== 'active') continue;
      clears.push({
        docName,
        promise: this.withClearDataTimeout(docName, poolEntry.persistence.clearData()),
      });
    }

    void Promise.allSettled(clears.map((c) => c.promise)).then((results) => {
      const failed: string[] = [];
      const cleared: string[] = [];
      let sawClearTimeout = false;
      results.forEach((result, i) => {
        const docName = clears[i]?.docName ?? '<unknown>';
        if (result.status === 'rejected') {
          failed.push(docName);
          if (result.reason instanceof ClientPersistenceClearTimeoutError) {
            sawClearTimeout = true;
          }
          console.warn(
            JSON.stringify({
              event: 'ok-client-persistence-clear-failed',
              docName,
              reason:
                result.reason instanceof Error ? result.reason.message : String(result.reason),
            }),
          );
        } else {
          cleared.push(docName);
        }
      });
      const failureReason: 'clear-data-failed' | 'clear-data-timeout' = sawClearTimeout
        ? 'clear-data-timeout'
        : 'clear-data-failed';
      const reconnectDocNames = cleared.filter((docName) => docName === this.activeDocName);
      if (failed.length > 0) {
        // Per-doc recycle. An all-or-none gate would re-open the
        // duplication class for the cleared docs: their providers would
        // reconnect after the stale claim has been cleared, then Yjs sync
        // would run against the still-pre-restart Y.Doc and additively
        // merge with post-restart server state — exactly the bug class clearData was
        // supposed to prevent. Recycle the cleared entries (their IDB
        // is empty, their fresh providers will sync cleanly) and leave
        // the failed entries inert. The failed entries' un-cleared
        // IDBs will surface the same mismatch on the next provider
        // reconnect cycle; they need user-visible recovery (close the
        // blocking tab/DevTools, then reload).
        console.warn(
          JSON.stringify({
            event: 'ok-mismatch-recycle-partial-clears-failed',
            failedDocs: failed,
            clearedDocs: cleared,
          }),
        );
        this.enterServerRestartReconnect(reconnectDocNames, failed, startedAt, failureReason);
        for (const docName of cleared) {
          this.recycleDisconnectedEntry(docName);
        }
        return;
      }
      this.enterServerRestartReconnect(reconnectDocNames, [], startedAt, failureReason);
      this.recycleAllEntries();
    });
  }

  /**
   * Recycle every pool entry by calling `recycleDisconnectedEntry` for each.
   * Called by the `authenticationFailed` handler on `server-instance-mismatch`
   * (every provider in the pool is bound to a Y.Doc that merged items under
   * the old server's clientID, so all of them must restart from a fresh
   * Y.Doc before Yjs sync runs) and by `branch-invalidation.ts` on CC1
   * `branch-switched` (every provider's Y.Doc reflects a stale branch's
   * content).
   *
   * Snapshot the keys first so mutations in `recycleDisconnectedEntry` (which
   * deletes + re-opens the active doc) don't disturb the iteration.
   */
  recycleAllEntries(): void {
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
    this._entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);
    // Explicit close discards any pending replay buffer — the user closed
    // the tab; resurrecting unsynced edits later would surprise them.
    this.bufferedUpdates.delete(docName);

    if (this.activeDocName === docName) {
      this.activeDocName = null;
    }
    this.notify();
  }

  /**
   * Drop every entry's pending replay buffer. Called by the
   * `branch-switched` invalidation flow (`branch-invalidation.ts`) so that
   * cross-branch policy ("edits authored against branch A are NOT valid
   * against branch B") applies to the in-memory buffer slot — not just the
   * IDB layer. Without this, a non-active doc's buffer populated by a
   * prior `server-instance-mismatch` would replay onto the post-switch
   * branch B Y.Doc the next time the user opened that doc.
   */
  clearBufferedUpdates(): void {
    this.bufferedUpdates.clear();
  }

  /**
   * Test-only buffer manipulation. The cross-branch buffer-leak fix is
   * load-bearing but invisible from public APIs (the buffer is a private
   * Map populated only by `handleServerInstanceMismatch` mid-recycle).
   * Tests need a way to seed the buffer + observe its size to assert
   * branch-switched / close drain semantics. Naming-prefix `__test`
   * keeps these out of production call sites by convention.
   */
  __test_seedBufferedUpdate(docName: string, update: Uint8Array): void {
    this.bufferedUpdates.set(docName, update);
  }
  __test_bufferedUpdatesSize(): number {
    return this.bufferedUpdates.size;
  }
  __test_hasBufferedUpdate(docName: string): boolean {
    return this.bufferedUpdates.has(docName);
  }
  __test_getBufferedUpdate(docName: string): Uint8Array | undefined {
    return this.bufferedUpdates.get(docName);
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

  /** Dispose of all entries and pool-owned mutable state. */
  dispose(): void {
    for (const entry of this._entries.values()) {
      this.destroyEntry(entry);
    }
    this._entries.clear();
    this.lruOrder = [];
    this.activeDocName = null;
    this.onChange = null;
    // Reset every mutable field so a disposed pool can't bleed stale state
    // into a future test or reused harness instance. Production HMR drops
    // the whole pool reference, but tests and the `[collabUrl]` cleanup in
    // DocumentContext call dispose() and may keep the reference around.
    this.bufferedUpdates.clear();
    this.onBranchMismatch = null;
    this.branchMismatchInFlight = null;
    this.evictListeners.clear();
    this.serverRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
    this.cachedServerInstanceId = null;
    this.idbSyncedServerInstanceId = null;
    this.idbSyncedServerInstanceIdInitialized = false;
    this.tabIdentity = null;
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
    // Idempotent: a second destroyEntry call on a torn-down entry no-ops.
    if (entry.kind === 'tearing-down') return;

    // Capture variant-specific Active fields BEFORE the kind flip so we
    // can run the cleanup work after we've put the entry into a state
    // where event-handler closures will bail on `kind !== 'active'`.
    const observerCleanup = entry.observerCleanup;
    const persistence = entry.persistence;
    const pendingRecycleTimer = entry.pendingRecycleTimer;
    const docName = entry.docName;

    // Flip kind to 'tearing-down' atomically + null variant-specific
    // fields. The cast through `unknown` is unavoidable because TS's
    // discriminated unions don't model in-place kind mutations — both
    // sides of the union are structurally compatible at the JS level.
    const torn = entry as unknown as TearingDownPoolEntry;
    torn.kind = 'tearing-down';
    torn.persistence = null;
    torn.observerCleanup = null;
    torn.pendingRecycleTimer = null;

    if (pendingRecycleTimer) clearTimeout(pendingRecycleTimer);

    // Detach the syncPromise cache entry BEFORE destroy() fires the provider's
    // `close` event — otherwise the sync-promise listener would reject the
    // already-consumed promise with PreSyncDisconnectError on pool-triggered
    // teardown. Natural (network-triggered) close events still reject as
    // expected because this path only runs inside pool destroy/recycle/evict.
    invalidateSyncPromise(docName);
    // Fire the eviction event so the editor cache (and any future
    // subscriber) can clean up entries bound to `provider.document` via
    // Collaboration.configure / y-codemirror.next BEFORE the provider is
    // destroyed. Without this ordering, cached `Editor`/`EditorView`
    // instances retain refs to an orphaned Y.Doc. The pool stays free
    // of editor-cache knowledge; the cache subscribes via
    // `pool.onEvict(...)` and runs whatever teardown it owns.
    this.fireEvict(docName);
    // Observer cleanup (observers reference Y.Doc state). Captured pre-flip
    // because the post-flip variant has `observerCleanup: null`.
    observerCleanup?.();

    // Tear down client-side persistence BEFORE the provider. The synchronous
    // part of y-indexeddb's `destroy()` runs `doc.off('update', _storeUpdate)`
    // and `doc.off('destroy', this.destroy)` immediately, so by the time
    // `provider.destroy()` runs (which calls `document.destroy()` internally)
    // the persistence's listeners are gone — no recursive re-entry. The
    // returned promise only covers the IDB connection close, which is safe
    // to run asynchronously against a separate IDB handle. We intentionally
    // do not `await` here — keeping `destroyEntry` synchronous preserves all
    // call-site shapes.
    const pendingPersistenceDestroy = persistence.destroy();
    pendingPersistenceDestroy.catch((err) => {
      console.warn(`[ProviderPool] persistence destroy failed for ${docName}:`, err);
    });

    try {
      torn.provider.destroy(); // destroy() disconnects + removes all listeners + awareness cleanup
    } catch (err) {
      console.warn(`[ProviderPool] Provider destroy failed for ${docName}:`, err);
    }
  }

  private recycleDisconnectedEntry(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.kind !== 'active') return;

    const wasActive = this.activeDocName === docName;
    mark('ok/pool/recycle-disconnected', { docName, wasActive });

    this.destroyEntry(entry);
    this._entries.delete(docName);
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
