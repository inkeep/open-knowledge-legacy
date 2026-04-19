/**
 * rehype plugin: strip Google Sheets clipboard wrapping.
 *
 * Google Sheets wraps its clipboard HTML in a custom `<google-sheets-html-
 * origin>` element containing a `<table>` with `data-sheets-*` attributes
 * per cell (holding formula/value metadata we can't preserve in markdown
 * anyway). We:
 *   - Unwrap the `<google-sheets-html-origin>` container.
 *   - Drop inline `<style>` blocks that set cell borders.
 *   - Strip `data-sheets-*` attributes from surviving elements so they
 *     don't leak into the resulting markdown.
 *
 * Keeps the inner `<table>` intact so rehype-remark produces a GFM
 * mdast table. Complex cell metadata (formulas, numeric formats) are
 * dropped per NG9 (complex table features are not preserved).
 */

import type { Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';

export const rehypeStripGsheetsWrapper: Plugin<[], Root> = () => {
  return (tree) => {
    walk(tree);
  };
};

function walk(node: Root | Element): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;

  for (const child of node.children) {
    if ((child as Element).type === 'element') walk(child as Element);
  }

  node.children = node.children.flatMap((c): ElementContent[] => {
    if ((c as Element).type !== 'element') return [c as ElementContent];
    const el = c as Element;
    // Unwrap <google-sheets-html-origin> → surface inner children.
    if (el.tagName === 'google-sheets-html-origin') {
      return el.children as ElementContent[];
    }
    // Drop inline <style> blocks.
    if (el.tagName === 'style') return [];
    stripDataSheetsAttrs(el);
    return [el];
  });
}

function stripDataSheetsAttrs(el: Element): void {
  if (!el.properties) return;
  for (const key of Object.keys(el.properties)) {
    if (key.startsWith('dataSheets')) {
      delete el.properties[key];
    }
  }
}
