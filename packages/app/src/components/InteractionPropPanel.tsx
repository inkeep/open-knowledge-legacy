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
  kind: InteractionPropPanelKind;
  ariaLabel: string;
  onDeactivate: () => void;
  children: ReactNode;
  triggerReference: VirtualElement;
  layout?: 'standard' | 'wide';
  className?: string;
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
          if (popup.isConnected) {
            popup.style.left = `${x}px`;
            popup.style.top = `${y}px`;
          }
        })
        .catch(() => {});
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
