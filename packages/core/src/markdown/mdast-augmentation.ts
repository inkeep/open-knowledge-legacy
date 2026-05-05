/**
 * TypeScript module augmentation for custom mdast node types.
 *
 * This file is the **single canonical extension point** for adding custom
 * node types to `mdast`'s `RootContentMap`. Every custom type declared here
 * is visible to every consumer of mdast in the workspace (core, server,
 * app, docs) — every exhaustive `switch` on `Nodes` must handle them. The
 * broad blast radius is deliberate per architectural precedent #19(d):
 * custom nodes are promoted to first-class mdast types instead of lying as
 * `{type:'html',value}` passthrough, so downstream handlers can match them
 * with compile-time safety. Future custom nodes go here — do not augment
 * `mdast` from other files.
 *
 * MDX types (mdxJsxFlowElement, mdxJsxTextElement, etc.) are already
 * augmented by their respective remark packages (mdast-util-mdx-jsx,
 * mdast-util-mdx-expression). We extend those with a `sourceRaw` data
 * field for bit-exact round-trip of the literal MDX source (see precedent
 * #15(d)).
 *
 * Adding a new type:
 *   1. Declare the interface in this file.
 *   2. Add it to the `RootContentMap` augmentation block at the bottom.
 *   3. Add PM↔mdast handlers in `handlers.ts` + `index.ts`.
 *   4. Add mdast → markdown handler in `to-markdown-handlers.ts`.
 *   5. Add mdast → hast handler in `mdast-to-hast-handlers.ts`.
 *   6. Exhaustive `switch` sites need new `case` arms — the TS compiler
 *      will surface them when `RootContentMap` is augmented.
 */
import type { Position } from 'unist';

export const PROMOTED_MDAST_TYPES = [
  'wikiLink',
  'wikiLinkEmbed',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'rawMdxFallback',
  'mark',
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

export interface MarkMdast {
  type: 'mark';
  // biome-ignore lint/suspicious/noExplicitAny: see RootContentMap note above
  children: Array<any>;
  data?: {
    sourceForm?: 'mdx' | 'markdown';
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
    mark: MarkMdast;
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
