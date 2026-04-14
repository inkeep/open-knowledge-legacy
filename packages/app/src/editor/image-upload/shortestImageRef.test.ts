import { describe, expect, test } from 'bun:test';
import { shortestImageRef } from './index.ts';

describe('shortestImageRef', () => {
  test('same directory returns basename', () => {
    expect(shortestImageRef('docs/screenshot.png', 'docs/guide.md')).toBe('screenshot.png');
  });

  test('different directory returns / + path', () => {
    expect(shortestImageRef('images/photo.png', 'docs/guide.md')).toBe('/images/photo.png');
  });

  test('root-level files return basename', () => {
    expect(shortestImageRef('logo.png', 'readme.md')).toBe('logo.png');
  });

  test('deeply nested different dirs return / + path', () => {
    expect(shortestImageRef('a/b/c/img.png', 'x/y/z/doc.md')).toBe('/a/b/c/img.png');
  });
});
