/**
 * TypedChildrenGuard — PM plugin that prevents inserting non-jsxComponent
 * content directly inside typed-children containers (Steps, Cards, Tabs, etc.).
 *
 * Problem: we can't use contentEditable={false} on container NodeViewContent
 * because PM's hasFocus() walks the ancestor chain and returns false if ANY
 * ancestor has contentEditable='false' — breaking selection tracking, BubbleMenu,
 * and all PM features for descendants.
 *
 * Solution: let the DOM stay editable (PM manages it normally) but reject
 * transactions that would insert non-jsxComponent nodes directly inside a
 * container that has emptyChildName. This preserves PM's selection tracking
 * while constraining what content types are allowed.
 *
 * What this blocks:
 * - Typing text directly between Steps (creates a paragraph → rejected)
 * - Pasting arbitrary content between children
 * - Enter key creating a new paragraph between children
 *
 * What this allows:
 * - Inserting jsxComponent nodes (via "Add Step" pill, slash command)
 * - Editing content INSIDE children (Step's content hole is freeform)
 * - All PM selection/focus features working normally
 */
import { Extension } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { toast } from 'sonner';
import { ySyncPluginKey } from 'y-prosemirror';
import { getDescriptor } from '../registry/index.ts';

/**
 * Debounce map for the user-visible rejection toast. Without this, a paste
 * that produces N non-Step nodes (or a concurrent drag-and-drop stream)
 * fires N console.warns AND N toasts, overflowing the sonner queue and
 * producing a visual stutter far worse than the silent reject. Keyed by
 * `${containerName}::${insertedType}` so a user who drops a paragraph
 * into Steps and immediately drops a heading into Steps gets both hints
 * (different inserted-type) but a second paragraph drop within 3s is
 * deduped (same signature).
 */
const lastRejectionAt = new Map<string, number>();
const REJECTION_TOAST_DEBOUNCE_MS = 3000;

function surfaceRejection(containerName: string, insertedType: string): void {
  const key = `${containerName}::${insertedType}`;
  const now = Date.now();
  const last = lastRejectionAt.get(key) ?? 0;
  if (now - last < REJECTION_TOAST_DEBOUNCE_MS) return;
  lastRejectionAt.set(key, now);

  const descriptor = getDescriptor(containerName);
  const containerLabel = descriptor.displayName ?? containerName;
  const allowed = descriptor.emptyChildName ?? 'component';
  toast.info(`${containerLabel} only accepts ${allowed} items`, {
    description: `Use the "Add ${allowed}" button at the bottom of this block, or type /${allowed.toLowerCase()}.`,
    duration: 3500,
  });
}

const typedChildrenGuardKey = new PluginKey('typedChildrenGuard');

/**
 * Check whether a transaction would insert a non-jsxComponent node directly
 * inside a typed-children container (one whose descriptor has `emptyChildName`).
 *
 * Two rejection cases:
 *   (a) `$pos.depth === containerDepth` — position's parent IS the container.
 *       Anything inserted becomes a direct child (e.g. a paragraph dropped
 *       into `<Tabs>` when a user types after clicking the tab trigger bar).
 *   (b) `$pos.depth === containerDepth + 1` — position is inside a child of
 *       the container. If that child is a non-jsxComponent textblock (only
 *       possible post-corruption or via an earlier paste), typing further
 *       text keeps feeding the illegal child. Reject to contain the damage.
 *
 * Anything deeper (`$pos.depth > containerDepth + 1`) is inside a legit
 * jsxComponent child's own content — allowed.
 *
 * Only the NEAREST jsxComponent ancestor is consulted (inner containers win
 * over outer). Descriptor lookup returns wildcard for unknown names, which
 * has no `emptyChildName` — so unregistered jsxComponent containers allow
 * free insertions.
 *
 * Exported standalone (not inside the Extension) so unit tests can exercise
 * the depth logic directly without instantiating a full editor state.
 *
 * **Pure predicate — no side effects.** Callers that want user-visible
 * feedback on rejection (toast, telemetry) should pass an `onReject`
 * callback. Keeping the function pure preserves testability in the bun-test
 * Node environment, where UI libraries like `sonner` throw on access to
 * browser-only globals. The plugin wrapper below passes `surfaceRejection`;
 * tests pass nothing.
 */
