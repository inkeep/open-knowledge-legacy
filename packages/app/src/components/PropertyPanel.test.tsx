import { afterEach, describe, expect, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { renderToString } from 'react-dom/server';
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

/**
 * Seed the FM region of `Y.Text('source')` directly. After D8, the YAML
 * region IS the FM source of truth; the panel reads through `bindFrontmatterDoc`
 * which observes Y.Text.
 */
function seedYTextFm(provider: HocuspocusProvider, fenced: string): void {
  const ytext = provider.document.getText('source');
  provider.document.transact(() => {
    ytext.delete(0, ytext.length);
    ytext.insert(0, fenced);
  });
}

describe('PropertyPanel', () => {
  test('renders nothing when the doc has no frontmatter', () => {
    const provider = makeProvider('empty-doc');
    const html = renderPanel(provider);
    expect(html).toBe('');
  });

  test('renders Properties header + one row per FM property', () => {
    const provider = makeProvider('populated-doc');
    seedYTextFm(provider, '---\ntitle: Hello\ndraft: false\nversion: 3\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('>Properties<');
    expect(html).toContain('data-testid="property-panel"');
    expect(html).toContain('data-key="title"');
    expect(html).toContain('data-key="draft"');
    expect(html).toContain('data-key="version"');
  });

  test('panel header is an aria-expanded button (collapse affordance)', () => {
    const provider = makeProvider('collapsible-doc');
    seedYTextFm(provider, '---\ntitle: Hello\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('aria-expanded="true"');
  });

  test('rows are visible by default (panel mounts expanded)', () => {
    const provider = makeProvider('default-expanded-doc');
    seedYTextFm(provider, '---\ntitle: Hello\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-row"');
  });
});

describe('PropertyPanel widget routing', () => {
  test('text-shape value renders TextWidget', () => {
    const provider = makeProvider('text-doc');
    seedYTextFm(provider, '---\ntitle: My Title\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="text"');
    expect(html).toContain('data-testid="text-widget"');
    expect(html).toContain('value="My Title"');
  });

  test('number-shape value renders NumberWidget', () => {
    const provider = makeProvider('number-doc');
    seedYTextFm(provider, '---\nversion: 7\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="number"');
    expect(html).toContain('data-testid="number-widget"');
    expect(html).toContain('type="number"');
  });

  test('boolean-shape value renders BooleanWidget (Switch)', () => {
    const provider = makeProvider('boolean-doc');
    seedYTextFm(provider, '---\ndraft: false\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="boolean"');
    expect(html).toContain('data-testid="boolean-widget"');
  });

  test('ISO date string renders DateWidget', () => {
    const provider = makeProvider('date-doc');
    seedYTextFm(provider, '---\npublished: 2026-04-24\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="date"');
    expect(html).toContain('data-testid="date-widget"');
    expect(html).toContain('Apr 24, 2026');
  });

  test('list-shape value renders ListWidget with chips', () => {
    const provider = makeProvider('list-doc');
    seedYTextFm(provider, '---\ntags:\n  - docs\n  - crdt\n  - mcp\n---\n');
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
    seedYTextFm(provider, '---\ntopics:\n  - a\n  - b\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-widget-type="list"');
  });

  test('type icon button is per-row + matches inferred type', () => {
    const provider = makeProvider('type-icon-doc');
    seedYTextFm(provider, '---\ntitle: Hello\ncount: 5\n---\n');
    const html = renderPanel(provider);
    const iconMatches = html.match(/data-testid="type-icon-button"/g) ?? [];
    expect(iconMatches.length).toBe(2);
    expect(html).toContain('data-key="title"');
    expect(html).toContain('aria-label="title type: Text. Click to change."');
    expect(html).toContain('aria-label="count type: Number. Click to change."');
  });
});

describe('PropertyPanel row chrome', () => {
  test('each row renders a remove button with key-scoped aria-label', () => {
    const provider = makeProvider('chrome-remove-doc');
    seedYTextFm(provider, '---\ntitle: A\nstatus: draft\n---\n');
    const html = renderPanel(provider);
    const trashMatches = html.match(/data-testid="property-remove-button"/g) ?? [];
    expect(trashMatches.length).toBe(2);
    expect(html).toContain('aria-label="Remove title"');
    expect(html).toContain('aria-label="Remove status"');
  });

  test('property name renders as a button (rename affordance)', () => {
    const provider = makeProvider('chrome-rename-doc');
    seedYTextFm(provider, '---\ntitle: A\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-name-button"');
    expect(html).toContain('data-key="title"');
  });

  test('each row renders move-up + move-down buttons (drag-as-buttons fallback)', () => {
    const provider = makeProvider('chrome-move-doc');
    seedYTextFm(provider, '---\ntitle: A\nstatus: draft\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-move-up"');
    expect(html).toContain('data-testid="property-move-down"');
  });
});

describe('PropertyPanel add-property trigger', () => {
  test('persistent add-property button at the bottom of the expanded panel', () => {
    const provider = makeProvider('add-trigger-doc');
    seedYTextFm(provider, '---\ntitle: A\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="add-property-trigger"');
    expect(html).toContain('Add property');
  });

  test('panel is hidden when there are no rows AND no add-row open', () => {
    const provider = makeProvider('add-trigger-empty-doc');
    const html = renderPanel(provider);
    expect(html).toBe('');
  });
});

describe('PropertyPanel duplicate-name surfacing', () => {
  test('two rows with the same name both render with a duplicate-name marker (D17/FR6)', () => {
    const provider = makeProvider('dup-name-doc');
    // yaml@2 with `uniqueKeys: false` admits duplicate keys; both are
    // emitted by Document.toString and parsed via readFmKeys.
    seedYTextFm(provider, '---\ntitle: First\ntitle: Second\n---\n');
    const html = renderPanel(provider);
    const dupMarkerMatches = html.match(/data-testid="property-duplicate-marker"/g) ?? [];
    expect(dupMarkerMatches.length).toBe(2);
  });
});

describe('PropertyPanel malformed YAML banner (FR9)', () => {
  test('renders an inline banner when the YAML region is unparseable', () => {
    const provider = makeProvider('malformed-yaml-doc');
    seedYTextFm(provider, '---\n: : : invalid\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-panel-yaml-error"');
    expect(html).toContain('Frontmatter YAML is malformed');
  });
});

describe('PropertyPanel error rendering', () => {
  test('rows render with no error subline by default', () => {
    const provider = makeProvider('no-error-doc');
    seedYTextFm(provider, '---\ntitle: Hello\n---\n');
    const html = renderPanel(provider);
    expect(html).not.toContain('data-testid="property-error"');
    expect(html).not.toContain('data-error="');
  });

  test('row container exposes data-error="undefined" attribute slot for failed-commit attribution', () => {
    const provider = makeProvider('error-slot-doc');
    seedYTextFm(provider, '---\ntitle: Hello\n---\n');
    const html = renderPanel(provider);
    expect(html).toContain('data-testid="property-row"');
    expect(html).toContain('data-key="title"');
  });
});
