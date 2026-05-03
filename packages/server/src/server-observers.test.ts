import { describe, expect, test } from 'bun:test';
import type { LocalTransactionOrigin } from '@hocuspocus/server';
import {
  MarkdownManager,
  normalizeBridge,
  readFmMap,
  sharedExtensions,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { AGENT_WRITE_ORIGIN } from './agent-sessions.ts';
import { MANAGED_RENAME_ORIGIN, ROLLBACK_ORIGIN } from './api-extension.ts';
import { FILE_WATCHER_ORIGIN } from './external-change.ts';
import { getMetrics } from './metrics.ts';
import {
  OBSERVER_SYNC_ORIGIN,
  type ObserverDispatchKind,
  type SetupServerObserversOpts,
  setupServerObservers,
  shouldRethrowBridgeMergeLoss,
} from './server-observers.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

function createDispatchRecorder() {
  const dispatches: ObserverDispatchKind[] = [];
  const onDispatch = (kind: ObserverDispatchKind): void => {
    dispatches.push(kind);
  };
  return { dispatches, onDispatch };
}

function createTestDoc() {
  const doc = new Y.Doc();
  const xmlFragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const recorder = createDispatchRecorder();
  return { doc, xmlFragment, ytext, recorder };
}

function setupOpts(
  overrides: Partial<SetupServerObserversOpts> & {
    doc: Y.Doc;
    xmlFragment: Y.XmlFragment;
    ytext: Y.Text;
    recorder: ReturnType<typeof createDispatchRecorder>;
  },
): SetupServerObserversOpts {
  const { recorder, ...rest } = overrides;
  return {
    mdManager,
    schema,
    onDispatch: recorder.onDispatch,
    ...rest,
  };
}

function populateFragment(doc: Y.Doc, xmlFragment: Y.XmlFragment, md: string): void {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, xmlFragment, pmNode, meta);
}

describe('Server Observer A — XmlFragment → Y.Text', () => {
  test('Observer A settles synchronously after each transact; multiple rapid edits each fire once', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    populateFragment(doc, xmlFragment, '# First\n');
    populateFragment(doc, xmlFragment, '# First\n\nSecond\n');
    populateFragment(doc, xmlFragment, '# First\n\nSecond\n\nThird\n');

    const userDispatches = recorder.dispatches.filter((k) => k !== 'none');
    expect(userDispatches).toEqual(['a', 'a', 'a']);
    expect(writeCount).toBe(3);
    expect(ytext.toString()).toContain('Third');

    cleanup();
  });

  test('Path A: uses diffLines when Y.Text matches baseline', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    populateFragment(doc, xmlFragment, '# Hello\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    expect(ytext.toString()).toContain('Hello');

    populateFragment(doc, xmlFragment, '# Hello\n\nNew paragraph\n');

    expect(ytext.toString()).toContain('New paragraph');

    cleanup();
  });

  test('Path B: uses DMP three-way merge when Y.Text diverged from baseline', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    populateFragment(doc, xmlFragment, '# Hello\n\nOriginal\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    doc.transact(() => {
      const text = ytext.toString();
      ytext.insert(text.length, '\nAgent addition\n');
    }, OBSERVER_SYNC_ORIGIN);

    populateFragment(doc, xmlFragment, '# Hello\n\nOriginal\n\nUser edit\n');

    const result = ytext.toString();
    expect(result).toContain('Agent addition');
    expect(result).toContain('User edit');

    cleanup();
  });

  test('already-in-sync gate: when Y.Text matches XmlFragment, no observer write', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    const content = '# Paired\n\nContent\n';
    doc.transact(() => {
      populateFragment(doc, xmlFragment, content);
      ytext.delete(0, ytext.length);
      ytext.insert(0, content);
    });

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    populateFragment(doc, xmlFragment, content);
    expect(writeCount).toBe(0);

    cleanup();
  });
});

