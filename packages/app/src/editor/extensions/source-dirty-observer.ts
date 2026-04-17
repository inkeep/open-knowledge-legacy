/**
 * Source-dirty observer plugin (FR-7, §9.6).
 *
 * Watches PM transactions and marks jsxComponent nodes as sourceDirty:true
 * when their content or structured attrs change via user-intent transactions.
 *
 * Deny-listed origins (non-user-intent):
 * - y-prosemirror sync (ySyncPluginKey meta) — covers:
 *   - sync-from-text (Observer B)
 *   - sync-from-tree (Observer A)
 *   - agent-write (server agent-sessions)
 *   - rollback-apply (Timeline rollback PR #39)
 *   - remote WebSocket updates
 * - All of these arrive as PM transactions with ySyncPluginKey meta set
 *   to { isChangeOrigin: true } by y-prosemirror's sync plugin.
 *
 * Only user-intent transactions (keyboard, PropPanel, paste, drag-drop)
 * produce PM transactions without ySyncPluginKey meta — these mark dirty.
 *
 * jsxInline is excluded per NG14/FR-4 (no sourceDirty attr).
 */

import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';
import { ySyncPluginKey } from 'y-prosemirror';

export const SourceDirtyObserver = Extension.create({
  name: 'sourceDirtyObserver',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          // Skip if any transaction is from CRDT sync (not user-intent)
          const hasUserTransaction = transactions.some((tr) => {
            // y-prosemirror sets ySyncPluginKey meta on CRDT-origin transactions
            const syncMeta = tr.getMeta(ySyncPluginKey);
            return !syncMeta;
          });

          if (!hasUserTransaction) return null;

          // Only process transactions that actually changed the doc
          const docChanged = transactions.some((tr) => tr.docChanged);
          if (!docChanged) return null;

          // Build a combined mapping from all transactions to map new-state
          // positions back to old-state positions. Without this, insertions or
          // deletions before a jsxComponent shift its position — using the same
          // numeric position in oldState would find the wrong node, causing
          // false-positive dirty marking that defeats the pristine γ path (I12).
          const combinedMapping = new Mapping();
          for (const tr of transactions) {
            combinedMapping.appendMapping(tr.mapping);
          }
          // Invert once per observer firing. A fresh `invert()` allocates a
          // new Mapping of inverse steps; calling it inside the descendants
          // loop is O(nodes * steps) and shows up on docs with many
          // jsxComponents. The mapping is constant for the scope of this
          // appendTransaction call.
          const invertedMapping = combinedMapping.invert();

          const updates: Array<{ pos: number }> = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'jsxComponent') return;
            if (node.attrs.sourceDirty) return; // already dirty, skip

            // Map from newState position back to oldState position
            const oldPos = invertedMapping.map(pos);
            const oldNode = oldState.doc.nodeAt(oldPos);
            if (!oldNode) {
              // Node is new (inserted) — mark dirty if it has content
              if (node.content.size > 0 || Object.keys(node.attrs.props ?? {}).length > 0) {
                updates.push({ pos });
              }
              return;
            }

            if (oldNode.type.name !== 'jsxComponent') {
              // Position was a different node type before — new node here
              updates.push({ pos });
              return;
            }

            // Compare content and structured attrs (excluding sourceDirty itself)
            const propsChanged = !deepEqual(oldNode.attrs.props, node.attrs.props);
            const contentChanged = !oldNode.content.eq(node.content);

            if (propsChanged || contentChanged) {
              updates.push({ pos });
            }
          });

          if (updates.length === 0) return null;

          const tr = newState.tr;
          for (const { pos } of updates) {
            tr.setNodeAttribute(pos, 'sourceDirty', true);
          }
          return tr;
        },
      }),
    ];
  },
});

/**
 * Simple deep equality for attr comparison. Handles primitives,
 * arrays, and plain objects. Does NOT handle dates, maps, sets, etc.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
      return false;
  }
  return true;
}
