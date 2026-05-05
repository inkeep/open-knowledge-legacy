import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { mark } from '@/lib/perf';

function instrumentationDisabled(): boolean {
  return import.meta.env?.PROD === true;
}

export const UNKNOWN_BRANCH_SENTINEL = '_unknown_';

export interface ClientPersistenceProvider {
  readonly whenSynced: Promise<this>;
  readonly synced: boolean;
  destroy(): Promise<void>;
  clearData(): Promise<void>;
}

interface CreateClientPersistenceArgs {
  readonly branch: string;
  readonly serverInstanceId: string;
  readonly docName: string;
  readonly doc: Y.Doc;
}

class ClientPersistenceImpl implements ClientPersistenceProvider {
  private readonly _idb: IndexeddbPersistence;
  private readonly _dbName: string;
  readonly whenSynced: Promise<this>;

  constructor({ branch, serverInstanceId, docName, doc }: CreateClientPersistenceArgs) {
    if (typeof serverInstanceId !== 'string' || serverInstanceId.length === 0) {
      throw new Error(
        'createClientPersistence: serverInstanceId is required and must be non-empty',
      );
    }
    this._dbName = `ok-ydoc:${branch}:${serverInstanceId}:${docName}`;
    const start = instrumentationDisabled() ? 0 : performance.now();
    this._idb = new IndexeddbPersistence(this._dbName, doc);
    this.whenSynced = this._idb.whenSynced.then(() => {
      if (!instrumentationDisabled()) {
        const end = performance.now();
        mark(
          'ok/pool/idb-whensynced',
          { docName, durationMs: Math.round((end - start) * 1000) / 1000 },
          { startTime: start, duration: end - start },
        );
      }
      return this;
    });
  }

  get synced(): boolean {
    return this._idb.synced;
  }

  async destroy(): Promise<void> {
    const start = instrumentationDisabled() ? 0 : performance.now();
    try {
      await this._idb.destroy();
    } finally {
      if (!instrumentationDisabled()) {
        const end = performance.now();
        mark(
          'ok/pool/idb-destroy',
          { dbName: this._dbName, durationMs: Math.round((end - start) * 1000) / 1000 },
          { startTime: start, duration: end - start },
        );
      }
    }
  }

  async clearData(): Promise<void> {
    const start = instrumentationDisabled() ? 0 : performance.now();
    try {
      await this._idb.destroy();
      const dbName = this._dbName;
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
          console.warn(JSON.stringify({ event: 'ok-client-persistence-clear-blocked', dbName }));
          reject(new Error(`idb-clear-blocked: ${dbName}`));
        };
      });
    } finally {
      if (!instrumentationDisabled()) {
        const end = performance.now();
        mark(
          'ok/pool/idb-cleardata',
          { dbName: this._dbName, durationMs: Math.round((end - start) * 1000) / 1000 },
          { startTime: start, duration: end - start },
        );
      }
    }
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
