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

import type { Position } from 'unist';

// Wiki-link mdast node (produced by our micromark extension in US-006).
// Runtime shape: target/alias/anchor live under `data`, matching
// the mdast-util-from-markdown enter/exit handlers in wiki-link-micromark.ts.
export interface WikiLinkMdast {
  type: 'wikiLink';
  value: string;
  data: {
    target: string;
    alias: string | null;
    anchor: string | null;
    [key: string]: unknown;
  };
  position?: Position;
}

declare module 'mdast' {
  interface TextData {
    escapedChars?: Array<{ offset: number; char: string }>;
  }
  interface EmphasisData {
    sourceDelimiter?: string;
  }
  interface StrongData {
    sourceDelimiter?: string;
  }
  interface LinkData {
    sourceStyle?: string;
  }
  interface ThematicBreakData {
    sourceRaw?: string;
  }
  interface BreakData {
    sourceStyle?: string;
  }
  interface HeadingData {
    sourceStyle?: string;
  }
  interface CodeData {
    sourceFenceChar?: string;
    sourceFenceLength?: number;
  }
  interface ListData {
    bulletMarker?: string;
    listMarkerDelimiter?: string;
  }
  /** Standalone `[[wiki]]` lines parse as root-level phrasing. */
  interface RootContentMap {
    wikiLink: WikiLinkMdast;
  }
}
