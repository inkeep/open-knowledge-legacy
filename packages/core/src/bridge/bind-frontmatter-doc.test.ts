/**
 * Unit tests for `bindFrontmatterDoc` — L1 client-side validation,
 * Y.Map('metadata') write semantics, subscribe/dispose lifecycle.
 *
 * Mirrors `bind-config-doc.test.ts` posture: tests run against a bare Y.Doc
 * with a minimal `FrontmatterDocProvider` mock, no Hocuspocus server needed.
 */

import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { FrontmatterDocProvider } from './bind-frontmatter-doc.ts';
import { bindFrontmatterDoc, FORM_WRITE_ORIGIN } from './bind-frontmatter-doc.ts';
import { getFrontmatterMap } from './frontmatter-y.ts';

function makeProvider(): FrontmatterDocProvider & {
  emitSynced: () => void;
} {
  const document = new Y.Doc();
  const handlers = new Set<() => void>();
  return {
    document,
    on(event, listener) {
      if (event === 'synced') handlers.add(listener);
    },
    off(event, listener) {
      if (event === 'synced') handlers.delete(listener);
    },
    emitSynced() {
      for (const h of handlers) h();
    },
  };
}

describe('bindFrontmatterDoc — patch()', () => {
  test('valid patch writes per-key entries and reports applied keys', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patch({ title: 'Hello', count: 3, draft: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appliedKeys.sort()).toEqual(['count', 'draft', 'title']);
    }
    const map = getFrontmatterMap(provider.document);
    expect(map).toEqual({ title: 'Hello', count: 3, draft: true });
  });

  test('null value deletes the key', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', tag: 'a' });

    const result = binding.patch({ tag: null });

    expect(result.ok).toBe(true);
    expect(getFrontmatterMap(provider.document)).toEqual({ title: 'Hello' });
  });

  test('invalid value returns SCHEMA_INVALID and does not mutate metaMap', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });

    // Object value is not a valid FrontmatterValue (string/number/boolean/string[])
    const result = binding.patch({ count: { nested: true } as unknown as number });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
    // metaMap unchanged — title is still there, count was not added
    expect(getFrontmatterMap(provider.document)).toEqual({ title: 'Hello' });
  });

  test('reserved key "frontmatter" is rejected without mutation', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patch({ frontmatter: 'bypass attempt' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues[0]?.path).toEqual(['frontmatter']);
        expect(result.error.issues[0]?.issueCode).toBe('reserved_key');
      }
    }
    // metaMap stays empty
    expect(getFrontmatterMap(provider.document)).toEqual({});
  });

  test('writes are stamped with FORM_WRITE_ORIGIN', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    let observedOrigin: unknown = null;
    provider.document.getMap('metadata').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    binding.patch({ title: 'Hello' });

    // The frozen origin object identity reaches the observer because the
    // transact runs in-process (no Hocuspocus wire serialization here).
    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
  });

  test('list of strings round-trips', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patch({ tags: ['a', 'b', 'c'] });

    expect(result.ok).toBe(true);
    expect(getFrontmatterMap(provider.document)).toEqual({ tags: ['a', 'b', 'c'] });
  });

  test('disposed binding rejects further patches', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.dispose();

    const result = binding.patch({ title: 'Hello' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_ERROR');
    }
    expect(getFrontmatterMap(provider.document)).toEqual({});
  });
});

describe('bindFrontmatterDoc — current()', () => {
  test('returns empty map when doc has no per-key entries', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    expect(binding.current()).toEqual({});
  });

  test('reflects per-key state after writes', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', tags: ['a'] });
    expect(binding.current()).toEqual({ title: 'Hello', tags: ['a'] });
  });
});

