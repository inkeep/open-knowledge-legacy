import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ReactRenderer } from '@tiptap/react';
import fuzzysort from 'fuzzysort';
import { WikiLinkSuggestionMenu } from '../wiki-link-suggestion/WikiLinkSuggestionMenu';

export const wikiLinkSuggestionKey = new PluginKey('wikiLinkSuggestion');

export interface PageItem {
  docName: string;
  title: string;
}

interface WikiLinkSuggestionState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
  selectedIndex: number;
}

const INITIAL_STATE: WikiLinkSuggestionState = {
  active: false,
  range: null,
  query: '',
  selectedIndex: 0,
};

const MAX_ITEMS = 8;

export function filterPages(pages: PageItem[], query: string): PageItem[] {
  if (!query) return pages.slice(0, MAX_ITEMS);
  const results = fuzzysort.go(query, pages, { key: 'title', threshold: -10000 });
  return results.map((r) => r.obj).slice(0, MAX_ITEMS);
}

async function fetchPages(): Promise<PageItem[]> {
  const r = await fetch('/api/pages');
  const data = (await r.json()) as { pages?: Array<{ docName: string; title: string }> };
  if (Array.isArray(data.pages)) {
    return data.pages;
  }
  return [];
}

export function createWikiLinkSuggestionPlugin(editor: Editor): Plugin {
  // Mutable state shared between handleKeyDown and view
  let cachedPages: PageItem[] = [];
  let currentFiltered: PageItem[] = [];

  return new Plugin({
    key: wikiLinkSuggestionKey,

    state: {
      init(): WikiLinkSuggestionState {
        return INITIAL_STATE;
      },

      apply(tr, prev): WikiLinkSuggestionState {
        // Handle explicit meta commands
        const meta = tr.getMeta(wikiLinkSuggestionKey);
        if (meta?.close) return INITIAL_STATE;
        if (meta?.setIndex !== undefined) {
          return { ...prev, selectedIndex: meta.setIndex };
        }

        const { selection } = tr;
        const { $from } = selection;

        // Only respond to cursor (collapsed) selections
        if (!selection.empty) return INITIAL_STATE;

        // Get block text from start up to cursor
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');

        // Match [[ followed by any non-]] chars
        const match = textBefore.match(/\[\[([^\]]*)$/);
        if (!match) {
          if (prev.active) return INITIAL_STATE;
          return prev;
        }

        const query = match[1];
        const blockStart = $from.start();
        const triggerPos = blockStart + textBefore.lastIndexOf('[[');
        const range = { from: triggerPos, to: $from.pos };

        const clampedIndex = Math.min(
          prev.active ? prev.selectedIndex : 0,
          Math.max(0, currentFiltered.length - 1),
        );

        return {
          active: true,
          range,
          query,
          selectedIndex: clampedIndex,
        };
      },
    },

    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const state = wikiLinkSuggestionKey.getState(view.state) as
          | WikiLinkSuggestionState
          | undefined;
        if (!state?.active) return false;

        const count = currentFiltered.length;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (count === 0) return true;
          const next = (state.selectedIndex + 1) % count;
          view.dispatch(view.state.tr.setMeta(wikiLinkSuggestionKey, { setIndex: next }));
          return true;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (count === 0) return true;
          const next = (state.selectedIndex - 1 + count) % count;
          view.dispatch(view.state.tr.setMeta(wikiLinkSuggestionKey, { setIndex: next }));
          return true;
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const item = currentFiltered[state.selectedIndex];
          if (item && state.range) {
            const range = state.range;
            view.dispatch(view.state.tr.setMeta(wikiLinkSuggestionKey, { close: true }));
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: 'wikiLink',
                attrs: { target: item.docName, alias: null, anchor: null },
              })
              .run();
          }
          return true;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(wikiLinkSuggestionKey, { close: true }));
          return true;
        }

        return false;
      },
    },

    view() {
      let renderer: ReactRenderer<typeof WikiLinkSuggestionMenu> | null = null;
      let popup: HTMLDivElement | null = null;

      const destroy = () => {
        renderer?.destroy();
        renderer = null;
        popup?.remove();
        popup = null;
        // Clear cache so next open gets fresh data
        cachedPages = [];
        currentFiltered = [];
      };

      const updatePosition = (view: EditorView, from: number) => {
        if (!popup) return;
        try {
          const coords = view.coordsAtPos(from);
          popup.style.left = `${coords.left}px`;
          popup.style.top = `${coords.bottom + 4}px`;
        } catch {
          destroy();
        }
      };

      return {
        update(view: EditorView) {
          const state = wikiLinkSuggestionKey.getState(view.state) as
            | WikiLinkSuggestionState
            | undefined;

          if (!state?.active) {
            if (renderer) destroy();
            return;
          }

          // Re-filter with latest query
          currentFiltered = filterPages(cachedPages, state.query);

          const onSelect = (item: PageItem) => {
            const s = wikiLinkSuggestionKey.getState(view.state) as
              | WikiLinkSuggestionState
              | undefined;
            if (s?.range) {
              const range = s.range;
              view.dispatch(view.state.tr.setMeta(wikiLinkSuggestionKey, { close: true }));
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertContent({
                  type: 'wikiLink',
                  attrs: { target: item.docName, alias: null, anchor: null },
                })
                .run();
            }
          };

          if (!renderer) {
            // First render — mount popup
            popup = document.createElement('div');
            popup.style.position = 'fixed';
            popup.style.zIndex = '50';
            document.body.appendChild(popup);

            renderer = new ReactRenderer(WikiLinkSuggestionMenu, {
              props: {
                items: currentFiltered,
                query: state.query,
                selectedIndex: state.selectedIndex,
                onSelect,
                loading: true,
              },
              editor,
            });
            popup.appendChild(renderer.element);

            // Fetch pages and update renderer immediately on resolve
            fetchPages()
              .then((pages) => {
                cachedPages = pages;
                currentFiltered = filterPages(cachedPages, state.query);
                renderer?.updateProps({
                  items: currentFiltered,
                  query: state.query,
                  selectedIndex: state.selectedIndex,
                  onSelect,
                  loading: false,
                });
              })
              .catch(() => {
                renderer?.updateProps({
                  items: [],
                  query: state.query,
                  selectedIndex: state.selectedIndex,
                  onSelect,
                  loading: false,
                });
              });
          } else {
            renderer.updateProps({
              items: currentFiltered,
              query: state.query,
              selectedIndex: state.selectedIndex,
              onSelect,
              loading: false,
            });
          }

          if (state.range) {
            updatePosition(view, state.range.from);
          }
        },

        destroy() {
          destroy();
        },
      };
    },
  });
}
