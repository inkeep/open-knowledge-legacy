import { describe, expect, test } from 'bun:test';

import { getGraphNodeTooltipLabel } from './graph-view-utils';

describe('getGraphNodeTooltipLabel', () => {
  test('returns display label for document nodes', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/alpha',
        label: 'Alpha',
        docName: 'notes/alpha',
      }),
    ).toBe('Alpha');
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
