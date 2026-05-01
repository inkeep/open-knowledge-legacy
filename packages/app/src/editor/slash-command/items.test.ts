import { describe, expect, test } from 'bun:test';
import { filterItems, type SlashCommandItem, slashCommandItems } from './items';

describe('filterItems', () => {
  test('empty query returns all provided items', () => {
    expect(filterItems(slashCommandItems, '')).toEqual(slashCommandItems);
  });

  test('matches items by label substring', () => {
    const result = filterItems(slashCommandItems, 'heading');
    expect(result.every((i) => i.label.toLowerCase().includes('heading'))).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('matches items by name', () => {
    const result = filterItems(slashCommandItems, 'bulletList');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('bulletList');
  });

  test('matches items by alias', () => {
    const result = filterItems(slashCommandItems, 'h1');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('heading1');
  });

  test('partial queries narrow results progressively', () => {
    const broad = filterItems(slashCommandItems, 'h');
    const narrow = filterItems(slashCommandItems, 'heading');
    expect(narrow.length).toBeLessThanOrEqual(broad.length);
    expect(narrow.length).toBeGreaterThan(0);
  });

  test('query matching is case-insensitive', () => {
    const lower = filterItems(slashCommandItems, 'heading');
    const upper = filterItems(slashCommandItems, 'HEADING');
    expect(upper).toEqual(lower);
  });

  test('alias matching is case-insensitive on both sides', () => {
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
    expect(filterItems(slashCommandItems, 'zzzznonexistent')).toEqual([]);
  });

  test('items without aliases are still matchable by name and label', () => {
    const items: SlashCommandItem[] = [
      {
        name: 'noalias',
        label: 'No Alias Item',
        icon: () => null,
        category: 'basic',
        command: () => {},
      },
    ];
    expect(filterItems(items, 'noalias')).toHaveLength(1);
    expect(filterItems(items, 'No Alias')).toHaveLength(1);
    expect(filterItems(items, 'xyz')).toHaveLength(0);
  });
});

describe('built-in slash command items', () => {
  test('every item has a name, label, icon, category, and command', () => {
    for (const item of slashCommandItems) {
      expect(item.name).toBeString();
      expect(item.label).toBeString();
      expect(item.icon).toBeDefined();
      expect(item.category).toBeString();
      expect(item.command).toBeFunction();
    }
  });

  test('no two items share the same name', () => {
    const names = slashCommandItems.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every item is findable by its own name via filterItems', () => {
    for (const item of slashCommandItems) {
      const found = filterItems(slashCommandItems, item.name);
      expect(found.some((i) => i.name === item.name)).toBe(true);
    }
  });

  test('legacy file-upload "image" slash item is removed', () => {
    expect(slashCommandItems.some((i) => i.name === 'image')).toBe(false);
    expect(slashCommandItems.some((i) => i.aliases?.includes('img'))).toBe(false);
  });
});
