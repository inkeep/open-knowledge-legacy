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
 * Security (V2 SPEC FR11 AC + review Pass-2 Critical #1):
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
 *   - JSX TAG NAMES are gated by an allowlist (`SAFE_HTML_TAGS`). Uppercase-
 *     initial tag names that are NOT present in the caller's `componentMap`
 *     and lowercase tag names that are NOT in the safe-HTML allowlist fall
 *     through to a visible escaped placeholder — the raw tag is rendered as
 *     TEXT (factory-escaped, same path as the `html` node case). This
 *     defeats `<Iframe srcdoc="<script>…</script>" />` which otherwise
 *     would reach `createElement('Iframe', {srcdoc: '…'})` → browser
 *     treats `<Iframe>` case-insensitively as `<iframe>` → script executes
 *     in the iframe's own browsing context (React's built-in sanitizeURL
 *     covers `href`/`src`/`data`/`action`/`formAction` but NOT `srcdoc`).
 *     Same guard blocks `<Script>`, `<Form action=…>` variants, and the
 *     rare lowercase `<math>` / `<svg>` paths that survive R23's guard for
 *     HTML-ish text (R23 protects lowercase HTML in block context, but
 *     inline/nested cases can still surface an mdxJsx node).
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
 * calls it.
 */
export function mdastToElementTree<E = unknown>(
  node: Nodes | Root,
  opts: WalkerOptions<E>,
): E | string | null {
  return walk(node as Nodes, opts);
}

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
      // Defense-in-depth URL sanitization (review Pass-2 Critical #1).
      // React 19 already rewrites `javascript:` to an inert throw-URL for
      // href/src/data/action/formAction. We additionally reject `data:`
      // with HTML-ish media types (could navigate to attacker-controlled
      // HTML), `vbscript:`, `file:`, `blob:`, and any other unknown scheme
      // — the allowlist is positive (http(s), mailto, tel, plus relative/
      // hash-URLs) rather than a denylist.
      const l = node as RootContentMap['link'];
      const safeHref = sanitizeHref(l.url);
      const props: Record<string, unknown> = { href: safeHref };
      if (l.title) props.title = l.title;
      return opts.createElement('a', props, ...children(l.children, opts));
    }
    case 'image': {
      const img = node as RootContentMap['image'];
      const safeSrc = sanitizeImageSrc(img.url);
      const props: Record<string, unknown> = { src: safeSrc, alt: img.alt ?? '' };
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
      // Unknown mdast type — render a DEV placeholder + emit a structured
      // hint so a contributor adding a new node type sees something rather
      // than silent truncation (review Pass-2 Major #10). Structured-JSON
      // shape matches AGENTS.md §Logging conventions for counted events.
      // In production, the hint still fires once via `console.warn` —
      // logging infrastructure aggregates these into a "walker-unknown-
      // node" counter, surfacing new mdast types that land in production
      // before we've added a handler.
      const unknownType = String(type);
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(JSON.stringify({ event: 'mdast-to-react-unknown-node', type: unknownType }));
      }
      return opts.createElement(
        'span',
        { 'data-ok-unknown-node': unknownType, style: { opacity: 0.6 } },
        `<${unknownType}/>`,
      );
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

/**
 * Allowlist of lowercase HTML tags that survive `walkMdxJsx` as raw DOM
 * elements. Everything outside this list falls through to a visible escaped
 * placeholder (review Pass-2 Critical #1).
 *
 * Deliberately omitted: `iframe`, `object`, `embed`, `script`, `style`,
 * `base`, `meta`, `link`, `form`, `input`, `button`, `textarea`, `select`,
 * `option`, `math`, `svg`, `video`, `audio`, `source`, `track`, `portal`,
 * `frame`, `frameset`, `applet`. Any of these with hostile attributes
 * (`srcdoc`, event handlers as strings, `formaction`, sandboxed-script
 * content) would bypass React's built-in sanitizeURL (which covers only
 * `href`/`src`/`data`/`action`/`formAction`) and execute in the viewer's
 * origin. Lock the list down to prose-markup elements only.
 */
