/**
 * Slash command extension — pluggable API integration tests.
 *
 * Verifies E01-E04 from SPEC §7 by exercising the real `SlashCommand` extension's
 * option resolution through the real TipTap `Extension.configure()` machinery
 * (Level-2 verification: real component, no DOM, no Editor instance — TipTap's
 * Editor requires a `window` global which Bun's test runner doesn't provide).
 *
 * What this proves about the extension that source-reading and `filterItems`
 * unit tests cannot:
 *
 * - The extension's `addOptions()` produces the documented defaults
 * - `SlashCommand.configure({ itemsSources: [...] })` REPLACES the default array
 *   (TipTap arrays are not deep-merged)
 * - `SlashCommand.configure({ categoryLabels: {...} })` DEEP-MERGES into the
 *   default object (TipTap deep-merges plain objects)
 * - The same flat-map + filterItems flow that the runtime `items()` callback
 *   uses produces the expected merged result for multi-source configurations
 *
 * Together with the runtime Playwright regression suite (R01-R17 + POS-01-04),
 * this gives us full coverage of the extensibility surface area without
 * requiring a browser harness for each variant.
 */

import { describe, expect, test } from 'bun:test';
import { Minus } from 'lucide-react';
import { SlashCommand, type SlashCommandOptions } from '../../src/editor/extensions/slash-command';
import {
  filterItems,
  type SlashCommandItem,
  slashCommandItems,
} from '../../src/editor/slash-command/items';

function makeCustomItem(overrides: Partial<SlashCommandItem> = {}): SlashCommandItem {
  return {
    name: 'test-item',
    label: 'Test Item',
    icon: Minus,
    category: 'custom',
    command: () => {},
    ...overrides,
  };
}

/** Mirror of the runtime Suggestion `items()` callback in slash-command.ts. */
function resolveItems(opts: SlashCommandOptions, query = ''): SlashCommandItem[] {
  const allItems = opts.itemsSources.flatMap((source) => source());
  return filterItems(allItems, query);
}

describe('SlashCommand pluggable API — option resolution', () => {
  test('default options reproduce shared.ts behavior (no .configure() call site)', () => {
    // Default options come from addOptions() — no configure call
    const opts = SlashCommand.options as SlashCommandOptions;

    expect(opts.itemsSources).toHaveLength(1);
    const defaultItems = opts.itemsSources[0]?.();
    expect(defaultItems).toEqual(slashCommandItems);

    expect(opts.categoryLabels).toEqual({
      basic: 'Basic blocks',
      insert: 'Insert',
    });

    // The full resolved item set is exactly the 10 built-in items
    const resolved = resolveItems(opts);
    expect(resolved).toHaveLength(10);
    expect(resolved.map((i) => i.name)).toEqual([
      'heading1',
      'heading2',
      'heading3',
      'bulletList',
      'orderedList',
      'taskList',
      'blockquote',
      'codeBlock',
      'table',
      'separator',
    ]);
  });

  test('E01: itemsSources merges additional source into resolved items', () => {
    const customItem = makeCustomItem({ name: 'merge-test', category: 'custom' });
    const ext = SlashCommand.configure({
      itemsSources: [() => slashCommandItems, () => [customItem]],
    });
    const opts = ext.options as SlashCommandOptions;

    expect(opts.itemsSources).toHaveLength(2);

    const resolved = resolveItems(opts);
    expect(resolved).toHaveLength(slashCommandItems.length + 1);
    expect(resolved.find((i) => i.name === 'merge-test')).toBeDefined();
    // Built-ins still present
    expect(resolved.find((i) => i.name === 'heading1')).toBeDefined();
    expect(resolved.find((i) => i.name === 'table')).toBeDefined();
  });

  test('E02: categoryLabels deep-merges custom labels into defaults', () => {
    const ext = SlashCommand.configure({
      categoryLabels: { custom: 'My Category', media: 'Media' },
    });
    const opts = ext.options as SlashCommandOptions;

    // Custom labels added
    expect(opts.categoryLabels.custom).toBe('My Category');
    expect(opts.categoryLabels.media).toBe('Media');
    // Default labels preserved (TipTap deep-merges plain objects)
    expect(opts.categoryLabels.basic).toBe('Basic blocks');
    expect(opts.categoryLabels.insert).toBe('Insert');
  });

  test('E03: replacing itemsSources with a custom-only source removes defaults', () => {
    const customItem = makeCustomItem({ name: 'only-item' });
    const ext = SlashCommand.configure({
      itemsSources: [() => [customItem]],
    });
    const opts = ext.options as SlashCommandOptions;

    expect(opts.itemsSources).toHaveLength(1);

    const resolved = resolveItems(opts);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.name).toBe('only-item');
    // Built-in items NOT present (array-replace semantics, not merge)
    expect(resolved.find((i) => i.name === 'heading1')).toBeUndefined();
    expect(resolved.find((i) => i.name === 'table')).toBeUndefined();
  });

  test('E04: optional description field on a custom item does not break merging', () => {
    const customItem = makeCustomItem({
      name: 'with-desc',
      description: 'A test item with a description',
    });
    const ext = SlashCommand.configure({
      itemsSources: [() => slashCommandItems, () => [customItem]],
    });
    const opts = ext.options as SlashCommandOptions;
    const resolved = resolveItems(opts);

    const found = resolved.find((i) => i.name === 'with-desc');
    expect(found).toBeDefined();
    expect(found?.description).toBe('A test item with a description');
    // Built-in items (which lack description) still resolve fine
    expect(resolved.find((i) => i.name === 'heading1')?.description).toBeUndefined();
  });

  test('Multiple sources with the same category — items merge in source order', () => {
    const itemA = makeCustomItem({ name: 'item-a', category: 'shared' });
    const itemB = makeCustomItem({ name: 'item-b', category: 'shared' });
    const ext = SlashCommand.configure({
      itemsSources: [() => [itemA], () => [itemB]],
      categoryLabels: { shared: 'Shared' },
    });
    const opts = ext.options as SlashCommandOptions;
    const resolved = resolveItems(opts);

    // Source order: itemA (from source 0) before itemB (from source 1)
    expect(resolved.map((i) => i.name)).toEqual(['item-a', 'item-b']);
    expect(resolved.every((i) => i.category === 'shared')).toBe(true);
  });

  test('Empty itemsSources array resolves to zero items (no fallback to defaults)', () => {
    const ext = SlashCommand.configure({
      itemsSources: [],
    });
    const opts = ext.options as SlashCommandOptions;
    expect(opts.itemsSources).toHaveLength(0);
    expect(resolveItems(opts)).toHaveLength(0);
  });

  test('Filter narrows merged items by query (case-insensitive across all sources)', () => {
    const componentItem = makeCustomItem({
      name: 'callout',
      label: 'Callout',
      category: 'component',
      aliases: ['warn', 'note'],
    });
    const ext = SlashCommand.configure({
      itemsSources: [() => slashCommandItems, () => [componentItem]],
    });
    const opts = ext.options as SlashCommandOptions;

    // Built-in match
    expect(resolveItems(opts, 'heading').map((i) => i.name)).toEqual([
      'heading1',
      'heading2',
      'heading3',
    ]);

    // Custom item match by label
    expect(resolveItems(opts, 'call').map((i) => i.name)).toEqual(['callout']);

    // Custom item match by alias (case-insensitive both sides — Phase 8 review fix)
    expect(resolveItems(opts, 'WARN').map((i) => i.name)).toEqual(['callout']);

    // No-match
    expect(resolveItems(opts, 'xyz')).toEqual([]);
  });
});
