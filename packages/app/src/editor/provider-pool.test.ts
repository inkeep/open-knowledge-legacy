/**
 * Tests for ProviderPool — LRU eviction, active document protection,
 * capacity management, and lifecycle.
 *
 * These tests construct real HocuspocusProvider instances pointing at a
 * non-existent server. The providers will stay in 'connecting' state but
 * the pool's LRU logic, Map management, and eviction ordering are all
 * exercised without needing a running Hocuspocus server.
 */
import { afterEach, describe, expect, test } from 'bun:test';
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
