/**
 * InteractionPropPanel — shared primitive for InteractionLayer PropPanels.
 *
 * Anchored to the active chip's bounding rect via `@floating-ui/dom`
 * (`computePosition` + `autoUpdate`). Mirrors the canonical pattern in
 * `packages/app/src/editor/bubble-menu/BubbleMenuBar.tsx` —
 * `placement: 'bottom-start'` with `offset(8) + flip() + shift({ padding: 8 })`
 * middleware so the panel sits below the chip when there's room and flips
 * above otherwise, never crosses the viewport edge, and follows the chip
 * across scroll.
 *
 * Caller passes a `triggerReference` — Floating UI's reference type. For
 * PM-positioned chips the right shape is a virtual element returning
 * `posToDOMRect(view, from, to)` plus `contextElement: editor.view.dom`
 * (lets `autoUpdate` discover the editor's overflow scroll ancestors).
 *
 * The four kinds in the kind union are nominal — only `wiki-link` and
 * `internal-link` have callsites today (`raw-mdx-fallback` and
 * `jsx-component` are reserved type slots; the JsxComponent settings
 * popover uses Radix `<Popover>` directly via the gear button rather
 * than this primitive).
 */

import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type VirtualElement,
} from '@floating-ui/dom';
import { X } from 'lucide-react';
import { type FC, type ReactNode, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

type InteractionPropPanelKind =
  | 'internal-link'
  | 'wiki-link'
  | 'raw-mdx-fallback'
  | 'jsx-component';

interface InteractionPropPanelProps {
  /** Chip-kind discriminator — emitted as `data-ok-prop-panel="<kind>"`. */
  kind: InteractionPropPanelKind;
  /** ARIA label (e.g. "Link options"). */
  ariaLabel: string;
  /** Caller closes the panel; matches InteractionContext.deactivate. */
  onDeactivate: () => void;
  /** Panel body content. */
  children: ReactNode;
  /**
   * Floating UI reference for the active chip. Caller wraps the chip's
   * PM range in a virtual element returning `posToDOMRect(view, from, to)`
   * plus `contextElement: editor.view.dom` so `autoUpdate` discovers the
   * editor's scroll ancestors. Required — without it the panel can't
   * anchor and would render off-screen (the bug this primitive's
   * positioning was rewritten to fix).
   */
  triggerReference: VirtualElement;
  /**
   * Optional layout override. Defaults: 320-px wide popover. Pass 'wide'
   * for the MDX-repair panel that needs more width.
   */
  layout?: 'standard' | 'wide';
  /**
   * Optional class for the panel's container — appended to defaults. Use
   * sparingly; most panel-specific styling belongs on the child content.
   */
  className?: string;
  /** Test / diagnostic helper — data-slot hook for Playwright selectors. */
  'data-slot'?: string;
}

export const InteractionPropPanel: FC<InteractionPropPanelProps> = ({
  kind,
  ariaLabel,
  onDeactivate,
  children,
  triggerReference,
  layout = 'standard',
  className,
  'data-slot': dataSlot,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const popup = panelRef.current;
    if (!popup) return;
    const stop = autoUpdate(triggerReference, popup, () => {
      computePosition(triggerReference, popup, {
        placement: 'bottom-start',
        strategy: 'fixed',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      })
        .then(({ x, y }) => {
          // Stale promise after rapid deactivation — the panel may have
          // detached between schedule and resolution. Mirrors BubbleMenuBar's
          // guard.
          if (popup.isConnected) {
            popup.style.left = `${x}px`;
            popup.style.top = `${y}px`;
          }
        })
        .catch(() => {
          // computePosition throws if the reference can't yield a rect
          // (e.g., chip removed mid-frame). autoUpdate retries on the next
          // scroll/resize tick.
        });
    });
    return stop;
  }, [triggerReference]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      data-ok-prop-panel={kind}
      data-slot={dataSlot}
      // `position: fixed` + computed left/top from Floating UI. The initial
      // off-screen value avoids a one-frame flash at top-left before the
      // first computePosition resolves.
      style={{ position: 'fixed', left: '-9999px', top: '-9999px' }}
      className={cn(
        'ok-interaction-prop-panel pointer-events-auto z-40 rounded-md border border-border bg-popover p-3 shadow-lg',
        layout === 'wide' ? 'w-[min(720px,calc(100%-1rem))]' : 'w-80',
        className,
      )}
    >
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Close"
        onClick={onDeactivate}
        className="absolute right-1 top-1 size-7"
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
};
