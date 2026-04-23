import { describe, expect, test } from 'bun:test';
import { builtInComponents, createRegistry, wildcardMeta } from './index.ts';
import type { JsxComponentMeta } from './types.ts';

describe('createRegistry', () => {
  test('returns the partial 5-pack (3 registered + wildcard) after US-003 narrow', () => {
    // US-003 cut 14 fumadocs descriptors; Callout/Image/Audio stay. Video + Accordion
    // land in US-007 / US-009 via `coreRegistry.set(...)` once their descriptors ship.
    const registry = createRegistry();
    const entries = [...registry.entries()];
    expect(entries.length).toBe(4);
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
    expect(registry.has('Image')).toBe(true);
    expect(registry.has('Audio')).toBe(true);
    expect(registry.has('*')).toBe(true);
    // Cut-in-US-003 descriptors (Steps, Cards, Tabs, etc.) are no longer registered —
    // user content using those names falls through to wildcard via `getOrWildcard`.
    expect(registry.has('Steps')).toBe(false);
    expect(registry.has('DataViz')).toBe(false);
  });
});

describe('builtInComponents manifest', () => {
  test('contains exactly 3 entries (partial 5-pack — Video in US-007, Accordion in US-009)', () => {
    expect(builtInComponents.length).toBe(3);
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

  test('no registered descriptor has emptyChildName (5-pack is standalone-first — no compound parents)', () => {
    // US-002/US-003 retired the compound-components bridge (precedent #27
    // retracted on this branch). The surviving 5-pack descriptors ship without
    // `emptyChildName` — they render standalone, not as compound parents.
    // NG19 preserves the compound-tier revival path via PR #165 branch.
    const containers = builtInComponents.filter((m) => m.emptyChildName);
    const names = containers.map((c) => `${c.name}→${c.emptyChildName}`).sort();
    expect(names).toEqual([]);
  });

  test('Callout has correct enum values for type prop', () => {
    // US-003 holds the enum at its 6-value pre-narrow shape. US-005 tightens
    // to the GFM 5-type set (note/tip/important/warning/caution) per D-MF11.
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
