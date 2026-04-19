/**
 * Autolink semantic promotion transformer.
 *
 * Runs AFTER `restoreFromMdx` (which restores PUA sentinel chars → real `<`,
 * `>`, `:`, `@` in text-node values) and BEFORE `positionSlicePlugin`.
 *
 * The R23 preprocessor (autolink-void-html-guard.ts) wraps `<scheme:uri>`
 * autolinks in PUA sentinels so remark-mdx doesn't claim `<`. After parsing
 * and PUA restoration, autolinks survive as literal text `<scheme:uri>` inside
 * paragraph text nodes. This transformer promotes them to proper mdast `link`
 * nodes with `data.sourceStyle: 'autolink'`, so:
 *
 * - The PM link mark carries `linkStyle: 'autolink'` (not plain text)
 * - The to-markdown link handler can short-circuit to `<url>` form
 * - The `safeText` function no longer needs to strip `:` and `@` from the
 *   unsafe list (autolinks are link nodes, never text)
 *
 * Detection: CommonMark autolink shape `<scheme:uri>` where scheme starts with
 * a letter and contains letters/digits/+/./-, followed by `:`, followed by
 * non-whitespace non-bracket content. Same regex as AUTOLINK_RE in the
 * preprocessor.
 */
import type { Link, Nodes, Parent, Root, Text } from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * CommonMark autolink pattern — matches `<scheme:uri>` in text content.
 * Global flag for multiple autolinks in a single text run.
 */
const AUTOLINK_IN_TEXT_RE = /<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]+)>/g;

/**
 * Unified transformer plugin that promotes autolink-shaped text into
 * semantic `link` mdast nodes.
 */
export function autolinkPromotionPlugin() {
  return (tree: Root) => {
    // Walk ALL parent nodes that can contain phrasing content (text).
    visit(tree, (node: Nodes) => {
      if ('children' in node && Array.isArray(node.children)) {
        const parent = node as Parent;
        const hasTextChild = parent.children.some((c) => c.type === 'text');
        if (hasTextChild) promoteInParent(parent);
      }
    });
  };
}

/**
 * Walk a parent node's children looking for text nodes that contain
 * `<scheme:uri>` patterns. Split them into: preceding text, link node,
 * trailing text. Mutates `parent.children` in place.
 *
 * Exported for use in the R17 merged post-parse walker — that walker
 * invokes the same promotion logic per parent-visit without re-walking
 * the tree. The standalone `autolinkPromotionPlugin` above is preserved
 * for legacy callers and unit tests that exercise the plugin surface.
 */
export function promoteInParent(parent: Parent): void {
  const newChildren: Parent['children'] = [];
  let changed = false;

  for (const child of parent.children) {
    if (child.type !== 'text') {
      newChildren.push(child);
      continue;
    }

    const text = (child as Text).value;
    AUTOLINK_IN_TEXT_RE.lastIndex = 0;

    const segments: Parent['children'] = [];
    let lastIndex = 0;

    for (;;) {
      const match = AUTOLINK_IN_TEXT_RE.exec(text);
      if (match === null) break;
      const fullMatch = match[0]; // `<scheme:uri>`
      const uri = match[1]; // `scheme:uri`
      const matchStart = match.index;

      // Emit preceding text (if any)
      if (matchStart > lastIndex) {
        segments.push({ type: 'text', value: text.slice(lastIndex, matchStart) } as Text);
      }

      // Emit promoted link node
      const linkNode: Link & { data: { sourceStyle: string } } = {
        type: 'link',
        url: uri,
        title: null,
        children: [{ type: 'text', value: uri } as Text],
        data: { sourceStyle: 'autolink' },
      };
      segments.push(linkNode);

      lastIndex = matchStart + fullMatch.length;
      changed = true;
    }

    if (segments.length === 0) {
      // No autolinks found in this text node — keep as-is
      newChildren.push(child);
    } else {
      // Emit trailing text (if any)
      if (lastIndex < text.length) {
        segments.push({ type: 'text', value: text.slice(lastIndex) } as Text);
      }
      newChildren.push(...segments);
    }
  }

  if (changed) {
    parent.children = newChildren;
  }
}
