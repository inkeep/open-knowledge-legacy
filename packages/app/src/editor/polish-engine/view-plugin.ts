/**
 * Polish Engine — ViewPlugin dispatcher
 *
 * Single ViewPlugin that walks the lezer syntax tree once per update cycle,
 * dispatching Decoration.line and Decoration.mark for all registered constructs.
 * Viewport-scoped via view.visibleRanges.
 */

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { ConstructConfig, Registry } from './registry';

type LineConfig = Extract<ConstructConfig, { kind: 'line' }>;

/** Count leading whitespace characters in a line (tabs count as 4 spaces). */
function countLeadingWhitespace(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === ' ') count++;
    else if (ch === '\t') count += 4;
    else break;
  }
  return count;
}

/** Build a lookup map: lezer node name → array of configs that handle it. */
export function buildNodeIndex(registry: Registry) {
  const index = new Map<string, ConstructConfig[]>();
  for (const config of registry) {
    if (config.kind === 'cross-scan-mark' || config.kind === 'none') continue;
    if (!config.nodeName) continue;
    const names = Array.isArray(config.nodeName) ? config.nodeName : [config.nodeName];
    for (const name of names) {
      let arr = index.get(name);
      if (!arr) {
        arr = [];
        index.set(name, arr);
      }
      arr.push(config);
    }
  }
  return index;
}

/** Build a marker node name → config lookup (only LineConfig has markerNodeName). */
export function buildMarkerIndex(registry: Registry) {
  const index = new Map<string, LineConfig>();
  for (const config of registry) {
    if (config.kind !== 'line') continue;
    if (!config.markerNodeName) continue;
    const names = Array.isArray(config.markerNodeName)
      ? config.markerNodeName
      : [config.markerNodeName];
    for (const name of names) {
      index.set(name, config);
    }
  }
  return index;
}

interface PendingDecoration {
  from: number;
  to: number;
  decoration: Decoration;
}

