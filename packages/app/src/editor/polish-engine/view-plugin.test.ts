/**
 * ViewPlugin unit tests — validates index construction and dedup logic.
 */

import { describe, expect, test } from 'bun:test';
import type { ConstructConfig } from './registry';
import { buildMarkerIndex, buildNodeIndex } from './view-plugin';

const mockRegistry: ConstructConfig[] = [
  {
    id: 'blockquote',
    nodeName: 'Blockquote',
    kind: 'line',
    class: 'cm-blockquote-line',
    markerNodeName: 'QuoteMark',
    markerClass: 'cm-quote-mark',
  },
  {
    id: 'heading',
    nodeName: ['ATXHeading1', 'ATXHeading2'],
    kind: 'line',
    class: 'cm-heading',
    markerNodeName: 'HeaderMark',
    markerClass: 'cm-header-mark',
  },
  {
    id: 'cross-scan-only',
    nodeName: 'Link',
    kind: 'cross-scan-mark',
    crossScan: {
      collect: () => new Map(),
      check: () => 'ok',
      brokenClass: 'cm-broken',
    },
  },
  {
    id: 'no-node',
    kind: 'none',
  },
];

describe('buildNodeIndex', () => {
  test('maps node names to configs, excluding cross-scan-mark and none kinds', () => {
    const index = buildNodeIndex(mockRegistry);
    expect(index.has('Blockquote')).toBe(true);
    expect(index.has('ATXHeading1')).toBe(true);
    expect(index.has('ATXHeading2')).toBe(true);
    // cross-scan-mark configs are excluded
    expect(index.has('Link')).toBe(false);
  });

  test('multiple node names in array are all indexed', () => {
    const index = buildNodeIndex(mockRegistry);
    const h1Configs = index.get('ATXHeading1');
    const h2Configs = index.get('ATXHeading2');
    expect(h1Configs).toHaveLength(1);
    expect(h2Configs).toHaveLength(1);
    expect(h1Configs?.[0].id).toBe('heading');
    expect(h2Configs?.[0].id).toBe('heading');
  });

  test('returns empty map for empty registry', () => {
    const index = buildNodeIndex([]);
    expect(index.size).toBe(0);
  });
});

describe('buildMarkerIndex', () => {
  test('maps marker node names to configs', () => {
    const index = buildMarkerIndex(mockRegistry);
    expect(index.has('QuoteMark')).toBe(true);
    expect(index.has('HeaderMark')).toBe(true);
    expect(index.get('QuoteMark')?.markerClass).toBe('cm-quote-mark');
  });

  test('returns empty map for registry without markers', () => {
    const index = buildMarkerIndex([{ id: 'test', kind: 'line', nodeName: 'X', class: 'y' }]);
    expect(index.size).toBe(0);
  });
});
