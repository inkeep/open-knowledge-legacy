import { describe, expect, test } from 'bun:test';
import {
  buildUnresolvedWikiLinkAttrs,
  canUseTargetAsPathSegment,
  isResolvedWikiLinkTarget,
  toWikiLinkSlug,
  wikiLinkSuggestedFilename,
} from './wiki-link-helpers';

describe('toWikiLinkSlug', () => {
  test('normalizes human-readable page names to doc slugs', () => {
    expect(toWikiLinkSlug('Nonexistent Page')).toBe('nonexistent-page');
    expect(toWikiLinkSlug('  Mixed_CASE  Page  ')).toBe('mixed-case-page');
  });

  test('keeps Unicode-safe slugs stable across scripts', () => {
    expect(toWikiLinkSlug('Café Menu')).toBe('cafe-menu');
    expect(toWikiLinkSlug('東京 2026')).toBe('東京-2026');
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

  test('uses the shared Unicode-safe slugger for unresolved links', () => {
    expect(buildUnresolvedWikiLinkAttrs('Café Menu')).toEqual({
      target: 'cafe-menu',
      alias: 'Café Menu',
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

describe('canUseTargetAsPathSegment', () => {
  test('accepts plain text and spaces', () => {
    expect(canUseTargetAsPathSegment('Y')).toBe(true);
    expect(canUseTargetAsPathSegment('Page Name')).toBe(true);
  });

  test('rejects path separators, reserved chars, dot/dotdot, trailing dot/space', () => {
    expect(canUseTargetAsPathSegment('Page/Name')).toBe(false);
    expect(canUseTargetAsPathSegment('a\\b')).toBe(false);
    expect(canUseTargetAsPathSegment('Trailing Dot.')).toBe(false);
    expect(canUseTargetAsPathSegment('  ')).toBe(false);
    expect(canUseTargetAsPathSegment('.')).toBe(false);
    expect(canUseTargetAsPathSegment('..')).toBe(false);
    expect(canUseTargetAsPathSegment('a:b')).toBe(false);
  });
});

describe('wikiLinkSuggestedFilename', () => {
  test('preserves a valid unresolved target as the literal filename', () => {
    expect(wikiLinkSuggestedFilename('Y')).toBe('Y.md');
    expect(wikiLinkSuggestedFilename('Page Name')).toBe('Page Name.md');
  });

  test('falls back to slug form for invalid path segments', () => {
    expect(wikiLinkSuggestedFilename('Page/Name')).toBe('page-name.md');
    expect(wikiLinkSuggestedFilename('Trailing Dot.')).toBe('trailing-dot.md');
  });
});
