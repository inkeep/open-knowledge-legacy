/**
 * Pure mdast → element-tree walker. V2 SPEC FR11 (Option E backend half).
 *
 * **NO `react` import.** This module is intentionally placed in `packages/core`
 * under the "No React or Node.js server dependencies — browser + Node
 * compatible" invariant (see CLAUDE.md). Consumers provide their own
 * element factory (`React.createElement`, Preact's `h`, a string-based
 * factory for SSR/test, etc.) — the walker is a pure AST-to-tree
 * transformation.
 *
 * Pairs with the thin React binding at
 * `packages/app/src/editor/mdast-to-react.tsx` (US-011) which imports React
 * + fumadocs componentMap and exports `markdownToReact(md)`. See V2 SPEC
 * §9.3 + Audit §B2 for the pure-core / React-binding split rationale.
 *
 * Node coverage (V2 SPEC FR11 AC):
 *   paragraph, heading (h1-h6), text, strong, emphasis, inlineCode, code,
 *   list, listItem, blockquote, link, image, thematicBreak, break, delete,
 *   table, tableRow, tableCell, html, yaml/toml (skip), mdxJsxFlowElement,
 *   mdxJsxTextElement, wikiLink (OK-specific), rawMdxFallback (OK-specific)
 *
 * Security (V2 SPEC FR11 AC):
 *   - html nodes pass through as TEXT (auto-escaped by the factory) — we
 *     never emit a factory("html", { dangerouslySetInnerHTML }) element.
 *   - JSX expression attributes (mdxJsxAttributeValueExpression) are parsed
 *     via JSON.parse for literal values (numbers, strings, booleans, null,
 *     arrays/objects of literals); anything else is handed to the component
 *     as a raw string prop. We intentionally do NOT eval() / new Function()
 *     expressions: the renderer runs inside the viewer's browser origin
 *     against authored/collaborator/disk-sourced MDX, so eval is a browser
 *     RCE path. Components that need rich prop types compile expressions
 *     server-side via acorn (the real MDX toolchain) or accept string props
 *     and parse them themselves.
 */

import type { Nodes, Root, RootContentMap } from 'mdast';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Element factory — the caller's bridge between mdast and their target
 * runtime. `React.createElement`, Preact's `h`, and test-only string
 * factories all satisfy this shape.
 */
export type CreateElement<E = unknown> = (
  type: string | unknown,
  props: Record<string, unknown> | null,
  ...children: Array<E | string | null | undefined>
) => E;

/**
 * Map of custom MDX component name → component value (passed straight to
 * the factory). For React consumers this is a `Record<string, ComponentType>`
 * from fumadocs-ui/mdx or similar. The walker doesn't care about the value
 * type — it just passes it as the `type` arg to `createElement`.
 */
export type ComponentMap = Record<string, unknown>;

