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

export interface HeadingEntry {
  level: number;
  text: string;
  slug: string;
}

export type WikiLinkSuggestionItem =
  | { kind: 'page'; docName: string; title: string }
  | { kind: 'create'; docName: string; title: string; actionLabel: string }
  | { kind: 'anchor'; docName: string; level: number; text: string; slug: string };

interface WikiLinkSuggestionState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
  selectedIndex: number;
}

interface ParsedQuery {
  mode: 'page' | 'anchor';
  /** The page slug before `#` (only set in anchor mode). */
  pageTarget: string;
  /** The text after `#` used to filter headings. */
  anchorQuery: string;
}

const INITIAL_STATE: WikiLinkSuggestionState = {
  active: false,
  range: null,
  query: '',
  selectedIndex: 0,
};

const MAX_ITEMS = 8;

/** Split `query` on the first `#` with a non-empty left side. */
export function parseQuery(query: string): ParsedQuery {
  const hashIdx = query.indexOf('#');
  if (hashIdx > 0) {
    return {
      mode: 'anchor',
      pageTarget: query.slice(0, hashIdx),
      anchorQuery: query.slice(hashIdx + 1),
    };
  }
  return { mode: 'page', pageTarget: '', anchorQuery: '' };
}

export function filterPages(pages: PageItem[], query: string): PageItem[] {
  if (!query) return pages.slice(0, MAX_ITEMS);
  const results = fuzzysort.go(query, pages, { keys: ['title', 'docName'], threshold: -10000 });
  return results.map((r) => r.obj).slice(0, MAX_ITEMS);
}

