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
 */
export const UNKNOWN_BRANCH_SENTINEL = '_unknown_';

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

class ClientPersistenceImpl implements ClientPersistenceProvider {
  private readonly _idb: IndexeddbPersistence;
  private readonly _dbName: string;
  readonly whenSynced: Promise<this>;

  constructor({ branch, docName, doc }: CreateClientPersistenceArgs) {
    this._dbName = `ok-ydoc:${branch}:${docName}`;
    this._idb = new IndexeddbPersistence(this._dbName, doc);
    this.whenSynced = this._idb.whenSynced.then(() => this);
  }

  get synced(): boolean {
    return this._idb.synced;
  }

  async destroy(): Promise<void> {
    await this._idb.destroy();
  }

  async clearData(): Promise<void> {
    // Upstream `clearData` chains `destroy().then(() => idb.deleteDB(name))`
    // without awaiting the deletion — so its promise resolves before the
    // IDB database is actually gone, and a subsequent
    // `createClientPersistence(sameDocName, ...)` can race with the
    // pending delete. Await the deletion explicitly so callers can rely on
    // "after `await clearData()`, the DB is gone."
    await this._idb.destroy();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this._dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      // Deletion is blocked on another connection still holding the DB
      // open. Returning here preserves the non-blocking behavior of
      // upstream `clearData`; a subsequent open will surface any real
      // problem loudly rather than silently.
      req.onblocked = () => resolve();
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
