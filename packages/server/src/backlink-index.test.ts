import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BacklinkIndex,
  type ExtractedWikiLink,
  extractMarkdownLinksFromMarkdown,
  extractWikiLinksFromMarkdown,
  resolveMarkdownHref,
} from './backlink-index.ts';

describe('extractWikiLinksFromMarkdown', () => {
  test('extracts wiki-link targets with context snippets', () => {
    expect(extractWikiLinksFromMarkdown('Alpha links to [[beta]] for deployment notes.\n')).toEqual<
      ExtractedWikiLink[]
    >([
      {
        target: 'beta',
        anchor: null,
        snippet: 'Alpha links to beta for deployment notes.',
      },
    ]);
  });

  test('ignores wiki-links inside fenced code blocks and inline code', () => {
    const markdown = [
      'See [[alpha]].',
      '',
      '```ts',
      'const example = "[[beta]]";',
      '```',
      '',
      'Inline `[[gamma]]` should not count.',
    ].join('\n');

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      {
        target: 'alpha',
        anchor: null,
        snippet: 'See alpha.',
      },
    ]);
  });

  test('tolerates colon ranges that remark-directive would claim', () => {
    const markdown = '**Current (slash-command.ts:108-115):**\n\nSee [[beta]].\n';

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      {
        target: 'beta',
        anchor: null,
        snippet: 'See beta.',
      },
    ]);
  });

  test('ignores wiki-links inside tilde fenced code blocks', () => {
    const markdown = [
      'See [[alpha]].',
      '',
      '~~~js',
      'const x = "[[beta]]";',
      '~~~',
      '',
      'And [[gamma]].',
    ].join('\n');

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'alpha', anchor: null, snippet: 'See alpha.' },
      { target: 'gamma', anchor: null, snippet: 'And gamma.' },
    ]);
  });

  test('fence-length matching: longer closing fence ends a shorter opening fence', () => {
    const markdown = [
      'Before [[alpha]].',
      '````ts',
      '[[inside]]',
      '```',
      '[[also-inside]]',
      '````',
      'After [[beta]].',
    ].join('\n');

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'alpha', anchor: null, snippet: 'Before alpha.' },
      { target: 'beta', anchor: null, snippet: 'After beta.' },
    ]);
  });

  test('extracts multiple wiki-links from the same line', () => {
    const markdown = 'See [[alpha]] and [[beta]] for more.\n';

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'alpha', anchor: null, snippet: 'See alpha and beta for more.' },
      { target: 'beta', anchor: null, snippet: 'See alpha and beta for more.' },
    ]);
  });

  test('handles anchor syntax [[page#heading]]', () => {
    const markdown = 'See [[guide#installation]] for setup.\n';

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'guide', anchor: 'installation', snippet: 'See guide#installation for setup.' },
    ]);
  });

  test('handles alias syntax [[page|display text]]', () => {
    const markdown = 'See [[guide|the guide]] for setup.\n';

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'guide', anchor: null, snippet: 'See the guide for setup.' },
    ]);
  });

  test('handles combined anchor and alias syntax [[page#section|display]]', () => {
    const markdown = 'See [[API#auth|Auth Docs]] for setup.\n';

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'API', anchor: 'auth', snippet: 'See Auth Docs for setup.' },
    ]);
  });

  test('backslash-escaped opening bracket suppresses wiki-link', () => {
    const markdown = 'Not a link: \\[[page]] but [[real]] is.\n';

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'real', anchor: null, snippet: 'Not a link: [[page]] but real is.' },
    ]);
  });

  test('inline code with multi-backtick delimiter: shorter run does not close span', () => {
    const markdown = 'See `foo``bar` and [[target]].\n';

    expect(extractWikiLinksFromMarkdown(markdown)).toEqual([
      { target: 'target', anchor: null, snippet: 'See foo``bar and target.' },
    ]);
  });
});

