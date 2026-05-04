import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getCollector } from './collector';
import { mark, validatePerfMarkName } from './mark';

describe('validatePerfMarkName', () => {
  test('accepts canonical ok/<subsystem>/<event>', () => {
    expect(validatePerfMarkName('ok/sync/resolve')).toBe(true);
    expect(validatePerfMarkName('ok/nav/hash-change')).toBe(true);
    expect(validatePerfMarkName('ok/activity/mode-flip')).toBe(true);
    expect(validatePerfMarkName('ok/render/app')).toBe(true);
    expect(validatePerfMarkName('ok/vitals/inp')).toBe(true);
  });

  test('rejects missing ok/ prefix', () => {
    expect(validatePerfMarkName('sync/resolve')).toBe(false);
  });

  test('rejects missing event segment', () => {
    expect(validatePerfMarkName('ok/sync')).toBe(false);
  });

  test('rejects uppercase or snake_case', () => {
    expect(validatePerfMarkName('ok/Sync/resolve')).toBe(false);
    expect(validatePerfMarkName('ok/sync/RESOLVE')).toBe(false);
    expect(validatePerfMarkName('ok/sync/snake_case')).toBe(false);
  });
});

describe('mark', () => {
  beforeEach(() => {
    getCollector()?.reset();
  });

  afterEach(() => {
    try {
      performance.clearMeasures();
    } catch {}
  });

  test('creates a performance entry with the given name', () => {
    mark('ok/test/emit-one');
    const entries = performance.getEntriesByName('ok/test/emit-one');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].entryType).toBe('measure');
  });

  test('performance entry carries devtools track-entry detail', () => {
    mark('ok/sync/resolve', { docName: 'README', elapsedMs: 42 });
    const entries = performance.getEntriesByName('ok/sync/resolve') as PerformanceMeasure[];
    const last = entries[entries.length - 1];
    const detail = last.detail as {
      devtools: {
        dataType: string;
        track: string;
        properties?: Array<[string, string]>;
      };
    };
    expect(detail.devtools.dataType).toBe('track-entry');
    expect(detail.devtools.track).toBe('ok/sync');
    const props = detail.devtools.properties ?? [];
    const asMap = Object.fromEntries(props);
    expect(asMap.docName).toBe('README');
    expect(asMap.elapsedMs).toBe('42');
  });

  test('in dev mode, collector.marks receives the event', () => {
    mark('ok/test/collector-push', { a: 1 });
    const c = getCollector();
    expect(c).toBeDefined();
    const found = c?.marks.find((m) => m.name === 'ok/test/collector-push');
    expect(found).toBeDefined();
    expect(found?.track).toBe('ok/test');
    expect(found?.properties).toEqual({ a: 1 });
  });

  test('properties serialize nested objects as JSON', () => {
    mark('ok/test/nested-props', { info: { key: 'value', n: 3 } });
    const last = performance.getEntriesByName('ok/test/nested-props')[0] as PerformanceMeasure;
    const detail = last.detail as {
      devtools: { properties?: Array<[string, string]> };
    };
    const asMap = Object.fromEntries(detail.devtools.properties ?? []);
    expect(asMap.info).toBe('{"key":"value","n":3}');
  });

  test('duration defaults to zero for point events', () => {
    mark('ok/test/point-event');
    const entry = performance.getEntriesByName('ok/test/point-event')[0] as PerformanceMeasure;
    expect(entry.duration).toBe(0);
  });
});
