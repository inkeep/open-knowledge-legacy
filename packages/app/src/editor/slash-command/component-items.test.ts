import { describe, expect, test } from 'bun:test';
import {
  builtInComponents,
  getAgentCanonicalDescriptors,
  getCanonicalDescriptors,
} from '@inkeep/open-knowledge-core';
import {
  createChildNode,
  getComponentItems,
  getInlineComponentItems,
  SLASH_HIDDEN_CANONICALS,
} from './component-items';

describe('getComponentItems (slash menu)', () => {
  test('returns descriptor-driven canonicals + the custom File entry', () => {
    const items = getComponentItems();
    const labels = items.map((i) => i.label).sort();
    expect(labels).toEqual(
      [
        'Accordion',
        'Audio',
        'Callout',
        'Embed',
        'File',
        'Image',
        'Math',
        'Mermaid',
        'PDF',
        'Tabs',
        'Video',
      ].sort(),
    );
  });

  test('File entry is the custom upload-picker variant, NOT the descriptor JSX-insert', () => {
    const items = getComponentItems();
    const file = items.find((i) => i.label === 'File');
    expect(file).toBeDefined();
    expect(file?.name).toBe('component-File');
    expect(file?.icon).toBeDefined();
    expect(file?.command).toBeFunction();
  });

  test('every entry exposes the SlashCommandItem contract', () => {
    const items = getComponentItems();
    for (const item of items) {
      expect(item.name).toMatch(/^component-/);
      expect(item.label).toBeString();
      expect(item.icon).toBeDefined();
      expect(item.category).toBeString();
      expect(item.command).toBeFunction();
    }
  });

  test('compat descriptors are absent — fresh inserts are canonical-only', () => {
    const items = getComponentItems();
    for (const compatName of ['CommonMarkImage', 'GFMCallout', 'HtmlDetailsAccordion']) {
      expect(items.some((i) => i.name === `component-${compatName}`)).toBe(false);
    }
  });
});

describe('createChildNode — default props on slash insert', () => {
  test('img: only declared defaults are pre-populated, no synthetic 0 / "" / first-enum', () => {
    const node = createChildNode('img');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.loading).toBe('lazy');
    expect(props.decoding).toBe('auto');
    expect(props.fetchpriority).toBe('auto');
    expect(props.src).toBe('');
    expect(props).not.toHaveProperty('alt');
    expect(props.width).toBeUndefined();
    expect(props.height).toBeUndefined();
    expect(props.srcset).toBeUndefined();
    expect(props.sizes).toBeUndefined();
    expect(props.title).toBeUndefined();
    expect(props.crossorigin).toBeUndefined();
    expect(props.referrerpolicy).toBeUndefined();
  });

  test('video: src="" (empty default for placeholder) and controls=true (declared); everything else unset', () => {
    const node = createChildNode('video');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.controls).toBe(true);
    expect(props.src).toBe('');
    expect(props.poster).toBeUndefined();
    expect(props.width).toBeUndefined();
    expect(props.height).toBeUndefined();
    expect(props.title).toBeUndefined();
  });

  test('audio: src="" (empty default for placeholder) and controls=true (declared); everything else unset', () => {
    const node = createChildNode('audio');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.controls).toBe(true);
    expect(props.src).toBe('');
    expect(props.title).toBeUndefined();
  });

  test('Tab: defaultValue label="Tab", empty paragraph body, id unset', () => {
    const node = createChildNode('Tab');
    expect((node as { type?: string }).type).toBe('jsxComponent');
    expect((node.attrs as { componentName?: string }).componentName).toBe('Tab');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.label).toBe('Tab');
    expect(props.id).toBeUndefined();
    const content = (node as { content?: unknown[] }).content;
    expect(Array.isArray(content)).toBe(true);
    expect((content as Array<{ type: string }>).length).toBe(1);
    expect((content as Array<{ type: string }>)[0].type).toBe('paragraph');
  });

  test('Tabs: id unset by default (no synthetic id="" emitted on roundtrip)', () => {
    const node = createChildNode('Tabs');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.id).toBeUndefined();
    const content = (node as { content?: unknown[] }).content;
    expect(Array.isArray(content)).toBe(true);
    expect((content as Array<{ type: string }>)[0].type).toBe('paragraph');
  });
});

