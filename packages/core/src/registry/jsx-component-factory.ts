/**
 * Factory: creates registry-aware TipTap extensions for JSX components.
 *
 * Returns two extensions:
 *   - jsxComponentEditable: for registered components (content: 'block+', non-atom for Phase 3)
 *   - jsxComponentVoid: for unregistered fallback (atom: true, raw content string)
 *
 * Both share the same markdownTokenizer (jsxTokenizerB) and coordinate via
 * a shared parseMarkdown handler that checks the manifest for type routing.
 */
import { Node } from '@tiptap/core';
import { jsxStart, jsxTokenizerB } from '../extensions/jsx-tokenizer.ts';
import type { ComponentMeta } from './types.ts';

export interface JsxComponentExtensions {
  editable: ReturnType<typeof Node.create>;
  void: ReturnType<typeof Node.create>;
}

/**
 * Collect the union of all prop names across the manifest.
 * Each becomes a top-level node attribute (default: undefined).
 */
function collectPropAttributes(
  manifest: Record<string, ComponentMeta>,
): Record<string, { default: undefined }> {
  const attrs: Record<string, { default: undefined }> = {};
  for (const meta of Object.values(manifest)) {
    for (const prop of meta.props) {
      // Skip reactnode props — those become content holes, not attributes
      if (prop.type === 'reactnode') continue;
      if (!(prop.name in attrs)) {
        attrs[prop.name] = { default: undefined };
      }
    }
  }
  return attrs;
}

/**
 * Extract the component tag name from a raw JSX string.
 * Simple regex — just gets the first uppercase tag name.
 * Full prop extraction via acorn is added in US-007.
 */
function extractTagName(rawJsx: string): string | null {
  const match = rawJsx.match(/^<([A-Z][A-Za-z0-9]*)\b/);
  return match ? match[1] : null;
}

export function createJsxComponentExtensions(
  manifest: Record<string, ComponentMeta>,
): JsxComponentExtensions {
  const propAttrs = collectPropAttributes(manifest);

  // ─── jsxComponentEditable (registered components) ────────────────────

  const editable = Node.create({
    name: 'jsxComponentEditable',
    group: 'block',
    content: 'block+',
    priority: 60,

    addAttributes() {
      return {
        componentName: { default: '' },
        // Raw JSX content preserved for round-trip (populated by parseMarkdown,
        // consumed by renderMarkdown). US-007 replaces this with acorn-parsed
        // structured props; until then this is the round-trip carrier.
        _rawContent: { default: '' },
        // Union of all prop names across the manifest
        ...propAttrs,
      };
    },

    parseHTML() {
      return [
        {
          tag: 'div[data-component-name]',
          getAttrs: (node) => {
            if (typeof node === 'string') return false;
            const attrs: Record<string, unknown> = {
              componentName: node.getAttribute('data-component-name') || '',
            };
            // Read data-prop-* attributes
            for (const propName of Object.keys(propAttrs)) {
              const val = node.getAttribute(`data-prop-${propName}`);
              if (val != null) attrs[propName] = val;
            }
            return attrs;
          },
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const domAttrs: Record<string, string> = {
        'data-component-name': HTMLAttributes.componentName || '',
      };
      // Write known props as data-prop-* attributes
      for (const propName of Object.keys(propAttrs)) {
        if (HTMLAttributes[propName] != null) {
          domAttrs[`data-prop-${propName}`] = String(HTMLAttributes[propName]);
        }
      }
      return ['div', domAttrs, 0]; // 0 = content hole
    },

    // Only the editable extension registers the tokenizer — it routes to
    // either editable or void via the parseMarkdown handler.
    markdownTokenName: 'jsxBlock',

    markdownTokenizer: {
      name: 'jsxBlock',
      level: 'block' as const,
      start: jsxStart,
      tokenize(src: string) {
        return jsxTokenizerB(src);
      },
    },

    parseMarkdown(token, helpers) {
      const rawContent = token.content || '';
      const tagName = extractTagName(rawContent);

      // Route: registered → editable, unregistered → void
      if (tagName && tagName in manifest) {
        return helpers.createNode(
          'jsxComponentEditable',
          { componentName: tagName, _rawContent: rawContent },
          [helpers.createNode('paragraph')],
        );
      }
      return helpers.createNode('jsxComponentVoid', { content: rawContent });
    },

    renderMarkdown(node) {
      // Until US-008 builds structured serialization, use the raw content
      const raw = node.attrs?._rawContent || '';
      return `${raw}\n`;
    },
  });

  // ─── jsxComponentVoid (unregistered fallback) ────────────────────────

  const voidNode = Node.create({
    name: 'jsxComponentVoid',
    group: 'block',
    atom: true,
    priority: 59, // Below editable so it doesn't intercept registered components

    addAttributes() {
      return {
        content: { default: '' },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'div[data-jsx-component-void]',
          getAttrs: (node) => {
            if (typeof node === 'string') return false;
            return { content: node.getAttribute('data-content') || '' };
          },
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', { 'data-jsx-component-void': '', 'data-content': HTMLAttributes.content }];
    },

    // No markdownTokenName/markdownTokenizer — editable's parseMarkdown
    // routes unregistered tags to this node type.

    renderMarkdown(node) {
      const content = node.attrs?.content || '';
      return `${content}\n`;
    },
  });

  return { editable, void: voidNode };
}
