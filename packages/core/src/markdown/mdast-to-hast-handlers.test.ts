/**
 * Tests for mdast→hast handlers (D7 / Q1 shapes + FR-20 escape correctness).
 *
 * Per-node unit tests cover the canonical HTML shape each promoted mdast
 * type renders to in the clipboard-copy path. The fuzz test ships with
 * 100 random adversarial payloads and asserts no unescaped `<script>`
 * substring survives the pipeline — the FR-20 security contract.
 */

import { describe, expect, test } from 'bun:test';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import type { RawMdxFallbackMdast, WikiLinkMdast } from './mdast-augmentation.ts';
import { mdastToHtml } from './mdast-to-html.ts';

function html(tree: { type: 'root'; children: unknown[] }): string {
  // biome-ignore lint/suspicious/noExplicitAny: test helpers stay loose to keep fixtures tidy
  return mdastToHtml(tree as any);
}

function wrap(child: unknown) {
  return { type: 'root' as const, children: [child] };
}

describe('wikiLink mdast→hast', () => {
  test('renders as <a class="wiki-link"> with href fragment', () => {
    const node: WikiLinkMdast = {
      type: 'wikiLink',
      value: 'Page',
      data: { target: 'Page', anchor: null, alias: null },
      children: [{ type: 'text', value: 'Page' }],
    };
    const out = html(wrap(node));
    expect(out).toContain('<a');
    expect(out).toContain('class="wiki-link"');
    expect(out).toContain('href="#page"');
    expect(out).toContain('data-target="Page"');
    expect(out).toContain('>Page</a>');
  });

  test('anchor shows in href as slug fragment', () => {
    const node: WikiLinkMdast = {
      type: 'wikiLink',
      value: 'Page#Heading',
      data: { target: 'Page', anchor: 'Heading', alias: null },
      children: [{ type: 'text', value: 'Page#Heading' }],
    };
    const out = html(wrap(node));
    expect(out).toContain('href="#page-heading"');
    expect(out).toContain('data-anchor="Heading"');
  });

  test('alias is used as visible label', () => {
    const node: WikiLinkMdast = {
      type: 'wikiLink',
      value: 'Alias',
      data: { target: 'Page', anchor: null, alias: 'Alias' },
      children: [{ type: 'text', value: 'Alias' }],
    };
    const out = html(wrap(node));
    expect(out).toContain('>Alias</a>');
    expect(out).toContain('data-alias="Alias"');
  });

  test('no data-resolved attribute emitted (Q1 intentional drop)', () => {
    const node: WikiLinkMdast = {
      type: 'wikiLink',
      value: 'Page',
      data: { target: 'Page', anchor: null, alias: null },
      children: [{ type: 'text', value: 'Page' }],
    };
    const out = html(wrap(node));
    expect(out).not.toContain('data-resolved');
  });

  test('label text content is entity-encoded for display', () => {
    // target/anchor/alias are application-controlled identifiers in
    // production (e.g. "Page Name") — the fuzz test below exercises
    // adversarial raw-content types. Here we only assert that the
    // visible label (inside the `<a>`) is entity-encoded correctly.
    const node: WikiLinkMdast = {
      type: 'wikiLink',
      value: '<script>',
      data: { target: 'Page', anchor: null, alias: '<script>' },
      children: [{ type: 'text', value: '<script>' }],
    };
    const out = html(wrap(node));
    // The visible label text inside `<a>` gets hast-text-escaped.
    expect(out).toContain('>&#x3C;script></a>');
  });
});

describe('mdxJsxFlowElement mdast→hast', () => {
  test('renders as <pre class="mdx-component"><code>raw</code></pre>', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: null,
      attributes: [],
      children: [],
      data: { sourceRaw: '<Note type="info">Hi</Note>' },
    };
    const out = html(wrap(node));
    expect(out).toContain('<pre class="mdx-component">');
    expect(out).toContain('<code>');
    expect(out).toContain('</code></pre>');
  });

  test('raw source is entity-encoded, not passed through', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: null,
      attributes: [],
      children: [],
      data: { sourceRaw: '<MyComponent prop="value"/>' },
    };
    const out = html(wrap(node));
    // `<` is always escaped (required — otherwise it would start a tag).
    // `>` and `"` are left as-is in text content per HTML5 rules:
    //   - `>` is only syntactically special as the tag closer, unambiguous in text.
    //   - `"` is only special inside an attribute value.
    expect(out).toContain('&#x3C;MyComponent');
    expect(out).not.toContain('<MyComponent');
  });

  test('adversarial <script> is escaped, not emitted as live HTML', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: null,
      attributes: [],
      children: [],
      data: { sourceRaw: '<script>alert(1)</script>' },
    };
    const out = html(wrap(node));
    expect(out).not.toContain('<script>');
    expect(out).toContain('&#x3C;script>');
  });
});