describe('BacklinkIndex', () => {
  test('deleteDocument removes outbound links and incoming backlinks', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-del-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      index.updateDocumentFromMarkdown('alpha', 'See [[beta]].\n');
      expect(index.getBacklinks('beta')).toEqual([
        { source: 'alpha', anchor: null, snippet: 'See beta.' },
      ]);
      index.deleteDocument('alpha');
      expect(index.getBacklinks('beta')).toEqual([]);
      expect(index.getForwardLinks('alpha')).toEqual([]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('renameDocument moves edges from old doc name to new', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-rename-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      index.updateDocumentFromMarkdown('alpha', 'See [[beta]].\n');
      expect(index.getBacklinks('beta')).toEqual([
        { source: 'alpha', anchor: null, snippet: 'See beta.' },
      ]);
      index.renameDocument('alpha', 'gamma', '# Gamma\n\nSee [[beta]].\n');
      expect(index.getBacklinks('beta')).toEqual([
        { source: 'gamma', anchor: null, snippet: 'See beta.' },
      ]);
      expect(index.getForwardLinks('alpha')).toEqual([]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('switchBranch isolates graph state per branch', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-branch-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      index.updateDocumentFromMarkdown('alpha', '[[beta]]\n', 'main');
      expect(index.getBacklinks('beta', 'main')).toEqual([
        { source: 'alpha', anchor: null, snippet: 'beta' },
      ]);

      index.switchBranch('feature');
      expect(index.getBacklinks('beta')).toEqual([]);

      index.updateDocumentFromMarkdown('gamma', '[[beta]]\n', 'feature');
      expect(index.getBacklinks('beta', 'feature')).toEqual([
        { source: 'gamma', anchor: null, snippet: 'beta' },
      ]);

      index.switchBranch('main');
      expect(index.getBacklinks('beta')).toEqual([
        { source: 'alpha', anchor: null, snippet: 'beta' },
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('updateDocument replaces forward links when content changes', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-update-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      const links1: ExtractedWikiLink[] = [{ target: 'beta', anchor: null, snippet: 'one' }];
      index.updateDocument('alpha', links1);
      expect(index.getBacklinks('beta')).toEqual([
        { source: 'alpha', anchor: null, snippet: 'one' },
      ]);

      const links2: ExtractedWikiLink[] = [{ target: 'gamma', anchor: null, snippet: 'two' }];
      index.updateDocument('alpha', links2);
      expect(index.getBacklinks('beta')).toEqual([]);
      expect(index.getBacklinks('gamma')).toEqual([
        { source: 'alpha', anchor: null, snippet: 'two' },
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('getDeadLinks returns missing targets ordered by source count then target', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-dead-links-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      writeFileSync(
        join(contentDir, 'alpha.md'),
        '# Alpha\n\nSee [[missing-target]] and [missing markdown](./missing-markdown.md) plus [[existing]].\n',
        'utf-8',
      );
      writeFileSync(join(contentDir, 'beta.md'), '# Beta\n\nSee [[missing-target]].\n', 'utf-8');
      writeFileSync(join(contentDir, 'gamma.md'), '# Gamma\n\nSee [[other-missing]].\n', 'utf-8');
      writeFileSync(join(contentDir, 'existing.md'), '# Existing\n\nBody.\n', 'utf-8');

      const index = new BacklinkIndex({ projectDir, contentDir });
      index.rebuildFromDisk();

      const deadLinks = index.getDeadLinks(['alpha', 'beta', 'gamma', 'existing']);
      expect(deadLinks.map((entry) => entry.target)).toEqual([
        'missing-target',
        'missing-markdown',
        'other-missing',
      ]);
      expect(deadLinks[0]?.sources.map((entry) => entry.source)).toEqual(['alpha', 'beta']);
      expect(deadLinks[1]?.sources.map((entry) => entry.source)).toEqual(['alpha']);
      expect(deadLinks[2]?.sources.map((entry) => entry.source)).toEqual(['gamma']);
      expect(
        deadLinks.every((entry) => entry.sources.every((source) => source.snippet !== null)),
      ).toBe(true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('getDeadLinks returns an empty array when every target exists', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-dead-links-empty-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      writeFileSync(join(contentDir, 'alpha.md'), '# Alpha\n\nSee [[beta]].\n', 'utf-8');
      writeFileSync(join(contentDir, 'beta.md'), '# Beta\n\nReady.\n', 'utf-8');

      const index = new BacklinkIndex({ projectDir, contentDir });
      index.rebuildFromDisk();

      expect(index.getDeadLinks(['alpha', 'beta'])).toEqual([]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('rebuilds from disk and persists cache per branch', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-project-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      writeFileSync(join(contentDir, 'alpha.md'), '# Alpha\n\nSee [[beta]].\n', 'utf-8');
      writeFileSync(
        join(contentDir, 'beta.md'),
        '# Beta\n\nReferenced by [[alpha]] and [[alpha#details|Alpha details]].\n',
        'utf-8',
      );

      const index = new BacklinkIndex({ projectDir, contentDir });
      index.rebuildFromDisk();

      expect(index.getBacklinks('beta')).toEqual([
        {
          source: 'alpha',
          anchor: null,
          snippet: 'See beta.',
        },
      ]);
      expect(index.getForwardLinks('beta')).toEqual(['alpha']);
      expect(index.getHubs()).toEqual([
        { docName: 'alpha', count: 1 },
        { docName: 'beta', count: 1 },
      ]);
      expect(index.getOrphans(['alpha', 'beta', 'gamma'])).toEqual(['gamma']);

      await index.saveToDisk();
      const cacheRaw = readFileSync(
        join(projectDir, '.ok', 'cache', 'main', 'backlinks.json'),
        'utf-8',
      );
      expect(cacheRaw).toContain('"beta"');

      const reloaded = new BacklinkIndex({ projectDir, contentDir });
      expect(await reloaded.loadFromDisk()).toBe(true);
      expect(reloaded.getBacklinks('beta')).toEqual([
        {
          source: 'alpha',
          anchor: null,
          snippet: 'See beta.',
        },
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('rebuildFromDisk uses raw markdown scanning instead of the full parser', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-rebuild-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      writeFileSync(
        join(contentDir, 'alpha.md'),
        '**Current (slash-command.ts:108-115):**\n\nSee [[beta]].\n',
        'utf-8',
      );
      writeFileSync(join(contentDir, 'beta.md'), '# Beta\n', 'utf-8');

      const index = new BacklinkIndex({ projectDir, contentDir });
      index.rebuildFromDisk();

      expect(index.getBacklinks('beta')).toEqual([
        {
          source: 'alpha',
          anchor: null,
          snippet: 'See beta.',
        },
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('getOrphans supports incoming, outgoing, and both modes', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-orphan-modes-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      index.updateDocumentFromMarkdown('alpha', '[[beta]]');
      index.updateDocumentFromMarkdown('beta', '# Beta');
      index.updateDocumentFromMarkdown('gamma', '# Gamma');

      const allDocs = ['alpha', 'beta', 'gamma'];

      expect(index.getOrphans(allDocs, 'incoming')).toEqual(['alpha', 'gamma']);
      expect(index.getOrphans(allDocs, 'outgoing')).toEqual(['beta', 'gamma']);
      expect(index.getOrphans(allDocs, 'both')).toEqual(['gamma']);
      expect(index.getOrphans(allDocs)).toEqual(['gamma']);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('getLinkGraph returns sorted nodes and directed edges', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-linkgraph-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      index.updateDocumentFromMarkdown('alpha', '[[beta]] and [[gamma]]');
      index.updateDocumentFromMarkdown('beta', '[[gamma]]');

      const { nodes, links } = index.getLinkGraph();

      expect(nodes).toEqual([
        { kind: 'doc', id: 'alpha', docName: 'alpha', anchor: null },
        { kind: 'doc', id: 'beta', docName: 'beta', anchor: null },
        { kind: 'doc', id: 'gamma', docName: 'gamma', anchor: null },
      ]);
      expect(links).toContainEqual({ source: 'alpha', target: 'beta' });
      expect(links).toContainEqual({ source: 'alpha', target: 'gamma' });
      expect(links).toContainEqual({ source: 'beta', target: 'gamma' });
      expect(links).toHaveLength(3);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('getLinkGraphNeighborhood returns an undirected degree-limited neighborhood', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-linkgraph-neighborhood-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      index.updateDocumentFromMarkdown('alpha', '[[beta]]');
      index.updateDocumentFromMarkdown('beta', '[[gamma]] [[delta]]');
      index.updateDocumentFromMarkdown('gamma', '[[epsilon]]');
      index.updateDocumentFromMarkdown('delta', '');
      index.updateDocumentFromMarkdown('epsilon', '');

      const oneHop = index.getLinkGraphNeighborhood('beta', 1);
      expect(oneHop.nodes).toEqual([
        { kind: 'doc', id: 'alpha', docName: 'alpha', anchor: null },
        { kind: 'doc', id: 'beta', docName: 'beta', anchor: null },
        { kind: 'doc', id: 'delta', docName: 'delta', anchor: null },
        { kind: 'doc', id: 'gamma', docName: 'gamma', anchor: null },
      ]);
      expect(oneHop.links).toContainEqual({ source: 'alpha', target: 'beta' });
      expect(oneHop.links).toContainEqual({ source: 'beta', target: 'gamma' });
      expect(oneHop.links).toContainEqual({ source: 'beta', target: 'delta' });
      expect(oneHop.links).toHaveLength(3);

      const twoHop = index.getLinkGraphNeighborhood('beta', 2);
      expect(twoHop.nodes).toEqual([
        { kind: 'doc', id: 'alpha', docName: 'alpha', anchor: null },
        { kind: 'doc', id: 'beta', docName: 'beta', anchor: null },
        { kind: 'doc', id: 'delta', docName: 'delta', anchor: null },
        { kind: 'doc', id: 'epsilon', docName: 'epsilon', anchor: null },
        { kind: 'doc', id: 'gamma', docName: 'gamma', anchor: null },
      ]);
      expect(twoHop.links).toContainEqual({ source: 'gamma', target: 'epsilon' });
      expect(twoHop.links).toHaveLength(4);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('getLinkGraphNeighborhood includes external neighbors with labels', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-linkgraph-neighborhood-external-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    try {
      const index = new BacklinkIndex({ projectDir, contentDir });
      index.updateDocumentFromMarkdown('alpha', 'See [Docs](https://example.com/docs).');
      index.updateDocumentFromMarkdown('beta', '[[alpha]]');

      const neighborhood = index.getLinkGraphNeighborhood('alpha', 1);
      expect(neighborhood.nodes).toEqual([
        { kind: 'doc', id: 'alpha', docName: 'alpha', anchor: null },
        { kind: 'doc', id: 'beta', docName: 'beta', anchor: null },
        {
          kind: 'external',
          id: 'external:https://example.com/docs',
          url: 'https://example.com/docs',
          label: 'Docs',
        },
      ]);
      expect(neighborhood.links).toContainEqual({
        source: 'alpha',
        target: 'external:https://example.com/docs',
      });
      expect(neighborhood.links).toContainEqual({ source: 'beta', target: 'alpha' });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe('resolveMarkdownHref', () => {
  test('resolves same-directory relative link', () => {
    expect(resolveMarkdownHref('./other', 'notes')).toBe('other');
    expect(resolveMarkdownHref('./other.md', 'notes')).toBe('other');
  });

  test('resolves same-directory link without leading dot', () => {
    expect(resolveMarkdownHref('sibling.md', 'notes')).toBe('sibling');
  });

  test('resolves into a subdirectory', () => {
    expect(resolveMarkdownHref('./sub/page.md', 'notes')).toBe('sub/page');
    expect(resolveMarkdownHref('sub/page', 'notes')).toBe('sub/page');
  });

  test('resolves parent-relative links', () => {
    expect(resolveMarkdownHref('../overview.md', 'folder/page')).toBe('overview');
    expect(resolveMarkdownHref('../sibling/other.md', 'folder/page')).toBe('sibling/other');
  });

  test('strips fragment and query before resolving', () => {
    expect(resolveMarkdownHref('./page.md#section', 'notes')).toBe('page');
    expect(resolveMarkdownHref('./page.md?q=1#frag', 'notes')).toBe('page');
  });

  test('returns null for external http/https links', () => {
    expect(resolveMarkdownHref('https://example.com', 'notes')).toBeNull();
    expect(resolveMarkdownHref('http://example.com/page', 'notes')).toBeNull();
  });

  test('returns null for mailto and other URI schemes', () => {
    expect(resolveMarkdownHref('mailto:foo@bar.com', 'notes')).toBeNull();
  });

  test('returns null for protocol-relative URLs', () => {
    expect(resolveMarkdownHref('//example.com/page', 'notes')).toBeNull();
  });

  test('returns null for absolute paths', () => {
    expect(resolveMarkdownHref('/absolute/path.md', 'notes')).toBeNull();
  });

  test('returns null for anchor-only links', () => {
    expect(resolveMarkdownHref('#section', 'notes')).toBeNull();
  });

  test('returns null when escaping content root', () => {
    expect(resolveMarkdownHref('../../escape.md', 'folder/page')).toBeNull();
    expect(resolveMarkdownHref('../../../way-out.md', 'deep/a/b')).toBeNull();
  });
});

describe('extractMarkdownLinksFromMarkdown', () => {
  test('extracts relative inline markdown links', () => {
    const md = 'See [related](./other.md) for details.';
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual<ExtractedWikiLink[]>([
      { target: 'other', anchor: null, snippet: 'See related for details.' },
    ]);
  });

  test('extracts multiple markdown links from the same line', () => {
    const md = 'See [page A](./a.md) and [page B](./b.md) for more.';
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual<ExtractedWikiLink[]>([
      { target: 'a', anchor: null, snippet: 'See page A and page B for more.' },
      { target: 'b', anchor: null, snippet: 'See page A and page B for more.' },
    ]);
  });

  test('resolves links relative to the source doc directory', () => {
    const md = 'See [overview](../overview.md).';
    expect(extractMarkdownLinksFromMarkdown(md, 'folder/page')).toEqual([
      { target: 'overview', anchor: null, snippet: 'See overview.' },
    ]);
  });

  test('extracts internal links with optional titles', () => {
    const md = 'See [overview](./overview.md "Project overview") for details.';
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual([
      { target: 'overview', anchor: null, snippet: 'See overview for details.' },
    ]);
  });

  test('extracts markdown link anchors', () => {
    const md = 'See [install](./guide.md#install) for details.';
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual([
      { target: 'guide', anchor: 'install', snippet: 'See install for details.' },
    ]);
  });

  test('ignores external links', () => {
    const md = 'Visit [example](https://example.com) and [local](./local.md).';
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual([
      { target: 'local', anchor: null, snippet: 'Visit example and local.' },
    ]);
  });

  test('ignores image syntax while still extracting sibling links', () => {
    const md = 'See ![diagram](./assets/diagram.png) and [docs](./docs.md).';
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual([
      { target: 'docs', anchor: null, snippet: expect.any(String) as string },
    ]);
  });

  test('ignores links inside fenced code blocks', () => {
    const md = ['See [page](./page.md).', '', '```', '[ignore](./ignore.md)', '```'].join('\n');
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual([
      { target: 'page', anchor: null, snippet: 'See page.' },
    ]);
  });

  test('ignores links inside inline code spans', () => {
    const md = 'Use `[skip](./skip.md)` then [real](./real.md).';
    expect(extractMarkdownLinksFromMarkdown(md, 'notes')).toEqual([
      { target: 'real', anchor: null, snippet: expect.any(String) as string },
    ]);
  });

  test('does not double-count wiki-links that precede markdown links', () => {
    const md = '[[wiki]] links to [markdown](./other.md).';
    const mdLinks = extractMarkdownLinksFromMarkdown(md, 'notes');
    expect(mdLinks.map((l) => l.target)).toEqual(['other']);
  });

  test('returns empty array when no internal links present', () => {
    expect(extractMarkdownLinksFromMarkdown('Just text.', 'notes')).toEqual([]);
    expect(extractMarkdownLinksFromMarkdown('[ext](https://example.com)', 'notes')).toEqual([]);
  });
});

describe('BacklinkIndex with markdown links', () => {
  test('updateDocumentFromMarkdown indexes markdown links alongside wiki links', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'backlinks-md-'));
    try {
      const index = new BacklinkIndex({ projectDir: tmpDir, contentDir: tmpDir });
      const md = 'See [[wikiTarget]] and [mdTarget](./md-target.md).';
      index.updateDocumentFromMarkdown('source', md);
      expect(index.getForwardLinks('source')).toContain('wikiTarget');
      expect(index.getForwardLinks('source')).toContain('md-target');
      expect(index.getBacklinks('wikiTarget').map((b) => b.source)).toContain('source');
      expect(index.getBacklinks('md-target').map((b) => b.source)).toContain('source');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rebuildFromDisk indexes markdown links', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'backlinks-rebuild-'));
    try {
      writeFileSync(join(tmpDir, 'source.md'), 'Links to [target](./target.md).\n', 'utf-8');
      writeFileSync(join(tmpDir, 'target.md'), '# Target\n', 'utf-8');
      const index = new BacklinkIndex({ projectDir: tmpDir, contentDir: tmpDir });
      index.rebuildFromDisk();
      expect(index.getBacklinks('target').map((b) => b.source)).toContain('source');
      expect(index.getForwardLinks('source')).toContain('target');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('wiki link wins for same target when both syntaxes link to the same page', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'backlinks-dedup-'));
    try {
      const index = new BacklinkIndex({ projectDir: tmpDir, contentDir: tmpDir });
      const md = '[[target]] and [text](./target.md).';
      index.updateDocumentFromMarkdown('source', md);
      const backlinks = index.getBacklinks('target');
      expect(backlinks.filter((b) => b.source === 'source')).toHaveLength(1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('indexes external markdown and wiki links for forward links and graph', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'backlinks-external-'));
    try {
      const index = new BacklinkIndex({ projectDir: tmpDir, contentDir: tmpDir });
      index.updateDocumentFromMarkdown(
        'source',
        'See [Docs](https://example.com/docs) and [[https://inkeep.com|Inkeep]].',
      );

      expect(index.getForwardLinkEntries('source')).toEqual([
        {
          kind: 'external',
          url: 'https://example.com/docs',
          label: 'Docs',
          snippet: 'See Docs and Inkeep.',
        },
        {
          kind: 'external',
          url: 'https://inkeep.com',
          label: 'Inkeep',
          snippet: '…com/docs) and Inkeep.',
        },
      ]);

      const graph = index.getLinkGraph();
      expect(graph.nodes).toContainEqual({
        kind: 'doc',
        id: 'source',
        docName: 'source',
        anchor: null,
      });
      expect(graph.nodes).toContainEqual({
        kind: 'external',
        id: 'external:https://example.com/docs',
        url: 'https://example.com/docs',
        label: 'Docs',
      });
      expect(graph.links).toContainEqual({
        source: 'source',
        target: 'external:https://example.com/docs',
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
