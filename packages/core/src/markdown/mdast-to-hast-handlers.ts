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
 *   </code></pre>` for capitalized JSX. Lowercase HTML primitives whose
 *   name matches a registered tag (`img` / `video` / `audio`) take a
 *   different path: they emit a native hast element with the JSX
 *   attributes as hast properties, so cross-app paste targets render
 *   real images / video / audio instead of an escaped MDX source block.
 *   URL-scheme sanitization downstream (mdast-to-html.ts:rehypeSanitizeUrls)
 *   strips `javascript:` / `data:` / etc. from `src`, preserving the
 *   FR-20 boundary even for native emission.
 *
 *   The `<pre>` fallback shape injects `data.sourceRaw` as a hast `text`
 *   node so `rehype-stringify` auto-escapes the literal `<`, `>`, `&`,
 *   `"`, `'` — never as hast `html` (which passes through unescaped).
 *   Adversarial content inside a capitalized JSX component survives
 *   verbatim but NEVER re-enters the HTML-parse world with special
 *   meaning.
 *
 * - `mdxJsxTextElement` → `<span class="mdx-inline">{escaped raw}</span>`,
 *   with the same lowercase HTML-primitive carve-out as the flow handler.
 *   Inline JSX appears as a readable-but-inert span in external
 *   destinations (Gmail, Slack); inline `<img>` emits as native `<img>`.
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

import type { Comment, Element, ElementContent, Properties } from 'hast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import type { Handler, Handlers } from 'mdast-util-to-hast';
import { toWikiLinkSlug } from '../utils/slug.ts';
import type {
  PromotedMdastType,
  RawMdxFallbackMdast,
  WikiLinkEmbedMdast,
  WikiLinkMdast,
} from './mdast-augmentation.ts';

/**
 * MDX JSX element names that map 1:1 to an HTML primitive emit native hast
 * elements instead of the `<pre class="mdx-component">` source-as-code
 * fallback shape. Adding a new lowercase canonical descriptor whose name
 * matches an HTML tag requires appending it here so its descriptor identity
 * survives clipboard emission to cross-app destinations. Capitalized JSX
 * names (Callout, Accordion, custom components) and lowercase tags NOT in
 * this set fall through to the `<pre>` shape — the gate is set-membership,
 * not lowercase detection.
 *
 * Sister set in `autolink-void-html-guard.ts` — `LOWERCASE_JSX_CANONICAL_TAGS` —
 * gates which lowercase tags reach remark-mdx as JSX (vs PUA-protected as
 * raw HTML text). The two sets currently coincide for the v1 5-pack but
 * serve distinct purposes; a tag is membership-relevant here only if it
 * already passes through that PUA-guard exemption.
 */
const HTML_PRIMITIVE_TAGS = new Set(['img', 'video', 'audio']);

/**
 * Try to render an MDX JSX element as its native HTML primitive (real
 * `<img>` / `<video>` / `<audio>`). Returns null when the element name
 * isn't a registered primitive, OR when any attribute is a spread
 * (`{...rest}`) or expression value (`width={400}`) — those can't faithfully
 * render as static HTML attributes, so we fall back to the `<pre>` shape
 * which preserves the source bytes verbatim. URL-scheme sanitization runs
 * as a downstream rehype plugin, so dangerous `src` schemes are stripped
 * after this helper returns the hast element.
 */
function tryNativeHtmlPrimitive(node: MdxJsxFlowElement | MdxJsxTextElement): Element | null {
  const name = node.name;
  if (!name || !HTML_PRIMITIVE_TAGS.has(name)) return null;
  // hast property keys carry the MDX-JSX attribute name verbatim (`autoPlay`,
  // `playsInline`, `crossOrigin`). hast-util-to-html's html schema looks each
  // one up in property-information's table and emits the canonical lowercase
  // HTML attribute (`autoplay`, `playsinline`, `crossorigin`) at serialize
  // time, so we don't pre-translate here.
  const properties: Properties = {};
  for (const attr of node.attributes) {
    if (attr.type !== 'mdxJsxAttribute') return null;
    if (attr.value === null) {
      properties[attr.name] = true;
    } else if (typeof attr.value === 'string') {
      properties[attr.name] = attr.value;
    } else {
      return null;
    }
  }
  return { type: 'element', tagName: name, properties, children: [] };
}

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

// SPEC §6 FR-3c: wikiLinkEmbed → `<a class="wiki-embed" data-*>`. Renders
// as an anchor (not an `<img>`) at the hast layer so the clipboard HTML
// round-trip lands a detectable shape that PM's DOMParser can reconstruct
// as a wikiLinkEmbed node. Actual image/video/pdf display happens in the
// WYSIWYG renderer at the PM layer based on target extension (D-F).
const wikiLinkEmbedHandler: Handler = (state, node) => {
  const embed = node as WikiLinkEmbedMdast;
  const { target, anchor, alias } = embed.data;
  const result: Element = {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['wiki-embed'],
      dataTarget: target,
      dataAnchor: anchor ?? '',
      dataAlias: alias ?? '',
      href: wikiLinkHref(target, anchor),
    },
    children: embed.children.length > 0 ? state.all(embed) : [{ type: 'text', value: embed.value }],
  };
  state.patch(node, result);
  return state.applyData(node, result);
};

/**
 * mdxJsxFlowElement → either a native HTML primitive (when the element
 * name is in HTML_PRIMITIVE_TAGS) or the `<pre class="mdx-component">`
 * source-as-code fallback shape for capitalized JSX. The native path
 * makes lowercase media descriptors paste as real images / video / audio
 * in cross-app destinations.
 */
const mdxJsxFlowHandler: Handler = (state, node) => {
  const jsx = node as MdxJsxFlowElement;
  const native = tryNativeHtmlPrimitive(jsx);
  if (native) {
    state.patch(node, native);
    return state.applyData(node, native);
  }
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
 * mdxJsxTextElement → either a native HTML primitive (lowercase media)
 * or the `<span class="mdx-inline">` fallback for capitalized inline
 * JSX. The span preserves the raw text inline as readable-but-inert
 * source for external destinations.
 */
const mdxJsxTextHandler: Handler = (state, node) => {
  const jsx = node as MdxJsxTextElement;
  const native = tryNativeHtmlPrimitive(jsx);
  if (native) {
    state.patch(node, native);
    return state.applyData(node, native);
  }
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
  // Defense-in-depth: rehype-stringify emits hast `comment.value` verbatim
  // per the HTML spec (no entity encoding inside comments). If `reason`
  // contained `-->` it would prematurely close the comment. Error messages
  // from the MDX parser don't surface `-->` in practice, but we normalize
  // any `--` pair to an em-dash so the comment cannot break its own shape
  // regardless of what the underlying parser throws.
  const safeReason = reason.replace(/--/g, '\u2014');
  const comment: Comment = {
    type: 'comment',
    value: ` Parse error: ${safeReason} `,
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
  wikiLinkEmbed: wikiLinkEmbedHandler,
  mdxJsxFlowElement: mdxJsxFlowHandler,
  mdxJsxTextElement: mdxJsxTextHandler,
  rawMdxFallback: rawMdxFallbackHandler,
};

/**
 * Export surface for `remark-rehype`'s `handlers` option inside
 * `mdast-to-html.ts`. Widens to the upstream `Handlers` shape.
 */
export const customNodeHandlers: Handlers = promotedHandlers;
