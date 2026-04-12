/**
 * HtmlBlock custom node for source-text fidelity.
 *
 * Atom node that stores raw HTML block content verbatim.
 * In WYSIWYG, renders as raw source text (Q1 parked — no rich preview).
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

  renderHTML({ node }: any) {
    return ['div', { 'data-html-block': '', class: 'html-block' }, node.attrs.content];
  },

  markdownTokenName: 'html',

  parseMarkdown(token: any, helpers: any) {
    // Only handle block-level HTML tokens (not inline HTML)
    if (token.type !== 'html' || token.block === false) {
      return [];
    }
    // Skip if the raw content doesn't look like a block HTML element
    const raw = (token.raw ?? token.text ?? '').trim();
    if (!raw) return [];

    return helpers.createNode('htmlBlock', { content: raw });
  },

  renderMarkdown(node: any) {
    return node.attrs?.content ?? '';
  },
});
