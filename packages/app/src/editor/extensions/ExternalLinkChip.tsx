import type { Editor } from '@tiptap/core';
import { ArrowUpRight, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import { LinkTooltipHint } from '../link-tooltip';

interface ExternalLinkChipProps {
  editor: Editor;
  href: string;
  label: ReactNode;
  onNavigate: () => void;
  onEdit: () => void;
  onRemove: () => void;
  tooltipHref?: string;
  wrapperProps?: {
    className?: string;
    [key: string]: string | undefined;
  };
}

export function ExternalLinkChip({
  editor,
  href,
  label,
  onNavigate,
  onEdit,
  onRemove,
  tooltipHref,
  wrapperProps,
}: ExternalLinkChipProps) {
  const { className, ...restWrapperProps } = wrapperProps ?? {};

  return (
    <DropdownMenuRoot>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'group mx-0.5 inline-flex max-w-full select-none items-center gap-0.5 rounded-sm bg-muted/60 px-1.5 py-0.5 align-baseline text-sm font-medium text-foreground hover:bg-muted dark:text-muted-foreground',
              className,
            )}
            {...restWrapperProps}
          >
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-1 truncate text-inherit no-underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                onNavigate();
              }}
            >
              {label}
              <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
            </a>

            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'hidden ml-0.5 shrink-0 items-center rounded-sm p-0.5',
                  'group-hover:inline-flex group-focus-within:inline-flex data-[state=open]:inline-flex',
                  'hover:bg-black/10 focus-visible:inline-flex focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current',
                )}
                aria-label="Link options"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Ellipsis className="size-3" />
              </button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <LinkTooltipHint href={tooltipHref ?? href} />
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="start"
        className="w-36"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:bg-red-50 focus:text-red-600"
          onSelect={onRemove}
        >
          <Trash2 />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
