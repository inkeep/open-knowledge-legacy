import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { JsxComponentView } from './JsxComponentView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    jsxComponent: {
      insertJsxComponent: (content: string) => ReturnType;
    };
  }
}

export const JsxComponent = Node.create({
  name: 'jsxComponent',
  group: 'block',
  atom: true,
  priority: 60, // Higher than codeBlock (default 50) so we intercept jsx-component first

  addAttributes() {
    return {
      content: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-jsx-component]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return { content: node.getAttribute('data-content') || '' };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-jsx-component': '', 'data-content': HTMLAttributes.content }];
  },

  // Use same token name as codeBlock to intercept code tokens
  markdownTokenName: 'code',

  parseMarkdown(token, helpers) {
    // Only handle code blocks with jsx-component info string
    if (token.lang !== 'jsx-component') {
      return [];
    }
    return helpers.createNode('jsxComponent', { content: token.text || '' });
  },

  renderMarkdown(node) {
    const content = node.attrs?.content || '';
    return `\`\`\`jsx-component\n${content}\n\`\`\``;
  },

  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentView);
  },

  addCommands() {
    return {
      insertJsxComponent:
        (content: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { content },
          });
        },
    };
  },
});
