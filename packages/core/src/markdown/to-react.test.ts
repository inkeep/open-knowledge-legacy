/**
 * mdast → element-tree walker — unit tests.
 *
 * Uses a string-based factory for assertions. The factory builds a
 * shallow, inspectable representation: `{t: <tag>, p: <props>, c: <children>}`
 * so tests can check both tag name and props without a React runtime.
 * React binding tests live in the consumer module
 * (`packages/app/src/editor/mdast-to-react.test.tsx`) under US-011.
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared';
import { MarkdownManager } from './index';
import { mdastToReact } from './to-react';

// ---------------------------------------------------------------------------
// Test factory: produces a plain-object tree inspectable by tests.
// ---------------------------------------------------------------------------

interface TestElement {
  t: unknown;
  p: Record<string, unknown> | null;
  c: Array<TestElement | string>;
}

function testFactory(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: Array<TestElement | string | null | undefined>
): TestElement {
  return {
    t: type,
    p: props,
    c: children.filter((c): c is TestElement | string => c != null),
  };
}

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function convert(md: string) {
  const mdast = mdManager.parseToMdast(md);
  return mdastToReact(mdast, { createElement: testFactory });
}

// ---------------------------------------------------------------------------
// Per-node-type coverage
// ---------------------------------------------------------------------------

describe('mdastToReact — basic blocks', () => {
  test('paragraph + text → <p>', () => {
    const el = convert('Hello world') as TestElement;
    expect(el.t).toBe('div');
    expect(el.c[0]).toMatchObject({ t: 'p', c: ['Hello world'] });
  });

  test('headings h1-h6 → <h1>-<h6>', () => {
    const el = convert(
      '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6',
    ) as TestElement;
    const headings = el.c as TestElement[];
    expect(headings.map((h) => h.t)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  });

  test('strong / emphasis / delete', () => {
    const el = convert('**strong** *em* ~~del~~') as TestElement;
    const para = el.c[0] as TestElement;
    const kids = para.c as TestElement[];
    const tags = kids.filter((k): k is TestElement => typeof k === 'object').map((k) => k.t);
    expect(tags).toContain('strong');
    expect(tags).toContain('em');
    expect(tags).toContain('del');
  });

  test('inline code → <code>', () => {
    const el = convert('Use `inline` code') as TestElement;
    const para = el.c[0] as TestElement;
    const codeNode = (para.c as TestElement[]).find(
      (k): k is TestElement => typeof k === 'object' && k.t === 'code',
    );
    expect(codeNode).toBeDefined();
    expect(codeNode?.c).toEqual(['inline']);
  });

  test('fenced code block → <pre><code class="language-X">', () => {
    const el = convert('```ts\nlet x = 1;\n```') as TestElement;
    const pre = el.c[0] as TestElement;
    expect(pre.t).toBe('pre');
    const code = pre.c[0] as TestElement;
    expect(code.t).toBe('code');
    expect(code.p).toEqual({ className: 'language-ts' });
    expect(code.c[0]).toContain('let x = 1;');
  });

  test('unordered list → <ul><li>', () => {
    const el = convert('- one\n- two') as TestElement;
    const ul = el.c[0] as TestElement;
    expect(ul.t).toBe('ul');
    expect((ul.c as TestElement[]).every((c) => c.t === 'li')).toBe(true);
  });

  test('ordered list → <ol>; start attr preserved when !== 1', () => {
    const el = convert('3. one\n4. two') as TestElement;
    const ol = el.c[0] as TestElement;
    expect(ol.t).toBe('ol');
    expect(ol.p?.start).toBe(3);
  });

  test('task list → <li data-task> with disabled checkbox', () => {
    const el = convert('- [x] done\n- [ ] todo') as TestElement;
    const ul = el.c[0] as TestElement;
    const items = ul.c as TestElement[];
    expect(items[0].p).toMatchObject({ 'data-task': true });
    const inputEl = items[0].c.find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'input',
    );
    expect(inputEl?.p).toMatchObject({
      type: 'checkbox',
      checked: true,
      disabled: true,
    });
  });

  test('blockquote → <blockquote>', () => {
    const el = convert('> quoted') as TestElement;
    const bq = el.c[0] as TestElement;
    expect(bq.t).toBe('blockquote');
  });

  test('link → <a href>', () => {
    const el = convert('[text](https://example.com)') as TestElement;
    const para = el.c[0] as TestElement;
    const a = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(a).toBeDefined();
    expect(a?.p?.href).toBe('https://example.com');
  });

  test('image → <img src alt>', () => {
    const el = convert('![alt](https://example.com/img.png)') as TestElement;
    const para = el.c[0] as TestElement;
    const img = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'img',
    );
    expect(img).toBeDefined();
    expect(img?.p?.src).toBe('https://example.com/img.png');
    expect(img?.p?.alt).toBe('alt');
  });

  test('thematic break → <hr>', () => {
    const el = convert('---') as TestElement;
    const hr = el.c[0] as TestElement;
    expect(hr.t).toBe('hr');
  });
});

describe('mdastToReact — tables (GFM)', () => {
  test('basic table with header + body', () => {
    const el = convert('| A | B |\n|---|---|\n| 1 | 2 |') as TestElement;
    const table = el.c[0] as TestElement;
    expect(table.t).toBe('table');
    const [thead, tbody] = table.c as TestElement[];
    expect(thead.t).toBe('thead');
    expect(tbody.t).toBe('tbody');
  });

  test('aligned columns preserve text-align style', () => {
    const el = convert('| A | B | C |\n|:--|:-:|--:|\n| 1 | 2 | 3 |') as TestElement;
    const table = el.c[0] as TestElement;
    const tbody = (table.c as TestElement[]).find((c) => c.t === 'tbody') as TestElement;
    const row = tbody.c[0] as TestElement;
    const cells = row.c as TestElement[];
    expect(cells[0].p?.style).toMatchObject({ textAlign: 'left' });
    expect(cells[1].p?.style).toMatchObject({ textAlign: 'center' });
    expect(cells[2].p?.style).toMatchObject({ textAlign: 'right' });
  });
});

describe('mdastToReact — security (HTML passthrough)', () => {
  test('html nodes render as TEXT, never as raw HTML (FR11 AC)', () => {
    // When the fallback receives inline HTML (including <script> or other
    // risky tags), it must treat them as text. The factory always sees a
    // string child — not a dangerouslySetInnerHTML prop.
    const md = 'A <script>alert("x")</script> B';
    const el = convert(md) as TestElement;
    const para = el.c[0] as TestElement;
    // Find the 'html' value in children — it must be a string, not an object.
    const hasStringHtml = (para.c as (TestElement | string)[]).some(
      (c) => typeof c === 'string' && c.includes('<script>'),
    );
    expect(hasStringHtml).toBe(true);
    // Verify no element in the tree has dangerouslySetInnerHTML.
    const walk = (node: TestElement | string): boolean => {
      if (typeof node === 'string') return false;
      if (node.p?.dangerouslySetInnerHTML) return true;
      return (node.c as (TestElement | string)[]).some(walk);
    };
    expect(walk(el)).toBe(false);
  });
});

describe('mdastToReact — MDX JSX elements', () => {
  test('<Callout /> resolves to componentMap entry when provided', () => {
    const Callout = { __component: 'Callout' };
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Callout',
            attributes: [{ type: 'mdxJsxAttribute', name: 'type', value: 'warning' }],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for test
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: { Callout } },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe(Callout);
    expect(child.p).toMatchObject({ type: 'warning' });
  });

  test('<UnknownComp /> NOT in componentMap renders as inert placeholder (review Pass-2 Critical #1)', () => {
    // Pre-review: the walker blindly passed `node.name` to createElement
    // for any uppercase component not in the map — opening an XSS path via
    // e.g. `<Iframe srcdoc="<script>…</script>"/>` (browser treats the
    // uppercase tag case-insensitively). The gate now requires either a
    // mapped component OR a tag in the safe-HTML allowlist.
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'UnknownComp',
            attributes: [],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for test
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: {} },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe('span');
    expect(child.p).toMatchObject({ 'data-ok-unknown-tag': 'UnknownComp' });
    // Rendered as literal source text — string child is auto-escaped by the
    // factory, so the placeholder cannot itself inject.
    expect(child.c[0]).toBe('<UnknownComp />');
  });

  test('expression attribute resolves via JSON.parse (array literal)', () => {
    // Component must be admitted via componentMap for attributes to
    // surface (unmapped uppercase → placeholder per Pass-2 Critical #1).
    const Tabs = { __component: 'Tabs' };
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Tabs',
            attributes: [
              {
                type: 'mdxJsxAttribute',
                name: 'items',
                value: {
                  type: 'mdxJsxAttributeValueExpression',
                  value: '["TS", "JS"]',
                },
              },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for test
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: { Tabs } },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.p?.items).toEqual(['TS', 'JS']);
  });

  test('non-JSON expression falls back to raw string prop (no eval)', () => {
    // Security regression (review Critical #1): attempting to invoke
    // side-effecting code in an attribute expression must NOT execute —
    // we hand the raw source to the component as a string prop and let
    // the component decide what to do with it.
    const Callout = { __component: 'Callout' };
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Callout',
            attributes: [
              {
                type: 'mdxJsxAttribute',
                name: 'type',
                value: {
                  type: 'mdxJsxAttributeValueExpression',
                  value: "(()=>{ (globalThis as any).__ok_pwned = true; return 'warning'; })()",
                },
              },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for test
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: { Callout } },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    // Raw source string, NOT the 'warning' result of executing it.
    expect(typeof child.p?.type).toBe('string');
    expect(child.p?.type).toContain('__ok_pwned');
    // Sentinel: no side effect escaped into the global scope.
    expect((globalThis as unknown as { __ok_pwned?: boolean }).__ok_pwned).toBeUndefined();
  });

  test('spread attribute that is not a JSON literal is discarded (no eval)', () => {
    const Callout = { __component: 'Callout' };
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Callout',
            attributes: [
              {
                type: 'mdxJsxExpressionAttribute',
                value: '(globalThis as any).__ok_spread_pwned = true, {}',
              },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for test
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: { Callout } },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    // No props assigned — the non-JSON expression path returns the raw
    // string, which the spread branch ignores because it isn't an object.
    expect(child.p).toBeNull();
    expect(
      (globalThis as unknown as { __ok_spread_pwned?: boolean }).__ok_spread_pwned,
    ).toBeUndefined();
  });

  test('bare attribute (no value) → true prop', () => {
    const Note = { __component: 'Note' };
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Note',
            attributes: [{ type: 'mdxJsxAttribute', name: 'open', value: null }],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for test
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: { Note } },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.p?.open).toBe(true);
  });

  test('fragment (<>...</>) → <div data-ok-fragment>', () => {
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: null,
            attributes: [],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast for test
            children: [{ type: 'text', value: 'x' }] as any,
          } as never,
        ],
      },
      { createElement: testFactory },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe('div');
    expect(child.p).toMatchObject({ 'data-ok-fragment': '' });
  });
});

describe('mdastToReact — XSS guards (review Pass-2 Critical #1)', () => {
  test('<Iframe srcdoc="<script>…</script>"/> is neutralized to placeholder', () => {
    // Primary attack vector: uppercase-initial `<Iframe>` reaches the
    // walker as an mdxJsxFlowElement (lowercase `<iframe>` is absorbed
    // into text by R23's autolink-void-html-guard, but the uppercase
    // variant survives). Browser renders `<Iframe>` case-insensitively
    // as `<iframe>` and executes the srcdoc payload. Gate MUST reject
    // this with an inert placeholder.
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Iframe',
            attributes: [
              {
                type: 'mdxJsxAttribute',
                name: 'srcdoc',
                value: '<script>document.title="pwn"</script>',
              },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: {} },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    // NOT rendered as `Iframe` — must be the safe placeholder span.
    expect(child.t).toBe('span');
    expect(child.p).toMatchObject({ 'data-ok-unknown-tag': 'Iframe' });
    // No element in the tree should have tag `Iframe` or carry `srcdoc`.
    const walk = (node: TestElement | string): boolean => {
      if (typeof node === 'string') return false;
      if (node.t === 'Iframe' || node.t === 'iframe') return true;
      if (node.p?.srcdoc || node.p?.srcDoc) return true;
      return (node.c as (TestElement | string)[]).some(walk);
    };
    expect(walk(el)).toBe(false);
  });

  test('<Script>alert(1)</Script> renders as placeholder, not as <script>', () => {
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Script',
            attributes: [],
            children: [{ type: 'text', value: 'alert(1)' }],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast
          } as any,
        ],
      },
      { createElement: testFactory, componentMap: {} },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe('span');
    expect(child.p).toMatchObject({ 'data-ok-unknown-tag': 'Script' });
    // The alert(1) text is NOT rendered inside a Script element — only as
    // escaped text inside the placeholder.
  });

  test('<Form action="javascript:…"> rejected even with action sanitized by React', () => {
    // React 19 sanitizes `action`/`formAction` URLs — but we reject the
    // uppercase `<Form>` before it ever reaches the DOM, so the defense
    // is two-layer.
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Form',
            attributes: [
              {
                type: 'mdxJsxAttribute',
                name: 'action',
                value: 'javascript:alert(1)',
              },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: {} },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe('span');
    expect(child.p).toMatchObject({ 'data-ok-unknown-tag': 'Form' });
  });

  test('lowercase <iframe> outside the safe-HTML allowlist also rejected (defense-in-depth)', () => {
    // R23 absorbs most lowercase HTML into text, but if a lowercase
    // `<iframe>` ever reaches the walker as mdxJsxFlowElement (e.g. a
    // future pipeline change, or a rare nested-inline edge case), the
    // allowlist still catches it.
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'iframe',
            attributes: [{ type: 'mdxJsxAttribute', name: 'srcdoc', value: '<script>x</script>' }],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: {} },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe('span');
    expect(child.p).toMatchObject({ 'data-ok-unknown-tag': 'iframe' });
  });

  test('mapped components in the componentMap still render normally', () => {
    // Admission path 1: name in componentMap — no rejection regardless of
    // what the name is. Keeps the fumadocs bindings working.
    const Callout = { __component: 'Callout' };
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'Callout',
            attributes: [{ type: 'mdxJsxAttribute', name: 'type', value: 'info' }],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast
            children: [] as any,
          } as never,
        ],
      },
      { createElement: testFactory, componentMap: { Callout } },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe(Callout);
  });

  test('safe HTML tags in the allowlist still render as raw tags', () => {
    // Admission path 2: lowercase tag in SAFE_HTML_TAGS allowlist. `<p>`
    // is on the list — the walker renders it verbatim. This keeps
    // inline HTML like `<div>wrapper</div>` working.
    const el = mdastToReact(
      {
        type: 'root',
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'div',
            attributes: [{ type: 'mdxJsxAttribute', name: 'className', value: 'box' }],
            children: [{ type: 'text', value: 'hi' }],
            // biome-ignore lint/suspicious/noExplicitAny: synthetic mdast
          } as any,
        ],
      },
      { createElement: testFactory, componentMap: {} },
    ) as TestElement;
    const child = el.c[0] as TestElement;
    expect(child.t).toBe('div');
    expect(child.p).toMatchObject({ className: 'box' });
  });

  test('link with javascript: href sanitized to # fallback', () => {
    const el = convert('[click me](javascript:alert(1))') as TestElement;
    const para = el.c[0] as TestElement;
    const a = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(a).toBeDefined();
    expect(a?.p?.href).toBe('#');
  });

  test('link with data:text/html href sanitized to # fallback', () => {
    const el = convert('[malicious](data:text/html,<script>alert(1)</script>)') as TestElement;
    const para = el.c[0] as TestElement;
    const a = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(a?.p?.href).toBe('#');
  });

  test('image with javascript: src sanitized to # fallback', () => {
    const el = convert('![alt](javascript:alert(1))') as TestElement;
    const para = el.c[0] as TestElement;
    const img = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'img',
    );
    expect(img?.p?.src).toBe('#');
  });

  test('image with data:image/png src allowed through', () => {
    const pngData =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACklEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const el = convert(`![pixel](${pngData})`) as TestElement;
    const para = el.c[0] as TestElement;
    const img = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'img',
    );
    expect(img?.p?.src).toBe(pngData);
  });

  test('image with data:text/html src sanitized to # fallback', () => {
    const el = convert('![img](data:text/html,<script>alert(1)</script>)') as TestElement;
    const para = el.c[0] as TestElement;
    const img = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'img',
    );
    expect(img?.p?.src).toBe('#');
  });

  test('link with safe https URL passes through unchanged', () => {
    const el = convert('[ok](https://example.com/path?q=1)') as TestElement;
    const para = el.c[0] as TestElement;
    const a = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(a?.p?.href).toBe('https://example.com/path?q=1');
  });

  test('link with relative/hash URL passes through unchanged', () => {
    const el = convert('[a](./page) and [b](#section)') as TestElement;
    const para = el.c[0] as TestElement;
    const anchors = (para.c as TestElement[]).filter(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(anchors[0]?.p?.href).toBe('./page');
    expect(anchors[1]?.p?.href).toBe('#section');
  });

  test('mailto: and tel: schemes pass through (OS handlers, no viewer-origin JS)', () => {
    const mailEl = convert('[mail](mailto:a@b.c)') as TestElement;
    const telEl = convert('[tel](tel:+1-555-0100)') as TestElement;
    const mailA = ((mailEl.c[0] as TestElement).c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    const telA = ((telEl.c[0] as TestElement).c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(mailA?.p?.href).toBe('mailto:a@b.c');
    expect(telA?.p?.href).toBe('tel:+1-555-0100');
  });
});

describe('mdastToReact — wikiLink + rawMdxFallback (OK-specific)', () => {
  test('wikiLink renders as <a class="ok-wiki-link">', () => {
    const el = convert('[[SomePage]]') as TestElement;
    const para = el.c[0] as TestElement;
    const a = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(a).toBeDefined();
    expect(a?.p?.className).toBe('ok-wiki-link');
    expect(a?.p?.['data-target']).toBe('SomePage');
  });

  test('wikiLink with alias uses alias as label', () => {
    const el = convert('[[SomePage|Custom Label]]') as TestElement;
    const para = el.c[0] as TestElement;
    const a = (para.c as TestElement[]).find(
      (c): c is TestElement => typeof c === 'object' && c.t === 'a',
    );
    expect(a?.c).toContain('Custom Label');
    expect(a?.p?.['data-target']).toBe('SomePage');
  });
});

describe('mdastToReact — frontmatter skipped', () => {
  test('yaml frontmatter is skipped (returns null, not rendered)', () => {
    const md = '---\ntitle: Hi\n---\n\nBody';
    const el = convert(md) as TestElement;
    // The yaml node should have returned null (filtered out). We should
    // just see the paragraph.
    const nonNull = el.c.filter((c) => c != null);
    expect(nonNull.length).toBe(1);
    const para = nonNull[0] as TestElement;
    expect(para.t).toBe('p');
    expect(para.c).toEqual(['Body']);
  });
});

describe('mdastToReact — corpus parity (spot check)', () => {
  test('renders the full commonmark "paragraphs and phrasing" shape', () => {
    const md = `# Title

Paragraph with **strong** and *emphasis*.

- item 1
- item 2

> quote

\`\`\`js
const x = 1;
\`\`\`
`;
    const el = convert(md) as TestElement;
    // Root element is a div; top-level children in order: h1, p, ul, blockquote, pre
    const tags = (el.c as TestElement[]).map((c) => c.t);
    expect(tags).toEqual(['h1', 'p', 'ul', 'blockquote', 'pre']);
  });
});
