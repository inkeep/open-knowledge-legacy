/**
 * Polish Engine — StateField dispatcher (cross-scan)
 *
 * StateField for document-wide cross-scan decorations (broken-reference
 * detection). Early-returns on !tr.docChanged to avoid re-scanning on
 * cursor moves, focus changes, etc.
 */

import { syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { type Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import type { ConstructConfig, Registry } from './registry';

function buildCrossScanDecorations(
  state: import('@codemirror/state').EditorState,
  configs: ConstructConfig[],
): DecorationSet {
  if (!syntaxTreeAvailable(state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(state);

  for (const config of configs) {
    if (!config.crossScan) continue;

    const { crossScan } = config;
    const collected = crossScan.collect(state);

    const nodeNames = config.nodeName
      ? Array.isArray(config.nodeName)
        ? config.nodeName
        : [config.nodeName]
      : [];

    const marks: { from: number; to: number; cls: string }[] = [];

    tree.iterate({
      enter(nodeRef) {
        if (!nodeNames.includes(nodeRef.name)) return;

        const result = crossScan.check(nodeRef.node, collected, state);
        if (result === 'broken') {
          marks.push({
            from: nodeRef.from,
            to: nodeRef.to,
            cls: crossScan.brokenClass,
          });
        }
      },
    });

    // Sort by position (required by RangeSetBuilder)
    marks.sort((a, b) => a.from - b.from || a.to - b.to);
    for (const m of marks) {
      builder.add(m.from, m.to, Decoration.mark({ class: m.cls }));
    }
  }

  return builder.finish();
}

export function createCrossScanField(registry: Registry): Extension {
  const crossScanConfigs = registry.filter((c) => c.kind === 'cross-scan-mark' && c.crossScan);

  if (crossScanConfigs.length === 0) {
    return [];
  }

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildCrossScanDecorations(state, crossScanConfigs);
    },
    update(decorations, tr) {
      // CRITICAL: early-return on !tr.docChanged — StateField.update fires on
      // every transaction (selection, focus, viewport scroll, etc.). Without
      // this gate, cross-scan work runs on every cursor move.
      if (!tr.docChanged) return decorations;
      return buildCrossScanDecorations(tr.state, crossScanConfigs);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return field;
}
