/**
 * Wiki link support for CodeMirror (source mode):
 *
 * 1. Mark decorations — highlights [[...]] patterns so they're visually
 *    distinct from surrounding text.
 *
 * 2. Ctrl/Cmd+click navigation — follows the link (same sessionStorage +
 *    window.location.hash flow used by the WYSIWYG WikiLinkView).
 *
 * 3. Completion source — registered via markdownLanguage.data so it
 *    hooks into basicSetup's autocompletion() without adding a second
 *    conflicting autocompletion state field.
 *    - Type [[page... → fuzzy page completions (inserts docName]])
 *    - Type [[page#... → fuzzy heading completions (inserts slug]])
 */
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import fuzzysort from 'fuzzysort';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageItem {
  docName: string;
  title: string;
}

interface HeadingEntry {
  level: number;
  text: string;
  slug: string;
}

// ── Data fetching (module-level cache, valid for the lifetime of the page) ────

let pagesCache: PageItem[] | null = null;
const headingsCache = new Map<string, HeadingEntry[]>();

async function getPages(): Promise<PageItem[]> {
  if (pagesCache) return pagesCache;
  const r = await fetch('/api/pages');
  if (!r.ok) throw new Error(`/api/pages ${r.status}`);
  const data = (await r.json()) as { pages?: PageItem[] };
  pagesCache = Array.isArray(data.pages) ? data.pages : [];
  return pagesCache;
}

async function getHeadings(docName: string): Promise<HeadingEntry[]> {
  const cached = headingsCache.get(docName);
  if (cached !== undefined) return cached;
  const r = await fetch(`/api/page-headings?docName=${encodeURIComponent(docName)}`);
  const data = (await r.json()) as { ok: boolean; headings?: HeadingEntry[] };
  const h = data.ok && Array.isArray(data.headings) ? data.headings : [];
  headingsCache.set(docName, h);
  return h;
}

// ── Mark decorations ──────────────────────────────────────────────────────────

// Matches complete [[...]] (lazy, no nested brackets needed)
const WIKI_LINK_RE = /\[\[[^\]]*?\]\]/g;
const wikiLinkMark = Decoration.mark({ class: 'cm-wiki-link' });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    WIKI_LINK_RE.lastIndex = 0;
    let m = WIKI_LINK_RE.exec(text);
    while (m !== null) {
      builder.add(from + m.index, from + m.index + m[0].length, wikiLinkMark);
      m = WIKI_LINK_RE.exec(text);
    }
  }
  return builder.finish();
}

const wikiLinkDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ── Ctrl/Cmd+click navigation ─────────────────────────────────────────────────

const WIKI_LINK_FULL_RE = /\[\[([^[\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g;

const wikiLinkClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const line = view.state.doc.lineAt(pos);
    WIKI_LINK_FULL_RE.lastIndex = 0;
    let m = WIKI_LINK_FULL_RE.exec(line.text);
    while (m !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      if (pos >= start && pos <= end) {
        const target = m[1]?.trim();
        const anchor = m[2]?.trim() || null;
        if (target) {
          event.preventDefault();
          if (anchor) sessionStorage.setItem('pendingAnchor', anchor);
          window.location.hash = `#/${target}`;
        }
        return true;
      }
      m = WIKI_LINK_FULL_RE.exec(line.text);
    }
    return false;
  },
});

// ── Completion source ─────────────────────────────────────────────────────────

const MAX_ITEMS = 8;

async function wikiLinkCompletionSource(
  context: CompletionContext,
): Promise<CompletionResult | null> {
  const textBefore = context.state.doc.sliceString(0, context.pos);

  // Only activate when cursor is inside an open [[...  (no closing ]])
  const match = textBefore.match(/\[\[([^\]]*)$/);
  if (!match) return null;

  const query = match[1];
  const triggerPos = context.pos - query.length; // position right after [[
  const hashIdx = query.indexOf('#');

  // ── Anchor mode: [[page#anchorQuery ────────────────────────────────────────
  if (hashIdx > 0) {
    const pageTarget = query.slice(0, hashIdx);
    const anchorQuery = query.slice(hashIdx + 1);
    const anchorPos = triggerPos + hashIdx + 1; // position right after #

    const headings = await getHeadings(pageTarget).catch(() => [] as HeadingEntry[]);
    if (!headings.length) return null;

    const filtered = anchorQuery.trim()
      ? fuzzysort
          .go(anchorQuery, headings, { key: 'text', threshold: -10000 })
          .slice(0, MAX_ITEMS)
          .map((r) => r.obj)
      : headings.slice(0, MAX_ITEMS);

    if (!filtered.length) return null;

    return {
      from: anchorPos,
      filter: false,
      options: filtered.map((h) => ({
        label: h.text,
        detail: `H${h.level}`,
        apply(view: EditorView, _c: unknown, from: number, to: number) {
          const suffix = view.state.doc.sliceString(to, to + 2) === ']]' ? '' : ']]';
          view.dispatch({
            changes: { from, to, insert: h.slug + suffix },
            selection: { anchor: from + h.slug.length + suffix.length },
          });
        },
      })),
    };
  }

  // ── Page mode: [[query ─────────────────────────────────────────────────────
  const pages = await getPages().catch(() => [] as PageItem[]);
  const filtered = query.trim()
    ? fuzzysort
        .go(query, pages, { key: 'title', threshold: -10000 })
        .slice(0, MAX_ITEMS)
        .map((r) => r.obj)
    : pages.slice(0, MAX_ITEMS);

  return {
    from: triggerPos,
    filter: false,
    options: filtered.map((p) => ({
      label: p.title,
      detail: p.title !== p.docName ? p.docName : undefined,
      apply(view: EditorView, _c: unknown, from: number, to: number) {
        const suffix = view.state.doc.sliceString(to, to + 2) === ']]' ? '' : ']]';
        view.dispatch({
          changes: { from, to, insert: p.docName + suffix },
          selection: { anchor: from + p.docName.length + suffix.length },
        });
      },
    })),
  };
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const wikiLinkTheme = EditorView.theme({
  '.cm-wiki-link': {
    color: 'oklch(52.7% 0.154 228.4)', // sky-700
    fontWeight: '500',
  },
  '.cm-wiki-link:hover': {
    textDecoration: 'underline',
    cursor: 'pointer',
  },
});

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Returns the set of CodeMirror extensions for wiki link support.
 * Safe to add alongside basicSetup — uses markdownLanguage.data for
 * completions so there's no second autocompletion state field.
 */
export function createWikiLinkSourceExtension(): Extension {
  return [
    wikiLinkDecorations,
    wikiLinkClickHandler,
    wikiLinkTheme,
    // Additive: contributes our source to markdown's language data,
    // which basicSetup's autocompletion() already consults.
    markdownLanguage.data.of({ autocomplete: wikiLinkCompletionSource }),
  ];
}
