/**
 * Branch-routing tests for the WYSIWYG paste dispatcher (FR-3 / D6).
 *
 * The dispatcher is a priority-ordered series of guards:
 *   0. FR-17 Cmd+Shift+V escape hatch
 *   0. FR-10 cursor-in-codeBlock short-circuit
 *   A. vscode-editor-data → fenced code block
 *   B. text/x-gfm → MarkdownManager.parse
 *   C. data-pm-slice → PM native parseFromClipboard (return false)
 *   B. Ambiguous paste (plain + html both, plain is markdown) → markdown path (FR-13)
 *   D. Generic HTML → shared htmlToMdast pipeline
 *   E. text/plain only → markdown-first if threshold hit, else verbatim
 *
 * Each test arranges a DataTransfer + empty doc and asserts which branch
 * fired, via the dispatcher's return value and its side effects on the
 * fake view. We use a narrow fake EditorView since the real one requires
 * a full schema + document; the dispatcher only touches a small surface
 * (`state.selection`, `state.schema.nodes.codeBlock`, `state.schema.text`,
 * `state.tr.*`, `dispatch`).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import { createHandlePaste } from './handle-paste.ts';

// Mock the shared pipeline so tests don't exercise the full rehype stack.
mock.module('@inkeep/open-knowledge-core', () => {
  return {
    htmlToMdast: mock((_html: string) => ({ type: 'root', children: [] })),
    mdastToMarkdown: mock((_tree: unknown) => '**bold**'),
  };
});

// Mock sonner to no-op toasts — we don't assert on them here.
mock.module('sonner', () => ({ toast: { error: mock(() => {}) } }));

function fakeDT(data: Record<string, string>): ClipboardEvent {
  const evt = {
    clipboardData: {
      types: Object.keys(data),
      getData: (k: string) => data[k] ?? '',
    },
  } as unknown as ClipboardEvent;
  return evt;
}

function fakeMdManager() {
  return {
    parse: mock((_md: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'parsed' }] }],
    })),
  };
}

// Fake PM view: only the fields the dispatcher reads.
// biome-ignore lint/suspicious/noExplicitAny: narrow fake view for unit test
function fakeView(opts: { inCodeBlock?: boolean } = {}): any {
  const dispatch = mock(() => {});
  const codeBlockType = {
    create: mock((_attrs: unknown, _content: unknown) => ({
      slice: (_f: number, _t: number) => 'CODE-SLICE',
    })),
  };
  // Simulated $from $node chain: if inCodeBlock, one node at depth is named 'codeBlock'.
  const $from = {
    depth: 1,
    node: (_d: number) => ({ type: { name: opts.inCodeBlock ? 'codeBlock' : 'paragraph' } }),
  };
  return {
    state: {
      selection: { $from },
      schema: {
        nodes: { codeBlock: codeBlockType },
        text: (s: string) => ({ textContent: s }),
        // biome-ignore lint/suspicious/noExplicitAny: fake schema for unit test
        nodeFromJSON: (json: any) => ({
          slice: (_f: number, _t: number) => ({ json, size: 10, content: { size: 10 } }),
          content: { size: 10 },
        }),
      },
      tr: {
        replaceSelectionWith: mock(function (this: unknown, _node: unknown) {
          return this;
        }),
        replaceSelection: mock(function (this: unknown, _slice: unknown) {
          return this;
        }),
        scrollIntoView: mock(function (this: unknown) {
          return this;
        }),
      },
    },
    dispatch,
  };
}

let origWarn: typeof console.warn;
beforeEach(() => {
  origWarn = console.warn;
  console.warn = () => {};
});
afterEach(() => {
  console.warn = origWarn;
});

describe('WYSIWYG paste dispatcher — branch routing', () => {
  test('empty clipboard returns false (PM default runs)', () => {
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: fakeMdManager() as any,
    });
    const view = fakeView();
    const evt = {
      clipboardData: { types: [] as string[], getData: () => '' },
    } as unknown as ClipboardEvent;
    expect(paste(view, evt)).toBe(false);
  });

  test('FR-10: cursor-in-codeBlock short-circuits to plain-text insert', () => {
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: fakeMdManager() as any,
    });
    const view = fakeView({ inCodeBlock: true });
    const evt = fakeDT({ 'text/plain': 'raw code', 'text/html': '<b>bold</b>' });
    expect(paste(view, evt)).toBe(true);
    // Plain text was dispatched, not parsed as markdown or HTML.
    expect(view.state.tr.replaceSelectionWith).toHaveBeenCalled();
  });

  test('Branch A: vscode-editor-data produces a codeBlock with language', () => {
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: fakeMdManager() as any,
    });
    const view = fakeView();
    const evt = fakeDT({
      'vscode-editor-data': '{"mode":"typescript"}',
      'text/plain': 'const x = 1;',
    });
    expect(paste(view, evt)).toBe(true);
    expect(view.state.schema.nodes.codeBlock.create).toHaveBeenCalledWith(
      { language: 'typescript' },
      expect.anything(),
    );
  });

  test('Branch A: unsanitized language falls back to empty lang string', () => {
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: fakeMdManager() as any,
    });
    const view = fakeView();
    const evt = fakeDT({
      // Newline + fence char would break out of the fence — dispatcher must reject.
      'vscode-editor-data': '{"mode":"ts\\n```evil"}',
      'text/plain': 'code',
    });
    paste(view, evt);
    expect(view.state.schema.nodes.codeBlock.create).toHaveBeenCalledWith(
      { language: '' },
      expect.anything(),
    );
  });

  test('Branch C: data-pm-slice fingerprint returns false (PM handles)', () => {
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: fakeMdManager() as any,
    });
    const view = fakeView();
    const evt = fakeDT({
      'text/html': '<div data-pm-slice="0 0 paragraph"><p>hi</p></div>',
      'text/plain': 'hi',
    });
    expect(paste(view, evt)).toBe(false);
  });

  test('Branch B: text/x-gfm routes through MarkdownManager.parse', () => {
    const md = fakeMdManager();
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: md as any,
    });
    const view = fakeView();
    const evt = fakeDT({ 'text/x-gfm': '# gfm heading', 'text/plain': '# gfm heading' });
    expect(paste(view, evt)).toBe(true);
    expect(md.parse).toHaveBeenCalledWith('# gfm heading');
  });

  test('Branch B (FR-13 ambiguous): plain+html with markdown-shaped plain → markdown path wins', () => {
    const md = fakeMdManager();
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: md as any,
    });
    const view = fakeView();
    // isMarkdown signal count ≥ threshold via heading + list + code.
    const markdownPlain = '# H\n\n- a\n- b\n\n```\ncode\n```\n';
    const evt = fakeDT({
      'text/plain': markdownPlain,
      'text/html': '<h1>H</h1>',
    });
    expect(paste(view, evt)).toBe(true);
    expect(md.parse).toHaveBeenCalledWith(markdownPlain);
  });

  test('Branch D: generic HTML (no markdown signals in text/plain) goes through htmlToMdast', () => {
    const md = fakeMdManager();
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: md as any,
    });
    const view = fakeView();
    const evt = fakeDT({
      'text/plain': 'plain prose no signals',
      'text/html': '<p>rich <b>html</b></p>',
    });
    expect(paste(view, evt)).toBe(true);
    // Branch D calls mdManager.parse with the markdown that htmlToMdast +
    // mdastToMarkdown produced (the mocked stub returns '**bold**').
    expect(md.parse).toHaveBeenCalledWith('**bold**');
  });

  test('Branch E: text/plain only with markdown signals parses as markdown', () => {
    const md = fakeMdManager();
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: md as any,
    });
    const view = fakeView();
    const evt = fakeDT({
      'text/plain': '# H\n\n- a\n- b\n\n```\ncode\n```\n',
    });
    expect(paste(view, evt)).toBe(true);
    expect(md.parse).toHaveBeenCalled();
  });

  test('Branch E: text/plain only prose inserts verbatim (no markdown parse)', () => {
    const md = fakeMdManager();
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: md as any,
    });
    const view = fakeView();
    const evt = fakeDT({ 'text/plain': 'hello world, plain prose' });
    expect(paste(view, evt)).toBe(true);
    // Prose below threshold — no parse call, plain-text dispatch instead.
    expect(md.parse).not.toHaveBeenCalled();
    expect(view.state.tr.replaceSelectionWith).toHaveBeenCalled();
  });

  test('FR-17: Cmd+Shift+V (via injected shiftKey) → verbatim text/plain insert', () => {
    const md = fakeMdManager();
    const paste = createHandlePaste({
      // biome-ignore lint/suspicious/noExplicitAny: narrow fake md manager
      mdManager: md as any,
    });
    const view = fakeView();
    const evt = fakeDT({ 'text/plain': '# H', 'text/html': '<h1>H</h1>' });
    Object.defineProperty(evt, 'shiftKey', { value: true, configurable: true });
    expect(paste(view, evt)).toBe(true);
    expect(md.parse).not.toHaveBeenCalled();
  });
});
