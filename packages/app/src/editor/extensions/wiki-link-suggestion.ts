import { autoUpdate, computePosition, flip, offset, size } from '@floating-ui/dom';
import type { HeadingEntry } from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import fuzzysort from 'fuzzysort';
import { WikiLinkSuggestionMenu } from '../wiki-link-suggestion/WikiLinkSuggestionMenu';
import { buildUnresolvedWikiLinkAttrs } from './wiki-link-helpers';

export const wikiLinkSuggestionKey = new PluginKey('wikiLinkSuggestion');

export interface PageItem {
  docName: string;
  title: string;
}

export type WikiLinkSuggestionItem =
  | { kind: 'page'; docName: string; title: string }
  | { kind: 'create'; docName: string; title: string; actionLabel: string }
  | { kind: 'anchor'; docName: string; level: number; text: string; slug: string };

interface ParsedQuery {
  mode: 'page' | 'anchor';
  /** The page slug before `#` (only set in anchor mode). */
  pageTarget: string;
  /** The text after `#` used to filter headings. */
  anchorQuery: string;
}

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

/**
 * Custom `findSuggestionMatch` for `@tiptap/suggestion` — detects `[[` paired
 * delimiters using the same regex as the original ProseMirror plugin. The query
 * includes `#` so anchor mode (`page#heading`) works transparently.
 */