describe('bindFrontmatterDoc — subscribe()', () => {
  test('listener fires on metaMap change', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    const calls: Array<Record<string, unknown>> = [];
    binding.subscribe((map) => {
      calls.push({ ...map });
    });

    binding.patch({ title: 'Hello' });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)).toEqual({ title: 'Hello' });
  });

  test('listener fires on provider synced even when no delta', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });

    provider.emitSynced();

    expect(calls).toBe(1);
  });

  test('unsubscribe stops further fires', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    const unsub = binding.subscribe(() => {
      calls += 1;
    });

    binding.patch({ title: 'A' });
    const before = calls;
    unsub();
    binding.patch({ title: 'B' });

    expect(calls).toBe(before);
  });
});

describe('bindFrontmatterDoc — dispose()', () => {
  test('removes deep observer + provider listener', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    binding.dispose();

    binding.patch({ title: 'after-dispose' }); // returns WRITE_ERROR; no fire
    provider.emitSynced(); // listener was off()'d — no fire

    expect(calls).toBe(0);
  });

  test('idempotent', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.dispose();
    expect(() => binding.dispose()).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────
// AC-Q4: multi-client concurrent same-key writes converge to last-wins.
//
// Simulates two clients independently writing different values to the
// same key, then exchanging Y.js updates peer-to-peer. The new CRDT-direct
// path adds a `FORM_WRITE_ORIGIN` and an L3 server-side hook that runs on
// every store. This test pins the underlying Y.Map LWW guarantee through
// the binding's public API: post-merge, both docs see the same value, and
// it is one of the two written values (not a corrupted state).
// ────────────────────────────────────────────────────────────────────────
describe('bindFrontmatterDoc — concurrent same-key convergence (AC-Q4)', () => {
  test('two clients write the same key concurrently → both converge to the same value', () => {
    const providerA = makeProvider();
    const providerB = makeProvider();
    const bindingA = bindFrontmatterDoc(providerA);
    const bindingB = bindFrontmatterDoc(providerB);

    // Establish a shared baseline: both clients have the same starting state.
    const baseline = Y.encodeStateAsUpdate(providerA.document);
    Y.applyUpdate(providerB.document, baseline);

    // Concurrent writes to the SAME key, on disjoint docs (no sync yet).
    bindingA.patch({ status: 'draft' });
    bindingB.patch({ status: 'published' });

    // Pre-merge: each client sees its own write.
    expect(bindingA.current()).toEqual({ status: 'draft' });
    expect(bindingB.current()).toEqual({ status: 'published' });

    // Exchange updates peer-to-peer (mirrors what a Hocuspocus relay would do).
    const updateA = Y.encodeStateAsUpdate(providerA.document);
    const updateB = Y.encodeStateAsUpdate(providerB.document);
    Y.applyUpdate(providerA.document, updateB);
    Y.applyUpdate(providerB.document, updateA);

    // Convergence: both clients agree on the same final value (LWW per key).
    const finalA = bindingA.current();
    const finalB = bindingB.current();
    expect(finalA).toEqual(finalB);
    expect(finalA.status).toBeDefined();
    // The winning value is one of the two — Y.Map LWW guarantees neither
    // corruption nor loss of the underlying contract.
    expect(['draft', 'published']).toContain(finalA.status);

    bindingA.dispose();
    bindingB.dispose();
  });

  test('two clients write different keys concurrently → both keys present after merge', () => {
    const providerA = makeProvider();
    const providerB = makeProvider();
    const bindingA = bindFrontmatterDoc(providerA);
    const bindingB = bindFrontmatterDoc(providerB);

    const baseline = Y.encodeStateAsUpdate(providerA.document);
    Y.applyUpdate(providerB.document, baseline);

    bindingA.patch({ title: 'Hello' });
    bindingB.patch({ tags: ['alpha', 'beta'] });

    Y.applyUpdate(providerA.document, Y.encodeStateAsUpdate(providerB.document));
    Y.applyUpdate(providerB.document, Y.encodeStateAsUpdate(providerA.document));

    // Field-level CRDT merge: both writes survive.
    expect(bindingA.current()).toEqual({ title: 'Hello', tags: ['alpha', 'beta'] });
    expect(bindingB.current()).toEqual({ title: 'Hello', tags: ['alpha', 'beta'] });

    bindingA.dispose();
    bindingB.dispose();
  });
});
