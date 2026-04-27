/**
 * PropertyPanel — static-render tests.
 *
 * Pattern matches ActivityPanelFileRow.test.tsx: render via `renderToString`
 * and inspect the resulting HTML. Interactive collapse + observer-driven
 * re-render are exercised in browser smoke (US-007 AC), not here.
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
    expect(html).toContain('Hello');
    expect(html).toContain('data-key="draft"');
    expect(html).toContain('false');
    expect(html).toContain('data-key="version"');
    expect(html).toContain('3');
  });

  test('formats list values as comma-separated text', () => {
    const provider = makeProvider('list-doc');
    seedMetaMap(provider, { tags: ['docs', 'crdt', 'mcp'] });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('docs, crdt, mcp');
  });

  test('ignores the legacy single-string slot when per-key entries exist', () => {
    const provider = makeProvider('mixed-doc');
    seedMetaMap(provider, {
      title: 'Just title',
      frontmatter: '---\ntitle: Just title\n---\n',
    });
    const html = renderToString(<PropertyPanel provider={provider} />);
    // Per-key surface drives the panel; legacy slot is invisible here.
    expect(html).toContain('Properties (1)');
    expect(html).toContain('data-key="title"');
    expect(html).not.toContain('data-key="frontmatter"');
  });

  test('renders nothing when only the legacy single-string slot is set', () => {
    const provider = makeProvider('legacy-only-doc');
    seedMetaMap(provider, { frontmatter: '---\ntitle: Foo\n---\n' });
    // No per-key entries → getFrontmatterMap returns {} → panel renders null.
    // In production, US-002's eager-on-load migration writes per-key entries
    // alongside the legacy slot, so this state isn't observable on a loaded
    // doc — the test pins the helper's contract.
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
    expect(html).toContain('Hello');
  });

  test('observeDeep picks up Y.Text-wrapped string slots (forward-compat for US-008)', () => {
    const provider = makeProvider('ytext-doc');
    const metaMap = provider.document.getMap<unknown>('metadata');
    provider.document.transact(() => {
      metaMap.set('title', new Y.Text('YText title'));
    });
    const html = renderToString(<PropertyPanel provider={provider} />);
    expect(html).toContain('YText title');
  });
});
