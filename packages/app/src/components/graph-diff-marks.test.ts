import { describe, expect, test } from 'bun:test';
import {
  EMPTY_DIFF_MARKS,
  hasAnyDiff,
  linkDiffState,
  linkKey,
  mergeGraphsWithDiff,
  nodeDiffState,
} from './graph-diff-marks';
import type { GraphLink, GraphNode } from './graph-view-utils';

function doc(id: string): GraphNode {
  return { kind: 'doc', id, docName: id, label: id, anchor: null };
}

function link(source: string, target: string): GraphLink {
  return { source, target };
}

describe('linkKey', () => {
  test('normalizes string endpoints', () => {
    expect(linkKey({ source: 'a', target: 'b' })).toBe('a>b');
  });

  test('normalizes object endpoints (force-graph post-tick shape)', () => {
    expect(linkKey({ source: { id: 'a' }, target: { id: 'b' } })).toBe('a>b');
  });

  test('mixes string and object endpoints', () => {
    expect(linkKey({ source: 'a', target: { id: 'b' } })).toBe('a>b');
  });
});

describe('mergeGraphsWithDiff', () => {
  test('identical graphs produce empty diff', () => {
    const from = { nodes: [doc('a'), doc('b')], links: [link('a', 'b')] };
    const to = { nodes: [doc('a'), doc('b')], links: [link('a', 'b')] };
    const merged = mergeGraphsWithDiff(from, to);
    expect(merged.marks.addedNodeIds.size).toBe(0);
    expect(merged.marks.removedNodeIds.size).toBe(0);
    expect(merged.marks.addedLinkKeys.size).toBe(0);
    expect(merged.marks.removedLinkKeys.size).toBe(0);
    expect(merged.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(merged.links.map(linkKey)).toEqual(['a>b']);
  });

  test('added node shows up in addedNodeIds', () => {
    const from = { nodes: [doc('a')], links: [] };
    const to = { nodes: [doc('a'), doc('b')], links: [] };
    const merged = mergeGraphsWithDiff(from, to);
    expect([...merged.marks.addedNodeIds]).toEqual(['b']);
    expect([...merged.marks.removedNodeIds]).toEqual([]);
    expect(merged.nodes.length).toBe(2);
  });

  test('removed node shows up in removedNodeIds and remains in union', () => {
    const from = { nodes: [doc('a'), doc('b')], links: [] };
    const to = { nodes: [doc('a')], links: [] };
    const merged = mergeGraphsWithDiff(from, to);
    expect([...merged.marks.removedNodeIds]).toEqual(['b']);
    expect([...merged.marks.addedNodeIds]).toEqual([]);
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  test('added and removed links tracked separately', () => {
    const from = { nodes: [doc('a'), doc('b'), doc('c')], links: [link('a', 'b')] };
    const to = { nodes: [doc('a'), doc('b'), doc('c')], links: [link('b', 'c')] };
    const merged = mergeGraphsWithDiff(from, to);
    expect([...merged.marks.addedLinkKeys]).toEqual(['b>c']);
    expect([...merged.marks.removedLinkKeys]).toEqual(['a>b']);
    expect(merged.links.map(linkKey).sort()).toEqual(['a>b', 'b>c']);
  });

  test('prefers "to" node data when ids match', () => {
    const fromNode: GraphNode = {
      kind: 'doc',
      id: 'x',
      docName: 'x',
      label: 'Old Label',
      anchor: null,
    };
    const toNode: GraphNode = {
      kind: 'doc',
      id: 'x',
      docName: 'x',
      label: 'New Label',
      anchor: null,
    };
    const merged = mergeGraphsWithDiff(
      { nodes: [fromNode], links: [] },
      { nodes: [toNode], links: [] },
    );
    expect(merged.nodes[0].label).toBe('New Label');
  });
});

describe('nodeDiffState / linkDiffState', () => {
  test('returns "none" when marks is null', () => {
    expect(nodeDiffState('x', null)).toBe('none');
    expect(linkDiffState(link('a', 'b'), null)).toBe('none');
  });

  test('returns "none" when marks is empty sentinel', () => {
    expect(nodeDiffState('x', EMPTY_DIFF_MARKS)).toBe('none');
    expect(linkDiffState(link('a', 'b'), EMPTY_DIFF_MARKS)).toBe('none');
  });

  test('classifies added/removed correctly', () => {
    const marks = {
      addedNodeIds: new Set(['a']),
      removedNodeIds: new Set(['b']),
      addedLinkKeys: new Set(['c>d']),
      removedLinkKeys: new Set(['e>f']),
    };
    expect(nodeDiffState('a', marks)).toBe('added');
    expect(nodeDiffState('b', marks)).toBe('removed');
    expect(nodeDiffState('z', marks)).toBe('unchanged');
    expect(linkDiffState(link('c', 'd'), marks)).toBe('added');
    expect(linkDiffState(link('e', 'f'), marks)).toBe('removed');
    expect(linkDiffState(link('x', 'y'), marks)).toBe('unchanged');
  });
});

describe('hasAnyDiff', () => {
  test('false on null / empty', () => {
    expect(hasAnyDiff(null)).toBe(false);
    expect(hasAnyDiff(EMPTY_DIFF_MARKS)).toBe(false);
  });

  test('true when any side non-empty', () => {
    expect(
      hasAnyDiff({
        addedNodeIds: new Set(['a']),
        removedNodeIds: new Set(),
        addedLinkKeys: new Set(),
        removedLinkKeys: new Set(),
      }),
    ).toBe(true);
  });
});
