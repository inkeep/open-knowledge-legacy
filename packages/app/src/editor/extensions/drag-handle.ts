/**
 * BlockDragHandle — app-only TipTap extension that renders a "+" add button
 * and a "⠿" gripper in the left margin on block hover.
 *
 * Layout: [+ btn] [grip] — flex row, both vertically centered.
 *
 * **Why this is a TipTap extension (not a React component).**
 * `@tiptap/extension-drag-handle-react`'s `<DragHandle>` React component
 * renders a ref'd `<div>` and lets the underlying `DragHandlePlugin`
 * *move* that div into `editor.view.dom.parentElement`. The external DOM
 * move breaks React 19.2 reconciliation on `<Activity>` mode flips with
 * `Failed to execute 'removeChild' on 'Node'` (see Debug Phase 5 root
 * cause, 2026-04-18). Using the plugin imperatively with a
 * `document.createElement` container sidesteps React entirely — no refs
 * for the plugin to move, no reconciliation to break. Evidence: regression
 * validated against docs-open F1/F4/F5/F10 (2026-04-18 Debug Phase 5 root
 * cause). The same pattern would apply to any future plugin that moves its
 * ref'd DOM into `editor.view.dom.parentElement` while the editor lives in
 * an `<Activity>` subtree — prefer imperative `document.createElement`
 * mounting over React component wrappers for those plugins.
 *
 * Clicking + context-aware insertion:
 *   - If the hovered block is a typed-children container (descriptor has
 *     `emptyChildName` — e.g. Steps, Tabs, Cards), insert a child INSIDE
 *     the container using the registry's default factory.
 *   - Otherwise, insert a new empty paragraph below the hovered block and
 *     trigger the slash command menu.
 *
 * Positioning: floating-ui `offset` middleware with:
 *   - mainAxis: horizontal gap between handle and text edge
 *   - crossAxis: dynamic vertical offset to center the handle on the first line.
 *     Capped at MAX_FIRST_LINE_HEIGHT so multi-line blocks align with line 1.
 *
 * Keyboard alternative: Mod+Shift+↑/↓ via BlockMover extension.
 */
import { offset } from '@floating-ui/dom';
import { type Editor, Extension } from '@tiptap/core';
import { DragHandlePlugin, normalizeNestedOptions } from '@tiptap/extension-drag-handle';
import type { Node as PmNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { getDescriptor } from '../registry/index.ts';
import { createChildNode, focusInsertedComponent } from '../slash-command/component-items.ts';

// Height of the handle element (matches .ok-block-controls button height: 20px in globals.css).
const HANDLE_HEIGHT = 20;
// Approximate height of a single line at the largest heading size (h1: 1.5em × line-height 1.7 ≈ 41px).
// Blocks taller than this are multiline — use BODY_LINE_HEIGHT instead to stay on the first line.
const MAX_SINGLE_LINE_HEIGHT = 44;
// Body text line height: 16px base × line-height: 1.7 ≈ 27px. Used for multiline blocks.
const BODY_LINE_HEIGHT = 28;

function createBlockControlsElement(): { container: HTMLElement; addBtn: HTMLButtonElement } {
  const container = document.createElement('div');
  container.className = 'ok-block-controls';
  // Start hidden so the element isn't visible at position 0,0 before floating-ui
  // has a reference block to position against on initial mount.
  container.style.visibility = 'hidden';

  const addBtn = document.createElement('button');
  addBtn.className = 'ok-add-block-btn';
  addBtn.setAttribute('aria-label', 'Add block below');
  addBtn.setAttribute('type', 'button');
  addBtn.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;

  // Prevent mousedown from initiating a drag operation on the container
  addBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const grip = document.createElement('div');
  grip.className = 'ok-drag-grip';
  grip.setAttribute('aria-hidden', 'true');
  grip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical-icon lucide-grip-vertical"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

  container.appendChild(addBtn);
  container.appendChild(grip);

  return { container, addBtn };
}

function addBlockBelow(editor: Editor, hoveredNodePos: number, hoveredNode: PmNode): void {
  const { state, view } = editor;

  // Context-aware insertion: if the hovered block is a typed-children
  // container (descriptor has `emptyChildName` — Steps, Tabs, Cards,
  // Files, Accordions), insert a child *inside* the container rather
  // than a paragraph after. Derived from descriptor metadata — no
  // component-specific logic. Matches the NodeView "+" chrome behavior
  // documented in SPEC §9.9.
  if (hoveredNode.type.name === 'jsxComponent') {
    const componentName = (hoveredNode.attrs.componentName as string | undefined) ?? '';
    if (componentName) {
      const descriptor = getDescriptor(componentName);
      if (descriptor.emptyChildName) {
        const insertPos = hoveredNodePos + 1 + hoveredNode.content.size;
        // Guard against stale hover position (concurrent edits).
        if (insertPos > state.doc.content.size) return;
        const childName = descriptor.emptyChildName;
        editor.chain().focus().insertContentAt(insertPos, createChildNode(childName)).run();
        focusInsertedComponent(editor, insertPos, getDescriptor(childName));
        return;
      }
    }
  }

  // Non-container default: paragraph after + slash-menu trigger.
  const insertAt = hoveredNodePos + hoveredNode.nodeSize;
  // Guard against stale hover position — remote edits (CRDT, agent writes) can shrink
  // the document between hover and click, making insertAt exceed doc bounds.
  if (insertAt > state.doc.content.size) return;

  const { tr } = state;
  const paragraph = state.schema.nodes.paragraph?.create();
  if (!paragraph) return;

  tr.insert(insertAt, paragraph);
  const sel = TextSelection.near(tr.doc.resolve(insertAt + 1));
  tr.setSelection(sel).scrollIntoView();
  view.dispatch(tr);
  view.focus();

  editor.commands.insertContent('/');
}

export const BlockDragHandle = Extension.create({
  name: 'blockDragHandle',

  addProseMirrorPlugins() {
    const editor = this.editor;

    // Closure state — one instance per extension lifecycle
    let currentNode: PmNode | null = null;
    let currentNodePos = -1;

    const { container, addBtn } = createBlockControlsElement();

    addBtn.addEventListener('click', () => {
      if (currentNode && currentNodePos >= 0) {
        addBlockBelow(editor, currentNodePos, currentNode);
      }
    });

    return [
      DragHandlePlugin({
        element: container,
        editor,
        onNodeChange({ node, pos }: { node: PmNode | null; pos: number }) {
          currentNode = node;
          currentNodePos = pos ?? -1;
        },
        computePositionConfig: {
          placement: 'left-start',
          strategy: 'absolute',
          middleware: [
            offset(({ rects }) => {
              const firstLineHeight =
                rects.reference.height <= MAX_SINGLE_LINE_HEIGHT
                  ? rects.reference.height
                  : BODY_LINE_HEIGHT;
              return {
                mainAxis: 10,
                crossAxis: (firstLineHeight - HANDLE_HEIGHT) / 2,
              };
            }),
          ],
        },
        nestedOptions: normalizeNestedOptions(false),
      }).plugin,
    ];
  },
});
