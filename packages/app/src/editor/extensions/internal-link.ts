/**
 * App-layer LinkFidelity extension — extends core's LinkFidelity with a
 * React mark view that renders internal KB links with resolved/unresolved
 * chip styling (matching WikiLinkView) and external links with an icon.
 *
 * renderHTML is overridden to emit a neutral <span> wrapper instead of the
 * default <a> element. Without this, TipTap mounts the React mark view
 * *inside* the <a> produced by renderHTML, creating nested <a> elements
 * that cause the browser to apply its default link styles (blue, underline)
 * through to the chip's text content.
 */
import { LinkFidelity } from '@inkeep/open-knowledge-core';
import { mergeAttributes } from '@tiptap/core';
import { ReactMarkViewRenderer } from '@tiptap/react';
import { InternalLinkView } from './InternalLinkView';

export const InternalLink = LinkFidelity.extend({
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-link': '' }), 0];
  },

  addMarkView() {
    return ReactMarkViewRenderer(InternalLinkView);
  },
});
