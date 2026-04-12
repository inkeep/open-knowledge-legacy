/**
 * OrderedList extension override for source-text fidelity.
 *
 * Preserves the list marker delimiter (. or )) via `listMarkerDelimiter`
 * attribute extracted from token.raw. Also preserves tight/loose.
 */

import { type JSONContent, Node } from '@tiptap/core';

export const OrderedListFidelity = Node.create({
  name: 'orderedList',
  group: 'block list',
  content: 'listItem+',
  priority: 60,

  addOptions() {
    return {
      itemTypeName: 'listItem',
      HTMLAttributes: {},
      keepMarks: false,
      keepAttributes: false,
    };
  },

  addAttributes() {
    return {
      start: { default: 1 },
      listMarkerDelimiter: { default: '.' },
      loose: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'ol',
        getAttrs: (element: HTMLElement) => ({
          start: element.getAttribute('start')
            ? Number.parseInt(element.getAttribute('start')!, 10)
            : 1,
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ol', HTMLAttributes, 0];
  },

  markdownTokenName: 'list',

  parseMarkdown(token: any, helpers: any) {
    if (token.type !== 'list' || !token.ordered) {
      return [];
    }

    // Extract delimiter from raw: look for digit followed by . or )
    const delim = token.raw?.match(/^\d+([.)])/m)?.[1] ?? '.';
    const loose = token.loose === true;

    return {
      type: 'orderedList',
      attrs: {
        start: token.start ?? 1,
        listMarkerDelimiter: delim,
        loose,
      },
      content: token.items ? helpers.parseChildren(token.items) : [],
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
