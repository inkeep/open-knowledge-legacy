/**
 * BlockDragHandle — app-only TipTap extension that renders a "⠿" gripper
 * in the left margin on block hover, allowing drag-to-reorder of top-level blocks.
 *
 * Positioning: floating-ui `offset` middleware with:
 *   - mainAxis: horizontal gap between handle and text edge
 *   - crossAxis: dynamic vertical offset to center the handle on the first line.
 *     Capped at MAX_FIRST_LINE_HEIGHT so multi-line blocks align with line 1.
 *
 * Keyboard alternative: Mod+Shift+↑/↓ via BlockMover extension.
 */
import { offset } from '@floating-ui/dom';
import { DragHandle } from '@tiptap/extension-drag-handle';

// Height of the handle element (matches .ok-drag-handle { height: 20px } in globals.css).
const HANDLE_HEIGHT = 20;
// Approximate height of a single line at the largest heading size (h1: 1.5em × line-height 1.7 ≈ 41px).
// Blocks taller than this are multiline — use BODY_LINE_HEIGHT instead to stay on the first line.
const MAX_SINGLE_LINE_HEIGHT = 44;
// Body text line height: 16px base × line-height: 1.7 ≈ 27px. Used for multiline blocks.
const BODY_LINE_HEIGHT = 28;

function createHandleElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ok-drag-handle';
  el.setAttribute('aria-label', 'Drag to reorder block — keyboard: Mod+Shift+↑/↓');
  el.draggable = true;
  // Start hidden so the element isn't visible at position 0,0 before floating-ui
  // has a reference block to position against on initial mount.
  el.style.visibility = 'hidden';

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical-icon lucide-grip-vertical"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

  return el;
}

export const BlockDragHandle = DragHandle.configure({
  render: createHandleElement,
  computePositionConfig: {
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
});
