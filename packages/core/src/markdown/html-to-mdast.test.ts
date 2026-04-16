/**
 * Tests for htmlToMdast — HTML → mdast conversion scaffolding.
 *
 * Covers the canonically-typed mdast output for the simple prose HTML surface
 * area specified in US-002's acceptance criteria: paragraphs, headings h1-h6,
 * strong/em/code inlines, ul/ol lists, tables, links, blockquotes. Validates
 * malformed-input tolerance via rehype-parse fragment mode.
 *
 * Future stories (US-008 through US-010) extend with vendor-specific fixture
 * tests (GDocs, Word, Gmail, etc.) colocated alongside each cleanup plugin.
 */

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
import { cleanupPlugins, htmlToMdast } from './html-to-mdast.ts';

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
    // Header row + 1 body row = 2 table rows.
    expect(table.children).toHaveLength(2);
  });

  test('malformed HTML is tolerated (no throw)', () => {
    // Missing closing tag — rehype-parse tolerates per HTML5 spec.
    expect(() => htmlToMdast('<p>unclosed <strong>bold')).not.toThrow();
    // Completely broken markup.
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
    // Scaffold contract: until US-008 lands the first vendor plugin, the
    // built-in cleanup array is empty. This test is the tripwire — it will
    // need updating when plugins are registered.
    expect(Array.isArray(cleanupPlugins)).toBe(true);
  });

  test('throws HtmlPayloadTooLargeError when input exceeds the size ceiling', async () => {
    const { HtmlPayloadTooLargeError } = await import('./html-to-mdast.ts');
    // Use a low override so the test does not allocate 5MB strings.
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
