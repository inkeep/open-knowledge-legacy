/**
 * Emphasis (strong/emphasis) mark overrides for source-text fidelity.
 *
 * Extends @tiptap/extension-italic and @tiptap/extension-bold (preserving
 * toggleItalic/toggleBold commands, Cmd+I/Cmd+B shortcuts, and input rules)
 * and adds delimiter-choice attributes.
 *
 * Schema names are mdast-canonical per D16: 'emphasis' (was 'italic'), 'strong' (was 'bold').
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';

export const EmphasisFidelity = Italic.extend({
  name: 'emphasis',
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourceDelimiter: { default: '*' },
    };
  },
});

export const StrongFidelity = Bold.extend({
  name: 'strong',
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourceDelimiter: { default: '**' },
    };
  },
});
