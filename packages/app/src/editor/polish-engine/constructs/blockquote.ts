/**
 * Blockquote construct — Family A (prefix/marker block)
 *
 * Applies depth-aware line tinting and left border. Wrapped continuation
 * aligns under content (not under the `>` marker) via text-indent + padding.
 * Depth capped at 3 for visual differentiation.
 */

import type { SyntaxNode } from '@lezer/common';
import type { ConstructConfig } from '../registry';

/** Count blockquote nesting depth by walking up the tree. */
function getBlockquoteDepth(node: SyntaxNode): number {
  let depth = 0;
  let current: SyntaxNode | null = node;
  while (current) {
    if (current.name === 'Blockquote') depth++;
    current = current.parent;
  }
  return depth;
}

export const blockquoteConstruct: ConstructConfig = {
  id: 'blockquote',
  nodeName: 'Blockquote',
  kind: 'line',
  class: 'cm-blockquote-line',
  markerNodeName: 'QuoteMark',
  markerClass: 'cm-quote-mark',
  hangingIndent: 'content',
  depthClass(node: SyntaxNode) {
    const depth = getBlockquoteDepth(node);
    if (depth >= 3) return 'cm-blockquote-depth-3';
    if (depth === 2) return 'cm-blockquote-depth-2';
    return '';
  },
};
