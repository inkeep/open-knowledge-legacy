/**
 * Heading extension override for source-text fidelity.
 *
 * Preserves ATX vs setext heading style via headingStyle attribute.
 * Setext headings use = (level 1) or - (level 2) underlines.
 */

import { Node } from '@tiptap/core';

export const HeadingFidelity = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,
  priority: 60,

  addOptions() {
    return {
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      level: { default: 1 },
      headingStyle: { default: 'atx' },
    };
  },

  parseHTML() {
    return this.options.levels.map((level: number) => ({
      tag: `h${level}`,
      attrs: { level },
    }));
  },

  renderHTML({ node, HTMLAttributes }: any) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];
    return [`h${level}`, HTMLAttributes, 0];
  },

  parseMarkdown(token: any, helpers: any) {
    const raw = token.raw ?? '';
    const isSetext = /\n[=-]+\s*$/.test(raw);
    return helpers.createNode(
      'heading',
      { level: token.depth || 1, headingStyle: isSetext ? 'setext' : 'atx' },
      helpers.parseInline(token.tokens || []),
    );
  },

  renderMarkdown(node: any, h: any) {
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
