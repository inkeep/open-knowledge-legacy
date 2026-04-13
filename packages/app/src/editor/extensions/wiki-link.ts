/**
 * App-specific WikiLink extension — extends core with a React NodeView so
 * wiki-links render as inline chips in the browser editor, plus a [[ suggestion
 * popup for autocompleting page names and section headings (anchor mode via #).
 */
import { WikiLink as BaseWikiLink } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { WikiLinkView } from './WikiLinkView';
import { configureWikiLinkSuggestion, wikiLinkSuggestionKey } from './wiki-link-suggestion';

export const WikiLink = BaseWikiLink.extend({
  // Higher priority ensures the suggestion plugin's handleKeyDown fires before
  // TipTap's base keymap (Enter → split block, Backspace → joinBackward), so
  // Enter completes a suggestion and Backspace/Delete can target adjacent atoms.
  priority: 200,

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        // WARN: Reads @tiptap/suggestion internal state — verify shape on upgrades.
        // The `active` field is not part of a public API; the cast assumes
        // the shape from @tiptap/suggestion source (state.init / state.apply).
        const pluginState = wikiLinkSuggestionKey.getState(this.editor.state) as
          | { active: boolean }
          | undefined;
        if (pluginState?.active) return false;

        const { selection } = this.editor.state;
        if (!selection.empty) return false;

        const nodeBefore = selection.$from.nodeBefore;
        if (nodeBefore?.type.name === 'wikiLink') {
          const { state, view } = this.editor;
          view.dispatch(state.tr.delete(selection.from - nodeBefore.nodeSize, selection.from));
          return true;
        }
        return false;
      },
      Delete: () => {
        // WARN: Same internal state dependency as Backspace above.
        const pluginState = wikiLinkSuggestionKey.getState(this.editor.state) as
          | { active: boolean }
          | undefined;
        if (pluginState?.active) return false;

        const { selection } = this.editor.state;
        if (!selection.empty) return false;

        const nodeAfter = selection.$from.nodeAfter;
        if (nodeAfter?.type.name === 'wikiLink') {
          const { state, view } = this.editor;
          view.dispatch(state.tr.delete(selection.from, selection.from + nodeAfter.nodeSize));
          return true;
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [configureWikiLinkSuggestion(this.editor)];
  },
});
