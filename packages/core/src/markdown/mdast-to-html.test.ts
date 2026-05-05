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
    const html = markdownToHtml('# title\n\n[link](#x)\n\n**bold**');
    expect(html).not.toContain('data-wiki-link');
    expect(html).not.toContain('data-jsx');
    expect(html).not.toContain('data-raw-mdx-fallback');
  });

  test('script HTML in markdown passthrough is dropped (no allowDangerousHtml)', () => {
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
    const viaMarkdown = markdownToHtml('## hi');
    const viaMdast = mdastToHtml({
      type: 'root',
      children: [{ type: 'heading', depth: 2, children: [{ type: 'text', value: 'hi' }] }],
    });
    expect(viaMdast).toBe(viaMarkdown);
  });
});

describe('custom-node regression gate — every promoted mdast type emits semantic HTML', () => {
  describe('(a) markdownToHtml string-entry — remark-plugin-produced types', () => {
    test('wikiLink bare target emits <a class="wiki-link">', () => {
      const html = markdownToHtml('[[Target]]');
      expect(html).toMatch(/<a[^>]*class="wiki-link"[^>]*>Target<\/a>/);
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
      expect(html).toMatch(/&#x3C;Callout/);
      expect(html).not.toMatch(/<Callout/);
    });

    test('mdxJsxTextElement emits <span class="mdx-inline" data-jsx-inline=""> with entity-escaped raw', () => {
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
      expect(html).toContain('class="mdx-inline"');
      expect(html).toContain('data-jsx-inline=""');
      expect(html).toMatch(/&#x3C;Tag/);
      expect(html).not.toMatch(/<Tag /);
    });

    test('mark (Obsidian-style highlight) emits <mark>text</mark>', () => {
      const html = mdastToHtml({
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'mark',
                children: [{ type: 'text', value: 'hello' }],
                // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast mirroring fromPmMark output
              } as any,
            ],
          },
        ],
      });
      expect(html).toContain('<mark>hello</mark>');
    });

    test('rawMdxFallback emits parse-error comment + <pre> with class + data-raw-mdx-fallback markers', () => {
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
      expect(html).toContain('class="mdx-fallback"');
      expect(html).toContain('data-raw-mdx-fallback=""');
      expect(html).toContain('data-reason="Unclosed JSX"');
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