export interface WalkerOptions<E = unknown> {
  createElement: CreateElement<E>;
  componentMap?: ComponentMap;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Walk the mdast tree, producing whatever `createElement` returns. At a
 * Root node this yields a single element representing the document.
 * Individual children are skipped silently when unrepresentable (yaml /
 * toml frontmatter, footnoteDefinition).
 *
 * Name: environment-agnostic (review Minor #21). `createElement` can be
 * React's, Preact's `h`, a string factory for SSR/test — the walker just
 * calls it. `mdastToReact` is retained as a deprecated alias for backward
 * compatibility with existing consumers.
 */
export function mdastToElementTree<E = unknown>(
  node: Nodes | Root,
  opts: WalkerOptions<E>,
): E | string | null {
  return walk(node as Nodes, opts);
}

/**
 * @deprecated Renamed to `mdastToElementTree` — the walker is
 * environment-agnostic; `React` in the original name was misleading
 * (review Minor #21). Alias retained for backward compatibility.
 */
export const mdastToReact = mdastToElementTree;

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

type AnyMdast = { type: string } & Record<string, unknown>;

function walk<E>(node: Nodes | AnyMdast, opts: WalkerOptions<E>): E | string | null {
  const type = node.type;
  switch (type) {
    case 'root': {
      const root = node as Root;
      return opts.createElement(
        'div',
        { 'data-ok-fallback-root': '' },
        ...children(root.children, opts),
      );
    }
    case 'paragraph': {
      return opts.createElement(
        'p',
        null,
        ...children((node as RootContentMap['paragraph']).children, opts),
      );
    }
    case 'heading': {
      const h = node as RootContentMap['heading'];
      return opts.createElement(`h${h.depth}`, null, ...children(h.children, opts));
    }
    case 'text': {
      return (node as RootContentMap['text']).value;
    }
    case 'strong': {
      return opts.createElement(
        'strong',
        null,
        ...children((node as RootContentMap['strong']).children, opts),
      );
    }
    case 'emphasis': {
      return opts.createElement(
        'em',
        null,
        ...children((node as RootContentMap['emphasis']).children, opts),
      );
    }
    case 'delete': {
      return opts.createElement(
        'del',
        null,
        ...children((node as RootContentMap['delete']).children, opts),
      );
    }
    case 'inlineCode': {
      return opts.createElement('code', null, (node as RootContentMap['inlineCode']).value);
    }
    case 'code': {
      const c = node as RootContentMap['code'];
      return opts.createElement(
        'pre',
        null,
        opts.createElement('code', c.lang ? { className: `language-${c.lang}` } : null, c.value),
      );
    }
    case 'list': {
      const l = node as RootContentMap['list'];
      const tag = l.ordered ? 'ol' : 'ul';
      const props: Record<string, unknown> = {};
      if (l.ordered && typeof l.start === 'number' && l.start !== 1) {
        props.start = l.start;
      }
      return opts.createElement(
        tag,
        Object.keys(props).length ? props : null,
        ...children(l.children, opts),
      );
    }
    case 'listItem': {
      const li = node as RootContentMap['listItem'];
      const props: Record<string, unknown> = {};
      if (typeof li.checked === 'boolean') {
        // GFM task list — use a disabled checkbox prefix.
        return opts.createElement(
          'li',
          { 'data-task': true },
          opts.createElement('input', {
            type: 'checkbox',
            checked: li.checked,
            disabled: true,
            readOnly: true,
          }),
          ' ',
          ...children(li.children, opts),
        );
      }
      return opts.createElement(
        'li',
        Object.keys(props).length ? props : null,
        ...children(li.children, opts),
      );
    }
    case 'blockquote': {
      return opts.createElement(
        'blockquote',
        null,
        ...children((node as RootContentMap['blockquote']).children, opts),
      );
    }
    case 'link': {
      const l = node as RootContentMap['link'];
      const props: Record<string, unknown> = { href: l.url };
      if (l.title) props.title = l.title;
      return opts.createElement('a', props, ...children(l.children, opts));
    }
    case 'image': {
      const img = node as RootContentMap['image'];
      const props: Record<string, unknown> = { src: img.url, alt: img.alt ?? '' };
      if (img.title) props.title = img.title;
      return opts.createElement('img', props);
    }
    case 'thematicBreak': {
      return opts.createElement('hr', null);
    }
    case 'break': {
      return opts.createElement('br', null);
    }
    case 'table': {
      const t = node as RootContentMap['table'];
      const [headerRow, ...bodyRows] = t.children ?? [];
      const headerEl = headerRow
        ? opts.createElement('thead', null, walkTableRow(headerRow, t.align ?? [], 'th', opts))
        : null;
      const bodyEl =
        bodyRows.length > 0
          ? opts.createElement(
              'tbody',
              null,
              ...bodyRows.map((r) => walkTableRow(r, t.align ?? [], 'td', opts)),
            )
          : null;
      return opts.createElement('table', null, headerEl, bodyEl);
    }
    case 'tableRow': {
      // A loose row (should have been wrapped by `table`). Render as tr of tds.
      return walkTableRow(node as RootContentMap['tableRow'], [], 'td', opts);
    }
    case 'tableCell': {
      return opts.createElement(
        'td',
        null,
        ...children((node as RootContentMap['tableCell']).children, opts),
      );
    }
    case 'html': {
      // Security (V2 SPEC FR11): pass html nodes through as TEXT, never as
      // raw HTML injection. The factory auto-escapes per its own contract
      // (React.createElement, Preact h, etc. all treat string children as
      // text, not innerHTML).
      return (node as RootContentMap['html']).value;
    }
    case 'yaml':
    case 'toml': {
      // Skip frontmatter — the fallback render excludes it.
      return null;
    }
    case 'footnoteDefinition': {
      // Footnote definitions are rendered separately; skip here (the
      // fallback doesn't fully render footnotes — MDX authors use inline
      // footnote references which become <sup><a>...</a></sup> via the
      // `footnoteReference` handler).
      return null;
    }
    case 'footnoteReference': {
      const fn = node as RootContentMap['footnoteReference'];
      return opts.createElement(
        'sup',
        null,
        opts.createElement('a', { href: `#fn-${fn.identifier}` }, `[${fn.label ?? fn.identifier}]`),
      );
    }
    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement': {
      return walkMdxJsx(node as unknown as MdxJsxElement, opts);
    }
    case 'wikiLink': {
      // OK-specific. We don't have a 'wikiLink' component registered in the
      // componentMap by default — render as a semantic <a> with a class so
      // consumers can style/match. The attrs carry the target + alias.
      const w = node as {
        data?: { target?: string; alias?: string | null; anchor?: string | null };
      };
      const target: string = w.data?.target ?? '';
      const alias: string | null = w.data?.alias ?? null;
      const anchor: string | null = w.data?.anchor ?? null;
      const label = alias ?? target;
      const href = anchor ? `${target}#${anchor}` : target;
      return opts.createElement(
        'a',
        {
          href: `#${encodeURIComponent(href)}`,
          className: 'ok-wiki-link',
          'data-target': target,
        },
        label,
      );
    }
    case 'rawMdxFallback': {
      // Render as a <pre> so broken MDX is visible and debuggable in the
      // fallback. Matches the in-editor chip's role of "show the source".
      const r = node as { value?: string };
      return opts.createElement('pre', { 'data-ok-raw-mdx-fallback': '' }, r.value ?? '');
    }
    case 'definition': {
      // Link references are resolved at parse time to `link` nodes; definitions
      // themselves render nothing.
      return null;
    }
    case 'linkReference': {
      const lr = node as RootContentMap['linkReference'];
      return opts.createElement('a', { href: `#${lr.identifier}` }, ...children(lr.children, opts));
    }
    case 'imageReference': {
      const ir = node as RootContentMap['imageReference'];
      return opts.createElement('img', { src: `#${ir.identifier}`, alt: ir.alt ?? '' });
    }
    default: {
      // Unknown mdast type — skip with a DEV hint.
      return null;
    }
  }
}

function children<E>(
  nodes: Array<Nodes> | undefined,
  opts: WalkerOptions<E>,
): Array<E | string | null | undefined> {
  if (!nodes) return [];
  return nodes.map((n) => walk(n, opts));
}

function walkTableRow<E>(
  row: RootContentMap['tableRow'],
  align: Array<'left' | 'right' | 'center' | null>,
  cellTag: 'th' | 'td',
  opts: WalkerOptions<E>,
): E | null {
  if (!row?.children) return null;
  const cells = row.children.map((cell, i) => {
    const a = align[i] ?? null;
    const props = a ? { style: { textAlign: a } } : null;
    return opts.createElement(
      cellTag,
      props,
      ...children((cell as RootContentMap['tableCell']).children, opts),
    );
  });
  return opts.createElement('tr', null, ...cells);
}

// ---------------------------------------------------------------------------
// MDX JSX handling
// ---------------------------------------------------------------------------

interface MdxJsxElement {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  attributes: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>;
  children: Nodes[];
}

interface MdxJsxAttribute {
  type: 'mdxJsxAttribute';
  name: string;
  value: string | MdxJsxAttributeValueExpression | null;
}

interface MdxJsxExpressionAttribute {
  type: 'mdxJsxExpressionAttribute';
  value: string;
}

interface MdxJsxAttributeValueExpression {
  type: 'mdxJsxAttributeValueExpression';
  value: string;
}

function walkMdxJsx<E>(node: MdxJsxElement, opts: WalkerOptions<E>): E | string | null {
  // Resolve the component from the map. Fragment (null name) → plain
  // children array (caller factory must accept).
  if (node.name === null) {
    // <>...</> fragment
    return opts.createElement('div', { 'data-ok-fragment': '' }, ...children(node.children, opts));
  }
  const mapped = opts.componentMap?.[node.name];
  const type = mapped ?? node.name;
  const props = mdxAttributesToProps(node.attributes);
  const kids = children(node.children, opts);
  return opts.createElement(type, Object.keys(props).length ? props : null, ...kids);
}

function mdxAttributesToProps(
  attrs: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const attr of attrs) {
    if (attr.type === 'mdxJsxExpressionAttribute') {
      // {...spreadProps} — attempt JSON parse; fall back to nothing.
      const parsed = tryParseExpression(attr.value);
      if (parsed && typeof parsed === 'object') {
        Object.assign(props, parsed);
      }
      continue;
    }
    const name = attr.name;
    // Convert HTML attr names to React-idiomatic camelCase for common cases.
    // fumadocs components accept both, so we keep the attr name verbatim.
    const propName = name;
    const value = attr.value;
    if (value === null) {
      // Bare attribute (e.g. <Foo disabled />) — treated as true.
      props[propName] = true;
    } else if (typeof value === 'string') {
      props[propName] = value;
    } else if (value.type === 'mdxJsxAttributeValueExpression') {
      props[propName] = tryParseExpression(value.value);
    }
  }
  return props;
}

/**
 * Parse a JSX expression attribute to a prop value.
 *
 * JSON.parse covers every literal shape MDX attrs use in practice: numbers,
 * booleans, null, string literals, arrays/objects of literals. If the
 * expression is something JSON can't represent (identifiers, function
 * calls, template strings), we hand the raw trimmed source to the component
 * as a string prop — it can parse further if it needs to, but we never
 * eval.
 *
 * `new Function()` is equivalent to `eval` under CSP (blocked by
 * `unsafe-eval`) and would execute arbitrary authored/agent/disk-sourced
 * JS in the viewer's origin — a browser RCE vector. Not used.
 */
function tryParseExpression(expr: string): unknown {
  const trimmed = expr.trim();
  if (trimmed === '') return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
