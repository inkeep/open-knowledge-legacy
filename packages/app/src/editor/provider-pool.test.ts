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
import { randomUUID } from 'node:crypto';
import { parseHocuspocusAuthToken } from '@inkeep/open-knowledge-server';
import { buildAuthToken, ProviderPool } from './provider-pool';
import {
  __resetSyncPromiseCache,
  __syncPromiseCacheSize,
  BridgeSetupError,
  PreSyncDisconnectError,
  syncPromise,
} from './sync-promise';

function uniqueDocName(prefix = 'pp-us003'): string {
  return `${prefix}-${randomUUID()}`;
}

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

  // MECHANISM-ONLY test.
  //
  // This test asserts the pool's internal behavior — "the provider reference is
  // preserved when unsynced local changes exist at disconnect time." It does
  // NOT check whether the resulting Y.Doc is correct after reconnect. Behavior-
  // level coverage (i.e. "does the document content survive a reconnect without
  // duplication or loss?") lives in
  // `packages/app/tests/integration/provider-pool-reconnect.test.ts` under the
  // T4 scenario ("unsynced local changes during disconnect/restart").
  //
  // This disconnect-path "skip recycle on unsynced" is the active mechanism
  // for same-network-same-server blips. The authenticationFailed recycle is
  // the path that fires on server-instance mismatch, where client-side
  // buffer-and-replay (computeUnsyncedUpdate → clearData → recycle → replay)
  // carries unsynced edits across the new provider. The two paths compose.
  // A green mechanism test here is necessary-but-not-sufficient for T4.
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

  // MECHANISM-ONLY test.
  //
  // This test asserts the debounce timer is cancelled when the provider
  // reconnects (emits `synced` before `RECYCLE_DEBOUNCE_MS` fires). It does
  // NOT check whether the resulting Y.Doc content is correct after reconnect.
  //
  // Behavior-level coverage of the same code path lives in
  // `packages/app/tests/integration/provider-pool-reconnect.test.ts` under
  // the T1 scenario ("fast server restart <4s"). With the CRDT restart-
  // recovery fix landed (see `reports/crdt-server-restart-recovery/REPORT.md`),
  // T1 PASSES — the authenticationFailed recycle fires on instance-ID
  // mismatch even when this disconnect-path debounce is cancelled, forcing
  // the fresh Y.Doc that prevents duplication. This mechanism test remains
  // load-bearing for the same-server network-blip UX — a green state here
  // is necessary-but-not-sufficient for T1.
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

