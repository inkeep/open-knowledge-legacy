/**
 * App-layer LinkFidelity extension — extends core's LinkFidelity with a
 * React mark view that renders internal KB links with resolved/unresolved
 * chip styling (matching WikiLinkView) and external links with an icon.
 */
import { LinkFidelity } from '@inkeep/open-knowledge-core';
import { ReactMarkViewRenderer } from '@tiptap/react';
import { InternalLinkView } from './InternalLinkView';

export const InternalLink = LinkFidelity.extend({
  addMarkView() {
    return ReactMarkViewRenderer(InternalLinkView);
  },
});
