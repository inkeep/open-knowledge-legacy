/**
 * TypeScript module augmentation for custom mdast node types.
 *
 * This file is the **single canonical extension point** for adding custom
 * node types to `mdast`'s `RootContentMap`. Every custom type declared here
 * is visible to every consumer of mdast in the workspace (core, server,
 * app, docs) — every exhaustive `switch` on `Nodes` must handle them. The
 * broad blast radius is deliberate per architectural precedent #15(d):
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

// Re-export for convenience in handler files
export type { Nodes, Parent, Root } from 'mdast';

import type { Position } from 'unist';

// Wiki-link mdast node. Shape per D7 (full first-class promotion, US-004):
// - `data.target/alias/anchor` drive the markdown `[[...]]` serialization via
//   wiki-link-micromark.ts's `wikiLinkHandler`.
// - `children: [{type:'text', value:label}]` feed the mdast-to-hast custom
//   handler (US-007) so clipboard HTML renders a visible `<a>label</a>`.
// - `value` carries the same display label for code that reads it directly
//   (e.g. remark-prosemirror mdast→PM handlers) and preserves backward
//   compatibility with callers that existed before US-004.
// `children` is required in the type so downstream consumers can rely on
// it, but the micromark `exitWikiLink` compile step assembles it from
// `data`-derived label text, so producers never synthesise it by hand.
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

// rawMdxFallback mdast node — first-class type per D7 / US-006. Holds the
// raw source bytes of a block whose MDX parse failed, along with metadata
// describing why and where. Shape mirrors wikiLink: `data` drives markdown
// serialization; `value` carries the raw source for the clipboard-HTML path
// in US-007. Children are intentionally absent — the raw source is opaque
// text, not structured phrasing content.
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
    rawMdxFallback: RawMdxFallbackMdast;
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
