import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { FrontmatterDocProvider, FrontmatterSnapshot } from './bind-frontmatter-doc.ts';
import { bindFrontmatterDoc, FORM_WRITE_ORIGIN, touchesFmRegion } from './bind-frontmatter-doc.ts';
import { detectFmRegion, MAX_FM_REGION_BYTES, readFmMap } from './frontmatter-region.ts';

function makeProvider(initial = ''): FrontmatterDocProvider & {
  emitSynced: () => void;
} {
  const document = new Y.Doc();
  if (initial) {
    document.getText('source').insert(0, initial);
  }
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

function readYTextFm(provider: FrontmatterDocProvider): string {
  return detectFmRegion(provider.document.getText('source').toString()).fenced;
}

describe('bindFrontmatterDoc — patch()', () => {
  test('valid patch writes the YAML region and reports applied keys', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const result = binding.patch({ title: 'Hello', count: 3, draft: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appliedKeys.sort()).toEqual(['count', 'draft', 'title']);
    }
    const map = readFmMap(provider.document.getText('source').toString());
    expect(map).toEqual({ title: 'Hello', count: 3, draft: true });
  });

  test('null value deletes the key', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', tag: 'a' });

    const result = binding.patch({ tag: null });

    expect(result.ok).toBe(true);
    expect(readFmMap(provider.document.getText('source').toString())).toEqual({ title: 'Hello' });
  });

  test('deleting every key removes the FM fences', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', status: 'draft' });
    expect(readYTextFm(provider)).not.toBe('');

    const result = binding.patch({ title: null, status: null });

    expect(result.ok).toBe(true);
    expect(provider.document.getText('source').toString()).toBe('');
    expect(readYTextFm(provider)).toBe('');
    expect(binding.current().map).toEqual({});
    expect(binding.current().keys).toEqual([]);
  });

  test('updating an existing key does NOT reorder properties (FR2)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', cluster: 'X', tags: ['a'] });

    binding.patch({ title: 'Goodbye' });

    expect(binding.current().keys).toEqual(['title', 'cluster', 'tags']);
  });

  test('new keys append at the end (D15 / FR8)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });
    binding.patch({ status: 'draft' });

    expect(binding.current().keys).toEqual(['title', 'status']);
  });

  test('invalid value returns SCHEMA_INVALID without mutating Y.Text', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });

    const result = binding.patch({ count: { nested: true } as unknown as number });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
    expect(readFmMap(provider.document.getText('source').toString())).toEqual({ title: 'Hello' });
  });

  test('reserved key "frontmatter" is rejected', () => {
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
    expect(readYTextFm(provider)).toBe('');
  });

  test('writes are stamped with FORM_WRITE_ORIGIN', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    let observedOrigin: unknown = null;
    provider.document.getText('source').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    binding.patch({ title: 'Hello' });

    expect(observedOrigin).toBe(FORM_WRITE_ORIGIN);
  });

  test('region exceeding MAX_FM_REGION_BYTES is refused', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);

    const huge = 'x'.repeat(MAX_FM_REGION_BYTES + 1);
    const result = binding.patch({ pad: huge });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues[0]?.issueCode).toBe('region_too_large');
      }
    }
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
    expect(readYTextFm(provider)).toBe('');
  });
});

describe('bindFrontmatterDoc — rename()', () => {
  test('renames in place, preserving order (FR2)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', cluster: 'X', tags: ['a'] });

    const result = binding.rename('cluster', 'group');

    expect(result.ok).toBe(true);
    expect(binding.current().keys).toEqual(['title', 'group', 'tags']);
    expect(binding.current().map).toEqual({ title: 'Hello', group: 'X', tags: ['a'] });
  });

  test('refuses unknown source key', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello' });

    const result = binding.rename('cluster', 'group');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });

  test('refuses target collision when allowDuplicate is false', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', status: 'draft' });

    const result = binding.rename('status', 'title');

    expect(result.ok).toBe(false);
  });

  test('admits duplicate target when allowDuplicate is true (D17/D18)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', status: 'draft' });

    const result = binding.rename('status', 'title', { allowDuplicate: true });

    expect(result.ok).toBe(true);
    expect(binding.current().keys).toEqual(['title', 'title']);
  });
});

