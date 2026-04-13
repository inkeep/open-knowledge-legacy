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
import type { Root as MdastRoot } from 'mdast';
import type { Node as PmNode, Schema } from 'prosemirror-model';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

// Ensure mdast type augmentations are loaded
import './mdast-augmentation.ts';

export interface PipelineOptions {
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
 * Parse a markdown string to a ProseMirror document node.
 */
export function parseMd(source: string, opts: PipelineOptions): PmNode {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdx)
    .use(remarkDirective)
    .use(remarkGfm)
    // Position-slice walker slot: plugged in by US-003
    .use(remarkProseMirror, {
      schema: opts.schema,
      handlers: opts.handlers,
    } as RemarkProseMirrorOptions);

  const tree = processor.parse(source);
  const transformed = processor.runSync(tree);
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
