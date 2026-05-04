import { offset } from '@floating-ui/dom';
import { type Editor, Extension } from '@tiptap/core';
import { DragHandlePlugin, normalizeNestedOptions } from '@tiptap/extension-drag-handle';
import type { Node as PmNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { OPT_OUT_ATTR } from '../clipboard/index.ts';
import { getDescriptor } from '../registry/index.ts';
import { createChildNode, focusInsertedComponent } from '../slash-command/component-items.tsx';

const HANDLE_HEIGHT = 20;
const MAX_SINGLE_LINE_HEIGHT = 44;
const BODY_LINE_HEIGHT = 28;

function createBlockControlsElement(): { container: HTMLElement; addBtn: HTMLButtonElement } {
  const container = document.createElement('div');
  container.className = 'ok-block-controls';
  container.setAttribute(OPT_OUT_ATTR, 'true');
  container.style.visibility = 'hidden';

  const addBtn = document.createElement('button');
  addBtn.className = 'ok-add-block-btn';
  addBtn.setAttribute('aria-label', 'Add block below');
  addBtn.setAttribute('type', 'button');
  addBtn.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;

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

  if (hoveredNode.type.name === 'jsxComponent') {
    const componentName = (hoveredNode.attrs.componentName as string | undefined) ?? '';
    if (componentName) {
      const descriptor = getDescriptor(componentName);
      if (descriptor.emptyChildName) {
        const insertPos = hoveredNodePos + 1 + hoveredNode.content.size;
        if (insertPos > state.doc.content.size) return;
        const childName = descriptor.emptyChildName;
        editor.chain().focus().insertContentAt(insertPos, createChildNode(childName)).run();
        focusInsertedComponent(editor, insertPos, getDescriptor(childName));
        return;
      }
    }
  }

  const insertAt = hoveredNodePos + hoveredNode.nodeSize;
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
