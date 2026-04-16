import { type Extension, StateField, type Transaction } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

export const brokenRefField: Extension = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations: DecorationSet, tr: Transaction) {
    if (!tr.docChanged) return decorations;
    return Decoration.none;
  },
  provide: (f) => EditorView.decorations.from(f),
});