export function shouldRejectTypedChildrenInsertion(
  tr: Transaction,
  onReject?: (containerName: string, insertedType: string) => void,
): boolean {
  let dominated = false;

  tr.steps.forEach((step) => {
    if (dominated) return;
    const stepMap = step.getMap();
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (dominated) return;
      try {
        const $pos = tr.doc.resolve(newStart);
        for (let depth = $pos.depth; depth > 0; depth--) {
          const ancestor = $pos.node(depth);
          if (ancestor.type.name === 'jsxComponent') {
            const componentName = ancestor.attrs.componentName as string;
            const descriptor = getDescriptor(componentName);
            if (descriptor.emptyChildName) {
              if ($pos.depth === depth || $pos.depth === depth + 1) {
                const insertedSlice = tr.doc.slice(newStart, newEnd);
                insertedSlice.content.forEach((insertedNode) => {
                  if (insertedNode.type.name !== 'jsxComponent') {
                    console.warn(
                      JSON.stringify({
                        event: 'typed-children-rejected',
                        container: componentName,
                        inserted: insertedNode.type.name,
                        posDepth: $pos.depth,
                        containerDepth: depth,
                      }),
                    );
                    dominated = true;
                    if (onReject) {
                      // Wrap the reporter so a throwing side-effect (e.g.
                      // sonner's toast accessing browser-only globals in a
                      // Node test runner) cannot roll back the `dominated`
                      // decision we just made. Side-effect errors are noise
                      // relative to the filterTransaction invariant, but the
                      // WHOLE POINT of the reporter is to surface *why* a
                      // keystroke vanished — a silent swallow would leave
                      // prod users with no signal. Emit a structured
                      // `typed-children-reject-reporter-failure` event
                      // regardless of NODE_ENV so aggregated telemetry
                      // catches systemic reporter outages.
                      try {
                        onReject(componentName, insertedNode.type.name);
                      } catch (reporterErr) {
                        console.warn(
                          JSON.stringify({
                            event: 'typed-children-reject-reporter-failure',
                            container: componentName,
                            inserted: insertedNode.type.name,
                            reason:
                              reporterErr instanceof Error
                                ? reporterErr.message
                                : String(reporterErr),
                          }),
                        );
                      }
                    }
                  }
                });
              }
            }
            break; // Only check the nearest jsxComponent ancestor
          }
        }
      } catch (err) {
        // Position resolution can fail during complex transforms (e.g.,
        // the inserted range is no longer resolvable in the mapped doc
        // after concurrent edits). Expected during multi-transform
        // bursts — log at dev-only debug level so unexpected failures
        // surface without spamming production.
        if (process.env.NODE_ENV === 'development') {
          console.debug('[TypedChildrenGuard] position resolution failed', err);
        }
      }
    });
  });

  return dominated;
}

export const TypedChildrenGuard = Extension.create({
  name: 'typedChildrenGuard',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: typedChildrenGuardKey,
        filterTransaction(tr, _state) {
          // Only filter transactions that modify the document
          if (!tr.docChanged) return true;

          // Never filter CRDT-origin transactions. y-prosemirror sets
          // ySyncPluginKey meta on transactions that apply remote Y.XmlFragment
          // updates (incoming WebSocket sync, server-authoritative Observer B
          // writes, agent-write, rollback, file-watcher). Rejecting these
          // would diverge the local PM view from the authoritative CRDT
          // state — the peer already persisted the change, and we'd stop
          // seeing it. Let CRDT-origin transactions through; if the content
          // is structurally illegal, the next parse/re-render cycle surfaces
          // it as rawMdxFallback, not as silent divergence.
          if (tr.getMeta(ySyncPluginKey)) return true;

          return !shouldRejectTypedChildrenInsertion(tr, surfaceRejection);
        },
      }),
    ];
  },
});
