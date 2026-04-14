import { Extension } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';

/**
 * Finds the top-level (depth-1) block that contains the current selection.
 * Returns { from, to, node } or null if not found.
 */
function currentTopLevelBlock(state: EditorState): { from: number; to: number } | null {
  const { $from } = state.selection;
  if ($from.depth === 0) return null;
  const from = $from.before(1);
  const to = $from.after(1);
  return { from, to };
}

function moveBlockUp(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
  const block = currentTopLevelBlock(state);
  if (!block) return false;

  const { from, to } = block;
  if (from === 0) return false; // already first block

  // Find the block above
  const $above = state.doc.resolve(from - 1);
  if ($above.depth === 0) return false; // no block above

  const aboveFrom = $above.before(1);
  const aboveTo = from; // == $above.after(1) + 1 (the separator)

  const movingNode = state.doc.slice(from, to).content;
  const aboveNode = state.doc.slice(aboveFrom, aboveTo - 1).content; // exclude the separator

  if (!dispatch) return true;

  const tr = state.tr;
  // Replace the two-block range with: movingBlock + aboveBlock
  tr.replaceWith(aboveFrom, to, [...movingNode.content, ...aboveNode.content]);

  // Keep cursor in the moved block (now at aboveFrom)
  const newBlockStart = aboveFrom + 1;
  const newBlockEnd = aboveFrom + movingNode.size;
  const cursorOffset = state.selection.from - from;
  const newCursorPos = Math.min(newBlockStart + cursorOffset, newBlockEnd);
  tr.setSelection(TextSelection.near(tr.doc.resolve(newCursorPos)));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

function moveBlockDown(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
  const block = currentTopLevelBlock(state);
  if (!block) return false;

  const { from, to } = block;
  if (to >= state.doc.content.size) return false; // already last block

  // Find the block below
  const $below = state.doc.resolve(to + 1);
  if ($below.depth === 0) return false;

  const belowFrom = to; // position right after current block
  const belowTo = $below.after(1);

  const movingNode = state.doc.slice(from, to).content;
  const belowNode = state.doc.slice(belowFrom + 1, belowTo).content; // skip separator

  if (!dispatch) return true;

  const tr = state.tr;
  tr.replaceWith(from, belowTo, [...belowNode.content, ...movingNode.content]);

  // Keep cursor in the moved block (now at belowFrom + 1 - 1 + belowNode.size + 1 = ...)
  const newBlockStart = from + belowNode.size + 1;
  const newBlockEnd = from + belowNode.size + movingNode.size;
  const cursorOffset = state.selection.from - from;
  const newCursorPos = Math.min(newBlockStart + cursorOffset, newBlockEnd);
  tr.setSelection(TextSelection.near(tr.doc.resolve(newCursorPos)));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

export const BlockMover = Extension.create({
  name: 'blockMover',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': ({ editor }) => moveBlockUp(editor.state, editor.view.dispatch),
      'Mod-Shift-ArrowDown': ({ editor }) => moveBlockDown(editor.state, editor.view.dispatch),
    };
  },
});
