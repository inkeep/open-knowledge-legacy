/**
 * PropertyPanel — static-render tests.
 *
 * Pattern matches ActivityPanelFileRow.test.tsx: render via `renderToString`
 * and inspect the resulting HTML. Interactive widget commits, type picker
 * dropdown, and observer-driven re-render are exercised in browser smoke
 * (US-007/US-008 AC), not here.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { renderToString } from 'react-dom/server';
import * as Y from 'yjs';
import { PropertyPanel } from './PropertyPanel';

const DUMMY_WS = 'ws://localhost:1/collab';

const providers: HocuspocusProvider[] = [];
function makeProvider(docName: string): HocuspocusProvider {
  const p = new HocuspocusProvider({ url: DUMMY_WS, name: docName });
  providers.push(p);
  return p;
}

afterEach(() => {
  for (const p of providers.splice(0)) {
    try {
      p.destroy();
    } catch {
      // ignore
    }
  }
});

function seedMetaMap(provider: HocuspocusProvider, entries: Record<string, unknown>): void {
  const metaMap = provider.document.getMap<unknown>('metadata');
  provider.document.transact(() => {
    for (const [key, value] of Object.entries(entries)) {
      metaMap.set(key, value);
    }
  });
}

describe('PropertyPanel', () => {
  test('renders nothing when the doc has no frontmatter', () => {
    const provider = makeProvider('empty-doc');
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toBe('');
  });

  test('renders Properties (N) header + one row per per-key entry', () => {
    const provider = makeProvider('populated-doc');
    seedMetaMap(provider, { title: 'Hello', draft: false, version: 3 });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('Properties (3)');
    expect(html).toContain('data-testid="property-panel"');
    expect(html).toContain('data-key="title"');
    expect(html).toContain('data-key="draft"');
    expect(html).toContain('data-key="version"');
  });

  test('ignores the legacy single-string slot when per-key entries exist', () => {
    const provider = makeProvider('mixed-doc');
    seedMetaMap(provider, {
      title: 'Just title',
      frontmatter: '---\ntitle: Just title\n---\n',
    });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('Properties (1)');
    expect(html).toContain('data-key="title"');
    expect(html).not.toContain('data-key="frontmatter"');
  });

  test('renders nothing when only the legacy single-string slot is set', () => {
    const provider = makeProvider('legacy-only-doc');
    seedMetaMap(provider, { frontmatter: '---\ntitle: Foo\n---\n' });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toBe('');
  });

  test('panel header is an aria-expanded button (collapse affordance)', () => {
    const provider = makeProvider('collapsible-doc');
    seedMetaMap(provider, { title: 'Hello' });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="property-panel-rows"');
  });

  test('rows are visible by default (panel mounts expanded)', () => {
    const provider = makeProvider('default-expanded-doc');
    seedMetaMap(provider, { title: 'Hello' });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('id="property-panel-rows"');
  });
});

describe('PropertyPanel widget routing (US-008)', () => {
  test('text-shape value renders TextWidget', () => {
    const provider = makeProvider('text-doc');
    seedMetaMap(provider, { title: 'My Title' });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('data-widget-type="text"');
    expect(html).toContain('data-testid="text-widget"');
    expect(html).toContain('value="My Title"');
  });

  test('number-shape value renders NumberWidget', () => {
    const provider = makeProvider('number-doc');
    seedMetaMap(provider, { version: 7 });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('data-widget-type="number"');
    expect(html).toContain('data-testid="number-widget"');
    expect(html).toContain('type="number"');
  });

  test('boolean-shape value renders BooleanWidget (Switch)', () => {
    const provider = makeProvider('boolean-doc');
    seedMetaMap(provider, { draft: false });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('data-widget-type="boolean"');
    expect(html).toContain('data-testid="boolean-widget"');
  });

  test('ISO date string renders DateWidget', () => {
    const provider = makeProvider('date-doc');
    seedMetaMap(provider, { published: '2026-04-24' });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('data-widget-type="date"');
    expect(html).toContain('data-testid="date-widget"');
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-04-24"');
  });

  test('list-shape value renders ListWidget with chips', () => {
    const provider = makeProvider('list-doc');
    seedMetaMap(provider, { tags: ['docs', 'crdt', 'mcp'] });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('data-widget-type="list"');
    expect(html).toContain('data-testid="list-widget"');
    // Each chip rendered with its index
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('data-index="2"');
    // Chip values appear in the markup
    expect(html).toContain('docs');
    expect(html).toContain('crdt');
    expect(html).toContain('mcp');
  });

  test('value-shape wins: array always renders as list, even if declared was text', () => {
    // Initial render takes inferred type; no override yet, but inference for
    // string[] is 'list' anyway. This pins the contract from the resolveWidgetType
    // helper that arrays trump declared types.
    const provider = makeProvider('shape-wins-doc');
    seedMetaMap(provider, { topics: ['a', 'b'] });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('data-widget-type="list"');
  });

  test('type icon button is per-row + matches inferred type', () => {
    const provider = makeProvider('type-icon-doc');
    seedMetaMap(provider, { title: 'Hello', count: 5 });
    const html = renderToString(<PropertyPanel provider={provider} />);
    // Two type-icon buttons, one per row, each carries its declared type.
    const iconMatches = html.match(/data-testid="type-icon-button"/g) ?? [];
    expect(iconMatches.length).toBe(2);
    expect(html).toContain('data-key="title"');
    expect(html).toContain('aria-label="title type: Text. Click to change."');
    expect(html).toContain('aria-label="count type: Number. Click to change."');
  });

  test('observeDeep picks up Y.Text-wrapped string slots (forward-compat)', () => {
    // List slots may be Y.Text in the future — getFrontmatterMap unwraps,
    // panel still routes through the text widget for the unwrapped string.
    const provider = makeProvider('ytext-doc');
    const metaMap = provider.document.getMap<unknown>('metadata');
    provider.document.transact(() => {
      metaMap.set('title', new Y.Text('YText title'));
    });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('value="YText title"');
    expect(html).toContain('data-widget-type="text"');
  });
});
