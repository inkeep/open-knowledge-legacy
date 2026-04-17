/**
 * rehype plugin: structural-fallback VS Code clipboard handling.
 *
 * When the authoritative `vscode-editor-data` MIME is present, the WYSIWYG
 * paste dispatcher routes through Branch A (FR-3) directly and this plugin
 * is bypassed. This plugin handles the STRUCTURAL FALLBACK case: when the
 * user copies from VS Code and only the `text/html` MIME is observed —
 * a monospace `<div>` containing a sequence of `<div>` lines, each
 * wrapping `<span>`s per token.
 *
 * Detection: a top-level `<div>` whose children are all `<div>`s with no
 * text content between them, AND whose first descendant `<span>` carries
 * an inline `color:` style (VS Code's token highlight). We rewrite the
 * matching structure to a `<pre><code>...</code></pre>` with the text
 * content joined by `\n`, so rehype-remark produces a mdast `code` node
 * (fenced block, no language — the vscode-editor-data MIME branch sets
 * the language explicitly when available).
 *
 * Reference: Keystatic's `clipboard.tsx` VS Code structural fallback.
 */

import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

export const rehypeStripVscodeSpans: Plugin<[], Root> = () => {
  return (tree) => {
    walk(tree);
  };
};

function walk(node: Root | Element): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;

  for (const child of node.children) {
    if ((child as Element).type === 'element') walk(child as Element);
  }

  // Scan each direct element child for a VS Code structural shape.
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if ((child as Element).type !== 'element') continue;
    const el = child as Element;
    if (isVscodeStructuralDiv(el)) {
      node.children[i] = rewriteToPreCode(el);
    }
  }
}

function isVscodeStructuralDiv(el: Element): boolean {
  if (el.tagName !== 'div') return false;
  // Must have at least two direct-div children (per-line divs) to be worth
  // treating as a code block.
  const childDivs = el.children.filter(
    (c) => (c as Element).type === 'element' && (c as Element).tagName === 'div',
  );
  if (childDivs.length < 2) return false;
  // Look at least one level deep for a span with inline color style — VS
  // Code's signature is token-highlight spans with explicit `color:`.
  return childDivs.some((div) => hasInlineColorSpan(div as Element));
}

function hasInlineColorSpan(el: Element): boolean {
  for (const c of el.children) {
    if ((c as Element).type !== 'element') continue;
    const inner = c as Element;
    const style = inner.properties?.style;
    if (typeof style === 'string' && /color\s*:/i.test(style)) return true;
    if (hasInlineColorSpan(inner)) return true;
  }
  return false;
}

function rewriteToPreCode(container: Element): Element {
  // Each per-line div collapses to its text content; lines joined by `\n`.
  const lines: string[] = container.children
    .filter((c) => (c as Element).type === 'element' && (c as Element).tagName === 'div')
    .map((div) => collectText(div as Element));
  const code: Element = {
    type: 'element',
    tagName: 'code',
    properties: {},
    children: [{ type: 'text', value: lines.join('\n') }],
  };
  return {
    type: 'element',
    tagName: 'pre',
    properties: {},
    children: [code],
  };
}

function collectText(el: Element): string {
  let out = '';
  for (const c of el.children) {
    if ((c as { type: string; value?: string }).type === 'text') {
      out += (c as { value?: string }).value ?? '';
    } else if ((c as Element).type === 'element') {
      out += collectText(c as Element);
    }
  }
  return out;
}
