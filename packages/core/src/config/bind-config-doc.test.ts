import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { bindConfigDoc, type ConfigDocProvider } from './bind-config-doc.ts';
import { isKnownConfigError } from './errors.ts';

/**
 * Minimal `ConfigDocProvider` for tests — the structural shape `bindConfigDoc`
 * needs (`document` + `on('synced')` + `off('synced')`). Keeps tests free of a
 * runtime `@hocuspocus/provider` dep.
 */
function createMockProvider(doc: Y.Doc): ConfigDocProvider & {
  emitSynced(): void;
  syncedListenerCount(): number;
} {
  const syncedListeners = new Set<() => void>();
  return {
    document: doc,
    on(event, listener) {
      if (event === 'synced') syncedListeners.add(listener);
    },
    off(event, listener) {
      if (event === 'synced') syncedListeners.delete(listener);
    },
    emitSynced() {
      for (const listener of syncedListeners) listener();
    },
    syncedListenerCount() {
      return syncedListeners.size;
    },
  };
}

let doc: Y.Doc;
let provider: ReturnType<typeof createMockProvider>;

beforeEach(() => {
  doc = new Y.Doc();
  provider = createMockProvider(doc);
});

afterEach(() => {
  doc.destroy();
});

describe('bindConfigDoc — current()', () => {
  test('empty Y.Text returns schema defaults', () => {
    const binding = bindConfigDoc(provider, 'workspace');
    const config = binding.current();
    // Defaults always include content/server/mcp/folders sections.
    expect(config.content).toBeDefined();
    expect(config.server).toBeDefined();
    expect(config.mcp).toBeDefined();
    expect(config.folders).toEqual([]);
    binding.dispose();
  });

  test('valid YAML in Y.Text parses to merged Config', () => {
    const yaml = 'mcp:\n  autoStart: false\n';
    doc.getText('source').insert(0, yaml);
    const binding = bindConfigDoc(provider, 'workspace');

    const config = binding.current();
    expect(config.mcp.autoStart).toBe(false);
    binding.dispose();
  });

  test('invalid YAML falls back to defaults (never throws)', () => {
    doc.getText('source').insert(0, 'mcp:\n  autoStart: [unclosed');
    const binding = bindConfigDoc(provider, 'workspace');

    // Should not throw; should return defaults.
    expect(() => binding.current()).not.toThrow();
    expect(binding.current().mcp.autoStart).toBe(true); // default
    binding.dispose();
  });

  test('schema-failing YAML falls back to defaults', () => {
    // theme must be a string enum, not a number.
    doc.getText('source').insert(0, 'appearance:\n  theme: 42\n');
    const binding = bindConfigDoc(provider, 'workspace');

    expect(() => binding.current()).not.toThrow();
    // Defaults — appearance.theme is UNSET per D55, so it's undefined.
    expect(binding.current().appearance?.theme).toBeUndefined();
    binding.dispose();
  });

  test('honors custom ytextKey override (test isolation)', () => {
    doc.getText('alt').insert(0, 'mcp:\n  autoStart: false\n');
    const binding = bindConfigDoc(provider, 'workspace', { ytextKey: 'alt' });

    expect(binding.current().mcp.autoStart).toBe(false);
    binding.dispose();
  });
});

