import { Mark } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: () => ReturnType;
      toggleComment: () => ReturnType;
      unsetComment: () => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: 'comment',
  priority: 10,
  excludes: '',
  inclusive: false,

  parseHTML() {
    return [{ tag: 'span[data-comment-mark]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        'data-comment-mark': '',
        class: 'comment-mark italic text-muted-foreground/70',
        ...HTMLAttributes,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleComment:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetComment:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
