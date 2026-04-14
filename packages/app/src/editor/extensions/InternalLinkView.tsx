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
 */
import type { MarkViewProps } from '@tiptap/core';
import { MarkViewContent } from '@tiptap/react';
import { ExternalLink } from 'lucide-react';
import { usePageList } from '../../components/PageListContext';
import { cn } from '../../lib/utils';
import {
  navigateToInternalHashHref,
  resolveCurrentInternalHref,
  toInternalHashHref,
} from '../internal-link-helpers';

// ── Component ─────────────────────────────────────────────────────────────────

export function InternalLinkView({ mark, HTMLAttributes }: MarkViewProps) {
  const href = (mark.attrs.href as string | null) ?? '';
  const internal = resolveCurrentInternalHref(href);
  const { pages, loading } = usePageList();

  if (!internal) {
    // External link — preserve original behavior
    return (
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
      title={`${href} — Cmd/Ctrl+click to navigate`}
    >
      <a
        href={hashHref}
        className="cursor-pointer truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-current"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleClick}
      >
        <MarkViewContent />
      </a>
    </span>
  );
}
