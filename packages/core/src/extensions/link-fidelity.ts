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
      sourceForm: { default: null, rendered: false },
      target: { default: null, rendered: false },
      anchor: { default: null, rendered: false },
      alias: { default: null, rendered: false },
    };
  },
});
