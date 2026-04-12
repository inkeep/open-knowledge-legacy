/**
 * Link mark override for source-text fidelity.
 *
 * Stores the link style (inline, full, collapsed, shortcut) and reference
 * label from token.raw. Falls back to inline rendering until linkRefDef
 * (US-009) enables full reference-link round-trip.
 */

import { Mark } from '@tiptap/core';

export const LinkFidelity = Mark.create({
  name: 'link',
  priority: 60,
  inclusive: false,

  addOptions() {
    return {
      openOnClick: false,
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    };
  },

  addAttributes() {
    return {
      href: { default: null },
      title: { default: null },
      target: { default: null },
      rel: { default: null },
      class: { default: null },
      linkStyle: { default: 'inline' },
      refLabel: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]:not([href *= "javascript:" i])' }];
  },

  renderHTML({ HTMLAttributes }: any) {
    return ['a', HTMLAttributes, 0];
  },

  markdownTokenName: 'link',

  parseMarkdown(token: any, helpers: any) {
    const raw = token.raw ?? '';

    // Detect link style from raw source
    let linkStyle = 'inline';
    let refLabel: string | null = null;

    // Collapsed reference: [text][]
    if (raw.match(/\]\[\]\s*$/)) {
      linkStyle = 'collapsed';
    }
    // Full reference: [text][label] (non-empty label)
    else {
      const fullRefMatch = raw.match(/\]\[([^\]]+)\]\s*$/);
      if (fullRefMatch) {
        linkStyle = 'full';
        refLabel = fullRefMatch[1];
      }
      // Shortcut reference: [text] (no brackets after)
      else if (!raw.includes('](') && !raw.includes('][')) {
        linkStyle = 'shortcut';
      }
    }

    return helpers.applyMark('link', helpers.parseInline(token.tokens || []), {
      href: token.href,
      title: token.title || null,
      linkStyle,
      refLabel,
    });
  },

  renderMarkdown(node: any, h: any) {
    const href = node.attrs?.href ?? '';
    const title = node.attrs?.title ?? '';
    const text = h.renderChildren(node);

    // For now, all link styles render as inline (reference links need linkRefDef node)
    return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
  },
});
