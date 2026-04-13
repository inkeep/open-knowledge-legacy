/**
 * HtmlBlock custom node for source-text fidelity.
 *
 * Atom node that stores raw HTML block content verbatim.
 * In WYSIWYG, renders as raw source text (Q1 parked — no rich preview).
 *
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

import { Node } from '@tiptap/core';

export const HtmlBlockFidelity = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  priority: 60,

  addAttributes() {
    return {
      content: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-html-block]' }];
  },

  // biome-ignore lint/suspicious/noExplicitAny: TipTap renderHTML parameter — avoids importing prosemirror-model in extension file
  renderHTML({ node }: any) {
    return ['div', { 'data-html-block': '', class: 'html-block' }, node.attrs.content];
  },
});
