import Code from '@tiptap/extension-code';

export const CodeMarkFidelity = Code.extend({
  excludes: '',

  addAttributes() {
    return {
      ...this.parent?.(),
      sourceFenceChar: { default: '`' },
      sourceFenceLength: { default: 1 },
    };
  },
});
