import { describe, expect, test } from 'bun:test';
import { createChildNode, getComponentItems, getInlineComponentItems } from './component-items';

describe('getComponentItems (descriptor-driven slash menu)', () => {
  test('returns exactly the canonical descriptors (5-pack + Math + Mermaid + Pdf)', () => {
    const items = getComponentItems();
    const labels = items.map((i) => i.label).sort();
    expect(labels).toEqual(
      ['Accordion', 'Audio', 'Callout', 'Image', 'Math', 'Mermaid', 'PDF', 'Video'].sort(),
    );
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
    expect(props.alt).toBe('');
    expect(props.src).toBe('');
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
