import { offset } from '@floating-ui/dom';
import { DragHandle } from '@tiptap/extension-drag-handle';

function createHandleElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ok-drag-handle';
  el.setAttribute('aria-label', 'Drag to reorder block');
  el.draggable = true;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical-icon lucide-grip-vertical"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

  return el;
}

export const BlockDragHandle = DragHandle.configure({
  render: createHandleElement,
  // offset({ mainAxis }) adds horizontal gap between handle and text edge.
  // offset({ crossAxis }) nudges down to align with first text line
  // (placement is "left-start" so default top is the block's top edge).
  computePositionConfig: {
    middleware: [
      offset(({ rects }) => ({
        mainAxis: 10,
        // Center the handle on the first line of the block.
        // For single-line blocks, rects.reference.height ≈ line-height.
        // Cap at ~44px (h1 single line) so multi-line blocks don't push the
        // handle too far down — we always want to align with the first line.
        crossAxis: (Math.min(rects.reference.height, 44) - 20) / 2,
      })),
    ],
  },
});