function buildDecorations(
  view: EditorView,
  registry: Registry,
  nodeIndex: Map<string, ConstructConfig[]>,
  markerIndex: Map<string, LineConfig>,
): DecorationSet {
  // We intentionally do NOT gate on syntaxTreeAvailable here.
  //
  // syntaxTreeAvailable returns false whenever a NESTED language parser is still
  // loading (e.g. TypeScript inside a FencedCode block).  The outer markdown
  // tree — which is the only one we need to find FencedCode, Blockquote, Table,
  // etc. — is always complete at this point.  Gating on syntaxTreeAvailable was
  // causing fenced-code decorations to stay permanently invisible when a
  // language specifier triggered a lazy dynamic import.
  //
  // For genuinely incomplete outer trees (very large documents mid-parse) the
  // update() condition — syntaxTree(startState) !== syntaxTree(state) — will
  // fire again when the outer parse finishes and rebuild decorations correctly.
  const pending: PendingDecoration[] = [];

  // Track which config+line pairs we've already decorated (avoid duplicates
  // from the same config, but allow different configs to stack on the same line)
  const decoratedLines = new Set<string>();

  // Pre-pass: handle customDetect configs (frontmatter, etc.)
  for (const config of registry) {
    if (!config.customDetect || config.kind !== 'line') continue;
    const ranges = config.customDetect(view.state);
    for (const range of ranges) {
      const lineStart = view.state.doc.lineAt(range.from);
      const lineEnd = view.state.doc.lineAt(range.to);
      for (let lineNo = lineStart.number; lineNo <= lineEnd.number; lineNo++) {
        const line = view.state.doc.line(lineNo);
        const lineKey = `${config.id}:${line.from}`;
        if (decoratedLines.has(lineKey)) continue;

        const cls = typeof config.class === 'string' ? config.class : '';
        // Position classes for first/last fence lines
        const positionCls =
          lineNo === lineStart.number
            ? `${cls}-fence-open`
            : lineNo === lineEnd.number
              ? `${cls}-fence-close`
              : '';

        const fullClass = [cls, positionCls].filter(Boolean).join(' ');
        if (fullClass) {
          pending.push({
            from: line.from,
            to: line.from,
            decoration: Decoration.line({ class: fullClass }),
          });
          decoratedLines.add(lineKey);
        }
      }
    }
  }

  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(nodeRef) {
        const nodeName = nodeRef.name;

        // Check marker index first (marks on markers like HeaderMark, QuoteMark)
        const markerConfig = markerIndex.get(nodeName);
        if (markerConfig?.markerClass) {
          pending.push({
            from: nodeRef.from,
            to: nodeRef.to,
            decoration: Decoration.mark({ class: markerConfig.markerClass }),
          });
        }

        // Check node index for line/mark decorations
        const configs = nodeIndex.get(nodeName);
        if (!configs) return;

        for (const config of configs) {
          if (config.kind === 'line') {
            // Apply line decoration to every line spanned by this node
            const node = nodeRef.node;
            const lineStart = view.state.doc.lineAt(nodeRef.from);
            const lineEnd = view.state.doc.lineAt(nodeRef.to);

            for (let lineNo = lineStart.number; lineNo <= lineEnd.number; lineNo++) {
              const line = view.state.doc.line(lineNo);
              // Key includes nodeRef.from so nested same-config nodes (e.g. inner
              // Blockquote inside outer Blockquote) each decorate shared lines with
              // their own depth class, rather than the outer node claiming them first.
              const lineKey = `${config.id}:${nodeRef.from}:${line.from}`;
              if (decoratedLines.has(lineKey)) continue;

              const cls =
                typeof config.class === 'function' ? config.class(node, view.state) : config.class;

              const depthCls = config.depthClass ? config.depthClass(node) : '';

              // First/last line classes for bordered constructs
              const positionCls =
                lineNo === lineStart.number
                  ? `${cls}-first`
                  : lineNo === lineEnd.number
                    ? `${cls}-last`
                    : '';

              const fullClass = [cls, depthCls, positionCls].filter(Boolean).join(' ');

              if (fullClass) {
                // Per-line attributes (e.g., preserve-source-indent)
                const styleAttrs: Record<string, string> = {};

                if (config.lineAttributes) {
                  const attrs = config.lineAttributes(node, view.state);
                  if (attrs) Object.assign(styleAttrs, attrs);
                }

                // Preserve-source-indent: compute per-line leading whitespace
                if (config.hangingIndent === 'preserve-source-indent') {
                  const indent = countLeadingWhitespace(line.text);
                  styleAttrs['--line-indent'] = String(indent);
                }

                const hasStyle = Object.keys(styleAttrs).length > 0;

                pending.push({
                  from: line.from,
                  to: line.from,
                  decoration: Decoration.line({
                    class: fullClass,
                    ...(hasStyle ? { attributes: { style: inlineStyle(styleAttrs) } } : {}),
                  }),
                });
                decoratedLines.add(lineKey);
              }
            }
          } else if (config.kind === 'mark') {
            const node = nodeRef.node;
            const cls =
              typeof config.class === 'function' ? config.class(node, view.state) : config.class;

            if (cls) {
              pending.push({
                from: nodeRef.from,
                to: nodeRef.to,
                decoration: Decoration.mark({ class: cls }),
              });
            }
          }
        }
      },
    });
  }

  // Sort by position (required by RangeSetBuilder)
  pending.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const item of pending) {
    builder.add(item.from, item.to, item.decoration);
  }
  return builder.finish();
}

/** Convert a key-value record to a CSS inline style string. */
function inlineStyle(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

/**
 * Module-level first-paint duration (ms) from the ViewPlugin constructor.
 * Read by auto-bail to decide whether decoration computation is too expensive.
 * Only written once (first ViewPlugin instantiation); subsequent documents
 * don't overwrite. This is session-first-document-only by design —
 * LINE_CEILING is the primary per-document safety gate.
 */
let firstPaintMs = -1;

/** Read the first-paint duration. Returns -1 if not yet measured. */
export function getFirstPaintMs(): number {
  return firstPaintMs;
}

export function createPolishViewPlugin(
  registry: Registry,
  nodeIndex: Map<string, ConstructConfig[]>,
  markerIndex: Map<string, LineConfig>,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        const start = performance.now();
        this.decorations = buildDecorations(view, registry, nodeIndex, markerIndex);
        if (firstPaintMs < 0) {
          firstPaintMs = performance.now() - start;
        }
      }

      update(update: ViewUpdate) {
        const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
        if (update.docChanged || update.viewportChanged || treeChanged) {
          this.decorations = buildDecorations(update.view, registry, nodeIndex, markerIndex);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}
