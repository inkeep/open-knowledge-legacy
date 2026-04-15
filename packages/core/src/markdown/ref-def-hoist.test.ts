import { describe, expect, test } from 'bun:test';
import { hoistRefDefs } from './ref-def-hoist.ts';

describe('hoistRefDefs (R11)', () => {
  test('extracts top-level ref-def', () => {
    const src = '[foo]: https://example.com\n\nSome text\n';
    expect(hoistRefDefs(src)).toBe('[foo]: https://example.com\n\n');
  });

  test('extracts ref-def with title (double quotes)', () => {
    const src = '[bar]: https://example.com "A title"\n';
    expect(hoistRefDefs(src)).toBe('[bar]: https://example.com "A title"\n\n');
  });

  test('extracts ref-def with title (single quotes)', () => {
    const src = "[baz]: https://example.com 'A title'\n";
    expect(hoistRefDefs(src)).toBe("[baz]: https://example.com 'A title'\n\n");
  });

  test('extracts ref-def with title (parens)', () => {
    const src = '[qux]: https://example.com (A title)\n';
    expect(hoistRefDefs(src)).toBe('[qux]: https://example.com (A title)\n\n');
  });

  test('extracts multiple ref-defs preserving source order', () => {
    const src = '[a]: url1\n[b]: url2\n\ntext\n';
    expect(hoistRefDefs(src)).toBe('[a]: url1\n[b]: url2\n\n');
  });

  test('does NOT extract ref-def inside fenced code block', () => {
    const src = '```\n[foo]: https://example.com\n```\n';
    expect(hoistRefDefs(src)).toBe('');
  });

  test('does NOT extract ref-def inside tilde fence', () => {
    const src = '~~~\n[foo]: https://example.com\n~~~\n';
    expect(hoistRefDefs(src)).toBe('');
  });

  test('extracts ref-def outside fence but not inside', () => {
    const src = '[outside]: url1\n\n```\n[inside]: url2\n```\n';
    expect(hoistRefDefs(src)).toBe('[outside]: url1\n\n');
  });

  test('returns empty string when no ref-defs', () => {
    expect(hoistRefDefs('Just some text\n')).toBe('');
  });

  test('returns empty string for empty input', () => {
    expect(hoistRefDefs('')).toBe('');
  });

  test('handles ref-def with surrounding blank lines', () => {
    const src = '\n\n[foo]: url\n\n\n';
    expect(hoistRefDefs(src)).toBe('[foo]: url\n\n');
  });
});
