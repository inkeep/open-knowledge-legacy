/**
 * R8 wildcard catch-all for unknown mdast types.
 *
 * ## Why this exists
 *
 * `@handlewithcare/remark-prosemirror` dispatches each mdast node via a
 * `zwitch` keyed on `node.type`. For any type not in the handlers map and not
 * in the library's internal ignore list (yaml/toml/definition/footnoteDefinition),
 * its built-in `unknown()` **throws** `Error("unknown markdown node: X")`.
 *
 * That throw carries no `.place`/`.offset`, so parseWithFallback's
 * `extractErrorOffset` returns `undefined` and the entire document degrades to
 * whole-doc raw-text fallback — the behavior SPEC R8 explicitly forbids ("any
 * unknown type degrades to block-level fallback, preserving structure").
 *
 * This plugin pre-walks the mdast tree and replaces any node whose `type` is
 * not in the known set with a synthetic `rawMdxFallbackMdast` node carrying
 * the original type + source slice. The handler table registers an explicit
 * handler for `rawMdxFallbackMdast` that emits a PM `rawMdxFallback` node —
 * same shape as if R6 had split that block out.
 *
 * ## Precedence with R6
 *
 * R6's split-then-rejoin handles parse-time failures that carry a position.
 * This guard handles *post-parse* failures — the mdast tree parsed cleanly but
 * contains a type remark-prosemirror can't materialize. The two paths
 * complement each other: R6 catches VFileMessage from mdast-util-mdx-jsx
 * (tokenizer/tree-build), this guard catches "unknown mdast type at dispatch
 * time" (e.g., future remark-gfm adding a new type, custom remark plugins).
 *
 * ## Order
 *
 * Must run AFTER `positionSlicePlugin` (so `node.data.sourceRaw` and
 * `node.position` are final) and BEFORE `remarkProseMirror` (so the zwitcher
 * never sees an unknown type).
 *
 * ## Known-type enumeration
 *
 * The list below enumerates every mdast type our pipeline can produce:
 * - core mdast (remark-parse)
 * - remark-frontmatter (yaml/toml — silently ignored by remark-prosemirror)
 * - remark-gfm (table/tableRow/tableCell/delete/footnote*)
 * - remark-mdx in agnostic mode (mdxFlow/Text Expression + Jsx + NOT mdxjsEsm)
 * - our custom wikiLink
 *
 * Any addition to the pipeline (new plugin, updated remark-gfm version) that
 * produces a new type will be routed through the catch-all. The dedicated
 * test `unknown-mdast-guard.test.ts` seeds a synthetic unknown type and asserts
 * the catch-all fires instead of the whole-doc fallback.
 */

import type { Root as MdastRoot } from 'mdast';
import type { VFile } from 'vfile';

/**
 * Types produced by our pipeline (or silently ignored by remark-prosemirror's
 * built-in ignore list). Everything else is routed to the catch-all.
 *
 * ## How to update this list
 *
 * When adding a new remark plugin to the pipeline (`pipeline.ts`), check its
 * mdast-util output and add the new types here (grouped by plugin). Omitting
 * a type is NOT silently dropped — unknown types get substituted with
 * `rawMdxFallbackMdast` (the safe default), which produces a visible
 * fallback node instead of structured output. Graceful degradation, but
 * still a UX regression for users of the new plugin.
 *
 * Plugin → types mapping (keep synced with `pipeline.ts`):
 *   - `remark-parse` (mdast core) → root, paragraph, heading, text, emphasis,
 *     strong, blockquote, list, listItem, code, inlineCode, link, image,
 *     linkReference, imageReference, definition, html, thematicBreak, break
 *   - `remark-frontmatter` (`yaml` profile) → yaml, toml — silently ignored
 *     by `@handlewithcare/remark-prosemirror`'s built-in ignore list
 *   - `remark-gfm` (via `mdast-util-gfm`) → table, tableRow, tableCell,
 *     delete (strikethrough), footnoteDefinition, footnoteReference
 *   - `remark-mdx-agnostic` (via `mdast-util-mdx` under agnostic micromark) →
 *     mdxFlowExpression, mdxJsxFlowElement, mdxJsxTextElement, mdxTextExpression
 *     (NOT mdxjsEsm — agnostic mode drops acorn, so ESM re-parses as prose)
 *   - `wiki-link-micromark.ts` (our extension) → wikiLink
 *   - Handler-registered catch-all types in `index.ts:buildMdastToPmHandlers`:
 *     math, inlineMath (registered preemptively so a future remark-math
 *     addition degrades gracefully)
 *   - Our internal fallback marker: rawMdxFallbackMdast
 */
export const KNOWN_MDAST_TYPES: ReadonlySet<string> = new Set([
  // remark-parse (mdast core)
  'root',
  'paragraph',
  'heading',
  'text',
  'emphasis',
  'strong',
  'blockquote',
  'list',
  'listItem',
  'code',
  'inlineCode',
  'link',
  'image',
  'linkReference',
  'imageReference',
  'definition',
  'html',
  'thematicBreak',
  'break',
  // remark-frontmatter (remark-prosemirror ignores silently)
  'yaml',
  'toml',
  // remark-gfm (mdast-util-gfm)
  'table',
  'tableRow',
  'tableCell',
  'delete',
  'footnoteDefinition',
  'footnoteReference',
  // remark-mdx-agnostic (mdast-util-mdx under agnostic micromark)
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  // Our wiki-link-micromark.ts extension
  'wikiLink',
  // Handler-registered catch-all types in index.ts (future remark-math compat)
  'math',
  'inlineMath',
  // Our internal fallback marker
  'rawMdxFallbackMdast',
]);

/**
 * unified plugin: walks the mdast tree and substitutes any unknown-type node
 * with `rawMdxFallbackMdast`. Preserves node position + captures source slice.
 */
export function unknownMdastGuardPlugin() {
  return (tree: MdastRoot, file: VFile) => {
    const source = String(file.value ?? '');
    walk(tree as unknown as WalkableNode, source);
  };
}

interface WalkableNode {
  type?: string;
  children?: unknown[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
}

function walk(node: WalkableNode | null | undefined, source: string): void {
  if (!node || typeof node !== 'object') return;
  if (!Array.isArray(node.children)) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i] as WalkableNode;
    if (!child || typeof child !== 'object' || typeof child.type !== 'string') continue;
    if (!KNOWN_MDAST_TYPES.has(child.type)) {
      node.children[i] = toRawMdxFallbackMdast(child, source);
    } else {
      walk(child, source);
    }
  }
}

interface RawMdxFallbackMdast {
  type: 'rawMdxFallbackMdast';
  originalType: string;
  value: string;
  position?: WalkableNode['position'];
}

/**
 * Replace an unknown-type mdast node with a `rawMdxFallbackMdast` carrying the
 * node's source slice. Exported for use in the R17 merged post-parse walker;
 * the standalone plugin below wraps the same substitution for legacy callers
 * and unit tests.
 */
export function toRawMdxFallbackMdast(node: WalkableNode, source: string): RawMdxFallbackMdast {
  const start = node.position?.start?.offset ?? 0;
  const end = node.position?.end?.offset ?? 0;
  const sourceSlice = end > start ? source.slice(start, end) : '';
  return {
    type: 'rawMdxFallbackMdast',
    originalType: node.type ?? 'unknown',
    value: sourceSlice || (node.type ?? 'unknown'),
    position: node.position,
  };
}
