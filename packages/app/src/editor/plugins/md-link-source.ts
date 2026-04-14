/**
 * Internal markdown link support for CodeMirror (source mode):
 *
 * 1. Mark decorations — highlights [text](./internal.md) links with the same
 *    sky colour used for wiki links, so internal links are visually distinct.
 *
 * 2. Ctrl/Cmd+click navigation — resolves the href relative to the current
 *    document (from window.location.hash) and navigates within the app using
 *    the same hash-routing scheme as WikiLinkView / wiki-link-source.ts.
 *
 * External links (http://, https://, etc.) are left untouched.
 */
import { type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

// ── Href resolution ───────────────────────────────────────────────────────────

/**
 * Resolve href relative to the current document (read from window.location.hash).
 * Returns the resolved docName or null for external/escaping hrefs.
 * Pure string arithmetic — no FS access.
 */
function resolveHref(href: string): { docName: string; anchor: string | null } | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('#')) return null;

  const hashIdx = trimmed.indexOf('#');
  const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const anchor = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : null;
  const cleanPath = (pathPart.split('?')[0] ?? '').trim();
  if (!cleanPath) return null;
  const withoutExt = cleanPath.endsWith('.md') ? cleanPath.slice(0, -3) : cleanPath;

  const hashMatch = window.location.hash.match(/^#\/([^?#]+)/);
  const currentDocName = hashMatch ? decodeURIComponent(hashMatch[1]) : '';
  const dirParts = currentDocName.includes('/')
    ? currentDocName.slice(0, currentDocName.lastIndexOf('/')).split('/')
    : [];

  for (const seg of withoutExt.split('/')) {
    if (seg === '..') {
      if (dirParts.length === 0) return null;
      dirParts.pop();
    } else if (seg !== '.' && seg !== '') {
      dirParts.push(seg);
    }
  }
  if (dirParts.length === 0) return null;
  return { docName: dirParts.join('/'), anchor: anchor || null };
}

// ── Decoration ────────────────────────────────────────────────────────────────

// Matches [text](href) — inline link form. Global flag for repeated exec.
// Captures: [1] text, [2] href.
const MD_LINK_RE = /\[([^\]\n]*)\]\(([^)\n]+)\)/g;

const internalLinkMark = Decoration.mark({ class: 'cm-md-internal-link' });

function isInternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('#')) return false;
  return true;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    MD_LINK_RE.lastIndex = 0;
    let m = MD_LINK_RE.exec(text);
    while (m !== null) {
      if (isInternalHref(m[2] ?? '')) {
        builder.add(from + m.index, from + m.index + m[0].length, internalLinkMark);
      }
      m = MD_LINK_RE.exec(text);
    }
  }
  return builder.finish();
}

const mdLinkDecorations = ViewPlugin.fromClass(
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

// Captures [text](href) for per-line position matching
const MD_LINK_NAV_RE = /\[([^\]\n]*)\]\(([^)\n]+)\)/g;

const mdLinkClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const line = view.state.doc.lineAt(pos);
    MD_LINK_NAV_RE.lastIndex = 0;
    let m = MD_LINK_NAV_RE.exec(line.text);
    while (m !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      if (pos >= start && pos <= end) {
        const href = m[2]?.trim() ?? '';
        const resolved = resolveHref(href);
        if (resolved) {
          event.preventDefault();
          window.location.hash = resolved.anchor
            ? `#/${resolved.docName}?anchor=${encodeURIComponent(resolved.anchor)}`
            : `#/${resolved.docName}`;
          return true;
        }
      }
      m = MD_LINK_NAV_RE.exec(line.text);
    }
    return false;
  },
});

// ── Theme ─────────────────────────────────────────────────────────────────────

const mdLinkTheme = EditorView.theme({
  '.cm-md-internal-link': {
    color: 'oklch(52.7% 0.154 228.4)', // sky-700 — same as cm-wiki-link
    fontWeight: '500',
  },
  '.cm-md-internal-link:hover': {
    textDecoration: 'underline',
    cursor: 'pointer',
  },
});

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * CodeMirror extensions for internal markdown link support in source mode.
 * Highlights relative [text](href) links and enables Cmd/Ctrl+click navigation.
 */
export function createMdLinkSourceExtension(): Extension {
  return [mdLinkDecorations, mdLinkClickHandler, mdLinkTheme];
}
