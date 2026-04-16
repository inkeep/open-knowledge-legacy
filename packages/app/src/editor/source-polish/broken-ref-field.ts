import { type EditorState, type Extension, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

const brokenRefMark = Decoration.mark({ class: 'cm-link-ref-broken' });

/** Regex matching a block-level link reference definition: `[label]: url` at line start. */
const LINK_DEF_RE = /^\s{0,3}\[([^\]]+)\]:\s/;

/** Regex matching an inline reference link: `[text][label]`. */
const INLINE_REF_RE = /\[([^\]]*)\]\[([^\]]*)\]/g;

interface InlineRef {
  from: number;
  to: number;
  label: string;
}

/** Scan the document to find definitions and inline references, then mark broken ones. */
export function scanBrokenRefs(state: EditorState): DecorationSet {
  const definitions = new Set<string>();
  const references: InlineRef[] = [];
  const doc = state.doc;

  // Pass 1: collect all block-level definitions
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const match = LINK_DEF_RE.exec(line.text);
    if (match) {
      definitions.add(match[1].toLowerCase());
    }
  }

  // Pass 2: collect all inline reference links
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    // Skip definition lines — they're not inline references
    if (LINK_DEF_RE.test(line.text)) continue;

    INLINE_REF_RE.lastIndex = 0;
    for (;;) {
      const m = INLINE_REF_RE.exec(line.text);
      if (!m) break;
      const label = m[2] || m[1]; // collapsed form [text][] uses text as label
      references.push({
        from: line.from + m.index,
        to: line.from + m.index + m[0].length,
        label: label.toLowerCase(),
      });
    }
  }

  // Build decorations for broken references
  const decorations: Range<Decoration>[] = [];
  for (const ref of references) {
    if (!definitions.has(ref.label)) {
      decorations.push(brokenRefMark.range(ref.from, ref.to));
    }
  }

  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations);
}

export const brokenRefField: Extension = StateField.define<DecorationSet>({
  create(state) {
    return scanBrokenRefs(state);
  },
  update(decorations: DecorationSet, tr) {
    if (!tr.docChanged) return decorations;
    return scanBrokenRefs(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});
