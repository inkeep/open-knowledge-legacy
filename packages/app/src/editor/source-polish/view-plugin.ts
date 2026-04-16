import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

/** Regex to capture list-item prefix: leading whitespace + marker + optional task marker. */
const LIST_PREFIX_RE = /^(\s*(?:[-*+]|\d+[.)]) (?:\[[ x]\] )?)/;

const delMark = Decoration.mark({ class: 'cm-del' });

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      // Strikethrough — apply .cm-del to content between ~~ delimiters
      if (node.name === 'Strikethrough') {
        let contentFrom = node.from;
        let contentTo = node.to;
        // Walk children to find StrikethroughMark delimiters and exclude them
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'StrikethroughMark') {
              if (cursor.from === node.from) {
                // Opening delimiter — content starts after it
                contentFrom = cursor.to;
              } else {
                // Closing delimiter — content ends before it
                contentTo = cursor.from;
              }
            }
          } while (cursor.nextSibling());
        }
        if (contentFrom < contentTo) {
          decorations.push(delMark.range(contentFrom, contentTo));
        }
        return false; // Don't descend further into Strikethrough children
      }

      // List hanging-indent — apply .cm-list-item to the first line of each ListItem
      if (node.name === 'ListItem') {
        const line = state.doc.lineAt(node.from);
        const match = LIST_PREFIX_RE.exec(line.text);
        const hang = match ? match[1].length : 2;
        const lineDeco = Decoration.line({
          class: 'cm-list-item',
          attributes: { style: `--list-hang: ${hang}ch` },
        });
        decorations.push(lineDeco.range(line.from));
        return false; // Don't descend into nested list items (they'll be visited at their own level)
      }
    },
  });

  // Decorations must be sorted by position
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations);
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
