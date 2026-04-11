/**
 * App-specific WikiLink extension — extends core with a React NodeView so
 * wiki-links render as inline chips in the browser editor, plus a [[ suggestion
 * popup for autocompleting page names.
 */
import { WikiLink as BaseWikiLink } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { WikiLinkView } from './WikiLinkView';
import { createWikiLinkSuggestionPlugin } from './wiki-link-suggestion';

export const WikiLink = BaseWikiLink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addProseMirrorPlugins() {
    return [createWikiLinkSuggestionPlugin(this.editor)];
  },
});
