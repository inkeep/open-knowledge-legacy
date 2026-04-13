/**
 * LinkRefDef custom node for source-text fidelity (Option A — doc-footer).
 *
 * Atom node that stores link reference definitions ([label]: url "title").
 * Rendered as footnote-style definitions at the document position where they appear.
 *
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

import { Node } from '@tiptap/core';

export const LinkRefDefFidelity = Node.create({
  name: 'linkRefDef',
  group: 'block',
  atom: true,
  priority: 60,

  addAttributes() {
    return {
      label: { default: '' },
      href: { default: '' },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-link-ref-def]' }];
  },

  // biome-ignore lint/suspicious/noExplicitAny: TipTap renderHTML parameter — avoids importing prosemirror-model in extension file
  renderHTML({ node }: any) {
    const { label, href, title } = node.attrs;
    const display = title ? `[${label}]: ${href} "${title}"` : `[${label}]: ${href}`;
    return ['div', { 'data-link-ref-def': '', class: 'link-ref-def' }, display];
  },
});
