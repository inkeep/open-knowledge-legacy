/**
 * BulletList extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-bullet-list (preserving toggleBulletList command,
 * input rules, and keyboard shortcuts) and adds fidelity attributes for
 * bullet marker character (-, *, +) and tight/loose list structure.
 */

import type { JSONContent, MarkdownToken } from '@tiptap/core';
import BulletList from '@tiptap/extension-bullet-list';

export const BulletListFidelity = BulletList.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      bulletMarker: { default: '-' },
      loose: { default: false },
    };
  },

  markdownTokenName: 'list',

  parseMarkdown(token: MarkdownToken, helpers: any) {
    if (token.type !== 'list' || (token as any).ordered) {
      return [];
    }

    // Extract bullet marker from first item's raw content
    const firstRaw = (token as any).items?.[0]?.raw ?? '';
    const marker = firstRaw.match(/^([*+-])/)?.[1] ?? '-';

    // Extract tight/loose from token
    const loose = (token as any).loose === true;

    return {
      type: 'bulletList',
      attrs: { bulletMarker: marker, loose },
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
