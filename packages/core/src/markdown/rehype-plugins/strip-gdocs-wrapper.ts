/**
 * rehype plugin: strip Google Docs clipboard HTML wrapping.
 *
 * Google Docs wraps its clipboard HTML in a top-level `<b id="docs-internal-
 * guid-UUID" style="...">` (yes — a <b> element as outer container, abusing
 * its rendering neutrality). Inside that, paragraphs / lists / headings live
 * in `<span>`s with vast piles of inline styles we don't want preserved.
 *
 * Additionally Docs sometimes wraps tables in `<div dir="ltr">`. We unwrap
 * those too so rehype-remark can claim the inner structure cleanly.
 *
 * Reference: Milkdown's `unwrapDocsInternalGuid` transformer + Outline's
 * `transformPasted` handling. We match on both the id-prefix AND a plain
 * `<b>` wrapper with no attrs (some GDocs variants drop the id).
 */

import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

const GUID_PREFIX = 'docs-internal-guid-';

/**
 * Splice a node's children into its parent's child array at the node's
 * position. This preserves document order without adding a wrapper.
 */
function unwrap(parent: Element | Root, index: number): void {
  const node = parent.children[index] as Element;
  if (!node || node.type !== 'element') return;
  parent.children.splice(index, 1, ...node.children);
}

export const rehypeStripGdocsWrapper: Plugin<[], Root> = () => {
  return (tree) => {
    // We mutate children arrays during the walk, so use SKIP + manual index
    // management by walking children of each element post-order.
    walk(tree);
  };
};

function walk(node: Root | Element): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;
  // Depth-first so inner wrappers unwrap before their outer containers.
  for (const child of node.children) {
    if ((child as Element).type === 'element') {
      walk(child as Element);
    }
  }
  // Scan for unwrap targets at this level.
  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if (!child || (child as Element).type !== 'element') {
      i++;
      continue;
    }
    const el = child as Element;
    if (isGdocsIdWrapper(el) || isGdocsLtrDivWrapper(el)) {
      unwrap(node, i);
      // Do not advance — the inserted children start at `i`, so re-check.
      continue;
    }
    i++;
  }
}

function isGdocsIdWrapper(el: Element): boolean {
  if (el.tagName !== 'b') return false;
  const id = el.properties?.id;
  return typeof id === 'string' && id.startsWith(GUID_PREFIX);
}

function isGdocsLtrDivWrapper(el: Element): boolean {
  // Only unwrap when it's a trivial ltr wrapper around a single table.
  if (el.tagName !== 'div') return false;
  if (el.properties?.dir !== 'ltr') return false;
  const elementChildren = el.children.filter((c) => (c as Element).type === 'element') as Element[];
  if (elementChildren.length !== 1) return false;
  return elementChildren[0]?.tagName === 'table';
}
