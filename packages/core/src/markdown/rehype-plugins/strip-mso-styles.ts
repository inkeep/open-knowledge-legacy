/**
 * rehype plugin: strip Microsoft Word + LibreOffice Office HTML noise.
 *
 * Word's "Copy as HTML" output is infamous: conditional IE comments,
 * <o:...>/<w:...>/<m:...> namespaced elements, mso-* inline styles, and
 * `MsoNormal` / `MsoListParagraph*` class clutter on every <p>. We strip
 * all of it so rehype-remark can claim the inner prose cleanly.
 *
 * Reference: CKEditor's `removemsattributes` filter (in-house
 * transformation pipeline, ~200 LoC). Our implementation is structural
 * (walk the tree) because the HTML we get is already normalized by
 * rehype-parse — no need to re-tokenize.
 *
 * NOT in scope for MVP: Word list reconstruction (mso-list:l1 level1 lfo1
 * → nested ol/ul). That's NG3, deferred. This plugin strips the styles
 * and classes; nested list structure falls back to flat paragraphs,
 * which is better than today's "preserve mso-* and style noise in the PM
 * doc" behavior.
 */

import type { Comment, Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';

const OFFICE_NAMESPACES = ['o:', 'w:', 'm:', 'v:', 'u1:'];
const MSO_CLASS_RE = /^Mso[A-Z]/;
const IE_CONDITIONAL_COMMENT_RE = /^\s*\[if\s+[^\]]*\]/;

export const rehypeStripMsoStyles: Plugin<[], Root> = () => {
  return (tree) => {
    walk(tree);
  };
};

function walk(node: Root | Element): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;
  // Recurse first so nested cleanups settle.
  for (const child of node.children) {
    if ((child as Element).type === 'element') walk(child as Element);
  }
  // Filter children at this level.
  node.children = node.children.flatMap((c): ElementContent[] => {
    // Drop IE conditional comments — they carry <o:*> / <w:*> content that
    // survives rehype-parse as comment text, not as hast elements.
    if ((c as Comment).type === 'comment') {
      const value = String((c as Comment).value ?? '');
      if (IE_CONDITIONAL_COMMENT_RE.test(value)) return [];
      return [c as ElementContent];
    }
    if ((c as Element).type !== 'element') return [c as ElementContent];
    const el = c as Element;
    if (isOfficeNamespaced(el)) return [];
    // Strip msoClasses / mso-* styles on surviving elements in place.
    stripMsoAttributes(el);
    return [el];
  });
}

function isOfficeNamespaced(el: Element): boolean {
  return OFFICE_NAMESPACES.some((prefix) => el.tagName.startsWith(prefix));
}

function stripMsoAttributes(el: Element): void {
  const props = el.properties;
  if (!props) return;

  // Drop MsoNormal / MsoListParagraph* / etc. classes; keep other classes.
  const className = props.className;
  if (Array.isArray(className)) {
    const filtered = className.filter((c) => typeof c === 'string' && !MSO_CLASS_RE.test(c));
    if (filtered.length === 0) {
      delete props.className;
    } else {
      props.className = filtered;
    }
  } else if (typeof className === 'string' && MSO_CLASS_RE.test(className)) {
    delete props.className;
  }

  // Strip mso-* inline styles by removing the style property entirely when
  // it's mostly mso junk — our storage-fidelity invariant doesn't preserve
  // inline styles anyway (render-layer concern).
  const style = props.style;
  if (typeof style === 'string' && /mso-/i.test(style)) {
    delete props.style;
  }

  // Drop xmlns:* Office namespace attrs.
  for (const key of Object.keys(props)) {
    if (key.startsWith('xmlns:')) {
      const ns = key.slice('xmlns:'.length);
      if (OFFICE_NAMESPACES.some((p) => p === `${ns}:`)) {
        delete props[key];
      }
    }
  }
}
