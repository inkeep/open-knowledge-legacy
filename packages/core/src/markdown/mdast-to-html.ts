
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

const rehypeSanitizeUrls: Plugin<[], HastRoot> = () => {
  return (tree) => {
    visit(tree, 'element', (node: Element) => {
      const tag = node.tagName.toLowerCase();
      const props = node.properties;
      if (!props) return;
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

export function mdastToHtml(tree: MdastRoot): string {
  const processor = unified()
    .use(remarkRehype, { handlers: customNodeHandlers })
    .use(rehypeSanitizeUrls)
    .use(rehypeStringify);
  const hast = processor.runSync(tree) as unknown as HastRoot;
  return String(processor.stringify(hast));
}

export function markdownToHtml(md: string): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdxAgnostic)
    .use(remarkGfm)
    .use(remarkWikiLink)
    .use(remarkRehype, { handlers: customNodeHandlers })
    .use(rehypeSanitizeUrls)
    .use(rehypeStringify);
  return String(processor.processSync(md));
}
