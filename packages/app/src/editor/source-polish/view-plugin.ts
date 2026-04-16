import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

function buildDecorations(_state: EditorState): DecorationSet {
  return Decoration.none;
}

class SourcePolishViewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view.state);
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.viewportChanged ||
      syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      this.decorations = buildDecorations(update.state);
    }
  }
}

export const sourcePolishViewPlugin: Extension = ViewPlugin.fromClass(SourcePolishViewPlugin, {
  decorations: (v) => v.decorations,
});
