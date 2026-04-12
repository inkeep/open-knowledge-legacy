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
  // Higher priority ensures the suggestion plugin's handleKeyDown fires before
  // TipTap's base keymap (Enter → split block), so Enter completes a suggestion.
  priority: 200,

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addProseMirrorPlugins() {
    return [createWikiLinkSuggestionPlugin(this.editor)];
  },
});