const SAFE_HTML_TAGS: ReadonlySet<string> = new Set([
  'p',
  'div',
  'span',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'del',
  'b',
  'i',
  's',
  'u',
  'small',
  'mark',
  'sub',
  'sup',
  'br',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
  'img',
  'figure',
  'figcaption',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
  'abbr',
  'cite',
  'q',
  'kbd',
  'samp',
  'var',
  'time',
  'ruby',
  'rt',
  'rp',
]);

/** Uppercase first character marks a JSX component (vs HTML element). */
function isUppercaseComponent(name: string): boolean {
  const c = name.charCodeAt(0);
  return c >= 0x41 /* A */ && c <= 0x5a /* Z */;
}

function walkMdxJsx<E>(node: MdxJsxElement, opts: WalkerOptions<E>): E | string | null {
  // Resolve the component from the map. Fragment (null name) → plain
  // children array (caller factory must accept).
  if (node.name === null) {
    // <>...</> fragment
    return opts.createElement('div', { 'data-ok-fragment': '' }, ...children(node.children, opts));
  }
  const mapped = opts.componentMap?.[node.name];

  // Security gate (review Pass-2 Critical #1). Without the gate, any
  // authored / agent-written / disk-sourced MDX can emit
  // `<Iframe srcdoc="<script>…</script>" />`; the walker blindly passes
  // 'Iframe' as the element type, React renders `<Iframe srcdoc>`, and the
  // browser treats it case-insensitively as `<iframe>` — the srcdoc's
  // script executes in the iframe's own browsing context. Same threat
  // class for `<Script>`, `<Form action="javascript:…">` (React sanitizes
  // action but not srcdoc), etc.
  //
  // Admit paths:
  //   1. The name is present in `componentMap` — trusted component binding.
  //   2. The name is a lowercase HTML tag on the SAFE_HTML_TAGS allowlist.
  //
  // Everything else (including uppercase components not in the map, and
  // lowercase HTML tags outside the allowlist) is rendered as an inert
  // escaped placeholder — the factory's string-children path auto-escapes
  // <, >, &, etc. so the placeholder cannot itself be an injection vector.
  const isUppercase = isUppercaseComponent(node.name);
  const admitted = mapped !== undefined || (!isUppercase && SAFE_HTML_TAGS.has(node.name));
  if (!admitted) {
    const source = serializeMdxJsxForPlaceholder(node);
    return opts.createElement(
      'span',
      { 'data-ok-unknown-tag': node.name, style: { opacity: 0.6 } },
      source,
    );
  }

  const type = mapped ?? node.name;
  const props = mdxAttributesToProps(node.attributes);
  const kids = children(node.children, opts);
  return opts.createElement(type, Object.keys(props).length ? props : null, ...kids);
}

/**
 * Render a rejected MDX JSX element as its literal source text so the
 * reader sees *something* rather than a silent hole. Factory string-children
 * path auto-escapes, so the placeholder cannot itself be an injection
 * vector. Keeps the output compact — an unpopulated `<Iframe ...>` renders
 * as the literal `<Iframe ... />` text.
 */
