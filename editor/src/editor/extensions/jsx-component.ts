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

/**
 * Returns a backtick fence that safely wraps `content`.
 * Uses N+1 backticks where N is the longest backtick run in content (minimum 3).
 */
export function fenceFor(content: string): string {
  const maxRun = (content.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 2);
  return '`'.repeat(maxRun + 1);
}

/**
 * Void block node for JSX components embedded in markdown.
 * Serializes as a fenced code block with `jsx-component` info string.
 * Priority 60 ensures parseMarkdown intercepts `code` tokens before codeBlock (default 50).
 */
export const JsxComponent = Node.create({
  name: 'jsxComponent',
  group: 'block',
  atom: true,
  priority: 60,

  addAttributes() {
    return {
      content: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-jsx-component]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return { content: (node as HTMLElement).getAttribute('data-content') ?? '' };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-jsx-component': '', 'data-content': HTMLAttributes.content }];
  },

  markdownTokenName: 'code',

  parseMarkdown(token, helpers) {
    if (token.lang !== 'jsx-component') return [];
    return helpers.createNode('jsxComponent', { content: token.text ?? '' });
  },

  renderMarkdown(node) {
    const content = (node.attrs?.content as string) ?? '';
    const fence = fenceFor(content);
    return `${fence}jsx-component\n${content}\n${fence}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentView);
  },

  addCommands() {
    return {
      insertJsxComponent:
        (content: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { content } }),
    };
  },
});
