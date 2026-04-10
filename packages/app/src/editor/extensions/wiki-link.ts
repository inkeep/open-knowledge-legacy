/**
 * App-specific WikiLink extension — extends core with a React NodeView so
 * wiki-links render as inline chips in the browser editor.
 */
import { WikiLink as BaseWikiLink } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { WikiLinkView } from './WikiLinkView';

export const WikiLink = BaseWikiLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },
});
