/**
 * Mermaid fence promoter (SPEC 2026-04-29-mermaid-canonical-and-syntax).
 *
 * Replaces `code` mdast nodes with `lang === 'mermaid'` (` ```mermaid `…
 * ``` ` fence syntax) with a `MermaidFence` compat descriptor that
 * renders through the canonical `<Mermaid>` (`rendersAs: 'Mermaid'`).
 *
 * Position is copied verbatim onto the emitted `mdxJsxFlowElement` so
 * Phase B's position-slice walker attaches `data.sourceRaw` for byte-
 * identical pristine round-trip — the original ` ```mermaid …``` ` source
 * stays on disk untouched until the user edits.
 *
 * Mirrors the math fence promoter shape; kept separate from
 * `math-promoter.ts` because the two features evolve independently and
 * coupling them in one file would invite premature abstraction.
 */

import type { Code, Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';

function buildMermaidFenceElement(chart: string, position: Code['position']): MdxJsxFlowElement {
  const attrs: MdxJsxAttribute[] = [{ type: 'mdxJsxAttribute', name: 'chart', value: chart }];
  const element: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: 'MermaidFence',
    attributes: attrs,
    children: [],
  };
  if (position) {
    element.position = position;
  }
  return element;
}

export function mermaidPromoterPlugin() {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (!parent || index === undefined || index === null) return;
      if (node.lang !== 'mermaid') return;
      const chart = typeof node.value === 'string' ? node.value : '';
      const element = buildMermaidFenceElement(chart, node.position);
      (parent.children as unknown[])[index] = element;
    });
  };
}
