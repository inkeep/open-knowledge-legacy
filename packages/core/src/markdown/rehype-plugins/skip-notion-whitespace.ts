/**
 * rehype plugin: handle Notion's whitespace-preserve HTML pattern.
 *
 * Notion inserts a `<!-- notionvc: ... -->` conditional comment in its
 * clipboard HTML and uses literal `\n` characters inside `<span>`s as
 * visible hard-break markers — Notion's renderer collapses them with
 * `white-space: pre-wrap`, but once rehype-remark collapses whitespace
 * those breaks are lost.
 *
 * This plugin runs in two modes:
 *   1. Detect the `notionvc:` comment → mark a tree flag so downstream
 *      consumers know Notion is the source (useful for telemetry).
 *   2. Replace literal `\n` inside text nodes with hast `br` elements,
 *      scoped to trees carrying the Notion marker. This preserves
 *      Notion's line-break semantics in the resulting mdast.
 *
 * Reference: BlockNote's `normalizeWhitespace.ts` transformer. Our
 * implementation is narrower — we only act on trees with the Notion
 * marker, so non-Notion pastes are unchanged.
 */

import type { Comment, Element, Root, Text } from 'hast';
import type { Plugin } from 'unified';

const NOTION_COMMENT_RE = /notionvc:/i;

export const rehypeSkipNotionWhitespace: Plugin<[], Root> = () => {
  return (tree) => {
    if (!hasNotionMarker(tree)) return;
    convertLiteralNewlinesToBreaks(tree);
    dropNotionMarkerComments(tree);
  };
};

function hasNotionMarker(node: Root | Element): boolean {
  if (!('children' in node) || !Array.isArray(node.children)) return false;
  for (const child of node.children) {
    if ((child as Comment).type === 'comment') {
      const value = String((child as Comment).value ?? '');
      if (NOTION_COMMENT_RE.test(value)) return true;
    }
    if ((child as Element).type === 'element') {
      if (hasNotionMarker(child as Element)) return true;
    }
  }
  return false;
}

function convertLiteralNewlinesToBreaks(node: Root | Element): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;

  for (const child of node.children) {
    if ((child as Element).type === 'element') {
      convertLiteralNewlinesToBreaks(child as Element);
    }
  }

  // Replace any text node containing `\n` with a sequence of text + <br>.
  const next: (Element | Text | Comment)[] = [];
  for (const child of node.children) {
    if ((child as Text).type !== 'text') {
      next.push(child as Element | Text | Comment);
      continue;
    }
    const value = String((child as Text).value ?? '');
    if (!value.includes('\n')) {
      next.push(child as Text);
      continue;
    }
    const parts = value.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) next.push({ type: 'text', value: parts[i] ?? '' } as Text);
      if (i < parts.length - 1) {
        next.push({
          type: 'element',
          tagName: 'br',
          properties: {},
          children: [],
        } as Element);
      }
    }
  }
  (node as Element).children = next as Element['children'];
}

function dropNotionMarkerComments(node: Root | Element): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;
  node.children = node.children.filter((c) => {
    if ((c as Comment).type !== 'comment') return true;
    return !NOTION_COMMENT_RE.test(String((c as Comment).value ?? ''));
  });
  for (const child of node.children) {
    if ((child as Element).type === 'element') {
      dropNotionMarkerComments(child as Element);
    }
  }
}
