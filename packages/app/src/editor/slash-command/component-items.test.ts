/**
 * `getComponentItems()` returns the descriptor-driven slash-menu entries by
 * filtering the registered descriptors to the canonical surface. Post-cb-v2
 * 5-pack the canonical set is exactly: Callout, Image, Video, Audio,
 * Accordion. Compat descriptors (CommonMarkImage, GFMCallout,
 * HtmlDetailsAccordion) are read-only and never offered for fresh insertion.
 */
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
    // The compat descriptors' names: 'CommonMarkImage', 'GFMCallout',
    // 'HtmlDetailsAccordion'. None should appear (filter is `surface ===
    // 'canonical'` per component-items.ts:203).
    for (const compatName of ['CommonMarkImage', 'GFMCallout', 'HtmlDetailsAccordion']) {
      expect(items.some((i) => i.name === `component-${compatName}`)).toBe(false);
    }
  });
});

describe('createChildNode — default props on slash insert', () => {
  test('img: only declared defaults are pre-populated, no synthetic 0 / "" / first-enum', () => {
    // The img descriptor declares defaults for `loading: 'lazy'`,
    // `decoding: 'auto'`, `fetchpriority: 'auto'`, `alt: ''`, and
    // `src: ''` (the empty default is intentional — the placeholder
    // predicate keys off `src === ''` to surface the "Add an image"
    // pill on slash insert; authored markdown `<img />` parses to
    // `src: undefined` and skips the pill).
    // Everything else (width, height, srcset, sizes, title,
    // crossorigin, referrerpolicy) has no declared default and must
    // stay unset so PropPanel renders empty inputs and the next
    // serialize doesn't emit `<img width={0} crossorigin="anonymous"
    // srcset="" />` to disk.
    const node = createChildNode('img');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.loading).toBe('lazy');
    expect(props.decoding).toBe('auto');
    expect(props.fetchpriority).toBe('auto');
    expect(props.alt).toBe('');
    expect(props.src).toBe('');
    // Unset (no declared default):
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
