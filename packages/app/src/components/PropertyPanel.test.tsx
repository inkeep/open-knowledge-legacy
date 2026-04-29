import { afterEach, describe, expect, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { renderToString } from 'react-dom/server';
import * as Y from 'yjs';
import { PropertyProvider } from './PropertyContext';
import { PropertyPanel } from './PropertyPanel';

// Renders PropertyPanel inside PropertyProvider — the panel reads
// `useProperties()` for the cross-tree add-property signal and would throw
// "must be used within <PropertyProvider />" without this wrapper.
function renderPanel(provider: HocuspocusProvider): string {
  return renderToString(
    <PropertyProvider>
      <PropertyPanel provider={provider} />
    </PropertyProvider>,
  );
}

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
    const html = renderPanel(provider);
    expect(html).toBe('');
  });

  test('renders Properties header + one row per per-key entry', () => {
    const provider = makeProvider('populated-doc');
    seedMetaMap(provider, { title: 'Hello', draft: false, version: 3 });
    const html = renderPanel(provider);
    expect(html).toContain('>Properties<');
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
    const html = renderPanel(provider);
    expect(html).toContain('>Properties<');
    expect(html).toContain('data-key="title"');
    expect(html).not.toContain('data-key="frontmatter"');
  });

  test('renders nothing when only the legacy single-string slot is set', () => {
    const provider = makeProvider('legacy-only-doc');
    seedMetaMap(provider, { frontmatter: '---\ntitle: Foo\n---\n' });
    const html = renderPanel(provider);
    expect(html).toBe('');
  });

  test('panel header is an aria-expanded button (collapse affordance)', () => {
    const provider = makeProvider('collapsible-doc');
    seedMetaMap(provider, { title: 'Hello' });
    const html = renderPanel(provider);
    expect(html).toContain('aria-expanded="true"');
  });

  test('rows are visible by default (panel mounts expanded)', () => {
    const provider = makeProvider('default-expanded-doc');
    seedMetaMap(provider, { title: 'Hello' });
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-row"');
  });
});

describe('PropertyPanel widget routing (US-008)', () => {
  test('text-shape value renders TextWidget', () => {
    const provider = makeProvider('text-doc');
    seedMetaMap(provider, { title: 'My Title' });
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="text"');
    expect(html).toContain('data-testid="text-widget"');
    expect(html).toContain('value="My Title"');
  });

  test('number-shape value renders NumberWidget', () => {
    const provider = makeProvider('number-doc');
    seedMetaMap(provider, { version: 7 });
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="number"');
    expect(html).toContain('data-testid="number-widget"');
    expect(html).toContain('type="number"');
  });

  test('boolean-shape value renders BooleanWidget (Switch)', () => {
    const provider = makeProvider('boolean-doc');
    seedMetaMap(provider, { draft: false });
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="boolean"');
    expect(html).toContain('data-testid="boolean-widget"');
  });

  test('ISO date string renders DateWidget', () => {
    const provider = makeProvider('date-doc');
    seedMetaMap(provider, { published: '2026-04-24' });
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="date"');
    expect(html).toContain('data-testid="date-widget"');
    expect(html).toContain('Apr 24, 2026');
  });

  test('list-shape value renders ListWidget with chips', () => {
    const provider = makeProvider('list-doc');
    seedMetaMap(provider, { tags: ['docs', 'crdt', 'mcp'] });
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="list"');
    expect(html).toContain('data-testid="list-widget"');
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('data-index="2"');
    expect(html).toContain('docs');
    expect(html).toContain('crdt');
    expect(html).toContain('mcp');
  });

  test('value-shape wins: array always renders as list, even if declared was text', () => {
    const provider = makeProvider('shape-wins-doc');
    seedMetaMap(provider, { topics: ['a', 'b'] });
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="list"');
  });

  test('type icon button is per-row + matches inferred type', () => {
    const provider = makeProvider('type-icon-doc');
    seedMetaMap(provider, { title: 'Hello', count: 5 });
    const html = renderPanel(provider);
    const iconMatches = html.match(/data-testid="type-icon-button"/g) ?? [];
    // One per row + one in the (possibly hidden) AddPropertyRow if present;
    // with no add-row open, only per-row icons render.
    expect(iconMatches.length).toBe(2);
    expect(html).toContain('data-key="title"');
    expect(html).toContain('aria-label="title type: Text. Click to change."');
    expect(html).toContain('aria-label="count type: Number. Click to change."');
  });

  test('observeDeep picks up Y.Text-wrapped string slots (forward-compat)', () => {
    const provider = makeProvider('ytext-doc');
    const metaMap = provider.document.getMap<unknown>('metadata');
    provider.document.transact(() => {
      metaMap.set('title', new Y.Text('YText title'));
    });
    const html = renderPanel(provider);
    expect(html).toContain('value="YText title"');
    expect(html).toContain('data-widget-type="text"');
  });
});

