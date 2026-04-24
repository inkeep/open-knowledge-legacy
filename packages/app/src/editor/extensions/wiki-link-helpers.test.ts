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

// Bug A regression guard (2026-04-24): `buildUnresolvedWikiLinkAttrs` stores
// the lowercased slug as target (e.g. `README.md` drop → target='readme'),
// but the page-list cache populated from /api/documents is keyed by
// case-preserved docName (`README`). Exact `pages.has(target)` never matches,
// and `getWikiLinkResolutionCandidates` adds no candidate when input already
// equals its own slug. Result: every non-lowercase-alphanum filename drop OR
// hand-typed wiki-link (via fallback/create paths in the suggestion menu)
// shows "Page not found" in the PropPanel even though the doc exists.
//
// Fix contract: resolver must recognize case-preserved cache entries. These
// tests pin the case-insensitive fallback behavior so it survives future
// refactors of `buildUnresolvedWikiLinkAttrs` / the slug function / the
// suggestion-menu paths.
describe('isResolvedWikiLinkTarget — case-insensitive resolution against case-preserved pages cache', () => {
  test('lowercased slug resolves against case-preserved cache entry', () => {
    // Simulates: user drops `README.md` → `buildUnresolvedWikiLinkAttrs`
    // stores target='readme'. Cache has 'README' from /api/documents.
    const pages = new Set(['README']);
    expect(isResolvedWikiLinkTarget('readme', pages)).toBe(true);
  });

  test('exact case match still resolves (regression guard)', () => {
    const pages = new Set(['README']);
    expect(isResolvedWikiLinkTarget('README', pages)).toBe(true);
  });

  test('underscore/case filename (BA_for_Depression_Research) resolves', () => {
    // Common real-world shape: snake_case or mixed-case doc names.
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
    // Page cache stores full subdirectory paths like `packages/server/README`.
    // A hand-typed `[[packages/server/README]]` should resolve. The drop
    // flow wouldn't produce this target (file.name is basename-only), but
    // the resolver still needs to work for hand-typed cross-subdir links.
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
