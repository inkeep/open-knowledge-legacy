import { describe, expect, test } from 'bun:test';
import { filterItems, type SlashCommandItem, slashCommandItems } from './items';

describe('filterItems', () => {
  test('empty query returns all items', () => {
    expect(filterItems(slashCommandItems, '')).toEqual(slashCommandItems);
  });

  test('filters by label (case-insensitive)', () => {
    const result = filterItems(slashCommandItems, 'heading');
    expect(result.map((i) => i.name)).toEqual(['heading1', 'heading2', 'heading3']);
  });

  test('filters by name', () => {
    const result = filterItems(slashCommandItems, 'bulletList');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('bulletList');
  });

  test('filters by alias', () => {
    const result = filterItems(slashCommandItems, 'h1');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('heading1');
  });

  test('partial match works', () => {
    const result = filterItems(slashCommandItems, 'head');
    expect(result.map((i) => i.name)).toEqual(['heading1', 'heading2', 'heading3']);
  });

  test('uppercase query matches (case-insensitive)', () => {
    const result = filterItems(slashCommandItems, 'HEADING');
    expect(result.map((i) => i.name)).toEqual(['heading1', 'heading2', 'heading3']);
  });

  test('alias matching is case-insensitive on the alias side', () => {
    const items: SlashCommandItem[] = [
      {
        name: 'test',
        label: 'Test',
        icon: () => null,
        category: 'basic',
        command: () => {},
        aliases: ['MyAlias'],
      },
    ];
    expect(filterItems(items, 'myalias')).toHaveLength(1);
    expect(filterItems(items, 'MYALIAS')).toHaveLength(1);
  });

  test('no match returns empty array', () => {
    expect(filterItems(slashCommandItems, 'xyz')).toEqual([]);
  });

  test('items without aliases do not crash', () => {
    const items: SlashCommandItem[] = [
      {
        name: 'test',
        label: 'Test',
        icon: () => null,
        category: 'basic',
        command: () => {},
      },
    ];
    expect(filterItems(items, 'test')).toHaveLength(1);
    expect(filterItems(items, 'xyz')).toHaveLength(0);
  });
});

describe('slashCommandItems', () => {
  test('contains exactly 10 built-in items', () => {
    expect(slashCommandItems).toHaveLength(10);
  });

  test('all items have required fields', () => {
    for (const item of slashCommandItems) {
      expect(item.name).toBeString();
      expect(item.label).toBeString();
      expect(item.icon).toBeDefined();
      expect(item.category).toBeString();
      expect(item.command).toBeFunction();
    }
  });

  test('all item names are unique', () => {
    const names = slashCommandItems.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('categories are basic or insert', () => {
    const categories = new Set(slashCommandItems.map((i) => i.category));
    expect(categories).toEqual(new Set(['basic', 'insert']));
  });
});
