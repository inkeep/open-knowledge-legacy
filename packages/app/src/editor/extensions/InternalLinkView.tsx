/**
 * Mark view for Link marks pointing to internal KB pages.
 *
 * Unlike WikiLinkView, this mark view is intentionally read-only: editing link
 * targets and creating pages from unresolved markdown links stay out of scope
 * for this feature. Markdown links keep their existing authoring UX; this view
 * only upgrades rendering and navigation.
 *
 * External links render as plain <a> elements (unchanged behavior).
 * Internal links (relative hrefs that resolve within the content directory)
 * render with resolved/unresolved chip styling matching WikiLinkView, and
 * navigate within the app on Cmd/Ctrl+click.
 *
 * Both variants surface the Cmd/Ctrl+click affordance via a shadcn Tooltip
 * (native `title` was too slow to appear and not touch-friendly). The hint
 * primitive (`LinkTooltipHint`) is shared with WikiLinkView.
 */
import type { MarkViewProps } from '@tiptap/core';
import { MarkViewContent } from '@tiptap/react';
import { ArrowUpRight, CircleAlert, File, Loader2 } from 'lucide-react';
import { usePageList } from '../../components/PageListContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import {
  navigateToInternalHashHref,
  resolveCurrentInternalHref,
  toInternalHashHref,
} from '../internal-link-helpers';
import { LinkTooltipHint } from '../link-tooltip';

// ── Component ─────────────────────────────────────────────────────────────────

export function InternalLinkView({ mark, HTMLAttributes }: MarkViewProps) {
  const href = (mark.attrs.href as string | null) ?? '';
  const internal = resolveCurrentInternalHref(href);
  const { pages, loading } = usePageList();

  if (!internal) {
    // External link — preserve original behavior, add tooltip hint.
    return (
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <a
            {...HTMLAttributes}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
          >
            <MarkViewContent />
            <ArrowUpRight className="inline size-3.5 shrink-0 translate-y-px" aria-hidden="true" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <LinkTooltipHint href={href} />
        </TooltipContent>
      </Tooltip>
    );
  }

  const isResolved = !loading && pages.has(internal.docName);
  const isUnresolved = !loading && !pages.has(internal.docName);

  const resolvedInternal = internal;
  const hashHref = toInternalHashHref(resolvedInternal);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      navigateToInternalHashHref(resolvedInternal);
    }
    // Plain click: ProseMirror handles cursor positioning via mousedown.
  }

  const resolutionState = loading ? 'loading' : isResolved ? 'resolved' : 'unresolved';

  return (
    // Outer span mirrors WikiLinkView's chip structure so the existing
    // .ProseMirror [data-resolution-state] a CSS carve-out resets link colours.
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'mx-0.5 inline-flex max-w-full select-none items-center rounded-sm px-1.5 py-0.5 align-baseline text-sm font-medium',
            isResolved &&
              'bg-azure-900/5 text-azure-500 hover:bg-azure-50 dark:bg-azure-100/10 dark:text-azure-200',
            isUnresolved &&
              'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-100/10 dark:text-red-300 dark:hover:bg-red-100/10 dark:hover:text-red-200',
            loading && 'bg-muted/60 text-muted-foreground hover:bg-muted',
          )}
          data-internal-link=""
          data-resolution-state={resolutionState}
          data-doc-name={resolvedInternal.docName}
          data-anchor={resolvedInternal.anchor ?? ''}
        >
          <a
            href={hashHref}
            className={cn(
              'cursor-pointer truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 flex items-center gap-1',
              isResolved
                ? 'focus-visible:ring-sky-300'
                : isUnresolved
                  ? 'focus-visible:ring-red-300'
                  : 'focus-visible:ring-ring',
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClick}
          >
            {loading && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
            {isResolved && <File className="size-3.5 shrink-0" />}
            {isUnresolved && <CircleAlert className="size-3.5 shrink-0" />}
            <MarkViewContent />
          </a>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {isUnresolved ? <div>This page cannot be found.</div> : <LinkTooltipHint href={href} />}
      </TooltipContent>
    </Tooltip>
  );
}
