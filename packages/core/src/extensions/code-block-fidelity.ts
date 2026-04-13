/**
 * CodeBlock extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-code-block (preserving setCodeBlock/toggleCodeBlock
 * commands, input rules, Tab indentation, and exit-on-triple-enter behavior)
 * and adds fidelity attributes for fence delimiter character (` vs ~) and
 * fence length.
 *
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

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
