import { describe, expect, test } from 'bun:test';
import type { HeadingEntry } from '@inkeep/open-knowledge-core';
import {
  buildAnchorItems,
  buildSuggestionItems,
  computeFallbackAttrs,
  type PageItem,
  parseQuery,
  wikiLinkMatcher,
} from './wiki-link-suggestion';

const pages: PageItem[] = [
  { docName: 'test-doc', title: 'Test Document' },
  { docName: 'release-notes', title: 'Release Notes' },
  { docName: 'qa-source', title: 'QA Source File' },
];

describe('parseQuery', () => {
  test('page mode when query has no #', () => {
    expect(parseQuery('release-notes')).toEqual({
      mode: 'page',
      pageTarget: '',
      anchorQuery: '',
    });
  });

  test('anchor mode when # has non-empty left side', () => {
    expect(parseQuery('release-notes#changes')).toEqual({
      mode: 'anchor',
      pageTarget: 'release-notes',
      anchorQuery: 'changes',
    });
  });

  test('anchor mode with empty anchor query', () => {
    expect(parseQuery('release-notes#')).toEqual({
      mode: 'anchor',
      pageTarget: 'release-notes',
      anchorQuery: '',
    });
  });

  test('page mode when # is at position 0', () => {
    expect(parseQuery('#heading')).toEqual({
      mode: 'page',
      pageTarget: '',
      anchorQuery: '',
    });
  });

  test('page mode for empty query', () => {
    expect(parseQuery('')).toEqual({
      mode: 'page',
      pageTarget: '',
      anchorQuery: '',
    });
  });
});

describe('buildSuggestionItems', () => {
  test('returns all pages (up to MAX_ITEMS) when query is empty', () => {
    const items = buildSuggestionItems(pages, '');
    expect(items).toEqual([
      { kind: 'page', docName: 'test-doc', title: 'Test Document' },
      { kind: 'page', docName: 'release-notes', title: 'Release Notes' },
      { kind: 'page', docName: 'qa-source', title: 'QA Source File' },
    ]);
  });

  test('returns matching pages when results exist', () => {
    expect(buildSuggestionItems(pages, 'test')).toEqual([
      {
        kind: 'page',
        docName: 'test-doc',
        title: 'Test Document',
      },
    ]);
  });

  test('matches by docName when title differs', () => {
    expect(buildSuggestionItems(pages, 'qa-source')).toEqual([
      {
        kind: 'page',
        docName: 'qa-source',
        title: 'QA Source File',
      },
    ]);
  });

  test('returns a selectable create action when there are no matches', () => {
    expect(buildSuggestionItems(pages, 'A Brand New Page')).toEqual([
      {
        kind: 'create',
        docName: 'a-brand-new-page',
        title: 'A Brand New Page',
        actionLabel: 'Insert unresolved link "A Brand New Page"',
      },
    ]);
  });
});

describe('buildAnchorItems', () => {
  const headings: HeadingEntry[] = [
    { level: 1, text: 'Introduction', slug: 'introduction' },
    { level: 2, text: 'Getting Started', slug: 'getting-started' },
    { level: 3, text: 'Prerequisites', slug: 'prerequisites' },
  ];

  test('returns all headings when anchorQuery is empty', () => {
    expect(buildAnchorItems('release-notes', headings, '')).toEqual([
      {
        kind: 'anchor',
        docName: 'release-notes',
        level: 1,
        text: 'Introduction',
        slug: 'introduction',
      },
      {
        kind: 'anchor',
        docName: 'release-notes',
        level: 2,
        text: 'Getting Started',
        slug: 'getting-started',
      },
      {
        kind: 'anchor',
        docName: 'release-notes',
        level: 3,
        text: 'Prerequisites',
        slug: 'prerequisites',
      },
    ]);
  });

  test('filters headings by anchorQuery', () => {
    const items = buildAnchorItems('release-notes', headings, 'get');
    expect(items).toEqual([
      {
        kind: 'anchor',
        docName: 'release-notes',
        level: 2,
        text: 'Getting Started',
        slug: 'getting-started',
      },
    ]);
  });

  test('returns empty array when no headings match', () => {
    expect(buildAnchorItems('release-notes', headings, 'zzzznothing')).toEqual([]);
  });

  test('maps HeadingEntry fields correctly to WikiLinkSuggestionItem', () => {
    const single: HeadingEntry[] = [{ level: 4, text: 'Deep Section', slug: 'deep-section' }];
    expect(buildAnchorItems('my-doc', single, '')).toEqual([
      { kind: 'anchor', docName: 'my-doc', level: 4, text: 'Deep Section', slug: 'deep-section' },
    ]);
  });
});