describe('Server Observer B — Y.Text → XmlFragment', () => {
  test('each Y.Text transact fires Observer B once, producing expected XmlFragment content', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    doc.transact(() => {
      ytext.insert(0, '# Title\n');
    });
    doc.transact(() => {
      ytext.insert(ytext.length, '\nParagraph\n');
    });
    doc.transact(() => {
      ytext.insert(ytext.length, '\nMore\n');
    });

    const userDispatches = recorder.dispatches.filter((k) => k !== 'none');
    expect(userDispatches).toEqual(['b', 'b', 'b']);
    expect(writeCount).toBe(3);

    const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
    const body = mdManager.serialize(json);
    expect(body).toContain('Title');
    expect(body).toContain('Paragraph');
    expect(body).toContain('More');

    cleanup();
  });

  test('frontmatter: Observer B leaves the YAML region of Y.Text intact (Y.Text IS the FM source — D8)', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '---\ntitle: My Page\n---\n\n# Hello\n\nWorld\n');
    });

    expect(stripFrontmatter(ytext.toString()).frontmatter).toBe('---\ntitle: My Page\n---\n');
    expect(readFmMap(ytext.toString())).toEqual({ title: 'My Page' });

    cleanup();
  });

  test('frontmatter: post-load Y.Text carries FM + body verbatim (D8 — Y.Text IS the FM source)', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    populateFragment(doc, xmlFragment, '# Hello\n\nContent\n');
    doc.transact(() => {
      ytext.insert(0, '---\ntitle: Test\n---\n# Hello\n\nContent\n');
    });

    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    expect(ytext.toString()).toContain('---\ntitle: Test\n---\n');
    expect(ytext.toString()).toContain('Hello');

    cleanup();
  });

  test('early-exit: XmlFragment unchanged when Y.Text body already matches', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    populateFragment(doc, xmlFragment, '# Hello\n');
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    const serializedBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );

    doc.transact(() => {
      ytext.insert(ytext.length, ' ');
      ytext.delete(ytext.length - 1, 1);
    });

    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toBe(serializedBody);

    cleanup();
  });

  test('canonicalization preserves literal bracket text in Y.Text', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    doc.transact(() => {
      ytext.insert(0, '[[Page\n');
    });

    expect(ytext.toString()).not.toContain('\\[');
    expect(normalizeBridge(ytext.toString())).toBe('[[Page');
    expect(
      normalizeBridge(
        mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
      ),
    ).toBe('[[Page');

    cleanup();
  });

  test('canonicalization preserves empty-label inline links in Y.Text', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    doc.transact(() => {
      ytext.insert(0, 'see []() and [](x)\n');
    });

    expect(ytext.toString()).toBe('see []() and [](x)\n');
    expect(
      normalizeBridge(
        mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
      ),
    ).toBe('see []() and [](x)');

    cleanup();
  });

  test('canonicalization preserves trailing backslash text in Y.Text', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));
    const triple = '\\'.repeat(3);

    doc.transact(() => {
      ytext.insert(0, `text ${triple}\n`);
    });

    expect(ytext.toString()).toBe(`text ${triple}\n`);
    expect(
      normalizeBridge(
        mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
      ),
    ).toBe(`text ${triple}`);

    cleanup();
  });
});

