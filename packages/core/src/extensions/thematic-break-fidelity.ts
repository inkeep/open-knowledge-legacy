/**
 * ThematicBreak extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-horizontal-rule (preserving setHorizontalRule
 * command and input rules for ---, ___, ***) and adds the sourceRaw
 * attribute to preserve the exact source form of the thematic break.
 *
 * Schema name is mdast-canonical per D17: 'thematicBreak' (was 'horizontalRule').
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

import HorizontalRule from '@tiptap/extension-horizontal-rule';

export const ThematicBreakFidelity = HorizontalRule.extend({
  name: 'thematicBreak',
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourceRaw: { default: '---' },
    };
  },
});
