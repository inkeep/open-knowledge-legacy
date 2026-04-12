/**
 * Emphasis (italic/bold) mark overrides for source-text fidelity.
 *
 * Preserves the delimiter choice (* vs _) via emphDelimiter/strongDelimiter
 * attributes extracted from token.raw.
 */

import { Mark } from '@tiptap/core';

export const ItalicFidelity = Mark.create({
  name: 'italic',
  priority: 60,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      emphDelimiter: { default: '*' },
    };
  },

  parseHTML() {
    return [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['em', HTMLAttributes, 0];
  },

  markdownTokenName: 'em',

  parseMarkdown(token: any, helpers: any) {
    const raw = token.raw ?? '';
    const delim = raw.startsWith('_') ? '_' : '*';
    return helpers.applyMark('italic', helpers.parseInline(token.tokens || []), {
      emphDelimiter: delim,
    });
  },

  renderMarkdown(node: any, h: any) {
    const d = node.attrs?.emphDelimiter ?? '*';
    return `${d}${h.renderChildren(node)}${d}`;
  },
});

export const BoldFidelity = Mark.create({
  name: 'bold',
  priority: 60,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      strongDelimiter: { default: '**' },
    };
  },

  parseHTML() {
    return [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node: HTMLElement) => node.style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (mark: any) => mark.type.name === 'bold' },
      {
        style: 'font-weight',
        getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['strong', HTMLAttributes, 0];
  },

  markdownTokenName: 'strong',

  parseMarkdown(token: any, helpers: any) {
    const raw = token.raw ?? '';
    const delim = raw.startsWith('__') ? '__' : '**';
    return helpers.applyMark('bold', helpers.parseInline(token.tokens || []), {
      strongDelimiter: delim,
    });
  },

  renderMarkdown(node: any, h: any) {
    const d = node.attrs?.strongDelimiter ?? '**';
    return `${d}${h.renderChildren(node)}${d}`;
  },
});
