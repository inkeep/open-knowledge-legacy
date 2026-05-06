import { describe, expect, mock, spyOn, test } from 'bun:test';
import { extractFrontmatterTags, FRONTMATTER_TAG_VALUE_RE } from './tags.ts';

describe('FRONTMATTER_TAG_VALUE_RE', () => {
  test('accepts shapes the inline promoter accepts', () => {
    expect(FRONTMATTER_TAG_VALUE_RE.test('typescript')).toBe(true);
    expect(FRONTMATTER_TAG_VALUE_RE.test('proj/team/2026')).toBe(true);
    expect(FRONTMATTER_TAG_VALUE_RE.test('a-b_c')).toBe(true);
    expect(FRONTMATTER_TAG_VALUE_RE.test('a1')).toBe(true);
  });

  test('rejects digit-leading, empty, and whitespace shapes', () => {
    expect(FRONTMATTER_TAG_VALUE_RE.test('123')).toBe(false);
    expect(FRONTMATTER_TAG_VALUE_RE.test('')).toBe(false);
    expect(FRONTMATTER_TAG_VALUE_RE.test('foo bar')).toBe(false);
    expect(FRONTMATTER_TAG_VALUE_RE.test('-leading-dash')).toBe(false);
  });
});

describe('extractFrontmatterTags', () => {
  test('returns empty for empty input', () => {
    expect(extractFrontmatterTags('')).toEqual([]);
    expect(extractFrontmatterTags('   \n')).toEqual([]);
  });

  test('returns empty when tags key is absent', () => {
    expect(extractFrontmatterTags('title: Hello\ncluster: x\n')).toEqual([]);
  });

  test('extracts a flat list', () => {
    expect(extractFrontmatterTags('tags: [showcase, demo]\n')).toEqual(['showcase', 'demo']);
  });

  test('accepts a single scalar string and treats it as a one-element list', () => {
    expect(extractFrontmatterTags('tags: showcase\n')).toEqual(['showcase']);
  });

  test('strips a leading # tolerated on Obsidian-emit imports', () => {
    expect(extractFrontmatterTags('tags: ["#showcase", "#demo"]\n')).toEqual(['showcase', 'demo']);
  });

  test('preserves hierarchy slashes', () => {
    expect(extractFrontmatterTags('tags: [proj/team, proj/team/2026]\n')).toEqual([
      'proj/team',
      'proj/team/2026',
    ]);
  });

  test('drops invalid entries with a warning rather than failing the whole list', () => {
    const warn = spyOn(console, 'warn').mockImplementation(mock(() => {}));
    try {
      const out = extractFrontmatterTags('tags: [valid, "with space", "123digit", another]\n');
      expect(out).toEqual(['valid', 'another']);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  test('coerces non-string scalars and applies the per-entry tag regex', () => {
    expect(extractFrontmatterTags('tags: [valid, 42, true, also]\n')).toEqual([
      'valid',
      'true',
      'also',
    ]);
  });

  test('returns empty when frontmatter parse fails', () => {
    expect(extractFrontmatterTags(': : : invalid yaml')).toEqual([]);
  });

  test('returns empty when tags is null', () => {
    expect(extractFrontmatterTags('tags: null\n')).toEqual([]);
  });
});
