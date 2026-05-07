import { describe, expect, test } from 'bun:test';
import type { FootnoteDefinition, FootnoteReference } from 'mdast';
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
    const node: WikiLinkMdast = {
      type: 'wikiLink',
      value: '<script>',
      data: { target: 'Page', anchor: null, alias: '<script>' },
      children: [{ type: 'text', value: '<script>' }],
    };
    const out = html(wrap(node));
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

describe('lowercase HTML-primitive shortcut (img / video / audio)', () => {
  test('img flow element emits native <img> with src + alt, not the <pre> source-as-code shape', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        { type: 'mdxJsxAttribute', name: 'alt', value: 'A picture' },
      ],
      children: [],
      data: { sourceRaw: '<img src="https://x.example/img.png" alt="A picture" />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<img\b[^>]*src="https:\/\/x\.example\/img\.png"[^>]*>/);
    expect(out).toMatch(/<img\b[^>]*alt="A picture"[^>]*>/);
    expect(out).not.toContain('<pre class="mdx-component">');
  });

  test('video flow element emits <video> with explicit close + bare boolean controls attr', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'video',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/v.mp4' },
        { type: 'mdxJsxAttribute', name: 'controls', value: null },
      ],
      children: [],
      data: { sourceRaw: '<video src="https://x.example/v.mp4" controls />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<video\b[^>]*src="https:\/\/x\.example\/v\.mp4"[^>]*>/);
    expect(out).toMatch(/<video\b[^>]*\bcontrols(?=[\s/>])[^>]*>/);
    expect(out).toContain('</video>');
    expect(out).not.toContain('<pre class="mdx-component">');
  });

  test('audio flow element emits native <audio>...</audio>', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'audio',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/a.mp3' },
        { type: 'mdxJsxAttribute', name: 'controls', value: null },
      ],
      children: [],
      data: { sourceRaw: '<audio src="https://x.example/a.mp3" controls />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<audio\b[^>]*src="https:\/\/x\.example\/a\.mp3"[^>]*>/);
    expect(out).toMatch(/<audio\b[^>]*\bcontrols(?=[\s/>])[^>]*>/);
    expect(out).toContain('</audio>');
    expect(out).not.toContain('<pre class="mdx-component">');
  });

  test('img flow element strips on* event handler attributes (FR-20 defense-in-depth)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        { type: 'mdxJsxAttribute', name: 'onerror', value: 'alert(1)' },
        { type: 'mdxJsxAttribute', name: 'onload', value: 'fetch("//evil")' },
        { type: 'mdxJsxAttribute', name: 'onclick', value: 'doom()' },
      ],
      children: [],
      data: { sourceRaw: '<img onerror="alert(1)" onload="fetch(...)" src="x.png" />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<img\b[^>]*src="https:\/\/x\.example\/img\.png"[^>]*>/);
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('alert(1)');
  });

  test('img flow element preserves `on*`-prefixed safe attributes when length < 3 or non-handler', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        { type: 'mdxJsxAttribute', name: 'on', value: 'unusual' },
      ],
      children: [],
      data: { sourceRaw: '<img src="x.png" on="unusual" />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/\bon="unusual"/);
  });

  test('inline <img> via mdxJsxTextElement also emits native <img> (not <span class="mdx-inline">)', () => {
    const node: MdxJsxTextElement = {
      type: 'mdxJsxTextElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/inline.png' },
        { type: 'mdxJsxAttribute', name: 'alt', value: 'Inline' },
      ],
      children: [],
      data: { sourceRaw: '<img src="https://x.example/inline.png" alt="Inline" />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<img\b[^>]*src="https:\/\/x\.example\/inline\.png"[^>]*>/);
    expect(out).not.toContain('<span class="mdx-inline">');
  });

  test('capitalized JSX (e.g. <Callout>) still emits the <pre class="mdx-component"> source-as-code shape', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'Callout',
      attributes: [{ type: 'mdxJsxAttribute', name: 'type', value: 'note' }],
      children: [],
      data: { sourceRaw: '<Callout type="note">Body</Callout>' },
    };
    const out = html(wrap(node));
    expect(out).toContain('<pre class="mdx-component">');
    expect(out).not.toMatch(/<callout\b/i);
  });

  test('non-primitive lowercase tag (<picture>) falls through to <pre> shape (gate is name-keyed, not lowercase-globbed)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'picture',
      attributes: [],
      children: [],
      data: { sourceRaw: '<picture></picture>' },
    };
    const out = html(wrap(node));
    expect(out).toContain('<pre class="mdx-component">');
    expect(out).not.toMatch(/<picture\b/);
  });

  test('unsafe srcset on native <img> is stripped by rehypeSanitizeUrls (per-candidate URL-scheme check)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        { type: 'mdxJsxAttribute', name: 'srcset', value: 'javascript:alert(1) 1x' },
      ],
      children: [],
      data: {
        sourceRaw: '<img src="https://x.example/img.png" srcset="javascript:alert(1) 1x" />',
      },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<img\b/);
    expect(out).not.toContain('javascript:');
    expect(out).not.toMatch(/<img\b[^>]*\bsrcset=/);
    expect(out).toMatch(/<img\b[^>]*src="https:\/\/x\.example\/img\.png"/);
  });

  test('safe srcset survives the rehypeSanitizeUrls filter (legitimate retina image set)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        {
          type: 'mdxJsxAttribute',
          name: 'srcset',
          value: 'https://x.example/img@2x.png 2x, https://x.example/img@3x.png 3x',
        },
      ],
      children: [],
      data: { sourceRaw: '<img />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(
      /srcset="https:\/\/x\.example\/img@2x\.png 2x, https:\/\/x\.example\/img@3x\.png 3x"/,
    );
  });

  test('unsafe poster on native <video> is stripped by rehypeSanitizeUrls', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'video',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/v.mp4' },
        { type: 'mdxJsxAttribute', name: 'poster', value: 'javascript:alert(1)' },
      ],
      children: [],
      data: { sourceRaw: '<video />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<video\b/);
    expect(out).not.toContain('javascript:');
    expect(out).not.toMatch(/poster=/);
    expect(out).toMatch(/src="https:\/\/x\.example\/v\.mp4"/);
  });

  test('safe poster survives the rehypeSanitizeUrls filter', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'video',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/v.mp4' },
        { type: 'mdxJsxAttribute', name: 'poster', value: 'https://x.example/poster.jpg' },
      ],
      children: [],
      data: { sourceRaw: '<video />' },
    };
    const out = html(wrap(node));
    expect(out).toContain('poster="https://x.example/poster.jpg"');
  });

  test('style with url(javascript:...) is dropped by rehypeSanitizeUrls (defense-in-depth)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        {
          type: 'mdxJsxAttribute',
          name: 'style',
          value: 'background-image: url(javascript:alert(1))',
        },
      ],
      children: [],
      data: { sourceRaw: '<img />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<img\b/);
    expect(out).not.toContain('javascript:');
    expect(out).not.toMatch(/style=/);
  });

  test('style with expression(...) is dropped (legacy IE CSS-expression vector)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        { type: 'mdxJsxAttribute', name: 'style', value: 'width: expression(alert(1))' },
      ],
      children: [],
      data: { sourceRaw: '<img />' },
    };
    const out = html(wrap(node));
    expect(out).not.toContain('expression(');
    expect(out).not.toMatch(/style=/);
  });

  test('safe style survives the rehypeSanitizeUrls filter', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'https://x.example/img.png' },
        { type: 'mdxJsxAttribute', name: 'style', value: 'border: 1px solid #000; color: red' },
      ],
      children: [],
      data: { sourceRaw: '<img />' },
    };
    const out = html(wrap(node));
    expect(out).toContain('style="border: 1px solid #000; color: red"');
  });

  test('javascript: src on native <img> is stripped by downstream rehypeSanitizeUrls (composition-boundary lock)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'javascript:alert(1)' },
        { type: 'mdxJsxAttribute', name: 'alt', value: 'evil' },
      ],
      children: [],
      data: { sourceRaw: '<img src="javascript:alert(1)" alt="evil" />' },
    };
    const out = html(wrap(node));
    expect(out).toMatch(/<img\b/);
    expect(out).not.toContain('javascript:');
    expect(out).toMatch(/<img\b[^>]*alt="evil"[^>]*>/);
    expect(out).not.toMatch(/<img\b[^>]*src=/);
  });

  test('expression-valued attr (`width={400}`) falls back to <pre> shape (helper bails on dynamic values)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'x' },
        {
          type: 'mdxJsxAttribute',
          name: 'width',
          value: { type: 'mdxJsxAttributeValueExpression', value: '400', data: {} },
        },
      ],
      children: [],
      data: { sourceRaw: '<img src="x" width={400} />' },
    };
    const out = html(wrap(node));
    expect(out).toContain('<pre class="mdx-component">');
    expect(out).not.toMatch(/<img\b[^>]*src="x"/);
  });

  test('spread attribute (`{...rest}`) falls back to <pre> shape (helper bails on non-mdxJsxAttribute)', () => {
    const node: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: 'img',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'src', value: 'x' },
        { type: 'mdxJsxExpressionAttribute', value: '...rest', data: {} },
      ],
      children: [],
      data: { sourceRaw: '<img src="x" {...rest} />' },
    };
    const out = html(wrap(node));
    expect(out).toContain('<pre class="mdx-component">');
    expect(out).not.toMatch(/<img\b[^>]*src="x"/);
  });
});

