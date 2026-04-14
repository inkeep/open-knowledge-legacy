import { Node } from '@tiptap/core';

/**
 * jsxInline — inline PM node for MDX inline JSX (`<Icon />`, `<Badge />`)
 * shipped at the T1 Layer 3 target shape from day one.
 *
 * Shape: `atom: false, content: 'inline*'`. Children are populated from
 * `mdxJsxTextElement.children` (already parsed by remark-mdx). No atom→non-atom
 * migration ever needed — ships at the final shape.
 *
 * NodeView renders with `contenteditable: 'false'` — children render inline
 * for visual fidelity but are NOT editable in WYSIWYG. Edits route through
 * source mode → Y.Text → Observer B → fresh parse → new jsxInline with
 * refreshed sourceRaw.
 *
 * `sourceRaw` is canonical for serialization; structured `attributes` are
 * derived at parse time, never independently mutated. This transitional
 * behavior (read-only children, source-mode-only edits) holds until T1
 * Layer 3 adds structured-editing UI + serialization.
 *
 * See SPEC §9 R3, D3, greenfield precedent #10.
 */
export const JsxInline = Node.create({
  name: 'jsxInline',
  group: 'inline',
  inline: true,
  atom: false,
  content: 'inline*',
  isolating: true,
  selectable: true,
  priority: 60,

  addAttributes() {
    return {
      attributes: { default: [] },
      sourceRaw: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-jsx-inline]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return {
            sourceRaw: node.getAttribute('data-source-raw') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        'data-jsx-inline': '',
        'data-source-raw': HTMLAttributes.sourceRaw,
        contenteditable: 'false',
      },
      0,
    ];
  },

  addNodeView() {
    return ({ HTMLAttributes }) => {
      const dom = document.createElement('span');
      dom.setAttribute('data-jsx-inline', '');
      dom.setAttribute('contenteditable', 'false');
      dom.classList.add('jsx-inline');

      if (HTMLAttributes.sourceRaw) {
        dom.setAttribute('data-source-raw', HTMLAttributes.sourceRaw);
      }

      const contentDOM = document.createElement('span');
      contentDOM.classList.add('jsx-inline-content');
      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM,
        ignoreMutation: () => true,
      };
    };
  },
});
