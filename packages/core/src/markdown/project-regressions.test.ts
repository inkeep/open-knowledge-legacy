import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

describe('PROJECT.md regressions', () => {
  test('prose with bare API snippet containing { noServer: true } parses without error', () => {
    const input =
      'Hocuspocus embeds in Vite via configureServer() + standalone ws.WebSocketServer({ noServer: true }). WebSocket connects on /collab.\n';

    expect(() => mdManager.parse(input)).not.toThrow();
  });

  test('table cell containing 1:1s parses without error', () => {
    const input = '| Item | Notes |\n| --- | --- |\n| A | 1:1s, incidents |\n';

    expect(() => mdManager.parse(input)).not.toThrow();
  });
});
