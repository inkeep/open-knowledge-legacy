/**
 * LinkRefDef custom node for source-text fidelity (Option A — doc-footer).
 *
 * Atom node that stores link reference definitions ([label]: url "title").
 * Parsed from marked's 'def' token. Rendered as footnote-style definitions
 * at the document position where they appear.
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

  renderHTML({ node }: any) {
    const { label, href, title } = node.attrs;
    const display = title ? `[${label}]: ${href} "${title}"` : `[${label}]: ${href}`;
    return ['div', { 'data-link-ref-def': '', class: 'link-ref-def' }, display];
  },

  markdownTokenName: 'def',

  parseMarkdown(token: any, helpers: any) {
    if (token.type !== 'def') return [];
    return helpers.createNode('linkRefDef', {
      label: token.tag ?? '',
      href: token.href ?? '',
      title: token.title || null,
    });
  },

  renderMarkdown(node: any) {
    const { label, href, title } = node.attrs ?? {};
    if (title) {
      return `[${label}]: ${href} "${title}"`;
    }
    return `[${label}]: ${href}`;
  },
});
