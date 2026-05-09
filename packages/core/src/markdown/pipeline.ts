/**
 * Unified pipeline factory.
 *
 * Parse direction (post-R17 chain, wired in `createParseProcessor` below):
 *   [R23 `protectFromMdx` pre-pass on source bytes]
 *     → remark-parse → remark-frontmatter → remarkMdxAgnostic
 *     → remark-gfm → remarkWikiLink
 *     → remarkGithubAlerts → `calloutTransformerPlugin`
 *        (US-010 / FR-7: GFM-alerts + Obsidian foldable → Callout mdxJsxFlow)
 *     → `restoreFromMdx` (Phase A: PUA sentinel → literal char)
 *     → `detailsAccordionPromoterPlugin`
 *        (US-011 / FR-8: HTML5 <details> → Accordion mdxJsxFlow)
 *     → `imagePromoterPlugin`
 *        (CommonMark `![alt](src)` → `<CommonMarkImage>` mdxJsxFlow compat)
 *     → `mergedPostParseWalkerPlugin` (Phase B: autolink promotion +
 *        doc-start thematic fix + position slice + unknown-mdast guard)
 *     → `ensureNonEmptyDoc` → remarkProseMirror
 *
 * Serialize direction:
 *   fromProseMirror → remark-stringify (with custom mdast-util-to-markdown handlers)
 *
 * Plugin order for parser extensions is empirically commutative (see
 * tech-probes/plugin-ordering/REPORT.md), but transformer ordering matters:
 * Phase A must run before Phase B (Phase B's autolink regex reads the literal
 * `<`/`>` that Phase A restores — see `merged-walker.ts` header + precedent
 * #16 in CLAUDE.md). Inside Phase B, position-slice runs AFTER all syntax
 * extensions produce their mdast (so positions are final) and the final
 * `remarkProseMirror` step reads `node.data.*` written by position-slice.
 *
 * R16 caching (spec 2026-04-16 markdown-pipeline-engineering-health):
 * processors are built once per MarkdownManager instance via
 * `createParseProcessor` / `createSerializeProcessor`, then reused across
 * every `parse()` / `serialize()` call. `parseMd` / `serializeMd` accept
 * the pre-built processor and run the stateless per-document work
 * (protectFromMdx, VFile binding, PM↔mdast conversion). The attacher for
 * `remarkMdxAgnostic` and `remarkWikiLink` is made idempotent under
 * re-entry via module-level singleton extension values, which means
 * pathological re-attach would not duplicate entries in `data()` arrays.
 */

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
import { commentPromoterPlugin } from './comment-promoter.ts';
import { detailsAccordionPromoterPlugin } from './details-accordion-promoter.ts';
import { highlightPromoterPlugin } from './highlight-promoter.ts';
import { imagePromoterPlugin } from './image-promoter.ts';
import { indentedCodePromoterPlugin } from './indented-code-promoter.ts';
import { mathPromoterPlugin } from './math-promoter.ts';
import { mergedPostParseWalkerPlugin } from './merged-walker.ts';
import { mermaidPromoterPlugin } from './mermaid-promoter.ts';
import { positionAwareBlankLineJoin } from './position-aware-join.ts';
import { remarkMdxAgnostic } from './remark-mdx-agnostic.ts';
import { singleDollarMathPromoterPlugin } from './single-dollar-math-promoter.ts';
import { remarkTags } from './tag-to-markdown.ts';
import { remarkWikiLink } from './wiki-link-micromark.ts';

interface PipelineOptions {
  schema: Schema;
  handlers: RemarkProseMirrorOptions['handlers'];
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
  toMarkdownHandlers?: Record<string, unknown>;
}

/** Options needed by `serializeMd` for the PM→mdast pre-pass. Kept separate
 * from the (pre-baked) processor so one cached serialize processor can serve
 * calls that share schema/handler registrations. */
interface SerializeMdOptions {
  schema: Schema;
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
}

function ensureNonEmptyDoc(tree: MdastRoot): MdastRoot {
  const renderable = tree.children.some((n) => {
    const type = (n as { type: string }).type;
    return type !== 'yaml' && type !== 'toml';
  });
  if (renderable) return tree;
  return {
    ...tree,
    children: [...tree.children, { type: 'paragraph', children: [] } as never],
  };
}

export const ACTIVE_MDAST_PLUGINS = [
  { name: 'remark-parse', plugin: remarkParse },
  { name: 'remark-frontmatter', plugin: remarkFrontmatter, options: ['yaml'] },
  { name: 'remark-mdx-agnostic', plugin: remarkMdxAgnostic },
  { name: 'remark-gfm', plugin: remarkGfm },
  { name: 'remark-math', plugin: remarkMath, options: { singleDollarTextMath: false } },
  { name: 'remark-wiki-link', plugin: remarkWikiLink },
  {
    name: 'remark-github-alerts',
    plugin: remarkGithubAlerts,
    options: REMARK_GITHUB_ALERTS_OPTIONS,
  },
  { name: 'callout-transformer', plugin: calloutTransformerPlugin },
  { name: 'restore-from-mdx', plugin: restoreFromMdx },
  { name: 'details-accordion-promoter', plugin: detailsAccordionPromoterPlugin },
  { name: 'image-promoter', plugin: imagePromoterPlugin },
  { name: 'indented-code-promoter', plugin: indentedCodePromoterPlugin },
  { name: 'math-promoter', plugin: mathPromoterPlugin },
  { name: 'single-dollar-math-promoter', plugin: singleDollarMathPromoterPlugin },
  { name: 'highlight-promoter', plugin: highlightPromoterPlugin },
  { name: 'mermaid-promoter', plugin: mermaidPromoterPlugin },
  { name: 'comment-promoter', plugin: commentPromoterPlugin },
  { name: 'merged-post-parse-walker', plugin: mergedPostParseWalkerPlugin },
  { name: 'ensure-non-empty-doc', plugin: () => ensureNonEmptyDoc },
] as const;

export function createParseProcessor(opts: PipelineOptions): Processor {
  let processor = unified() as unknown as Processor;
  for (const entry of ACTIVE_MDAST_PLUGINS) {
    const hasOptions = 'options' in entry && entry.options !== undefined;
    processor = (
      hasOptions
        ? // biome-ignore lint/suspicious/noExplicitAny: heterogeneous plugin entries can't be narrowed in iteration
          (processor as any).use(entry.plugin, entry.options)
        : // biome-ignore lint/suspicious/noExplicitAny: same
          (processor as any).use(entry.plugin)
    ) as Processor;
  }
  processor = (
    processor as unknown as {
      use(plugin: typeof remarkProseMirror, opts: RemarkProseMirrorOptions): Processor;
    }
  ).use(remarkProseMirror, {
    schema: opts.schema,
    handlers: opts.handlers,
  } as RemarkProseMirrorOptions);
  processor.freeze();
  return processor;
}

export function createSerializeProcessor(opts: PipelineOptions): Processor {
  const processor = unified()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { tablePipeAlign: false })
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkMdxAgnostic)
    .use(remarkWikiLink)
    .use(remarkTags)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      rule: '-',
      join: [positionAwareBlankLineJoin],
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
