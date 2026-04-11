import { describe, expect, test } from 'bun:test';
import { componentManifest } from '@inkeep/open-knowledge-core';
import { getComponentItems } from './component-items';
import { filterItems, slashCommandItems } from './items';

describe('component items adapter', () => {
  test('returns one item per manifest entry', () => {
    const items = getComponentItems();
    expect(items).toHaveLength(Object.keys(componentManifest).length);
  });

  test('every item has the required SlashCommandItem fields', () => {
    for (const item of getComponentItems()) {
      expect(item.name).toBeString();
      expect(item.label).toBeString();
      expect(item.icon).toBeDefined();
      expect(item.category).toBeString();
      expect(item.command).toBeFunction();
    }
  });

  test('no name collisions with built-in slash command items', () => {
    const componentNames = new Set(getComponentItems().map((i) => i.name));
    const builtinNames = new Set(slashCommandItems.map((i) => i.name));
    for (const name of componentNames) {
      expect(builtinNames.has(name)).toBe(false);
    }
  });

  test('component items are filterable via filterItems', () => {
    const items = getComponentItems();
    const callouts = filterItems(items, 'callout');
    expect(callouts.length).toBeGreaterThan(0);
    expect(callouts.every((i) => i.label.toLowerCase().includes('callout'))).toBe(true);
  });

  test('component items use categories from the registry', () => {
    const categories = new Set(getComponentItems().map((i) => i.category));
    // The manifest defines content/layout/media/data categories
    expect(categories.size).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(['content', 'layout', 'media', 'data']).toContain(cat);
    }
  });

  test('merged items from both sources are filterable together', () => {
    const all = [...slashCommandItems, ...getComponentItems()];
    // Built-in: heading matches
    expect(filterItems(all, 'heading').length).toBeGreaterThan(0);
    // Component: callout matches
    expect(filterItems(all, 'callout').length).toBeGreaterThan(0);
    // No match
    expect(filterItems(all, 'zzzznonexistent')).toEqual([]);
  });
});
