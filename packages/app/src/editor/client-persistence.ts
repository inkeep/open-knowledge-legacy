/**
 * Client-side Yjs persistence primitive (Shape 2+).
 *
 * Wraps upstream `y-indexeddb` in a narrow, typed surface the
 * ProviderPool uses to:
 *   1. Hydrate a Y.Doc from browser IndexedDB on cold mount (instant
 *      Cmd-R).
 *   2. Wipe the IndexedDB copy on `server-instance-mismatch` so a
 *      restart doesn't mix pre- and post-restart CRDT items.
 *   3. Compute the client's unsynced delta (relative to the last
 *      server-acked state vector) so the ProviderPool can replay it
 *      onto the fresh provider after mismatch-recycle.
 *
 * IDB database names follow the canonical Yjs-ecosystem pattern of
 * "DB-per-tenant, named synchronously" (AFFiNE, tldraw, Liveblocks).
 * Format: `ok-ydoc:${branch}:${docName}` — branch is the tenant key,
 * docName is the resource within. Different branches → different IDBs
 * by construction, eliminating cross-branch ghost-item bleed without
 * relying on a synchronous `localStorage` + IDB co-eviction assumption.
 *
 * `UNKNOWN_BRANCH_SENTINEL` is the placeholder used when the pool has
 * not yet observed a branch (cold-boot tab with no persisted
 * `lastObservedBranch`). The IDB at the sentinel name will be empty
 * (never written to in production); auth-token mismatch on first
 * connect drives the recycle to the correct branch-prefixed name.
 *
 * Origin filtering (no write-back loop) is inherent to upstream
 * `y-indexeddb`: its `_storeUpdate` listener short-circuits when the
 * update origin equals the persistence instance itself, which is the
 * origin it passes to `Y.transact` during hydration.
 *
 * See specs/2026-04-24-client-persistence-replaces-sidecar/SPEC.md Phase 2.
 */

import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/**
 * Branch identifier used when no `lastObservedBranch` is available
 * (fresh tab, cleared localStorage) and the boot fetch hasn't yet
 * completed. Mirrors the `__system__` pseudo-doc's leading-and-trailing
 * underscore convention.
 *
 * `_unknown_` is NOT structurally rejected by git — `git branch _unknown_`
 * succeeds. The sentinel is deliberately shaped to be unusual but
 * collision is theoretically possible. Operational impact of a real
 * `_unknown_` branch is zero: the auth-token claim on first connect
 * carries `expectedBranch: '_unknown_'`; if the server's actual branch
 * matches, the IDB is correctly scoped; if not, the
 * `branch-mismatch` recycle path (server's `onAuthenticate` reject →
 * client's `handleServerInstanceMismatch` recycle) reconciles via
 * IDB clear + fresh provider, which is the same recovery used for any
 * other stale-claim scenario.
 *
 * Storage hygiene caveat: `ok-ydoc:_unknown_:<docName>` IDBs may
 * accumulate when the cold-tab branch-mismatch recovery fails before
 * the IDB is cleared. Two failure paths leave orphans:
 *
 *   1. `/api/server-info` unreachable (network blip, server still
 *      booting) — `DocumentContext.tsx`'s mismatch handler logs
 *      `branch-mismatch-recovery-failed` and skips the recycle.
 *   2. Tab close mid-recycle — destroy chain doesn't await the
 *      `clearData` promise.
 *
 * Each failed-recovery cycle leaves at most one `_unknown_`-prefixed
 * IDB per docName (same docName overwrites). Bounded by docName
 * cardinality; harmless under browser quota; not a correctness bug
 * (all of these IDBs would correctly trigger `branch-mismatch` on
 * the next session and be cleared via the recycle path). Documented
 * here following the `localStorage`+IDB co-eviction precedent at
 * `provider-pool.ts:lastObservedBranch` — a symmetric storage-hygiene
 * note rather than a code-level cleanup. Opportunistic enumeration
 * via `indexedDB.databases()` was considered but rejected: the
 * cleanup path could race a mid-recovery reuse of the sentinel-
 * prefixed IDB and delete an in-use database.
 */
export const UNKNOWN_BRANCH_SENTINEL = '_unknown_';

const UPDATES_STORE_NAME = 'updates';

export interface ClientPersistenceProvider {
  readonly whenSynced: Promise<this>;
  readonly synced: boolean;
  destroy(): Promise<void>;
  clearData(): Promise<void>;
}

/**
 * Construction shape for `createClientPersistence`. Object-literal form
 * (rather than positional `(branch, docName, doc)`) protects against
 * the confusable-string-arg-swap class of bugs — `branch` and `docName`
 * are both `string` and a swap would compile cleanly while silently
 * producing the wrong IDB name (`ok-ydoc:${docName}:${branch}`), which
 * would make the cross-branch defense ineffective.
 */
interface CreateClientPersistenceArgs {
  readonly branch: string;
  readonly docName: string;
  readonly doc: Y.Doc;
}

