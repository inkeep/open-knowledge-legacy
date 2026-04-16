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
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { getDescriptor } from '../registry/index.ts';

const typedChildrenGuardKey = new PluginKey('typedChildrenGuard');

export const TypedChildrenGuard = Extension.create({
  name: 'typedChildrenGuard',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: typedChildrenGuardKey,
        filterTransaction(tr, _state) {
          // Only filter transactions that modify the document
          if (!tr.docChanged) return true;

          // Check each step in the transaction
          let dominated = false;
          tr.steps.forEach((step) => {
            // ReplaceStep and ReplaceAroundStep are the insertion steps
            const stepMap = step.getMap();
            stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
              if (dominated) return;

              // Check if the insertion target is directly inside a typed-children container
              try {
                const $pos = tr.doc.resolve(newStart);
                for (let depth = $pos.depth; depth > 0; depth--) {
                  const ancestor = $pos.node(depth);
                  if (ancestor.type.name === 'jsxComponent') {
                    const componentName = ancestor.attrs.componentName as string;
                    const descriptor = getDescriptor(componentName);
                    if (descriptor.emptyChildName) {
                      // This is a typed-children container. Check if the insertion
                      // is at the CONTAINER level (direct child) not inside a child's content.
                      // If $pos.depth === depth + 1, we're inserting directly inside the container.
                      // If $pos.depth > depth + 1, we're inside a child's content (allowed).
                      if ($pos.depth === depth + 1) {
                        // Check what's being inserted — allow jsxComponent, reject everything else
                        const insertedSlice = tr.doc.slice(newStart, newEnd);
                        insertedSlice.content.forEach((insertedNode) => {
                          if (insertedNode.type.name !== 'jsxComponent') {
                            console.warn(
                              '[TypedChildrenGuard] REJECTED:',
                              insertedNode.type.name,
                              'inside',
                              componentName,
                            );
                            dominated = true;
                          }
                        });
                      }
                    }
                    break; // Only check the nearest jsxComponent ancestor
                  }
                }
              } catch {
                // Position resolution can fail during complex transforms
              }
            });
          });

          return !dominated;
        },
      }),
    ];
  },
});
