/**
 * ActivityPanelResizeHandle — thin vertical drag rail on the LEFT edge
 * of the Activity Panel's SheetContent. Dragging left widens the panel;
 * dragging right narrows it. Width is clamped + persisted by
 * `useActivityPanelWidth`.
 *
 * Accessibility: the handle renders as `role="separator"` with
 * `aria-orientation="vertical"`, `aria-valuenow/min/max` live, and
 * keyboard support — Arrow keys step by 16 px, Shift+Arrow by 64 px,
 * Home/End jump to min/max. Follows the WAI-ARIA separator pattern used
 * by resizable panes.
 *
 * Pointer model: Pointer Events with `setPointerCapture` so a mid-drag
 * pointer leaving the rail still reaches the handler (classic MouseMove
 * on `document` is avoided — capture scopes cleanly to this element).
 * Drag state is held in a ref, not React state, so rapid pointermove
 * bursts don't trigger re-renders of the panel body.
 *
 * During a live drag the body gets `cursor: col-resize` + `user-select:
 * none` inline so the user doesn't accidentally select editor text
 * behind the panel. Cleanup runs on pointerup / pointercancel / unmount.
 */
import { useEffect, useRef } from 'react';
import { clampPanelWidth, MAX_PANEL_WIDTH, MIN_PANEL_WIDTH } from '@/lib/use-activity-panel-width';

interface ActivityPanelResizeHandleProps {
  /** Current width in px — used for aria-valuenow + keyboard stepping. */
  width: number;
  /** Persists the new width. Called on every move while dragging + on key steps. */
  onChangeWidth: (next: number) => void;
}

/** Keyboard step sizes — 16 px fine, 64 px coarse (Shift). */
const STEP_FINE = 16;
const STEP_COARSE = 64;

function setBodyDragChrome(active: boolean): void {
  if (typeof document === 'undefined') return;
  if (active) {
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  } else {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
}

export function ActivityPanelResizeHandle({
  width,
  onChangeWidth,
}: ActivityPanelResizeHandleProps): React.JSX.Element {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  // Clean up body chrome if the component unmounts mid-drag (rare, but
  // possible if the panel is swapped mid-resize by a connectionId change).
  useEffect(() => {
    return () => {
      if (dragRef.current) setBodyDragChrome(false);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // Only respond to primary button / touch / pen.
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Older browsers may throw; capture is optional — we'll still work
      // via the bubbled pointer events on the handle element itself.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    setBodyDragChrome(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    // The panel is right-anchored — dragging the handle LEFT (clientX
    // decreases) widens the panel, so the delta is (startX - clientX).
    const delta = state.startX - event.clientX;
    onChangeWidth(state.startWidth + delta);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = dragRef.current;
    if (!state) return;
    try {
      event.currentTarget.releasePointerCapture(state.pointerId);
    } catch {
      // releasePointerCapture throws if no capture is set — tolerable.
    }
    dragRef.current = null;
    setBodyDragChrome(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? STEP_COARSE : STEP_FINE;
    // Convention: ArrowLeft widens (matches dragging left), ArrowRight narrows.
    // Home / End jump to max / min width — aligned with the visual metaphor
    // (widest = most to the left; narrowest = most to the right).
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        onChangeWidth(width + step);
        break;
      case 'ArrowRight':
        event.preventDefault();
        onChangeWidth(width - step);
        break;
      case 'Home':
        event.preventDefault();
        onChangeWidth(MAX_PANEL_WIDTH);
        break;
      case 'End':
        event.preventDefault();
        onChangeWidth(MIN_PANEL_WIDTH);
        break;
      default:
        break;
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA resize-separator pattern needs a focusable, pointer-capturing element with aria-valuenow — <hr> cannot host all of those.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize activity panel"
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={MAX_PANEL_WIDTH}
      aria-valuenow={clampPanelWidth(width)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize select-none bg-transparent transition-colors hover:bg-primary/25 focus-visible:bg-primary/35 focus-visible:outline-none active:bg-primary/40"
      data-testid="activity-panel-resize-handle"
    />
  );
}
