/**
 * TypeScript module augmentation for custom mdast node types.
 *
 * MDX types (mdxJsxFlowElement, mdxJsxTextElement, etc.) are already augmented
 * by their respective remark packages (mdast-util-mdx-jsx, mdast-util-mdx-expression).
 *
 * We augment for: wiki-link node type, and sourceRaw data fields on MDX nodes.
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
  /**
   * WikiLinks are phrasing (inline) content at the micromark level (registered
   * as a `text` construct). Declared in RootContentMap rather than
   * PhrasingContentMap because the latter would add WikiLinkMdast to the
   * Nodes union, and WikiLinkMdast doesn't satisfy Nodes' structural
   * constraints — causing type errors in unist-util-visit callbacks.
   * RootContentMap makes wikiLink a valid mdast node type without breaking
   * the phrasing content type chain.
   */
  interface RootContentMap {
    wikiLink: WikiLinkMdast;
  }
}

// Augment MDX + directive node data interfaces with `sourceRaw` captured by the
// position-slice walker (US-008, D12 — byte-identical MDX round-trip).
declare module 'mdast-util-mdx-jsx' {
  interface MdxJsxFlowElementData {
    sourceRaw?: string;
  }
  interface MdxJsxTextElementData {
    sourceRaw?: string;
  }
}

declare module 'mdast-util-mdx-expression' {
  interface MdxFlowExpressionData {
    sourceRaw?: string;
  }
  interface MdxTextExpressionData {
    sourceRaw?: string;
  }
}

// mdxjsEsm augmentation removed (R4): agnostic mode never produces mdxjsEsm nodes.
// Directive augmentations removed (D14): remark-directive removed from pipeline.
