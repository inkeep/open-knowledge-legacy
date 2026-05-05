import type { Nodes, Parent, PhrasingContent, Root, Text } from 'mdast';
import type { MdxJsxTextElement } from 'mdast-util-mdx';
import { SKIP, visit } from 'unist-util-visit';
import type { MarkMdast } from './mdast-augmentation.ts';

const HIGHLIGHT_RE = /(?<!=)==(?=\S)([^\n]*?[^\s=])==(?!=)/g;

export function highlightPromoterPlugin() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (parent === undefined || index === undefined || index === null) return;

      const value = node.value;
      if (value.indexOf('==') === -1) return;

      HIGHLIGHT_RE.lastIndex = 0;
      const matches: RegExpExecArray[] = [];
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
      while ((m = HIGHLIGHT_RE.exec(value)) !== null) {
        matches.push(m);
      }
      if (matches.length === 0) return;

      const replacements: PhrasingContent[] = [];
      let cursor = 0;
      for (const match of matches) {
        const start = match.index;
        const end = start + match[0].length;
        if (start > cursor) {
          const lead: Text = { type: 'text', value: value.slice(cursor, start) };
          replacements.push(lead);
        }
        const markNode: MarkMdast = {
          type: 'mark',
          children: [{ type: 'text', value: match[1] }],
          data: { sourceForm: 'markdown' },
        };
        replacements.push(markNode as unknown as PhrasingContent);
        cursor = end;
      }
      if (cursor < value.length) {
        const tail: Text = { type: 'text', value: value.slice(cursor) };
        replacements.push(tail);
      }

      const arr = (parent as { children: PhrasingContent[] }).children;
      arr.splice(index, 1, ...replacements);
      return [SKIP, index + replacements.length];
    });

    visit(tree, 'mdxJsxTextElement', (node: MdxJsxTextElement, index, parent) => {
      if (parent === undefined || index === undefined || index === null) return;
      if (node.name !== 'Highlight') return;

      const markNode: MarkMdast = {
        type: 'mark',
        children: (node.children as Nodes[]) ?? [],
        data: { sourceForm: 'mdx' },
      };

      const arr = (parent as Parent).children;
      arr.splice(index, 1, markNode as unknown as (typeof arr)[number]);
      return index + 1;
    });
  };
}
