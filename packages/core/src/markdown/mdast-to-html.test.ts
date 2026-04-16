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

describe('custom-node regression gate — every promoted mdast type emits semantic HTML', () => {
  // This table parallels `PromotedMdastType` (mdast-augmentation.ts). For
  // each custom node type we assert that the outbound HTML pipeline emits
  // its Q1 shape — not a silent degradation to literal text or an empty
  // span. Two entry points:
  //
  //   (a) `markdownToHtml(source)` — string-entry pipeline. Guards the
  //       F8-class bug where a remark plugin is missing from the parse
  //       chain and the custom syntax degrades to literal source
  //       (`[[Target]]` → text). Only applicable to types produced by a
  //       remark plugin during parse (wikiLink today; future custom
  //       syntaxes here).
  //
  //   (b) `mdastToHtml(tree)` — tree-entry pipeline. For types whose
  //       source-form fidelity requires `data.sourceRaw` populated by the
  //       PM→mdast handlers (the string-entry pipeline has no PM, so
  //       sourceRaw is never populated for mdxJsx* nodes coming from
  //       remark-parse). Tests exercise the hast handler directly with a
  //       synthetic tree mirroring what the PM copy path produces.
  //
  // Adding a new PromotedMdastType MUST add a case to the correct group.

  describe('(a) markdownToHtml string-entry — remark-plugin-produced types', () => {
    test('wikiLink bare target emits <a class="wiki-link">', () => {
      const html = markdownToHtml('[[Target]]');
      expect(html).toMatch(/<a[^>]*class="wiki-link"[^>]*>Target<\/a>/);
      // F8 regression: literal `[[Target]]` must NOT appear as text.
      expect(html).not.toMatch(/\[\[Target\]\]/);
    });

    test('wikiLink with alias preserves data-alias and label text', () => {
      const html = markdownToHtml('[[Target|Label]]');
      expect(html).toContain('class="wiki-link"');
      expect(html).toContain('data-target="Target"');
      expect(html).toContain('data-alias="Label"');
      expect(html).toMatch(/>Label<\/a>/);
      expect(html).not.toMatch(/\[\[Target\|Label\]\]/);
    });
  });

  describe('(b) mdastToHtml tree-entry — PM→mdast handler-produced types', () => {
    test('mdxJsxFlowElement emits <pre class="mdx-component"> with entity-escaped raw', () => {
      const html = mdastToHtml({
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Callout',
            attributes: [],
            children: [],
            data: { sourceRaw: '<Callout type="warning">Heads up</Callout>' },
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast mirroring PM→mdast output
          } as any,
        ],
      });
      expect(html).toContain('<pre class="mdx-component">');
      expect(html).toContain('<code>');
      // FR-20 security boundary: raw `<Callout>` must be entity-encoded.
      expect(html).toMatch(/&#x3C;Callout/);
      expect(html).not.toMatch(/<Callout/);
    });

    test('mdxJsxTextElement emits <span class="mdx-inline"> with entity-escaped raw', () => {
      const html = mdastToHtml({
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'before ' },
              {
                type: 'mdxJsxTextElement',
                name: 'Tag',
                attributes: [],
                children: [],
                data: { sourceRaw: '<Tag prop="x"/>' },
                // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast mirroring PM→mdast output
              } as any,
              { type: 'text', value: ' after' },
            ],
          },
        ],
      });
      expect(html).toContain('<span class="mdx-inline">');
      expect(html).toMatch(/&#x3C;Tag/);
      expect(html).not.toMatch(/<Tag /);
    });

    test('rawMdxFallback emits parse-error comment + <pre class="mdx-fallback">', () => {
      const html = mdastToHtml({
        type: 'root',
        children: [
          {
            type: 'rawMdxFallback',
            data: { reason: 'Unclosed JSX', originalSpan: [0, 20] },
            value: '<Broken prop="xyz"',
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for handler-direct test
          } as any,
        ],
      });
      expect(html).toContain('<!-- Parse error: Unclosed JSX -->');
      expect(html).toContain('<pre class="mdx-fallback">');
      expect(html).toContain('<code>');
      expect(html).toMatch(/&#x3C;Broken/);
      expect(html).not.toMatch(/<Broken /);
    });
  });
});

describe('URL scheme filter — outbound clipboard HTML sanitization', () => {
  test('strips javascript: href from links', () => {
    const html = markdownToHtml('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    // Text content + <a> preserved; just the href is dropped.
    expect(html).toContain('>click<');
  });

  test('strips data: href from links', () => {
    const html = markdownToHtml('[boom](data:text/html,<script>alert(1)</script>)');
    expect(html).not.toContain('data:');
    expect(html).toContain('>boom<');
  });

  test('strips vbscript: href from links', () => {
    const html = markdownToHtml('[click](vbscript:msgbox)');
    expect(html).not.toContain('vbscript:');
  });

  test('strips file: href from links', () => {
    const html = markdownToHtml('[open](file:///etc/passwd)');
    expect(html).not.toContain('file:');
  });

  test('preserves https, http, mailto, tel, and relative hrefs', () => {
    expect(markdownToHtml('[a](https://example.com)')).toContain('href="https://example.com"');
    expect(markdownToHtml('[b](http://example.com)')).toContain('href="http://example.com"');
    expect(markdownToHtml('[c](mailto:foo@example.com)')).toContain('href="mailto:');
    expect(markdownToHtml('[d](tel:+15551234)')).toContain('href="tel:');
    expect(markdownToHtml('[e](/relative/path)')).toContain('href="/relative/path"');
    expect(markdownToHtml('[f](#anchor)')).toContain('href="#anchor"');
  });

  test('strips javascript: src from images', () => {
    const html = markdownToHtml('![alt](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('alt="alt"');
  });

  test('case-insensitive: JavaScript:/DATA: variants are stripped', () => {
    const html1 = markdownToHtml('[a](JavaScript:alert(1))');
    const html2 = markdownToHtml('[b](DATA:text/html,x)');
    expect(html1).not.toMatch(/javascript:/i);
    expect(html2).not.toMatch(/data:/i);
  });
});
