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
 */
const KNOWN_TYPES: ReadonlySet<string> = new Set([
  // Core mdast
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
  // Frontmatter (remark-prosemirror ignores silently)
  'yaml',
  'toml',
  // GFM
  'table',
  'tableRow',
  'tableCell',
  'delete',
  'footnoteDefinition',
  'footnoteReference',
  // MDX agnostic mode
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  // Our wiki-link micromark extension
  'wikiLink',
  // Known-possible types registered with catch-all handlers in index.ts
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
    if (!KNOWN_TYPES.has(child.type)) {
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

function toRawMdxFallbackMdast(node: WalkableNode, source: string): RawMdxFallbackMdast {
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

/**
 * Type-safe access for the handler table — imported by `buildMdastToPmHandlers`
 * in index.ts.
 */
export type RawMdxFallbackMdastNode = RawMdxFallbackMdast;
