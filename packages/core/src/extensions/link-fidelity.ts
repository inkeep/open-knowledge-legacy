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
      // Link default HTMLAttributes. Do NOT include a `class: null` override —
      // @tiptap/extension-link's mergeAttributes passes null-valued keys
      // through as React DOM props, which triggers React 19's
      // "Invalid DOM property `class`. Did you mean `className`?" warning on
      // every reference-style link ([text][label]) that renders through the
      // WYSIWYG React tree. Omitting the key keeps rendering identical (no
      // class is emitted either way) without the React warning.
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
      // Fidelity metadata used by the markdown pipeline to preserve link
      // style (inline / full / collapsed / shortcut) and reference label on
      // round-trip. These are NOT DOM attributes — `rendered: false` keeps
      // TipTap from serializing them onto <a> elements, which would produce
      // React DOM warnings ("Invalid DOM property `linkStyle`") when any
      // React-rendered surface observes the editor output.
      linkStyle: { default: 'inline', rendered: false },
      refLabel: { default: null, rendered: false },
    };
  },
});