describe('bindFrontmatterDoc — reorder()', () => {
  test('reorders to the requested permutation (FR4)', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ a: 1, b: 2, c: 3 });

    const result = binding.reorder(['c', 'a', 'b']);

    expect(result.ok).toBe(true);
    expect(binding.current().keys).toEqual(['c', 'a', 'b']);
    expect(binding.current().map).toEqual({ a: 1, b: 2, c: 3 });
  });

  test('refuses non-permutation list', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ a: 1, b: 2 });

    const result = binding.reorder(['a', 'b', 'c']);

    expect(result.ok).toBe(false);
  });
});

describe('bindFrontmatterDoc — current()', () => {
  test('returns empty snapshot when there is no FM region', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    expect(binding.current()).toEqual({ map: {}, keys: [], parseError: undefined });
  });

  test('reflects the YAML region after writes', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.patch({ title: 'Hello', tags: ['a'] });
    expect(binding.current().map).toEqual({ title: 'Hello', tags: ['a'] });
  });

  test('surfaces parseError when YAML region is malformed', () => {
    const provider = makeProvider('---\n: : : invalid\n---\nbody\n');
    const binding = bindFrontmatterDoc(provider);
    const snapshot = binding.current();
    expect(snapshot.parseError).toBeDefined();
  });

  test('surfaces no parseError when frontmatter has a mixed-scalar array', () => {
    const fixture =
      '---\n' +
      'title: Sample\n' +
      'tags: [travel, spain, barcelona, mallorca, palma, balearics, sailing, 2026]\n' +
      '---\nbody\n';
    const provider = makeProvider(fixture);
    const binding = bindFrontmatterDoc(provider);
    const snapshot = binding.current();
    expect(snapshot.parseError).toBeUndefined();
    expect(snapshot.map.tags).toEqual([
      'travel',
      'spain',
      'barcelona',
      'mallorca',
      'palma',
      'balearics',
      'sailing',
      '2026',
    ]);
  });
});

describe('bindFrontmatterDoc — subscribe()', () => {
  test('listener fires on patch', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    const calls: FrontmatterSnapshot[] = [];
    binding.subscribe((snapshot) => {
      calls.push(snapshot);
    });

    binding.patch({ title: 'Hello' });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.map).toEqual({ title: 'Hello' });
  });

  test('content-equality bailout: body-only edits do not fire (D20)', () => {
    const provider = makeProvider('---\ntitle: Hello\n---\nbody\n');
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    const callsBefore = calls;

    const ytext = provider.document.getText('source');
    ytext.insert(ytext.length, '\nmore body\n');

    expect(calls).toBe(callsBefore);
  });

  test('listener fires on provider synced', () => {
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
  test('removes Y.Text observer + provider listener', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    binding.dispose();

    binding.patch({ title: 'after-dispose' });
    provider.emitSynced();

    expect(calls).toBe(0);
  });

  test('idempotent', () => {
    const provider = makeProvider();
    const binding = bindFrontmatterDoc(provider);
    binding.dispose();
    expect(() => binding.dispose()).not.toThrow();
  });
});

