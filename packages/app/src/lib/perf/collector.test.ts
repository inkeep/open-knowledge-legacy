import { beforeEach, describe, expect, test } from 'bun:test';
import { getCollector, recordMark, recordVital } from './collector';

describe('getCollector', () => {
  beforeEach(() => {
    getCollector()?.reset();
  });

  test('returns a collector object in dev builds', () => {
    const c = getCollector();
    expect(c).toBeDefined();
    expect(c?.marks).toBeArray();
    expect(c?.vitals).toBeArray();
    expect(typeof c?.startedAt).toBe('number');
  });

  test('is idempotent — same reference across calls', () => {
    const a = getCollector();
    const b = getCollector();
    expect(a).toBe(b);
  });

  test('attaches the collector at globalThis.__ok_perf', () => {
    getCollector();
    expect((globalThis as { __ok_perf?: unknown }).__ok_perf).toBeDefined();
  });
});

describe('recordMark', () => {
  beforeEach(() => {
    getCollector()?.reset();
  });

  test('appends to collector.marks', () => {
    recordMark({
      name: 'ok/test/one',
      startTime: 0,
      duration: 0,
      track: 'ok/test',
    });
    const c = getCollector();
    expect(c?.marks).toHaveLength(1);
    expect(c?.marks[0].name).toBe('ok/test/one');
  });
});

describe('recordVital', () => {
  beforeEach(() => {
    getCollector()?.reset();
  });

  test('appends to collector.vitals', () => {
    recordVital({
      name: 'INP',
      value: 180,
      rating: 'good',
      delta: 180,
      id: 'v1-1',
    });
    const c = getCollector();
    expect(c?.vitals).toHaveLength(1);
    expect(c?.vitals[0].name).toBe('INP');
  });
});

describe('collector.reset', () => {
  test('clears marks and vitals without changing identity', () => {
    const c = getCollector();
    recordMark({
      name: 'ok/test/pre-reset',
      startTime: 0,
      duration: 0,
      track: 'ok/test',
    });
    recordVital({
      name: 'LCP',
      value: 2000,
      rating: 'needs-improvement',
      delta: 2000,
      id: 'v1-2',
    });
    c?.reset();
    expect(c?.marks).toHaveLength(0);
    expect(c?.vitals).toHaveLength(0);
    expect(getCollector()).toBe(c);
  });
});
