import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import type { SuggestionProps } from '@tiptap/suggestion';

export interface SuggestionPositionState {
  popup: HTMLDivElement | null;
  stopAutoUpdate: (() => void) | null;
}

export function createSuggestionPopup(
  getCurrentProps: () => SuggestionProps<unknown> | null,
  label: string,
): {
  popup: HTMLDivElement;
  doPosition: () => void;
  startAutoUpdate: () => () => void;
  reveal: () => void;
} {
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  popup.style.zIndex = '50';
  popup.style.visibility = 'hidden';
  document.body.appendChild(popup);

  const virtualEl = {
    getBoundingClientRect: () => getCurrentProps()?.clientRect?.() ?? new DOMRect(),
    get contextElement() {
      return getCurrentProps()?.editor.view.dom;
    },
  };

  let revealRequested = false;
  let revealed = false;

  const doPosition = () => {
    if (!popup.isConnected) return;
    popup.style.removeProperty('--suggestion-menu-max-height');
    computePosition(virtualEl, popup, {
      placement: 'bottom-start',
      middleware: [
        offset(4),
        flip(),
        shift({ padding: 8 }),
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
          if (revealRequested && !revealed) {
            popup.style.removeProperty('visibility');
            revealed = true;
          }
        }
      })
      .catch((err) => {
        if (popup.isConnected) {
          console.warn(`[${label}] computePosition failed`, err);
        }
      });
  };

  const startAutoUpdate = () => autoUpdate(virtualEl, popup, doPosition);

  const reveal = () => {
    if (revealed) return;
    revealRequested = true;
    doPosition();
  };

  return { popup, doPosition, startAutoUpdate, reveal };
}

export function destroySuggestionPopup(state: SuggestionPositionState): void {
  state.stopAutoUpdate?.();
  state.stopAutoUpdate = null;
  state.popup?.remove();
  state.popup = null;
}
