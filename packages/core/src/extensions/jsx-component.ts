import { Node } from '@tiptap/core';
import { jsxStart, jsxTokenizerB } from './jsx-tokenizer.ts';

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
  priority: 60, // Higher than codeBlock (default 50) so we intercept raw JSX first

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

  // Custom token name for raw JSX blocks — intercepted by the markdownTokenizer below
  markdownTokenName: 'jsxBlock',

  // Register jsxTokenizerB with marked — intercepts <UppercaseTag> before marked's HTML tokenizer
  markdownTokenizer: {
    name: 'jsxBlock',
    level: 'block' as const,
    start: jsxStart,
    tokenize(src: string) {
      return jsxTokenizerB(src);
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('jsxComponent', { content: token.content || '' });
  },

  renderMarkdown(node) {
    const content = node.attrs?.content || '';
    return `${content}\n`;
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
