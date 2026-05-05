import { describe, expect, test } from 'bun:test';
import type {
  Blockquote,
  Code,
  Emphasis,
  Heading,
  InlineCode,
  Link,
  List,
  Paragraph,
  Root,
  Strong,
  Table,
  Text,
} from 'mdast';
import { visit } from 'unist-util-visit';
import { cleanupPlugins, htmlToMdast, mdastToMarkdown } from './html-to-mdast.ts';

function firstChild(root: Root): Root['children'][number] {
  const first = root.children[0];
  if (!first) throw new Error('expected root to have at least one child');
  return first;
}

describe('htmlToMdast — basic HTML→mdast conversion', () => {
  test('paragraph with text', () => {
    const root = htmlToMdast('<p>hello world</p>');
    const para = firstChild(root) as Paragraph;
    expect(para.type).toBe('paragraph');
    expect((para.children[0] as Text).value).toBe('hello world');
  });

  test('strong inline', () => {
    const root = htmlToMdast('<p>say <strong>hi</strong></p>');
    const para = firstChild(root) as Paragraph;
    const strong = para.children.find((c) => c.type === 'strong') as Strong;
    expect(strong).toBeDefined();
    expect((strong.children[0] as Text).value).toBe('hi');
  });

  test('emphasis inline', () => {
    const root = htmlToMdast('<p>say <em>hi</em></p>');
    const para = firstChild(root) as Paragraph;
    const em = para.children.find((c) => c.type === 'emphasis') as Emphasis;
    expect(em).toBeDefined();
    expect((em.children[0] as Text).value).toBe('hi');
  });

  test('inline code', () => {
    const root = htmlToMdast('<p>run <code>npm install</code> first</p>');
    const para = firstChild(root) as Paragraph;
    const code = para.children.find((c) => c.type === 'inlineCode') as InlineCode;
    expect(code).toBeDefined();
    expect(code.value).toBe('npm install');
  });

  test('headings h1 through h6', () => {
    const html = '<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>';
    const root = htmlToMdast(html);
    const headings = root.children.filter((c) => c.type === 'heading') as Heading[];
    expect(headings).toHaveLength(6);
    expect(headings.map((h) => h.depth)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('unordered list with two items', () => {
    const root = htmlToMdast('<ul><li>one</li><li>two</li></ul>');
    const list = firstChild(root) as List;
    expect(list.type).toBe('list');
    expect(list.ordered).toBeFalsy();
    expect(list.children).toHaveLength(2);
  });

  test('ordered list', () => {
    const root = htmlToMdast('<ol><li>one</li><li>two</li></ol>');
    const list = firstChild(root) as List;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(true);
  });

  test('link', () => {
    const root = htmlToMdast('<p>visit <a href="https://example.com">site</a></p>');
    const para = firstChild(root) as Paragraph;
    const link = para.children.find((c) => c.type === 'link') as Link;
    expect(link).toBeDefined();
    expect(link.url).toBe('https://example.com');
    expect((link.children[0] as Text).value).toBe('site');
  });

  test('blockquote', () => {
    const root = htmlToMdast('<blockquote><p>quoted</p></blockquote>');
    const bq = firstChild(root) as Blockquote;
    expect(bq.type).toBe('blockquote');
    const innerPara = bq.children[0] as Paragraph;
    expect(innerPara.type).toBe('paragraph');
    expect((innerPara.children[0] as Text).value).toBe('quoted');
  });

  test('code block with language', () => {
    const root = htmlToMdast('<pre><code class="language-typescript">const x = 1;</code></pre>');
    const code = firstChild(root) as Code;
    expect(code.type).toBe('code');
    expect(code.lang).toBe('typescript');
    expect(code.value).toBe('const x = 1;');
  });

  test('table (GFM)', () => {
    const html = `<table>
      <thead><tr><th>a</th><th>b</th></tr></thead>
      <tbody><tr><td>1</td><td>2</td></tr></tbody>
    </table>`;
    const root = htmlToMdast(html);
    const table = root.children.find((c) => c.type === 'table') as Table;
    expect(table).toBeDefined();
    expect(table.children).toHaveLength(2);
  });

  test('malformed HTML is tolerated (no throw)', () => {
    expect(() => htmlToMdast('<p>unclosed <strong>bold')).not.toThrow();
    expect(() => htmlToMdast('<<><foo bar=>')).not.toThrow();
  });

  test('empty input returns empty root', () => {
    const root = htmlToMdast('');
    expect(root.type).toBe('root');
    expect(root.children).toHaveLength(0);
  });

  test('additionalCleanupPlugins are invoked in order', () => {
    const calls: string[] = [];
    const pluginA = () => (tree: unknown) => {
      calls.push('A');
      return tree;
    };
    const pluginB = () => (tree: unknown) => {
      calls.push('B');
      return tree;
    };
    htmlToMdast('<p>x</p>', {
      additionalCleanupPlugins: [pluginA, pluginB],
    });
    expect(calls).toEqual(['A', 'B']);
  });

  test('cleanupPlugins is the scaffold-time registration point', () => {
    expect(Array.isArray(cleanupPlugins)).toBe(true);
  });

  test('throws HtmlPayloadTooLargeError when input exceeds the size ceiling', async () => {
    const { HtmlPayloadTooLargeError } = await import('./html-to-mdast.ts');
    let caught: unknown;
    try {
      htmlToMdast('<p>x</p>'.repeat(2000), { maxBytes: 100 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HtmlPayloadTooLargeError);
    const e = caught as { htmlBytes: number; maxBytes: number };
    expect(e.htmlBytes).toBeGreaterThan(100);
    expect(e.maxBytes).toBe(100);
  });

  test('passes through when input is at or below the size ceiling', () => {
    const html = '<p>under the cap</p>';
    expect(() => htmlToMdast(html, { maxBytes: html.length })).not.toThrow();
  });
});

describe('htmlToMdast — Branch D source-form attr defaults (FR-39)', () => {
  function findFirst<T extends Root['children'][number]>(
    tree: Root,
    type: T['type'],
  ): T | undefined {
    let found: T | undefined;
    visit(tree, type, (node) => {
      if (!found) found = node as T;
    });
    return found;
  }

  test('plain <strong> gets sourceDelimiter="**"', () => {
    const tree = htmlToMdast('<p>say <strong>hi</strong></p>');
    const strong = findFirst<Strong>(tree, 'strong');
    expect(strong).toBeDefined();
    expect(strong?.data?.sourceDelimiter).toBe('**');
  });

  test('plain <em> gets sourceDelimiter="*"', () => {
    const tree = htmlToMdast('<p>say <em>hi</em></p>');
    const em = findFirst<Emphasis>(tree, 'emphasis');
    expect(em).toBeDefined();
    expect(em?.data?.sourceDelimiter).toBe('*');
  });

  test('plain inline <code> gets sourceFenceChar="`" + sourceFenceLength=1', () => {
    const tree = htmlToMdast('<p>run <code>npm install</code> now</p>');
    const inlineCode = findFirst<InlineCode>(tree, 'inlineCode');
    expect(inlineCode).toBeDefined();
    expect(inlineCode?.data?.sourceFenceChar).toBe('`');
    expect(inlineCode?.data?.sourceFenceLength).toBe(1);
  });

  test('plain <pre><code> gets sourceFenceChar="`" + sourceFenceLength=3', () => {
    const tree = htmlToMdast('<pre><code>const x = 1;</code></pre>');
    const code = findFirst<Code>(tree, 'code');
    expect(code).toBeDefined();
    expect(code?.data?.sourceFenceChar).toBe('`');
    expect(code?.data?.sourceFenceLength).toBe(3);
  });

  test('Word HTML <strong> gets canonical default (no vendor branching)', () => {
    const html =
      '<p class="MsoNormal" style="mso-margin-top-alt:auto">say <strong>hello</strong></p>';
    const tree = htmlToMdast(html);
    const strong = findFirst<Strong>(tree, 'strong');
    expect(strong?.data?.sourceDelimiter).toBe('**');
  });

  test('Notion HTML <strong> gets canonical default', () => {
    const html = '<p class="notion-text-block"><strong>hi</strong></p>';
    const tree = htmlToMdast(html);
    const strong = findFirst<Strong>(tree, 'strong');
    expect(strong?.data?.sourceDelimiter).toBe('**');
  });

  test('Google Docs HTML <strong> gets canonical default', () => {
    const html = '<b id="docs-internal-guid-abc-123"><strong>hi</strong></b>';
    const tree = htmlToMdast(html);
    const strong = findFirst<Strong>(tree, 'strong');
    expect(strong?.data?.sourceDelimiter).toBe('**');
  });

  test('GitHub HTML inline <code> gets canonical default', () => {
    const html = '<p>run <code class="notranslate">npm install</code></p>';
    const tree = htmlToMdast(html);
    const inlineCode = findFirst<InlineCode>(tree, 'inlineCode');
    expect(inlineCode?.data?.sourceFenceChar).toBe('`');
    expect(inlineCode?.data?.sourceFenceLength).toBe(1);
  });

  test('VS Code <pre><code> gets canonical default (3-fence)', () => {
    const html =
      '<pre style="color:#000"><code><span style="color:#0000ff">const</span> x = 1;</code></pre>';
    const tree = htmlToMdast(html);
    const code = findFirst<Code>(tree, 'code');
    expect(code?.data?.sourceFenceChar).toBe('`');
    expect(code?.data?.sourceFenceLength).toBe(3);
  });

  test('round-trip: <strong>foo</strong> serializes to **foo**', () => {
    const md = mdastToMarkdown(htmlToMdast('<p><strong>foo</strong></p>')).trim();
    expect(md).toBe('**foo**');
  });

  test('round-trip: <em>foo</em> serializes to *foo*', () => {
    const md = mdastToMarkdown(htmlToMdast('<p><em>foo</em></p>')).trim();
    expect(md).toBe('*foo*');
  });

  test('round-trip: inline <code>foo</code> serializes to `foo`', () => {
    const md = mdastToMarkdown(htmlToMdast('<p><code>foo</code></p>')).trim();
    expect(md).toBe('`foo`');
  });

  test('round-trip: <pre><code>x</code></pre> serializes to triple-backtick fence', () => {
    const md = mdastToMarkdown(htmlToMdast('<pre><code>x</code></pre>')).trim();
    expect(md).toBe('```\nx\n```');
  });

  test('mixed nesting: <strong><em><code>x</code></em></strong> all carry canonical attrs', () => {
    const tree = htmlToMdast('<p><strong><em><code>x</code></em></strong></p>');
    const strong = findFirst<Strong>(tree, 'strong');
    const em = findFirst<Emphasis>(tree, 'emphasis');
    const inlineCode = findFirst<InlineCode>(tree, 'inlineCode');
    expect(strong?.data?.sourceDelimiter).toBe('**');
    expect(em?.data?.sourceDelimiter).toBe('*');
    expect(inlineCode?.data?.sourceFenceChar).toBe('`');
    expect(inlineCode?.data?.sourceFenceLength).toBe(1);
  });

  test('multiple strong nodes each get the attr (not just the first)', () => {
    const tree = htmlToMdast('<p><strong>a</strong> and <strong>b</strong></p>');
    const strongs: Strong[] = [];
    visit(tree, 'strong', (node) => {
      strongs.push(node);
    });
    expect(strongs).toHaveLength(2);
    expect(strongs[0]?.data?.sourceDelimiter).toBe('**');
    expect(strongs[1]?.data?.sourceDelimiter).toBe('**');
  });

  test('walker is tolerant of nodes without strong/em/code (no crash on prose-only HTML)', () => {
    expect(() => htmlToMdast('<p>just prose, no marks</p>')).not.toThrow();
    const tree = htmlToMdast('<p>just prose, no marks</p>');
    expect(tree.type).toBe('root');
  });

  test('walker initializes data field on nodes that lack it (defensive)', () => {
    const tree = htmlToMdast('<p><strong>x</strong> <em>y</em> <code>z</code></p>');
    const strong = findFirst<Strong>(tree, 'strong');
    const em = findFirst<Emphasis>(tree, 'emphasis');
    const code = findFirst<InlineCode>(tree, 'inlineCode');
    expect(strong?.data).toBeDefined();
    expect(em?.data).toBeDefined();
    expect(code?.data).toBeDefined();
  });

  test('non-target node types (paragraphs, headings, links) are not touched', () => {
    const tree = htmlToMdast('<h2>title</h2><p>text <a href="https://x">link</a></p>');
    const heading = findFirst<Heading>(tree, 'heading');
    const para = findFirst<Paragraph>(tree, 'paragraph');
    const link = findFirst<Link>(tree, 'link');
    expect(heading?.data?.sourceDelimiter).toBeUndefined();
    expect(para?.data?.sourceDelimiter).toBeUndefined();
    expect(link?.data?.sourceDelimiter).toBeUndefined();
  });
});
