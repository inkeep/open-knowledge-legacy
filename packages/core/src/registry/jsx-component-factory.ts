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
import { parseJsx } from './jsx-parser.ts';
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

/** Set of attribute names that are internal carriers, not serialized as JSX props. */
const INTERNAL_ATTRS = new Set([
  'componentName',
  '_rawContent',
  '_childrenString',
  '_unknownAttrs',
]);

/**
 * Reconstruct a raw JSX string from structured attributes.
 *
 * Props are emitted in alphabetical order (deterministic). Format:
 *   - string  → `prop="value"`
 *   - true    → `prop` (boolean shorthand)
 *   - false   → omitted
 *   - number  → `prop={number}`
 */
function buildJsxString(
  componentName: string,
  props: Record<string, string | boolean | number>,
  childrenString: string,
): string {
  const propEntries = Object.entries(props)
    .filter(([, v]) => v !== false) // Omit false booleans
    .sort(([a], [b]) => a.localeCompare(b));

  const parts: string[] = [];
  for (const [key, value] of propEntries) {
    if (value === true) {
      parts.push(key);
    } else if (typeof value === 'number') {
      parts.push(`${key}={${value}}`);
    } else {
      parts.push(`${key}="${value}"`);
    }
  }

  const propsStr = parts.length > 0 ? ` ${parts.join(' ')}` : '';

  if (!childrenString) {
    return `<${componentName}${propsStr} />`;
  }
  return `<${componentName}${propsStr}>${childrenString}</${componentName}>`;
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
        // Raw JSX content preserved as a parse-time carrier for debugging
        _rawContent: { default: '' },
        // Children string between opening and closing JSX tags (verbatim).
        // US-012 replaces this with h.renderChildren(node.content).
        _childrenString: { default: '' },
        // JSON-serialized map of attributes not in the propAttrs union.
        // Preserves unknown attributes through round-trip (§3.8 collision policy).
        _unknownAttrs: { default: undefined },
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
      const parsed = parseJsx(rawContent);

      // parseJsx returns null for non-primitive expressions → void fallback
      if (!parsed) {
        return helpers.createNode('jsxComponentVoid', { content: rawContent });
      }

      const { componentName, props, childrenString } = parsed;

      // Route: registered → editable, unregistered → void
      if (componentName in manifest) {
        // Separate known (declared in propAttrs union) from unknown attributes
        const knownProps: Record<string, string | boolean | number> = {};
        const unknownProps: Record<string, string | boolean | number> = {};
        for (const [key, value] of Object.entries(props)) {
          if (key in propAttrs) {
            knownProps[key] = value;
          } else {
            unknownProps[key] = value;
          }
        }

        const attrs: Record<string, unknown> = {
          componentName,
          _rawContent: rawContent,
          _childrenString: childrenString,
          ...knownProps,
        };
        if (Object.keys(unknownProps).length > 0) {
          attrs._unknownAttrs = JSON.stringify(unknownProps);
        }

        return helpers.createNode('jsxComponentEditable', attrs, [helpers.createNode('paragraph')]);
      }
      return helpers.createNode('jsxComponentVoid', { content: rawContent });
    },

    renderMarkdown(node) {
      const componentName = node.attrs?.componentName || '';
      if (!componentName) {
        // Fallback: use raw content if componentName missing
        const raw = node.attrs?._rawContent || '';
        return `${raw}\n`;
      }

      // Collect all non-internal, non-undefined prop attributes
      const allProps: Record<string, string | boolean | number> = {};
      const attrs = node.attrs || {};
      for (const [key, value] of Object.entries(attrs)) {
        if (INTERNAL_ATTRS.has(key)) continue;
        if (value === undefined || value === null || value === '') continue;
        allProps[key] = value as string | boolean | number;
      }

      // Merge unknown attributes back in
      const unknownRaw = attrs._unknownAttrs;
      if (unknownRaw && typeof unknownRaw === 'string') {
        try {
          const unknownMap = JSON.parse(unknownRaw) as Record<string, string | boolean | number>;
          for (const [key, value] of Object.entries(unknownMap)) {
            allProps[key] = value;
          }
        } catch {
          // Ignore malformed _unknownAttrs
        }
      }

      const childrenString = attrs._childrenString || '';
      return `${buildJsxString(componentName, allProps, childrenString)}\n`;
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