describe('computeFallbackAttrs', () => {
  test('returns null for empty query (unslugable)', () => {
    expect(computeFallbackAttrs('')).toBeNull();
  });

  test('returns null for whitespace-only query', () => {
    expect(computeFallbackAttrs('   ')).toBeNull();
  });

  test('page mode: derives unresolved link attrs from query', () => {
    expect(computeFallbackAttrs('My New Page')).toEqual({
      target: 'my-new-page',
      alias: 'My New Page',
      anchor: null,
    });
  });

  test('page mode: slug equals original when already slugified', () => {
    expect(computeFallbackAttrs('already-slug')).toEqual({
      target: 'already-slug',
      alias: null,
      anchor: null,
    });
  });

  test('anchor mode: inserts target + anchor when both present', () => {
    expect(computeFallbackAttrs('release-notes#changes')).toEqual({
      target: 'release-notes',
      alias: null,
      anchor: 'changes',
    });
  });

  test('anchor mode: anchor null when only hash is typed', () => {
    expect(computeFallbackAttrs('release-notes#')).toEqual({
      target: 'release-notes',
      alias: null,
      anchor: null,
    });
  });

  test('anchor mode: anchor null when anchor query is whitespace-only', () => {
    expect(computeFallbackAttrs('release-notes#   ')).toEqual({
      target: 'release-notes',
      alias: null,
      anchor: null,
    });
  });

  test('leading hash is treated as page mode, not anchor mode', () => {
    // parseQuery only treats `#` as anchor separator when it has a non-empty left side
    expect(computeFallbackAttrs('#bar')).toEqual({
      target: 'bar',
      alias: '#bar',
      anchor: null,
    });
  });
});

describe('wikiLinkMatcher', () => {
  /** Stub that satisfies the subset of ResolvedPos used by wikiLinkMatcher. */
  function stubPosition(textBefore: string, blockStart: number) {
    const cursorPos = blockStart + textBefore.length;
    return {
      $position: {
        parent: {
          textBetween: () => textBefore,
        },
        parentOffset: textBefore.length,
        start: () => blockStart,
        pos: cursorPos,
      },
    };
  }

  test('matches [[ at start of block', () => {
    const result = wikiLinkMatcher(stubPosition('[[', 1) as never);
    expect(result).toEqual({
      range: { from: 1, to: 3 },
      query: '',
      text: '[[',
    });
  });

  test('matches [[ with query text', () => {
    const result = wikiLinkMatcher(stubPosition('[[release-notes', 1) as never);
    expect(result).toEqual({
      range: { from: 1, to: 16 },
      query: 'release-notes',
      text: '[[release-notes',
    });
  });

  test('matches [[ with anchor query (# included in query)', () => {
    const result = wikiLinkMatcher(stubPosition('[[page#heading', 1) as never);
    expect(result).toEqual({
      range: { from: 1, to: 15 },
      query: 'page#heading',
      text: '[[page#heading',
    });
  });

  test('matches [[ after preceding text', () => {
    const result = wikiLinkMatcher(stubPosition('some text [[foo', 1) as never);
    expect(result).toEqual({
      range: { from: 11, to: 16 },
      query: 'foo',
      text: '[[foo',
    });
  });

  test('returns null when no [[ found', () => {
    expect(wikiLinkMatcher(stubPosition('no brackets here', 1) as never)).toBeNull();
  });

  test('returns null when ] appears after [[ (closed bracket)', () => {
    expect(wikiLinkMatcher(stubPosition('[[done]', 1) as never)).toBeNull();
  });
});
