/**
 * bridgeId PluginState (Q10 Option A, FR-29, Precedent #19).
 *
 * Assigns stable unique `bridgeId` strings to jsxComponent PM nodes,
 * keyed by their backing Y.XmlElement identity from y-prosemirror.
 *
 * bridgeId is NOT a schema attr — lives entirely in PluginState.
 * This structurally prevents Observer B re-parse churn:
 *   - parse output has no attr to diff under y-prosemirror's equalYTypePNode
 *   - Y.XmlElement identity preserved by y-prosemirror for unchanged content
 *   - WeakMap entry preserved → bridgeId stable across parse cycles
 *
 * jsxInline excluded per NG14 (no bridgeId, no Context Bridge).
 */

import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';
import type * as Y from 'yjs';

interface BridgeIdState {
  /** WeakMap keyed by Y.XmlElement for GC-friendly stable identity */
  yElementToId: WeakMap<Y.XmlElement, string>;
  /** Forward map for lookup by pos — rebuilt each transaction */
  posToId: Map<number, string>;
  /** Monotonic counter for this editor instance */
  counter: number;
}

export const bridgeIdPluginKey = new PluginKey<BridgeIdState>('bridgeId');

/**
 * Get the bridgeId for a jsxComponent node at a given position.
 * Returns undefined if the node is not a jsxComponent or has no ID assigned yet.
 */
export function getBridgeId(state: EditorState, pos: number): string | undefined {
  return bridgeIdPluginKey.getState(state)?.posToId.get(pos);
}

/**
 * Assert every jsxComponent in the doc has a bridgeId. Throws on failure.
 * Used in integration tests per M18.
 */
export function assertBridgeIdInvariant(state: EditorState): void {
  const pluginState = bridgeIdPluginKey.getState(state);
  if (!pluginState) {
    throw new Error('bridgeIdPlugin not installed');
  }

  const seen = new Set<string>();
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'jsxComponent') return;
    const id = pluginState.posToId.get(pos);
    if (!id) {
      throw new Error(`jsxComponent at pos ${pos} has no bridgeId`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate bridgeId "${id}" at pos ${pos}`);
    }
    seen.add(id);
  });
}

/**
 * Get the y-prosemirror binding's mapping (Y.AbstractType → PM.Node).
 * Returns the binding's internal mapping if available, else null.
 */
function getYMapping(state: EditorState): Map<Y.AbstractType<unknown>, unknown> | null {
  const syncState = ySyncPluginKey.getState(state);
  if (!syncState?.binding?.mapping) return null;
  return syncState.binding.mapping as Map<Y.AbstractType<unknown>, unknown>;
}

/**
 * Find the Y.XmlElement backing a PM node at a given position
 * by searching the y-prosemirror binding's mapping.
 */
function findYElementForPos(
  state: EditorState,
  _pos: number,
  node: import('@tiptap/pm/model').Node,
): Y.XmlElement | null {
  const mapping = getYMapping(state);
  if (!mapping) return null;

  // The binding's mapping maps Y.AbstractType → PM.Node|PM.Node[].
  // We need the reverse: find a Y.XmlElement whose mapped PM.Node
  // matches our target node at the target position.
  for (const [yType, pmNode] of mapping) {
    if (pmNode === node) {
      // Verify it's an XmlElement (not XmlText or XmlFragment)
      if ('nodeName' in yType && typeof (yType as Y.XmlElement).getAttribute === 'function') {
        return yType as Y.XmlElement;
      }
    }
  }
  return null;
}

export const BridgeIdPlugin = Extension.create({
  name: 'bridgeIdPlugin',

  addProseMirrorPlugins() {
    return [
      new Plugin<BridgeIdState>({
        key: bridgeIdPluginKey,

        state: {
          init(_config, state) {
            const initial: BridgeIdState = {
              yElementToId: new WeakMap(),
              posToId: new Map(),
              counter: 0,
            };

            // Initial assignment for any jsxComponent nodes already in the doc
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'jsxComponent') return;
              const yEl = findYElementForPos(state, pos, node);
              if (yEl) {
                const id = `b${++initial.counter}`;
                initial.yElementToId.set(yEl, id);
                initial.posToId.set(pos, id);
              } else {
                // No Y.XmlElement yet (editor initializing) — assign by position
                // This entry will be upgraded to Y.XmlElement-keyed on next apply
                const id = `b${++initial.counter}`;
                initial.posToId.set(pos, id);
              }
            });

            return initial;
          },

          apply(tr, prev, _oldState, newState) {
            // If no doc change, just remap positions
            if (!tr.docChanged) {
              const newPosToId = new Map<number, string>();
              for (const [oldPos, id] of prev.posToId) {
                const newPos = tr.mapping.map(oldPos);
                // Verify the mapped position still has a jsxComponent
                const node = newState.doc.nodeAt(newPos);
                if (node?.type.name === 'jsxComponent') {
                  newPosToId.set(newPos, id);
                }
              }
              return { ...prev, posToId: newPosToId };
            }

            // Doc changed — rebuild posToId from Y.XmlElement identity
            const newPosToId = new Map<number, string>();
            let { counter } = prev;
            const { yElementToId } = prev;

            newState.doc.descendants((node, pos) => {
              if (node.type.name !== 'jsxComponent') return;

              // Try to find the backing Y.XmlElement
              const yEl = findYElementForPos(newState, pos, node);
              if (yEl) {
                const existing = yElementToId.get(yEl);
                if (existing) {
                  newPosToId.set(pos, existing);
                } else {
                  const id = `b${++counter}`;
                  yElementToId.set(yEl, id);
                  newPosToId.set(pos, id);
                }
              } else {
                // No Y.XmlElement found — try position mapping from prev
                // This handles the brief window during editor init before
                // y-prosemirror has built its mapping
                let found = false;
                for (const [oldPos, id] of prev.posToId) {
                  const mappedPos = tr.mapping.map(oldPos);
                  if (mappedPos === pos) {
                    newPosToId.set(pos, id);
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  const id = `b${++counter}`;
                  newPosToId.set(pos, id);
                }
              }
            });

            return { yElementToId, posToId: newPosToId, counter };
          },
        },
      }),
    ];
  },
});
