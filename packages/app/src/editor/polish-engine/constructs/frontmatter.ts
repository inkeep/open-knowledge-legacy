/**
 * YAML frontmatter construct (Phase 2) — customDetect via regex
 *
 * @lezer/markdown has no native frontmatter node. Detection uses regex
 * matching /^---\s*\n/ at document start through closing ---.
 * D23 LOCKED: Phase 2 ships line-tint + fence borders only.
 * No nested YAML syntax highlighting, no fold.
 */

import type { EditorState } from '@codemirror/state';
import type { ConstructConfig, NodeRange } from '../registry';

const FRONTMATTER_OPEN = /^---\s*$/;
const FRONTMATTER_CLOSE = /^---\s*$/;

function detectFrontmatter(state: EditorState): NodeRange[] {
  const doc = state.doc;
  if (doc.lines < 2) return [];

  const firstLine = doc.line(1);
  if (!FRONTMATTER_OPEN.test(firstLine.text)) return [];

  // Find closing ---
  for (let i = 2; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (FRONTMATTER_CLOSE.test(line.text)) {
      return [{ from: firstLine.from, to: line.to }];
    }
  }

  return [];
}

export const frontmatterConstruct: ConstructConfig = {
  id: 'frontmatter',
  customDetect: detectFrontmatter,
  kind: 'line',
  class: 'cm-frontmatter-line',
};
