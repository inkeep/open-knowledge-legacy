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
 */

import type { Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { customNodeHandlers } from './mdast-to-hast-handlers.ts';
import { remarkMdxAgnostic } from './remark-mdx-agnostic.ts';

/**
 * Convert an mdast Root to an HTML string.
 *
 * The preferred entry point for WYSIWYG copy: the selection's mdast tree
 * is produced once by `fromProseMirror`, then this function runs the
 * mdast → hast → HTML half of the round-trip.
 */
export function mdastToHtml(tree: MdastRoot): string {
  // Two processors by design: the transformer stage (remark-rehype) runs on
  // mdast and produces hast, and the compiler stage (rehype-stringify) runs
  // on hast and produces a string. unified's type parameters make expressing
  // "one processor, two different tree shapes" awkward — splitting is cleaner
  // than juggling generic annotations.
  const mdastToHastProcessor = unified().use(remarkRehype, {
    handlers: customNodeHandlers,
    // Markdown `<script>` HTML passthrough stays as hast `raw` nodes —
    // `allowDangerousHtml` is NOT enabled, so `rehype-stringify` drops them.
    // This matches D10 / NG7: no paste-time DOMPurify needed, because the
    // pipeline structurally drops script content on the way out too.
  });
  const hast = mdastToHastProcessor.runSync(tree) as unknown as HastRoot;
  const hastToHtmlProcessor = unified().use(rehypeStringify);
  return String(hastToHtmlProcessor.stringify(hast));
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
    .use(remarkRehype, { handlers: customNodeHandlers })
    .use(rehypeStringify);
  return String(processor.processSync(md));
}
