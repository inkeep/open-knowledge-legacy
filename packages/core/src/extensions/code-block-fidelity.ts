
import CodeBlock from '@tiptap/extension-code-block';

export const CodeBlockFidelity = CodeBlock.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      fenceDelimiter: { default: '`' },
      fenceLength: { default: 3 },
    };
  },
});
