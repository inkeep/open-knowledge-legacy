import { describe, expect, test } from 'bun:test';
import type { HeadingEntry } from '@inkeep/open-knowledge-core';
import {
  buildAnchorItems,
  buildSuggestionItems,
  type PageItem,
  parseQuery,
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
