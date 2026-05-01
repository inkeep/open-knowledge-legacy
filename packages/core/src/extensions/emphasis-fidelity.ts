
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