describe('mdxJsxTextElement mdast→hast', () => {
  test('renders as <span class="mdx-inline">escaped</span>', () => {
    const node: MdxJsxTextElement = {
      type: 'mdxJsxTextElement',
      name: null,
      attributes: [],
      children: [],
      data: { sourceRaw: '<Tag/>' },
    };
    const out = html(wrap(node));
    expect(out).toContain('<span class="mdx-inline">');
    expect(out).toContain('&#x3C;Tag/>');
    expect(out).not.toContain('<Tag/>');
  });
});

describe('rawMdxFallback mdast→hast', () => {
  test('renders leading comment + pre/code', () => {
    const node: RawMdxFallbackMdast = {
      type: 'rawMdxFallback',
      value: '<A>\n</B>',
      data: { reason: 'mismatched tag', originalSpan: { start: 0, end: 8 } },
    };
    const out = html(wrap(node));
    expect(out).toContain('<!-- Parse error: mismatched tag -->');
    expect(out).toContain('<pre class="mdx-fallback">');
    expect(out).toContain('<code>');
    expect(out).toContain('&#x3C;A>');
    expect(out).toContain('&#x3C;/B>');
  });

  test('adversarial raw source never emits live HTML', () => {
    const node: RawMdxFallbackMdast = {
      type: 'rawMdxFallback',
      value: '<script>alert(2)</script>',
      data: { reason: 'xss attempt', originalSpan: { start: 0, end: 0 } },
    };
    const out = html(wrap(node));
    expect(out).not.toContain('<script>');
    expect(out).toContain('&#x3C;script>');
  });

  test('missing reason falls back to "unknown"', () => {
    const node = {
      type: 'rawMdxFallback',
      value: '',
      data: { reason: '', originalSpan: { start: 0, end: 0 } },
    } as RawMdxFallbackMdast;
    const out = html(wrap(node));
    expect(out).toContain('<!-- Parse error: unknown -->');
  });
});

describe('FR-20 adversarial fuzz — no unescaped <script> in any emitted HTML', () => {
  // Pool of adversarial payload fragments inspired by the R18 fuzz corpus
  // and OWASP XSS cheat sheet. We concatenate random subsets with random
  // noise and emit 100 payloads through each custom-node type.
  const ADVERSARIAL_FRAGMENTS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '</script><script>x</script>',
    '<style>body{display:none}</style>',
    'javascript:alert(1)',
    '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
    'null\u0000byte',
    '<?xml version="1.0"?><ns:tag xmlns:ns="foo"/>',
    '&amp;&lt;&gt;&#x22;',
    '"><svg/onload=alert(1)>',
  ];

  function randomPayload(seed: number): string {
    // Deterministic pseudo-random: LCG with a given seed.
    let s = seed;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    const count = 1 + Math.floor(rand() * 4);
    let out = '';
    for (let i = 0; i < count; i++) {
      out += ADVERSARIAL_FRAGMENTS[Math.floor(rand() * ADVERSARIAL_FRAGMENTS.length)];
      out += ' ';
    }
    return out.trim();
  }

  test('mdxJsxFlowElement — 100 random adversarial payloads', () => {
    for (let i = 0; i < 100; i++) {
      const payload = randomPayload(i + 1);
      const node: MdxJsxFlowElement = {
        type: 'mdxJsxFlowElement',
        name: null,
        attributes: [],
        children: [],
        data: { sourceRaw: payload },
      };
      const out = html(wrap(node));
      expect(out).not.toContain('<script>');
      expect(out).not.toContain('<script ');
      expect(out).not.toContain('<iframe');
      expect(out).not.toContain('<style>');
    }
  });

  test('mdxJsxTextElement — 100 random adversarial payloads', () => {
    for (let i = 0; i < 100; i++) {
      const payload = randomPayload(i + 1);
      const node: MdxJsxTextElement = {
        type: 'mdxJsxTextElement',
        name: null,
        attributes: [],
        children: [],
        data: { sourceRaw: payload },
      };
      const out = html(wrap(node));
      expect(out).not.toContain('<script>');
      expect(out).not.toContain('<script ');
      expect(out).not.toContain('<iframe');
    }
  });

  test('rawMdxFallback — 100 random adversarial payloads', () => {
    for (let i = 0; i < 100; i++) {
      const payload = randomPayload(i + 1);
      const node: RawMdxFallbackMdast = {
        type: 'rawMdxFallback',
        value: payload,
        data: { reason: 'fuzz', originalSpan: { start: 0, end: 0 } },
      };
      const out = html(wrap(node));
      expect(out).not.toContain('<script>');
      expect(out).not.toContain('<script ');
      expect(out).not.toContain('<iframe');
    }
  });

  // Note: wikiLink's target/anchor/alias are application-controlled
  // identifiers, not raw content carriers — the fuzz concern for FR-20
  // is the three types that store arbitrary failed/unparsed MDX source
  // (mdxJsxFlowElement, mdxJsxTextElement, rawMdxFallback). Those are
  // the 100+ trial assertions above.
});
