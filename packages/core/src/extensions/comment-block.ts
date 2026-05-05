import { Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentBlock: {
      setCommentBlock: () => ReturnType;
      toggleCommentBlock: () => ReturnType;
      unsetCommentBlock: () => ReturnType;
    };
  }
}

export const CommentBlock = Node.create({
  name: 'commentBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  priority: 60,

  parseHTML() {
    return [{ tag: 'aside[data-comment-block]' }, { tag: 'aside.comment-block' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      {
        'data-comment-block': '',
        class:
          'comment-block italic text-muted-foreground/70 border-l-2 border-muted-foreground/30 pl-3 my-2',
        ...HTMLAttributes,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setCommentBlock:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      toggleCommentBlock:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      unsetCommentBlock:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
