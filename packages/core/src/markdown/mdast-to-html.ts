/**
 * Shared mdast → HTML conversion for the canonical clipboard pipeline.
 *
 * Wraps `remark-rehype` (mdast → hast) → custom-node handlers → `rehype-stringify`
 * (hast → HTML string). Used by both WYSIWYG copy (via `clipboardSerializer`
 * subclassing `DOMSerializer`) and Source copy (via `EditorView.domEventHandlers`
 * on CM6). One canonical HTML rendering path across both views (FR-7, D2, D4,
 * D19-2 greenfield amendment).
 *
 * Two entry points:
 *
 * - `markdownToHtml(md)` — takes a markdown string, parses via the same
 *   unified remark pipeline used by `MarkdownManager.serialize` (remark-parse
 *   + remark-frontmatter + remark-gfm + remarkMdxAgnostic), then converts to
 *   HTML. Intended for Source copy, whose source CRDT IS the markdown text.
 *
 * - `mdastToHtml(tree)` — takes an already-parsed mdast Root. Intended for
 *   WYSIWYG copy, whose `clipboardSerializer` will first run PM→mdast via
 *   the existing `fromProseMirror` handlers and then call this directly,
 *   avoiding the string→mdast re-parse.
 *
 * Cross-view symmetry invariant: for the same selection expressed in both
 * views, `markdownToHtml(sourceView.sliceDoc(...))` and
 * `mdastToHtml(pmToMdast(wysiwygView.slice()))` produce byte-identical output.
 * This is exercised by US-014's simulateCopyAndRead E2E scenarios.
 *
 * Custom-node HTML emission: the `customNodeHandlers` table in
 * `mdast-to-hast-handlers.ts` is the registration point for wikiLink /
 * MDX JSX / rawMdxFallback HTML shapes. Empty at scaffold-time (US-003);
 * populated in US-007 once the mdast types are promoted (US-004..US-006).
 *
 * Outbound URL sanitization: `<a href>` / `<img src>` / `<link href>` /
 * `<area href>` / `<iframe src>` URLs are checked against an allowlist of
 * safe schemes before serialization. `javascript:`, `data:`, `vbscript:`,
 * `file:`, and any unknown scheme are stripped (attribute removed entirely).
 * Copy produces clipboard HTML for foreign destinations that may have
 * weaker sanitization than the editor's own surfaces, so URL schemes are
 * filtered at the boundary. The storage-layer NG4 ("render-time layers
 * sanitize") remains intact — this filter runs only on the copy-out path
 * and does not touch stored content.
 */

import type { Element, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { type Plugin, unified } from 'unified';
import { visit } from 'unist-util-visit';
import { customNodeHandlers } from './mdast-to-hast-handlers.ts';
import { remarkMdxAgnostic } from './remark-mdx-agnostic.ts';
import { isSafeUrl } from './safe-url.ts';
import { remarkWikiLink } from './wiki-link-micromark.ts';

/**
 * hast-walking plugin: strip dangerous URL schemes from attributes that
 * resolve to URLs. Runs AFTER remark-rehype converts mdast `link` / `image`
 * to hast `a` / `img`, so markdown `[x](javascript:...)` gets blocked
 * regardless of its mdast origin.
 */
const rehypeSanitizeUrls: Plugin<[], HastRoot> = () => {
  return (tree) => {
    visit(tree, 'element', (node: Element) => {
      const tag = node.tagName.toLowerCase();
      const props = node.properties;
      if (!props) return;
      // `href` lives on <a>, <area>, <link>, <base>. `src` lives on <img>,
      // <iframe>, <script>, <embed>, <source>, <audio>, <video>, <track>.
      // `action` lives on <form>. We don't emit <form> / <iframe> / <script>
      // / <embed> from our pipeline — but defend anyway in case a custom
      // handler ever passes them through.
      if (tag === 'a' || tag === 'area' || tag === 'link' || tag === 'base') {
        const href = props.href;
        if (typeof href === 'string' && !isSafeUrl(href)) {
          delete props.href;
        }
      }
      if (
        tag === 'img' ||
        tag === 'iframe' ||
        tag === 'script' ||
        tag === 'embed' ||
        tag === 'source' ||
        tag === 'audio' ||
        tag === 'video' ||
        tag === 'track'
      ) {
        const src = props.src;
        if (typeof src === 'string' && !isSafeUrl(src)) {
          delete props.src;
        }
      }
      if (tag === 'form') {
        const action = props.action;
        if (typeof action === 'string' && !isSafeUrl(action)) {
          delete props.action;
        }
      }
    });
  };
};

/**
 * Convert an mdast Root to an HTML string.
 *
 * The preferred entry point for WYSIWYG copy: the selection's mdast tree
 * is produced once by `fromProseMirror`, then this function runs the
 * mdast → hast → HTML half of the round-trip.
 */
export function mdastToHtml(tree: MdastRoot): string {
  // Single chained processor mirrors `markdownToHtml` below. `remark-rehype`
  // transforms mdast → hast; `rehypeSanitizeUrls` strips dangerous URL
  // schemes on the hast side; `rehype-stringify` compiles hast → string.
  // `allowDangerousHtml` is NOT enabled, so rehype-stringify drops hast
  // `raw` nodes (literal `<script>` passthrough etc.). Element-level
  // `<script>` / `<iframe>` / `<svg>` injection is handled that way;
  // attribute-level URL-scheme injection (`href="javascript:..."`) is
  // handled by `rehypeSanitizeUrls`.
  const processor = unified()
    .use(remarkRehype, { handlers: customNodeHandlers })
    .use(rehypeSanitizeUrls)
    .use(rehypeStringify);
  const hast = processor.runSync(tree) as unknown as HastRoot;
  return String(processor.stringify(hast));
}

/**
 * Convert a markdown string to an HTML string.
 *
 * The preferred entry point for Source copy: CM6's `sliceDoc(from, to)` yields
 * a markdown string directly; this function parses it through the same remark
 * pipeline the rest of the repo uses and then converts to HTML.
 *
 * Frontmatter, GFM, and MDX-agnostic parsing are enabled so the parse surface
 * matches what `MarkdownManager.serialize` produces on the way out. Crucially
 * this keeps cross-view symmetry: the markdown that WYSIWYG copy emits to
 * `text/plain` parses identically here, so the `text/html` output agrees.
 */
export function markdownToHtml(md: string): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdxAgnostic)
    .use(remarkGfm)
    // wiki-link micromark MUST be registered so `[[Target#anchor|Alias]]` in
    // the markdown string gets parsed into first-class `wikiLink` mdast nodes
    // that `customNodeHandlers` can then render as `<a class="wiki-link">`.
    // Without this, Source copy + WYSIWYG copy (which both route through
    // `markdownToHtml`) emit literal `[[...]]` text and lose wiki-link
    // fidelity in the outbound text/html payload.
    .use(remarkWikiLink)
    .use(remarkRehype, { handlers: customNodeHandlers })
    .use(rehypeSanitizeUrls)
    .use(rehypeStringify);
  return String(processor.processSync(md));
}
