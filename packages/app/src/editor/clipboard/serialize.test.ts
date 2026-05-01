/**
 * Unit tests for the WYSIWYG clipboard serializers.
 *
 * The HTML serializer's DOM-traversal happy path requires a real DOM
 * (DOMParser + document.createDocumentFragment) which bun-test does not
 * provide; that path is covered by the paste-fidelity E2E suite
 * (`packages/app/tests/stress/paste-fidelity.e2e.ts`, CB-CONTRACT-1..11).
 *
 * Here we cover what bun-test CAN reach without DOM:
 *   - text serializer happy path + failure-fallthrough (FR-11);
 *   - HTML serializer's walker→markdown tier dispatch logic — the
 *     decision to enter walker, the catch-and-fallthrough on walker
 *     throw, and the markdown tier's no-schema short-circuit. This pins
 *     the regression class "catch block removed in a refactor"
 *     mechanically rather than relying on E2E to surface it.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import type { Fragment } from '@tiptap/pm/model';
import { Schema } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

import { createClipboardHtmlSerializer, createClipboardTextSerializer } from './serialize.ts';

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

describe('createClipboardHtmlSerializer — walker→markdown tier dispatch', () => {
  // These tests pin the dispatch logic in `MdastClipboardSerializer.serializeFragment`
  // without invoking the DOM-dependent paths. The walker and markdown tiers
  // both need DOM to actually emit content (via `walkLiveDomToInlineStyledFragment`
  // and `parseHtmlToDocumentFragment` respectively); we exercise the *decision*
  // to enter each tier and the fallthrough behavior on walker throw, by feeding
  // a fragment with no firstChild — the markdown tier short-circuits at the
  // schema lookup before reaching `parseHtmlToDocumentFragment`.

  // A fragment whose firstChild is null. Triggers the markdown tier's
  // `if (!schema) return target` short-circuit, sidestepping DOM.
  function emptyFragment(): Fragment {
    return { firstChild: null } as unknown as Fragment;
  }

  // Sentinel target object — proxies as a DocumentFragment so the
  // serializer's `target ?? ...` arms cleanly. Identity preserved through
  // the call chain when no DOM is touched.
  function sentinelTarget(): DocumentFragment {
    return {} as DocumentFragment;
  }

  // Inner-scoped save so we don't shadow the module-level `origWarn` that
  // the text-serializer block's hooks captured. Without this, a future
  // test added below this describe block would restore to a no-op rather
  // than the true original `console.warn`.
  let warnCalls: string[];
  let innerOrigWarn: typeof console.warn;
  beforeEach(() => {
    warnCalls = [];
    innerOrigWarn = console.warn;
    console.warn = (msg: unknown) => {
      warnCalls.push(typeof msg === 'string' ? msg : String(msg));
    };
  });
  afterEach(() => {
    console.warn = innerOrigWarn;
  });

  test('view attached + active selection + walker throws → catch fires + markdown tier returns target', () => {
    // Mock view: from !== to (walker tier entry) and `selection.content()`
    // throws synchronously to exercise the walker catch block.
    const view = {
      state: {
        selection: {
          from: 0,
          to: 5,
          content: () => {
            throw new Error('walker-boom');
          },
        },
      },
    } as unknown as EditorView;

    const md = fakeMdManager();
    const handle = createClipboardHtmlSerializer({
      // biome-ignore lint/suspicious/noExplicitAny: fake md manager shape
      mdManager: md as any,
    });
    handle.setView(view);

    const target = sentinelTarget();
    const result = handle.serializer.serializeFragment(emptyFragment(), undefined, target);

    // Walker catch block emitted the structured failure event with the
    // `walker:` reason prefix — pins the regression class "catch removed
    // in a refactor" mechanically.
    const failEvent = warnCalls.find((w) => w.includes('clipboard-serialize-failed'));
    expect(failEvent).toBeDefined();
    expect(failEvent).toContain('walker:walker-boom');

    // Markdown tier ran and returned the target sentinel (no-schema branch),
    // not a fresh DocumentFragment — i.e. the fallthrough actually happened.
    expect(result).toBe(target);
  });

  test('no view attached → walker tier skipped → markdown tier returns target', () => {
    const md = fakeMdManager();
    const handle = createClipboardHtmlSerializer({
      // biome-ignore lint/suspicious/noExplicitAny: fake md manager shape
      mdManager: md as any,
    });

    const target = sentinelTarget();
    const result = handle.serializer.serializeFragment(emptyFragment(), undefined, target);

    // No walker-failure event since the walker tier never fired.
    expect(warnCalls.find((w) => w.includes('walker:'))).toBeUndefined();
    expect(result).toBe(target);
  });

  test('collapsed selection (from === to) → walker tier skipped → markdown tier returns target', () => {
    // Drag-out from a collapsed cursor: the walker tier guard skips
    // entering, sidestepping `selection.content()` entirely. The mock's
    // `content()` throws to assert it's *not* called.
    const view = {
      state: {
        selection: {
          from: 0,
          to: 0,
          content: () => {
            throw new Error('should-not-be-called');
          },
        },
      },
    } as unknown as EditorView;

    const md = fakeMdManager();
    const handle = createClipboardHtmlSerializer({
      // biome-ignore lint/suspicious/noExplicitAny: fake md manager shape
      mdManager: md as any,
    });
    handle.setView(view);

    const target = sentinelTarget();
    const result = handle.serializer.serializeFragment(emptyFragment(), undefined, target);

    // No walker-tier engagement — content() was never called.
    expect(warnCalls.find((w) => w.includes('walker:'))).toBeUndefined();
    // Markdown tier returned the target sentinel — sibling-symmetric
    // assertion with the two preceding tests.
    expect(result).toBe(target);
  });
});
