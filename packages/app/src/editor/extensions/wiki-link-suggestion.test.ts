import { describe, expect, test } from 'bun:test';
import { buildSuggestionItems, type PageItem } from './wiki-link-suggestion';

const pages: PageItem[] = [
  { docName: 'test-doc', title: 'Test Document' },
  { docName: 'release-notes', title: 'Release Notes' },
];

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
