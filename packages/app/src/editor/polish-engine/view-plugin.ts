/**
 * Polish Engine — ViewPlugin dispatcher
 *
 * Single ViewPlugin that walks the lezer syntax tree once per update cycle,
 * dispatching Decoration.line and Decoration.mark for all registered constructs.
 * Viewport-scoped via view.visibleRanges.
 */

import { syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { ConstructConfig, Registry } from './registry';

/** Build a lookup map: lezer node name → array of configs that handle it. */
function buildNodeIndex(registry: Registry) {
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

/** Build a marker node name → config lookup. */
function buildMarkerIndex(registry: Registry) {
  const index = new Map<string, ConstructConfig>();
  for (const config of registry) {
    if (config.kind === 'cross-scan-mark' || config.kind === 'none') continue;
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

function buildDecorations(view: EditorView, registry: Registry): DecorationSet {
  // Gate: don't read from a partial/incremental tree
  if (!syntaxTreeAvailable(view.state, view.viewport.to)) {
    return Decoration.none;
  }

  const nodeIndex = buildNodeIndex(registry);
  const markerIndex = buildMarkerIndex(registry);
  const pending: PendingDecoration[] = [];

  // Track which line positions we've already decorated (avoid duplicates)
  const decoratedLines = new Set<number>();

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
              if (decoratedLines.has(line.from)) continue;

              const cls =
                typeof config.class === 'function' ? config.class(node, view.state) : config.class;

              const depthCls = config.depthClass ? config.depthClass(node) : '';
              const fullClass = [cls, depthCls].filter(Boolean).join(' ');

              if (fullClass) {
                const attrs = config.lineAttributes
                  ? config.lineAttributes(node, view.state)
                  : null;

                pending.push({
                  from: line.from,
                  to: line.from,
                  decoration: Decoration.line({
                    class: fullClass,
                    ...(attrs ? { attributes: { style: inlineStyle(attrs) } } : {}),
                  }),
                });
                decoratedLines.add(line.from);
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

export function createPolishViewPlugin(registry: Registry) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, registry);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, registry);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}
