/**
 * CodeBlock extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-code-block (preserving setCodeBlock/toggleCodeBlock
 * commands, input rules, Tab indentation, and exit-on-triple-enter behavior)
 * and adds fidelity attributes for fence delimiter character (` vs ~) and
 * fence length.
 */

import type { MarkdownToken } from '@tiptap/core';
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

  markdownTokenName: 'code',

  parseMarkdown(token: MarkdownToken, helpers: any) {
    const raw = (token as any).raw ?? '';
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
        language: (token as any).lang || null,
        fenceDelimiter,
        fenceLength,
      },
      (token as any).text ? [helpers.createTextNode((token as any).text)] : [],
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
