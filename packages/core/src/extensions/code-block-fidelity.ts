/**
 * CodeBlock extension override for source-text fidelity.
 *
 * Preserves the fence delimiter character (` vs ~) and fence length
 * via fenceDelimiter and fenceLength attributes extracted from token.raw.
 */

import { Node } from '@tiptap/core';

export const CodeBlockFidelity = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  priority: 60,

  addOptions() {
    return {
      languageClassPrefix: 'language-',
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      language: { default: null },
      fenceDelimiter: { default: '`' },
      fenceLength: { default: 3 },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full' as const,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['pre', HTMLAttributes, ['code', {}, 0]];
  },

  markdownTokenName: 'code',

  parseMarkdown(token: any, helpers: any) {
    const raw = token.raw ?? '';
    // Skip indented code blocks and jsx-component (handled by JsxComponent)
    if (!raw.startsWith('```') && !raw.startsWith('~~~')) {
      return [];
    }

    // Extract fence delimiter and length from raw
    const fenceMatch = raw.match(/^([`~]+)/);
    const fence = fenceMatch?.[1] ?? '```';
    const fenceDelimiter = fence[0] as '`' | '~';
    const fenceLength = fence.length;

    return helpers.createNode(
      'codeBlock',
      {
        language: token.lang || null,
        fenceDelimiter,
        fenceLength,
      },
      token.text ? [helpers.createTextNode(token.text)] : [],
    );
  },

  renderMarkdown(node: any, h: any) {
    const language = node.attrs?.language || '';
    const delim = node.attrs?.fenceDelimiter ?? '`';
    const len = node.attrs?.fenceLength ?? 3;
    const fence = delim.repeat(len);

    if (!node.content) {
      return `${fence}${language}\n\n${fence}`;
    }
    const lines = [`${fence}${language}`, h.renderChildren(node.content), fence];
    return lines.join('\n');
  },
});
