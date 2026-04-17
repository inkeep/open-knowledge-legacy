import { describe, expect, test } from 'bun:test';
import type { CheckpointEntry, HistoricalNode } from '@inkeep/open-knowledge-core';
import {
  checkpointDisplayLabel,
  formatCheckpointTime,
  normalizeHistoricalLinks,
  normalizeHistoricalNode,
  normalizeHistoricalNodes,
  shortSha,
} from './graph-timeline-util';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('shortSha', () => {
  test('returns the first 7 chars', () => {
    expect(shortSha(SHA)).toBe('0123456');
  });
});

describe('checkpointDisplayLabel', () => {
  test('strips "checkpoint: " prefix', () => {
    expect(
      checkpointDisplayLabel({
        sha: SHA,
        timestamp: '2026-04-16T12:00:00Z',
        message: 'checkpoint: sparse seed',
        author: 'alice',
        type: 'checkpoint',
      }),
    ).toBe('sparse seed');
  });

  test('falls back to short sha for empty-message checkpoints', () => {
    expect(
      checkpointDisplayLabel({
        sha: SHA,
        timestamp: '2026-04-16T12:00:00Z',
        message: '',
        author: 'alice',
        type: 'checkpoint',
      }),
    ).toBe('0123456');
  });

  test('keeps non-checkpoint messages intact', () => {
    expect(
      checkpointDisplayLabel({
        sha: SHA,
        timestamp: '2026-04-16T12:00:00Z',
        message: 'upstream import',
        author: 'alice',
        type: 'checkpoint',
      }),
    ).toBe('upstream import');
  });
});

describe('formatCheckpointTime', () => {
  const make = (ts: string): CheckpointEntry => ({
    sha: SHA,
    timestamp: ts,
    message: 'checkpoint: t',
    author: 'alice',
    type: 'checkpoint',
  });

  test('returns empty string for unparseable input', () => {
    expect(formatCheckpointTime(make('not-a-date'))).toBe('');
  });

  test('returns a non-empty string for valid timestamps', () => {
    expect(formatCheckpointTime(make('2026-04-16T12:00:00Z')).length).toBeGreaterThan(0);
  });
});

describe('normalizeHistoricalNode', () => {
  test('doc node drops optional fields but preserves id/docName/label/anchor', () => {
    const historical: HistoricalNode = {
      kind: 'doc',
      id: 'doc-1',
      docName: 'foo.md',
      label: 'Foo',
      anchor: null,
    };
    const node = normalizeHistoricalNode(historical);
    expect(node).toEqual({
      kind: 'doc',
      id: 'doc-1',
      docName: 'foo.md',
      label: 'Foo',
      anchor: null,
    });
  });

  test('external node falls back to url when label is null', () => {
    const historical: HistoricalNode = {
      kind: 'external',
      id: 'ext-1',
      url: 'https://example.com',
      label: null,
    };
    const node = normalizeHistoricalNode(historical);
    expect(node).toEqual({
      kind: 'external',
      id: 'ext-1',
      url: 'https://example.com',
      label: 'https://example.com',
    });
  });

  test('external node keeps label when present', () => {
    const historical: HistoricalNode = {
      kind: 'external',
      id: 'ext-1',
      url: 'https://example.com',
      label: 'Example',
    };
    const node = normalizeHistoricalNode(historical);
    expect(node).toEqual({
      kind: 'external',
      id: 'ext-1',
      url: 'https://example.com',
      label: 'Example',
    });
  });
});

describe('normalizeHistoricalNodes + normalizeHistoricalLinks', () => {
  test('maps a payload end-to-end', () => {
    const nodes = normalizeHistoricalNodes([
      { kind: 'doc', id: 'a', docName: 'a.md', label: 'A', anchor: null },
      { kind: 'external', id: 'x', url: 'https://x.com', label: null },
    ]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.kind).toBe('doc');
    expect(nodes[1]?.kind).toBe('external');

    const links = normalizeHistoricalLinks([{ source: 'a', target: 'x' }]);
    expect(links).toEqual([{ source: 'a', target: 'x' }]);
  });
});
