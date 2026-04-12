/**
 * Heading extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-heading (preserving setHeading/toggleHeading
 * commands, input rules, and keyboard shortcuts) and adds the headingStyle
 * attribute to distinguish ATX (# ...) from setext (underline) headings.
 */

import type { MarkdownParseHelpers, MarkdownToken } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';

export const HeadingFidelity = Heading.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      headingStyle: { default: 'atx' },
    };
  },

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const raw = (token as any).raw ?? '';
    const isSetext = /\n[=-]+\s*$/.test(raw);
    return helpers.createNode(
      'heading',
      { level: (token as any).depth || 1, headingStyle: isSetext ? 'setext' : 'atx' },
      helpers.parseInline(token.tokens || []),
    );
  },

  renderMarkdown(node: Record<string, any>, h: Record<string, any>) {
    const level = node.attrs?.level ? Number.parseInt(node.attrs.level, 10) : 1;
    if (!node.content) {
      return '';
    }
    const text = h.renderChildren(node.content);

    if (node.attrs?.headingStyle === 'setext' && (level === 1 || level === 2)) {
      const underline = level === 1 ? '=' : '-';
      return `${text}\n${underline.repeat(Math.max(text.length, 3))}`;
    }

    return `${'#'.repeat(level)} ${text}`;
  },
});
