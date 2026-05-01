import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import {
  type ClientPersistenceProvider,
  captureStateVector,
  computeUnsyncedUpdate,
  createClientPersistence,
  mergeStateVectors,
} from './client-persistence';

function uniqueDocName(prefix = 'cp-test'): string {
  return `${prefix}-${randomUUID()}`;
}

const TEST_BRANCH = 'main';

const TEST_SERVER_INSTANCE_ID = 'test-server-instance';

async function countPersistedUpdates(
  branch: string,
  serverInstanceId: string,
  docName: string,
): Promise<number> {
  const dbName = `ok-ydoc:${branch}:${serverInstanceId}:${docName}`;
  const dbs = await indexedDB.databases();
  if (!dbs.some((d) => d.name === dbName)) return 0;

  return new Promise<number>((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('updates')) {
        db.close();
        resolve(0);
        return;
      }
      try {
        const tx = db.transaction('updates', 'readonly');
        const store = tx.objectStore('updates');
        const countReq = store.count();
        countReq.onsuccess = () => {
          db.close();
          resolve(countReq.result);
        };
        countReq.onerror = () => {
          db.close();
          reject(countReq.error);
        };
      } catch (err) {
        db.close();
        if ((err as Error)?.name === 'NotFoundError') {
          resolve(0);
          return;
        }
        reject(err);
      }
    };
  });
}

