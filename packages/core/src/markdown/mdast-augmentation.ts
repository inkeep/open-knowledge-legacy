/**
 * TypeScript module augmentation for custom mdast node types.
 *
 * MDX types (mdxJsxFlowElement, mdxJsxTextElement, etc.) and directive types
 * (containerDirective, leafDirective, textDirective) are already augmented by
 * their respective remark packages (remark-mdx, remark-directive).
 *
 * We only need to augment for our custom wiki-link node type.
 */

// Re-export for convenience in handler files
export type { Nodes, Parent, Root } from 'mdast';

// Wiki-link mdast node (produced by our micromark extension in US-006)
export interface WikiLinkMdast {
  type: 'wikiLink';
  target: string;
  alias: string | null;
  anchor: string | null;
  position?: import('unist').Position;
  data?: Record<string, unknown>;
}

declare module 'mdast' {
  interface PhrasingContentMap {
    wikiLink: WikiLinkMdast;
  }
}
