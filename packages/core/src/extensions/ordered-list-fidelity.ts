/**
 * OrderedList extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-ordered-list (preserving toggleOrderedList command,
 * input rules, and keyboard shortcuts) and adds fidelity attributes for
 * list marker delimiter (. or )) and tight/loose list structure.
 */

import type { JSONContent, MarkdownToken } from '@tiptap/core';
import OrderedList from '@tiptap/extension-ordered-list';

export const OrderedListFidelity = OrderedList.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      listMarkerDelimiter: { default: '.' },
      loose: { default: false },
    };
  },

  markdownTokenName: 'list',

  parseMarkdown(token: MarkdownToken, helpers: any) {
    if (token.type !== 'list' || !(token as any).ordered) {
      return [];
    }

    // Extract delimiter from raw: look for digit followed by . or )
    const delim = (token as any).raw?.match(/^\d+([.)])/m)?.[1] ?? '.';
    const loose = (token as any).loose === true;

    return {
      type: 'orderedList',
      attrs: {
        start: (token as any).start ?? 1,
        listMarkerDelimiter: delim,
        loose,
      },
      content: (token as any).items ? helpers.parseChildren((token as any).items) : [],
    } as JSONContent;
  },

  renderMarkdown(node: any, h: any) {
    if (!node.content) {
      return '';
    }
    return h.renderChildren(node.content, '\n');
  },

  markdownOptions: {
    indentsContent: true,
  },
});
