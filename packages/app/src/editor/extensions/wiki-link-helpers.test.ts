import { describe, expect, test } from 'bun:test';
import {
  buildUnresolvedWikiLinkAttrs,
  isResolvedWikiLinkTarget,
  toWikiLinkSlug,
} from './wiki-link-helpers';

describe('toWikiLinkSlug', () => {
  test('normalizes human-readable page names to doc slugs', () => {
    expect(toWikiLinkSlug('Nonexistent Page')).toBe('nonexistent-page');
    expect(toWikiLinkSlug('  Mixed_CASE  Page  ')).toBe('mixed-case-page');
  });
});

describe('buildUnresolvedWikiLinkAttrs', () => {
  test('stores slug target and preserves human label as alias when needed', () => {
    expect(buildUnresolvedWikiLinkAttrs('Nonexistent Page')).toEqual({
      target: 'nonexistent-page',
      alias: 'Nonexistent Page',
      anchor: null,
    });
  });

  test('returns null for empty input', () => {
    expect(buildUnresolvedWikiLinkAttrs('   ')).toBeNull();
  });
});

describe('isResolvedWikiLinkTarget', () => {
  test('matches exact doc names and slug-equivalent human labels', () => {
    const pages = new Set(['test-doc', 'nonexistent-page']);
    expect(isResolvedWikiLinkTarget('test-doc', pages)).toBe(true);
    expect(isResolvedWikiLinkTarget('Nonexistent Page', pages)).toBe(true);
    expect(isResolvedWikiLinkTarget('Missing Page', pages)).toBe(false);
  });
});
