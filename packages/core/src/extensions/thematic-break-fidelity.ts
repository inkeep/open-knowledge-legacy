import HorizontalRule from '@tiptap/extension-horizontal-rule';

export const ThematicBreakFidelity = HorizontalRule.extend({
  name: 'thematicBreak',
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourceRaw: { default: '---' },
    };
  },
});