function serializeMdxJsxForPlaceholder(node: MdxJsxElement): string {
  const attrs = (node.attributes ?? [])
    .map((a) => {
      if (a.type === 'mdxJsxExpressionAttribute') return `{${a.value}}`;
      const val = a.value;
      if (val === null) return a.name;
      if (typeof val === 'string') return `${a.name}="${val}"`;
      return `${a.name}={${val.value}}`;
    })
    .join(' ');
  const head = attrs ? `${node.name} ${attrs}` : (node.name ?? '');
  return `<${head} />`;
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
    // Attr names pass through verbatim — fumadocs + standard HTML components
    // accept both `className` and `class`, `htmlFor` and `for`. Handing over
    // the original author form preserves fidelity for components that read
    // custom attrs (review Pass-2 Minor #6 — the previous comment claimed
    // "convert to camelCase" but no conversion actually happened).
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

// ---------------------------------------------------------------------------
// URL sanitization (review Pass-2 Critical #1 defense-in-depth)
//
// React 19's sanitizeURL rewrites `javascript:` in href/src/data/action/
// formAction. That's insufficient on its own — `data:` URLs with HTML-ish
// media types ARE still navigable (`<a href="data:text/html,<script>…">`
// executes on click), `vbscript:` pre-Edge legacy, `file:` + `blob:`.
// Mirror `packages/app/src/editor/safe-navigation-url.ts` as a pure
// walker-local helper so the core module stays React-free.
// ---------------------------------------------------------------------------

/**
 * Schemes we will navigate to. Same allowlist as the app's
 * `isSafeNavigationUrl`. `http(s)` for the web, `mailto`/`tel` for OS
 * handlers (no JS execution in viewer origin). Everything else (javascript,
 * data, vbscript, file, blob, ws, etc.) is rejected.
 */
const SAFE_NAVIGATION_SCHEMES: ReadonlySet<string> = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

/**
 * Images may additionally use `data:` with image media types (common for
 * inline icons, diagrams, small GIFs). Block `data:text/html`, `data:
 * application/...javascript`, and ambiguous cases.
 */
const SAFE_IMAGE_DATA_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/avif',
  'image/x-icon',
]);

/** Inert fallback returned when a URL is rejected. `#` is a no-op anchor. */
const UNSAFE_URL_FALLBACK = '#';

/**
 * Sanitize a URL for use in `<a href>`. Allows relative URLs (no scheme) +
 * hash fragments; rejects any absolute URL whose scheme is outside the
 * navigation allowlist.
 */
function sanitizeHref(url: string | undefined | null): string {
  if (!url) return UNSAFE_URL_FALLBACK;
  const s = String(url).trim();
  if (s === '') return UNSAFE_URL_FALLBACK;
  // Relative paths + hash fragments are safe — no scheme.
  if (s.startsWith('#') || s.startsWith('/') || s.startsWith('./') || s.startsWith('../')) return s;
  // Strings that don't parse as a URL with a dummy base fall through to
  // "treat as relative" — common for wiki-link hrefs like `SomePage#anchor`.
  // The presence of `:` before a `/` indicates a scheme.
  const colonIdx = s.indexOf(':');
  const slashIdx = s.indexOf('/');
  const hasScheme = colonIdx !== -1 && (slashIdx === -1 || colonIdx < slashIdx);
  if (!hasScheme) return s;
  try {
    const parsed = new URL(s);
    if (SAFE_NAVIGATION_SCHEMES.has(parsed.protocol)) return s;
  } catch {
    // Parse failure on something that looked like it had a scheme — reject.
  }
  return UNSAFE_URL_FALLBACK;
}

/**
 * Sanitize a URL for use in `<img src>`. Same allowlist as `sanitizeHref`
 * plus `data:` URLs with image media types.
 */
function sanitizeImageSrc(url: string | undefined | null): string {
  if (!url) return UNSAFE_URL_FALLBACK;
  const s = String(url).trim();
  if (s === '') return UNSAFE_URL_FALLBACK;
  if (s.startsWith('#') || s.startsWith('/') || s.startsWith('./') || s.startsWith('../')) return s;
  const colonIdx = s.indexOf(':');
  const slashIdx = s.indexOf('/');
  const hasScheme = colonIdx !== -1 && (slashIdx === -1 || colonIdx < slashIdx);
  if (!hasScheme) return s;
  try {
    const parsed = new URL(s);
    if (SAFE_NAVIGATION_SCHEMES.has(parsed.protocol)) return s;
    if (parsed.protocol === 'data:') {
      // Extract media-type from the data: URL. `data:image/png;base64,…` →
      // `image/png`. Reject `data:text/html,…`, `data:application/…`, etc.
      const body = s.slice('data:'.length);
      const commaIdx = body.indexOf(',');
      if (commaIdx === -1) return UNSAFE_URL_FALLBACK;
      const header = body.slice(0, commaIdx).toLowerCase();
      const mediaType = header.split(';')[0]?.trim() ?? '';
      if (SAFE_IMAGE_DATA_MEDIA_TYPES.has(mediaType)) return s;
    }
  } catch {
    // Parse failure — reject.
  }
  return UNSAFE_URL_FALLBACK;
}
