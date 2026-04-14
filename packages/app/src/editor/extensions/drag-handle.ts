import { DragHandle } from '@tiptap/extension-drag-handle';

function createHandleElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ok-drag-handle';
  el.setAttribute('aria-label', 'Drag to reorder block');
  el.draggable = true;

  // Six-dot gripper SVG (2×3 grid of circles)
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="5.5" cy="4" r="1.5"/>
    <circle cx="10.5" cy="4" r="1.5"/>
    <circle cx="5.5" cy="8" r="1.5"/>
    <circle cx="10.5" cy="8" r="1.5"/>
    <circle cx="5.5" cy="12" r="1.5"/>
    <circle cx="10.5" cy="12" r="1.5"/>
  </svg>`;

  return el;
}

export const BlockDragHandle = DragHandle.configure({
  render: createHandleElement,
});
