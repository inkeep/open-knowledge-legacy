/**
 * Unit tests for the WYSIWYG clipboard text serializer.
 *
 * The HTML serializer (`createClipboardHtmlSerializer`) requires a real
 * DOM (DOMParser + document.createDocumentFragment) which bun-test does
 * not provide. Those paths are covered by the paste-fidelity E2E suite
 * (`packages/app/tests/stress/paste-fidelity.e2e.ts`).
 *
 * Here we cover the text path:
 *   - `createClipboardTextSerializer` returns a function that produces
 *     canonical markdown from a slice via `MarkdownManager.serialize`.
 *   - A failing `MarkdownManager.serialize` falls through to the PM-
 *     default `textBetween` path (FR-11 error-path discipline).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { Schema } from '@tiptap/pm/model';

import { createClipboardTextSerializer } from './serialize.ts';

// Minimal schema that lets us synthesise a `doc > paragraph > text` tree.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
  },
});

function makeSlice(text: string) {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  return doc.slice(0, doc.content.size);
}

// The serializer normalizes the slice to a synthetic top-level doc JSON
// via `schema.topNodeType.createAndFill` + `.toJSON()`. Our fake manager
// receives that JSON shape and reaches into `doc > paragraph > text`.
function fakeMdManager() {
  return {
    serialize: mock((doc: JSONContent) => {
      const p = doc.content?.[0]?.content?.[0]?.text ?? '';
      return `# ${p}`;
    }),
    parse: mock(() => ({ type: 'doc', content: [] })),
  };
}

function fakeView() {
  return { state: { schema } } as unknown as Parameters<
    ReturnType<typeof createClipboardTextSerializer>
  >[1];
}

let origWarn: typeof console.warn;
beforeEach(() => {
  origWarn = console.warn;
  console.warn = () => {};
});
afterEach(() => {
  console.warn = origWarn;
});

describe('createClipboardTextSerializer', () => {
  test('produces markdown from a slice via MarkdownManager.serialize', () => {
    const md = fakeMdManager();
    // biome-ignore lint/suspicious/noExplicitAny: fake md manager shape
    const serializer = createClipboardTextSerializer({ mdManager: md as any });
    const text = serializer(makeSlice('hello'), fakeView());
    expect(text).toBe('# hello');
    expect(md.serialize).toHaveBeenCalledTimes(1);
  });

  test('falls through to PM textBetween on serialize throw (FR-11)', () => {
    const md = fakeMdManager();
    md.serialize = mock(() => {
      throw new Error('boom');
    });
    // biome-ignore lint/suspicious/noExplicitAny: fake md manager shape
    const serializer = createClipboardTextSerializer({ mdManager: md as any });
    const text = serializer(makeSlice('hello world'), fakeView());
    // textBetween yields the literal text; the serializer fell through.
    expect(text).toContain('hello world');
  });

  test('never throws — even on an empty-selection slice', () => {
    const md = fakeMdManager();
    // biome-ignore lint/suspicious/noExplicitAny: fake md manager shape
    const serializer = createClipboardTextSerializer({ mdManager: md as any });
    const emptyDoc = schema.node('doc', null, [schema.node('paragraph')]);
    const slice = emptyDoc.slice(0, emptyDoc.content.size);
    expect(() => serializer(slice, fakeView())).not.toThrow();
  });
});
