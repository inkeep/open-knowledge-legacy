/**
 * Tests for mdast-to-html — canonical mdast → HTML for clipboard copy paths.
 *
 * Covers simple markdown → semantic HTML conversion and the no-private-data-*
 * invariant: the pipeline's output must not carry OK-internal attributes like
 * `data-wiki-link` or `data-jsx-*`. Those appear only when US-007 wires
 * first-class mdast types; at US-003 scaffold time there are no custom types
 * in the tree yet, so the absence is trivial but still asserted as a
 * regression gate.
 *
 * Parallels the coverage shape of html-to-mdast.test.ts (US-002).
 */

import { describe, expect, test } from 'bun:test';
import { markdownToHtml, mdastToHtml } from './mdast-to-html.ts';

describe('markdownToHtml — markdown string → HTML', () => {
  test('paragraph', () => {
    expect(markdownToHtml('hello world')).toBe('<p>hello world</p>');
  });

  test('heading', () => {
    expect(markdownToHtml('## heading')).toBe('<h2>heading</h2>');
  });

  test('all heading levels h1 through h6', () => {
    const html = markdownToHtml('# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f');
    expect(html).toContain('<h1>a</h1>');
    expect(html).toContain('<h2>b</h2>');
    expect(html).toContain('<h3>c</h3>');
    expect(html).toContain('<h4>d</h4>');
    expect(html).toContain('<h5>e</h5>');
    expect(html).toContain('<h6>f</h6>');
  });

  test('strong and emphasis', () => {
    const html = markdownToHtml('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  test('inline code', () => {
    expect(markdownToHtml('run `npm install`')).toContain('<code>npm install</code>');
  });

  test('unordered list', () => {
    const html = markdownToHtml('- one\n- two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  test('ordered list', () => {
    const html = markdownToHtml('1. one\n2. two');
    expect(html).toContain('<ol>');
  });

  test('link', () => {
    const html = markdownToHtml('[site](https://example.com)');
    expect(html).toContain('<a href="https://example.com">site</a>');
  });

  test('fenced code block with language', () => {
    const html = markdownToHtml('```typescript\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code class="language-typescript">');
    expect(html).toContain('const x = 1;');
  });

  test('blockquote', () => {
    const html = markdownToHtml('> quoted');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<p>quoted</p>');
  });

  test('GFM table renders as <table>', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |';
    const html = markdownToHtml(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  test('no OK-private data-* attributes in output', () => {
    // Nothing in this markdown is a custom node — the invariant is the absence.
    const html = markdownToHtml('# title\n\n[link](#x)\n\n**bold**');
    expect(html).not.toContain('data-wiki-link');
    expect(html).not.toContain('data-jsx');
    expect(html).not.toContain('data-raw-mdx-fallback');
  });

  test('script HTML in markdown passthrough is dropped (no allowDangerousHtml)', () => {
    // Raw HTML in markdown lands as mdast `html` nodes → hast `raw` nodes →
    // dropped by default rehype-stringify. D10 / NG7 storage-fidelity
    // invariant: no paste-time DOMPurify needed because the pipeline
    // structurally drops it on the way out.
    const html = markdownToHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
  });
});

describe('mdastToHtml — mdast Root → HTML', () => {
  test('paragraph mdast converts to <p>', () => {
    const html = mdastToHtml({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'direct mdast path' }],
        },
      ],
    });
    expect(html).toBe('<p>direct mdast path</p>');
  });

  test('cross-view symmetry — same logical content yields same HTML', () => {
    // markdownToHtml('## hi') and mdastToHtml(parse('## hi')) must be
    // byte-identical for the clipboard copy contract. Here we assert the
    // cross-view symmetry on a simple heading by constructing the mdast
    // tree by hand (what PM→mdast would produce for a WYSIWYG selection).
    const viaMarkdown = markdownToHtml('## hi');
    const viaMdast = mdastToHtml({
      type: 'root',
      children: [{ type: 'heading', depth: 2, children: [{ type: 'text', value: 'hi' }] }],
    });
    expect(viaMdast).toBe(viaMarkdown);
  });
});
