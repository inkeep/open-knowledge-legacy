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
import { marked } from 'marked';
import { jsxStart, jsxTokenizerB } from '../extensions/jsx-tokenizer.ts';
import { parseJsx } from './jsx-parser.ts';
import type { ComponentMeta } from './types.ts';

// Register the jsxBlock tokenizer on the standalone marked instance so that
// marked.lexer(childrenString) handles nested JSX tags correctly (D10).
// Without this, nested JSX in children (e.g. <Tab> inside <Tabs>) would be
// tokenized as HTML blocks, causing DOMParser failures in Node environments.
let _jsxTokenizerRegistered = false;
function ensureJsxTokenizer(): void {
  if (_jsxTokenizerRegistered) return;
  _jsxTokenizerRegistered = true;
  marked.use({
    extensions: [
      {
        name: 'jsxBlock',
        level: 'block' as const,
        start(src: string) {
          return jsxStart(src);
        },
        tokenizer(src: string) {
          const result = jsxTokenizerB(src);
          if (!result) return undefined;
          return {
            type: 'jsxBlock',
            raw: result.raw,
            content: result.content ?? result.raw,
            tokens: [],
          };
        },
      },
    ],
  });
}

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

/** Track which components have already had unknown-attribute warnings logged (once per session). */
const _warnedComponents = new Set<string>();

/** Set of attribute names that are internal carriers, not serialized as JSX props. */
const INTERNAL_ATTRS = new Set([
  'componentName',
  '_rawContent',
  '_childrenString',
  '_unknownAttrs',
]);

/**
 * Escape a string value for use inside a JSX double-quoted attribute.
 * Encodes `&` → `&amp;` and `"` → `&quot;` so the serialized JSX is valid.
 * acorn-jsx decodes these HTML entities automatically on parse.
 */
function escapeJsxAttrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Reconstruct a raw JSX string from structured attributes.
 *
 * Props are emitted in alphabetical order (deterministic). Format:
 *   - string  → `prop="value"` (with HTML entity escaping for `"` and `&`)
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
      parts.push(`${key}="${escapeJsxAttrValue(String(value))}"`);
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
  ensureJsxTokenizer();
  const propAttrs = collectPropAttributes(manifest);

  // ─── jsxComponentEditable (registered components) ────────────────────

  const editable = Node.create({
    name: 'jsxComponentEditable',
    group: 'block',
    content: 'block+',
    // QA-017: isolating prevents backspace/delete from bubbling past the
    // component boundary. Without this, deleting the last child block
    // violates the 'block+' schema constraint and ProseMirror resolves
    // the conflict by deleting the parent component node entirely.
    // With isolating:true, backspace at the start of the first child is
    // blocked at the boundary, and the component wrapper persists even
    // when its children are emptied to a single empty paragraph.
    isolating: true,
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
        // Separate known (declared by THIS component) from unknown attributes.
        // Uses per-component manifest, not the flat propAttrs union, so that
        // attributes from other components don't cross-bleed. Unknown attrs
        // are preserved via _unknownAttrs JSON (§3.8 collision policy).
        const componentMeta = manifest[componentName];
        const declaredProps = new Set(componentMeta.props.map((p) => p.name));
        const knownProps: Record<string, string | boolean | number> = {};
        const unknownProps: Record<string, string | boolean | number> = {};
        for (const [key, value] of Object.entries(props)) {
          if (declaredProps.has(key) && key in propAttrs) {
            knownProps[key] = value;
          } else {
            unknownProps[key] = value;
          }
        }

        // Dev warning for collision policy (§3.8) — log once per component name
        if (Object.keys(unknownProps).length > 0) {
          const unknownKeys = Object.keys(unknownProps);
          if (!_warnedComponents.has(componentName)) {
            _warnedComponents.add(componentName);
            console.warn(
              `[JsxComponent] Unknown attributes on <${componentName}>: ${unknownKeys.join(', ')}. Attributes preserved but not rendered. See §3.8.`,
            );
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

        // Parse children into real ProseMirror content (Layer 3).
        // Tokenize via marked.lexer → helpers.parseBlockChildren → ProseMirror fragment.
        // Nested JSX in children works because marked's globally-configured instance
        // includes the jsxBlock tokenizer (D10).
        let childContent: ReturnType<typeof helpers.createNode>[] | undefined;
        if (childrenString.trim()) {
          const childTokens = marked.lexer(childrenString);
          const parseBlock = helpers.parseBlockChildren ?? helpers.parseChildren;
          childContent = parseBlock(childTokens) as ReturnType<typeof helpers.createNode>[];
        }
        if (!childContent || childContent.length === 0) {
          childContent = [helpers.createNode('paragraph')];
        }

        return helpers.createNode('jsxComponentEditable', attrs, childContent);
      }
      return helpers.createNode('jsxComponentVoid', { content: rawContent });
    },

    renderMarkdown(node, helpers) {
      const componentName = node.attrs?.componentName || '';
      if (!componentName) {
        // Fallback: use raw content if componentName missing
        const raw = node.attrs?._rawContent || '';
        return `${raw}\n`;
      }

      // Collect prop attributes, filtered to the component's own manifest entry.
      // This prevents cross-bleed from the flat attribute union: a Callout node
      // won't accidentally serialize a `src` prop that belongs to Video.
      const allProps: Record<string, string | boolean | number> = {};
      const attrs = node.attrs || {};
      const meta = manifest[componentName];
      const allowedProps = meta ? new Set(meta.props.map((p) => p.name)) : null;
      for (const [key, value] of Object.entries(attrs)) {
        if (INTERNAL_ATTRS.has(key)) continue;
        if (allowedProps && !allowedProps.has(key)) continue;
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
          console.warn(
            `[JsxComponent] Malformed _unknownAttrs on <${componentName}>, attributes dropped:`,
            unknownRaw,
          );
        }
      }

      // Layer 3: serialize ProseMirror children content to markdown via helpers.
      // Children are flush-left on disk (zero indentation, §3.5).
      // Always uses multi-line format: <Tag>\ncontent\n</Tag>
      // This is the canonical form — cycle-1 may normalize whitespace from
      // the source, but cycle-2 onward is byte-stable.
      // Falls back to _childrenString for backward compat / void nodes.
      let childrenString = '';
      if (
        helpers?.renderChild &&
        node.content &&
        Array.isArray(node.content) &&
        node.content.length > 0
      ) {
        // Render each child individually, then join with context-aware spacing:
        // - If previous child already ends with \n (e.g., jsxComponent), no extra sep
        // - Otherwise add \n\n between children (paragraph separator)
        const parts: string[] = [];
        for (let i = 0; i < node.content.length; i++) {
          const rendered = helpers.renderChild(node.content[i], i);
          if (i > 0 && parts.length > 0) {
            const prev = parts[parts.length - 1];
            if (!prev.endsWith('\n')) {
              parts.push('\n\n');
            }
          }
          parts.push(rendered);
        }
        const joined = parts.join('');
        const trimmed = joined.replace(/^\n+|\n+$/g, '');
        if (trimmed) {
          childrenString = `\n${trimmed}\n`;
        }
      }
      if (!childrenString) {
        childrenString = attrs._childrenString || '';
      }

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
