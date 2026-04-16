import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/** Regex to capture list-item prefix: leading whitespace + marker + optional task marker. */
const LIST_PREFIX_RE = /^(\s*(?:[-*+]|\d+[.)]) (?:\[[ x]\] )?)/;

const delMark = Decoration.mark({ class: 'cm-del' });

/** Widget that renders a small language-name pill next to the opening fence. */
class LanguageBadgeWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-code-language-badge';
    span.textContent = this.lang;
    return span;
  }

  eq(other: LanguageBadgeWidget): boolean {
    return this.lang === other.lang;
  }
}

/** Count leading ASCII spaces in a string. Tabs count as 4 visual columns. */
function countLeadingIndent(text: string): number {
  let indent = 0;
  for (const ch of text) {
    if (ch === ' ') indent++;
    else if (ch === '\t') indent += 4;
    else break;
  }
  return indent;
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      // Strikethrough — apply .cm-del to content between ~~ delimiters
      if (node.name === 'Strikethrough') {
        let contentFrom = node.from;
        let contentTo = node.to;
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'StrikethroughMark') {
              if (cursor.from === node.from) {
                contentFrom = cursor.to;
              } else {
                contentTo = cursor.from;
              }
            }
          } while (cursor.nextSibling());
        }
        if (contentFrom < contentTo) {
          decorations.push(delMark.range(contentFrom, contentTo));
        }
        return false;
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
        return false;
      }

      // Fenced code — wrap-preserve-indent + language badge
      if (node.name === 'FencedCode') {
        const cursor = node.node.cursor();
        let codeInfoEnd = -1;
        let langText = '';

        // First pass: find CodeInfo for the language badge
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'CodeInfo') {
              langText = state.doc.sliceString(cursor.from, cursor.to).trim();
              codeInfoEnd = cursor.to;
            }
          } while (cursor.nextSibling());
        }

        // Language badge widget — only if a non-empty language token exists
        if (langText && codeInfoEnd >= 0) {
          decorations.push(
            Decoration.widget({
              widget: new LanguageBadgeWidget(langText),
              side: 1,
            }).range(codeInfoEnd),
          );
        }

        // Code body lines — apply .cm-fenced-code-line with --line-indent
        // Skip the opening fence line and closing fence line
        const startLine = state.doc.lineAt(node.from);
        const endLine = state.doc.lineAt(node.to);
        for (let lineNum = startLine.number + 1; lineNum < endLine.number; lineNum++) {
          const line = state.doc.line(lineNum);
          const indent = countLeadingIndent(line.text);
          const lineDeco = Decoration.line({
            class: 'cm-fenced-code-line',
            attributes: { style: `--line-indent: ${indent}` },
          });
          decorations.push(lineDeco.range(line.from));
        }

        return false;
      }
    },
  });

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
