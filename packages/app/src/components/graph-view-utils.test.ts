import { describe, expect, test } from 'bun:test';

import { getGraphNodeTooltipLabel, resolveGraphNodeClickAction } from './graph-view-utils';

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
