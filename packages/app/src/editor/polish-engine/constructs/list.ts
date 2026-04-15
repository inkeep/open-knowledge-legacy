/**
 * List + listItem + task marker constructs (Phase 2)
 *
 * Hanging indent aligns wrapped content under text, not marker.
 * Task marker gets in-place checkbox hint via CSS borders (visual-only).
 */

import type { SyntaxNode } from '@lezer/common';
import type { ConstructConfig } from '../registry';

/** Count list nesting depth by walking up the tree. */
function getListDepth(node: SyntaxNode): number {
  let depth = 0;
  let current: SyntaxNode | null = node;
  while (current) {
    if (current.name === 'BulletList' || current.name === 'OrderedList') {
      depth++;
    }
    current = current.parent;
  }
  return depth;
}

export const listItemConstruct: ConstructConfig = {
  id: 'list-item',
  nodeName: 'ListItem',
  kind: 'line',
  class: 'cm-list-item-line',
  hangingIndent: 'content',
  lineAttributes(node, _state) {
    const depth = getListDepth(node);
    return { '--list-depth': String(Math.max(depth, 1)) };
  },
};

export const listMarkerConstruct: ConstructConfig = {
  id: 'list-marker',
  nodeName: 'ListMark',
  kind: 'mark',
  class: 'cm-list-mark',
};

export const taskMarkerConstruct: ConstructConfig = {
  id: 'task-marker',
  nodeName: 'TaskMarker',
  kind: 'mark',
  class(node, state) {
    const text = state.sliceDoc(node.from, node.to);
    return text.includes('x') || text.includes('X')
      ? 'cm-task-mark cm-task-mark-checked'
      : 'cm-task-mark';
  },
};
