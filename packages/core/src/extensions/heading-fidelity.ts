import Heading from '@tiptap/extension-heading';

export const HeadingFidelity = Heading.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      headingStyle: { default: 'atx' },
    };
  },
});
