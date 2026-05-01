
import { Mark } from '@tiptap/core';

export const SourceLiteralMark = Mark.create({
  name: 'sourceLiteral',
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
