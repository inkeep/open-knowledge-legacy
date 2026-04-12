/**
 * Tests for ProviderPool — LRU eviction, active document protection,
 * capacity management, and lifecycle.
 *
 * These tests construct real HocuspocusProvider instances pointing at a
 * non-existent server. The providers will stay in 'connecting' state but
 * the pool's LRU logic, Map management, and eviction ordering are all
 * exercised without needing a running Hocuspocus server.
 */
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { ProviderPool } from './provider-pool';

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
    expect(entry.docName).toBe('doc1');
    expect(entry.provider).toBeDefined();
    expect(pool.has('doc1')).toBe(true);
    expect(pool.entries.size).toBe(1);
  });

  test('open() reuses existing entry for same docName', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const entry1 = pool.open('doc1');
    const entry2 = pool.open('doc1');
    expect(entry1.provider).toBe(entry2.provider);
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

  test('init-time throw in onSynced triggers destroy-and-evict with onChange notification', () => {
    pool = new ProviderPool(3, DUMMY_WS);
    let onChangeCalls = 0;
    pool.setOnChange(() => onChangeCalls++);

    const entry = pool.open('doc1');
    pool.setActive('doc1');
    onChangeCalls = 0; // reset after open + setActive notifications

    // Sabotage the provider's document to force a throw during observer init
    const doc = entry.provider.document;
    doc.getXmlFragment = () => {
      throw new Error('synthetic getXmlFragment failure');
    };

    // Spy on console.error to verify the error is logged (not re-thrown)
    const errorSpy = mock(() => {});
    const origError = console.error;
    console.error = errorSpy;

    // Fire synced manually — this triggers onSynced → try block → doc.getXmlFragment() → throw → catch → console.error
    // Should NOT throw — the error is caught, logged, and the entry is evicted.
    entry.provider.emit('synced', { state: true });

    console.error = origError;

    // Entry should be evicted from the pool
    expect(pool.has('doc1')).toBe(false);
    expect(pool.entries.size).toBe(0);

    // Active document cleared (was the failing entry)
    expect(pool.getActive()).toBeNull();
    expect(pool.getActiveDocName()).toBeNull();

    // onChange was called at least once (from notify() in the catch)
    expect(onChangeCalls).toBeGreaterThanOrEqual(1);

    // Error was logged via console.error with the expected prefix
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = errorSpy.mock.calls[0]?.[0] as string;
    expect(loggedMessage).toContain('[ProviderPool] setupObservers init failed for doc1:');
    expect(loggedMessage).toContain('synthetic getXmlFragment failure');
  });

  test('non-active background doc disconnect triggers debounced destroy without re-open', async () => {
    // Use recycleDebounceMs: 50 for fast test execution
    pool = new ProviderPool(3, DUMMY_WS, 50);
    let onChangeCalls = 0;
    pool.setOnChange(() => onChangeCalls++);

    // Open two docs, only doc1 is active
    const entry1 = pool.open('doc1');
    pool.setActive('doc1');
    const entry2 = pool.open('doc2');
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
    const originalTimer = entry.pendingRecycleTimer;

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