describe('createClientPersistence', () => {
  test('creates provider for empty IDB and emits synced event', async () => {
    const docName = uniqueDocName();
    const doc = new Y.Doc();
    const provider: ClientPersistenceProvider = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc,
    });

    expect(provider.synced).toBe(false);

    const resolved = await provider.whenSynced;

    expect(provider.synced).toBe(true);
    expect(resolved).toBe(provider);

    await provider.destroy();
    doc.destroy();
  });

  test('persists updates across destroy then re-open with same docName', async () => {
    const docName = uniqueDocName();

    const docA = new Y.Doc();
    const providerA = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docA,
    });
    await providerA.whenSynced;
    docA.getMap('m').set('greeting', 'hello-persistence');
    docA.getArray('a').push(['one', 'two']);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await providerA.destroy();
    docA.destroy();

    const docB = new Y.Doc();
    const providerB = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docB,
    });
    await providerB.whenSynced;

    expect(docB.getMap('m').get('greeting')).toBe('hello-persistence');
    expect(docB.getArray('a').toArray()).toEqual(['one', 'two']);

    await providerB.destroy();
    docB.destroy();
  });

  test('hydration does not re-write already-persisted updates (self-origin filter)', async () => {
    const docName = uniqueDocName();

    const docA = new Y.Doc();
    const providerA = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docA,
    });
    await providerA.whenSynced;
    docA.getText('t').insert(0, 'a');
    docA.getText('t').insert(1, 'b');
    docA.getText('t').insert(2, 'c');
    docA.getText('t').insert(3, 'd');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await providerA.destroy();
    docA.destroy();

    const countBeforeHydrate = await countPersistedUpdates(
      TEST_BRANCH,
      TEST_SERVER_INSTANCE_ID,
      docName,
    );
    expect(countBeforeHydrate).toBeGreaterThanOrEqual(4);

    const docB = new Y.Doc();
    const providerB = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docB,
    });
    await providerB.whenSynced;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const countAfterHydrate = await countPersistedUpdates(
      TEST_BRANCH,
      TEST_SERVER_INSTANCE_ID,
      docName,
    );
    expect(countAfterHydrate).toBe(countBeforeHydrate + 1);
    expect(docB.getText('t').toString()).toBe('abcd');

    await providerB.destroy();
    docB.destroy();
  });

  test('clearData wipes persisted updates', async () => {
    const docName = uniqueDocName();

    const docA = new Y.Doc();
    const providerA = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docA,
    });
    await providerA.whenSynced;
    docA.getText('t').insert(0, 'will be wiped');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(
      await countPersistedUpdates(TEST_BRANCH, TEST_SERVER_INSTANCE_ID, docName),
    ).toBeGreaterThan(0);

    await providerA.clearData();
    docA.destroy();

    expect(await countPersistedUpdates(TEST_BRANCH, TEST_SERVER_INSTANCE_ID, docName)).toBe(0);

    const docB = new Y.Doc();
    const providerB = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docB,
    });
    await providerB.whenSynced;

    expect(docB.getText('t').toString()).toBe('');

    await providerB.destroy();
    docB.destroy();
  });

  test('destroy preserves persisted data for the next open', async () => {
    const docName = uniqueDocName();

    const docA = new Y.Doc();
    const providerA = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docA,
    });
    await providerA.whenSynced;
    docA.getText('t').insert(0, 'survive-destroy');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await providerA.destroy();
    docA.destroy();

    expect(
      await countPersistedUpdates(TEST_BRANCH, TEST_SERVER_INSTANCE_ID, docName),
    ).toBeGreaterThan(0);

    const docB = new Y.Doc();
    const providerB = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc: docB,
    });
    await providerB.whenSynced;
    expect(docB.getText('t').toString()).toBe('survive-destroy');

    await providerB.destroy();
    docB.destroy();
  });

  test('throws synchronously when serverInstanceId is empty', () => {
    const docName = uniqueDocName();
    const doc = new Y.Doc();
    expect(() =>
      createClientPersistence({
        branch: TEST_BRANCH,
        serverInstanceId: '',
        docName,
        doc,
      }),
    ).toThrow('serverInstanceId is required');
    doc.destroy();
  });

  test('DB-name derivation is unique per (branch, serverInstanceId, docName)', async () => {
    const docName = uniqueDocName('db-name');
    const triples = [
      { branch: 'main', serverInstanceId: 'epoch-A' },
      { branch: 'feature', serverInstanceId: 'epoch-A' },
      { branch: 'main', serverInstanceId: 'epoch-B' },
    ];

    for (const { branch, serverInstanceId } of triples) {
      const doc = new Y.Doc();
      const provider = createClientPersistence({ branch, serverInstanceId, docName, doc });
      await provider.whenSynced;
      doc.getText('t').insert(0, `${branch}-${serverInstanceId}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await provider.destroy();
      doc.destroy();
    }

    const dbs = await indexedDB.databases();
    const observedNames = new Set(
      dbs.map((d) => d.name).filter((n): n is string => n !== undefined),
    );
    for (const { branch, serverInstanceId } of triples) {
      const expected = `ok-ydoc:${branch}:${serverInstanceId}:${docName}`;
      expect(observedNames.has(expected)).toBe(true);
    }
  });

  test('ignores legacy ok-ydoc:branch:docName DB shape — new shape hydrates empty', async () => {
    const docName = uniqueDocName('legacy-shape');
    const legacyDbName = `ok-ydoc:${TEST_BRANCH}:${docName}`;

    const stagingDoc = new Y.Doc();
    stagingDoc.getText('t').insert(0, 'stale-from-legacy-shape');
    const staleBytes = Y.encodeStateAsUpdate(stagingDoc);
    stagingDoc.destroy();

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(legacyDbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('updates')) {
          db.createObjectStore('updates', { autoIncrement: true });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('updates', 'readwrite');
        tx.objectStore('updates').add(staleBytes);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      req.onerror = () => reject(req.error);
    });

    const doc = new Y.Doc();
    const provider = createClientPersistence({
      branch: TEST_BRANCH,
      serverInstanceId: TEST_SERVER_INSTANCE_ID,
      docName,
      doc,
    });
    await provider.whenSynced;

    expect(doc.getText('t').toString()).toBe('');

    await provider.destroy();
    doc.destroy();
  });
});

describe('captureStateVector', () => {
  test('returns a non-empty Uint8Array for a non-empty doc', () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'some content');

    const sv = captureStateVector(doc);

    expect(sv).toBeInstanceOf(Uint8Array);
    expect(sv.byteLength).toBeGreaterThan(0);

    doc.destroy();
  });
});

describe('computeUnsyncedUpdate', () => {
  test('with null lastAckedSV returns the full state update', () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'full');

    const fromHelper = computeUnsyncedUpdate(doc, null);
    const full = Y.encodeStateAsUpdate(doc);

    expect(fromHelper).toEqual(full);

    doc.destroy();
  });

  test('round-trips: applying delta onto a peer at last-synced state yields equivalent content', () => {
    const ackSnapshot = (() => {
      const doc = new Y.Doc();
      doc.getText('t').insert(0, 'acked-baseline');
      const update = Y.encodeStateAsUpdate(doc);
      doc.destroy();
      return update;
    })();

    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, ackSnapshot);
    const lastAckedSV = captureStateVector(clientDoc);
    clientDoc.getText('t').insert(14, ' + burst');

    const delta = computeUnsyncedUpdate(clientDoc, lastAckedSV);
    expect(delta.byteLength).toBeGreaterThan(0);

    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, ackSnapshot);
    expect(peerDoc.getText('t').toString()).toBe('acked-baseline');

    Y.applyUpdate(peerDoc, delta);
    expect(peerDoc.getText('t').toString()).toBe(clientDoc.getText('t').toString());

    clientDoc.destroy();
    peerDoc.destroy();
  });
});

describe('mergeStateVectors', () => {
  test('returns the non-null arg when one side is null', () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'hello');
    const sv = Y.encodeStateVector(doc);
    expect(mergeStateVectors(null, sv)).toBe(sv);
    expect(mergeStateVectors(sv, null)).toBe(sv);
    expect(mergeStateVectors(null, null)).toBeNull();
    doc.destroy();
  });

  test('strictly-dominating SV wins regardless of arg order', () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'A');
    const svAfterA = Y.encodeStateVector(doc);
    doc.getText('t').insert(1, 'B');
    const svAfterAB = Y.encodeStateVector(doc);
    doc.destroy();

    expect(mergeStateVectors(svAfterA, svAfterAB)).toEqual(svAfterAB);
    expect(mergeStateVectors(svAfterAB, svAfterA)).toEqual(svAfterAB);
  });

  test('union-merges disjoint clientID sets', () => {
    const docA = new Y.Doc();
    docA.getText('t').insert(0, 'A1');
    const svA = Y.encodeStateVector(docA);
    const clientA = docA.clientID;
    docA.destroy();

    const docB = new Y.Doc();
    docB.getText('t').insert(0, 'B1');
    const svB = Y.encodeStateVector(docB);
    const clientB = docB.clientID;
    docB.destroy();

    expect(clientA).not.toBe(clientB);

    const merged = mergeStateVectors(svA, svB);
    if (merged === null) throw new Error('expected merged SV');
    const decoded = Y.decodeStateVector(merged);
    expect(decoded.has(clientA)).toBe(true);
    expect(decoded.has(clientB)).toBe(true);
  });

  test('same-clientID picks the larger clock', () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'A');
    const svAfterA = Y.encodeStateVector(doc);
    doc.getText('t').insert(1, 'B');
    doc.getText('t').insert(2, 'C');
    const svAfterABC = Y.encodeStateVector(doc);
    const clientID = doc.clientID;
    doc.destroy();

    const mapA = Y.decodeStateVector(svAfterA);
    const mapABC = Y.decodeStateVector(svAfterABC);
    const clockAfterA = mapA.get(clientID);
    const clockAfterABC = mapABC.get(clientID);
    if (clockAfterA === undefined || clockAfterABC === undefined) {
      throw new Error('expected clocks');
    }
    expect(clockAfterABC).toBeGreaterThan(clockAfterA);

    const merged = mergeStateVectors(svAfterA, svAfterABC);
    if (merged === null) throw new Error('expected merged SV');
    const mergedMap = Y.decodeStateVector(merged);
    expect(mergedMap.get(clientID)).toBe(clockAfterABC);
  });

  test('merging an SV with itself is idempotent', () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'idempotent');
    const sv = Y.encodeStateVector(doc);
    doc.destroy();
    expect(mergeStateVectors(sv, sv)).toEqual(sv);
  });
});
