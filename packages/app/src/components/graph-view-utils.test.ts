import { describe, expect, test } from 'bun:test';

import {
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
      kind: 'external',
      url: 'https://example.com/docs',
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
        selectedDocName: null,
      }),
    ).toBe('default');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/alpha',
        selectedDocName: null,
      }),
    ).toBe('active');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/current',
        selectedDocName: 'notes/alpha',
      }),
    ).toBe('selected');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/alpha',
        selectedDocName: 'notes/alpha',
      }),
    ).toBe('active-selected');
  });

  test('keeps external nodes on their own visual path', () => {
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
          selectedDocName: 'notes/alpha',
        },
      ),
    ).toBe('external');
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
