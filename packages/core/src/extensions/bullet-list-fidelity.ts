/**
 * BulletList extension override for source-text fidelity.
 *
 * Preserves the bullet marker character (-, *, +) from the source markdown
 * via the `bulletMarker` attribute extracted from token.items[0].raw.
 * Also preserves tight/loose list structure via the `loose` attribute.
 */

import { type JSONContent, Node } from '@tiptap/core';

export const BulletListFidelity = Node.create({
  name: 'bulletList',
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
      bulletMarker: { default: '-' },
      loose: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'ul' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ul', HTMLAttributes, 0];
  },

  markdownTokenName: 'list',

  parseMarkdown(token: any, helpers: any) {
    if (token.type !== 'list' || token.ordered) {
      return [];
    }

    // Extract bullet marker from first item's raw content
    const firstRaw = token.items?.[0]?.raw ?? '';
    const marker = firstRaw.match(/^([*+-])/)?.[1] ?? '-';

    // Extract tight/loose from token
    const loose = token.loose === true;

    return {
      type: 'bulletList',
      attrs: { bulletMarker: marker, loose },
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
