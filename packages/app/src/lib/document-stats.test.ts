import { describe, expect, test } from 'bun:test';
import { computeBodyStats } from './document-stats';

describe('computeBodyStats', () => {
  test('empty string returns zeros', () => {
    expect(computeBodyStats('')).toEqual({ words: 0, chars: 0, tokens: 0 });
  });

  test('plain text without frontmatter', () => {
    expect(computeBodyStats('hello world foo')).toEqual({ words: 3, chars: 15, tokens: 4 });
  });

  test('frontmatter excluded from words and chars', () => {
    const md = '---\ntitle: Test\n---\nhello world';
    expect(computeBodyStats(md)).toEqual({ words: 2, chars: 11, tokens: 3 });
  });

  test('whitespace-only body returns zero', () => {
    expect(computeBodyStats('   \n\n  \t  ')).toEqual({ words: 0, chars: 0, tokens: 0 });
  });

  test('single word', () => {
    expect(computeBodyStats('hello')).toEqual({ words: 1, chars: 5, tokens: 2 });
  });

  test('multiline text counts words across lines', () => {
    expect(computeBodyStats('one\ntwo\nthree').words).toBe(3);
  });

  test('leading and trailing whitespace does not produce phantom words', () => {
    expect(computeBodyStats('  hello  world  ').words).toBe(2);
  });

  test('markdown syntax tokens (#, >, ---) are not counted as words', () => {
    expect(computeBodyStats('# test').words).toBe(1);
    expect(computeBodyStats('> a quote').words).toBe(2);
    expect(computeBodyStats('--- separator ---').words).toBe(1);
  });

  test('frontmatter-only document has zero body stats', () => {
    expect(computeBodyStats('---\ntitle: Test\ntags: [a, b]\n---\n')).toEqual({
      words: 0,
      chars: 0,
      tokens: 0,
    });
  });

  test('CJK without whitespace counts word-like segments via Intl.Segmenter', () => {
    // 这是一个测试文档 — each character is a word-like segment in Chinese.
    const stats = computeBodyStats('这是一个测试文档');
    // Segmenter behavior is locale-dependent, but each CJK ideograph is
    // word-like; we only assert "more than one" to avoid over-specifying.
    expect(stats.words).toBeGreaterThan(1);
  });

  test('mixed CJK + ASCII still segments correctly', () => {
    const stats = computeBodyStats('hello 世界 world');
    expect(stats.words).toBeGreaterThanOrEqual(3);
  });
});