export function filterHeadings(headings: HeadingEntry[], anchorQuery: string): HeadingEntry[] {
  if (!anchorQuery) return headings.slice(0, MAX_ITEMS);
  const results = fuzzysort.go(anchorQuery, headings, { key: 'text', threshold: -10000 });
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

export function buildAnchorItems(
  docName: string,
  headings: HeadingEntry[],
  anchorQuery: string,
): WikiLinkSuggestionItem[] {
  return filterHeadings(headings, anchorQuery).map((h) => ({
    kind: 'anchor',
    docName,
    level: h.level,
    text: h.text,
    slug: h.slug,
  }));
}

async function fetchPages(): Promise<PageItem[]> {
  const r = await fetch('/api/pages');
  if (!r.ok) throw new Error(`/api/pages responded with ${r.status}`);
  const data = (await r.json()) as { pages?: Array<{ docName: string; title: string }> };
  return Array.isArray(data.pages) ? data.pages : [];
}

async function fetchHeadings(docName: string): Promise<HeadingEntry[]> {
  const r = await fetch(`/api/page-headings?docName=${encodeURIComponent(docName)}`);
  if (!r.ok) throw new Error(`/api/page-headings responded with ${r.status}`);
  const data = (await r.json()) as { ok: boolean; headings?: HeadingEntry[] };
  return data.ok && Array.isArray(data.headings) ? data.headings : [];
}

export function createWikiLinkSuggestionPlugin(editor: Editor): Plugin {
  // Mutable closure state
  let cachedPages: PageItem[] = [];
  let pagesLoaded = false;
  let cachedHeadings = new Map<string, HeadingEntry[]>();
  let anchorFetchingFor: string | null = null; // docName currently in flight
  let currentFiltered: WikiLinkSuggestionItem[] = [];
  let fetchError: string | null = null;

  function rebuildFiltered(query: string): WikiLinkSuggestionItem[] {
    const { mode, pageTarget, anchorQuery } = parseQuery(query);
    if (mode === 'anchor') {
      const headings = cachedHeadings.get(pageTarget);
      return headings ? buildAnchorItems(pageTarget, headings, anchorQuery) : [];
    }
    return buildSuggestionItems(cachedPages, query);
  }

  function isLoading(query: string): boolean {
    const { mode, pageTarget } = parseQuery(query);
    if (mode === 'anchor') return anchorFetchingFor === pageTarget;
    return !pagesLoaded;
  }

  function insertWikiLink(
    view: EditorView,
    state: WikiLinkSuggestionState,
    item?: WikiLinkSuggestionItem,
  ): boolean {
    if (!state.range) return false;

    let attrs: { target: string; alias: string | null; anchor: string | null } | null = null;

    if (item?.kind === 'page') {
      attrs = { target: item.docName, alias: null, anchor: null };
    } else if (item?.kind === 'anchor') {
      attrs = { target: item.docName, alias: null, anchor: item.slug };
    } else if (item?.kind === 'create') {
      attrs = buildUnresolvedWikiLinkAttrs(item.title);
    } else {
      // Fallback: use query
      const { mode, pageTarget, anchorQuery } = parseQuery(state.query);
      if (mode === 'anchor' && pageTarget) {
        attrs = { target: pageTarget, alias: null, anchor: anchorQuery.trim() || null };
      } else {
        attrs = buildUnresolvedWikiLinkAttrs(state.query);
      }
    }

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

    // Delete the adjacent wikiLink atom when the suggestion menu is not active.
    // addKeyboardShortcuts() creates a separate TipTap-managed keymap plugin that
    // interferes with TipTap's built-in handleBackspace chain for normal text
    // deletion. Handling it here, in the same handleKeyDown prop already used for
    // Enter/Escape/Arrow, falls through naturally when the atom check fails —
    // identical to origin/main behaviour.
    if (!state?.active) {
      if (event.key === 'Backspace') {
        const { selection } = view.state;
        if (selection.empty) {
          const nodeBefore = selection.$from.nodeBefore;
          if (nodeBefore?.type.name === 'wikiLink') {
            view.dispatch(
              view.state.tr.delete(selection.from - nodeBefore.nodeSize, selection.from),
            );
            return true;
          }
        }
      }
      if (event.key === 'Delete') {
        const { selection } = view.state;
        if (selection.empty) {
          const nodeAfter = selection.$from.nodeAfter;
          if (nodeAfter?.type.name === 'wikiLink') {
            view.dispatch(
              view.state.tr.delete(selection.from, selection.from + nodeAfter.nodeSize),
            );
            return true;
          }
        }
      }
      return false;
    }

    const count = currentFiltered.length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (count === 0) return true;
      view.dispatch(
        view.state.tr.setMeta(wikiLinkSuggestionKey, {
          setIndex: (state.selectedIndex + 1) % count,
        }),
      );
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (count === 0) return true;
      view.dispatch(
        view.state.tr.setMeta(wikiLinkSuggestionKey, {
          setIndex: (state.selectedIndex - 1 + count) % count,
        }),
      );
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
      return insertWikiLink(view, state, currentFiltered[state.selectedIndex]);
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
        const meta = tr.getMeta(wikiLinkSuggestionKey);
        if (meta?.close) return INITIAL_STATE;
        if (meta?.setIndex !== undefined) {
          return { ...prev, selectedIndex: meta.setIndex };
        }

        const { selection } = tr;
        const { $from } = selection;

        if (!selection.empty) return INITIAL_STATE;

        const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
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

        return { active: true, range, query, selectedIndex: clampedIndex };
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
        cachedPages = [];
        cachedHeadings = new Map();
        currentFiltered = [];
        fetchError = null;
        pagesLoaded = false;
        anchorFetchingFor = null;
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

      /** Kick off a heading fetch for `docName` if not already cached/loading. */
      const ensureHeadings = (docName: string) => {
        if (!docName || cachedHeadings.has(docName) || anchorFetchingFor === docName) return;
        anchorFetchingFor = docName;
        fetchHeadings(docName)
          .then((headings) => {
            cachedHeadings.set(docName, headings);
            anchorFetchingFor = null;
            const s = wikiLinkSuggestionKey.getState(editor.state) as
              | WikiLinkSuggestionState
              | undefined;
            if (!s?.active || !renderer) return;
            const { mode, pageTarget, anchorQuery } = parseQuery(s.query);
            if (mode === 'anchor' && pageTarget === docName) {
              currentFiltered = buildAnchorItems(docName, headings, anchorQuery);
              renderer.updateProps({
                items: currentFiltered,
                query: s.query,
                selectedIndex: s.selectedIndex,
                loading: false,
                error: null,
              });
            }
          })
          .catch((err) => {
            console.error('[wiki-link-suggestion] Failed to fetch headings:', err);
            cachedHeadings.set(docName, []); // treat as empty so we don't retry
            anchorFetchingFor = null;
          });
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

          const { mode, pageTarget, anchorQuery } = parseQuery(state.query);

          // Kick off any needed background fetches
          if (mode === 'anchor' && pageTarget) ensureHeadings(pageTarget);

          // Rebuild filtered items with latest cached data
          currentFiltered = rebuildFiltered(state.query);
          const loading = isLoading(state.query);

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
                mode,
                pageTarget,
                anchorQuery,
              },
              editor,
            });
            popup.appendChild(renderer.element);

            // Always fetch pages (needed if user stays in / returns to page mode)
            fetchPages()
              .then((pages) => {
                fetchError = null;
                pagesLoaded = true;
                cachedPages = pages;
                const s = wikiLinkSuggestionKey.getState(editor.state) as
                  | WikiLinkSuggestionState
                  | undefined;
                if (!s?.active || !renderer) return;
                const p = parseQuery(s.query);
                // Only update renderer if currently in page mode (anchor has its own loading)
                if (p.mode === 'page') {
                  currentFiltered = buildSuggestionItems(pages, s.query);
                  renderer.updateProps({
                    items: currentFiltered,
                    query: s.query,
                    selectedIndex: s.selectedIndex,
                    onSelect,
                    loading: false,
                    error: null,
                    mode: p.mode,
                    pageTarget: p.pageTarget,
                    anchorQuery: p.anchorQuery,
                  });
                }
              })
              .catch((err) => {
                console.error('[wiki-link-suggestion] Failed to fetch pages:', err);
                pagesLoaded = true;
                fetchError = 'Failed to load pages. You can still insert an unresolved link.';
                const s = wikiLinkSuggestionKey.getState(editor.state) as
                  | WikiLinkSuggestionState
                  | undefined;
                if (!s?.active || !renderer) return;
                const p = parseQuery(s.query);
                if (p.mode === 'page') {
                  currentFiltered = buildSuggestionItems([], s.query);
                  renderer.updateProps({
                    items: currentFiltered,
                    query: s.query,
                    selectedIndex: s.selectedIndex,
                    onSelect,
                    loading: false,
                    error: fetchError,
                    mode: p.mode,
                    pageTarget: p.pageTarget,
                    anchorQuery: p.anchorQuery,
                  });
                }
              });
          } else {
            renderer.updateProps({
              items: currentFiltered,
              query: state.query,
              selectedIndex: state.selectedIndex,
              onSelect,
              loading,
              error: mode === 'page' ? fetchError : null,
              mode,
              pageTarget,
              anchorQuery,
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