describe('Origin-guard truth table (§7d)', () => {
  test('OBSERVER_SYNC_ORIGIN self-write does NOT produce a second observer fire', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let syncOriginCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncOriginCount++;
    });

    populateFragment(doc, xmlFragment, '# Test\n');

    expect(syncOriginCount).toBe(1);

    cleanup();
  });

  test('AGENT_WRITE_ORIGIN paired write: Observer A produces no additional write', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let syncWriteCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncWriteCount++;
    });

    const rawContent = '# Agent\n\nAgent wrote this.\n';
    const json = mdManager.parse(rawContent);
    const pmNode = schema.nodeFromJSON(json);
    const normalizedContent = mdManager.serialize(json);
    const dispatchesBefore = recorder.dispatches.length;
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pmNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, normalizedContent);
    }, AGENT_WRITE_ORIGIN);

    expect(syncWriteCount).toBe(0);
    expect(recorder.dispatches.slice(dispatchesBefore)).toEqual(['none']);

    cleanup();
  });

  test('FILE_WATCHER_ORIGIN paired write: Observer A produces no additional write', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    let syncWriteCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) syncWriteCount++;
    });

    const rawContent = '# External\n\nFrom disk.\n';
    const json = mdManager.parse(rawContent);
    const pmNode = schema.nodeFromJSON(json);
    const normalizedContent = mdManager.serialize(json);
    const dispatchesBefore = recorder.dispatches.length;
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pmNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, normalizedContent);
    }, FILE_WATCHER_ORIGIN);

    expect(syncWriteCount).toBe(0);
    expect(recorder.dispatches.slice(dispatchesBefore)).toEqual(['none']);

    cleanup();
  });

  test('paired-write race: concurrent Y.Text mutation (historical seed 1776325179241 shape) does not duplicate content', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    const seedContent = 'seed paragraph\n';
    const seedJson = mdManager.parse(seedContent);
    const seedNode = schema.nodeFromJSON(seedJson);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, seedNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, mdManager.serialize(seedJson));
    }, AGENT_WRITE_ORIGIN);

    const afterOp0 = 'seed paragraph\n\nM0-alpha echo\n';
    const op0Json = mdManager.parse(afterOp0);
    const op0Node = schema.nodeFromJSON(op0Json);
    const op0Canonical = mdManager.serialize(op0Json);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, op0Node, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, op0Canonical);
    }, AGENT_WRITE_ORIGIN);

    doc.transact(() => {
      ytext.insert(ytext.length, '\n\nM1-golf hotel\n');
    });

    const finalText = ytext.toString();
    const occurrences = finalText.split('M0-alpha echo').length - 1;
    expect(occurrences).toBe(1);
    expect(finalText).toContain('M1-golf hotel');

    cleanup();
  });

  function runPairedWriteShortCircuitTest(origin: LocalTransactionOrigin, marker: string): void {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    const seedContent = 'seed paragraph\n';
    const seedJson = mdManager.parse(seedContent);
    const seedNode = schema.nodeFromJSON(seedJson);
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, seedNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, mdManager.serialize(seedJson));
    }, AGENT_WRITE_ORIGIN);

    const afterPaired = `seed paragraph\n\n${marker}\n`;
    const pairedJson = mdManager.parse(afterPaired);
    const pairedNode = schema.nodeFromJSON(pairedJson);
    const pairedCanonical = mdManager.serialize(pairedJson);
    const dispatchesBefore = recorder.dispatches.length;
    doc.transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, pairedNode, meta);
      ytext.delete(0, ytext.length);
      ytext.insert(0, pairedCanonical);
    }, origin);

    expect(recorder.dispatches.slice(dispatchesBefore)).toEqual(['none']);

    doc.transact(() => {
      const cur = ytext.toString();
      const nextContent = `${cur}\nconcurrent-edit\n`;
      const nextJson = mdManager.parse(nextContent);
      const nextNode = schema.nodeFromJSON(nextJson);
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, xmlFragment, nextNode, meta);
    });

    const finalText = ytext.toString();
    expect(finalText.split(marker).length - 1).toBe(1);
    expect(finalText).toContain('concurrent-edit');

    cleanup();
  }

  test('T8 — FILE_WATCHER paired-write: paired drain dispatches none (both observer branches short-circuit)', () => {
    runPairedWriteShortCircuitTest(FILE_WATCHER_ORIGIN, 'T8-file-watcher marker');
  });

  test('T9 — ROLLBACK paired-write: paired drain dispatches none', () => {
    runPairedWriteShortCircuitTest(ROLLBACK_ORIGIN, 'T9-rollback marker');
  });

  test('T10 — MANAGED_RENAME paired-write: paired drain dispatches none', () => {
    runPairedWriteShortCircuitTest(MANAGED_RENAME_ORIGIN, 'T10-managed-rename marker');
  });

  test('remote-arrived (no origin, local=false equivalent) triggers Observer A sync', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    populateFragment(doc, xmlFragment, '# Remote edit\n');

    expect(ytext.toString()).toContain('Remote edit');

    cleanup();
  });
});

