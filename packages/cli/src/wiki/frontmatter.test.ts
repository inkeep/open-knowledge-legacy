import { describe, expect, test } from 'bun:test';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.ts';

describe('parseFrontmatter', () => {
  test('parses valid YAML frontmatter', () => {
    const content = '---\ntitle: Hello\ndescription: World\n---\n\nBody text.';
    const result = parseFrontmatter(content);
    expect(result).toEqual({ title: 'Hello', description: 'World' });
  });

  test('returns null for content without frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\n\nSome text.')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseFrontmatter('')).toBeNull();
  });

  test('returns null for malformed YAML', () => {
    const content = '---\n[invalid: yaml: : :\n---\n\nBody.';
    expect(parseFrontmatter(content)).toBeNull();
  });

  test('parses tags array', () => {
    const content = '---\ntitle: Test\ntags:\n  - auth\n  - sso\n---\n\nBody.';
    const result = parseFrontmatter(content);
    expect(result?.tags).toEqual(['auth', 'sso']);
  });

  test('handles frontmatter with no trailing newline after closing ---', () => {
    const content = '---\ntitle: Test\n---\nBody.';
    const result = parseFrontmatter(content);
    expect(result).toEqual({ title: 'Test' });
  });

  test('returns null when frontmatter YAML parses to a scalar', () => {
    const content = '---\njust a string\n---\n\nBody.';
    expect(parseFrontmatter(content)).toBeNull();
  });
});

describe('serializeFrontmatter', () => {
  test('produces valid frontmatter block with --- delimiters', () => {
    const result = serializeFrontmatter({ title: 'Hello', description: 'World' });
    expect(result).toMatch(/^---\n/);
    expect(result).toMatch(/\n---$/);
    expect(result).toContain('title: Hello');
    expect(result).toContain('description: World');
  });

  test('round-trips through parse', () => {
    const data = { title: 'Test', generated: true, schema_version: 1 };
    const serialized = `${serializeFrontmatter(data)}\n\nBody.`;
    const parsed = parseFrontmatter(serialized);
    expect(parsed?.title).toBe('Test');
    expect(parsed?.generated).toBe(true);
    expect(parsed?.schema_version).toBe(1);
  });
});
