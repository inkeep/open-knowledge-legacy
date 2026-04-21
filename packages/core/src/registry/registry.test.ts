import { describe, expect, test } from 'bun:test';
import { builtInComponents, createRegistry, wildcardMeta } from './index.ts';
import type { JsxComponentMeta } from './types.ts';

describe('createRegistry', () => {
  test('returns all 17 built-in components + wildcard', () => {
    const registry = createRegistry();
    // 17 built-ins + 1 wildcard (Mermaid removed 2026-04-21 — stub was non-functional)
    const entries = [...registry.entries()];
    expect(entries.length).toBe(18);
  });

  test('get returns registered component by name', () => {
    const registry = createRegistry();
    const callout = registry.get('Callout');
    expect(callout).toBeDefined();
    expect(callout?.name).toBe('Callout');
    expect(callout?.hasChildren).toBe(true);
    expect(callout?.props.length).toBeGreaterThan(0);
    expect(callout?.category).toBe('content');
  });

  test('get returns undefined for unregistered names', () => {
    const registry = createRegistry();
    expect(registry.get('DataViz')).toBeUndefined();
  });

  test('getOrWildcard returns wildcard meta for unregistered names', () => {
    const registry = createRegistry();
    const unknown = registry.getOrWildcard('DataViz');
    expect(unknown.name).toBe('*');
    expect(unknown.hasChildren).toBe(true);
    expect(unknown.props.length).toBe(0);
  });

  test('registry.set() followed by get() picks up new descriptor (M3 hot-add)', () => {
    const registry = createRegistry();

    // Before: DataViz is unregistered
    expect(registry.get('DataViz')).toBeUndefined();
    expect(registry.getOrWildcard('DataViz').name).toBe('*');

    // Hot-add
    const dataVizMeta: JsxComponentMeta = {
      name: 'DataViz',
      hasChildren: true,
      props: [
        { name: 'chartType', type: 'enum', enumValues: ['bar', 'line', 'pie'], required: true },
      ],
      category: 'data',
      description: 'Data visualization chart',
    };
    registry.set('DataViz', dataVizMeta);

    // After: DataViz returns the new descriptor
    const result = registry.get('DataViz');
    expect(result).toBeDefined();
    expect(result?.name).toBe('DataViz');
    expect(result?.props.length).toBe(1);
    expect(result?.props[0].name).toBe('chartType');
  });

  test("wildcard has name '*', hasChildren:true, empty props", () => {
    expect(wildcardMeta.name).toBe('*');
    expect(wildcardMeta.hasChildren).toBe(true);
    expect(wildcardMeta.props).toEqual([]);
  });

  test('registry.has returns true for registered, false for unknown', () => {
    const registry = createRegistry();
    expect(registry.has('Callout')).toBe(true);
    expect(registry.has('Steps')).toBe(true);
    expect(registry.has('*')).toBe(true);
    expect(registry.has('DataViz')).toBe(false);
  });
});

describe('builtInComponents manifest', () => {
  test('contains exactly 17 entries', () => {
    expect(builtInComponents.length).toBe(17);
  });

  test('all entries have required fields', () => {
    for (const meta of builtInComponents) {
      expect(meta.name).toBeTruthy();
      expect(typeof meta.hasChildren).toBe('boolean');
      expect(Array.isArray(meta.props)).toBe(true);
    }
  });

  test('all entries have description and searchTerms', () => {
    for (const meta of builtInComponents) {
      expect(meta.description).toBeTruthy();
      expect(Array.isArray(meta.searchTerms)).toBe(true);
      expect(meta.searchTerms?.length).toBeGreaterThan(0);
    }
  });

  test('container components have emptyChildName', () => {
    const containers = builtInComponents.filter((m) => m.emptyChildName);
    const names = containers.map((c) => `${c.name}→${c.emptyChildName}`).sort();
    expect(names).toEqual([
      'Accordions→Accordion',
      'Cards→Card',
      'Files→File',
      'Folder→File',
      'Steps→Step',
      'Tabs→Tab',
    ]);
  });

  test('Callout has correct enum values for type prop', () => {
    const callout = builtInComponents.find((m) => m.name === 'Callout');
    expect(callout).toBeDefined();
    if (!callout) return;
    const typeProp = callout.props.find((p) => p.name === 'type');
    expect(typeProp).toBeDefined();
    expect(typeProp?.type).toBe('enum');
    if (typeProp?.type === 'enum') {
      expect(typeProp?.enumValues).toContain('info');
      expect(typeProp?.enumValues).toContain('warn');
      expect(typeProp?.enumValues).toContain('error');
      expect(typeProp?.enumValues).toContain('success');
    }
  });

  test('each name is unique', () => {
    const names = builtInComponents.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('category is always a valid value', () => {
    const validCategories = new Set(['content', 'layout', 'media', 'data']);
    for (const meta of builtInComponents) {
      if (meta.category) {
        expect(validCategories.has(meta.category)).toBe(true);
      }
    }
  });

  test("no name collides with wildcard '*'", () => {
    const names = builtInComponents.map((m) => m.name);
    expect(names).not.toContain('*');
  });
});