describe('shouldRethrowBridgeMergeLoss (D3-LOCKED polarity)', () => {
  test('undefined NODE_ENV falls through to silent-checkpoint path (Bun prod default)', () => {
    expect(shouldRethrowBridgeMergeLoss({} as NodeJS.ProcessEnv)).toBe(false);
  });

  test('NODE_ENV=production falls through to silent-checkpoint path', () => {
    expect(shouldRethrowBridgeMergeLoss({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });

  test('NODE_ENV=development falls through to silent-checkpoint path', () => {
    expect(shouldRethrowBridgeMergeLoss({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });

  test('NODE_ENV=test triggers rethrow (bun test default)', () => {
    expect(shouldRethrowBridgeMergeLoss({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
  });

  test('OK_RETHROW_BRIDGE_LOSS=1 triggers rethrow regardless of NODE_ENV', () => {
    expect(
      shouldRethrowBridgeMergeLoss({
        NODE_ENV: 'production',
        OK_RETHROW_BRIDGE_LOSS: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  test('OK_RETHROW_BRIDGE_LOSS=0 does not trigger rethrow', () => {
    expect(shouldRethrowBridgeMergeLoss({ OK_RETHROW_BRIDGE_LOSS: '0' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });
});

describe('Cleanup', () => {
  test('cleanup detaches observers and the settlement handler', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    populateFragment(doc, xmlFragment, '# Pre-cleanup\n');
    expect(ytext.toString()).toContain('Pre-cleanup');
    const dispatchesBefore = recorder.dispatches.length;

    cleanup();

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    populateFragment(doc, xmlFragment, '# After cleanup\n');
    expect(writeCount).toBe(0);
    expect(recorder.dispatches.length).toBe(dispatchesBefore);
  });
});

describe('Initial sync', () => {
  test('populates Y.Text from XmlFragment when Y.Text is empty', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    populateFragment(doc, xmlFragment, '# Pre-existing\n\nContent here.\n');
    expect(ytext.toString()).toBe('');

    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    expect(ytext.toString()).toContain('Pre-existing');
    expect(ytext.toString()).toContain('Content here');

    cleanup();
  });

  test('does not populate Y.Text when both are empty', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();

    let writeCount = 0;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      if (tx.origin === OBSERVER_SYNC_ORIGIN) writeCount++;
    });

    const cleanup = setupServerObservers(setupOpts({ doc, xmlFragment, ytext, recorder }));

    expect(writeCount).toBe(0);
    expect(ytext.toString()).toBe('');

    cleanup();
  });
});

describe('Server Observer B — error recovery paths', () => {
  function createMdManagerStub() {
    let parseThrow: Error | null = null;
    let serializeThrow: Error | null = null;
    const stub: SetupServerObserversOpts['mdManager'] = {
      parse(md: string) {
        if (parseThrow) throw parseThrow;
        return mdManager.parse(md);
      },
      parseWithFallback(md: string) {
        if (parseThrow) throw parseThrow;
        return mdManager.parseWithFallback(md);
      },
      serialize(json: unknown) {
        if (serializeThrow) throw serializeThrow;
        // biome-ignore lint/suspicious/noExplicitAny: delegate to real manager
        return mdManager.serialize(json as any);
      },
    } as unknown as SetupServerObserversOpts['mdManager'];
    return {
      mdManager: stub,
      setParseThrow: (e: Error | null) => {
        parseThrow = e;
      },
      setSerializeThrow: (e: Error | null) => {
        serializeThrow = e;
      },
    };
  }

  test('parse-error on Y.Text change: baseline resets to Y.Text, Observer A does not re-apply', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const stub = createMdManagerStub();

    populateFragment(doc, xmlFragment, '# Seed\n\nBody.\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, recorder, mdManager: stub.mdManager }),
    );

    const errorsBefore = getMetrics().serverObserverErrorsB;

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Still here\n\n<Foo>broken text</Bar>\n');
    });

    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore);
    const postBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    expect(postBody).toContain('Still here');
    expect(postBody).toContain('<Foo>broken text</Bar>');

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Recovered\n');
    });

    const finalBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    expect(finalBody).toContain('Recovered');
    expect(finalBody).not.toContain('<Foo>');

    cleanup();
  });

  test('unknown parse error (non-SyntaxError) increments error counter and resets baseline to XmlFragment', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const stub = createMdManagerStub();

    populateFragment(doc, xmlFragment, '# Seed\n\nBody.\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, recorder, mdManager: stub.mdManager }),
    );

    const errorsBefore = getMetrics().serverObserverErrorsB;

    const originalConsoleError = console.error;
    console.error = () => {};
    stub.setParseThrow(new Error('unexpected parse failure'));

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Anything\n');
    });

    stub.setParseThrow(null);
    console.error = originalConsoleError;

    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore + 1);

    const postBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    expect(postBody).toContain('Seed');

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Seed\n\nBody.\n\n## Next\n');
    });
    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toContain('Next');

    cleanup();
  });

  test('post-sync serialize-error: falls back to input body as Observer A baseline', () => {
    const { doc, xmlFragment, ytext, recorder } = createTestDoc();
    const stub = createMdManagerStub();

    populateFragment(doc, xmlFragment, '# Seed\n');
    const cleanup = setupServerObservers(
      setupOpts({ doc, xmlFragment, ytext, recorder, mdManager: stub.mdManager }),
    );

    const errorsBefore = getMetrics().serverObserverErrorsB;

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    let serializeCallCount = 0;
    const originalSerialize = stub.mdManager.serialize;
    stub.mdManager.serialize = ((json: unknown) => {
      serializeCallCount++;
      if (serializeCallCount === 1) {
        throw new Error('simulated serialize failure post-update');
      }
      // biome-ignore lint/suspicious/noExplicitAny: delegate
      return mdManager.serialize(json as any);
    }) as typeof stub.mdManager.serialize;

    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, '# Seed\n\n## After\n');
    });

    stub.mdManager.serialize = originalSerialize;
    console.warn = originalWarn;

    expect(warnings.some((w) => w.includes('Post-sync re-serialization failed'))).toBe(true);

    expect(getMetrics().serverObserverErrorsB).toBe(errorsBefore);

    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toContain('After');

    doc.transact(() => {
      ytext.insert(ytext.length, '\nExtra\n');
    });
    expect(
      mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON()),
    ).toContain('Extra');

    cleanup();
  });
});
