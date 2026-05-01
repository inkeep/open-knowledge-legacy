
import type { Nodes, Parent, Root } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { promoteInParent } from './autolink-promotion.ts';
import { applyDocStartThematicFix } from './doc-start-thematic-fix.ts';
import { applyPositionSliceToNode } from './position-slice.ts';
import { KNOWN_MDAST_TYPES, toRawMdxFallbackMdast } from './unknown-mdast-guard.ts';

export function mergedPostParseWalkerPlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';

    applyDocStartThematicFix(tree, file);

    const debug = typeof process !== 'undefined' && process.env?.OK_DEBUG_POSITION_SLICE === '1';

    visit(tree, (node, index, parent) => {
      if (
        parent !== undefined &&
        typeof index === 'number' &&
        typeof node.type === 'string' &&
        !KNOWN_MDAST_TYPES.has(node.type)
      ) {
        const replacement = toRawMdxFallbackMdast(node, source);
        (parent.children as unknown[])[index] = replacement;
        return SKIP;
      }

      if ('children' in node && Array.isArray((node as Parent).children)) {
        const parentLike = node as Parent;
        if (parentLike.children.some((c) => c.type === 'text')) {
          promoteInParent(parentLike);
        }
      }

      applyPositionSliceToNode(node as Nodes, source, debug);
    });
  };
}
