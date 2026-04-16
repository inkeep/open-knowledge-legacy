/**
 * mdast → hast handlers for custom node types (outbound clipboard HTML).
 *
 * Each handler maps one of our promoted custom mdast types (D7) to its
 * clipboard-safe hast shape per Q1:
 *
 * - `wikiLink` → `<a class="wiki-link" data-target data-anchor data-alias
 *   href="#slug">label</a>`. `data-resolved` is intentionally dropped —
 *   it's server-computed non-stable state, re-derivable on parse, and
 *   meaningless to external destinations.
 *
 * - `mdxJsxFlowElement` → `<pre class="mdx-component"><code>{escaped raw}
 *   </code></pre>`. The raw source (`data.sourceRaw`) is injected as a
 *   hast `text` node so `rehype-stringify` auto-escapes the literal `<`,
 *   `>`, `&`, `"`, `'` — never as hast `html` (which passes through
 *   unescaped). This is the security boundary for FR-20: any adversarial
 *   content inside a JSX component survives verbatim but NEVER re-enters
 *   the HTML-parse world with special meaning.
 *
 * - `mdxJsxTextElement` → `<span class="mdx-inline">{escaped raw}</span>`.
 *   Same escape discipline as the flow element — inline JSX appears as
 *   a readable-but-inert span in external destinations (Gmail, Slack).
 *
 * - `rawMdxFallback` → `<!-- Parse error: {reason} -->` + `<pre class=
 *   "mdx-fallback"><code>{escaped raw}</code></pre>`. The leading
 *   comment makes the failure self-describing in View Source without
 *   cluttering the rendered surface; the `<pre>` preserves the raw
 *   content for manual recovery.
 *
 * FR-20 contract: adversarial input (`<script>`, null bytes, XML
 * namespaces, HTML entities) MUST be entity-encoded on the way out.
 * Test coverage: per-node unit tests with adversarial literals + a
 * fuzz test across 100+ random payloads.
 */

import type { Comment, Element, ElementContent } from 'hast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import type { Handler, Handlers } from 'mdast-util-to-hast';
import { toWikiLinkSlug } from '../utils/slug.ts';
import type {
  PromotedMdastType,
  RawMdxFallbackMdast,
  WikiLinkMdast,
} from './mdast-augmentation.ts';

/**
 * Build the href for a wikiLink. Target slug + optional anchor fragment.
 * Stable across destinations: the href is a fragment identifier that
 * external destinations treat as an in-document anchor; OK-internal paste
 * back recovers structure from `data-target/anchor/alias`.
 */
function wikiLinkHref(target: string, anchor: string | null): string {
  const slug = toWikiLinkSlug(target);
  return anchor ? `#${slug}-${toWikiLinkSlug(anchor)}` : `#${slug}`;
}

const wikiLinkHandler: Handler = (state, node) => {
  const wiki = node as WikiLinkMdast;
  const { target, anchor, alias } = wiki.data;
  const result: Element = {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['wiki-link'],
      // `data-*` keys are camelCased in hast properties; rehype-stringify
      // emits them as kebab-case data attrs.
      dataTarget: target,
      dataAnchor: anchor ?? '',
      dataAlias: alias ?? '',
      href: wikiLinkHref(target, anchor),
    },
    // Emit children as hast text nodes — auto-escapes `<`, `>`, `&`, etc.
    // If the `children` array is empty (should not happen for well-formed
    // wikiLink per US-004, but defensive) fall back to the `value` field.
    children: wiki.children.length > 0 ? state.all(wiki) : [{ type: 'text', value: wiki.value }],
  };
  state.patch(node, result);
  return state.applyData(node, result);
};

/**
 * mdxJsxFlowElement → `<pre class="mdx-component"><code>{escaped raw}</code></pre>`.
 * The raw JSX source lives in `data.sourceRaw` per US-005. We render it
 * inside a `<code>` inside a `<pre>` so external destinations show a
 * legible monospaced block.
 */
const mdxJsxFlowHandler: Handler = (state, node) => {
  const jsx = node as MdxJsxFlowElement;
  const raw = typeof jsx.data?.sourceRaw === 'string' ? jsx.data.sourceRaw : '';
  const code: Element = {
    type: 'element',
    tagName: 'code',
    properties: {},
    // Hast text nodes auto-escape `<`, `>`, `&`, `"`, `'` via rehype-stringify.
    // This is the security-critical emission: raw JSX source NEVER becomes
    // hast `html` (which passes through unescaped).
    children: [{ type: 'text', value: raw }],
  };
  const pre: Element = {
    type: 'element',
    tagName: 'pre',
    properties: { className: ['mdx-component'] },
    children: [code],
  };
  state.patch(node, pre);
  return state.applyData(node, pre);
};

/**
 * mdxJsxTextElement → `<span class="mdx-inline">{escaped raw}</span>`.
 * Inline variant: we can't use a `<pre>` in phrasing context. The span
 * preserves the raw text inline; external destinations render it as
 * readable-but-inert source.
 */
const mdxJsxTextHandler: Handler = (state, node) => {
  const jsx = node as MdxJsxTextElement;
  const raw = typeof jsx.data?.sourceRaw === 'string' ? jsx.data.sourceRaw : '';
  const span: Element = {
    type: 'element',
    tagName: 'span',
    properties: { className: ['mdx-inline'] },
    children: [{ type: 'text', value: raw }],
  };
  state.patch(node, span);
  return state.applyData(node, span);
};

/**
 * rawMdxFallback → `<!-- Parse error: reason -->` (hast comment) followed
 * by `<pre class="mdx-fallback"><code>{escaped raw}</code></pre>`. Two
 * siblings returned as an array — mdast-util-to-hast splats arrays into
 * the parent's children stream.
 */
const rawMdxFallbackHandler: Handler = (state, node) => {
  const fb = node as RawMdxFallbackMdast;
  const reason = fb.data.reason || 'unknown';
  const raw = fb.value || '';
  const comment: Comment = {
    type: 'comment',
    value: ` Parse error: ${reason} `,
  };
  const code: Element = {
    type: 'element',
    tagName: 'code',
    properties: {},
    children: [{ type: 'text', value: raw }],
  };
  const pre: Element = {
    type: 'element',
    tagName: 'pre',
    properties: { className: ['mdx-fallback'] },
    children: [code],
  };
  state.patch(node, pre);
  const children: ElementContent[] = [comment, state.applyData(node, pre) as Element];
  return children;
};

/**
 * Registered mdast → hast handlers for the `PromotedMdastType` union.
 *
 * Typed as `Record<PromotedMdastType, Handler>` so TypeScript flags a
 * missing handler when a new type is added to `PROMOTED_MDAST_TYPES` —
 * the enforcement described in `mdast-augmentation.ts`. The alias cast
 * to `Handlers` at the export site is safe because `Handlers` is
 * `Record<string, Handler>` and our record's keys are all strings.
 */
const promotedHandlers: Record<PromotedMdastType, Handler> = {
  wikiLink: wikiLinkHandler,
  mdxJsxFlowElement: mdxJsxFlowHandler,
  mdxJsxTextElement: mdxJsxTextHandler,
  rawMdxFallback: rawMdxFallbackHandler,
};

/**
 * Export surface for `remark-rehype`'s `handlers` option inside
 * `mdast-to-html.ts`. Widens to the upstream `Handlers` shape.
 */
export const customNodeHandlers: Handlers = promotedHandlers;
