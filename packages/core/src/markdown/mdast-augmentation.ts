import type { Position } from 'unist';

export const PROMOTED_MDAST_TYPES = [
  'wikiLink',
  'wikiLinkEmbed',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'rawMdxFallback',
] as const;

export type PromotedMdastType = (typeof PROMOTED_MDAST_TYPES)[number];

export interface WikiLinkMdast {
  type: 'wikiLink';
  value: string;
  data: {
    target: string;
    alias: string | null;
    anchor: string | null;
    [key: string]: unknown;
  };
  children: Array<{ type: 'text'; value: string }>;
  position?: Position;
}

export interface WikiLinkEmbedMdast {
  type: 'wikiLinkEmbed';
  value: string;
  data: {
    target: string;
    alias: string | null;
    anchor: string | null;
    [key: string]: unknown;
  };
  children: Array<{ type: 'text'; value: string }>;
  position?: Position;
}

export interface RawMdxFallbackMdast {
  type: 'rawMdxFallback';
  value: string;
  data: {
    reason: string;
    originalSpan: { start: number; end: number };
    [key: string]: unknown;
  };
  position?: Position;
}

declare module 'mdast' {
  interface TextData {
    escapedChars?: Array<{ offset: number; char: string }>;
    sourceRaw?: string;
  }
  interface EmphasisData {
    sourceDelimiter?: string;
  }
  interface StrongData {
    sourceDelimiter?: string;
  }
  interface LinkData {
    sourceStyle?: string;
    sourceRaw?: string;
  }
  interface LinkReferenceData {
    sourceRaw?: string;
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
  interface RootContentMap {
    wikiLink: WikiLinkMdast;
    rawMdxFallback: RawMdxFallbackMdast;
    wikiLinkEmbed: WikiLinkEmbedMdast;
  }
}

declare module 'mdast-util-mdx-jsx' {
  interface MdxJsxFlowElementData {
    sourceRaw?: string;
    htmlBoundary?: { opener: string; closer: string };
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
