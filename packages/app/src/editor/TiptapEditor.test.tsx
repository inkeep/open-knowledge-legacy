import { describe, expect, test } from 'bun:test';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { buildPatternDConstructorOptions } from './TiptapEditor';

describe('buildPatternDConstructorOptions', () => {
  function makeFakeProvider(): HocuspocusProvider {
    const ydoc = new Y.Doc();
    return {
      document: ydoc,
      configuration: { name: 'test-doc' },
      awareness: undefined,
    } as unknown as HocuspocusProvider;
  }

  type ClipboardArg = Parameters<typeof buildPatternDConstructorOptions>[0]['clipboard'];
  const fakeClipboard = {
    mdManager: {},
    text: () => '',
    html: { serializer: {}, setView: () => {} },
    paste: () => false,
    drop: () => false,
  } as unknown as ClipboardArg;

  test('always passes element: null explicitly (D12 1-way door regression guard)', () => {
    const opts = buildPatternDConstructorOptions({
      provider: makeFakeProvider(),
      clipboard: fakeClipboard,
      ctorStart: 0,
    });
    expect(opts.element).toBeNull();
    expect('element' in opts).toBe(true);
    expect(opts.element).not.toBeUndefined();
  });

  test('content is set from a pre-built PM doc walk (Q21 pre-warm)', () => {
    const opts = buildPatternDConstructorOptions({
      provider: makeFakeProvider(),
      clipboard: fakeClipboard,
      ctorStart: 0,
    });
    expect(opts.content).toBeDefined();
    expect(opts.content).toMatchObject({ type: 'doc' });
  });

  test('Collaboration extension carries ySyncOptions.mapping populated by the same walk', () => {
    const opts = buildPatternDConstructorOptions({
      provider: makeFakeProvider(),
      clipboard: fakeClipboard,
      ctorStart: 0,
    });
    const collaboration = opts.extensions?.find((ext) => ext.name === 'collaboration') as
      | { options?: { ySyncOptions?: { mapping?: unknown } } }
      | undefined;
    expect(collaboration).toBeDefined();
    expect(collaboration?.options?.ySyncOptions?.mapping).toBeDefined();
    expect(collaboration?.options?.ySyncOptions?.mapping).toBeInstanceOf(Map);
  });
});