describe('touchesFmRegion — pure delta inspector', () => {
  const event = (delta: Array<{ retain?: number; insert?: string; delete?: number }>) =>
    ({ delta }) as Parameters<typeof touchesFmRegion>[0];

  test('closed FM present: insert inside region triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 5 }, { insert: 'x' }]), 30, false)).toBe(true);
  });

  test('closed FM present: insert past region bails out', () => {
    expect(touchesFmRegion(event([{ retain: 30 }, { insert: 'x' }]), 30, false)).toBe(false);
  });

  test('closed FM present: delete inside region triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 10 }, { delete: 5 }]), 30, false)).toBe(true);
  });

  test('closed FM present: delete past region bails out', () => {
    expect(touchesFmRegion(event([{ retain: 30 }, { delete: 5 }]), 30, false)).toBe(false);
  });

  test('no FM, no open fence: body-only insert bails out (the optimization)', () => {
    expect(touchesFmRegion(event([{ retain: 42 }, { insert: 'x' }]), 0, false)).toBe(false);
  });

  test('no FM, no open fence: insert at byte 0 triggers re-parse', () => {
    expect(touchesFmRegion(event([{ insert: '---\n' }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: insert inside the leading-byte window triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 2 }, { insert: '-' }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: delete at byte 0 triggers re-parse', () => {
    expect(touchesFmRegion(event([{ delete: 3 }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: delete past leading window bails out', () => {
    expect(touchesFmRegion(event([{ retain: 50 }, { delete: 5 }]), 0, false)).toBe(false);
  });

  test('no FM, no open fence: insert at retain=4 (last byte in window) triggers re-parse', () => {
    expect(touchesFmRegion(event([{ retain: 4 }, { insert: 'x' }]), 0, false)).toBe(true);
  });

  test('no FM, no open fence: insert at retain=5 (at threshold) bails out', () => {
    expect(touchesFmRegion(event([{ retain: 5 }, { insert: 'x' }]), 0, false)).toBe(false);
  });

  test('open fence prefix: any edit triggers re-parse (could close the fence)', () => {
    expect(touchesFmRegion(event([{ retain: 100 }, { insert: 'x' }]), 0, true)).toBe(true);
    expect(touchesFmRegion(event([{ retain: 100 }, { delete: 1 }]), 0, true)).toBe(true);
  });

  test('embedded objects in inserts respect the threshold', () => {
    expect(
      touchesFmRegion(
        event([{ retain: 50 }, { insert: { embed: true } as unknown as string }]),
        0,
        false,
      ),
    ).toBe(false);
    expect(
      touchesFmRegion(
        event([{ retain: 2 }, { insert: { embed: true } as unknown as string }]),
        0,
        false,
      ),
    ).toBe(true);
  });
});

describe('bindFrontmatterDoc — no-FM body-edit perf bailout', () => {
  function spyOnYTextToString(ytext: Y.Text): { reads: () => number; restore: () => void } {
    const original = ytext.toString.bind(ytext);
    let count = 0;
    ytext.toString = function spied() {
      count += 1;
      return original();
    } as typeof ytext.toString;
    return {
      reads: () => count,
      restore: () => {
        ytext.toString = original;
      },
    };
  }

  test('body-only edits on a no-FM doc do not call ytext.toString()', () => {
    const provider = makeProvider('plain body content with no frontmatter\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');
    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });

    for (let i = 0; i < 25; i++) {
      ytext.insert(ytext.length, String(i % 10));
    }

    expect(calls).toBe(0);
    expect(spy.reads()).toBe(0);
    spy.restore();
    binding.dispose();
  });

  test('inserting an FM block at byte 0 fires the listener', () => {
    const provider = makeProvider('plain body\n');
    const binding = bindFrontmatterDoc(provider);
    const calls: FrontmatterSnapshot[] = [];
    binding.subscribe((s) => {
      calls.push(s);
    });

    const ytext = provider.document.getText('source');
    ytext.insert(0, '---\ntitle: Hello\n---\n');

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.map).toEqual({ title: 'Hello' });
  });

  test('open fence prefix without closing fence: body edits still re-parse', () => {
    const provider = makeProvider('---\ntitle: Hello\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');
    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });

    ytext.insert(ytext.length, '---\n');

    expect(spy.reads()).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
    expect(binding.current().map).toEqual({ title: 'Hello' });
    spy.restore();
    binding.dispose();
  });

  test('transition no-prefix → open-prefix updates the cached flag', () => {
    const provider = makeProvider('hello\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');

    ytext.insert(0, '---\n');
    expect(binding.current().map).toEqual({});

    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    ytext.insert(ytext.length, '---\n');

    expect(spy.reads()).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
    spy.restore();
    binding.dispose();
  });

  test('transition open-prefix → no-prefix restores bailout', () => {
    const provider = makeProvider('---\nhello\n');
    const binding = bindFrontmatterDoc(provider);
    const ytext = provider.document.getText('source');

    ytext.delete(0, 4);

    const spy = spyOnYTextToString(ytext);
    let calls = 0;
    binding.subscribe(() => {
      calls += 1;
    });
    ytext.insert(ytext.length, 'world');

    expect(spy.reads()).toBe(0);
    expect(calls).toBe(0);
    spy.restore();
    binding.dispose();
  });
});

describe('bindFrontmatterDoc — multi-client convergence', () => {
  test('two clients editing different keys (with shared baseline) converge via Y.Text', () => {
    const providerA = makeProvider();
    const bindingA = bindFrontmatterDoc(providerA);

    bindingA.patch({ title: 'Initial', cluster: 'X' });

    const providerB = makeProvider();
    Y.applyUpdate(providerB.document, Y.encodeStateAsUpdate(providerA.document));
    const bindingB = bindFrontmatterDoc(providerB);

    bindingA.patch({ title: 'Hello' });
    bindingB.patch({ cluster: 'Y' });

    Y.applyUpdate(providerA.document, Y.encodeStateAsUpdate(providerB.document));
    Y.applyUpdate(providerB.document, Y.encodeStateAsUpdate(providerA.document));

    expect(bindingA.current().map).toEqual(bindingB.current().map);

    bindingA.dispose();
    bindingB.dispose();
  });
});
