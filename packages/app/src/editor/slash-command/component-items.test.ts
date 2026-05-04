import { describe, expect, test } from 'bun:test';
import { createChildNode, getComponentItems } from './component-items';

describe('getComponentItems (descriptor-driven slash menu)', () => {
  test('returns exactly the 5-pack canonical descriptors', () => {
    const items = getComponentItems();
    const labels = items.map((i) => i.label).sort();
    expect(labels).toEqual(['Accordion', 'Audio', 'Callout', 'Image', 'Video']);
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
