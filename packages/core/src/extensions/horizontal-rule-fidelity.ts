/**
 * HorizontalRule extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-horizontal-rule (preserving setHorizontalRule
 * command and input rules for ---, ___, ***) and adds the horizontalRuleRaw
 * attribute to preserve the exact source form of the thematic break.
 */

import HorizontalRule from '@tiptap/extension-horizontal-rule';

export const HorizontalRuleFidelity = HorizontalRule.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      horizontalRuleRaw: { default: '---' },
    };
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
