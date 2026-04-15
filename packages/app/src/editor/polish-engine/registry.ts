/**
 * Polish Engine — Construct Registry Types
 *
 * Defines the ConstructConfig discriminated union and supporting interfaces.
 * The default registry is assembled in index.ts.
 */

import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/** Range in the document identified by custom detection. */
export interface NodeRange {
  from: number;
  to: number;
}

/** Info collected during the cross-scan collect pass. */
export interface CollectedInfo {
  /** Position of the definition/source. */
  from: number;
  to: number;
}

/** Shared fields present on every construct config. */
type BaseConfig = {
  /** Unique identifier for this construct. */
  id: string;

  /** lezer node name(s) to match. */
  nodeName?: string | string[];

  /** Regex-based detection over visible ranges (for constructs without lezer nodes). */
  customDetect?: (state: EditorState) => NodeRange[];
};

/** Line-kind construct — applies Decoration.line to every line the node spans. */
type LineConfig = BaseConfig & {
  kind: 'line';

  /** CSS class(es) to apply. Can be dynamic based on the node. */
  class?: string | ((node: SyntaxNode, state: EditorState) => string);

  /** Class for markers within the construct (HeaderMark, QuoteMark, etc.). */
  markerClass?: string;

  /** Marker node name(s) to match for markerClass application. */
  markerNodeName?: string | string[];

  /** Depth-aware class computation (blockquote, list nesting). */
  depthClass?: (node: SyntaxNode) => string;

  /** Hanging indent behavior. */
  hangingIndent?: 'none' | 'content' | 'preserve-source-indent';

  /** Inline styles to apply to line decorations (e.g., CSS custom properties). */
  lineAttributes?: (node: SyntaxNode, state: EditorState) => Record<string, string> | null;
};

/** Mark-kind construct — applies Decoration.mark to the node's range. */
type MarkConfig = BaseConfig & {
  kind: 'mark';

  /** CSS class(es) to apply. Can be dynamic based on the node. */
  class?: string | ((node: SyntaxNode, state: EditorState) => string);
};

/** Cross-scan-mark-kind construct — uses StateField for document-wide analysis. */
type CrossScanMarkConfig = BaseConfig & {
  kind: 'cross-scan-mark';

  /** Cross-scan configuration for broken-reference detection. */
  crossScan: {
    collect: (state: EditorState) => Map<string, CollectedInfo>;
    check: (
      node: SyntaxNode,
      collected: Map<string, CollectedInfo>,
      state: EditorState,
    ) => 'ok' | 'broken';
    brokenClass: string;
  };
};

/** None-kind construct — registered for cross-cutting concerns but produces no decorations. */
type NoneConfig = BaseConfig & {
  kind: 'none';
};

/**
 * Discriminated union on `kind`. Each variant only permits the fields
 * that the engine's dispatch path actually reads for that kind.
 */
export type ConstructConfig = LineConfig | MarkConfig | CrossScanMarkConfig | NoneConfig;

/** The full registry is an array of construct configs. */
export type Registry = ConstructConfig[];
