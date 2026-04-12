/**
 * HardBreak extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-hard-break (preserving setHardBreak command
 * and Shift+Enter shortcut) and adds the hardBreakStyle attribute to
 * distinguish backslash from two-space hard breaks.
 */

import type { MarkdownParseHelpers, MarkdownToken } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';

export const HardBreakFidelity = HardBreak.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      hardBreakStyle: { default: 'backslash' },
    };
  },

  markdownTokenName: 'br',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const raw = token.raw ?? '';
    const style = raw.startsWith('\\') ? 'backslash' : 'spaces';
    return helpers.createNode('hardBreak', { hardBreakStyle: style });
  },

  renderMarkdown(node: Record<string, any>) {
    const style = node.attrs?.hardBreakStyle ?? 'backslash';
    return style === 'backslash' ? '\\\n' : '  \n';
  },
});
