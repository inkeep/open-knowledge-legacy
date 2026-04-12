import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ReactRenderer } from '@tiptap/react';
import fuzzysort from 'fuzzysort';
import { WikiLinkSuggestionMenu } from '../wiki-link-suggestion/WikiLinkSuggestionMenu';
import { buildUnresolvedWikiLinkAttrs } from './wiki-link-helpers';

export const wikiLinkSuggestionKey = new PluginKey('wikiLinkSuggestion');

export interface PageItem {
  docName: string;
  title: string;
}

export type WikiLinkSuggestionItem =
  | {
      kind: 'page';
      docName: string;
      title: string;
    }
  | {
      kind: 'create';
      docName: string;
      title: string;
      actionLabel: string;
    };

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

export function buildSuggestionItems(pages: PageItem[], query: string): WikiLinkSuggestionItem[] {
  const filtered = filterPages(pages, query);
  if (filtered.length > 0) {
    return filtered.map((item) => ({ kind: 'page', ...item }));
  }

  const attrs = buildUnresolvedWikiLinkAttrs(query);
  if (!attrs) return [];

  return [
    {
      kind: 'create',
      docName: attrs.target,
      title: query.trim(),
      actionLabel: `Insert unresolved link "${query.trim()}"`,
    },
  ];
}

async function fetchPages(): Promise<PageItem[]> {
  const r = await fetch('/api/pages');
  if (!r.ok) {
    throw new Error(`/api/pages responded with ${r.status}`);
  }
  const data = (await r.json()) as { pages?: Array<{ docName: string; title: string }> };
  if (Array.isArray(data.pages)) {
    return data.pages;
  }
  return [];
}

export function createWikiLinkSuggestionPlugin(editor: Editor): Plugin {
  // Mutable state shared between handleKeyDown and view
  let cachedPages: PageItem[] = [];
  let currentFiltered: WikiLinkSuggestionItem[] = [];
  let fetchError: string | null = null;

  function insertWikiLink(
    view: EditorView,
    state: WikiLinkSuggestionState,
    item?: WikiLinkSuggestionItem,
  ): boolean {
    if (!state.range) return false;

    const attrs =
      item?.kind === 'page'
        ? { target: item.docName, alias: null, anchor: null }
        : item?.kind === 'create'
          ? buildUnresolvedWikiLinkAttrs(item.title)
          : buildUnresolvedWikiLinkAttrs(state.query);
    if (!attrs) return false;

    view.dispatch(view.state.tr.setMeta(wikiLinkSuggestionKey, { close: true }));
    editor
      .chain()
      .focus()
      .deleteRange(state.range)
      .insertContent({ type: 'wikiLink', attrs })
      .run();
    return true;
  }

  function handleSuggestionKeyDown(view: EditorView, event: KeyboardEvent): boolean {
    const state = wikiLinkSuggestionKey.getState(view.state) as WikiLinkSuggestionState | undefined;
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

    if (
      event.key === 'Enter' ||
      event.key === 'Return' ||
      event.key === 'Tab' ||
      event.code === 'NumpadEnter'
    ) {
      event.preventDefault();
      event.stopPropagation();
      const item = currentFiltered[state.selectedIndex];
      return insertWikiLink(view, state, item);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      view.dispatch(view.state.tr.setMeta(wikiLinkSuggestionKey, { close: true }));
      return true;
    }

    return false;
  }

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
        return handleSuggestionKeyDown(view, event);
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
        fetchError = null;
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
          currentFiltered = buildSuggestionItems(cachedPages, state.query);

          const onSelect = (item: WikiLinkSuggestionItem) => {
            const s = wikiLinkSuggestionKey.getState(view.state) as
              | WikiLinkSuggestionState
              | undefined;
            if (s) insertWikiLink(view, s, item);
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
                error: null,
              },
              editor,
            });
            popup.appendChild(renderer.element);

            // Fetch pages and update renderer immediately on resolve
            fetchPages()
              .then((pages) => {
                fetchError = null;
                cachedPages = pages;
                const currentState = wikiLinkSuggestionKey.getState(editor.state) as
                  | WikiLinkSuggestionState
                  | undefined;
                if (!currentState?.active) return;
                currentFiltered = buildSuggestionItems(cachedPages, currentState.query);
                renderer?.updateProps({
                  items: currentFiltered,
                  query: currentState.query,
                  selectedIndex: currentState.selectedIndex,
                  onSelect,
                  loading: false,
                  error: null,
                });
              })
              .catch((err) => {
                console.error('[wiki-link-suggestion] Failed to fetch pages:', err);
                fetchError = 'Failed to load pages. You can still insert an unresolved link.';
                const currentState = wikiLinkSuggestionKey.getState(editor.state) as
                  | WikiLinkSuggestionState
                  | undefined;
                if (!currentState?.active) return;
                currentFiltered = buildSuggestionItems([], currentState.query);
                renderer?.updateProps({
                  items: currentFiltered,
                  query: currentState.query,
                  selectedIndex: currentState.selectedIndex,
                  onSelect,
                  loading: false,
                  error: fetchError,
                });
              });
          } else {
            renderer.updateProps({
              items: currentFiltered,
              query: state.query,
              selectedIndex: state.selectedIndex,
              onSelect,
              loading: false,
              error: fetchError,
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
