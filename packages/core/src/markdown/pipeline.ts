import {
  type FromProseMirrorOptions,
  fromProseMirror,
  type RemarkProseMirrorOptions,
  remarkProseMirror,
} from '@handlewithcare/remark-prosemirror';
import type { Node as PmNode, Schema } from '@tiptap/pm/model';
import type { Root as MdastRoot } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkGithubAlerts from 'remark-github-alerts';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { type Processor, unified } from 'unified';
import { VFile } from 'vfile';

import './mdast-augmentation.ts';
import { protectFromMdx, restoreFromMdx } from './autolink-void-html-guard.ts';
import { calloutTransformerPlugin, REMARK_GITHUB_ALERTS_OPTIONS } from './callout-transformer.ts';
import { detailsAccordionPromoterPlugin } from './details-accordion-promoter.ts';
import { highlightPromoterPlugin } from './highlight-promoter.ts';
import { imagePromoterPlugin } from './image-promoter.ts';
import { mathPromoterPlugin } from './math-promoter.ts';
import { mergedPostParseWalkerPlugin } from './merged-walker.ts';
import { remarkMdxAgnostic } from './remark-mdx-agnostic.ts';
import { singleDollarMathPromoterPlugin } from './single-dollar-math-promoter.ts';
import { remarkWikiLink } from './wiki-link-micromark.ts';

interface PipelineOptions {
  schema: Schema;
  handlers: RemarkProseMirrorOptions['handlers'];
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
  toMarkdownHandlers?: Record<string, unknown>;
}

interface SerializeMdOptions {
  schema: Schema;
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
}

function ensureNonEmptyDoc(tree: MdastRoot): MdastRoot {
  const renderable = tree.children.some((n) => {
    const type = (n as { type: string }).type;
    return type !== 'yaml' && type !== 'toml' && type !== 'footnoteDefinition';
  });
  if (renderable) return tree;
  return {
    ...tree,
    children: [...tree.children, { type: 'paragraph', children: [] } as never],
  };
}

export function createParseProcessor(opts: PipelineOptions): Processor {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdxAgnostic)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkWikiLink)
    .use(remarkGithubAlerts, REMARK_GITHUB_ALERTS_OPTIONS)
    .use(calloutTransformerPlugin)
    .use(restoreFromMdx) // Phase A
    .use(detailsAccordionPromoterPlugin)
    .use(imagePromoterPlugin)
    .use(mathPromoterPlugin)
    .use(singleDollarMathPromoterPlugin)
    .use(highlightPromoterPlugin)
    .use(mergedPostParseWalkerPlugin) // Phase B
    .use(() => ensureNonEmptyDoc) // Guard empty-doc edge case (see fn docs)
    .use(remarkProseMirror, {
      schema: opts.schema,
      handlers: opts.handlers,
    } as RemarkProseMirrorOptions);
  processor.freeze();
  return processor as unknown as Processor;
}

export function createSerializeProcessor(opts: PipelineOptions): Processor {
  const processor = unified()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkMdxAgnostic)
    .use(remarkWikiLink)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      rule: '-',
      ...(opts.toMarkdownHandlers ? { handlers: opts.toMarkdownHandlers } : {}),
    });
  processor.freeze();
  return processor as unknown as Processor;
}

export function parseMd(source: string, processor: Processor): PmNode {
  const protected_ = protectFromMdx(source);

  const file = new VFile(protected_);
  const tree = processor.parse(file);
  file.value = source;
  const transformed = processor.runSync(tree, file);
  return (processor as unknown as { stringify(tree: unknown): PmNode }).stringify(transformed);
}

export function parseMdToMdast(source: string, processor: Processor): MdastRoot {
  const protected_ = protectFromMdx(source);
  const file = new VFile(protected_);
  const tree = processor.parse(file);
  file.value = source;
  return processor.runSync(tree, file) as MdastRoot;
}

export function serializeMd(doc: PmNode, processor: Processor, opts: SerializeMdOptions): string {
  const mdast: MdastRoot = fromProseMirror(doc, {
    schema: opts.schema,
    nodeHandlers: opts.pmNodeHandlers,
    markHandlers: opts.pmMarkHandlers,
  });

  return String(processor.stringify(mdast));
}
