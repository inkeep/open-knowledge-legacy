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

describe('rewriteMarkdownLinksForDocumentRename — image refs (FR-7)', () => {
  // Image refs only rewrite when the SOURCE doc itself moves (sourceDocName
  // === oldDocName). When a remote doc renames and we're updating links in
  // OUR doc, our image refs are unrelated and stay verbatim.

  test('cross-dir source-doc move recomputes bare-name image-ref to a `../` path', () => {
    // 'docs/meeting-notes.md' moves to 'archive/2026/meeting-notes.md'.
    // The image at 'docs/first-draft.png' stays put; the ref must point
    // up two levels and back down into docs/.
    const result = rewriteMarkdownLinksForDocumentRename(
      '![first draft](first-draft.png)\n',
      'docs/meeting-notes',
      'docs/meeting-notes',
      'archive/2026/meeting-notes',
    );
    expect(result).toEqual({
      markdown: '![first draft](../../docs/first-draft.png)\n',
      rewrites: 1,
    });
  });

  test('depth-decreasing source-doc move recomputes path with fewer `../`', () => {
    // 'archive/2026/meeting.md' → 'meeting.md' (root).
    // Asset at 'archive/2026/photo.png' stays put.
    const result = rewriteMarkdownLinksForDocumentRename(
      '![alt](photo.png)\n',
      'archive/2026/meeting',
      'archive/2026/meeting',
      'meeting',
    );
    expect(result).toEqual({
      markdown: '![alt](archive/2026/photo.png)\n',
      rewrites: 1,
    });
  });

  test('source-doc move into the asset directory shortens to bare name', () => {
    // 'top-level.md' contains './assets/photo.png'; doc moves into assets/
    // → ref shortens to bare-name.
    const result = rewriteMarkdownLinksForDocumentRename(
      '![alt](./assets/photo.png)\n',
      'top-level',
      'top-level',
      'assets/top-level',
    );
    expect(result.markdown).toContain('photo.png');
    expect(result.markdown).not.toContain('./assets/photo.png');
    expect(result.rewrites).toBe(1);
  });

  test('absolute-path image refs are LEFT UNCHANGED — pre-F8 legacy guard', () => {
    // SPEC §13 explicit fixture requirement. An absolute path was emitted
    // by pre-F8 shortestImageRef; rewriting it would silently break.
    const result = rewriteMarkdownLinksForDocumentRename(
      '![alt](/docs/photo.png)\n',
      'docs/meeting-notes',
      'docs/meeting-notes',
      'archive/2026/meeting-notes',
    );
    expect(result).toEqual({
      markdown: '![alt](/docs/photo.png)\n',
      rewrites: 0,
    });
  });

  test('full-URL image refs left unchanged', () => {
    const result = rewriteMarkdownLinksForDocumentRename(
      '![alt](https://cdn.example.com/photo.png)\n',
      'docs/meeting-notes',
      'docs/meeting-notes',
      'archive/2026/meeting-notes',
    );
    expect(result).toEqual({
      markdown: '![alt](https://cdn.example.com/photo.png)\n',
      rewrites: 0,
    });
  });

  test('protocol-relative image refs left unchanged', () => {
    const result = rewriteMarkdownLinksForDocumentRename(
      '![alt](//cdn.example.com/photo.png)\n',
      'docs/meeting-notes',
      'docs/meeting-notes',
      'archive/2026/meeting-notes',
    );
    expect(result).toEqual({
      markdown: '![alt](//cdn.example.com/photo.png)\n',
      rewrites: 0,
    });
  });

  test('wiki-embed refs (`![[file]]`) NOT rewritten — D-K refs-only', () => {
    // The basename index resolves wiki-embeds dynamically, so the ref body
    // must be byte-identical after the rename.
    const result = rewriteMarkdownLinksForDocumentRename(
      '![[first-draft.png]] and ![[diagram.svg|alt]]\n',
      'docs/meeting-notes',
      'docs/meeting-notes',
      'archive/2026/meeting-notes',
    );
    expect(result).toEqual({
      markdown: '![[first-draft.png]] and ![[diagram.svg|alt]]\n',
      rewrites: 0,
    });
  });

  test('mixed wiki-embed + markdown-image + doc-link in one body — only the latter two rewrite', () => {
    // P5.1e composite scenario.
    const md =
      '# Meeting\n\n![[wiki-embed.png]] and ![plain](md-image.png) and [other doc](./other.md)\n';
    const result = rewriteMarkdownLinksForDocumentRename(
      md,
      'docs/meeting',
      'docs/meeting',
      'archive/2026/meeting',
    );
    expect(result.rewrites).toBe(1); // only md-image rewrites; doc-link target ('other') doesn't match oldDocName
    expect(result.markdown).toContain('![[wiki-embed.png]]'); // wiki-embed unchanged
    expect(result.markdown).toContain('../../docs/md-image.png'); // md-image recomputed
    expect(result.markdown).toContain('](./other.md)'); // doc-link untouched (target wasn't oldDocName)
  });

  test('image refs in a doc whose target rename is unrelated stay untouched', () => {
    // sourceDocName !== oldDocName → no image-ref rewrite. Only doc-to-doc
    // rewriting happens, and our image-ref is preserved verbatim.
    // resolveInternalHref on './other.md' with sourceDocName 'docs/meeting'
    // yields 'docs/other', so oldDocName needs the 'docs/' prefix.
    const result = rewriteMarkdownLinksForDocumentRename(
      'Image: ![alt](photo.png) and link [other](./other.md)\n',
      'docs/meeting',
      'docs/other',
      'docs/other-renamed',
    );
    expect(result.markdown).toContain('![alt](photo.png)'); // image unchanged
    expect(result.markdown).toContain('[other](./other-renamed.md)'); // link rewrote
  });

  test('same-dir source-doc rename (sibling rename) leaves bare-name image-refs alone', () => {
    // Renaming docs/meeting.md → docs/meeting-v2.md doesn't change dirname,
    // so a bare-name image ref is still correct.
    const result = rewriteMarkdownLinksForDocumentRename(
      '![alt](photo.png)\n',
      'docs/meeting',
      'docs/meeting',
      'docs/meeting-v2',
    );
    expect(result).toEqual({
      markdown: '![alt](photo.png)\n',
      rewrites: 0,
    });
  });

  test('image refs are skipped inside fenced code blocks', () => {
    const md = ['```md', '![alt](photo.png)', '```', ''].join('\n');
    const result = rewriteMarkdownLinksForDocumentRename(
      md,
      'docs/meeting',
      'docs/meeting',
      'archive/meeting',
    );
    expect(result).toEqual({ markdown: md, rewrites: 0 });
  });
});
