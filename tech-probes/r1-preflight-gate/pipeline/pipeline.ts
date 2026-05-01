/**
 * Unified pipeline factory. Single-source for parse + serialize so the probe
 * matches the spec's R3 composition.
 */

import { fromProseMirror, remarkProseMirror } from '@handlewithcare/remark-prosemirror';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { mdastToPmHandlers, pmToMdastMarkHandlers, pmToMdastNodeHandlers } from './handlers';
import { customMdToMdHandlers } from './md-handlers';
import { walkRecoverDelimiters } from './position-walker';
import { schema } from './schema';
import { remarkWikiLink } from './wiki-link';

// Parse: string → ProseMirror Node
export function parse(source: string): any {
  // Build processor with a walker plugin that attaches data.* from source positions
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkDirective)
    .use(remarkWikiLink)
    .use(() => walkRecoverDelimiters(source)) // runs as transformer
    .use(remarkProseMirror, { schema, handlers: mdastToPmHandlers } as any);

  const tree = processor.parse(source);
  const transformed = processor.runSync(tree);
  // The remarkProseMirror plugin sets the compiler; stringify to ProseMirror node
  const doc = (processor as any).stringify(transformed);
  return doc;
}

// Serialize: ProseMirror Node → string
export function serialize(doc: any): string {
  const mdast = fromProseMirror(doc, {
    nodeHandlers: pmToMdastNodeHandlers,
    markHandlers: pmToMdastMarkHandlers,
  });
  const processor = unified()
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkDirective)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      rule: '-',
      handlers: customMdToMdHandlers,
    } as any);
  return String(processor.stringify(mdast as any));
}
