import type { Position } from 'unist';

export const PROMOTED_MDAST_TYPES = [
  'wikiLink',
  'wikiLinkEmbed',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'rawMdxFallback',
  'mark',
  'tag',
  'comment',
  'commentBlock',
  'footnoteReference',
  'footnoteDefinition',
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

export interface CommentMdast {
  type: 'comment';
  // biome-ignore lint/suspicious/noExplicitAny: see RootContentMap note above
  children: Array<any>;
  data?: {
    sourceForm?: 'percent' | 'html';
    [key: string]: unknown;
  };
  position?: Position;
}

export interface CommentBlockMdast {
  type: 'commentBlock';
  // biome-ignore lint/suspicious/noExplicitAny: see RootContentMap note above
  children: Array<any>;
  data?: {
    sourceForm?: 'percent' | 'html';
    sourceLayout?: 'inline' | 'block';
    [key: string]: unknown;
  };
  position?: Position;
}

export interface MarkMdast {
  type: 'mark';
  // biome-ignore lint/suspicious/noExplicitAny: see RootContentMap note above
  children: Array<any>;
  data?: { sourceRaw?: string; [key: string]: unknown };
  position?: Position;
}

export interface TagMdast {
  type: 'tag';
  value: string;
  data?: { sourceRaw?: string; [key: string]: unknown };
  position?: Position;
}

declare module 'mdast' {
  interface TextData {
    escapedChars?: Array<{ offset: number; char: string }>;
    sourceRaw?: string;
    entityRefSpans?: Array<{ offset: number; length: number; raw: string }>;
  }
  interface EmphasisData {
    sourceDelimiter?: '*' | '_';
  }
  interface StrongData {
    sourceDelimiter?: '**' | '__';
  }
  interface LinkData {
    sourceStyle?: string;
    sourceRaw?: string;
    sourceUrlForm?: 'angle-bracketed';
    sourceTitleMarker?: 'single' | 'double' | 'paren';
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
    sourceTrailingHashes?: number;
    sourceUnderlineLength?: number;
    sourceContiguousNext?: boolean;
  }
  interface CodeData {
    sourceFenceChar?: string;
    sourceFenceLength?: number;
    sourceStyle?: 'indented' | 'fenced';
  }
  interface InlineCodeData {
    sourceFenceChar?: string;
    sourceFenceLength?: number;
  }
  interface ListData {
    bulletMarker?: string;
    listMarkerDelimiter?: string;
  }
  interface BlockquoteData {
    sourceMarkerSpacings?: Array<'single' | 'none'>;
  }
  interface TableData {
    sourceDashCounts?: number[];
  }
  interface TableCellData {
    sourcePadding?: { left: number; right: number };
  }
  interface DefinitionData {
    sourceLayout?: 'multiline' | 'inline';
    sourceTitleMarker?: 'single' | 'double' | 'paren';
  }
  interface RootContentMap {
    wikiLink: WikiLinkMdast;
    rawMdxFallback: RawMdxFallbackMdast;
    wikiLinkEmbed: WikiLinkEmbedMdast;
    mark: MarkMdast;
    tag: TagMdast;
    comment: CommentMdast;
    commentBlock: CommentBlockMdast;
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
