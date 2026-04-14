import { describe, expect, test } from 'bun:test';
import {
  rewriteMarkdownLinksForDocumentRename,
  rewriteWikiLinksForDocumentRename,
} from './managed-rename-rewrite.ts';

describe('rewriteWikiLinksForDocumentRename', () => {
  test('rewrites matching wiki-links while preserving alias and anchor', () => {
    expect(
      rewriteWikiLinksForDocumentRename(
        'See [[old#install|Install Guide]] and [[other]].\n',
        'old',
        'new',
      ),
    ).toEqual({
      markdown: 'See [[new#install|Install Guide]] and [[other]].\n',
      rewrites: 1,
    });
  });
});

describe('rewriteMarkdownLinksForDocumentRename', () => {
  test('rewrites matching internal inline markdown links while preserving text and title', () => {
    expect(
      rewriteMarkdownLinksForDocumentRename(
        'See [Install Guide](./old.md#install "Docs") and [Other](./other.md).\n',
        'notes',
        'old',
        'new',
      ),
    ).toEqual({
      markdown: 'See [Install Guide](./new.md#install "Docs") and [Other](./other.md).\n',
      rewrites: 1,
    });
  });

  test('recomputes the relative href when the renamed document moves paths', () => {
    expect(
      rewriteMarkdownLinksForDocumentRename(
        'See [Overview](../old.md#section).\n',
        'folder/page',
        'old',
        'guides/new',
      ),
    ).toEqual({
      markdown: 'See [Overview](../guides/new.md#section).\n',
      rewrites: 1,
    });
  });

  test('leaves unsupported or non-matching link forms unchanged', () => {
    const markdown = [
      'See [External](https://example.com), [Anchor](#section), ![Image](./old.md), [Ref][old], [Other](./other.md), and [Match](../old.md).',
      '',
      '```md',
      '[Code](../old.md)',
      '```',
      '',
      'Inline `[Skip](../old.md)` stays literal.',
    ].join('\n');

    expect(rewriteMarkdownLinksForDocumentRename(markdown, 'folder/page', 'old', 'new')).toEqual({
      markdown: [
        'See [External](https://example.com), [Anchor](#section), ![Image](./old.md), [Ref][old], [Other](./other.md), and [Match](../new.md).',
        '',
        '```md',
        '[Code](../old.md)',
        '```',
        '',
        'Inline `[Skip](../old.md)` stays literal.',
      ].join('\n'),
      rewrites: 1,
    });
  });
});
