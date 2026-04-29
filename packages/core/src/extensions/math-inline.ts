import { Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (formula: string) => ReturnType;
    };
  }
}

/**
 * mathInline — PM atom for live-rendered inline math (lifts NG-M11 per
 * `specs/2026-04-29-math-canonical-and-syntax/` Phase 3).
 *
 * Shape: `atom: true, inline: true, group: 'inline', selectable: true`.
 * The formula lives on the `formula` attr (LaTeX source string); KaTeX
 * renders inline-flow via the app-side NodeView (`MathInlineView.tsx`,
 * registered via `addNodeView`).
 *
 * Authoring forms that resolve to this PM node:
 *   - `$x$` markdown (inline math via remark-math, `singleDollarTextMath: true`)
 *   - `$$x$$` mid-paragraph (remark-math classifies single-line as inline math)
 *   - `<InlineMath formula="x" />` MDX JSX (mdxJsxTextElement → mathInline)
 *
 * Block math (`$$\n…\n$$`, ` ```math `, `<Math>`) lands on `jsxComponent`
 * via the `<Math>` canonical descriptor — see `Math` in
 * `registry/built-ins.ts`.
 *
 * ## Why a dedicated PM node, not jsxInline + descriptor dispatch
 *
 * `jsxInline` is intentionally render-less per NG14 ("renders as visible
 * source text in WYSIWYG, no live React render, no PropPanel"). Lifting
 * NG14 to extend descriptor dispatch into the inline group would touch
 * every inline JSX call site — out of scope for math support. A
 * standalone inline atom keeps the change additive: math gets live
 * inline rendering without re-architecting `jsxInline`.
 *
 * The descriptor registry stays "all-block" — `<InlineMath>` is not a
 * registered descriptor; it maps directly to this PM node via a
 * special-case in the mdxJsxTextElement handler.
 *
 * See SPEC §6 Phase 3.
 */
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  priority: 60,

  addAttributes() {
    return {
      formula: { default: '' },
      id: { default: null },
      // Forward-compat per NG-M5 — reserved for future MathJax / Typst /
      // AsciiMath substrates. KaTeX-only at ship.
      language: { default: 'latex' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math-inline]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return {
            formula: node.getAttribute('data-formula') || '',
            id: node.getAttribute('id') || null,
            language: node.getAttribute('data-language') || 'latex',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        'data-math-inline': '',
        'data-formula': HTMLAttributes.formula,
        'data-language': HTMLAttributes.language,
        ...(HTMLAttributes.id ? { id: HTMLAttributes.id } : {}),
      },
    ];
  },

  addCommands() {
    return {
      insertMathInline:
        (formula: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { formula },
          });
        },
    };
  },
});
