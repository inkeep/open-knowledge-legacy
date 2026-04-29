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

  test('preserves escaped wiki-link brackets', () => {
    expect(rewriteWikiLinksForDocumentRename('See \\[[old]] here.\n', 'old', 'new')).toEqual({
      markdown: 'See \\[[old]] here.\n',
      rewrites: 0,
    });
  });

  test('ignores wiki-links inside tilde fences', () => {
    const markdown = ['~~~md', '[[old]]', '~~~', ''].join('\n');
    expect(rewriteWikiLinksForDocumentRename(markdown, 'old', 'new')).toEqual({
      markdown,
      rewrites: 0,
    });
  });

  test('ignores wiki-links inside inline code spans', () => {
    expect(rewriteWikiLinksForDocumentRename('Check `[[old]]` inline.\n', 'old', 'new')).toEqual({
      markdown: 'Check `[[old]]` inline.\n',
      rewrites: 0,
    });
  });

  test('rewrites multiple wiki-links on the same line', () => {
    expect(
      rewriteWikiLinksForDocumentRename('[[old]] and [[old#s]] and [[old|alias]]\n', 'old', 'new'),
    ).toEqual({
      markdown: '[[new]] and [[new#s]] and [[new|alias]]\n',
      rewrites: 3,
    });
  });

  test('rewrites wiki-links after markdown prefixes', () => {
    const markdown = ['- [[old]]', '> [[old]]', '## [[old]]', ''].join('\n');
    expect(rewriteWikiLinksForDocumentRename(markdown, 'old', 'new')).toEqual({
      markdown: ['- [[new]]', '> [[new]]', '## [[new]]', ''].join('\n'),
      rewrites: 3,
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

  test('preserves query strings in markdown links', () => {
    expect(
      rewriteMarkdownLinksForDocumentRename(
        'See [API](./old.md?tab=api#section).\n',
        'notes',
        'old',
        'new',
      ),
    ).toEqual({
      markdown: 'See [API](./new.md?tab=api#section).\n',
      rewrites: 1,
    });
  });

  test('preserves angle brackets around hrefs', () => {
    expect(
      rewriteMarkdownLinksForDocumentRename('See [Spaced](<./old.md>).\n', 'notes', 'old', 'new'),
    ).toEqual({
      markdown: 'See [Spaced](<./new.md>).\n',
      rewrites: 1,
    });
  });

  test('preserves .mdx extension on markdown-link rewrite', () => {
    expect(
      rewriteMarkdownLinksForDocumentRename(
        'See [Component](./old.mdx#section).\n',
        'notes',
        'old',
        'new',
      ),
    ).toEqual({
      markdown: 'See [Component](./new.mdx#section).\n',
      rewrites: 1,
    });
  });

  test('preserves .mdx extension when renamed doc moves paths', () => {
    expect(
      rewriteMarkdownLinksForDocumentRename(
        'See [Overview](../old.mdx#section).\n',
        'folder/page',
        'old',
        'guides/new',
      ),
    ).toEqual({
      markdown: 'See [Overview](../guides/new.mdx#section).\n',
      rewrites: 1,
    });
  });
});
