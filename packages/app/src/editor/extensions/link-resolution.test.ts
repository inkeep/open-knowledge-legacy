import { describe, expect, test } from 'bun:test';
import { toWikiLinkSlug } from '@inkeep/open-knowledge-core';
import { buildPagesBySlugIndex, type PageListCacheSnapshot } from '../page-list-cache';
import {
  computeLinkResolutionAttrs,
  computeLinkResolutionState,
  makeLinkResolutionAttrsComputer,
} from './link-resolution';
import type { MarkInfo } from './mark-identity';

function makeCache(opts: {
  pages?: Iterable<string>;
  folderPaths?: Iterable<string>;
}): PageListCacheSnapshot {
  const pages = new Set(opts.pages ?? []);
  return {
    pages,
    folderPaths: new Set(opts.folderPaths ?? []),
    pagesBySlug: buildPagesBySlugIndex(pages, toWikiLinkSlug),
  };
}

function makeMarkInfo(attrs: Record<string, unknown>, overrides?: Partial<MarkInfo>): MarkInfo {
  return {
    id: 'm1',
    markType: 'link',
    attrs,
    from: 0,
    to: 5,
    ...overrides,
  };
}

describe('computeLinkResolutionState', () => {
  test('empty href → unresolved', () => {
    expect(computeLinkResolutionState('', 'README', null)).toBe('unresolved');
    expect(computeLinkResolutionState('   ', 'README', null)).toBe('unresolved');
  });

  test('external https URL → external regardless of cache', () => {
    expect(computeLinkResolutionState('https://example.com', 'README', null)).toBe('external');
    expect(
      computeLinkResolutionState('https://example.com', 'README', makeCache({ pages: [] })),
    ).toBe('external');
  });

  test('external mailto URL → external', () => {
    expect(computeLinkResolutionState('mailto:a@b.com', 'README', null)).toBe('external');
  });

  test('leading-slash path → external', () => {
    expect(computeLinkResolutionState('/abs/path', 'README', null)).toBe('external');
  });

  test('anchor-only href → anchor regardless of cache', () => {
    expect(computeLinkResolutionState('#some-section', 'README', null)).toBe('anchor');
    expect(computeLinkResolutionState('#other', 'README', makeCache({ pages: ['README'] }))).toBe(
      'anchor',
    );
  });

  test('doc href with null cache → loading', () => {
    expect(computeLinkResolutionState('./OTHER.md', 'README', null)).toBe('loading');
    expect(computeLinkResolutionState('../parent.md', 'sub/README', null)).toBe('loading');
  });

  test('doc href with cache, target exists → resolved', () => {
    const cache = makeCache({ pages: ['OTHER'] });
    expect(computeLinkResolutionState('./OTHER.md', 'README', cache)).toBe('resolved');
  });

  test('doc href with cache, target missing → unresolved', () => {
    const cache = makeCache({ pages: ['OTHER'] });
    expect(computeLinkResolutionState('./NONEXISTENT.md', 'README', cache)).toBe('unresolved');
  });

  test('doc href with cache, target is folder → folder', () => {
    const cache = makeCache({ pages: [], folderPaths: ['subfolder'] });
    expect(computeLinkResolutionState('./subfolder', 'README', cache)).toBe('folder');
  });

  test('relative href normalization matches classifyMarkdownHref', () => {
    const cache = makeCache({ pages: ['topic/page'] });
    expect(computeLinkResolutionState('./page.md', 'topic/other', cache)).toBe('resolved');
  });

  test('deterministic — repeated calls with same inputs produce same output', () => {
    const cache = makeCache({ pages: ['A'] });
    const first = computeLinkResolutionState('./A.md', 'README', cache);
    const second = computeLinkResolutionState('./A.md', 'README', cache);
    const third = computeLinkResolutionState('./A.md', 'README', cache);
    expect(first).toBe('resolved');
    expect(second).toBe(first);
    expect(third).toBe(first);
  });
});

