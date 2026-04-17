/**
 * rehype plugin: strip Gmail clipboard HTML noise.
 *
 * Gmail's Copy operation wraps content in various `gmail_*` CSS classes
 * (`gmail_default`, `gmail_quote`, `gmail_extra`, `gmail_signature`,
 * `gmail_attr`) that have no semantic meaning outside Gmail's own view.
 * We unwrap or de-class those elements so rehype-remark can extract the
 * underlying prose structure.
 *
 * Handling:
 *   - `<div class="gmail_quote">...</div>` — preserve as a blockquote-like
 *     wrapper. Rather than lose the quote semantic, we rewrite the tagName
 *     to `blockquote` so rehype-remark converts it to mdast `blockquote`.
 *   - Other gmail_* classes — strip the class, keep the element. The
 *     element survives rehype-remark naturally (div passes through its
 *     children; other tags like p/span/a keep their existing semantics).
 *   - `<div dir="ltr">` wrappers with a single prose child — unwrap
 *     (Gmail sometimes nests trivially).
 */

import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

const GMAIL_CLASS_RE = /^gmail_/;

export const rehypeStripGmailClasses: Plugin<[], Root> = () => {
  return (tree) => {
    walk(tree);
  };
};

function walk(node: Root | Element): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;

  for (const child of node.children) {
    if ((child as Element).type === 'element') walk(child as Element);
  }

  // In-place edits + unwrap of trivial ltr divs.
  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if ((child as Element).type !== 'element') {
      i++;
      continue;
    }
    const el = child as Element;
    // Rewrite gmail_quote div → blockquote so quote semantics reach mdast.
    if (el.tagName === 'div' && hasGmailClass(el, 'gmail_quote')) {
      el.tagName = 'blockquote';
      stripGmailClasses(el);
    } else {
      stripGmailClasses(el);
    }

    // Unwrap <div dir="ltr"> when it's a single-prose-child wrapper with
    // no non-trivial classes (Gmail quirk).
    if (isTrivialLtrDiv(el)) {
      node.children.splice(i, 1, ...el.children);
      continue;
    }
    i++;
  }
}

function hasGmailClass(el: Element, name: string): boolean {
  const cls = el.properties?.className;
  if (!Array.isArray(cls)) return false;
  return cls.some((c) => String(c) === name);
}

function stripGmailClasses(el: Element): void {
  const cls = el.properties?.className;
  if (!Array.isArray(cls)) return;
  const filtered = cls.filter((c) => !GMAIL_CLASS_RE.test(String(c)));
  if (filtered.length === 0) {
    delete el.properties?.className;
  } else {
    if (el.properties) el.properties.className = filtered;
  }
}

function isTrivialLtrDiv(el: Element): boolean {
  if (el.tagName !== 'div') return false;
  if (el.properties?.dir !== 'ltr') return false;
  const cls = el.properties?.className;
  if (cls != null && !(Array.isArray(cls) && cls.length === 0)) return false;
  // Must wrap at most one element child (plus possibly whitespace text).
  const elChildren = el.children.filter((c) => (c as Element).type === 'element');
  return elChildren.length <= 1;
}