async function loadPersistedUpdates(dbName: string): Promise<Uint8Array[]> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    return [];
  }

  const dbs = await indexedDB.databases();
  if (!dbs.some((d) => d.name === dbName)) return [];

  return await new Promise<Uint8Array[]>((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(UPDATES_STORE_NAME)) {
        db.close();
        resolve([]);
        return;
      }

      try {
        const tx = db.transaction(UPDATES_STORE_NAME, 'readonly');
        const store = tx.objectStore(UPDATES_STORE_NAME);
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          db.close();
          resolve((getAllReq.result as Uint8Array[]) ?? []);
        };
        getAllReq.onerror = () => {
          db.close();
          reject(getAllReq.error);
        };
      } catch (err) {
        db.close();
        if ((err as Error)?.name === 'NotFoundError') {
          resolve([]);
          return;
        }
        reject(err);
      }
    };
  });
}

async function prehydrateDocFromIndexedDb(dbName: string, doc: Y.Doc): Promise<void> {
  const updates = await loadPersistedUpdates(dbName);
  if (updates.length === 0) return;
  Y.transact(doc, () => {
    for (const update of updates) Y.applyUpdate(doc, update);
  });
}

class ClientPersistenceImpl implements ClientPersistenceProvider {
  private _idb: IndexeddbPersistence | null = null;
  private readonly _dbName: string;
  readonly whenSynced: Promise<this>;

  constructor({ branch, docName, doc }: CreateClientPersistenceArgs) {
    const dbName = `ok-ydoc:${branch}:${docName}`;
    this._dbName = dbName;
    this.whenSynced = (async () => {
      // Pre-hydrate with our local Yjs import before upstream persistence
      // attaches. This avoids a text-root hydration bug observed under Bun +
      // fake-indexeddb where replaying stored updates onto a fresh doc can
      // produce an empty Y.Text even though the persisted bytes are correct.
      await prehydrateDocFromIndexedDb(dbName, doc);
      this._idb = new IndexeddbPersistence(dbName, doc);
      await this._idb.whenSynced;
      return this;
    })();
  }

  get synced(): boolean {
    return this._idb?.synced ?? false;
  }

  async destroy(): Promise<void> {
    await this.whenSynced;
    await this._idb?.destroy();
  }

  async clearData(): Promise<void> {
    // Upstream `clearData` chains `destroy().then(() => idb.deleteDB(name))`
    // without awaiting the deletion — so its promise resolves before the
    // IDB database is actually gone, and a subsequent
    // `createClientPersistence(sameDocName, ...)` can race with the
    // pending delete. Await the deletion explicitly so callers can rely on
    // "after `await clearData()`, the DB is gone."
    await this.whenSynced;
    await this._idb?.destroy();
    const dbName = this._dbName;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      // Deletion is blocked on another connection still holding the DB
      // open (other tab, DevTools IDB pane, in-flight transaction).
      // Reject so the caller's recycle gate aborts — a subsequent
      // `IndexeddbPersistence` over the same name would hydrate the
      // doc from the un-deleted DB BEFORE Yjs sync runs, re-opening
      // the content-duplication bug class clearData exists to prevent.
      req.onblocked = () => {
        console.warn(JSON.stringify({ event: 'ok-client-persistence-clear-blocked', dbName }));
        reject(new Error(`idb-clear-blocked: ${dbName}`));
      };
    });
  }
}

export function createClientPersistence(
  args: CreateClientPersistenceArgs,
): ClientPersistenceProvider {
  return new ClientPersistenceImpl(args);
}

export function captureStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}

export function computeUnsyncedUpdate(doc: Y.Doc, lastAckedSV: Uint8Array | null): Uint8Array {
  return lastAckedSV === null
    ? Y.encodeStateAsUpdate(doc)
    : Y.encodeStateAsUpdate(doc, lastAckedSV);
}

/**
 * Element-wise max-merge of two Yjs state vectors. Conservative under
 * out-of-order receives across independent channels — the server's
 * per-doc SV is monotonic at emit time, but the client receives via
 * two channels (CC1 stateless WS + `/api/server-info` HTTP) that
 * aren't ordered relative to each other. A pure overwrite-on-receive
 * could regress when an older HTTP response lands AFTER a newer WS
 * broadcast (HTTP RTT ~ 30–100 ms; WS frame ~ 5–20 ms; the cross-
 * over window is realistic), reopening the disk-ack staleness
 * duplication path on the next mismatch-recycle.
 *
 * Yjs SVs are `Map<clientID, clock>` shapes encoded as variable-
 * length integers. `Y.decodeStateVector` returns the map; element-
 * wise max picks the larger clock per clientID; `Y.encodeStateVector`
 * accepts a `Map<number, number>` directly (per its public type
 * declaration in `node_modules/yjs/dist/src/utils/encoding.d.ts`),
 * so the round-trip stays in-process and doesn't need a synthetic
 * `Y.Doc`.
 *
 * `null` arg = "no current value"; the other side wins. Both null
 * is degenerate but honored — caller chose this state explicitly.
 */
export function mergeStateVectors(a: Uint8Array | null, b: Uint8Array | null): Uint8Array | null {
  if (a === null) return b;
  if (b === null) return a;
  const mapA = Y.decodeStateVector(a);
  const mapB = Y.decodeStateVector(b);
  const merged = new Map<number, number>();
  for (const [clientID, clock] of mapA) merged.set(clientID, clock);
  for (const [clientID, clock] of mapB) {
    const existing = merged.get(clientID);
    if (existing === undefined || clock > existing) {
      merged.set(clientID, clock);
    }
  }
  return Y.encodeStateVector(merged);
}
