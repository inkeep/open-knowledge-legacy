/**
 * SideMenu — hover drag handle + "+" insertion button (FR-15, FR-16, §9.10).
 *
 * Uses @tiptap/extension-drag-handle-react for positioning; renders a grip icon
 * and a "+" button as children of the floating <DragHandle> wrapper.
 *
 * The "+" button inserts an empty paragraph after the hovered block and types
 * "/" to trigger the Suggestion slash menu (TipTap vendor-endorsed pattern).
 *
 * Lock/unlock lifecycle: the base @tiptap/extension-drag-handle extension
 * registers lockDragHandle / unlockDragHandle commands. These are called
 * when PropPanel / slash menus / context menus open/close to prevent the
 * SideMenu from jumping to a different block during interaction.
 */
import { offset } from '@floating-ui/dom';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import { getDescriptor } from '../registry/index.ts';
import { createChildNode } from '../slash-command/component-items.ts';

// Match existing drag-handle.ts positioning constants
const HANDLE_HEIGHT = 20;
const MAX_SINGLE_LINE_HEIGHT = 44;
const BODY_LINE_HEIGHT = 28;

interface SideMenuProps {
  editor: Editor;
}

export function SideMenu({ editor }: SideMenuProps) {
  return (
    <DragHandle
      editor={editor}
      className="ok-side-menu"
      computePositionConfig={{
        placement: 'left',
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
      }}
      onNodeChange={({ node, pos }) => {
        // Store the hovered node pos for the "+" button.
        // Using a data attribute on the menu element to avoid React state
        // (setState would cause re-render + DragHandle plugin re-init per its
        // useEffect deps). Data-attr is safe: read-only from the click handler.
        if (node) {
          const el = document.querySelector('.ok-side-menu');
          if (el) {
            el.setAttribute('data-hovered-pos', String(pos));
            el.setAttribute('data-hovered-size', String(node.nodeSize));
            el.setAttribute('data-hovered-component', (node.attrs?.componentName as string) || '');
            el.setAttribute('data-hovered-content-size', String(node.content.size));
          }
        }
      }}
    >
      {/* Grip icon — the drag initiator (pointer-only; keyboard reorder via Mod+Shift+↑/↓) */}
      <div className="ok-drag-handle" aria-hidden="true" draggable>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Drag handle</title>
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </div>

      {/* "+" button — inserts paragraph + "/" to trigger slash menu (FR-16) */}
      <button
        type="button"
        className="ok-plus-button"
        aria-label="Insert block below"
        onClick={() => {
          const menuEl = document.querySelector('.ok-side-menu');
          if (!menuEl) return;
          const posStr = menuEl.getAttribute('data-hovered-pos');
          const sizeStr = menuEl.getAttribute('data-hovered-size');
          if (!posStr || !sizeStr) return;
          const pos = Number.parseInt(posStr, 10);
          const size = Number.parseInt(sizeStr, 10);

          // Context-aware insertion: if hovered block is a container
          // (descriptor has emptyChildName), insert a child INSIDE rather
          // than a paragraph after. Derived from descriptor metadata —
          // no component-specific logic.
          const componentName = menuEl.getAttribute('data-hovered-component');
          const contentSizeStr = menuEl.getAttribute('data-hovered-content-size');
          if (componentName) {
            const descriptor = getDescriptor(componentName);
            if (descriptor.emptyChildName) {
              const contentSize = Number.parseInt(contentSizeStr || '0', 10);
              const insertPos = pos + 1 + contentSize;
              editor
                .chain()
                .focus()
                .insertContentAt(insertPos, createChildNode(descriptor.emptyChildName))
                .run();
              return;
            }
          }

          // Default: insert paragraph + "/" after the block (non-container)
          const insertPos = pos + size;
          editor
            .chain()
            .focus()
            .insertContentAt(insertPos, { type: 'paragraph' })
            .setTextSelection(insertPos + 1)
            .insertContent('/')
            .run();
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Insert block"
        >
          <title>Insert block</title>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </DragHandle>
  );
}
