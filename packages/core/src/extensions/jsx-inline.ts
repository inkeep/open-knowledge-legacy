import { Node } from '@tiptap/core';

export const JsxInline = Node.create({
  name: 'jsxInline',
  group: 'inline',
  inline: true,
  atom: false,
  content: 'text*',
  isolating: false,
  selectable: true,
  priority: 60,

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [{ tag: 'span[data-jsx-inline]' }];
  },

  renderHTML() {
    return ['span', { 'data-jsx-inline': '' }, 0];
  },
});
