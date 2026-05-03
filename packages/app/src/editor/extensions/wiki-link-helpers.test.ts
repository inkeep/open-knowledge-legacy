import { describe, expect, test } from 'bun:test';
import {
  buildUnresolvedWikiLinkAttrs,
  canUseTargetAsPathSegment,
  isResolvedWikiLinkTarget,
  resolveWikiLinkAssetTarget,
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

  test('matches referenced asset paths and basenames', () => {
    const pages = new Set(['test-doc']);
    const assets = new Set(['docs/public/Wide.png']);
    expect(isResolvedWikiLinkTarget('/docs/public/Wide.png', pages, assets)).toBe(true);
    expect(isResolvedWikiLinkTarget('docs/public/wide.png', pages, assets)).toBe(true);
    expect(isResolvedWikiLinkTarget('Wide.png', pages, assets)).toBe(true);
    expect(isResolvedWikiLinkTarget('Missing.png', pages, assets)).toBe(false);
  });
});

describe('resolveWikiLinkAssetTarget', () => {
  test('resolves server-absolute, content-relative, and basename asset targets', () => {
    const assets = new Set(['docs/public/Wide.png']);
    expect(resolveWikiLinkAssetTarget('/docs/public/Wide.png', assets)).toBe(
      'docs/public/Wide.png',
    );
    expect(resolveWikiLinkAssetTarget('docs/public/wide.png', assets)).toBe('docs/public/Wide.png');
    expect(resolveWikiLinkAssetTarget('Wide.png', assets)).toBe('docs/public/Wide.png');
  });

  test('does not basename-match path-shaped misses', () => {
    const assets = new Set(['docs/public/Wide.png']);
    expect(resolveWikiLinkAssetTarget('other/Wide.png', assets)).toBeNull();
  });
});

describe('isResolvedWikiLinkTarget — case-insensitive resolution against case-preserved pages cache', () => {
  test('lowercased slug resolves against case-preserved cache entry', () => {
    const pages = new Set(['README']);
    expect(isResolvedWikiLinkTarget('readme', pages)).toBe(true);
  });

  test('exact case match still resolves (regression guard)', () => {
    const pages = new Set(['README']);
    expect(isResolvedWikiLinkTarget('README', pages)).toBe(true);
  });

  test('underscore/case filename (BA_for_Depression_Research) resolves', () => {
    const pages = new Set(['BA_for_Depression_Research']);
    expect(isResolvedWikiLinkTarget('ba-for-depression-research', pages)).toBe(true);
    expect(isResolvedWikiLinkTarget('BA_for_Depression_Research', pages)).toBe(true);
  });

  test('hyphenated slug resolves against hyphenated case-preserved entry', () => {
    const pages = new Set(['My-File']);
    expect(isResolvedWikiLinkTarget('my-file', pages)).toBe(true);
    expect(isResolvedWikiLinkTarget('My-File', pages)).toBe(true);
  });

  test('no spurious match when target is truly absent', () => {
    const pages = new Set(['README', 'AGENTS']);
    expect(isResolvedWikiLinkTarget('nonexistent', pages)).toBe(false);
    expect(isResolvedWikiLinkTarget('somethingelse', pages)).toBe(false);
  });

  test('subdirectory-preserving docName (packages/server/README) resolves case-insensitively', () => {
    const pages = new Set(['packages/server/README']);
    expect(isResolvedWikiLinkTarget('packages/server/README', pages)).toBe(true);
    expect(isResolvedWikiLinkTarget('packages/server/readme', pages)).toBe(true);
  });

  test('empty / whitespace target never resolves', () => {
    const pages = new Set(['README']);
    expect(isResolvedWikiLinkTarget('', pages)).toBe(false);
    expect(isResolvedWikiLinkTarget('   ', pages)).toBe(false);
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
