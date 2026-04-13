import { autoUpdate, computePosition, flip, offset, size } from '@floating-ui/dom';
import type { SuggestionProps } from '@tiptap/suggestion';

export interface SuggestionPositionState {
  popup: HTMLDivElement | null;
  stopAutoUpdate: (() => void) | null;
}

/**
 * Create a positioned suggestion popup element and its positioning helpers.
 * Shared by slash-command and wiki-link suggestion menus.
 *
 * Returns: { popup, doPosition, startAutoUpdate }
 * - popup: the positioned container element (fixed, z-50, appended to body)
 * - doPosition: trigger repositioning (call from onUpdate)
 * - startAutoUpdate: call AFTER appending renderer content to preserve
 *   content-before-autoUpdate ordering (autoUpdate fires doPosition
 *   synchronously on setup — must run after popup has content so size
 *   middleware computes correct max-height)
 *
 * Uses `popup.isConnected` guards in async callbacks because computePosition
 * is async (returns Promise). The `.then()` can resolve after cleanup has
 * called `popup.remove()` — at that point the reference is non-null but
 * disconnected. A null-check alone would miss this race.
 */
export function createSuggestionPopup(
  getCurrentProps: () => SuggestionProps<unknown> | null,
  label: string,
): { popup: HTMLDivElement; doPosition: () => void; startAutoUpdate: () => () => void } {
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  popup.style.zIndex = '50';
  document.body.appendChild(popup);

  const virtualEl = {
    getBoundingClientRect: () => getCurrentProps()?.clientRect?.() ?? new DOMRect(),
    get contextElement() {
      return getCurrentProps()?.editor.view.dom;
    },
  };

  const doPosition = () => {
    if (!popup.isConnected) return;
    computePosition(virtualEl, popup, {
      placement: 'bottom-start',
      middleware: [
        offset(4),
        flip(),
        size({
          apply({ availableHeight }) {
            if (popup.isConnected) {
              popup.style.setProperty(
                '--suggestion-menu-max-height',
                `${Math.min(availableHeight, window.innerHeight * 0.4)}px`,
              );
            }
          },
        }),
      ],
    })
      .then(({ x, y }) => {
        if (popup.isConnected) {
          popup.style.left = `${x}px`;
          popup.style.top = `${y}px`;
        }
      })
      .catch((err) => {
        if (popup.isConnected) {
          console.warn(`[${label}] computePosition failed`, err);
        }
      });
  };

  // Caller invokes startAutoUpdate() AFTER appending renderer content
  const startAutoUpdate = () => autoUpdate(virtualEl, popup, doPosition);

  return { popup, doPosition, startAutoUpdate };
}

/**
 * Clean up a suggestion popup. Order: stop positioning → remove DOM → caller destroys renderer.
 */
export function destroySuggestionPopup(state: SuggestionPositionState): void {
  state.stopAutoUpdate?.();
  state.stopAutoUpdate = null;
  state.popup?.remove();
  state.popup = null;
}
