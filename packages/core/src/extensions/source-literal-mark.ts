/**
 * sourceLiteral — PM-level mark for text that must serialize verbatim.
 *
 * Used for markdown constructs that this editor cannot faithfully represent as
 * rich-text structure, or that the serializer would otherwise canonicalize to a
 * different byte form (for example, empty-label inline links like `[]()` or a
 * lone trailing backslash).
 * The marked text renders as ordinary text in the editor, but markdown
 * serialization reads `sourceRaw` and emits the exact source bytes.
 */

import { Mark } from '@tiptap/core';

export const SourceLiteralMark = Mark.create({
  name: 'sourceLiteral',
  priority: 10,
  excludes: '',
  inclusive: false,

  addAttributes() {
    return {
      sourceRaw: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-source-literal]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { 'data-source-literal': '', ...HTMLAttributes }, 0];
  },
});

export function isValidSourceLiteralRaw(sourceRaw: unknown, visibleText: unknown): boolean {
  if (typeof sourceRaw !== 'string' || typeof visibleText !== 'string') return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: this is exactly the set we are rejecting.
  if (/[\x00-\x1F\x7F]/.test(sourceRaw)) return false;
  const normalizedRaw = sourceRaw.replaceAll(' ', ' ');
  const normalizedVisible = visibleText.replaceAll(' ', ' ');
  if (normalizedRaw === normalizedVisible) return true;
  return stripMarkdownBackslashEscapes(normalizedRaw) === normalizedVisible;
}

function stripMarkdownBackslashEscapes(s: string): string {
  return s.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}
