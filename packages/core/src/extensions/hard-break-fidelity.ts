/**
 * HardBreak extension override for source-text fidelity.
 *
 * Preserves the hard break form (backslash vs two spaces) via
 * hardBreakStyle attribute extracted from token.raw.
 */

import { Node } from '@tiptap/core';

export const HardBreakFidelity = Node.create({
  name: 'hardBreak',
  inline: true,
  group: 'inline',
  selectable: false,
  linebreakReplacement: true,
  priority: 60,

  addOptions() {
    return {
      keepMarks: true,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      hardBreakStyle: { default: 'backslash' },
    };
  },

  parseHTML() {
    return [{ tag: 'br' }];
  },

  renderHTML({ HTMLAttributes }: any) {
    return ['br', HTMLAttributes];
  },

  renderText() {
    return '\n';
  },

  markdownTokenName: 'br',

  parseMarkdown(token: any, helpers: any) {
    const raw = token.raw ?? '';
    const style = raw.startsWith('\\') ? 'backslash' : 'spaces';
    return helpers.createNode('hardBreak', { hardBreakStyle: style });
  },

  renderMarkdown(node: any) {
    const style = node.attrs?.hardBreakStyle ?? 'backslash';
    return style === 'backslash' ? '\\\n' : '  \n';
  },
});
