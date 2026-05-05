import { Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnoteReference: {
      insertFootnoteReference: (identifier: string) => ReturnType;
    };
  }
}

export const FootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  priority: 60,

  addAttributes() {
    return {
      identifier: { default: '' },
      label: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote-ref]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const id = node.getAttribute('data-footnote-id') || '';
          return { identifier: id, label: id || null };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const id = String(node.attrs.identifier ?? '');
    return [
      'sup',
      {
        id: `fnref-${id}`,
        'data-footnote-ref': '',
        'data-footnote-id': id,
        class: 'footnote-ref',
      },
      ['a', { href: `#fn-${id}`, class: 'footnote-ref-link' }, `[${id}]`],
    ];
  },

  addCommands() {
    return {
      insertFootnoteReference:
        (identifier) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { identifier, label: identifier },
          }),
    };
  },
});
