/**
 * Unified pipeline factory.
 *
 * Parse direction:
 *   remark-parse → remark-frontmatter → remark-mdx → remark-directive →
 *   remark-gfm → [position-slice walker slot] → remarkProseMirror
 *
 * Serialize direction:
 *   fromProseMirror → remark-stringify (with custom mdast-util-to-markdown handlers)
 *
 * Plugin order for parser extensions is empirically commutative (see
 * tech-probes/plugin-ordering/REPORT.md), but transformer ordering matters:
 * position-slice walker runs AFTER all syntax extensions produce their mdast
 * (so positions are final) and BEFORE remarkProseMirror (so handlers read
 * node.data.*).
 */

import {
  type FromProseMirrorOptions,
  fromProseMirror,
  type RemarkProseMirrorOptions,
  remarkProseMirror,
} from '@handlewithcare/remark-prosemirror';
import type { Node as PmNode, Schema } from '@tiptap/pm/model';
import type { Root as MdastRoot } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { VFile } from 'vfile';

// Ensure mdast type augmentations are loaded
import './mdast-augmentation.ts';
import { autolinkPromotionPlugin } from './autolink-promotion.ts';
import { protectFromMdx, restoreFromMdx } from './autolink-void-html-guard.ts';
import { docStartThematicFixPlugin } from './doc-start-thematic-fix.ts';
import { positionSlicePlugin } from './position-slice.ts';
import { remarkWikiLink } from './wiki-link-micromark.ts';

interface PipelineOptions {
  schema: Schema;
  /** mdast → PM handlers (keyed by mdast node type) */
  handlers: RemarkProseMirrorOptions['handlers'];
  /** PM → mdast node handlers (keyed by PM node type name) */
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  /** PM → mdast mark handlers (keyed by PM mark type name) */
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
  /** Custom mdast-util-to-markdown handlers for fidelity (wired in US-005) */
  toMarkdownHandlers?: Record<string, unknown>;
}

/**
 * Ensure the mdast tree has at least one renderable block. remark-prosemirror
 * maps certain mdast types to `ignore` by default (yaml, toml, definition,
 * footnoteDefinition — see §19.1) or via our registered handlers. When the
 * source consists solely of ignore-typed nodes (e.g., `---\n\n---` parses as
 * empty YAML frontmatter; `[a]: url` is only a link definition), the PM doc
 * would have zero children and `doc.content: 'block+'` validation would throw
 * `Invalid content for node doc: <>`. Inject an empty paragraph so parse()
 * always returns a valid PM doc — a real user document with only definitions
 * would still editable as a blank page with those definitions preserved on
 * serialize via the `linkDefinition` PM atom handler (R12) and frontmatter
 * Y.Map bridge.
 *
 * mdast types that remark-prosemirror's `toProseMirror` filters out (either
 * via default ignore or via user-registered ignore mappings):
 *   - yaml, toml (frontmatter — handled via Y.Map on observer sync path)
 *   - definition, footnoteDefinition (linkDefinition PM atom is registered
 *     but not every caller uses it; default is ignore)
 *
 * This guard runs on the mdast tree BEFORE remark-prosemirror dispatch, so
 * we never encounter the `createAndFill` failure.
 */
function ensureNonEmptyDoc(tree: MdastRoot): MdastRoot {
  const renderable = tree.children.some((n) => {
    const type = (n as { type: string }).type;
    // Known ignore-only mdast types — list must stay in sync with
    // remark-prosemirror's default ignores + any explicit ignores we register.
    return type !== 'yaml' && type !== 'toml' && type !== 'footnoteDefinition';
  });
  if (renderable) return tree;
  // Synthesize an empty paragraph alongside existing ignore-typed nodes.
  return {
    ...tree,
    children: [...tree.children, { type: 'paragraph', children: [] } as never],
  };
}

/**
 * Parse a markdown string to a ProseMirror document node.
 */
export function parseMd(source: string, opts: PipelineOptions): PmNode {
  // R23: Protect autolinks and void HTML from remark-mdx claiming
  const protected_ = protectFromMdx(source);

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdx)
    .use(remarkDirective)
    .use(remarkGfm)
    .use(remarkWikiLink)
    .use(restoreFromMdx) // R23: Restore protected patterns after MDX parsing
    .use(autolinkPromotionPlugin) // Promote <scheme:uri> text → semantic link nodes
    .use(docStartThematicFixPlugin) // NG10: empty yaml at doc-start → thematicBreak
    .use(positionSlicePlugin)
    .use(() => ensureNonEmptyDoc) // Guard empty-doc edge case (see fn docs)
    .use(remarkProseMirror, {
      schema: opts.schema,
      handlers: opts.handlers,
    } as RemarkProseMirrorOptions);

  // Create VFile so the position-slice walker can access the ORIGINAL source text
  // (not the protected version) for accurate position slicing
  const file = new VFile(protected_);
  const tree = processor.parse(file);
  // Override file.value with original source for position-slice walker
  file.value = source;
  const transformed = processor.runSync(tree, file);
  const doc = (processor as unknown as { stringify(tree: unknown): PmNode }).stringify(transformed);
  return doc;
}

/**
 * Serialize a ProseMirror document node to a markdown string.
 */
export function serializeMd(doc: PmNode, opts: PipelineOptions): string {
  const mdast: MdastRoot = fromProseMirror(doc, {
    schema: opts.schema,
    nodeHandlers: opts.pmNodeHandlers,
    markHandlers: opts.pmMarkHandlers,
  });

  const processor = unified()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkDirective)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      rule: '-',
      ...(opts.toMarkdownHandlers ? { handlers: opts.toMarkdownHandlers } : {}),
    });

  return String(processor.stringify(mdast));
}