describe('agent-surface ↔ slash-menu filter parity', () => {
  function broadCanonicalSet(): Set<string> {
    return new Set(getCanonicalDescriptors().map((d) => d.name));
  }

  function agentCanonicalSet(): Set<string> {
    return new Set(getAgentCanonicalDescriptors().map((d) => d.name));
  }

  function slashMenuCanonicalSet(): Set<string> {
    return new Set(
      builtInComponents
        .filter(
          (d) =>
            d.surface === 'canonical' && d.name !== '*' && !SLASH_HIDDEN_CANONICALS.has(d.name),
        )
        .map((d) => d.name),
    );
  }

  test('both surfaces are subsets of the broad canonical set', () => {
    const broad = broadCanonicalSet();
    for (const name of agentCanonicalSet()) {
      expect(broad.has(name)).toBe(true);
    }
    for (const name of slashMenuCanonicalSet()) {
      expect(broad.has(name)).toBe(true);
    }
  });

  test('broad set minus agent set === fence-kind names (today: just MermaidFence)', () => {
    const broad = broadCanonicalSet();
    const agent = agentCanonicalSet();
    const divergence = new Set([...broad].filter((name) => !agent.has(name)));
    expect(divergence).toEqual(new Set(['MermaidFence']));
  });

  test('broad set minus slash-menu set === SLASH_HIDDEN_CANONICALS exactly', () => {
    const broad = broadCanonicalSet();
    const slash = slashMenuCanonicalSet();
    const divergence = new Set([...broad].filter((name) => !slash.has(name)));
    expect(divergence).toEqual(new Set(SLASH_HIDDEN_CANONICALS));
  });

  test('intersection covers every canonical NOT in either curation set (9 names today)', () => {
    const agent = agentCanonicalSet();
    const slash = slashMenuCanonicalSet();
    const intersection = new Set([...agent].filter((name) => slash.has(name)));
    expect(intersection.size).toBe(9);
  });

  test('agent surface excludes wildcard descriptor', () => {
    expect(agentCanonicalSet().has('*')).toBe(false);
  });

  test('agent surface excludes every compat descriptor', () => {
    const agent = agentCanonicalSet();
    for (const d of builtInComponents) {
      if (d.surface === 'compat') {
        expect(agent.has(d.name)).toBe(false);
      }
    }
  });
});

describe('getInlineComponentItems — inline-atom slash entries', () => {
  test('returns the Tag entry with the SlashCommandItem contract', () => {
    const items = getInlineComponentItems();
    expect(items.length).toBe(1);
    const tag = items[0];
    expect(tag.name).toBe('component-Tag');
    expect(tag.label).toBe('Tag');
    expect(tag.category).toBe('content');
    expect(tag.icon).toBeDefined();
    expect(tag.command).toBeFunction();
    expect(tag.aliases).toContain('hashtag');
    expect(tag.aliases).toContain('#');
  });

  test('command inserts an empty `tag` atom WITHOUT leading focus() (NodeView grabs focus)', () => {
    let chainFocusCalled = false;
    let inserted = false;
    let insertedValue: string | undefined;
    const editor = {
      chain: () => ({
        focus: () => {
          chainFocusCalled = true;
          return {
            insertTag: (value: string) => ({
              run: () => {
                inserted = true;
                insertedValue = value;
              },
            }),
          };
        },
        insertTag: (value: string) => ({
          run: () => {
            inserted = true;
            insertedValue = value;
          },
        }),
      }),
    };
    getInlineComponentItems()[0].command(editor as never);
    expect(inserted).toBe(true);
    expect(insertedValue).toBe('');
    expect(chainFocusCalled).toBe(false);
  });
});
