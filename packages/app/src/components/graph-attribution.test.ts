import { describe, expect, test } from 'bun:test';
import {
  ACTIVE_AGENT_WINDOW_MS,
  HALO_FADE_END_MS,
  HALO_FULL_ALPHA_MS,
  HALO_PULSE_MS,
  type LastEditedBy,
} from '@inkeep/open-knowledge-core';
import {
  activeAgentsFromNodes,
  anyHaloActive,
  haloAlpha,
  haloPulseScale,
  isHaloActive,
} from './graph-attribution.ts';

const makeEntry = (timestamp: number, extras: Partial<LastEditedBy> = {}): LastEditedBy => ({
  agentName: 'Agent',
  colorSeed: 'seed',
  timestamp,
  ...extras,
});

describe('isHaloActive', () => {
  test('null entry is inactive', () => {
    expect(isHaloActive(null, 1000)).toBe(false);
    expect(isHaloActive(undefined, 1000)).toBe(false);
  });
  test('recent entry is active', () => {
    expect(isHaloActive(makeEntry(0), 100)).toBe(true);
  });
  test('old entry past fade-end is inactive', () => {
    expect(isHaloActive(makeEntry(0), HALO_FADE_END_MS + 1)).toBe(false);
  });
  test('exactly at fade-end is inactive', () => {
    expect(isHaloActive(makeEntry(0), HALO_FADE_END_MS)).toBe(false);
  });
});

describe('haloAlpha', () => {
  test('null entry has alpha 0', () => {
    expect(haloAlpha(null, 1000)).toBe(0);
  });
  test('alpha is 1.0 during full-alpha window', () => {
    expect(haloAlpha(makeEntry(0), 0)).toBe(1);
    expect(haloAlpha(makeEntry(0), HALO_FULL_ALPHA_MS - 1)).toBe(1);
  });
  test('alpha linearly fades from 1 to 0 over fade window', () => {
    const midAge = (HALO_FULL_ALPHA_MS + HALO_FADE_END_MS) / 2;
    const alpha = haloAlpha(makeEntry(0), midAge);
    expect(alpha).toBeGreaterThan(0.4);
    expect(alpha).toBeLessThan(0.6);
  });
  test('alpha is 0 at and past fade-end', () => {
    expect(haloAlpha(makeEntry(0), HALO_FADE_END_MS)).toBe(0);
    expect(haloAlpha(makeEntry(0), HALO_FADE_END_MS + 1000)).toBe(0);
  });
  test('negative age (clock skew) returns 1 as safety fallback', () => {
    expect(haloAlpha(makeEntry(1000), 0)).toBe(1);
  });
});

describe('haloPulseScale', () => {
  test('pulse scale is 1 outside pulse window', () => {
    expect(haloPulseScale(makeEntry(0), HALO_PULSE_MS + 100)).toBe(1);
  });
  test('pulse scale grows during pulse window', () => {
    const midPulse = HALO_PULSE_MS / 2;
    expect(haloPulseScale(makeEntry(0), midPulse)).toBeGreaterThan(1);
  });
});

describe('anyHaloActive', () => {
  test('returns false for empty iterable', () => {
    expect(anyHaloActive([], 1000)).toBe(false);
  });
  test('returns true when any node has a recent edit', () => {
    const nodes = [{ lastEditedBy: null }, { lastEditedBy: makeEntry(0) }];
    expect(anyHaloActive(nodes, 100)).toBe(true);
  });
  test('returns false when all edits have faded', () => {
    const nodes = [{ lastEditedBy: makeEntry(0) }, { lastEditedBy: null }];
    expect(anyHaloActive(nodes, HALO_FADE_END_MS + 1)).toBe(false);
  });
});

describe('activeAgentsFromNodes', () => {
  test('empty nodes returns empty list', () => {
    expect(activeAgentsFromNodes([], 1000)).toEqual([]);
  });
  test('dedupes by colorSeed, retaining most recent timestamp', () => {
    const nodes = [
      { lastEditedBy: makeEntry(1000, { colorSeed: 'alice' }) },
      { lastEditedBy: makeEntry(2000, { colorSeed: 'alice' }) },
      { lastEditedBy: makeEntry(1500, { colorSeed: 'bob' }) },
    ];
    const result = activeAgentsFromNodes(nodes, 2500);
    expect(result).toHaveLength(2);
    expect(result[0].colorSeed).toBe('alice');
    expect(result[0].timestamp).toBe(2000);
    expect(result[1].colorSeed).toBe('bob');
  });
  test('filters by active window', () => {
    const nodes = [
      { lastEditedBy: makeEntry(0, { colorSeed: 'stale' }) },
      { lastEditedBy: makeEntry(10_000, { colorSeed: 'fresh' }) },
    ];
    const result = activeAgentsFromNodes(nodes, ACTIVE_AGENT_WINDOW_MS + 5_000);
    // stale = age 20000 (past window), fresh = age 10000 (within).
    expect(result).toHaveLength(1);
    expect(result[0].colorSeed).toBe('fresh');
  });
  test('sorts most-recent first', () => {
    const nodes = [
      { lastEditedBy: makeEntry(500, { colorSeed: 'early' }) },
      { lastEditedBy: makeEntry(1500, { colorSeed: 'late' }) },
    ];
    const result = activeAgentsFromNodes(nodes, 2000);
    expect(result[0].colorSeed).toBe('late');
    expect(result[1].colorSeed).toBe('early');
  });
});
