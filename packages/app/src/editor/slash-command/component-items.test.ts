/**
 * `getComponentItems()` returns the descriptor-driven slash-menu entries by
 * filtering the registered descriptors to the canonical surface. Post-cb-v2
 * 5-pack the canonical set is exactly: Callout, Image, Video, Audio,
 * Accordion. Compat descriptors (CommonMarkImage, GFMCallout,
 * HtmlDetailsAccordion) are read-only and never offered for fresh insertion.
 */
import { describe, expect, test } from 'bun:test';
import { getComponentItems } from './component-items';

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
