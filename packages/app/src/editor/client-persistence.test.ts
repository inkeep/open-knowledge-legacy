/**
 * Unit tests for the client-persistence primitive — the typed wrapper
 * around `y-indexeddb`'s `IndexeddbPersistence` that exposes
 * origin-filtered persistence + state-vector helpers for buffer-and-replay
 * across mismatch-recycle (Shape 2+ per
 * specs/2026-04-24-client-persistence-replaces-sidecar/SPEC.md).
 *
 * Runs under Bun with the `fake-indexeddb/auto` preload configured in
 * `packages/app/bunfig.toml` — no real browser IDB needed.
 *
 * Test isolation is via unique doc names (randomUUID) rather than wiping
 * `indexedDB` between tests, because fake-indexeddb's global state persists
 * across a `bun test` process.
 */

import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import {
  asDocName,
  type ClientPersistenceProvider,
  captureStateVector,
  computeUnsyncedUpdate,
  createClientPersistence,
  type DocName,
} from './client-persistence';

function uniqueDocName(prefix = 'cp-test'): string {
  return `${prefix}-${randomUUID()}`;
}

async function countPersistedUpdates(docName: string): Promise<number> {
  const dbName = `ok-ydoc:${docName}`;
  // Calling `indexedDB.open(dbName)` without a version on a DB that doesn't
  // exist creates a brand-new empty v1 DB with no object stores — which is
  // a destructive side effect for our test scenarios (the subsequent
  // `createClientPersistence` would then see v1 without the schema and
  // `onupgradeneeded` would NOT fire, breaking hydration). Check via
  // `databases()` first and short-circuit when the DB is absent.
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
    const docName: DocName = asDocName(uniqueDocName());
    const doc = new Y.Doc();
    const provider: ClientPersistenceProvider = createClientPersistence(docName, doc);

    expect(provider.synced).toBe(false);

    const resolved = await provider.whenSynced;

    expect(provider.synced).toBe(true);
    expect(resolved).toBe(provider);

    await provider.destroy();
    doc.destroy();
  });

  test('persists updates across destroy then re-open with same docName', async () => {
    const docName = asDocName(uniqueDocName());

    const docA = new Y.Doc();
    const providerA = createClientPersistence(docName, docA);
    await providerA.whenSynced;
    docA.getMap('m').set('greeting', 'hello-persistence');
    docA.getArray('a').push(['one', 'two']);
    // Wait a microtask tick so the upstream _storeUpdate listener flushes
    // the write to fake-indexeddb before we tear down.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await providerA.destroy();
    docA.destroy();

    const docB = new Y.Doc();
    const providerB = createClientPersistence(docName, docB);
    await providerB.whenSynced;

    expect(docB.getMap('m').get('greeting')).toBe('hello-persistence');
    expect(docB.getArray('a').toArray()).toEqual(['one', 'two']);

    await providerB.destroy();
    docB.destroy();
  });

  test('hydration does not re-write already-persisted updates (self-origin filter)', async () => {
    // Upstream y-indexeddb writes ONE consolidation snapshot per hydration
    // when existing updates are present (patched issue #31). The
    // self-origin filter (`origin !== this` in `_storeUpdate`) is what
    // prevents the N individual stored updates from being re-written as
    // the doc receives them during `fetchUpdates` — otherwise each mount
    // would multiply IDB growth by N.
    const docName = asDocName(uniqueDocName());

    const docA = new Y.Doc();
    const providerA = createClientPersistence(docName, docA);
    await providerA.whenSynced;
    docA.getText('t').insert(0, 'a');
    docA.getText('t').insert(1, 'b');
    docA.getText('t').insert(2, 'c');
    docA.getText('t').insert(3, 'd');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await providerA.destroy();
    docA.destroy();

    const countBeforeHydrate = await countPersistedUpdates(docName);
    expect(countBeforeHydrate).toBeGreaterThanOrEqual(4);

    const docB = new Y.Doc();
    const providerB = createClientPersistence(docName, docB);
    await providerB.whenSynced;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const countAfterHydrate = await countPersistedUpdates(docName);
    // Without the filter, the N hydrated updates would be re-written
    // (producing linear growth in N). With it, only the consolidation
    // snapshot from the patched `beforeApplyUpdatesCallback` is added.
    expect(countAfterHydrate).toBe(countBeforeHydrate + 1);
    expect(docB.getText('t').toString()).toBe('abcd');

    await providerB.destroy();
    docB.destroy();
  });

  test('clearData wipes persisted updates', async () => {
    const docName = asDocName(uniqueDocName());

    const docA = new Y.Doc();
    const providerA = createClientPersistence(docName, docA);
    await providerA.whenSynced;
    docA.getText('t').insert(0, 'will be wiped');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(await countPersistedUpdates(docName)).toBeGreaterThan(0);

    await providerA.clearData();
    docA.destroy();

    expect(await countPersistedUpdates(docName)).toBe(0);

    const docB = new Y.Doc();
    const providerB = createClientPersistence(docName, docB);
    await providerB.whenSynced;

    expect(docB.getText('t').toString()).toBe('');

    await providerB.destroy();
    docB.destroy();
  });

  test('destroy preserves persisted data for the next open', async () => {
    const docName = asDocName(uniqueDocName());

    const docA = new Y.Doc();
    const providerA = createClientPersistence(docName, docA);
    await providerA.whenSynced;
    docA.getText('t').insert(0, 'survive-destroy');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await providerA.destroy();
    docA.destroy();

    // Destroy is supposed to unhook without deleting — data must remain.
    expect(await countPersistedUpdates(docName)).toBeGreaterThan(0);

    const docB = new Y.Doc();
    const providerB = createClientPersistence(docName, docB);
    await providerB.whenSynced;
    expect(docB.getText('t').toString()).toBe('survive-destroy');

    await providerB.destroy();
    docB.destroy();
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
    // Two peers start at the same synced state (ackSnapshot). One keeps
    // typing. `computeUnsyncedUpdate` should produce exactly the delta
    // needed to bring the quiet peer up to the active peer's state.
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