export function wikiLinkMatcher(config: {
  $position: ResolvedPos;
}): { range: { from: number; to: number }; query: string; text: string } | null {
  const { $position } = config;
  const textBefore = $position.parent.textBetween(0, $position.parentOffset, undefined, '\ufffc');
  const match = textBefore.match(/\[\[([^\]]*)$/);
  if (!match) return null;

  const query = match[1];
  const blockStart = $position.start();
  const triggerPos = blockStart + textBefore.lastIndexOf('[[');

  return {
    range: { from: triggerPos, to: $position.pos },
    query,
    text: match[0],
  };
}

export async function fetchPages(): Promise<PageItem[]> {
  const r = await fetch('/api/pages');
  if (!r.ok) throw new Error(`/api/pages responded with ${r.status}`);
  const data = (await r.json()) as { pages?: Array<{ docName: string; title: string }> };
  return Array.isArray(data.pages) ? data.pages : [];
}

export async function fetchHeadings(docName: string): Promise<HeadingEntry[]> {
  const r = await fetch(`/api/page-headings?docName=${encodeURIComponent(docName)}`);
  if (!r.ok) throw new Error(`/api/page-headings responded with ${r.status}`);
  const data = (await r.json()) as { ok: boolean; headings?: HeadingEntry[] };
  return data.ok && Array.isArray(data.headings) ? data.headings : [];
}

/**
 * Returns a `@tiptap/suggestion` plugin for wiki-link `[[` autocompletion.
 * Replaces the former hand-rolled ProseMirror Plugin with the same Suggestion
 * framework used by slash commands (PR #51), plus `onBeforeStart` and
 * `onBeforeUpdate` hooks for per-mode async loading labels.
 */
export function configureWikiLinkSuggestion(editor: Editor) {
  // Mutable closure state — reset in onExit for behavioral parity
  let cachedPages: PageItem[] = [];
  let pagesLoaded = false;
  let pagesFetching = false;
  let cachedHeadings = new Map<string, HeadingEntry[]>();
  let anchorFetchingFor: string | null = null;
  let fetchError: string | null = null;
  let anchorFetchError: string | null = null;

  return Suggestion<WikiLinkSuggestionItem>({
    editor,
    pluginKey: wikiLinkSuggestionKey,
    char: '[[',
    allowedPrefixes: null,
    findSuggestionMatch: wikiLinkMatcher,

    items: async ({ query }) => {
      const { mode, pageTarget, anchorQuery } = parseQuery(query);

      if (mode === 'anchor') {
        if (!cachedHeadings.has(pageTarget) && anchorFetchingFor !== pageTarget) {
          anchorFetchingFor = pageTarget;
          try {
            const headings = await fetchHeadings(pageTarget);
            cachedHeadings.set(pageTarget, headings);
            anchorFetchError = null;
          } catch (err) {
            console.error('[wiki-link-suggestion] Failed to fetch headings:', err);
            cachedHeadings.set(pageTarget, []);
            anchorFetchError = `Failed to load headings for ${pageTarget}.`;
          } finally {
            anchorFetchingFor = null;
          }
        }
        const headings = cachedHeadings.get(pageTarget) ?? [];
        return buildAnchorItems(pageTarget, headings, anchorQuery);
      }

      // Page mode — two-flag dedupe (D9)
      if (!pagesLoaded && !pagesFetching) {
        pagesFetching = true;
        try {
          cachedPages = await fetchPages();
          fetchError = null;
        } catch (err) {
          console.error('[wiki-link-suggestion] Failed to fetch pages:', err);
          fetchError = 'Failed to load pages. You can still insert an unresolved link.';
          cachedPages = [];
        } finally {
          pagesLoaded = true;
          pagesFetching = false;
        }
      }
      return buildSuggestionItems(cachedPages, query);
    },

    command: ({ editor, range, props: item }) => {
      try {
        let attrs: { target: string; alias: string | null; anchor: string | null } | null = null;

        if (item.kind === 'page') {
          attrs = { target: item.docName, alias: null, anchor: null };
        } else if (item.kind === 'anchor') {
          attrs = { target: item.docName, alias: null, anchor: item.slug };
        } else if (item.kind === 'create') {
          attrs = buildUnresolvedWikiLinkAttrs(item.title);
        }

        if (!attrs) return;

        editor.chain().focus().deleteRange(range).insertContent({ type: 'wikiLink', attrs }).run();
      } catch (err) {
        console.error('[wiki-link-suggestion] command error:', err);
      }
    },

    render: () => {
      let renderer: ReactRenderer<typeof WikiLinkSuggestionMenu> | null = null;
      let popup: HTMLDivElement | null = null;
      let currentProps: SuggestionProps<WikiLinkSuggestionItem> | null = null;
      let selectedIndex = 0;
      let stopAutoUpdate: (() => void) | null = null;

      const virtualEl = {
        getBoundingClientRect: () => currentProps?.clientRect?.() ?? new DOMRect(),
        get contextElement() {
          return currentProps?.editor.view.dom;
        },
      };

      const doPosition = () => {
        if (!popup) return;
        computePosition(virtualEl, popup, {
          placement: 'bottom-start',
          middleware: [
            offset(4),
            flip(),
            size({
              apply({ availableHeight }) {
                if (popup) {
                  popup.style.setProperty(
                    '--suggestion-menu-max-height',
                    `${Math.min(availableHeight, window.innerHeight * 0.4)}px`,
                  );
                }
              },
            }),
          ],
        })
          .then(({ x, y }) => {
            if (popup) {
              popup.style.left = `${x}px`;
              popup.style.top = `${y}px`;
            }
          })
          .catch((err) => {
            if (popup) {
              console.warn('[wiki-link-suggestion] computePosition failed', err);
            }
          });
      };

      const onSelect = (item: WikiLinkSuggestionItem) => {
        currentProps?.command(item);
      };

      function computeMenuProps(
        props: SuggestionProps<WikiLinkSuggestionItem>,
        loadingOverride: boolean | null,
        onSelectCb: (item: WikiLinkSuggestionItem) => void,
      ) {
        const { mode, pageTarget, anchorQuery } = parseQuery(props.query ?? '');
        const loading =
          loadingOverride !== null
            ? loadingOverride
            : mode === 'anchor'
              ? !cachedHeadings.has(pageTarget)
              : !pagesLoaded;
        return {
          items: props.items,
          query: props.query ?? '',
          selectedIndex,
          onSelect: onSelectCb,
          loading,
          error: mode === 'page' ? fetchError : anchorFetchError,
          mode,
          pageTarget,
          anchorQuery,
        };
      }

      const rerender = (loadingOverride: boolean | null) => {
        if (!renderer || !currentProps) return;
        renderer.updateProps(computeMenuProps(currentProps, loadingOverride, onSelect));
      };

      /** Fallback: insert a wiki-link from the raw query when no item is selected. */
      const fallbackInsert = () => {
        if (!currentProps) return;
        const { editor, range } = currentProps;
        const query = currentProps.query ?? '';
        const { mode, pageTarget, anchorQuery } = parseQuery(query);

        let attrs: { target: string; alias: string | null; anchor: string | null } | null = null;
        if (mode === 'anchor' && pageTarget) {
          attrs = { target: pageTarget, alias: null, anchor: anchorQuery.trim() || null };
        } else {
          attrs = buildUnresolvedWikiLinkAttrs(query);
        }

        if (!attrs) return;

        try {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({ type: 'wikiLink', attrs })
            .run();
        } catch (err) {
          console.error('[wiki-link-suggestion] fallback insert error:', err);
        }
      };

      return {
        onBeforeStart(props: SuggestionProps<WikiLinkSuggestionItem>) {
          currentProps = props;
          selectedIndex = 0;

          popup = document.createElement('div');
          popup.style.position = 'fixed';
          popup.style.zIndex = '50';
          document.body.appendChild(popup);

          renderer = new ReactRenderer(WikiLinkSuggestionMenu, {
            props: computeMenuProps(props, true, onSelect),
            editor: props.editor,
          });
          popup.appendChild(renderer.element);
          stopAutoUpdate = autoUpdate(virtualEl, popup, doPosition);
          doPosition();
        },

        onBeforeUpdate(props: SuggestionProps<WikiLinkSuggestionItem>) {
          const prevMode = currentProps ? parseQuery(currentProps.query ?? '').mode : null;
          const nextMode = parseQuery(props.query ?? '').mode;
          currentProps = props;
          if (prevMode !== nextMode) {
            selectedIndex = 0;
            rerender(true);
          }
        },

        onStart(props: SuggestionProps<WikiLinkSuggestionItem>) {
          currentProps = props;
          selectedIndex = 0;
          rerender(null);
          doPosition();
        },

        onUpdate(props: SuggestionProps<WikiLinkSuggestionItem>) {
          currentProps = props;
          selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
          rerender(null);
          doPosition();
        },

        onKeyDown({ event }: SuggestionKeyDownProps) {
          if (!currentProps) return false;
          const items = currentProps.items;

          if (event.key === 'ArrowDown') {
            if (items.length === 0) return true;
            selectedIndex = (selectedIndex + 1) % items.length;
            rerender(null);
            return true;
          }
          if (event.key === 'ArrowUp') {
            if (items.length === 0) return true;
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            rerender(null);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const item = items[selectedIndex];
            if (item) {
              currentProps.command(item);
            } else {
              fallbackInsert();
            }
            return true;
          }
          if (event.key === 'Escape') {
            return false;
          }
          return false;
        },

        onExit() {
          // Clean up positioning first (must run even if renderer.destroy throws)
          stopAutoUpdate?.();
          stopAutoUpdate = null;
          popup?.remove();
          popup = null;
          // React cleanup last — if destroy() throws, DOM is already clean
          renderer?.destroy();
          renderer = null;
          currentProps = null;
          selectedIndex = 0;
          // Reset cache — each [[ session re-fetches for freshness
          cachedPages = [];
          cachedHeadings = new Map();
          fetchError = null;
          anchorFetchError = null;
          pagesLoaded = false;
          pagesFetching = false;
          anchorFetchingFor = null;
        },
      };
    },
  });
}
