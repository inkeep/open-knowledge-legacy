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
import { ExternalLink } from 'lucide-react';
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
            className="inline-flex items-baseline gap-0.5"
          >
            <MarkViewContent />
            <ExternalLink
              className="inline size-3 shrink-0 translate-y-px opacity-60"
              aria-hidden="true"
            />
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
            'mx-0.5 inline-flex max-w-full select-none items-center rounded-md border px-2 py-0.5 align-baseline text-[0.85em] font-medium',
            isResolved &&
              'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
            isUnresolved &&
              'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60',
            loading && 'border-border bg-muted/60 text-muted-foreground hover:bg-muted',
          )}
          data-internal-link=""
          data-resolution-state={resolutionState}
          data-doc-name={resolvedInternal.docName}
          data-anchor={resolvedInternal.anchor ?? ''}
        >
          <a
            href={hashHref}
            className={cn(
              'cursor-pointer truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              isResolved
                ? 'focus-visible:ring-sky-300'
                : isUnresolved
                  ? 'focus-visible:ring-red-300'
                  : 'focus-visible:ring-ring',
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClick}
          >
            <MarkViewContent />
          </a>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <LinkTooltipHint href={href} />
      </TooltipContent>
    </Tooltip>
  );
}
