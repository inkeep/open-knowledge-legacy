/**
 * Heading extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-heading (preserving setHeading/toggleHeading
 * commands, input rules, and keyboard shortcuts) and adds the headingStyle
 * attribute to distinguish ATX (# ...) from setext (underline) headings.
 *
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

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
