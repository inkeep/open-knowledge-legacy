/**
 * Link mark override for source-text fidelity.
 *
 * Extends @tiptap/extension-link (preserving autolink, linkOnPaste,
 * and click handling plugins) and adds fidelity attributes for link
 * style (inline, full, collapsed, shortcut) and reference label.
 *
 * Falls back to inline rendering until linkRefDef enables full
 * reference-link round-trip.
 */

import type { MarkdownParseHelpers, MarkdownToken } from '@tiptap/core';
import Link from '@tiptap/extension-link';

export const LinkFidelity = Link.extend({
  priority: 60,

  addOptions() {
    return {
      openOnClick: false,
      enableClickSelection: false,
      linkOnPaste: true,
      autolink: true,
      protocols: [] as string[],
      defaultProtocol: 'http',
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer',
        class: null as string | null,
      },
      isAllowedUri: (url: string) => {
        try {
          const parsed = new URL(url, 'https://placeholder.invalid');
          const scheme = parsed.protocol.toLowerCase();
          return !['javascript:', 'data:', 'vbscript:'].includes(scheme);
        } catch {
          return false;
        }
      },
      validate: () => true,
      shouldAutoLink: () => true,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      linkStyle: { default: 'inline' },
      refLabel: { default: null },
    };
  },

  markdownTokenName: 'link',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const raw = (token as Record<string, string>).raw ?? '';

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
      href: (token as Record<string, string>).href,
      title: (token as Record<string, string>).title || null,
      linkStyle,
      refLabel,
    });
  },

  renderMarkdown(node: Record<string, any>, h: Record<string, any>) {
    const href = node.attrs?.href ?? '';
    const title = node.attrs?.title ?? '';
    const text = h.renderChildren(node);

    // For now, all link styles render as inline (reference links need linkRefDef node coordination)
    return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
  },
});
