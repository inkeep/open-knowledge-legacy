import { Extension } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

export const KeyboardNav = Extension.create({
  name: 'keyboardNav',
  priority: 50, // lower than Suggestion plugins so they intercept Escape first (L4)

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        const { state } = editor;

        if (state.selection instanceof NodeSelection) {
          const pos = state.selection.from + state.selection.node.nodeSize;
          const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size));
          const sel = TextSelection.near($pos);
          editor.view.dispatch(state.tr.setSelection(sel));
          return true;
        }

        if (state.selection instanceof TextSelection) {
          return editor.commands.selectParentNode();
        }

        return false;
      },

      ArrowUp: ({ editor }) => {
        const { state } = editor;
        if (!(state.selection instanceof NodeSelection)) return false;

        const pos = state.selection.from;
        const $pos = state.doc.resolve(pos);

        if ($pos.index($pos.depth) === 0) return false; // at first child
        const prevPos = $pos.before($pos.depth);
        if (prevPos <= 0) return false;

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

      Enter: ({ editor }) => {
        const { state } = editor;
        if (!(state.selection instanceof TextSelection)) return false;
        if (!state.selection.empty) return false;

        const $from = state.selection.$from;

        const parentNode = $from.parent;
        if (parentNode.type.name !== 'paragraph' || parentNode.textContent !== '') return false;

        if ($from.depth < 2) return false;

        let componentDepth = -1;
        for (let d = $from.depth - 1; d >= 1; d--) {
          if ($from.node(d).type.name === 'jsxComponent') {
            componentDepth = d;
            break;
          }
        }
        if (componentDepth < 0) return false;

        const componentNode = $from.node(componentDepth);
        const paragraphIndex = $from.index(componentDepth);
        if (paragraphIndex !== componentNode.childCount - 1) return false;

        const insertPos = $from.after(componentDepth);
        if (insertPos > state.doc.content.size) return false;

        const tr = state.tr;
        const emptyParaFrom = $from.before($from.depth);
        const emptyParaTo = $from.after($from.depth);
        tr.delete(emptyParaFrom, emptyParaTo);

        const adjustedInsertPos = insertPos - (emptyParaTo - emptyParaFrom);
        const newPara = state.schema.nodes.paragraph.create();
        tr.insert(adjustedInsertPos, newPara);

        const cursorPos = adjustedInsertPos + 1;
        tr.setSelection(TextSelection.create(tr.doc, cursorPos));
        editor.view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});
