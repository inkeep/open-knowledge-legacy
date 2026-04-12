/**
 * HorizontalRule extension override for source-text fidelity.
 *
 * Preserves the exact source form of the thematic break (---, ***, ___, etc.)
 * via the horizontalRuleRaw attribute extracted from token.raw.
 */

import { Node } from '@tiptap/core';

export const HorizontalRuleFidelity = Node.create({
  name: 'horizontalRule',
  group: 'block',
  atom: true,
  priority: 60,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      horizontalRuleRaw: { default: '---' },
    };
  },

  parseHTML() {
    return [{ tag: 'hr' }];
  },

  renderHTML({ HTMLAttributes }: any) {
    return ['hr', HTMLAttributes];
  },

  markdownTokenName: 'hr',

  parseMarkdown(token: any, helpers: any) {
    const raw = (token.raw ?? '---').trim();
    return helpers.createNode('horizontalRule', { horizontalRuleRaw: raw });
  },

  renderMarkdown(node: any) {
    return node.attrs?.horizontalRuleRaw ?? '---';
  },
});
