import { type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import {
  classifyCurrentMarkdownHref,
  navigateToMarkdownTarget,
  openInternalHashHrefInNewTab,
  shouldOpenInNewTab,
} from '../internal-link-helpers';

const MD_LINK_RE =
  /\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s\n]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\)/g;

const internalLinkMark = Decoration.mark({ class: 'cm-md-internal-link' });

function isImageMatch(text: string, matchIndex: number): boolean {
  return matchIndex > 0 && text[matchIndex - 1] === '!';
}

function getMatchHref(match: RegExpExecArray): string {
  const href = match[2] ?? '';
  return href.startsWith('<') && href.endsWith('>') ? href.slice(1, -1) : href;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    MD_LINK_RE.lastIndex = 0;
    let m = MD_LINK_RE.exec(text);
    while (m !== null) {
      const target = isImageMatch(text, m.index)
        ? null
        : classifyCurrentMarkdownHref(getMatchHref(m));
      if (target && target.kind !== 'external') {
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

const mdLinkClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const line = view.state.doc.lineAt(pos);
    MD_LINK_RE.lastIndex = 0;
    let m = MD_LINK_RE.exec(line.text);
    while (m !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      if (pos >= start && pos <= end) {
        const target = isImageMatch(line.text, m.index)
          ? null
          : classifyCurrentMarkdownHref(getMatchHref(m));
        if (target && target.kind !== 'external') {
          event.preventDefault();
          if (target.kind === 'doc' && shouldOpenInNewTab(event)) {
            openInternalHashHrefInNewTab(target);
            return true;
          }
          navigateToMarkdownTarget(target);
          return true;
        }
      }
      m = MD_LINK_RE.exec(line.text);
    }
    return false;
  },
});

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

export function createMdLinkSourceExtension(): Extension {
  return [mdLinkDecorations, mdLinkClickHandler, mdLinkTheme];
}
