/**
 * sourceLiteral — PM-level mark for text that must serialize verbatim.
 *
 * Used for markdown constructs that this editor cannot faithfully represent as
 * rich-text structure, or that the serializer would otherwise canonicalize to a
 * different byte form (for example, empty-label inline links like `[]()` or a
 * lone trailing backslash).
 * The marked text renders as ordinary text in the editor, but markdown
 * serialization reads `sourceRaw` and emits the exact source bytes.
 */

import { Mark } from '@tiptap/core';

export const SourceLiteralMark = Mark.create({
  name: 'sourceLiteral',
  // Run after structural marks; this mark is a serialization hint and should
  // not win extension-order conflicts over user-visible formatting.
  priority: 10,
  excludes: '',
  inclusive: false,

  addAttributes() {
    return {
      sourceRaw: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-source-literal]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { 'data-source-literal': '', ...HTMLAttributes }, 0];
  },
});
