import type { HeadingEntry } from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import fuzzysort from 'fuzzysort';
import { WikiLinkSuggestionMenu } from '../wiki-link-suggestion/WikiLinkSuggestionMenu';
import {
  createSuggestionPopup,
  destroySuggestionPopup,
  type SuggestionPositionState,
} from './suggestion-floating-ui';
import { buildUnresolvedWikiLinkAttrs } from './wiki-link-helpers';

export const wikiLinkSuggestionKey = new PluginKey('wikiLinkSuggestion');

export interface PageItem {
  kind?: 'page' | 'asset';
  docName: string;
  title: string;
}

export type WikiLinkSuggestionItem =
  | { kind: 'page'; docName: string; title: string }
  | { kind: 'asset'; target: string; path: string; title: string }
  | { kind: 'create'; docName: string; title: string; actionLabel: string }
  | { kind: 'anchor'; docName: string; level: number; text: string; slug: string };

interface ParsedQuery {
  mode: 'page' | 'anchor';
  pageTarget: string;
  anchorQuery: string;
}

const MAX_ITEMS = 8;

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
    return filtered.map((item) =>
      item.kind === 'asset'
        ? {
            kind: 'asset',
            target: item.docName,
            path: item.docName.replace(/^\//, ''),
            title: item.title,
          }
        : { kind: 'page', docName: item.docName, title: item.title },
    );
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

export function computeFallbackAttrs(
  query: string,
): { target: string; alias: string | null; anchor: string | null } | null {
  const { mode, pageTarget, anchorQuery } = parseQuery(query);
  if (mode === 'anchor' && pageTarget) {
    return { target: pageTarget, alias: null, anchor: anchorQuery.trim() || null };
  }
  return buildUnresolvedWikiLinkAttrs(query);
}

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
  const data: { pages?: Array<{ docName: string; title: string }> } = await r.json();
  const pages: PageItem[] = Array.isArray(data.pages)
    ? data.pages.map((page) => ({ kind: 'page', docName: page.docName, title: page.title }))
    : [];

  let docData: { documents?: Array<{ kind?: string; path?: string }> };
  try {
    const docResponse = await fetch('/api/documents');
    if (!docResponse.ok) return pages;
    docData = await docResponse.json();
    if (!Array.isArray(docData.documents)) return pages;
  } catch (err) {
    console.warn('[wiki-link-suggestion] Failed to fetch referenced assets:', err);
    return pages;
  }

  const assets = docData.documents
    .filter((entry): entry is { kind: 'asset'; path: string } => {
      return entry.kind === 'asset' && typeof entry.path === 'string' && entry.path.length > 0;
    })
    .map((asset): PageItem => {
      const title = asset.path.split('/').pop() ?? asset.path;
      return { kind: 'asset', docName: `/${asset.path}`, title };
    });

  return [...pages, ...assets];
}

export async function fetchHeadings(docName: string): Promise<HeadingEntry[]> {
  const r = await fetch(`/api/page-headings?docName=${encodeURIComponent(docName)}`);
  if (!r.ok) throw new Error(`/api/page-headings responded with ${r.status}`);
  const data: { ok: boolean; headings?: HeadingEntry[] } = await r.json();
  return data.ok && Array.isArray(data.headings) ? data.headings : [];
}

export function configureWikiLinkSuggestion(editor: Editor) {
  let cachedPages: PageItem[] = [];
  let pagesLoaded = false;
  let pagesPromise: Promise<PageItem[]> | null = null;
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
            anchorFetchError = `Failed to load headings for ${pageTarget}. Press Escape and type [[ again to retry.`;
          } finally {
            anchorFetchingFor = null;
          }
        }
        const headings = cachedHeadings.get(pageTarget) ?? [];
        return buildAnchorItems(pageTarget, headings, anchorQuery);
      }

      // Page mode — two-flag dedupe (D9)
      if (!pagesLoaded) {
        if (!pagesPromise) {
          pagesPromise = fetchPages();
        }
        try {
          cachedPages = await pagesPromise;
          fetchError = null;
        } catch (err) {
          console.error('[wiki-link-suggestion] Failed to fetch pages:', err);
          fetchError =
            'Failed to load pages. Press Escape and type [[ again to retry, or continue typing to insert an unresolved link.';
          cachedPages = [];
        } finally {
          pagesLoaded = true;
          pagesPromise = null;
        }
      }
      return buildSuggestionItems(cachedPages, query);
    },

    command: ({ editor, range, props: item }) => {
      try {
        let attrs: { target: string; alias: string | null; anchor: string | null } | null = null;

        if (item.kind === 'page') {
          attrs = { target: item.docName, alias: null, anchor: null };
        } else if (item.kind === 'asset') {
          attrs = { target: item.target, alias: item.title, anchor: null };
        } else if (item.kind === 'anchor') {
          attrs = { target: item.docName, alias: null, anchor: item.slug };
        } else if (item.kind === 'create') {
          attrs = buildUnresolvedWikiLinkAttrs(item.title);
        }

        if (!attrs) return;

        editor.chain().focus().deleteRange(range).insertContent({ type: 'wikiLink', attrs }).run();
      } catch (err) {
        console.error('[wiki-link-suggestion] command failed', { item, range }, err);
      }
    },

    render: () => {
      let renderer: ReactRenderer<typeof WikiLinkSuggestionMenu> | null = null;
      let currentProps: SuggestionProps<WikiLinkSuggestionItem> | null = null;
      let selectedIndex = 0;
      const posState: SuggestionPositionState = { popup: null, stopAutoUpdate: null };

      let doPosition: (() => void) | null = null;
      let reveal: (() => void) | null = null;

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

      const fallbackInsert = () => {
        if (!currentProps) return;
        const { editor, range } = currentProps;
        const attrs = computeFallbackAttrs(currentProps.query ?? '');
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

          const result = createSuggestionPopup(() => currentProps, 'wiki-link-suggestion');
          posState.popup = result.popup;
          doPosition = result.doPosition;
          reveal = result.reveal;

          renderer = new ReactRenderer(WikiLinkSuggestionMenu, {
            props: computeMenuProps(props, true, onSelect),
            editor: props.editor,
          });
          result.popup.appendChild(renderer.element);
          posState.stopAutoUpdate = result.startAutoUpdate();
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
          reveal?.();
        },

        onUpdate(props: SuggestionProps<WikiLinkSuggestionItem>) {
          currentProps = props;
          selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
          rerender(null);
          doPosition?.();
        },

        onKeyDown({ event }: SuggestionKeyDownProps) {
          if (!currentProps) return false;
          const items = currentProps.items;

          if (event.key === 'ArrowDown') {
            if (items.length === 0) return false;
            selectedIndex = (selectedIndex + 1) % items.length;
            rerender(null);
            return true;
          }
          if (event.key === 'ArrowUp') {
            if (items.length === 0) return false;
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
          destroySuggestionPopup(posState);
          doPosition = null;
          reveal = null;
          renderer?.destroy();
          renderer = null;
          currentProps = null;
          selectedIndex = 0;
          cachedPages = [];
          cachedHeadings = new Map();
          fetchError = null;
          anchorFetchError = null;
          pagesLoaded = false;
          pagesPromise = null;
          anchorFetchingFor = null;
        },
      };
    },
  });
}
