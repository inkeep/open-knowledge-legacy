/**
 * Tests for ProviderPool — LRU eviction, active document protection,
 * capacity management, and lifecycle.
 *
 * These tests construct real HocuspocusProvider instances pointing at a
 * non-existent server. The providers will stay in 'connecting' state but
 * the pool's LRU logic, Map management, and eviction ordering are all
 * exercised without needing a running Hocuspocus server.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ProviderPool } from './provider-pool';
import {
  __resetSyncPromiseCache,
  __syncPromiseCacheSize,
  BridgeSetupError,
  PreSyncDisconnectError,
  syncPromise,
} from './sync-promise';

// Use a dummy URL — providers won't connect but pool logic still works
const DUMMY_WS = 'ws://localhost:1/collab';

let pool: ProviderPool;

afterEach(() => {
  pool?.dispose();
});

describe('ProviderPool basics', () => {
  test('starts empty with no active document', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    expect(pool.entries.size).toBe(0);
    expect(pool.getActive()).toBeNull();
    expect(pool.getActiveDocName()).toBeNull();
  });

  test('open() creates an entry and returns it', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open('doc1');
    expect(entry).not.toBeNull();
    expect(entry?.docName).toBe('doc1');
    expect(entry?.provider).toBeDefined();
    expect(pool.has('doc1')).toBe(true);
    expect(pool.entries.size).toBe(1);
  });

  test('open() reuses existing entry for same docName', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry1 = pool.open('doc1');
    const entry2 = pool.open('doc1');
    expect(entry1?.provider).toBe(entry2?.provider);
    expect(pool.entries.size).toBe(1);
  });

  test('setActive() sets the active document', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    pool.setActive('doc1');
    expect(pool.getActiveDocName()).toBe('doc1');
    expect(pool.getActive()?.docName).toBe('doc1');
  });

  test('setActive() throws for unopened document', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    expect(() => pool.setActive('nonexistent')).toThrow('is not open');
  });

  test('close() removes entry and clears active if it was active', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    pool.setActive('doc1');
    pool.close('doc1');
    expect(pool.has('doc1')).toBe(false);
    expect(pool.getActiveDocName()).toBeNull();
  });

  test('close() is no-op for unknown document', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.close('nonexistent'); // should not throw
    expect(pool.entries.size).toBe(0);
  });

  test('has() returns false for unknown documents', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    expect(pool.has('nope')).toBe(false);
  });
});

describe('ProviderPool LRU eviction', () => {
  test('evicts LRU entry when at capacity', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    pool.open('doc2');
    pool.open('doc3');
    // Pool is full. Opening doc4 should evict doc1 (oldest).
    pool.open('doc4');
    expect(pool.has('doc1')).toBe(false);
    expect(pool.has('doc2')).toBe(true);
    expect(pool.has('doc3')).toBe(true);
    expect(pool.has('doc4')).toBe(true);
    expect(pool.entries.size).toBe(3);
  });

  test('never evicts the active document', () => {
    pool = new ProviderPool(2, DUMMY_WS);
    pool.open('doc1');
    pool.setActive('doc1');
    pool.open('doc2');
    // Pool is full (2). doc1 is active, doc2 is LRU.
    // Opening doc3 should evict doc2, not doc1.
    pool.open('doc3');
    expect(pool.has('doc1')).toBe(true); // active — protected
    expect(pool.has('doc2')).toBe(false); // evicted
    expect(pool.has('doc3')).toBe(true);
  });

  test('LRU order updates when document is re-opened', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    pool.open('doc2');
    pool.open('doc3');
    // Re-open doc1 — moves it to end of LRU (most recent)
    pool.open('doc1');
    // Opening doc4 should evict doc2 (now the LRU), not doc1
    pool.open('doc4');
    expect(pool.has('doc1')).toBe(true); // recently accessed
    expect(pool.has('doc2')).toBe(false); // evicted (was LRU)
    expect(pool.has('doc3')).toBe(true);
    expect(pool.has('doc4')).toBe(true);
  });

  test('LRU order updates when document is set active', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    pool.open('doc2');
    pool.open('doc3');
    // Set doc1 as active — moves it to end of LRU
    pool.setActive('doc1');
    pool.open('doc4');
    // doc2 should be evicted (LRU), not doc1 (active + recently touched)
    expect(pool.has('doc1')).toBe(true);
    expect(pool.has('doc2')).toBe(false);
  });

  test('eviction with capacity 1 and active doc', () => {
    pool = new ProviderPool(1, DUMMY_WS);
    pool.open('doc1');
    pool.setActive('doc1');
    // Pool is full (1) and the only entry is active.
    // Opening doc2 — cannot evict active doc1, so pool grows to 2.
    pool.open('doc2');
    // Both should exist since doc1 is protected
    expect(pool.has('doc1')).toBe(true);
    expect(pool.has('doc2')).toBe(true);
  });
});

describe('ProviderPool onChange', () => {
  test('fires onChange callback on open', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    let callCount = 0;
    pool.setOnChange(() => callCount++);
    pool.open('doc1');
    expect(callCount).toBeGreaterThan(0);
  });

  test('fires onChange on setActive', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    let callCount = 0;
    pool.setOnChange(() => callCount++);
    pool.setActive('doc1');
    expect(callCount).toBe(1);
  });

  test('fires onChange on close', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    let callCount = 0;
    pool.setOnChange(() => callCount++);
    pool.close('doc1');
    expect(callCount).toBeGreaterThan(0);
  });
});

describe('ProviderPool disconnect recycling', () => {
  test('does not recycle a provider that disconnects before first sync', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    const originalProvider = entry.provider;
    originalProvider.emit('disconnect', {
      event: { code: 1006, reason: 'startup offline', wasClean: false },
    });

    expect(pool.getActive()?.provider).toBe(originalProvider);
  });

  test('recycles the active provider after disconnect when no unsynced changes remain', async () => {
    // Use recycleDebounceMs: 50 for fast test execution
    pool = new ProviderPool(3, DUMMY_WS, 50);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    const originalProvider = entry.provider;
    originalProvider.emit('synced', { state: true });
    originalProvider.emit('disconnect', {
      event: { code: 1006, reason: 'server restart', wasClean: false },
    });

    // Recycle is debounced — entry still exists with a pending timer
    expect(entry.pendingRecycleTimer).not.toBeNull();

    // Wait for debounce to fire
    await new Promise((r) => setTimeout(r, 100));

    const recycled = pool.getActive();
    expect(recycled).not.toBeNull();
    expect(recycled?.provider).not.toBe(originalProvider);
    expect(recycled?.docName).toBe('doc1');
  });

  test('keeps the provider when disconnect occurs with unsynced local changes', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    const originalProvider = entry.provider;
    originalProvider.emit('synced', { state: true });
    originalProvider.unsyncedChanges = 1;
    originalProvider.emit('disconnect', {
      event: { code: 1006, reason: 'offline', wasClean: false },
    });

    expect(pool.getActive()?.provider).toBe(originalProvider);
  });
});

describe('ProviderPool dispose', () => {
  test('dispose clears all entries and state', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc1');
    pool.open('doc2');
    pool.setActive('doc1');
    pool.dispose();
    expect(pool.entries.size).toBe(0);
    expect(pool.getActive()).toBeNull();
    expect(pool.getActiveDocName()).toBeNull();
  });
});

describe('ProviderPool setupObservers init-throw recovery (S4)', () => {
  // Instead of mock.module (which leaks to other test files in the same bun test
  // process), we sabotage the provider's Y.Doc to force a throw inside the onSynced
  // try block. Overriding doc.getXmlFragment to throw triggers the catch before
  // setupObservers is called — same code path, same recovery behavior.

  test('init-time throw rejects held syncPromise with BridgeSetupError + leaves entry pool-resident', async () => {
    pool = new ProviderPool(3, DUMMY_WS);

    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    // Subscribe to the syncPromise BEFORE firing synced — this models the
    // DocumentBoundary use() consumer that must see the rejection. Without
    // a subscriber the rejectSyncPromise call would be a no-op (no cache entry).
    const consumerPromise = syncPromise('doc1', entry.provider);

    // Sabotage the provider's document to force a throw during observer init
    const doc = entry.provider.document;
    doc.getXmlFragment = () => {
      throw new Error('synthetic getXmlFragment failure');
    };

    // Silence the expected console.error so test output stays readable
    const errorSpy = mock(() => {});
    const origError = console.error;
    console.error = errorSpy;

    // Fire synced manually — this triggers onSynced → try block → throw → catch
    entry.provider.emit('synced', { state: true });

    console.error = origError;

    // Held syncPromise rejects with BridgeSetupError carrying the docName + cause.
    try {
      await consumerPromise;
      throw new Error('expected promise to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(BridgeSetupError);
      expect((err as BridgeSetupError).docName).toBe('doc1');
      expect((err as BridgeSetupError).cause).toBeInstanceOf(Error);
      expect(((err as BridgeSetupError).cause as Error).message).toContain(
        'synthetic getXmlFragment failure',
      );
    }

    // Entry stays pool-resident with bridgeSetupFailed flag — keeps activeProvider
    // non-null so EditorArea continues to render the boundary subtree, and the
    // user-driven recycle path (pool.recycle) can replace the broken provider.
    expect(pool.has('doc1')).toBe(true);
    expect(pool.entries.get('doc1')?.bridgeSetupFailed).toBe(true);
    expect(pool.getActiveDocName()).toBe('doc1');
    expect(pool.getActive()?.provider).toBe(entry.provider);

    // Error was logged via console.error with the expected prefix + full error object
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedPrefix = errorSpy.mock.calls[0]?.[0] as string;
    const loggedError = errorSpy.mock.calls[0]?.[1] as Error;
    expect(loggedPrefix).toContain('[ProviderPool] setupObservers init failed for doc1:');
    expect(loggedError).toBeInstanceOf(Error);
    expect(loggedError.message).toContain('synthetic getXmlFragment failure');
  });

  test('pool.recycle on a bridge-setup-failed entry replaces it with a fresh provider', () => {
    pool = new ProviderPool(3, DUMMY_WS);

    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    // Force a setup throw to mark the entry broken
    entry.provider.document.getXmlFragment = () => {
      throw new Error('synthetic init failure');
    };
    const errorSpy = mock(() => {});
    const origError = console.error;
    console.error = errorSpy;
    entry.provider.emit('synced', { state: true });
    console.error = origError;

    expect(pool.entries.get('doc1')?.bridgeSetupFailed).toBe(true);
    const brokenProvider = entry.provider;

    // Recycle — destroys broken entry and creates fresh one, preserving activeDocName
    pool.recycle('doc1');

    expect(pool.has('doc1')).toBe(true);
    expect(pool.getActiveDocName()).toBe('doc1');
    const newEntry = pool.entries.get('doc1');
    expect(newEntry).toBeDefined();
    expect(newEntry?.provider).not.toBe(brokenProvider);
    expect(newEntry?.bridgeSetupFailed).toBe(false);
  });

  test('non-active background doc disconnect triggers debounced destroy without re-open', async () => {
    // Use recycleDebounceMs: 50 for fast test execution
    pool = new ProviderPool(3, DUMMY_WS, 50);
    let onChangeCalls = 0;
    pool.setOnChange(() => onChangeCalls++);

    // Open two docs, only doc1 is active
    const entry1 = pool.open('doc1');
    if (!entry1) throw new Error('expected entry1');
    pool.setActive('doc1');
    const entry2 = pool.open('doc2');
    if (!entry2) throw new Error('expected entry2');
    onChangeCalls = 0;

    // Mark doc2 as synced with no unsynced changes
    entry2.provider.emit('synced', { state: true });
    entry2.provider.unsyncedChanges = 0;

    // Disconnect doc2 — schedules a debounced recycle
    entry2.provider.emit('disconnect', {
      event: { code: 1006, reason: 'server restart', wasClean: false },
    });

    // Immediately after disconnect, the recycle timer is pending — entry still exists
    expect(entry2.pendingRecycleTimer).not.toBeNull();
    expect(pool.has('doc2')).toBe(true);

    // Wait for the debounce to fire
    await new Promise((r) => setTimeout(r, 100));

    // Now doc2 is removed from the pool
    expect(pool.has('doc2')).toBe(false);

    // doc1 remains active and unaffected
    expect(pool.has('doc1')).toBe(true);
    expect(pool.getActiveDocName()).toBe('doc1');
    expect(pool.getActive()?.provider).toBe(entry1.provider);

    // Pool size decreased
    expect(pool.entries.size).toBe(1);

    // onChange was called (from notify() in the non-active branch)
    expect(onChangeCalls).toBeGreaterThanOrEqual(1);
  });

  test('recycle debounce is cancelled when provider reconnects (onSynced)', () => {
    pool = new ProviderPool(3, DUMMY_WS, 200);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    // Pre-set observerCleanup so onSynced skips setupObservers (which would
    // throw on a dummy provider with no real server). We're testing the
    // debounce-cancel lifecycle, not the observer setup.
    entry.observerCleanup = () => {};

    // Simulate initial sync
    entry.hasSynced = true;
    entry.syncState = 'synced';
    entry.provider.unsyncedChanges = 0;

    // Disconnect — starts the debounce timer
    entry.provider.emit('disconnect', {
      event: { code: 1006, reason: 'server restart', wasClean: false },
    });
    expect(entry.pendingRecycleTimer).not.toBeNull();
    const _originalTimer = entry.pendingRecycleTimer;

    // Provider reconnects before the debounce fires — onSynced cancels the timer
    entry.provider.emit('synced', { state: true });
    expect(entry.pendingRecycleTimer).toBeNull();

    // Entry was NOT recycled — still in the pool, same object identity
    // (synchronous check, no need to wait — the timer was cleared)
    expect(pool.has('doc1')).toBe(true);
    expect(pool.getActive()?.provider).toBe(entry.provider);
    expect(entry.syncState).toBe('synced');
  });
});

describe('ProviderPool prewarm (V2 SPEC FR12 / Option G)', () => {
  test('prewarm admits a cold doc and returns its entry', () => {
    const pool = new ProviderPool(10, 'ws://localhost:9999');
    const entry = pool.prewarm('prewarm-doc');
    expect(entry).not.toBeNull();
    expect(pool.has('prewarm-doc')).toBe(true);
    pool.dispose();
  });

  test('prewarm places new entry at LRU-oldest — it is the first evicted', () => {
    const pool = new ProviderPool(3, 'ws://localhost:9999');
    // User-initiated opens — go to MRU (LRU-newest).
    pool.open('user-a');
    pool.open('user-b');
    pool.setActive('user-b'); // Pin active to prevent eviction

    // Prewarm should go to LRU-oldest.
    pool.prewarm('prewarm-c');
    expect(pool.has('prewarm-c')).toBe(true);

    // Next user-initiated open at capacity → should evict the prewarm first.
    pool.open('user-d');
    expect(pool.has('prewarm-c')).toBe(false);
    expect(pool.has('user-a')).toBe(true);
    expect(pool.has('user-b')).toBe(true);
    expect(pool.has('user-d')).toBe(true);
    pool.dispose();
  });

  test('prewarm is idempotent — re-prewarming an existing doc returns same entry', () => {
    const pool = new ProviderPool(10, 'ws://localhost:9999');
    const first = pool.prewarm('idempotent-doc');
    const second = pool.prewarm('idempotent-doc');
    expect(second).toBe(first);
    pool.dispose();
  });

  test('prewarm rejects system docs (__system__)', () => {
    const pool = new ProviderPool(10, 'ws://localhost:9999');
    const entry = pool.prewarm('__system__');
    expect(entry).toBeNull();
    expect(pool.has('__system__')).toBe(false);
    pool.dispose();
  });
});

describe('ProviderPool admission filter (__system__, DX7)', () => {
  test('open("__system__") returns null and does not add the pseudo-doc to the pool', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open('__system__');
    expect(entry).toBeNull();
    expect(pool.has('__system__')).toBe(false);
    expect(pool.entries.size).toBe(0);
  });

  test('open("__system__") does not fire onChange notification', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    let calls = 0;
    pool.setOnChange(() => calls++);
    pool.open('__system__');
    expect(calls).toBe(0);
  });

  test('non-system doc names are admitted normally', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    // Ensure a docName containing '__system__' as a substring is NOT filtered
    const entry = pool.open('my-__system__-notes');
    expect(entry).not.toBeNull();
    expect(pool.has('my-__system__-notes')).toBe(true);
  });
});

describe('ProviderPool HocuspocusProvider configuration (D8)', () => {
  test('new providers receive forceSyncInterval: 5000', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    // @hocuspocus/provider exposes the resolved configuration; the default
    // is `false`, so a set value confirms the pool passed the option through.
    expect(entry.provider.configuration.forceSyncInterval).toBe(5000);
  });
});

describe('ProviderPool syncPromise lifecycle integration (F15)', () => {
  beforeEach(() => {
    __resetSyncPromiseCache();
  });

  afterEach(() => {
    __resetSyncPromiseCache();
  });

  test('close(docName) invalidates the cached syncPromise', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    // Create the cached promise (kept alive across later settlement by the .catch handler)
    const p = syncPromise('doc1', entry.provider);
    p.catch(() => {}); // swallow any pool-teardown rejection
    expect(__syncPromiseCacheSize()).toBe(1);

    pool.close('doc1');

    // Invalidation runs inside destroyEntry before provider.destroy() fires close
    expect(__syncPromiseCacheSize()).toBe(0);
  });

  test('LRU eviction invalidates the cached syncPromise of the evicted doc', () => {
    pool = new ProviderPool(2, DUMMY_WS);
    const e1 = pool.open('doc1');
    if (!e1) throw new Error('expected e1');
    pool.setActive('doc1');
    const e2 = pool.open('doc2');
    if (!e2) throw new Error('expected e2');

    syncPromise('doc1', e1.provider).catch(() => {});
    syncPromise('doc2', e2.provider).catch(() => {});
    expect(__syncPromiseCacheSize()).toBe(2);

    // Opening doc3 evicts doc2 (doc1 is active and protected)
    const e3 = pool.open('doc3');
    if (!e3) throw new Error('expected e3');

    expect(pool.has('doc2')).toBe(false);
    // doc1 + doc3's cache entry (doc3 hasn't had syncPromise called yet so just doc1)
    expect(__syncPromiseCacheSize()).toBe(1);
  });

  test('recycle after disconnect invalidates the cached syncPromise', async () => {
    pool = new ProviderPool(3, DUMMY_WS, 50);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');
    // Pre-set observerCleanup so the recycle path's re-open doesn't try to
    // setupObservers against a dummy provider.
    entry.observerCleanup = () => {};

    // Simulate initial sync so the disconnect→recycle guard path is taken
    entry.hasSynced = true;
    entry.syncState = 'synced';
    entry.provider.unsyncedChanges = 0;

    syncPromise('doc1', entry.provider).catch(() => {});
    expect(__syncPromiseCacheSize()).toBe(1);

    // Disconnect → schedules recycle debounce timer
    entry.provider.emit('disconnect', {
      event: { code: 1006, reason: 'server restart', wasClean: false },
    });

    // Wait for debounce to fire
    await new Promise((r) => setTimeout(r, 100));

    // After recycle: original cache entry invalidated; re-opened provider has
    // no fresh syncPromise call yet, so cache is empty
    expect(__syncPromiseCacheSize()).toBe(0);
  });

  test('dispose() invalidates all cached syncPromises', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const e1 = pool.open('doc1');
    const e2 = pool.open('doc2');
    if (!e1 || !e2) throw new Error('expected entries');
    syncPromise('doc1', e1.provider).catch(() => {});
    syncPromise('doc2', e2.provider).catch(() => {});
    expect(__syncPromiseCacheSize()).toBe(2);

    pool.dispose();

    expect(__syncPromiseCacheSize()).toBe(0);
  });

  test('natural (network-triggered) close event rejects the syncPromise with PreSyncDisconnectError', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    const p = syncPromise('doc1', entry.provider);

    // Simulate a natural close event (network drop, server disconnect).
    // This is different from pool.close(docName) which goes through
    // invalidateSyncPromise first — here the listener fires naturally.
    entry.provider.emit('close', {
      event: { code: 1006, reason: 'network drop', wasClean: false },
    });

    await expect(p).rejects.toBeInstanceOf(PreSyncDisconnectError);
    // Cache entry stays as a settled sentinel after rejection — see
    // sync-promise.ts lifecycle docstring (subsequent React renders need to
    // see the same .status='rejected' thenable so the boundary catches).
    expect(__syncPromiseCacheSize()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Review Critical #2 (2026-04-21): pool destroy must evict the V2 editor
// cache before tearing down the provider. Otherwise the next cache-hit mount
// returns an Editor bound to an orphaned Y.Doc (split-brain typing, no
// sync, no persistence, no error boundary fires).
//
// Bun unit env has no DOM — we shape fake nodes that match the narrow
// HTMLElement surface the cache touches, mirroring editor-cache.test.ts.
// ---------------------------------------------------------------------------
interface FakeContainer {
  parentElement: FakeContainer | null;
  scrollTop: number;
  children: FakeContainer[];
  appendChild(child: FakeContainer): FakeContainer;
  removeChild(child: FakeContainer): FakeContainer;
  setAttribute(key: string, value: string): void;
  style: Record<string, string>;
}

function makeFakeNode(): FakeContainer {
  const node: FakeContainer = {
    parentElement: null,
    scrollTop: 0,
    children: [],
    style: {},
    setAttribute() {
      // no-op
    },
    appendChild(child) {
      if (child.parentElement) child.parentElement.removeChild(child);
      node.children.push(child);
      child.parentElement = node;
      return child;
    },
    removeChild(child) {
      const idx = node.children.indexOf(child);
      if (idx !== -1) node.children.splice(idx, 1);
      child.parentElement = null;
      return child;
    },
  };
  return node;
}

describe('ProviderPool → V2 editor cache eviction coupling (Critical #2)', () => {
  test('close() evicts both TipTap + CM cache entries before destroying the provider', async () => {
    const cacheModule = await import('./editor-cache');
    cacheModule.__resetCacheForTests();
    const fakeTipDom = makeFakeNode();
    const fakeCmDom = makeFakeNode();
    const fakeEditor = {
      editorView: { dom: fakeTipDom, scrollDOM: fakeTipDom },
      commands: { focus: mock(() => {}) },
      destroy: mock(() => {}),
    } as unknown as import('@tiptap/core').Editor;
    const fakeView = {
      dom: fakeCmDom,
      scrollDOM: fakeCmDom,
      focus: mock(() => {}),
      destroy: mock(() => {}),
    } as unknown as import('@codemirror/view').EditorView;
    const makeProv = () =>
      ({
        destroy: mock(() => {}),
        document: { destroy: mock(() => {}) } as unknown as import('yjs').Doc,
        awareness: null,
      }) as unknown as import('@hocuspocus/provider').HocuspocusProvider;
    const fakeYDoc = { destroy: mock(() => {}) } as unknown as import('yjs').Doc;
    const fakeYText = { toString: () => '' } as unknown as import('yjs').Text;

    cacheModule.mountTiptapEditor({
      docName: 'doc-eviction-regression',
      container: makeFakeNode() as unknown as HTMLElement,
      factory: () => ({
        editor: fakeEditor,
        ydoc: fakeYDoc,
        ytext: fakeYText,
        provider: makeProv(),
      }),
    });
    cacheModule.mountCmEditor({
      docName: 'doc-eviction-regression',
      container: makeFakeNode() as unknown as HTMLElement,
      factory: () => ({ view: fakeView, ydoc: fakeYDoc, ytext: fakeYText, provider: makeProv() }),
    });
    expect(cacheModule.__peekTiptap('doc-eviction-regression')).toBeDefined();
    expect(cacheModule.__peekCm('doc-eviction-regression')).toBeDefined();

    // Now open + close through the pool. close() → destroyEntry() →
    // evictTiptapEditor + evictCmEditor should fire.
    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc-eviction-regression');
    pool.close('doc-eviction-regression');

    expect(cacheModule.__peekTiptap('doc-eviction-regression')).toBeUndefined();
    expect(cacheModule.__peekCm('doc-eviction-regression')).toBeUndefined();
  });

  test('recycle() also evicts both caches (used by Try-Again retry path)', async () => {
    const cacheModule = await import('./editor-cache');
    cacheModule.__resetCacheForTests();
    const fakeTipDom = makeFakeNode();
    const fakeCmDom = makeFakeNode();
    const fakeEditor = {
      editorView: { dom: fakeTipDom, scrollDOM: fakeTipDom },
      commands: { focus: mock(() => {}) },
      destroy: mock(() => {}),
    } as unknown as import('@tiptap/core').Editor;
    const fakeView = {
      dom: fakeCmDom,
      scrollDOM: fakeCmDom,
      focus: mock(() => {}),
      destroy: mock(() => {}),
    } as unknown as import('@codemirror/view').EditorView;
    const makeProv = () =>
      ({
        destroy: mock(() => {}),
        document: { destroy: mock(() => {}) } as unknown as import('yjs').Doc,
        awareness: null,
      }) as unknown as import('@hocuspocus/provider').HocuspocusProvider;
    const fakeYDoc = { destroy: mock(() => {}) } as unknown as import('yjs').Doc;
    const fakeYText = { toString: () => '' } as unknown as import('yjs').Text;
    cacheModule.mountTiptapEditor({
      docName: 'doc-recycle-regression',
      container: makeFakeNode() as unknown as HTMLElement,
      factory: () => ({
        editor: fakeEditor,
        ydoc: fakeYDoc,
        ytext: fakeYText,
        provider: makeProv(),
      }),
    });
    cacheModule.mountCmEditor({
      docName: 'doc-recycle-regression',
      container: makeFakeNode() as unknown as HTMLElement,
      factory: () => ({ view: fakeView, ydoc: fakeYDoc, ytext: fakeYText, provider: makeProv() }),
    });

    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('doc-recycle-regression');
    pool.recycle('doc-recycle-regression');

    expect(cacheModule.__peekTiptap('doc-recycle-regression')).toBeUndefined();
    expect(cacheModule.__peekCm('doc-recycle-regression')).toBeUndefined();
  });

  test('dispose() evicts all cached editors across all pool entries', async () => {
    const cacheModule = await import('./editor-cache');
    cacheModule.__resetCacheForTests();
    const makeProv = () =>
      ({
        destroy: mock(() => {}),
        document: { destroy: mock(() => {}) } as unknown as import('yjs').Doc,
        awareness: null,
      }) as unknown as import('@hocuspocus/provider').HocuspocusProvider;
    const makeFakeEditor = () => {
      const dom = makeFakeNode();
      return {
        editorView: { dom, scrollDOM: dom },
        commands: { focus: mock(() => {}) },
        destroy: mock(() => {}),
      } as unknown as import('@tiptap/core').Editor;
    };
    const fakeYText = { toString: () => '' } as unknown as import('yjs').Text;

    cacheModule.mountTiptapEditor({
      docName: 'dispose-a',
      container: makeFakeNode() as unknown as HTMLElement,
      factory: () => ({
        editor: makeFakeEditor(),
        ydoc: { destroy: mock(() => {}) } as unknown as import('yjs').Doc,
        ytext: fakeYText,
        provider: makeProv(),
      }),
    });
    cacheModule.mountTiptapEditor({
      docName: 'dispose-b',
      container: makeFakeNode() as unknown as HTMLElement,
      factory: () => ({
        editor: makeFakeEditor(),
        ydoc: { destroy: mock(() => {}) } as unknown as import('yjs').Doc,
        ytext: fakeYText,
        provider: makeProv(),
      }),
    });

    pool = new ProviderPool(3, DUMMY_WS);
    pool.open('dispose-a');
    pool.open('dispose-b');
    pool.dispose();

    expect(cacheModule.__peekTiptap('dispose-a')).toBeUndefined();
    expect(cacheModule.__peekTiptap('dispose-b')).toBeUndefined();
  });
});
