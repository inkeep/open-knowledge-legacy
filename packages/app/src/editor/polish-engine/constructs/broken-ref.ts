/**
 * Broken link-reference cross-scan (Phase 4)
 *
 * Two-pass algorithm:
 * 1. Collect: iterate for LinkReference nodes (block-level definitions);
 *    harvest each label from the LinkLabel child.
 * 2. Check: iterate for Link nodes that have a LinkLabel child (inline
 *    reference-links like [text][ref]); if the label isn't in the
 *    collected definitions, mark it broken.
 *
 * In lezer with GFM:
 * - Block definitions: LinkReference node → children include LinkLabel
 * - Inline refs: Link node → children include LinkLabel (ref part)
 */

import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { CollectedInfo, ConstructConfig } from '../registry';

/** Extract the label text from a LinkLabel node (strips the brackets). */
function extractLabel(state: EditorState, labelNode: SyntaxNode): string {
  const text = state.sliceDoc(labelNode.from + 1, labelNode.to - 1);
  return text.toLowerCase().trim();
}

export const brokenLinkRefConstruct: ConstructConfig = {
  id: 'broken-link-ref',
  nodeName: 'Link',
  kind: 'cross-scan-mark',
  crossScan: {
    collect(state: EditorState): Map<string, CollectedInfo> {
      const definitions = new Map<string, CollectedInfo>();
      const tree = syntaxTree(state);

      tree.iterate({
        enter(nodeRef) {
          if (nodeRef.name !== 'LinkReference') return;

          // Find the LinkLabel child
          const node = nodeRef.node;
          const labelChild = node.getChild('LinkLabel');
          if (!labelChild) return;

          const label = extractLabel(state, labelChild);
          if (label) {
            definitions.set(label, { from: nodeRef.from, to: nodeRef.to });
          }
        },
      });

      return definitions;
    },

    check(
      node: SyntaxNode,
      collected: Map<string, CollectedInfo>,
      state: EditorState,
    ): 'ok' | 'broken' {
      // Only check Link nodes that have a LinkLabel child (reference-style links)
      const labelChild = node.getChild('LinkLabel');
      if (!labelChild) return 'ok';

      const label = extractLabel(state, labelChild);
      if (!label) return 'ok';

      return collected.has(label) ? 'ok' : 'broken';
    },

    brokenClass: 'cm-link-ref-broken',
  },
};
