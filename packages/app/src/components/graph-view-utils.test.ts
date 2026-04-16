import { describe, expect, test } from 'bun:test';

import { getGraphNodeTooltipLabel } from './graph-view-utils';

describe('getGraphNodeTooltipLabel', () => {
  test('returns plain label for doc nodes without metadata', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/alpha',
        label: 'Alpha',
        docName: 'notes/alpha',
        anchor: null,
      }),
    ).toBe('Alpha');
  });

  test('falls back to node id when a document label is missing', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/alpha',
        label: undefined as unknown as string,
        docName: 'notes/alpha',
        anchor: null,
      }),
    ).toBe('notes/alpha');
  });

  test('returns full URL for external nodes', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'external',
        id: 'external:https://example.com/path',
        label: 'example.com',
        url: 'https://example.com/path',
      }),
    ).toBe('https://example.com/path');
  });

  test('returns HTML with all metadata fields', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/rag',
      label: 'RAG Patterns',
      docName: 'notes/rag',
      anchor: null,
      cluster: 'retrieval',
      category: 'method',
      tags: ['rag', 'embeddings', 'search'],
    });
    expect(html).toContain('RAG Patterns');
    expect(html).toContain('retrieval');
    expect(html).toContain('method');
    expect(html).toContain('rag, embeddings, search');
    expect(html).toContain('<div');
  });

  test('returns HTML with only cluster field', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/x',
      label: 'X Doc',
      docName: 'notes/x',
      anchor: null,
      cluster: 'planning',
    });
    expect(html).toContain('X Doc');
    expect(html).toContain('planning');
    expect(html).not.toContain('category:');
    expect(html).not.toContain('tags:');
  });

  test('returns HTML with only tags field', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/y',
      label: 'Y Doc',
      docName: 'notes/y',
      anchor: null,
      tags: ['alpha', 'beta'],
    });
    expect(html).toContain('Y Doc');
    expect(html).toContain('alpha, beta');
    expect(html).not.toContain('cluster:');
  });

  test('returns plain label when metadata fields are null', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/z',
        label: 'Z Doc',
        docName: 'notes/z',
        anchor: null,
        cluster: null,
        category: null,
        tags: null,
      }),
    ).toBe('Z Doc');
  });

  test('returns plain label when tags is empty array', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/w',
        label: 'W Doc',
        docName: 'notes/w',
        anchor: null,
        tags: [],
      }),
    ).toBe('W Doc');
  });

  test('escapes HTML characters in metadata values', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/xss',
      label: '<script>alert("xss")</script>',
      docName: 'notes/xss',
      anchor: null,
      cluster: 'a<b',
      tags: ['x&y'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&lt;b');
    expect(html).toContain('x&amp;y');
  });
});
