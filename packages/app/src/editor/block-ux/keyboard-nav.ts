/**
 * Block UX Phase 2 — keyboard navigation L1-L4 (FR-18, §9.11).
 *
 * L1: Esc → selectParentNode (cursor in component → select the component)
 * L2: Arrow Up/Down in nav mode (NodeSelection → move between blocks)
 * L3: Enter container exit (empty trailing paragraph → sibling after container)
 * L4: Escape priority chain (Suggestion > Radix popover > L1 > deselect > default)
 *
 * L1+L2+L4 is the MVP floor. L3 ships if implementation is clean.
 */

import { Extension } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

export const KeyboardNav = Extension.create({
  name: 'keyboardNav',
  priority: 50, // lower than Suggestion plugins so they intercept Escape first (L4)

  addKeyboardShortcuts() {
    return {
      // L1: Esc → selectParentNode
      Escape: ({ editor }) => {
        // L4 priority chain: Suggestion/Radix popover intercept first
        // (they're higher priority). We only fire if nothing else handled it.
        const { state } = editor;

        // If NodeSelection is active, deselect → TextSelection after the node
        if (state.selection instanceof NodeSelection) {
          const pos = state.selection.from + state.selection.node.nodeSize;
          const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size));
          const sel = TextSelection.near($pos);
          editor.view.dispatch(state.tr.setSelection(sel));
          return true;
        }

        // If TextSelection inside a component, select the component
        if (state.selection instanceof TextSelection) {
          return editor.commands.selectParentNode();
        }

        return false;
      },

      // L2: Arrow Up in nav mode
      ArrowUp: ({ editor }) => {
        const { state } = editor;
        if (!(state.selection instanceof NodeSelection)) return false;

        const pos = state.selection.from;
        const $pos = state.doc.resolve(pos);

        // Find the previous sibling block
        if ($pos.index($pos.depth) === 0) return false; // at first child
        const prevPos = $pos.before($pos.depth);
        if (prevPos <= 0) return false;

        // Resolve to the node before this one
        const $prevPos = state.doc.resolve(prevPos - 1);
        const prevNode = $prevPos.nodeBefore;
        if (!prevNode) return false;

        const prevNodePos = prevPos - 1 - prevNode.nodeSize + 1;
        if (prevNodePos < 0) return false;

        try {
          const sel = NodeSelection.create(state.doc, prevPos - prevNode.nodeSize);
          editor.view.dispatch(state.tr.setSelection(sel).scrollIntoView());
          return true;
        } catch {
          return false;
        }
      },

      // L2: Arrow Down in nav mode
      ArrowDown: ({ editor }) => {
        const { state } = editor;
        if (!(state.selection instanceof NodeSelection)) return false;

        const pos = state.selection.from;
        const nodeSize = state.selection.node.nodeSize;
        const nextPos = pos + nodeSize;

        if (nextPos >= state.doc.content.size) return false;

        try {
          const nextNode = state.doc.nodeAt(nextPos);
          if (!nextNode) return false;
          const sel = NodeSelection.create(state.doc, nextPos);
          editor.view.dispatch(state.tr.setSelection(sel).scrollIntoView());
          return true;
        } catch {
          return false;
        }
      },

      // L3: Enter container exit (from empty trailing paragraph of last child)
      Enter: ({ editor }) => {
        const { state } = editor;
        if (!(state.selection instanceof TextSelection)) return false;
        if (!state.selection.empty) return false;

        const $from = state.selection.$from;

        // Check: cursor is in a paragraph that's empty
        const parentNode = $from.parent;
        if (parentNode.type.name !== 'paragraph' || parentNode.textContent !== '') return false;

        // Check: the paragraph is inside a jsxComponent
        if ($from.depth < 2) return false;

        // Walk up to find the containing jsxComponent
        let componentDepth = -1;
        for (let d = $from.depth - 1; d >= 1; d--) {
          if ($from.node(d).type.name === 'jsxComponent') {
            componentDepth = d;
            break;
          }
        }
        if (componentDepth < 0) return false;

        // Check: this is the last paragraph in the last child
        const componentNode = $from.node(componentDepth);
        const paragraphIndex = $from.index(componentDepth);
        if (paragraphIndex !== componentNode.childCount - 1) return false;

        // Compute insertion position after the container
        const insertPos = $from.after(componentDepth);
        if (insertPos > state.doc.content.size) return false;

        // Delete the empty paragraph + insert new paragraph after the container
        const tr = state.tr;
        const emptyParaFrom = $from.before($from.depth);
        const emptyParaTo = $from.after($from.depth);
        tr.delete(emptyParaFrom, emptyParaTo);

        // After deletion, insertion position shifts
        const adjustedInsertPos = insertPos - (emptyParaTo - emptyParaFrom);
        const newPara = state.schema.nodes.paragraph.create();
        tr.insert(adjustedInsertPos, newPara);

        // Set cursor inside the new paragraph
        const cursorPos = adjustedInsertPos + 1;
        tr.setSelection(TextSelection.create(tr.doc, cursorPos));
        editor.view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});
