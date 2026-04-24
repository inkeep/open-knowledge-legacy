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
 * IDB database names are prefixed `ok-ydoc:` so they don't collide with
 * other origins' IndexedDB consumers.
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

export type DocName = string & { readonly __brand: 'DocName' };

export function asDocName(raw: string): DocName {
  return raw as DocName;
}

export interface ClientPersistenceProvider {
  readonly whenSynced: Promise<this>;
  readonly synced: boolean;
  destroy(): Promise<void>;
  clearData(): Promise<void>;
}

class ClientPersistenceImpl implements ClientPersistenceProvider {
  private readonly _idb: IndexeddbPersistence;
  private readonly _dbName: string;
  readonly whenSynced: Promise<this>;

  constructor(docName: DocName, doc: Y.Doc) {
    this._dbName = `ok-ydoc:${docName}`;
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

export function createClientPersistence(docName: DocName, doc: Y.Doc): ClientPersistenceProvider {
  return new ClientPersistenceImpl(docName, doc);
}

export function captureStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}

export function computeUnsyncedUpdate(doc: Y.Doc, lastAckedSV: Uint8Array | null): Uint8Array {
  return lastAckedSV === null
    ? Y.encodeStateAsUpdate(doc)
    : Y.encodeStateAsUpdate(doc, lastAckedSV);
}
