import { describe, expect, test } from 'bun:test';

import {
  getGraphNodeCanvasRadius,
  getGraphNodePointerRadius,
  getGraphNodeTooltipLabel,
  getGraphNodeVisualState,
  getHashForGraphDocSelection,
  resolveGraphNodeClickAction,
} from './graph-view-utils';

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

describe('resolveGraphNodeClickAction', () => {
  test('selects fullscreen document nodes without losing anchor metadata', () => {
    expect(
      resolveGraphNodeClickAction(
        {
          kind: 'doc',
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: 'deep-link',
        },
        'select',
      ),
    ).toEqual({
      kind: 'select',
      selection: {
        kind: 'doc',
        id: 'notes/alpha',
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: 'deep-link',
      },
    });
  });

  test('selects fullscreen document nodes without anchors', () => {
    expect(
      resolveGraphNodeClickAction(
        {
          kind: 'doc',
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: null,
        },
        'select',
      ),
    ).toEqual({
      kind: 'select',
      selection: {
        kind: 'doc',
        id: 'notes/alpha',
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: null,
      },
    });
  });

  test('navigates docked document nodes through the existing hash flow', () => {
    expect(
      resolveGraphNodeClickAction(
        {
          kind: 'doc',
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: 'deep-link',
        },
        'navigate',
      ),
    ).toEqual({
      kind: 'navigate',
      hash: '#/notes/alpha?anchor=deep-link',
    });
  });

  test('keeps external nodes on the new-tab path in both modes', () => {
    const externalNode = {
      kind: 'external' as const,
      id: 'external:https://example.com/docs',
      label: 'example.com',
      url: 'https://example.com/docs',
    };

    expect(resolveGraphNodeClickAction(externalNode, 'navigate')).toEqual({
      kind: 'external',
      url: 'https://example.com/docs',
    });
    expect(resolveGraphNodeClickAction(externalNode, 'select')).toEqual({
      kind: 'select',
      selection: {
        kind: 'external',
        id: 'external:https://example.com/docs',
        label: 'example.com',
        url: 'https://example.com/docs',
      },
    });
  });
});

describe('getGraphNodeVisualState', () => {
  test('distinguishes active, selected, and active-and-selected document states', () => {
    const node = {
      kind: 'doc' as const,
      id: 'notes/alpha',
      label: 'Alpha',
      docName: 'notes/alpha',
      anchor: null,
    };

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/current',
        selectedNodeId: null,
      }),
    ).toBe('default');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/alpha',
        selectedNodeId: null,
      }),
    ).toBe('active');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/current',
        selectedNodeId: 'notes/alpha',
      }),
    ).toBe('selected');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/alpha',
        selectedNodeId: 'notes/alpha',
      }),
    ).toBe('active-selected');
  });

  test('keeps external nodes on their own visual path until selected', () => {
    expect(
      getGraphNodeVisualState(
        {
          kind: 'external',
          id: 'external:https://example.com',
          label: 'example.com',
          url: 'https://example.com',
        },
        {
          activeDocName: 'notes/alpha',
          selectedNodeId: null,
        },
      ),
    ).toBe('external');

    expect(
      getGraphNodeVisualState(
        {
          kind: 'external',
          id: 'external:https://example.com',
          label: 'example.com',
          url: 'https://example.com',
        },
        {
          activeDocName: 'notes/alpha',
          selectedNodeId: 'external:https://example.com',
        },
      ),
    ).toBe('external-selected');
  });
});

describe('graph node radii', () => {
  test('keeps canvas radii in sync with the visual node states', () => {
    expect(getGraphNodeCanvasRadius('default')).toBe(5);
    expect(getGraphNodeCanvasRadius('external')).toBe(5);
    expect(getGraphNodeCanvasRadius('external-selected')).toBe(7);
    expect(getGraphNodeCanvasRadius('selected')).toBe(7);
    expect(getGraphNodeCanvasRadius('active')).toBe(8);
    expect(getGraphNodeCanvasRadius('active-selected')).toBe(8);
  });

  test('expands pointer radii to include the visible selection ring', () => {
    expect(getGraphNodePointerRadius('default', 2)).toBe(5);
    expect(getGraphNodePointerRadius('external-selected', 2)).toBe(8);
    expect(getGraphNodePointerRadius('selected', 2)).toBe(8);
    expect(getGraphNodePointerRadius('active', 2)).toBe(9);
    expect(getGraphNodePointerRadius('active-selected', 2)).toBe(9);
  });
});

describe('getHashForGraphDocSelection', () => {
  test('preserves anchors when opening a fullscreen selection', () => {
    expect(
      getHashForGraphDocSelection({
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: 'deep-link',
      }),
    ).toBe('#/notes/alpha?anchor=deep-link');
  });

  test('generates a hash without anchor parameters when anchor is null', () => {
    expect(
      getHashForGraphDocSelection({
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: null,
      }),
    ).toBe('#/notes/alpha');
  });
});