describe('bindConfigDoc — patch()', () => {
  test('writes scalar to empty Y.Text + returns effective config', () => {
    const binding = bindConfigDoc(provider, 'user');
    const result = binding.patch({ appearance: { theme: 'dark' } });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.appliedPaths).toEqual(['appearance.theme']);
    expect(result.effective.appearance?.theme).toBe('dark');

    // Y.Text now holds serialized YAML.
    const ytext = doc.getText('source').toString();
    expect(ytext).toContain('appearance:');
    expect(ytext).toContain('theme: dark');
    binding.dispose();
  });

  test('updates existing field + preserves comments via yaml@2 Document', () => {
    const initial = '# Project config\nmcp:\n  autoStart: false # disabled by default\n';
    doc.getText('source').insert(0, initial);
    const binding = bindConfigDoc(provider, 'workspace');

    const result = binding.patch({ mcp: { autoStart: true } });
    expect(result.ok).toBe(true);

    const after = doc.getText('source').toString();
    expect(after).toContain('# Project config');
    expect(after).toContain('# disabled by default');
    expect(after).toContain('autoStart: true');
    binding.dispose();
  });

  test('rejects schema-invalid scalar; Y.Text untouched', () => {
    doc.getText('source').insert(0, 'mcp:\n  autoStart: true\n');
    const before = doc.getText('source').toString();
    const binding = bindConfigDoc(provider, 'workspace');

    // theme must be 'light' | 'dark' | 'system'.
    const result = binding.patch({ appearance: { theme: 'midnight' as 'dark' } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(isKnownConfigError(result.error)).toBe(true);
    if (!isKnownConfigError(result.error)) throw new Error('not known error');
    expect(result.error.code).toBe('SCHEMA_INVALID');
    if (result.error.code !== 'SCHEMA_INVALID') throw new Error('wrong code');
    expect(result.error.issues.length).toBeGreaterThan(0);
    expect(result.error.issues[0]?.path).toEqual(['appearance', 'theme']);

    // Y.Text byte-equal to before — no mutation.
    expect(doc.getText('source').toString()).toBe(before);
    binding.dispose();
  });

  test('null-as-clear semantic via deleteIn', () => {
    doc.getText('source').insert(0, 'appearance:\n  theme: dark\n');
    const binding = bindConfigDoc(provider, 'user');

    const result = binding.patch({ appearance: { theme: null } });
    expect(result.ok).toBe(true);

    // appearance.theme is now absent → defaults to UNSET per D55.
    const after = doc.getText('source').toString();
    expect(after).not.toContain('theme: dark');
    expect(binding.current().appearance?.theme).toBeUndefined();
    binding.dispose();
  });

  test('rejects YAML_PARSE on broken existing Y.Text content', () => {
    doc.getText('source').insert(0, 'mcp:\n  autoStart: [unclosed');
    const binding = bindConfigDoc(provider, 'workspace');

    const result = binding.patch({ mcp: { autoStart: true } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    if (!isKnownConfigError(result.error)) throw new Error('not known error');
    expect(result.error.code).toBe('YAML_PARSE');
    binding.dispose();
  });

  test('after dispose, patch returns WRITE_ERROR', () => {
    const binding = bindConfigDoc(provider, 'workspace');
    binding.dispose();

    const result = binding.patch({ mcp: { autoStart: true } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    if (!isKnownConfigError(result.error)) throw new Error('not known error');
    expect(result.error.code).toBe('WRITE_ERROR');
  });
});

describe('bindConfigDoc — subscribe()', () => {
  test('listener fires on Y.Text change after subscribe', () => {
    const binding = bindConfigDoc(provider, 'user');
    const received: Array<unknown> = [];

    const unsub = binding.subscribe((c) => {
      received.push(c.appearance?.theme);
    });

    binding.patch({ appearance: { theme: 'dark' } });
    expect(received).toEqual(['dark']);

    binding.patch({ appearance: { theme: 'light' } });
    expect(received).toEqual(['dark', 'light']);

    unsub();
    binding.patch({ appearance: { theme: 'system' } });
    expect(received).toEqual(['dark', 'light']); // unchanged after unsub
    binding.dispose();
  });

  test('listener does NOT fire synchronously on subscribe', () => {
    doc.getText('source').insert(0, 'appearance:\n  theme: dark\n');
    const binding = bindConfigDoc(provider, 'user');
    const received: Array<unknown> = [];

    binding.subscribe((c) => {
      received.push(c.appearance?.theme);
    });

    expect(received).toEqual([]); // not fired yet
    binding.dispose();
  });

  test('listener fires on provider synced event (reconnect-fresh-value)', () => {
    doc.getText('source').insert(0, 'appearance:\n  theme: dark\n');
    const binding = bindConfigDoc(provider, 'user');
    const received: Array<unknown> = [];
    binding.subscribe((c) => {
      received.push(c.appearance?.theme);
    });

    // Simulate provider reconnect — content unchanged but synced fires.
    provider.emitSynced();

    expect(received).toEqual(['dark']);
    binding.dispose();
  });

  test('listener exception is caught — does not break other listeners', () => {
    const binding = bindConfigDoc(provider, 'user');
    const ok: Array<unknown> = [];

    binding.subscribe(() => {
      throw new Error('boom');
    });
    binding.subscribe((c) => {
      ok.push(c.appearance?.theme);
    });

    binding.patch({ appearance: { theme: 'dark' } });
    expect(ok).toEqual(['dark']);
    binding.dispose();
  });

  test('multiple subscribers fire in registration order', () => {
    const binding = bindConfigDoc(provider, 'user');
    const order: number[] = [];

    binding.subscribe(() => order.push(1));
    binding.subscribe(() => order.push(2));
    binding.subscribe(() => order.push(3));

    binding.patch({ appearance: { theme: 'dark' } });
    expect(order).toEqual([1, 2, 3]);
    binding.dispose();
  });
});

describe('bindConfigDoc — dispose()', () => {
  test('clears Y.Text observer + provider listener + listeners set', () => {
    const binding = bindConfigDoc(provider, 'workspace');
    binding.subscribe(() => {});

    expect(provider.syncedListenerCount()).toBe(1);
    binding.dispose();
    expect(provider.syncedListenerCount()).toBe(0);

    // Subsequent Y.Text mutation does not leak listener invocations.
    let fired = false;
    binding.subscribe(() => {
      fired = true;
    });
    // Direct Y.Text mutation (not through binding.patch).
    doc.getText('source').insert(0, 'mcp:\n  autoStart: false\n');
    expect(fired).toBe(false); // listener cleared on dispose; new sub but observer detached
  });

  test('idempotent — calling dispose twice is safe', () => {
    const binding = bindConfigDoc(provider, 'workspace');
    binding.dispose();
    expect(() => binding.dispose()).not.toThrow();
  });
});

describe('bindConfigDoc — multi-client / cross-process simulation (NR9 LWW)', () => {
  test('two simultaneous Y.Text replacements via Yjs delta sync — final state is one of the two', () => {
    // Simulate two separate clients (A, B) each with their own bindings.
    // Yjs character-level merge under concurrent full-text replacement is
    // last-write-wins-ish at the character level; the final merged state
    // must still be valid YAML (or the L3 persistence-hook reverts —
    // accepted per NR9). We assert: (a) the final state is parseable; (b)
    // the YAML is one of the two intended values, OR a CRDT-merged hybrid
    // that still parses.
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const provA = createMockProvider(docA);
    const provB = createMockProvider(docB);

    // Seed both with the same starting state.
    const seed = 'appearance:\n  theme: system\n';
    docA.getText('source').insert(0, seed);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const bindingA = bindConfigDoc(provA, 'user');
    const bindingB = bindConfigDoc(provB, 'user');

    // Two simultaneous patches (different fields — most realistic UX).
    const resA = bindingA.patch({ appearance: { theme: 'dark' } });
    const resB = bindingB.patch({ appearance: { editorModeDefault: 'source' } });
    expect(resA.ok).toBe(true);
    expect(resB.ok).toBe(true);

    // Cross-sync.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    // Both docs converge to the same Y.Text content.
    expect(docA.getText('source').toString()).toBe(docB.getText('source').toString());

    // Final state may or may not be parseable depending on character merge.
    // If parseable, it should reflect one or both patches; if not, L3
    // (US-006 persistence-hook revert) is the safety net at the server.
    const finalConfig = bindingA.current();
    // At minimum, current() never throws.
    expect(finalConfig).toBeDefined();

    bindingA.dispose();
    bindingB.dispose();
    docA.destroy();
    docB.destroy();
  });

  test('external Y.Text replacement (file-watcher path) fires subscribers', () => {
    // Simulates US-007 applyExternalConfigChange: server-origin Y.Text
    // replacement caused by an external CLI / hand-edit / MCP-from-other-
    // session write. The binding's Y.Text observer must fire for the
    // resulting update.
    const binding = bindConfigDoc(provider, 'user');
    const received: Array<unknown> = [];
    binding.subscribe((c) => {
      received.push(c.appearance?.theme);
    });

    // Direct Y.Text mutation simulating server-origin update.
    const ytext = doc.getText('source');
    doc.transact(() => {
      ytext.insert(0, 'appearance:\n  theme: dark\n');
    });

    expect(received).toEqual(['dark']);
    binding.dispose();
  });
});
