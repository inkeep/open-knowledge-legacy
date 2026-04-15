/**
 * Polish Engine — Construct Registry
 *
 * Defines the ConstructConfig type and the default registry of markdown
 * constructs the engine decorates. Each entry maps lezer node types
 * (or regex-based custom detection) to CM6 decoration instructions.
 */

import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/** Range in the document identified by custom detection. */
export interface NodeRange {
  from: number;
  to: number;
  /** Optional metadata for the detection (e.g., which sub-region). */
  data?: Record<string, unknown>;
}

/** Info collected during the cross-scan collect pass. */
export interface CollectedInfo {
  /** Position of the definition/source. */
  from: number;
  to: number;
}

export type ConstructConfig = {
  /** Unique identifier for this construct. */
  id: string;

  /** lezer node name(s) to match. */
  nodeName?: string | string[];

  /** Regex-based detection over visible ranges (for constructs without lezer nodes). */
  customDetect?: (state: EditorState) => NodeRange[];

  /** Decoration kind — determines dispatch path. */
  kind: 'line' | 'mark' | 'cross-scan-mark' | 'none';

  /** CSS class(es) to apply. Can be dynamic based on the node. */
  class?: string | ((node: SyntaxNode, state: EditorState) => string);

  /** Class for markers within the construct (HeaderMark, ListMark, etc.). */
  markerClass?: string;

  /** Marker node name(s) to match for markerClass application. */
  markerNodeName?: string | string[];

  /** Depth-aware class computation (blockquote, list nesting). */
  depthClass?: (node: SyntaxNode) => string;

  /** Hanging indent behavior. */
  hangingIndent?: 'none' | 'content' | 'preserve-source-indent';

  /** Inline styles to apply to line decorations (e.g., CSS custom properties). */
  lineAttributes?: (node: SyntaxNode, state: EditorState) => Record<string, string> | null;

  /** Cross-scan configuration for broken-reference detection. */
  crossScan?: {
    collect: (state: EditorState) => Map<string, CollectedInfo>;
    check: (
      node: SyntaxNode,
      collected: Map<string, CollectedInfo>,
      state: EditorState,
    ) => 'ok' | 'broken';
    brokenClass: string;
  };
};

/** The full registry is an array of construct configs. */
export type Registry = ConstructConfig[];
