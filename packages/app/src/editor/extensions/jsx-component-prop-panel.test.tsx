/**
 * Renders JsxComponentPropPanel via `renderToString` and asserts the static
 * output shape. Click/edit behavior is exercised in Playwright e2e (none
 * exists for JsxComponent today — pattern ready when CB-v2 ships richer
 * descriptor UI).
 */
import { describe, expect, it } from 'bun:test';
import type { Editor } from '@tiptap/core';
import { renderToString } from 'react-dom/server';
import { JsxComponentPropPanel } from './JsxComponentPropPanel';

/**
 * Minimal Editor stub — the PropPanel's render path only reads
 * `editor.state.doc.nodeAt(pos).attrs.content`.
 */
function makeFakeEditor(content: string): Editor {
  const node = {
    attrs: { content },
    nodeSize: 2,
  } as const;
  return {
    state: {
      doc: {
        nodeAt: (_pos: number) => node,
      },
    },
    chain() {
      return {
        focus() {
          return this;
        },
        deleteRange() {
          return this;
        },
        run() {
          return true;
        },
      };
    },
  } as unknown as Editor;
}

describe('<JsxComponentPropPanel> static render', () => {
  it('renders the component name from the node content', () => {
    const editor = makeFakeEditor('<Callout type="info">body</Callout>');
    const html = renderToString(
      <JsxComponentPropPanel editor={editor} getPos={() => 0} onDismiss={() => {}} />,
    );
    expect(html).toContain('Callout');
  });

  it('renders both Delete and Close affordances', () => {
    const editor = makeFakeEditor('<Callout type="info">body</Callout>');
    const html = renderToString(
      <JsxComponentPropPanel editor={editor} getPos={() => 0} onDismiss={() => {}} />,
    );
    expect(html).toContain('Delete');
    expect(html).toContain('aria-label="Close"');
  });

  it('renders role="dialog" so assistive tech treats it as a live panel', () => {
    const editor = makeFakeEditor('<Callout type="info">body</Callout>');
    const html = renderToString(
      <JsxComponentPropPanel editor={editor} getPos={() => 0} onDismiss={() => {}} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Component properties"');
  });

  it('falls back to "Unknown" when content cannot be parsed', () => {
    const editor = makeFakeEditor('plain text no tag');
    const html = renderToString(
      <JsxComponentPropPanel editor={editor} getPos={() => 0} onDismiss={() => {}} />,
    );
    expect(html).toContain('Unknown');
  });

  it('renders empty component name when getPos returns undefined', () => {
    const editor = makeFakeEditor('<Callout type="info">body</Callout>');
    const html = renderToString(
      <JsxComponentPropPanel editor={editor} getPos={() => undefined} onDismiss={() => {}} />,
    );
    // Empty content → extractJsxComponentName returns 'Unknown'
    expect(html).toContain('Unknown');
  });
});
