/**
 * Reference-link + definition round-trip — R16(c), R12, M4.
 *
 * Verifies that reference-link forms are preserved on round-trip,
 * not normalized to inline. This was BROKEN on the old stack —
 * the migration FIXES it via the R12 `definition` handler override
 * in remark-prosemirror.
 */
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip, normalize } from './helpers';

function assertRoundTrip(input: string): void {
  const output = normalize(mdRoundTrip(input));
  const expected = normalize(input);
  expect(output).toBe(expected);
}

describe('reference-link + definition round-trip (R12, M4)', () => {
  test('full reference link with titled definition', () => {
    assertRoundTrip(
      'Visit [docs][api-docs] for details.\n\n[api-docs]: https://example.com "API Docs"\n',
    );
  });

  test('full reference link without title', () => {
    assertRoundTrip('See [the guide][guide] here.\n\n[guide]: https://example.com/guide\n');
  });

  test('collapsed reference link', () => {
    assertRoundTrip('See [guide][] for more.\n\n[guide]: https://example.com\n');
  });

  test('shortcut reference link', () => {
    assertRoundTrip('See [guide] for more.\n\n[guide]: https://example.com\n');
  });

  test('multiple definitions', () => {
    assertRoundTrip(
      'Visit [docs][api] and [home][main].\n\n[api]: https://example.com/api\n\n[main]: https://example.com\n',
    );
  });

  test('definition with URL containing special chars', () => {
    assertRoundTrip('See [link][ref].\n\n[ref]: https://example.com?a=1&b=2\n');
  });

  test('definition appears in PM JSON as linkRefDef atom', () => {
    const { MarkdownManager, sharedExtensions } = require('@inkeep/open-knowledge-core');
    const mdManager = new MarkdownManager({ extensions: sharedExtensions });
    const json = mdManager.parse('See [link][ref].\n\n[ref]: https://example.com\n');
    const found = findNodeType(json, 'linkRefDef');
    expect(found).toBeTruthy();
    expect(found.attrs.label).toBe('ref');
  });
});

function findNodeType(node: any, type: string): any {
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = findNodeType(child, type);
    if (found) return found;
  }
  return null;
}
