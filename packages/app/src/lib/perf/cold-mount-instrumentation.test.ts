import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Extension } from '@tiptap/core';
import { wrapExtensionsWithTiming } from './cold-mount-instrumentation';
import { getCollector } from './collector';

interface ParentScope {
  parent?: (() => void) | null;
}

function clearMeasures(): void {
  try {
    performance.clearMeasures();
  } catch {}
}

function getMarkNames(): string[] {
  return performance.getEntriesByType('measure').map((e) => e.name);
}

describe('wrapExtensionsWithTiming', () => {
  beforeEach(() => {
    getCollector()?.reset();
    clearMeasures();
  });

  afterEach(() => {
    clearMeasures();
  });

  test('preserves extension name + identity (returns derived extension)', () => {
    const original = Extension.create({ name: 'wikiLink' });
    const [wrapped] = wrapExtensionsWithTiming([original]);
    expect(wrapped.name).toBe('wikiLink');
    expect((wrapped as unknown as { parent?: unknown }).parent).toBe(original);
  });

  test('returns array of same length, in same order', () => {
    const a = Extension.create({ name: 'extA' });
    const b = Extension.create({ name: 'extB' });
    const c = Extension.create({ name: 'extC' });
    const out = wrapExtensionsWithTiming([a, b, c]);
    expect(out).toHaveLength(3);
    expect(out[0].name).toBe('extA');
    expect(out[1].name).toBe('extB');
    expect(out[2].name).toBe('extC');
  });

  test('emits ok/cold/ext-{name}-on-create when child onCreate fires', () => {
    const ext = Extension.create({ name: 'wikiLink' });
    const [wrapped] = wrapExtensionsWithTiming([ext]);
    const onCreate = (wrapped as unknown as { config: { onCreate?: (this: ParentScope) => void } })
      .config.onCreate;
    expect(typeof onCreate).toBe('function');
    onCreate?.call({ parent: null } as ParentScope);
    const names = getMarkNames();
    expect(names).toContain('ok/cold/ext-wiki-link-on-create');
  });

  test('emits all four lifecycle marks (onBeforeCreate, onCreate, onUpdate, onDestroy)', () => {
    const ext = Extension.create({ name: 'plain' });
    const [wrapped] = wrapExtensionsWithTiming([ext]);
    const cfg = (
      wrapped as unknown as {
        config: {
          onBeforeCreate?: (this: ParentScope) => void;
          onCreate?: (this: ParentScope) => void;
          onUpdate?: (this: ParentScope) => void;
          onDestroy?: (this: ParentScope) => void;
        };
      }
    ).config;
    cfg.onBeforeCreate?.call({ parent: null });
    cfg.onCreate?.call({ parent: null });
    cfg.onUpdate?.call({ parent: null });
    cfg.onDestroy?.call({ parent: null });
    const names = getMarkNames();
    expect(names).toContain('ok/cold/ext-plain-on-before-create');
    expect(names).toContain('ok/cold/ext-plain-on-create');
    expect(names).toContain('ok/cold/ext-plain-on-update');
    expect(names).toContain('ok/cold/ext-plain-on-destroy');
  });

  test('lowercases + dashes camelCase / PascalCase extension names', () => {
    const a = Extension.create({ name: 'wikiLinkEmbed' });
    const b = Extension.create({ name: 'JsxComponent' });
    const c = Extension.create({ name: 'simple' });
    const wrapped = wrapExtensionsWithTiming([a, b, c]);
    for (const w of wrapped) {
      const onCreate = (w as unknown as { config: { onCreate?: (this: ParentScope) => void } })
        .config.onCreate;
      onCreate?.call({ parent: null });
    }
    const names = getMarkNames();
    expect(names).toContain('ok/cold/ext-wiki-link-embed-on-create');
    expect(names).toContain('ok/cold/ext-jsx-component-on-create');
    expect(names).toContain('ok/cold/ext-simple-on-create');
  });

  test('calls this.parent?.() so user-supplied hooks still fire', () => {
    let parentCalls = 0;
    const ext = Extension.create({
      name: 'parentExt',
      onCreate() {
        parentCalls += 1;
      },
    });
    const [wrapped] = wrapExtensionsWithTiming([ext]);
    const onCreate = (wrapped as unknown as { config: { onCreate?: (this: ParentScope) => void } })
      .config.onCreate;
    onCreate?.call({
      parent: () => {
        parentCalls += 1;
      },
    });
    expect(parentCalls).toBe(1);
  });

  test('emits mark even when parent throws (try/finally invariant)', () => {
    const ext = Extension.create({ name: 'throwing' });
    const [wrapped] = wrapExtensionsWithTiming([ext]);
    const onCreate = (wrapped as unknown as { config: { onCreate?: (this: ParentScope) => void } })
      .config.onCreate;
    expect(() =>
      onCreate?.call({
        parent: () => {
          throw new Error('parent boom');
        },
      }),
    ).toThrow('parent boom');
    const names = getMarkNames();
    expect(names).toContain('ok/cold/ext-throwing-on-create');
  });

  test('mark detail carries ext name + hook + durationMs property', () => {
    const ext = Extension.create({ name: 'wikiLink' });
    const [wrapped] = wrapExtensionsWithTiming([ext]);
    const onCreate = (wrapped as unknown as { config: { onCreate?: (this: ParentScope) => void } })
      .config.onCreate;
    onCreate?.call({ parent: null });
    const entries = performance.getEntriesByName(
      'ok/cold/ext-wiki-link-on-create',
    ) as PerformanceMeasure[];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const last = entries[entries.length - 1];
    const detail = last.detail as {
      devtools: { dataType: string; track: string; properties?: Array<[string, string]> };
    };
    expect(detail.devtools.dataType).toBe('track-entry');
    expect(detail.devtools.track).toBe('ok/cold');
    const propMap = Object.fromEntries(detail.devtools.properties ?? []);
    expect(propMap.ext).toBe('wikiLink');
    expect(propMap.hook).toBe('onCreate');
    expect(typeof propMap.durationMs).toBe('string');
  });

  test('handles empty extension array', () => {
    expect(wrapExtensionsWithTiming([])).toEqual([]);
  });

  test('handles extension whose parent has no hook (this.parent is null)', () => {
    const ext = Extension.create({ name: 'noHook' });
    const [wrapped] = wrapExtensionsWithTiming([ext]);
    const onCreate = (wrapped as unknown as { config: { onCreate?: (this: ParentScope) => void } })
      .config.onCreate;
    expect(() => onCreate?.call({ parent: null })).not.toThrow();
    const names = getMarkNames();
    expect(names).toContain('ok/cold/ext-no-hook-on-create');
  });
});
