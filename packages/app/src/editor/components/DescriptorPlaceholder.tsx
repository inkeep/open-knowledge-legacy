/**
 * Notion-style empty-state pill rendered when a descriptor's autoFocus-flagged
 * required prop is empty (e.g. fresh `<img src="" />`). Pure UI: no editor
 * knowledge, no popover knowledge — the parent (`JsxComponentView`) wraps it
 * in `<PopoverAnchor asChild>` and supplies `onClick` to drive the popover.
 *
 * Click bubbles up; the parent's `handleBodyClick` short-circuits when
 * `showPlaceholder` is true so the same click does not double-fire setNodeSelection.
 */
import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface DescriptorPlaceholderProps extends Omit<React.ComponentProps<'button'>, 'onClick'> {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  selected?: boolean;
}

export default function DescriptorPlaceholder({
  label,
  Icon,
  onClick,
  selected,
  className,
  ...rest
}: DescriptorPlaceholderProps) {
  return (
    <button
      {...rest}
      type="button"
      data-descriptor-placeholder=""
      data-selected={selected ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md border border-dashed border-border bg-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 cursor-pointer',
        className,
      )}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
