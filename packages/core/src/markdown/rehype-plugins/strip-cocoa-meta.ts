/**
 * rehype plugin: strip Apple Cocoa HTML Writer noise.
 *
 * macOS apps (Notes, Mail, TextEdit, Pages) produce HTML via the Cocoa
 * `NSAttributedString → NSHTMLWriter` pipeline, which stamps the output
 * with `<meta name="Generator" content="Cocoa HTML Writer">` and wraps
 * text fragments in `<span class="Apple-tab-span">` + `<span class=
 * "Apple-converted-space">` for visual spacing.
 *
 * This plugin:
 *   - Drops the Generator meta tag.
 *   - Unwraps any span whose class set is *only* Apple-tab-span or
 *     Apple-converted-space — the visual spacing is meaningful in macOS
 *     apps but not in markdown, where whitespace serves the same role.
 *
 * Reference shape: captured samples from macOS Notes / Mail clipboard in
 * evidence/d9-rehype-cleanup-landscape.md.
 */

import type { Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';

const APPLE_CLASSES = new Set(['Apple-tab-span', 'Apple-converted-space', 'Apple-style-span']);

export const rehypeStripCocoaMeta: Plugin<[], Root> = () => {
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
    if (isCocoaMetaGenerator(el)) return [];
    if (isAppleSpan(el)) {
      // Unwrap: replace the span with its children. Children are already
      // walked because of the depth-first loop above.
      return el.children as ElementContent[];
    }
    return [el];
  });
}

function isCocoaMetaGenerator(el: Element): boolean {
  if (el.tagName !== 'meta') return false;
  const name = el.properties?.name;
  const content = el.properties?.content;
  return name === 'Generator' && typeof content === 'string' && /Cocoa/i.test(content);
}

function isAppleSpan(el: Element): boolean {
  if (el.tagName !== 'span') return false;
  const className = el.properties?.className;
  if (!Array.isArray(className)) return false;
  // Unwrap only when EVERY class on the span is an Apple-* visual-spacing
  // class. Mixed classes (e.g. user-added) are preserved.
  return className.length > 0 && className.every((c) => APPLE_CLASSES.has(String(c)));
}
