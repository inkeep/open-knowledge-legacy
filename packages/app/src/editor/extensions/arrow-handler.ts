/**
 * Arrow-key handler for entering nested CodeMirror instances (§9.14).
 *
 * When the PM cursor is at the boundary of a block adjacent to a
 * rawMdxFallback (or future nested-CM node), arrow keys transfer
 * focus from the outer PM editor into the nested CM instance.
 *
 * Pattern: prosemirror.net/examples/codemirror/ — adapted for
 * TipTap extension registration.
 */

import { Extension } from '@tiptap/core';

export const ArrowHandler = Extension.create({
  name: 'arrowHandler',

  addKeyboardShortcuts() {
    return {
      ArrowUp: ({ editor }) => handleArrow(editor, 'up'),
      ArrowDown: ({ editor }) => handleArrow(editor, 'down'),
      ArrowLeft: ({ editor }) => handleArrow(editor, 'left'),
      ArrowRight: ({ editor }) => handleArrow(editor, 'right'),
    };
  },
});

function handleArrow(
  _editor: import('@tiptap/core').Editor,
  _direction: 'up' | 'down' | 'left' | 'right',
): boolean {
  // For now, delegate to default ProseMirror behavior.
  // The nested CM NodeView handles focus transfer via its own
  // DOM event handlers — this extension is a forward-compatible
  // hook for future refinements (e.g., NG10 per-block source toggle).
  return false;
}
