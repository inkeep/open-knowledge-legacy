/**
 * Emphasis (italic/bold) mark overrides for source-text fidelity.
 *
 * Extends @tiptap/extension-italic and @tiptap/extension-bold (preserving
 * toggleItalic/toggleBold commands, Cmd+I/Cmd+B shortcuts, and input rules)
 * and adds delimiter-choice attributes extracted from token.raw.
 */

import type { MarkdownParseHelpers, MarkdownToken } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';

export const ItalicFidelity = Italic.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      emphDelimiter: { default: '*' },
    };
  },

  markdownTokenName: 'em',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const raw = token.raw ?? '';
    const delim = raw.startsWith('_') ? '_' : '*';
    return helpers.applyMark('italic', helpers.parseInline(token.tokens || []), {
      emphDelimiter: delim,
    });
  },

  renderMarkdown(node: Record<string, any>, h: Record<string, any>) {
    const d = node.attrs?.emphDelimiter ?? '*';
    return `${d}${h.renderChildren(node)}${d}`;
  },
});

export const BoldFidelity = Bold.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      strongDelimiter: { default: '**' },
    };
  },

  markdownTokenName: 'strong',

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const raw = token.raw ?? '';
    const delim = raw.startsWith('__') ? '__' : '**';
    return helpers.applyMark('bold', helpers.parseInline(token.tokens || []), {
      strongDelimiter: delim,
    });
  },

  renderMarkdown(node: Record<string, any>, h: Record<string, any>) {
    const d = node.attrs?.strongDelimiter ?? '**';
    return `${d}${h.renderChildren(node)}${d}`;
  },
});