// ---------------------------------------------------------------------------
// MECHANISM-ONLY tests for `buildAuthToken` + `setExpectedServerInstanceId`
// (US-001 / Commit 3 in the CRDT server-restart recovery plan).
//
// These tests assert the token-shape the pool will send to the server when
// `cachedServerInstanceId` is set vs. null. They do NOT verify that a
// stale-client reconnect after a server restart correctly recycles and
// produces a duplication-free Y.Doc — that end-to-end behavior is covered by
// the 11 bug-class integration tests under `packages/app/tests/integration/`
// (T1, T2, T6, T9 flip from FAIL→PASS at Commit 4; T4, T10 at Commit 6).
//
// "Green mechanism ≠ green feature" per /tdd: a passing buildAuthToken test
// here does NOT imply the server-restart-recovery fix is working. Trust the
// integration suite to judge behavior correctness.
// ---------------------------------------------------------------------------
describe('buildAuthToken (MECHANISM-ONLY — CRDT restart recovery / US-001)', () => {
  test('returns undefined when both identity and instance ID are absent', () => {
    expect(buildAuthToken(null, null)).toBeUndefined();
  });

  test('includes expectedServerInstanceId when the cache is set', () => {
    const tabId = { principalId: 'p-1', tabSessionId: 's-1' };
    const token = buildAuthToken(tabId, 'server-instance-abc');
    expect(token).toBeDefined();
    const parsed = parseHocuspocusAuthToken(token as string);
    if (!parsed) throw new Error('expected valid token');
    expect(parsed.principalId).toBe('p-1');
    expect(parsed.tabSessionId).toBe('s-1');
    expect(parsed.expectedServerInstanceId).toBe('server-instance-abc');
  });

  test('omits expectedServerInstanceId when the cache is null', () => {
    const tabId = { principalId: 'p-1', tabSessionId: 's-1' };
    const token = buildAuthToken(tabId, null);
    expect(token).toBeDefined();
    const parsed = parseHocuspocusAuthToken(token as string);
    if (!parsed) throw new Error('expected valid token');
    expect(parsed.expectedServerInstanceId).toBeUndefined();
    expect(parsed.principalId).toBe('p-1');
    expect(parsed.tabSessionId).toBe('s-1');
  });

  test('empty-string instance ID is treated as absent (not claimed)', () => {
    const tabId = { principalId: 'p-1', tabSessionId: 's-1' };
    const token = buildAuthToken(tabId, '');
    expect(token).toBeDefined();
    const parsed = parseHocuspocusAuthToken(token as string);
    if (!parsed) throw new Error('expected valid token');
    expect(parsed.expectedServerInstanceId).toBeUndefined();
  });

  test('instance-ID-only claim (no tab identity) still serializes cleanly', () => {
    const token = buildAuthToken(null, 'server-instance-abc');
    expect(token).toBeDefined();
    const parsed = parseHocuspocusAuthToken(token as string);
    if (!parsed) throw new Error('expected valid token');
    expect(parsed.expectedServerInstanceId).toBe('server-instance-abc');
    expect(parsed.principalId).toBeUndefined();
    expect(parsed.tabSessionId).toBeUndefined();
  });
});

describe('ProviderPool server-instance-ID claim (US-001)', () => {
  test('token serialized on open() reflects setExpectedServerInstanceId', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setTabIdentity({ principalId: 'p-1', tabSessionId: 's-1' });
    pool.setExpectedServerInstanceId('server-instance-xyz');

    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    // HocuspocusProvider resolves `token` lazily (it can be a string, a
    // function, or a Promise). The pool passes a string, so the resolved
    // configuration.token should be exactly the JSON we serialized.
    const resolved = entry.provider.configuration.token as unknown;
    expect(typeof resolved).toBe('string');
    const parsed = parseHocuspocusAuthToken(resolved as string);
    if (!parsed) throw new Error('expected valid token');
    expect(parsed.expectedServerInstanceId).toBe('server-instance-xyz');
    expect(parsed.principalId).toBe('p-1');
    expect(parsed.tabSessionId).toBe('s-1');
  });

  test('token omits expectedServerInstanceId when the cache is null', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setTabIdentity({ principalId: 'p-1', tabSessionId: 's-1' });
    // No setExpectedServerInstanceId call — cache stays null.

    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    const resolved = entry.provider.configuration.token as unknown;
    expect(typeof resolved).toBe('string');
    const parsed = parseHocuspocusAuthToken(resolved as string);
    if (!parsed) throw new Error('expected valid token');
    expect(parsed.expectedServerInstanceId).toBeUndefined();
  });

  test('setExpectedServerInstanceId(null) clears a previously-set cache', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setTabIdentity({ principalId: 'p-1', tabSessionId: 's-1' });
    pool.setExpectedServerInstanceId('server-instance-xyz');
    pool.setExpectedServerInstanceId(null);

    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    const resolved = entry.provider.configuration.token as unknown;
    const parsed = parseHocuspocusAuthToken(resolved as string);
    if (!parsed) throw new Error('expected valid token');
    expect(parsed.expectedServerInstanceId).toBeUndefined();
  });

  test('setExpectedServerInstanceId affects future opens, not existing providers', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setTabIdentity({ principalId: 'p-1', tabSessionId: 's-1' });

    // Open BEFORE setting the instance ID — first provider has no claim.
    const entry1 = pool.open('doc1');
    if (!entry1) throw new Error('expected entry1');

    pool.setExpectedServerInstanceId('server-instance-xyz');

    // Open AFTER — second provider carries the claim.
    const entry2 = pool.open('doc2');
    if (!entry2) throw new Error('expected entry2');

    const tok1 = parseHocuspocusAuthToken(entry1.provider.configuration.token as string);
    const tok2 = parseHocuspocusAuthToken(entry2.provider.configuration.token as string);
    if (!tok1 || !tok2) throw new Error('expected valid tokens');
    expect(tok1.expectedServerInstanceId).toBeUndefined();
    expect(tok2.expectedServerInstanceId).toBe('server-instance-xyz');
  });
});

