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
  test('returns display label for document nodes', () => {
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