describe('computeLinkResolutionAttrs', () => {
  test('returns data-resolution-state attr for valid href', () => {
    const cache = makeCache({ pages: ['OTHER'] });
    const mark = makeMarkInfo({ href: './OTHER.md' });
    const result = computeLinkResolutionAttrs(mark, cache, 'README');
    expect(result).toEqual({ 'data-resolution-state': 'resolved' });
  });

  test('returns null when href attr missing', () => {
    const mark = makeMarkInfo({});
    expect(computeLinkResolutionAttrs(mark, null, 'README')).toBeNull();
  });

  test('returns null when href attr is null', () => {
    const mark = makeMarkInfo({ href: null });
    expect(computeLinkResolutionAttrs(mark, null, 'README')).toBeNull();
  });

  test('returns null when href attr is empty string', () => {
    const mark = makeMarkInfo({ href: '' });
    expect(computeLinkResolutionAttrs(mark, null, 'README')).toBeNull();
  });

  test('returns null when href attr is non-string', () => {
    const mark = makeMarkInfo({ href: 42 });
    expect(computeLinkResolutionAttrs(mark, null, 'README')).toBeNull();
  });

  test('external href → attr state=external', () => {
    const mark = makeMarkInfo({ href: 'https://example.com' });
    expect(computeLinkResolutionAttrs(mark, null, 'README')).toEqual({
      'data-resolution-state': 'external',
    });
  });

  test('anchor href → attr state=anchor', () => {
    const mark = makeMarkInfo({ href: '#top' });
    expect(computeLinkResolutionAttrs(mark, null, 'README')).toEqual({
      'data-resolution-state': 'anchor',
    });
  });

  test('doc href + null cache → attr state=loading', () => {
    const mark = makeMarkInfo({ href: './X.md' });
    expect(computeLinkResolutionAttrs(mark, null, 'README')).toEqual({
      'data-resolution-state': 'loading',
    });
  });

  test('wikiembed-sourced link → no decoration (skip classification)', () => {
    const cache = makeCache({ pages: ['README'] });
    const mark = makeMarkInfo({ href: 'docs/foo.pdf', sourceForm: 'wikiembed' });
    expect(computeLinkResolutionAttrs(mark, cache, 'README')).toBeNull();
  });

  test('plain link mark (sourceForm=null) still gets decoration', () => {
    const cache = makeCache({ pages: ['OTHER'] });
    const mark = makeMarkInfo({ href: './OTHER.md', sourceForm: null });
    expect(computeLinkResolutionAttrs(mark, cache, 'README')).toEqual({
      'data-resolution-state': 'resolved',
    });
  });
});

describe('makeLinkResolutionAttrsComputer', () => {
  test('returns a function that captures sourceDocName', () => {
    const computer = makeLinkResolutionAttrsComputer('my-doc');
    expect(typeof computer).toBe('function');
  });

  test('bound computer delegates to computeLinkResolutionAttrs with captured docName', () => {
    const cache = makeCache({ pages: ['my-doc/child'] });
    const computer = makeLinkResolutionAttrsComputer('my-doc/parent');
    const mark = makeMarkInfo({ href: './child.md' });
    expect(computer(mark, cache)).toEqual({ 'data-resolution-state': 'resolved' });
  });

  test('bound computer handles all state branches', () => {
    const computer = makeLinkResolutionAttrsComputer('README');
    expect(computer(makeMarkInfo({ href: 'https://a.com' }), null)).toEqual({
      'data-resolution-state': 'external',
    });
    expect(computer(makeMarkInfo({ href: '#a' }), null)).toEqual({
      'data-resolution-state': 'anchor',
    });
    expect(computer(makeMarkInfo({ href: './X.md' }), null)).toEqual({
      'data-resolution-state': 'loading',
    });
    expect(computer(makeMarkInfo({ href: './X.md' }), makeCache({ pages: ['X'] }))).toEqual({
      'data-resolution-state': 'resolved',
    });
    expect(computer(makeMarkInfo({ href: './MISSING.md' }), makeCache({ pages: ['X'] }))).toEqual({
      'data-resolution-state': 'unresolved',
    });
  });

  test('different docNames produce different closures', () => {
    const computer1 = makeLinkResolutionAttrsComputer('doc-a');
    const computer2 = makeLinkResolutionAttrsComputer('doc-b');
    expect(computer1).not.toBe(computer2);
  });

  test('bound computer returns null on malformed mark (propagates computeLinkResolutionAttrs behavior)', () => {
    const computer = makeLinkResolutionAttrsComputer('README');
    expect(computer(makeMarkInfo({}), null)).toBeNull();
    expect(computer(makeMarkInfo({ href: null }), null)).toBeNull();
  });
});