describe('mdxJsxTextElement mdast→hast', () => {
  test('renders as <span> carrying both the mdx-inline class and the data-jsx-inline marker', () => {
    const node: MdxJsxTextElement = {
      type: 'mdxJsxTextElement',
      name: null,
      attributes: [],
      children: [],
      data: { sourceRaw: '<Tag/>' },
    };
    const out = html(wrap(node));
    expect(out).toContain('class="mdx-inline"');
    expect(out).toContain('data-jsx-inline=""');
    expect(out).toContain('&#x3C;Tag/>');
    expect(out).not.toContain('<Tag/>');
  });
});

describe('rawMdxFallback mdast→hast', () => {
  test('renders leading comment + pre/code with both class and data-raw-mdx-fallback markers', () => {
    const node: RawMdxFallbackMdast = {
      type: 'rawMdxFallback',
      value: '<A>\n</B>',
      data: { reason: 'mismatched tag', originalSpan: { start: 0, end: 8 } },
    };
    const out = html(wrap(node));
    expect(out).toContain('<!-- Parse error: mismatched tag -->');
    expect(out).toContain('class="mdx-fallback"');
    expect(out).toContain('data-raw-mdx-fallback=""');
    expect(out).toContain('data-reason="mismatched tag"');
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

  test('reason containing "-->" cannot close the comment prematurely', () => {
    const node: RawMdxFallbackMdast = {
      type: 'rawMdxFallback',
      value: '<script>alert(1)</script>',
      data: {
        reason: 'broken --> escape attempt',
        originalSpan: { start: 0, end: 0 },
      },
    };
    const out = html(wrap(node));
    const commentCloses = out.match(/-->/g) ?? [];
    expect(commentCloses.length).toBe(1);
    expect(out).toContain('\u2014> escape attempt');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&#x3C;script>');
  });
});

describe('comment + commentBlock mdast→hast (em-dash defense)', () => {
  test('inline `comment` body containing `-->` is rendered with em-dash defense', () => {
    const node = {
      type: 'comment' as const,
      children: [{ type: 'text' as const, value: 'sneaky --> escape attempt' }],
    };
    // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast node for handler smoke test
    const out = html(wrap(node as any));
    const commentCloses = out.match(/-->/g) ?? [];
    expect(commentCloses.length).toBe(1);
    expect(out).toContain('—> escape attempt');
  });

  test('block `commentBlock` body containing `-->` is rendered with em-dash defense', () => {
    const node = {
      type: 'commentBlock' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [{ type: 'text' as const, value: 'block sneaky --> escape' }],
        },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast node for handler smoke test
    const out = html(wrap(node as any));
    const commentCloses = out.match(/-->/g) ?? [];
    expect(commentCloses.length).toBe(1);
    expect(out).toContain('—> escape');
  });
});

describe('footnoteReference mdast→hast', () => {
  test('renders as <sup id="fnref-N" data-footnote-ref><a href="#fn-N">[N]</a></sup>', () => {
    const node: FootnoteReference = {
      type: 'footnoteReference',
      identifier: '1',
      label: '1',
    };
    const out = html(wrap(node));
    expect(out).toContain('<sup');
    expect(out).toContain('id="fnref-1"');
    expect(out).toContain('data-footnote-ref');
    expect(out).toContain('data-footnote-id="1"');
    expect(out).toContain('class="footnote-ref"');
    expect(out).toContain('href="#fn-1"');
    expect(out).toContain('class="footnote-ref-link"');
    expect(out).toContain('>[1]</a>');
  });

  test('named identifier preserved in href, fnref id, and visible bracket', () => {
    const node: FootnoteReference = {
      type: 'footnoteReference',
      identifier: 'note',
      label: 'note',
    };
    const out = html(wrap(node));
    expect(out).toContain('id="fnref-note"');
    expect(out).toContain('data-footnote-id="note"');
    expect(out).toContain('href="#fn-note"');
    expect(out).toContain('>[note]</a>');
  });
});

describe('footnoteDefinition mdast→hast', () => {
  test('renders as <aside id="fn-N" data-footnote-def><div class="footnote-body">…</div><a href="#fnref-N">↩</a></aside>', () => {
    const node: FootnoteDefinition = {
      type: 'footnoteDefinition',
      identifier: 'abc',
      label: 'abc',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Body text.' }],
        },
      ],
    };
    const out = html(wrap(node));
    expect(out).toContain('<aside');
    expect(out).toContain('id="fn-abc"');
    expect(out).toContain('data-footnote-def');
    expect(out).toContain('data-footnote-id="abc"');
    expect(out).toContain('class="footnote-def"');
    expect(out).toContain('class="footnote-body"');
    expect(out).toContain('Body text.');
    expect(out).toContain('href="#fnref-abc"');
    expect(out).toContain('class="footnote-backref"');
    expect(out).toContain('↩');
    expect(out).not.toContain('footnote-marker');
  });

  test('numeric identifier produces matching anchor target for `<a href="#fn-1">`', () => {
    const node: FootnoteDefinition = {
      type: 'footnoteDefinition',
      identifier: '1',
      label: '1',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'x' }] }],
    };
    const out = html(wrap(node));
    expect(out).toContain('id="fn-1"');
    expect(out).toContain('href="#fnref-1"');
  });
});

describe('FR-20 adversarial fuzz — no unescaped <script> in any emitted HTML', () => {
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
});