// ---------------------------------------------------------------------------
// MECHANISM-ONLY tests for `authenticationFailed` → recycle-all wiring
// (US-002 / Commit 4). These assert the pool's response to the specific
// rejection reason; they do NOT verify that a real server restart produces a
// duplication-free Y.Doc. That end-to-end behavior is covered by T1, T2, T6,
// T9 in the integration test suite.
// ---------------------------------------------------------------------------
describe("ProviderPool authenticationFailed handling (US-002 / 'server-instance-mismatch')", () => {
  // Shape 2+ note: the recycle path is now async — it awaits
  // `persistence.clearData()` on every entry BEFORE destroying providers
  // so the fresh providers hydrate empty IDB (the load-bearing ordering
  // that prevents the content-duplication bug class). Tests below wait a
  // short real-time tick so fake-indexeddb's `deleteDatabase` can complete
  // before the recycled state is asserted.

  test("reason 'server-instance-mismatch' recycles every pool entry", async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setExpectedServerInstanceId('server-old');

    const e1 = pool.open('doc1');
    const e2 = pool.open('doc2');
    const e3 = pool.open('doc3');
    if (!e1 || !e2 || !e3) throw new Error('expected entries');
    pool.setActive('doc1');
    const originalProvider = e1.provider;

    // Simulate the server's reject on the active doc's provider.
    e1.provider.emit('authenticationFailed', { reason: 'server-instance-mismatch' });
    await new Promise((r) => setTimeout(r, 50));

    // Active doc re-opens with a fresh provider (preserving activeDocName);
    // non-active docs are destroyed — the user navigating to them later
    // will get a fresh provider on next open(), which is exactly what we
    // want (no stale Y.Doc from the prior server incarnation ever merges
    // with fresh server state).
    expect(pool.has('doc1')).toBe(true);
    expect(pool.has('doc2')).toBe(false);
    expect(pool.has('doc3')).toBe(false);
    const postE1 = pool.entries.get('doc1');
    expect(postE1?.provider).not.toBe(originalProvider);
    expect(pool.getActiveDocName()).toBe('doc1');
  });

  test("reason 'server-instance-mismatch' nulls the cached instance ID", async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setExpectedServerInstanceId('server-old');
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    entry.provider.emit('authenticationFailed', { reason: 'server-instance-mismatch' });
    await new Promise((r) => setTimeout(r, 50));

    // The re-opened provider's token must NOT carry the old claim — that's
    // the whole point of the recycle. HocuspocusProvider defaults token to
    // `null` when not passed, so we accept null OR undefined; the only
    // failure mode is a string containing the stale serverInstanceId.
    const replaced = pool.entries.get('doc1');
    if (!replaced) throw new Error('expected replaced entry');
    const resolved = replaced.provider.configuration.token;
    if (typeof resolved === 'string') {
      const parsed = parseHocuspocusAuthToken(resolved);
      expect(parsed?.expectedServerInstanceId).toBeUndefined();
    }
    // Re-seeding via the post-mismatch boot would only happen via a fresh
    // GET /api/server-info in prod — this is mechanism, not that flow.
  });

  test('other reasons do not trigger recycle', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setExpectedServerInstanceId('server-old');
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');
    const originalProvider = entry.provider;

    entry.provider.emit('authenticationFailed', { reason: 'permission-denied' });

    expect(pool.getActive()?.provider).toBe(originalProvider);
    // Cache is preserved for other reasons.
    const resolved = originalProvider.configuration.token as unknown;
    expect(resolved).toBeDefined();
  });

  test('second mismatch event is a no-op after cache is cleared (idempotence)', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setExpectedServerInstanceId('server-old');
    const entry = pool.open('doc1');
    if (!entry) throw new Error('expected entry');
    pool.setActive('doc1');

    entry.provider.emit('authenticationFailed', { reason: 'server-instance-mismatch' });
    await new Promise((r) => setTimeout(r, 50));
    const postFirstEntry = pool.entries.get('doc1');
    if (!postFirstEntry) throw new Error('expected post-first entry');
    const postFirstProvider = postFirstEntry.provider;

    // A stale sibling's event arriving after cache is null must not churn.
    postFirstProvider.emit('authenticationFailed', { reason: 'server-instance-mismatch' });
    await new Promise((r) => setTimeout(r, 50));
    const postSecond = pool.entries.get('doc1');
    expect(postSecond?.provider).toBe(postFirstProvider);
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

// ---------------------------------------------------------------------------
// MECHANISM-ONLY tests for client-side y-indexeddb persistence wiring
// (US-003 / Shape 2+). These assert that every open() entry gets a
// ClientPersistenceProvider and that destruction order is persistence-before-
// provider across every teardown path (close, recycleDisconnectedEntry,
// evictLru, dispose). They do NOT assert buffer-and-replay — that wires in
// US-004 via the authenticationFailed handler, covered by an integration
// test against a real Hocuspocus server.
//
// Uses unique doc names per test (randomUUID) so fake-indexeddb state from a
// prior test doesn't leak across cases — different docNames map to different
// IDB databases (named `ok-ydoc:${docName}`).
// ---------------------------------------------------------------------------
describe('ProviderPool client-persistence attachment (US-003)', () => {
  test('open() attaches a ClientPersistenceProvider to the pool entry', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const docName = uniqueDocName();
    const entry = pool.open(docName);
    if (!entry) throw new Error('expected entry');
    expect(entry.persistence).not.toBeNull();
    const persistence = entry.persistence;
    if (!persistence) throw new Error('expected persistence');
    expect(typeof persistence.destroy).toBe('function');
    expect(typeof persistence.clearData).toBe('function');
  });

  test('re-opening the same docName reuses the existing persistence instance', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const docName = uniqueDocName();
    const entry1 = pool.open(docName);
    const persistence1 = entry1?.persistence;
    const entry2 = pool.open(docName);
    expect(entry2?.persistence).toBe(persistence1);
  });

  test('prewarm() also attaches a persistence instance', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const docName = uniqueDocName('pp-prewarm');
    const entry = pool.prewarm(docName);
    if (!entry) throw new Error('expected prewarmed entry');
    expect(entry.persistence).not.toBeNull();
  });

  test('close() destroys the persistence before the provider', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const docName = uniqueDocName('pp-close');
    const entry = pool.open(docName);
    if (!entry?.persistence) throw new Error('expected persistence');

    const order: string[] = [];
    const persistenceSpy = mock(async () => {
      order.push('persistence');
    });
    entry.persistence.destroy = persistenceSpy;

    const origProviderDestroy = entry.provider.destroy.bind(entry.provider);
    entry.provider.destroy = (() => {
      order.push('provider');
      origProviderDestroy();
    }) as typeof entry.provider.destroy;

    pool.close(docName);

    expect(persistenceSpy).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('persistence');
    expect(order[1]).toBe('provider');
  });

  test('recycleDisconnectedEntry destroys the persistence before the provider', async () => {
    pool = new ProviderPool(3, DUMMY_WS, 50);
    const docName = uniqueDocName('pp-recycle');
    const entry = pool.open(docName);
    if (!entry?.persistence) throw new Error('expected persistence');
    pool.setActive(docName);
    // Skip setupObservers when the recycle path re-opens (we aren't testing it)
    entry.observerCleanup = () => {};

    const order: string[] = [];
    const persistenceSpy = mock(async () => {
      order.push('persistence');
    });
    entry.persistence.destroy = persistenceSpy;

    const origProviderDestroy = entry.provider.destroy.bind(entry.provider);
    entry.provider.destroy = (() => {
      order.push('provider');
      origProviderDestroy();
    }) as typeof entry.provider.destroy;

    entry.hasSynced = true;
    entry.syncState = 'synced';
    entry.provider.unsyncedChanges = 0;
    entry.provider.emit('disconnect', {
      event: { code: 1006, reason: 'server restart', wasClean: false },
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(persistenceSpy).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('persistence');
    expect(order[1]).toBe('provider');
  });

  test('evictLru destroys the persistence on the evicted entry', () => {
    pool = new ProviderPool(2, DUMMY_WS);
    const doc1 = uniqueDocName('pp-evict');
    const doc2 = uniqueDocName('pp-evict');
    const doc3 = uniqueDocName('pp-evict');
    pool.open(doc1);
    pool.setActive(doc1);
    const entry2 = pool.open(doc2);
    if (!entry2?.persistence) throw new Error('expected persistence on doc2');

    const destroySpy = mock(async () => {});
    entry2.persistence.destroy = destroySpy;

    // Opening doc3 at capacity evicts doc2 (doc1 is active + protected)
    pool.open(doc3);

    expect(pool.has(doc2)).toBe(false);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  test('dispose() destroys every pool entry’s persistence', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const doc1 = uniqueDocName('pp-dispose');
    const doc2 = uniqueDocName('pp-dispose');
    const e1 = pool.open(doc1);
    const e2 = pool.open(doc2);
    if (!e1?.persistence || !e2?.persistence) throw new Error('expected persistences');

    const spy1 = mock(async () => {});
    const spy2 = mock(async () => {});
    e1.persistence.destroy = spy1;
    e2.persistence.destroy = spy2;

    pool.dispose();

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  test('server-instance-mismatch calls clearData on every entry before destroying', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    pool.setExpectedServerInstanceId('server-old');
    const doc1 = uniqueDocName('pp-mismatch');
    const doc2 = uniqueDocName('pp-mismatch');
    const e1 = pool.open(doc1);
    const e2 = pool.open(doc2);
    if (!e1?.persistence || !e2?.persistence) throw new Error('expected persistences');
    pool.setActive(doc1);
    e1.observerCleanup = () => {};

    const clearSpy1 = mock(async () => {});
    const clearSpy2 = mock(async () => {});
    e1.persistence.clearData = clearSpy1;
    e2.persistence.clearData = clearSpy2;

    // server-instance-mismatch: buffer → clearData every entry → recycle
    e1.provider.emit('authenticationFailed', { reason: 'server-instance-mismatch' });
    await new Promise((r) => setTimeout(r, 50));

    expect(clearSpy1).toHaveBeenCalledTimes(1);
    expect(clearSpy2).toHaveBeenCalledTimes(1);
    // Non-active doc2 is gone; active doc1 is re-opened with a fresh provider.
    expect(pool.has(doc2)).toBe(false);
    expect(pool.has(doc1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MECHANISM-ONLY tests for buffer-and-replay (US-004 / Shape 2+). These
// assert the state-vector capture + TAB_REPLAY_ORIGIN path. The end-to-end
// behavior (burst survives mismatch-recycle) is covered by the T12
// integration test in `packages/app/tests/integration/`.
// ---------------------------------------------------------------------------
describe('ProviderPool buffer-and-replay (US-004)', () => {
  test('captures the last server-synced state vector on every synced event', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry = pool.open(uniqueDocName('pp-sv'));
    if (!entry) throw new Error('expected entry');
    // Pre-set observerCleanup so onSynced skips setupObservers
    entry.observerCleanup = () => {};
    expect(entry.lastServerSyncedSV).toBeNull();

    entry.provider.emit('synced', { state: true });
    expect(entry.lastServerSyncedSV).toBeInstanceOf(Uint8Array);
  });

  test('TAB_REPLAY_ORIGIN is a stable frozen object', async () => {
    const mod = await import('./provider-pool');
    expect(mod.TAB_REPLAY_ORIGIN.kind).toBe('tab-replay');
    expect(Object.isFrozen(mod.TAB_REPLAY_ORIGIN)).toBe(true);
  });
});
