/**
 * Link mark override for source-text fidelity.
 *
 * Extends @tiptap/extension-link (preserving autolink, linkOnPaste,
 * and click handling plugins) and adds fidelity attributes for link
 * style (inline, full, collapsed, shortcut) and reference label.
 *
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

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
      linkStyle: { default: 'inline', rendered: false },
      refLabel: { default: null, rendered: false },
      // US-013 FR-3c: when handlers.wikiLinkEmbed dispatches a non-image
      // wiki-embed to a link-marked text, it tags the mark with
      // `sourceForm='wikiembed'` + preserves `target`/`anchor`/`alias`
      // separately from the resolved `href`. markHandlers.link reads the
      // tag to round-trip back to mdast wikiLinkEmbed. All four default
      // null and `rendered: false` so plain markdown links round-trip
      // unchanged.
      sourceForm: { default: null, rendered: false },
      target: { default: null, rendered: false },
      anchor: { default: null, rendered: false },
      alias: { default: null, rendered: false },
    };
  },
});
