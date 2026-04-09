/**
 * Tests for the slash command extension's item filtering and command execution.
 */

import { describe, expect, test } from 'bun:test';
import { componentManifest } from '@inkeep/open-knowledge-core';

// Re-implement the items filter logic here to test it in isolation
// (the actual Suggestion plugin binds to a live editor, but the filtering is pure logic)
function getAllItems() {
  return Object.entries(componentManifest).map(([name, meta]) => ({ name, meta }));
}

function filterItems(query: string) {
  const all = getAllItems();
  if (!query) return all;
  const lower = query.toLowerCase();
  return all.filter(
    (item) =>
      item.name.toLowerCase().includes(lower) ||
      item.meta.displayName.toLowerCase().includes(lower) ||
      item.meta.category.toLowerCase().includes(lower) ||
      item.meta.searchTerms?.some((term) => term.toLowerCase().includes(lower)),
  );
}

describe('slash command items', () => {
  test('getAllItems returns all manifest entries', () => {
    const items = getAllItems();
    expect(items.length).toBe(Object.keys(componentManifest).length);
    expect(items.length).toBeGreaterThanOrEqual(15);
  });

  test('every item has name and meta', () => {
    for (const item of getAllItems()) {
      expect(item.name).toBeTruthy();
      expect(item.meta).toBeDefined();
      expect(item.meta.displayName).toBeTruthy();
      expect(item.meta.category).toBeTruthy();
    }
  });

  test('filtering by "cal" returns Callout', () => {
    const items = filterItems('cal');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.name === 'Callout')).toBe(true);
  });

  test('filtering by "tab" returns Tabs and Tab', () => {
    const items = filterItems('tab');
    const names = items.map((i) => i.name);
    expect(names).toContain('Tab');
    expect(names).toContain('Tabs');
  });

  test('filtering by category "media" returns media components', () => {
    const items = filterItems('media');
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.meta.category).toBe('media');
    }
  });

  test('filtering by empty string returns all items', () => {
    const items = filterItems('');
    expect(items.length).toBe(getAllItems().length);
  });

  test('filtering by nonexistent name returns empty', () => {
    const items = filterItems('zzzznonexistent');
    expect(items.length).toBe(0);
  });

  test('filter is case-insensitive', () => {
    const items = filterItems('CALLOUT');
    expect(items.some((i) => i.name === 'Callout')).toBe(true);
  });

  test('filtering by searchTerm "note" returns Callout', () => {
    const items = filterItems('note');
    expect(items.some((i) => i.name === 'Callout')).toBe(true);
  });

  test('filtering by searchTerm "diagram" returns Mermaid', () => {
    const items = filterItems('diagram');
    expect(items.some((i) => i.name === 'Mermaid')).toBe(true);
  });

  test('filtering by searchTerm "embed" returns Frame', () => {
    const items = filterItems('embed');
    expect(items.some((i) => i.name === 'Frame')).toBe(true);
  });
});
