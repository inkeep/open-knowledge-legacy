/**
 * Context Bridge Store unit tests (CB01, CB02, CB17, CB21, CB22).
 *
 * Tests the pure JS store that underpins the Context Bridge Registry.
 */

import { describe, expect, test } from 'bun:test';
import { createContext } from 'react';
import { type ContextEntry, createContextBridgeStore, getStoreForEditor } from './store';

// Stable test context objects
const TestContextA = createContext<string>('default-a');
const TestContextB = createContext<number>(0);

function makeEntries(value: string): ContextEntry[] {
  return [{ context: TestContextA as React.Context<unknown>, value }];
}

function makeMultiEntries(): ContextEntry[] {
  return [
    { context: TestContextA as React.Context<unknown>, value: 'alpha' },
    { context: TestContextB as React.Context<unknown>, value: 42 },
  ];
}

describe('createContextBridgeStore', () => {
  // CB01: publish → get → unpublish → get
  test('CB01: publish stores entries, get retrieves, unpublish removes', () => {
    const store = createContextBridgeStore();
    const entries = makeEntries('hello');

    // publish
    store.publish('b1', entries);
    expect(store.get('b1')).toBe(entries);

    // unpublish
    store.unpublish('b1');
    expect(store.get('b1')).toBeUndefined();
  });

  test('CB01: get returns undefined for non-existent bridgeId', () => {
    const store = createContextBridgeStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  test('CB01: publish overwrites previous entries for same bridgeId', () => {
    const store = createContextBridgeStore();
    const entries1 = makeEntries('first');
    const entries2 = makeEntries('second');

    store.publish('b1', entries1);
    expect(store.get('b1')).toBe(entries1);

    store.publish('b1', entries2);
    expect(store.get('b1')).toBe(entries2);
  });

  test('CB01: unpublish of non-existent bridgeId is a no-op', () => {
    const store = createContextBridgeStore();
    const v1 = store.getSnapshot();
    store.unpublish('nonexistent');
    expect(store.getSnapshot()).toBe(v1); // version unchanged
  });

  // CB02: subscribe/unsubscribe
  test('CB02: subscribe fires callback on publish and unpublish', () => {
    const store = createContextBridgeStore();
    let callCount = 0;
    const unsub = store.subscribe(() => {
      callCount++;
    });

    store.publish('b1', makeEntries('x'));
    expect(callCount).toBe(1);

    store.unpublish('b1');
    expect(callCount).toBe(2);

    unsub();

    // After unsubscribe, further mutations don't fire
    store.publish('b2', makeEntries('y'));
    expect(callCount).toBe(2);
  });

  test('CB02: multiple subscribers all notified', () => {
    const store = createContextBridgeStore();
    let count1 = 0;
    let count2 = 0;
    const unsub1 = store.subscribe(() => count1++);
    const unsub2 = store.subscribe(() => count2++);

    store.publish('b1', makeEntries('x'));
    expect(count1).toBe(1);
    expect(count2).toBe(1);

    unsub1();
    store.publish('b2', makeEntries('y'));
    expect(count1).toBe(1); // unsubscribed
    expect(count2).toBe(2); // still active

    unsub2();
  });

  // getSnapshot monotonic
  test('getSnapshot increments on every mutation', () => {
    const store = createContextBridgeStore();
    const v0 = store.getSnapshot();

    store.publish('b1', makeEntries('a'));
    const v1 = store.getSnapshot();
    expect(v1).toBeGreaterThan(v0);

    store.publish('b1', makeEntries('b'));
    const v2 = store.getSnapshot();
    expect(v2).toBeGreaterThan(v1);

    store.unpublish('b1');
    const v3 = store.getSnapshot();
    expect(v3).toBeGreaterThan(v2);
  });

  test('getSnapshot does not increment on no-op unpublish', () => {
    const store = createContextBridgeStore();
    const v0 = store.getSnapshot();
    store.unpublish('nothing');
    expect(store.getSnapshot()).toBe(v0);
  });

  // Multiple bridgeIds are independent
  test('multiple bridgeIds are independent', () => {
    const store = createContextBridgeStore();
    const e1 = makeEntries('one');
    const e2 = makeMultiEntries();

    store.publish('b1', e1);
    store.publish('b2', e2);

    expect(store.get('b1')).toBe(e1);
    expect(store.get('b2')).toBe(e2);

    store.unpublish('b1');
    expect(store.get('b1')).toBeUndefined();
    expect(store.get('b2')).toBe(e2); // b2 unaffected
  });

  // CB21 (simplified): publish only on committed renders
  // This tests the store primitive: no publish → no stale entry
  test('CB21: no publish leaves store empty (aborted render pattern)', () => {
    const store = createContextBridgeStore();
    // Simulate: a render started but never committed (no publish called)
    expect(store.get('b1')).toBeUndefined();
    expect(store.getSnapshot()).toBe(0);
  });
});

describe('getStoreForEditor', () => {
  // Create a minimal mock editor for WeakMap keying
  function mockEditor(): import('@tiptap/core').Editor {
    return {} as import('@tiptap/core').Editor;
  }

  test('returns the same store for the same editor', () => {
    const editor = mockEditor();
    const store1 = getStoreForEditor(editor);
    const store2 = getStoreForEditor(editor);
    expect(store1).toBe(store2);
  });

  test('returns different stores for different editors (CB24)', () => {
    const editor1 = mockEditor();
    const editor2 = mockEditor();
    const store1 = getStoreForEditor(editor1);
    const store2 = getStoreForEditor(editor2);
    expect(store1).not.toBe(store2);
  });

  // CB22: WeakMap GC — stores become GC-eligible when editors are destroyed.
  // We can't force GC in tests, but we verify the WeakMap pattern is correct:
  // different editors get different stores, and no global state leaks.
  test('CB22: no global state leaks between editors', () => {
    const editor1 = mockEditor();
    const editor2 = mockEditor();
    const store1 = getStoreForEditor(editor1);
    const store2 = getStoreForEditor(editor2);

    store1.publish('b1', makeEntries('from-editor-1'));
    expect(store1.get('b1')).toBeDefined();
    expect(store2.get('b1')).toBeUndefined(); // completely separate

    store2.publish('b1', makeEntries('from-editor-2'));
    expect(store1.get('b1')?.[0].value).toBe('from-editor-1');
    expect(store2.get('b1')?.[0].value).toBe('from-editor-2');
  });
});
