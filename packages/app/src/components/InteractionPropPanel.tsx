/**
 * InteractionPropPanel — shared primitive for InteractionLayer PropPanels.
 *
 * Review 2026-04-21 Major #8: The four V2 PropPanels (Internal link, Wiki
 * link, Raw MDX fallback, JsxComponent) shipped with drift in four
 * dimensions — positioning (absolute top vs fixed bottom), escape-to-
 * dismiss (only one had it), dismiss prop name (`onClose` vs `onDismiss`),
 * and discriminator attribute (`data-prop-panel="X"` vs
 * `data-ok-X-prop-panel=""`). This primitive concentrates all four:
 *
 *   - Positioning: editor-relative `absolute` at the top of the editor
 *     wrapper (matches the InternalLink / WikiLink convention — the
 *     viewport-bottom shape caused visual jumping between chip kinds).
 *   - Escape dismiss: wired at the layer for all chip kinds (Critical #3),
 *     but panels can also own their own Escape if they need to short-
 *     circuit higher-priority keymaps (CM6 embedded editor — US-006).
 *   - Close vocabulary: one prop name — `onDeactivate` — matching the
 *     `InteractionContext.deactivate` contract at the layer.
 *   - Discriminator: a single attribute `data-ok-prop-panel="<kind>"`
 *     matching the `data-ok-*` convention at `editor-cache.ts:241`,
 *     `interaction-layer.tsx:366`, etc.
 *
 * Scoped outside-click (review Minor #25): the outside-click handler in
 * `interaction-layer.tsx` checks `[data-ok-interaction-layer]` + Radix
 * `[role="dialog"]`. This primitive adds `data-ok-prop-panel="<kind>"`
 * so future narrowing (to e.g. `[data-ok-interaction-layer] *`) is
 * trivial.
 *
 * Content shape: panels own their inner markup (title, action buttons,
 * dialogs). This primitive owns the container (position, spacing, close
 * button, ARIA dialog role + label).
 */

import { X } from 'lucide-react';
import type { FC, ReactNode } from 'react';
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
   * Optional layout override. Defaults: 320-px wide popover at top-center
   * of the editor wrapper. Pass 'wide' for the MDX-repair panel that needs
   * more width.
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
  layout = 'standard',
  className,
  'data-slot': dataSlot,
}) => {
  return (
    <div
      role="dialog"
      aria-label={ariaLabel}
      data-ok-prop-panel={kind}
      data-slot={dataSlot}
      className={cn(
        'ok-interaction-prop-panel pointer-events-auto absolute left-1/2 top-2 z-40 -translate-x-1/2 rounded-md border border-border bg-popover p-3 shadow-lg',
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
