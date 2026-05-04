import { describe, expect, test } from 'bun:test';
import { prependFrontmatter, stripFrontmatter, unwrapFrontmatterFences } from './frontmatter';

describe('stripFrontmatter', () => {
  test('extracts frontmatter from standard YAML block', () => {
    const input = '---\ntitle: Hello\ntags: [a, b]\n---\n# Body';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\ntitle: Hello\ntags: [a, b]\n---\n');
    expect(body).toBe('# Body');
  });

  test('returns empty frontmatter when none present', () => {
    const input = '# Just a heading\nSome content';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('');
    expect(body).toBe(input);
  });

  test('does not match --- in the middle of content', () => {
    const input = '# Heading\n---\nstuff\n---\n';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('');
    expect(body).toBe(input);
  });

  test('handles empty body after frontmatter', () => {
    const input = '---\ntitle: Empty\n---\n';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\ntitle: Empty\n---\n');
    expect(body).toBe('');
  });

  test('handles empty string', () => {
    const { frontmatter, body } = stripFrontmatter('');
    expect(frontmatter).toBe('');
    expect(body).toBe('');
  });

  test('handles frontmatter without trailing newline', () => {
    const input = '---\ntitle: No Trailing\n---';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\ntitle: No Trailing\n---');
    expect(body).toBe('');
  });

  test('handles CRLF line endings', () => {
    const input = '---\r\ntitle: CRLF\r\n---\r\n# Body';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\r\ntitle: CRLF\r\n---\r\n');
    expect(body).toBe('# Body');
  });

  test('handles mixed CRLF/LF line endings', () => {
    const input = '---\r\ntitle: Mixed\n---\r\n# Body';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\r\ntitle: Mixed\n---\r\n');
    expect(body).toBe('# Body');
  });

  test('handles empty frontmatter block ---\\n---\\n', () => {
    const input = '---\n---\n# Body';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\n---\n');
    expect(body).toBe('# Body');
  });

  test('handles empty frontmatter block without trailing newline', () => {
    const input = '---\n---';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\n---');
    expect(body).toBe('');
  });

  test('handles empty CRLF frontmatter block', () => {
    const input = '---\r\n---\r\n# Body';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(frontmatter).toBe('---\r\n---\r\n');
    expect(body).toBe('# Body');
  });
});

describe('prependFrontmatter', () => {
  test('prepends frontmatter to body', () => {
    const result = prependFrontmatter('---\ntitle: X\n---\n', '# Body');
    expect(result).toBe('---\ntitle: X\n---\n# Body');
  });

  test('returns body unchanged when frontmatter is empty', () => {
    expect(prependFrontmatter('', '# Body')).toBe('# Body');
  });
});

describe('unwrapFrontmatterFences', () => {
  test('strips leading and trailing --- fences with trailing newline', () => {
    expect(unwrapFrontmatterFences('---\ntitle: Hello\n---\n')).toBe('title: Hello');
  });

  test('strips fences without trailing newline', () => {
    expect(unwrapFrontmatterFences('---\ntitle: Hello\n---')).toBe('title: Hello');
  });

  test('handles CRLF line endings', () => {
    expect(unwrapFrontmatterFences('---\r\ntitle: CRLF\r\n---\r\n')).toBe('title: CRLF');
  });

  test('returns empty string on empty input', () => {
    expect(unwrapFrontmatterFences('')).toBe('');
  });

  test('handles empty FM block ---\\n---\\n', () => {
    expect(unwrapFrontmatterFences('---\n---\n')).toBe('');
  });

  test('round-trip with stripFrontmatter — fenced FM produces parseable YAML body', () => {
    const original = '---\ntitle: X\ntags: [a, b]\n---\n# Body';
    const { frontmatter } = stripFrontmatter(original);
    const body = unwrapFrontmatterFences(frontmatter);
    expect(body).toBe('title: X\ntags: [a, b]');
  });
});

describe('round-trip', () => {
  test('strip then prepend is identity', () => {
    const original = '---\ntitle: Test\ndate: 2026-01-01\n---\n# Content\n\nParagraph here.\n';
    const { frontmatter, body } = stripFrontmatter(original);
    const reassembled = prependFrontmatter(frontmatter, body);
    expect(reassembled).toBe(original);
  });

  test('CRLF round-trip is identity', () => {
    const original = '---\r\ntitle: CRLF Test\r\n---\r\n# Content\r\n';
    const { frontmatter, body } = stripFrontmatter(original);
    const reassembled = prependFrontmatter(frontmatter, body);
    expect(reassembled).toBe(original);
  });

  test('empty block round-trip is identity', () => {
    const original = '---\n---\n# Content\n';
    const { frontmatter, body } = stripFrontmatter(original);
    const reassembled = prependFrontmatter(frontmatter, body);
    expect(reassembled).toBe(original);
  });
});
