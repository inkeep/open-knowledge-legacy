/**
 * Wiki-link mdast transformer. Post-parse pass that scans text nodes and splits
 * out [[Target]], [[Target|Alias]], [[Target#Section]], [[Target#Section|Alias]]
 * into custom `wikiLink` mdast nodes. Minimal prototype to satisfy R7.
 *
 * Production implementation would be a micromark tokenizer (as per spec).
 * For the probe, a post-parse mdast walk is sufficient to validate feasibility.
 */

import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

const WIKI_RE = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]+))?(?:\|([^[\]\n]+))?\]\]/g;

export function remarkWikiLink() {
  return (tree: Root) => {
    visit(tree, 'text', (node: any, index, parent: any) => {
      if (!parent || index == null) return;
      const value = node.value as string;
      if (!value.includes('[[')) return;
      const parts: any[] = [];
      let last = 0;
      WIKI_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WIKI_RE.exec(value))) {
        if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) });
        parts.push({
          type: 'wikiLink',
          target: m[1],
          section: m[2] ?? null,
          alias: m[3] ?? null,
          children: [{ type: 'text', value: m[3] ?? m[1] + (m[2] ? `#${m[2]}` : '') }],
        });
        last = m.index + m[0].length;
      }
      if (!parts.length) return;
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