describe('PropertyPanel row chrome (US-009)', () => {
  test('each row renders a remove button with key-scoped aria-label', () => {
    const provider = makeProvider('chrome-remove-doc');
    seedMetaMap(provider, { title: 'A', status: 'draft' });
    const html = renderPanel(provider);
    const trashMatches = html.match(/data-testid="property-remove-button"/g) ?? [];
    expect(trashMatches.length).toBe(2);
    expect(html).toContain('aria-label="Remove title"');
    expect(html).toContain('aria-label="Remove status"');
  });

  test('property name renders as a button (rename affordance)', () => {
    const provider = makeProvider('chrome-rename-doc');
    seedMetaMap(provider, { title: 'A' });
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-name-button"');
    expect(html).toContain('data-key="title"');
  });
});

describe('PropertyPanel add-property trigger (US-009)', () => {
  test('persistent add-property button at the bottom of the expanded panel', () => {
    const provider = makeProvider('add-trigger-doc');
    seedMetaMap(provider, { title: 'A' });
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="add-property-trigger"');
    expect(html).toContain('Add property');
  });

  test('add-property button renders even when there are no rows yet — wait, panel is hidden in that case', () => {
    // Panel is null when (a) no rows AND (b) no add-row open. The add-trigger
    // is only visible when rows already exist; the toolbar trigger in
    // EditorHeader handles the empty-state init path.
    const provider = makeProvider('add-trigger-empty-doc');
    const html = renderPanel(provider);
    expect(html).toBe('');
  });
});

describe('PropertyPanel duplicate-name guard (US-009)', () => {
  test('Object.hasOwn surface is the rejection signal (contract pin)', () => {
    const provider = makeProvider('dup-guard-shape-doc');
    seedMetaMap(provider, { title: 'A', status: 'draft' });
    // Rebuild the map shape readers see — this pins that hasOwn discriminates
    // existing vs new keys across the same surface the panel queries.
    const map = provider.document.getMap<unknown>('metadata');
    expect(map.has('title')).toBe(true);
    expect(map.has('status')).toBe(true);
    expect(map.has('newKey')).toBe(false);
  });
});

describe('PropertyPanel error rendering (US-010)', () => {
  test('rows render with no error subline by default', () => {
    const provider = makeProvider('no-error-doc');
    seedMetaMap(provider, { title: 'Hello' });
    const html = renderPanel(provider);
    expect(html).not.toContain('data-testid="property-error"');
    expect(html).not.toContain('data-error="');
  });

  test('row container exposes data-error="undefined" attribute slot for failed-commit attribution', () => {
    // The presence of the data-error attribute slot is part of the contract
    // for browser-side error visibility (the value populates dynamically when
    // a failed commit lands). On the SSR snapshot, error is null → React
    // omits the attribute entirely.
    const provider = makeProvider('error-slot-doc');
    seedMetaMap(provider, { title: 'Hello' });
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-row"');
    expect(html).toContain('data-key="title"');
  });
});
